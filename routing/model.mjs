/**
 * Domain model helpers: order/driver normalisation, day capacity resolution
 * (including the weekend TODO hook) and the allocation-pass slot plan.
 */

export const STICK_BUILD_TAG = 'STICK-BUILD';

export const WARNINGS = {
  SOFT_STOP_CROSSED: 'SOFT_STOP_CROSSED',
  WEIGHT_MIX_EXCEEDED: 'WEIGHT_MIX_EXCEEDED',
  MULTI_STATE_ROUTE: 'MULTI_STATE_ROUTE',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  DAY_BLOCKING_STICK_BUILD: 'DAY_BLOCKING_STICK_BUILD',
  WEEKEND_POLICY_UNDEFINED: 'WEEKEND_POLICY_UNDEFINED',
  SLOT_INFEASIBLE_TIME: 'SLOT_INFEASIBLE_TIME',
};

export const UNASSIGNED_REASONS = {
  CAPACITY_EXHAUSTED:
    'Daily driver capacity exhausted - needs another driver or another day',
  NO_OPEN_DAY_FOR_STICK_BUILD:
    'STICK-BUILD needs a driver with a completely open day - none left today',
  OVER_TRAILER_CAP:
    'Single order exceeds the trailer weight cap - cannot be delivered on a standard run',
};

export function isStickBuild(order) {
  return (order.tags || []).includes(STICK_BUILD_TAG);
}

export function normalizeOrder(order) {
  return {
    serviceMinutes: null, // falls back to config.stopServiceMinutes
    tags: [],
    productType: 'shed',
    ...order,
    weightLbs: Number(order.weightLbs),
    isStickBuild: isStickBuild(order),
    state: order.address.state,
  };
}

export function normalizeDriver(driver) {
  return {
    active: true,
    baseRunsPerDay: 1,
    extraRunsPerDay: 0,
    seniorityRank: null,
    dateAdded: null,
    ...driver,
  };
}

/** Seniority order: explicit rank, then date added, then name. Stable. */
export function bySeniority(a, b) {
  const ra = a.seniorityRank ?? Number.POSITIVE_INFINITY;
  const rb = b.seniorityRank ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  const da = a.dateAdded ?? '9999-12-31';
  const db = b.dateAdded ?? '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  return String(a.name).localeCompare(String(b.name));
}

export function isWeekend(dateISO) {
  const day = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Resolve a driver's run capacity for a specific date.
 *
 * TODO(weekend): weekend capacity is an OPEN ITEM - how extra weekend runs are
 * requested and granted has not been defined. Rather than guessing a rule, the
 * default mode reuses weekday capacity and raises a WEEKEND_POLICY_UNDEFINED
 * warning so ops sees it. Implement the real rule in this one function.
 */
export function resolveDailyCapacity(driver, dateISO, config) {
  const warnings = [];
  let baseRunsPerDay = driver.baseRunsPerDay;
  let extraRunsPerDay = driver.extraRunsPerDay;

  if (dateISO && isWeekend(dateISO)) {
    const { mode, weekendOverridesByDriverId } = config.weekend;
    if (mode === 'explicit') {
      const override = weekendOverridesByDriverId[driver.id];
      if (override) {
        baseRunsPerDay = override.baseRunsPerDay ?? baseRunsPerDay;
        extraRunsPerDay = override.extraRunsPerDay ?? extraRunsPerDay;
      } else {
        baseRunsPerDay = 0;
        extraRunsPerDay = 0;
      }
    } else if (mode === 'undefined_policy') {
      warnings.push(WARNINGS.WEEKEND_POLICY_UNDEFINED);
    }
  }

  return { baseRunsPerDay, extraRunsPerDay, warnings };
}

/**
 * Build the allocation pass plan (Rule 9).
 *
 * Every driver's base run(s) are filled before ANY driver's extra run is
 * considered, and within a pass drivers are taken in seniority order. Extra
 * capacity therefore never lets a driver jump the line. Designed for N passes:
 * base round 1..maxBase, then extra round 1..maxExtra.
 *
 * @returns {Array<{ passNumber, tier, tierIndex, driverIds: string[] }>}
 */
export function buildPassPlan(driverStates) {
  const ordered = [...driverStates].sort((a, b) => bySeniority(a.driver, b.driver));
  const maxBase = Math.max(0, ...ordered.map((d) => d.capacity.baseRunsPerDay));
  const maxExtra = Math.max(0, ...ordered.map((d) => d.capacity.extraRunsPerDay));

  const passes = [];
  let passNumber = 0;
  for (let i = 0; i < maxBase; i += 1) {
    passNumber += 1;
    passes.push({
      passNumber,
      tier: 'base',
      tierIndex: i,
      driverIds: ordered
        .filter((d) => d.capacity.baseRunsPerDay > i)
        .map((d) => d.driver.id),
    });
  }
  for (let i = 0; i < maxExtra; i += 1) {
    passNumber += 1;
    passes.push({
      passNumber,
      tier: 'extra',
      tierIndex: i,
      driverIds: ordered
        .filter((d) => d.capacity.extraRunsPerDay > i)
        .map((d) => d.driver.id),
    });
  }
  return passes;
}

export function minutesToClock(minutes) {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`;
}
