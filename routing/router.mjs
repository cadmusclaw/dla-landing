/**
 * Delivery routing / load-assignment engine.
 *
 * Input : orders ready for delivery (post-gate-pipeline) + drivers available
 *         for the day.
 * Output: runs per driver, a per-order trace explaining every assignment, and
 *         an explicit list of orders that could not be assigned.
 *
 * Pure logic: no I/O, no persistence, no mapping vendor. Distance/time comes
 * from an injected DistanceProvider (see geo.mjs).
 */

import { makeConfig } from './config.mjs';
import { StubHaversineDistanceProvider, corridorProjection } from './geo.mjs';
import { computeRunPay, potentialPayUsd } from './pay.mjs';
import {
  UNASSIGNED_REASONS,
  WARNINGS,
  buildPassPlan,
  bySeniority,
  minutesToClock,
  normalizeDriver,
  normalizeOrder,
  resolveDailyCapacity,
} from './model.mjs';

/* -------------------------------------------------------------------------- */
/* Route evaluation                                                            */
/* -------------------------------------------------------------------------- */

function permutations(items) {
  if (items.length <= 1) return [items];
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) out.push([items[i], ...tail]);
  }
  return out;
}

/**
 * Cost of a run:  drive minutes  +  switchingCost x (distinct states - 1)
 *
 * The switching cost is a *scoring* term only (tolls, terrain, context
 * switching). It is deliberately NOT added to the clock, so estimated finish
 * times stay honest; it only makes multi-state routes harder to win.
 *
 * Drop order is solved exactly - at most 4 stops means at most 24 orderings.
 */
export function evaluateRun({ stops, yard, provider, config, startMinutes }) {
  let bestSequence = null;
  let bestDriveMinutes = Infinity;

  for (const sequence of permutations(stops)) {
    let drive = provider.travelMinutes(yard, sequence[0]);
    for (let i = 1; i < sequence.length; i += 1) {
      drive += provider.travelMinutes(sequence[i - 1], sequence[i]);
    }
    drive += provider.travelMinutes(sequence[sequence.length - 1], yard);
    if (drive < bestDriveMinutes) {
      bestDriveMinutes = drive;
      bestSequence = sequence;
    }
  }

  const states = [...new Set([yard.state, ...stops.map((s) => s.state)])];
  const switchingCostMinutes =
    Math.max(0, states.length - 1) * config.stateSwitchingCostMinutes;

  const serviceMinutes = stops.reduce(
    (sum, s) => sum + (s.serviceMinutes ?? config.stopServiceMinutes),
    0,
  );
  const finishMinutes = startMinutes + bestDriveMinutes + serviceMinutes;

  const totalWeightLbs = stops.reduce((sum, s) => sum + s.weightLbs, 0);
  const heavyCount = stops.filter((s) => s.weightLbs > config.heavyItemLbs).length;

  return {
    sequence: bestSequence,
    driveMinutes: bestDriveMinutes,
    serviceMinutes,
    switchingCostMinutes,
    totalCostMinutes: bestDriveMinutes + switchingCostMinutes,
    states,
    startMinutes,
    finishMinutes,
    totalWeightLbs,
    heavyCount,
    weightMixOk: heavyCount <= config.maxHeavyItemsPerRun,
    crossesSoftStop: finishMinutes > config.softStopMinutes,
    crossesHardStop: finishMinutes > config.hardStopMinutes,
  };
}

/* -------------------------------------------------------------------------- */
/* Corridor run construction                                                   */
/* -------------------------------------------------------------------------- */

function withinCorridor(projection, config) {
  return (
    projection.crossMiles <= config.corridorHalfWidthMiles &&
    projection.alongMiles >= -config.corridorBacktrackMiles &&
    projection.alongMiles <= projection.axisLengthMiles + config.corridorOvershootMiles
  );
}

/**
 * Grow one run around an anchor order.
 *
 * The anchor defines the corridor (yard -> anchor). Stops join it greedily by
 * lowest marginal cost, subject to the HARD caps (weight, stop count, 2000
 * hard stop). Weight-mix (Rule 4) only breaks ties between candidates whose
 * marginal costs are within tieBreakTolerancePct of each other - geography
 * always wins outright (Rule 5).
 */
