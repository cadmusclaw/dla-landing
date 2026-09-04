/**
 * Runnable demo:  node routing/demo.mjs  [scenario letter, e.g. C]
 *
 * Runs each sample scenario through the planner, prints the full trace and the
 * per-driver/per-run summary, and asserts the behaviour the spec calls for.
 */

import { planDay, toGate5Handoff, isCommittedToDayBlockingJob } from './router.mjs';
import { formatPlan } from './report.mjs';
import { SCENARIOS } from './sample-data.mjs';

const checks = [];
function check(label, condition, detail = '') {
  checks.push({ label, ok: Boolean(condition), detail });
  const mark = condition ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${label}${detail ? ` - ${detail}` : ''}`);
}

/** Invariants that must hold for every plan, in every scenario. */
function universalInvariants(scenario, plan) {
  const cfg = plan.config;
  const assignedIds = plan.runs.flatMap((r) => r.stops.map((s) => s.orderId));
  const unassignedIds = plan.unassigned.map((u) => u.orderId);
  const accounted = new Set([...assignedIds, ...unassignedIds]);

  check(
    'Every order is accounted for (assigned or explicitly unassigned)',
    accounted.size === scenario.orders.length &&
      assignedIds.length + unassignedIds.length === scenario.orders.length,
    `${assignedIds.length} assigned + ${unassignedIds.length} unassigned of ${scenario.orders.length}`,
  );
  check(
    `No run exceeds the ${cfg.maxRunWeightLbs} lb hard cap`,
    plan.runs.every((r) => r.totalWeightLbs <= cfg.maxRunWeightLbs),
    `max run weight ${Math.max(0, ...plan.runs.map((r) => r.totalWeightLbs))} lbs`,
  );
  check(
    `No run exceeds ${cfg.maxStopsPerRun} stops`,
    plan.runs.every((r) => r.stopCount <= cfg.maxStopsPerRun),
  );
  check(
    'No run is scheduled past the 2000 hard stop',
    plan.runs.every((r) => r.finishMinutes <= cfg.hardStopMinutes),
    `latest finish ${plan.runs.map((r) => r.finishClock).sort().pop() || 'n/a'}`,
  );
}

const expectations = {
  A(scenario, plan) {
    const order = plan.runs.map((r) => `${r.driverName}#${r.passNumber}`);
    check(
      'Pass 1 fills every base run before any extra run: Alfredo run1, Mike run1, then Alfredo run2',
      order[0] === 'Alfredo#1' &&
        order[1] === 'Mike (you)#1' &&
        order[2] === 'Alfredo#2' &&
        plan.runs[2].tier === 'extra',
      order.join(' -> '),
    );
    check(
      'Extra capacity did not let Alfredo jump the line (his run 2 is last)',
      plan.runs.filter((r) => r.tier === 'base').every((r) => r.passNumber === 1),
    );
  },

  B(scenario, plan) {
    const heavyRun = plan.runs.find((r) => r.heavyCount >= 3);
    check(
      'The geographically tight heavy cluster was kept together',
      Boolean(heavyRun),
      heavyRun ? `${heavyRun.id}: ${heavyRun.heavyCount} heavy items, ${heavyRun.totalWeightLbs} lbs` : '',
    );
    check(
      'Weight-mix is a WARNING, not a block (run still assigned)',
      heavyRun && heavyRun.status === 'assigned' &&
        heavyRun.flags.includes('WEIGHT_MIX_EXCEEDED'),
      heavyRun ? heavyRun.flags.join(', ') : '',
    );
    check(
      'Hard weight cap still respected on that run',
      heavyRun && heavyRun.totalWeightLbs <= plan.config.maxRunWeightLbs,
    );
  },

  C(scenario, plan) {
    const loop = plan.runs.find((r) => r.states.includes('PA'));
    check(
      'NJ -> PA -> NJ loop is allowed, not rejected',
      Boolean(loop),
      loop ? `${loop.id} touches ${loop.states.join(', ')}` : '',
    );
    check(
      'State crossing is priced, not free',
      loop && loop.switchingCostMinutes === plan.config.stateSwitchingCostMinutes &&
        loop.totalCostMinutes > loop.driveMinutes,
      loop
        ? `drive ${Math.round(loop.driveMinutes)} min -> scored ${Math.round(loop.totalCostMinutes)} min`
        : '',
    );
    const loopCities = loop ? loop.stops.map((s) => s.city) : [];
    check(
      'No zig-zag: off-corridor shore stops were not pulled into the loop',
      !loopCities.includes('Manahawkin') && !loopCities.includes('Atlantic City'),
      loopCities.join(', '),
    );
  },

  D(scenario, plan) {
    const sbRun = plan.runs.find((r) => r.dayBlocking);
    const sbDriver = sbRun && plan.drivers.find((d) => d.id === sbRun.driverId);
    check('STICK-BUILD was assigned as its own run', sbRun && sbRun.stopCount === 1,
      sbRun ? `${sbRun.id} -> ${sbRun.driverName}` : '');
    check(
      'Its driver gets NO other run that day (hard filter, enforced)',
      sbDriver && sbDriver.dayBlocked && sbDriver.runsAssigned === 1 &&
        plan.runs.filter((r) => r.driverId === sbDriver.id).length === 1,
      sbDriver ? `${sbDriver.name}: ${sbDriver.runsAssigned} run, dayBlocked=${sbDriver.dayBlocked}` : '',
    );
    check(
      "The blocked driver's extra slot was skipped in pass 2, not filled",
      sbDriver && sbDriver.notes.some((n) => n.includes('day-blocking')),
      sbDriver ? sbDriver.notes.join(' | ') : '',
    );
    check(
      'Gate 5 handoff exposes the day-block as an eligibility filter',
      sbRun && isCommittedToDayBlockingJob(plan, sbRun.driverId) &&
        toGate5Handoff(plan).dayBlockedDriverIds.includes(sbRun.driverId),
    );
  },

  F(scenario, plan) {
    const late = plan.runs.filter((r) => r.flags.includes('SOFT_STOP_CROSSED'));
    check(
      'Runs finishing after 1800 are flagged',
      late.length > 0,
      late.map((r) => `${r.id} ends ${r.finishClock}`).join(', '),
    );
    check(
      'With the approval toggle on, those runs are held as pending_approval',
      late.every((r) => r.status === 'pending_approval' && r.flags.includes('PENDING_APPROVAL')),
      late.map((r) => r.status).join(', '),
    );
    check(
      'Nothing is ever scheduled past the 2000 hard stop',
      plan.runs.every((r) => r.finishMinutes <= plan.config.hardStopMinutes),
    );
    check(
      'Weekend capacity policy is surfaced as an open item, not guessed',
      plan.warnings.includes('WEEKEND_POLICY_UNDEFINED'),
      plan.warnings.join(', '),
    );
  },

  E(scenario, plan) {
    check(
      'Overflow is marked unassigned, never silently dropped',
      plan.unassigned.length > 0 &&
        plan.unassigned.every((u) => u.reason.includes('needs another driver or another day')),
      `${plan.unassigned.length} unassigned`,
    );
    const totalSlots = plan.drivers.reduce(
      (n, d) => n + d.baseRunsPerDay + d.extraRunsPerDay, 0,
    );
    check(
      'No driver was given more runs than their base + extra capacity',
      plan.drivers.every((d) => d.runsAssigned <= d.baseRunsPerDay + d.extraRunsPerDay) &&
        plan.runs.length <= totalSlots,
      `${plan.runs.length} runs across ${totalSlots} slots`,
    );
  },
};

const only = (process.argv[2] || '').toUpperCase();

for (const build of SCENARIOS) {
  const scenario = build();
  const letter = scenario.name[0];
  if (only && letter !== only) continue;

  const plan = planDay({
    yard: scenario.yard,
    orders: scenario.orders,
    drivers: scenario.drivers,
    date: scenario.date,
    config: scenario.config || {},
  });

  console.log(formatPlan(plan, { title: `SCENARIO ${scenario.name}` }));
  console.log('EXPECTATIONS');
  console.log('-'.repeat(78));
  universalInvariants(scenario, plan);
  expectations[letter]?.(scenario, plan);
  console.log('');
}

const failed = checks.filter((c) => !c.ok);
console.log('='.repeat(78));
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) {
  for (const f of failed) console.log(`  FAILED: ${f.label}${f.detail ? ` (${f.detail})` : ''}`);
  process.exitCode = 1;
}
