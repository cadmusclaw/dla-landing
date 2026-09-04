/** Human-readable rendering of a plan: per-order traces + per-run summary. */

import { minutesToClock } from './model.mjs';
import { usd } from './pay.mjs';

const line = (char = '-', n = 78) => char.repeat(n);
const lbs = (n) => `${Math.round(n).toLocaleString()} lbs`;

export function formatPlan(plan, { title = 'DELIVERY PLAN' } = {}) {
  const out = [];
  const cfg = plan.config;

  out.push(line('='));
  out.push(`${title}${plan.date ? `  -  ${plan.date}` : ''}`);
  out.push(line('='));
  out.push(
    `Yard: ${plan.yard.name} (${plan.yard.city}, ${plan.yard.state})   ` +
      `Distance source: ${plan.distanceProviderName} [STUB - swap for a routing API]`,
  );
  out.push(
    `Caps: ${cfg.maxRunWeightLbs.toLocaleString()} lbs / ${cfg.maxStopsPerRun} stops per run   ` +
      `Depart ${minutesToClock(cfg.departureTimeMinutes)}   ` +
      `Soft stop ${minutesToClock(cfg.softStopMinutes)}   Hard stop ${minutesToClock(cfg.hardStopMinutes)}`,
  );
  out.push(
    `Pay: ${cfg.payment.tiers
      .map((t, i, all) => `${i === 0 ? 0 : all[i - 1].maxMiles + 1}-${t.maxMiles}mi ${usd(t.flatUsd)}`)
      .join('  ')}  ${cfg.payment.tiers[cfg.payment.tiers.length - 1].maxMiles + 1}+mi ` +
      `$${cfg.payment.overflowPerMileUsd}/mi   Selection: ${cfg.selectionObjective}`,
  );
  out.push(
    `Switching cost: ${cfg.stateSwitchingCostMinutes} min per extra state   ` +
      `Reload overhead: ${cfg.reloadOverheadMinutes} min (ASSUMED)   ` +
      `Approval required to cross 1800: ${cfg.requireApprovalForSoftStopCrossing}`,
  );
  if (plan.warnings.length) out.push(`Day warnings: ${plan.warnings.join(', ')}`);

  out.push('');
  out.push('ALLOCATION PASSES');
  out.push(line());
  for (const pass of plan.passes) {
    const names = pass.driverIds
      .map((id) => plan.drivers.find((d) => d.id === id)?.name || id)
      .join(', ');
    out.push(
      `  Pass ${pass.passNumber} (${pass.tier} slot #${pass.tierIndex + 1}) - drivers in seniority order: ${names || '(none)'}`,
    );
  }

  out.push('');
  out.push('PER-ORDER TRACE');
  out.push(line());
  for (const t of plan.traces) {
    const head =
      t.status === 'unassigned'
        ? `${t.orderId}  ${t.customer}  ->  UNASSIGNED`
        : `${t.orderId}  ${t.customer}  ->  ${t.driverName} / ${t.runId} / stop ${t.stopSequence}` +
          (t.status === 'pending_approval' ? '  [PENDING APPROVAL]' : '');
    out.push(head);
    for (const reason of t.reasons) out.push(`      why: ${reason}`);
    if (t.warnings.length) out.push(`      warnings: ${t.warnings.join(', ')}`);
    out.push('');
  }

  out.push('PER-DRIVER / PER-RUN SUMMARY');
  out.push(line());
  for (const driver of plan.drivers) {
    out.push(
      `${driver.name} (seniority ${driver.seniorityRank ?? 'n/a'}, base ${driver.baseRunsPerDay}, ` +
        `extra ${driver.extraRunsPerDay}) - ${driver.runsAssigned} run(s)` +
        (driver.dayBlocked ? '  [DAY BLOCKED: STICK-BUILD]' : ''),
    );
    const driverRuns = plan.runs.filter((r) => r.driverId === driver.id);
    if (driverRuns.length === 0) out.push('    (no runs assigned)');
    for (const run of driverRuns) {
      out.push(
        `    ${run.id}  pass ${run.passNumber} (${run.tier}${run.parallelSlot ? ', parallel truck' : ''})  ` +
          `${run.stopCount} stop(s)  ${lbs(run.totalWeightLbs)}  ` +
          `states ${run.states.join('>')}  ${run.startClock}-${run.finishClock}` +
          (run.status === 'pending_approval' ? '  [PENDING APPROVAL]' : ''),
      );
      out.push(
        `        drive ${Math.round(run.driveMinutes)} min + service ${run.serviceMinutes} min | ` +
          `route cost ${Math.round(run.totalCostMinutes)} min (incl. ${run.switchingCostMinutes} min switching) | ` +
          `heavy items ${run.heavyCount}`,
      );
      out.push(
        `        pays ${usd(run.totalPayUsd)} (${usd(run.payPerStopUsd)}/load, ` +
          `${usd(run.usdPerScoredHour)}/hr)`,
      );
      out.push(
        `        drop order: ${run.stops
          .map(
            (s) =>
              `${s.sequence}) ${s.orderId} ${s.city},${s.state} ${lbs(s.weightLbs)} ` +
              `${s.billableMiles}mi ${usd(s.payUsd)}`,
          )
          .join('  ')}`,
      );
      out.push(`        flags: ${run.flags.length ? run.flags.join(', ') : 'none'}`);
    }
    for (const note of driver.notes) out.push(`    note: ${note}`);
  }

  out.push('');
  out.push('DAY PAY');
  out.push(line());
  out.push(
    `  ${plan.pay.loadsDelivered} load(s) delivered, ${usd(plan.pay.totalUsd)} total ` +
      `(mileage basis: ${plan.pay.mileageBasis})`,
  );
  for (const d of plan.pay.byDriver) {
    out.push(`    ${d.driverName}: ${d.loads} load(s), ${usd(d.payUsd)}`);
  }
  if (plan.pay.forgoneUsd > 0) {
    out.push(
      `  Left on the table: ${usd(plan.pay.forgoneUsd)} across ${plan.unassigned.length} unassigned load(s)`,
    );
  }

  out.push('');
  out.push(`UNASSIGNED (${plan.unassigned.length})`);
  out.push(line());
  if (plan.unassigned.length === 0) {
    out.push('  none - every order was assigned');
  } else {
    for (const u of plan.unassigned) {
      out.push(
        `  ${u.orderId}  ${u.customer}  ${u.city}, ${u.state}  ${lbs(u.weightLbs)}  ` +
          `(would pay ${usd(u.forgonePayUsd)})  -  ${u.reason}`,
      );
    }
  }
  out.push('');
  return out.join('\n');
}