function growRun({ anchor, pool, yard, provider, config, startMinutes }) {
  const stops = [anchor];
  const stopMeta = new Map([
    [anchor.id, { role: 'anchor', alongMiles: 0, crossMiles: 0 }],
  ]);
  let evaluation = evaluateRun({ stops, yard, provider, config, startMinutes });
  if (evaluation.crossesHardStop || evaluation.totalWeightLbs > config.maxRunWeightLbs) {
    return null;
  }

  let weightMixTieBreakUsed = false;

  while (stops.length < config.maxStopsPerRun) {
    const candidates = [];
    for (const order of pool) {
      if (stops.includes(order)) continue;
      if (order.isStickBuild) continue; // day-blocking, never shares a run
      if (evaluation.totalWeightLbs + order.weightLbs > config.maxRunWeightLbs) continue;

      const projection = corridorProjection(yard, anchor, order);
      if (!withinCorridor(projection, config)) continue;

      const trial = evaluateRun({
        stops: [...stops, order],
        yard,
        provider,
        config,
        startMinutes,
      });
      if (trial.crossesHardStop) continue; // Rule 7 hard stop: never scheduled

      candidates.push({
        order,
        projection,
        trial,
        marginalCost: trial.totalCostMinutes - evaluation.totalCostMinutes,
      });
    }

    if (candidates.length === 0) break;

    candidates.sort((a, b) => a.marginalCost - b.marginalCost);
    let chosen = candidates[0];
    if (!chosen.trial.weightMixOk) {
      // Soft preference: among candidates that are geographically comparable,
      // prefer one that keeps the heavy/light mix balanced.
      const tolerance =
        Math.abs(chosen.marginalCost) * (1 + config.tieBreakTolerancePct) +
        1e-9;
      const balanced = candidates.find(
        (c) => c.trial.weightMixOk && c.marginalCost <= tolerance,
      );
      if (balanced) {
        chosen = balanced;
        weightMixTieBreakUsed = true;
      }
    }

    stops.push(chosen.order);
    stopMeta.set(chosen.order.id, {
      role: 'corridor',
      alongMiles: chosen.projection.alongMiles,
      crossMiles: chosen.projection.crossMiles,
    });
    evaluation = chosen.trial;
  }

  return { anchor, stops, stopMeta, evaluation, weightMixTieBreakUsed };
}

/**
 * Pick the best run available to one open slot.
 *
 * Anchors are the farthest open orders, walking inward until enough FEASIBLE
 * candidates exist (late in the day the far ones can be unreachable before the
 * 2000 hard stop). Each candidate grows greedily inside its own corridor, so
 * every option on the table is already geographically sound - this only
 * chooses between them.
 *
 * Default objective is 'revenue_per_hour': what the run pays under the rate
 * card, divided by the scored hours it burns (drive + service + the state
 * switching penalty). Because the rate card pays by the load AND by mileage,
 * two long drops in the $2/mile band can out-earn a full four-stop local milk
 * run - this ranking picks that up instead of blindly filling the truck.
 * Set selectionObjective: 'stops_first' to go back to fill-the-truck ordering.
 *
 * The soft weight-mix preference breaks ties only between options already
 * within tieBreakTolerancePct of each other - it never overrides geography.
 */
function selectBestRun({ pool, yard, provider, config, startMinutes }) {
  const deliverable = pool.filter((o) => !o.isStickBuild);
  if (deliverable.length === 0) return null;

  const anchors = [...deliverable].sort(
    (a, b) => provider.distanceMiles(yard, b) - provider.distanceMiles(yard, a),
  );

  const wanted = Math.max(1, config.seedCandidateCount);
  const scored = [];
  for (const anchor of anchors) {
    if (scored.length >= wanted) break;
    const run = growRun({ anchor, pool: deliverable, yard, provider, config, startMinutes });
    if (!run) continue;
    const ev = run.evaluation;
    const pay = computeRunPay({ sequence: ev.sequence, yard, provider, config });
    // Scored hours, not clock hours: the state switching penalty makes a
    // multi-state route look less profitable without faking the finish time.
    const scoredHours = (ev.totalCostMinutes + ev.serviceMinutes) / 60;
    scored.push({
      run,
      payUsd: pay.totalPayUsd,
      usdPerHour: pay.totalPayUsd / scoredHours,
      costPerStop: ev.totalCostMinutes / run.stops.length,
      anchorMiles: provider.distanceMiles(yard, anchor),
    });
  }
  if (scored.length === 0) return null;

  const objective = config.selectionObjective;
  const revenueMode = objective !== 'stops_first';
  if (objective === 'revenue_per_run') {
    scored.sort(
      (a, b) =>
        b.payUsd - a.payUsd ||
        b.usdPerHour - a.usdPerHour ||
        b.run.stops.length - a.run.stops.length,
    );
  } else if (objective === 'revenue_per_hour') {
    scored.sort(
      (a, b) =>
        b.usdPerHour - a.usdPerHour ||
        b.payUsd - a.payUsd ||
        b.anchorMiles - a.anchorMiles,
    );
  } else {
    scored.sort(
      (a, b) =>
        b.run.stops.length - a.run.stops.length ||
        b.anchorMiles - a.anchorMiles ||
        a.costPerStop - b.costPerStop,
    );
  }

  const scoreOf = (s) => {
    if (objective === 'revenue_per_run') return s.payUsd;
    if (objective === 'revenue_per_hour') return s.usdPerHour;
    return -s.costPerStop;
  };
  const near = (s, best) =>
    Math.abs(scoreOf(best)) === 0
      ? true
      : (scoreOf(best) - scoreOf(s)) / Math.abs(scoreOf(best)) <= config.tieBreakTolerancePct;

  let best = scored[0];
  let selectionNote = revenueMode
    ? `Best of ${scored.length} candidate corridor(s) by ${objective}: ` +
      `$${Math.round(best.payUsd).toLocaleString()} for ${best.run.stops.length} load(s), ` +
      `$${Math.round(best.usdPerHour)}/hr`
    : `Fullest sound corridor of ${scored.length} candidate(s): ${best.run.stops.length} stop(s)`;

  // Within the tolerance band, a fuller truck is the better operational
  // choice - same money, more orders cleared off the board.
  const fuller = scored.find(
    (s) => near(s, best) && s.run.stops.length > best.run.stops.length,
  );
  if (fuller) {
    best = fuller;
    selectionNote += `; tied on rate, took the fuller run (${fuller.run.stops.length} loads)`;
  }

  let anchorTieBreakUsed = false;
  if (!best.run.evaluation.weightMixOk) {
    const balanced = scored.find(
      (s) =>
        s.run.evaluation.weightMixOk &&
        s.run.stops.length === best.run.stops.length &&
        near(s, best),
    );
    if (balanced) {
      best = balanced;
      anchorTieBreakUsed = true;
    }
  }

  return {
    ...best.run,
    costPerStop: best.costPerStop,
    usdPerHour: best.usdPerHour,
    selectionNote,
    anchorTieBreakUsed,
  };
}

/* -------------------------------------------------------------------------- */
/* Day planning                                                                */
/* -------------------------------------------------------------------------- */

function runStartMinutes(driverState, tier, config) {
  const parallel = tier === 'extra' && (driverState.driver.extraRunsAreParallel ?? config.parallelExtraRuns);
  if (parallel || driverState.lastSequentialFinishMinutes === null) {
    return config.departureTimeMinutes;
  }
  return driverState.lastSequentialFinishMinutes + config.reloadOverheadMinutes;
}

function makeRunRecord({ driverState, pass, built, config, runSeq, yard, provider }) {
  const ev = built.evaluation;
  const pay = computeRunPay({ sequence: ev.sequence, yard, provider, config });
  const payByOrderId = new Map(pay.stops.map((s) => [s.orderId, s]));
  const flags = [];
  if (!ev.weightMixOk) flags.push(WARNINGS.WEIGHT_MIX_EXCEEDED);
  if (ev.crossesSoftStop) flags.push(WARNINGS.SOFT_STOP_CROSSED);
  if (ev.states.length > 1) flags.push(WARNINGS.MULTI_STATE_ROUTE);

  const pendingApproval =
    ev.crossesSoftStop && config.requireApprovalForSoftStopCrossing;
  if (pendingApproval) flags.push(WARNINGS.PENDING_APPROVAL);

  return {
    id: `${driverState.driver.id}-run${runSeq}`,
    driverId: driverState.driver.id,
    driverName: driverState.driver.name,
    passNumber: pass.passNumber,
    tier: pass.tier,
    parallelSlot:
      pass.tier === 'extra' &&
      (driverState.driver.extraRunsAreParallel ?? config.parallelExtraRuns),
    status: pendingApproval ? 'pending_approval' : 'assigned',
    dayBlocking: built.stops.some((s) => s.isStickBuild),
    anchorOrderId: built.anchor.id,
    stops: ev.sequence.map((order, index) => ({
      sequence: index + 1,
      orderId: order.id,
      customer: order.customer,
      city: order.address.city,
      state: order.address.state,
      weightLbs: order.weightLbs,
      productType: order.productType,
      meta: built.stopMeta.get(order.id),
      billableMiles: payByOrderId.get(order.id).billableMiles,
      payUsd: payByOrderId.get(order.id).payUsd,
      payBand: payByOrderId.get(order.id).payBand,
    })),
    stopCount: ev.sequence.length,
    totalWeightLbs: ev.totalWeightLbs,
    heavyCount: ev.heavyCount,
    states: ev.states,
    driveMinutes: ev.driveMinutes,
    serviceMinutes: ev.serviceMinutes,
    switchingCostMinutes: ev.switchingCostMinutes,
    totalCostMinutes: ev.totalCostMinutes,
    startMinutes: ev.startMinutes,
    finishMinutes: ev.finishMinutes,
    totalPayUsd: pay.totalPayUsd,
    payPerStopUsd: pay.totalPayUsd / ev.sequence.length,
    usdPerScoredHour:
      pay.totalPayUsd / ((ev.totalCostMinutes + ev.serviceMinutes) / 60),
    selectionNote: built.selectionNote || null,
    payMileageBasis: pay.mileageBasis,
    startClock: minutesToClock(ev.startMinutes),
    finishClock: minutesToClock(ev.finishMinutes),
    flags,
  };
}

function traceForStop({ order, run, stop, built, config }) {
  const reasons = [];
  const warnings = [...run.flags];

  reasons.push(
    `Pass ${run.passNumber} (${run.tier} run slot) -> ${run.driverName} / ${run.id}`,
  );

  if (order.isStickBuild) {
    reasons.push(
      'STICK-BUILD: day-blocking job, assigned as a solo run - driver takes no other run today',
    );
    warnings.push(WARNINGS.DAY_BLOCKING_STICK_BUILD);
  } else if (stop.meta?.role === 'anchor') {
    reasons.push(
      `Corridor anchor: farthest open stop, defines the ${run.states.join('->')} corridor for this run`,
    );
  } else {
    reasons.push(
      `On corridor: ${stop.meta.alongMiles.toFixed(1)} mi along the axis, ` +
        `${stop.meta.crossMiles.toFixed(1)} mi off it (limit ${config.corridorHalfWidthMiles} mi)`,
    );
  }

  reasons.push(
    `Pay: $${stop.payUsd.toLocaleString()} for this load ` +
      `(${stop.billableMiles} billable mi, ${stop.payBand}); run pays $${run.totalPayUsd.toLocaleString()}`,
  );
  reasons.push(
    `Weight: run total ${run.totalWeightLbs.toLocaleString()} lbs of ` +
      `${config.maxRunWeightLbs.toLocaleString()} lb cap, ${run.stopCount}/${config.maxStopsPerRun} stops`,
  );
  reasons.push(
    run.heavyCount <= config.maxHeavyItemsPerRun
      ? `Weight-mix check passed (${run.heavyCount} item(s) over ${config.heavyItemLbs} lbs)`
      : `Weight-mix FLAGGED (${run.heavyCount} items over ${config.heavyItemLbs} lbs, prefer max ${config.maxHeavyItemsPerRun}) - geography wins, not a block`,
  );
  if (run.states.length > 1) {
    reasons.push(
      `Crosses ${run.states.length} states (${run.states.join(', ')}): switching cost ` +
        `${run.switchingCostMinutes} min added to route cost (${run.driveMinutes.toFixed(0)} min drive -> ` +
        `${run.totalCostMinutes.toFixed(0)} min scored) - allowed because the loop still scored best`,
    );
  }
  if (run.selectionNote) {
    reasons.push(`Run selection: ${run.selectionNote}`);
  }
  if (built?.weightMixTieBreakUsed) {
    reasons.push('Weight-mix tiebreaker applied while filling this run');
  }
  if (built?.anchorTieBreakUsed) {
    reasons.push('Weight-mix tiebreaker chose this corridor over a similar-cost alternative');
  }
  if (run.flags.includes(WARNINGS.SOFT_STOP_CROSSED)) {
    reasons.push(
      `Estimated finish ${run.finishClock} crosses the 1800 soft stop` +
        (run.status === 'pending_approval'
          ? ' - HELD FOR APPROVAL (config: requireApprovalForSoftStopCrossing)'
          : ' - flagged for review, assignment stands'),
    );
  }

  return {
    orderId: order.id,
    customer: order.customer,
    status: run.status,
    driverId: run.driverId,
    driverName: run.driverName,
    runId: run.id,
    passNumber: run.passNumber,
    slotTier: run.tier,
    stopSequence: stop.sequence,
    reasons,
    warnings: [...new Set(warnings)],
  };
}

/**
 * Plan one delivery day.
 *
 * @param {object} input
 * @param {object}   input.yard             { lat, lon, state, name }
 * @param {Array}    input.orders
 * @param {Array}    input.drivers
 * @param {string}   [input.date]           ISO date, used for the weekend hook
 * @param {object}   [input.config]         overrides for DEFAULT_CONFIG
 * @param {object}   [input.distanceProvider] swap in a real routing API here
 */
export function planDay({
  yard,
  orders,
  drivers,
  date = null,
  config: configOverrides = {},
  distanceProvider = null,
}) {
  const config = makeConfig(configOverrides);
  const provider =
    distanceProvider ||
    new StubHaversineDistanceProvider({
      averageSpeedMph: config.averageSpeedMph,
      roadCircuityFactor: config.roadCircuityFactor,
    });

  const allOrders = orders.map(normalizeOrder);
  const dayWarnings = [];

  // Orders that physically cannot ride on a standard run never enter the pool.
  const unassigned = [];
  let pool = allOrders.filter((order) => {
    if (order.weightLbs > config.maxRunWeightLbs) {
      unassigned.push({ order, reason: UNASSIGNED_REASONS.OVER_TRAILER_CAP });
      return false;
    }
    return true;
  });

  const driverStates = drivers
    .map(normalizeDriver)
    .filter((driver) => driver.active)
    .map((driver) => {
      const capacity = resolveDailyCapacity(driver, date, config);
      capacity.warnings.forEach((w) => {
        if (!dayWarnings.includes(w)) dayWarnings.push(w);
      });
      return {
        driver,
        capacity,
        dayBlocked: false,
        runs: [],
        lastSequentialFinishMinutes: null,
        notes: [],
      };
    })
    .sort((a, b) => bySeniority(a.driver, b.driver));

  const byId = new Map(driverStates.map((d) => [d.driver.id, d]));
  const passes = buildPassPlan(driverStates);

  const runs = [];
  const traces = [];

  for (const pass of passes) {
    for (const driverId of pass.driverIds) {
      const driverState = byId.get(driverId);
      if (pool.length === 0) continue;

      // GATE-5 SEAM / Rule 8: a driver already committed to a day-blocking
      // STICK-BUILD is filtered out here as a hard eligibility rule, not a note.
      if (driverState.dayBlocked) {
        driverState.notes.push(
          `Pass ${pass.passNumber}: skipped - committed to a day-blocking STICK-BUILD job`,
        );
        continue;
      }

      const startMinutes = runStartMinutes(driverState, pass.tier, config);
      if (startMinutes >= config.hardStopMinutes) {
        driverState.notes.push(
          `Pass ${pass.passNumber}: slot unusable - would start after the 2000 hard stop`,
        );
        continue;
      }

      // A stick-build consumes the driver's whole day, so it can only go to a
      // driver who has not started any run yet.
      const stickBuild = pool.find((o) => o.isStickBuild);
      let built = null;
      if (stickBuild && driverState.runs.length === 0) {
        const evaluation = evaluateRun({
          stops: [stickBuild],
          yard,
          provider,
          config,
          startMinutes,
        });
        built = {
          anchor: stickBuild,
          stops: [stickBuild],
          stopMeta: new Map([[stickBuild.id, { role: 'anchor', alongMiles: 0, crossMiles: 0 }]]),
          evaluation,
          weightMixTieBreakUsed: false,
          anchorTieBreakUsed: false,
        };
      } else {
        built = selectBestRun({ pool, yard, provider, config, startMinutes });
      }
      if (!built) continue;

      const run = makeRunRecord({
        driverState,
        pass,
        built,
        config,
        runSeq: driverState.runs.length + 1,
        yard,
        provider,
      });
      runs.push(run);
      driverState.runs.push(run);

      const parallel = run.parallelSlot;
      if (!parallel) {
        driverState.lastSequentialFinishMinutes = run.finishMinutes;
      }

      if (run.dayBlocking) {
        driverState.dayBlocked = true;
        driverState.notes.push(
          `Committed to STICK-BUILD ${built.anchor.id} - no other runs today (hard filter)`,
        );
      }

      for (const stop of run.stops) {
        const order = built.stops.find((o) => o.id === stop.orderId);
        traces.push(traceForStop({ order, run, stop, built, config }));
      }

      const assignedIds = new Set(run.stops.map((s) => s.orderId));
      pool = pool.filter((o) => !assignedIds.has(o.id));
    }
  }

  for (const order of pool) {
    unassigned.push({
      order,
      reason: order.isStickBuild
        ? UNASSIGNED_REASONS.NO_OPEN_DAY_FOR_STICK_BUILD
        : UNASSIGNED_REASONS.CAPACITY_EXHAUSTED,
    });
  }

  for (const item of unassigned) {
    item.potential = potentialPayUsd({ order: item.order, yard, provider, config });
    traces.push({
      orderId: item.order.id,
      customer: item.order.customer,
      status: 'unassigned',
      driverId: null,
      driverName: null,
      runId: null,
      passNumber: null,
      slotTier: null,
      stopSequence: null,
      reasons: [`UNASSIGNED: ${item.reason}`],
      warnings: ['NEEDS_ANOTHER_DRIVER_OR_DAY'],
    });
  }

  const traceOrder = new Map(allOrders.map((o, i) => [o.id, i]));
  traces.sort((a, b) => traceOrder.get(a.orderId) - traceOrder.get(b.orderId));

  return {
    date,
    yard,
    config,
    distanceProviderName: provider.name,
    passes,
    runs,
    drivers: driverStates.map((d) => ({
      id: d.driver.id,
      name: d.driver.name,
      seniorityRank: d.driver.seniorityRank,
      baseRunsPerDay: d.capacity.baseRunsPerDay,
      extraRunsPerDay: d.capacity.extraRunsPerDay,
      runsAssigned: d.runs.length,
      payUsd: d.runs.reduce((sum, r) => sum + r.totalPayUsd, 0),
      dayBlocked: d.dayBlocked,
      notes: d.notes,
    })),
    traces,
    unassigned: unassigned.map((u) => ({
      orderId: u.order.id,
      customer: u.order.customer,
      city: u.order.address.city,
      state: u.order.address.state,
      weightLbs: u.order.weightLbs,
      reason: u.reason,
      forgonePayUsd: u.potential ? u.potential.payUsd : 0,
    })),
    warnings: dayWarnings,
    pay: {
      mileageBasis: config.payment.mileageBasis,
      loadsDelivered: runs.reduce((n, r) => n + r.stopCount, 0),
      totalUsd: runs.reduce((sum, r) => sum + r.totalPayUsd, 0),
      byDriver: driverStates.map((d) => ({
        driverId: d.driver.id,
        driverName: d.driver.name,
        loads: d.runs.reduce((n, r) => n + r.stopCount, 0),
        payUsd: d.runs.reduce((sum, r) => sum + r.totalPayUsd, 0),
      })),
      forgoneUsd: unassigned.reduce(
        (sum, u) => sum + (u.potential ? u.potential.payUsd : 0),
        0,
      ),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Gate 5 handoff seam                                                         */
/* -------------------------------------------------------------------------- */

/**
 * SEAM: installer-capability matching (Gate 5) is a separate module. This is
 * the shape this router hands it.
 *
 * Rule 8 / Gate 5: "already committed to a day-blocking job today" must be a
 * THIRD eligibility filter alongside capability and active status. Gate 5 is
 * expected to call `isCommittedToDayBlockingJob` (or read `dayBlocking` below)
 * and drop those people from the candidate pool for that date entirely.
 */
export function toGate5Handoff(plan) {
  return {
    date: plan.date,
    commitments: plan.runs.map((run) => ({
      runId: run.id,
      driverId: run.driverId,
      driverName: run.driverName,
      date: plan.date,
      dayBlocking: run.dayBlocking,
      status: run.status,
      startClock: run.startClock,
      finishClock: run.finishClock,
      stops: run.stops.map((s) => ({ orderId: s.orderId, sequence: s.sequence })),
    })),
    dayBlockedDriverIds: plan.drivers.filter((d) => d.dayBlocked).map((d) => d.id),
    unassignedOrderIds: plan.unassigned.map((u) => u.orderId),
  };
}

export function isCommittedToDayBlockingJob(plan, driverId) {
  return plan.runs.some((run) => run.driverId === driverId && run.dayBlocking);
}
