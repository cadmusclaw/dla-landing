/**
 * Tunable configuration for the delivery routing / load-assignment module.
 *
 * Everything an operator might want to argue about lives here. Nothing in the
 * algorithm hardcodes these numbers.
 */

export const DEFAULT_CONFIG = {
  // --- Rule 1: hard physical cap -------------------------------------------
  // Total trailer weight per run. HARD constraint - never exceeded, ever.
  maxRunWeightLbs: 8499,

  // --- Rule 2: hard stop-count cap -----------------------------------------
  // Loads per run, regardless of weight headroom. HARD constraint.
  maxStopsPerRun: 4,

  // --- Rule 4: weight-mix, SOFT preference ---------------------------------
  // "No more than 2 sheds over 2,500 lbs in the same run." Advisory only:
  // it is used as a tiebreaker between otherwise-similar routes and raises a
  // warning when violated. It never blocks an assignment (Rule 5).
  heavyItemLbs: 2500,
  maxHeavyItemsPerRun: 2,

  // --- Rule 3: corridor clustering + state switching cost ------------------
  // A run is built along a single driving corridor: the ray from the yard to
  // the run's anchor (farthest open) stop. Other stops join the run if they
  // sit close to that ray, which is what stops routes from zig-zagging
  // between disconnected areas.
  corridorHalfWidthMiles: 15,   // max perpendicular offset from the corridor
  corridorOvershootMiles: 15,   // how far past the anchor a stop may sit
  corridorBacktrackMiles: 5,    // how far "behind" the yard a stop may sit

  // Overhead charged per distinct state touched beyond the first (tolls,
  // terrain, mental context-switch). Expressed in minutes so it is directly
  // comparable to drive time. TUNABLE - this is the knob for "how badly do we
  // want to avoid state lines".
  stateSwitchingCostMinutes: 45,

  // --- Rule 7: time windows -------------------------------------------------
  departureTimeMinutes: 8 * 60,  // 0800 nominal departure (yard load 0600-0900,
                                 // real departures 0730-0900)
  softStopMinutes: 18 * 60,      // 1800 - crossing this raises a flag
  hardStopMinutes: 20 * 60,      // 2000 - crossing this is never scheduled
  stopServiceMinutes: 45,        // ~45 min per delivery/install stop
  // ASSUMPTION, NOT CONFIRMED: reload overhead between two *sequential* runs
  // on the same truck. Flagged as configurable per the spec.
  reloadOverheadMinutes: 60,
  // Open decision (Rule 7): does crossing 1800 require approval before the run
  // is assigned (like the weight cap hard-blocks), or is it a post-assignment
  // warning? Built as a warning by default; flip this to hold such runs in a
  // "pending approval" state instead of assigning them outright.
  requireApprovalForSoftStopCrossing: false,

  // --- Travel-time stub -----------------------------------------------------
  // Only used by StubHaversineDistanceProvider. A real routing API provider
  // ignores these entirely.
  averageSpeedMph: 45,
  roadCircuityFactor: 1.25,      // straight-line miles -> road miles fudge

  // --- Route search / scoring ----------------------------------------------
  // How many of the farthest open orders are tried as corridor anchors before
  // picking the best resulting run.
  seedCandidateCount: 3,
  // Two options are "otherwise similar" (and therefore decided by the soft
  // weight-mix preference) when their scores are within this fraction.
  tieBreakTolerancePct: 0.15,

  // How candidate corridors compete for an open run slot:
  //   'revenue_per_run'  - most dollars for this slot. The scarce resource is
  //                        the truck-day, not the hour: a 2-load run to the
  //                        $2/mile band can be a better day than a full 4-stop
  //                        local milk run even though it pays less per hour.
  //   'revenue_per_hour' - most dollars per scored hour. Use when hours, not
  //                        slots, are the binding constraint (light order
  //                        board, drivers with spare capacity).
  //   'stops_first'      - fill the truck: most stops, then farthest anchor,
  //                        then lowest cost per stop. Ignores the rate card.
  // Either way the corridor rules decide WHICH stops may share a run - this
  // only picks between corridors that are already geographically sound.
  selectionObjective: 'revenue_per_run',

  // --- Pay / revenue --------------------------------------------------------
  // Paid by the load and by mileage. Flat rate per load inside each mileage
  // band; past the last band it becomes a straight per-mile rate.
  //   0-50 mi $150 | 51-100 $175 | 101-150 $225 | 151-200 $275 | 201+ $2/mile
  // NOTE: the last band is a step up, not a continuation - 200 mi pays $275,
  // 201 mi pays $402. That is what the rate card says; it is not a bug here.
  payment: {
    tiers: [
      { maxMiles: 50, flatUsd: 150 },
      { maxMiles: 100, flatUsd: 175 },
      { maxMiles: 150, flatUsd: 225 },
      { maxMiles: 200, flatUsd: 275 },
    ],
    overflowPerMileUsd: 2, // applies to every mile once past the last tier
    // ASSUMPTION: billable mileage per load is yard -> delivery address
    // (one way). Set 'route_leg' to bill the leg actually driven to reach the
    // stop instead. Confirm which one the rate card means.
    mileageBasis: 'yard_to_stop',
    roundMilesToWhole: true,
  },

  // --- Rule 9: driver capacity ---------------------------------------------
  // A driver's *extra* runs are a second truck running in parallel the same
  // day (e.g. Alfredo's dad), not a back-to-back second run: no reload gap,
  // same departure window. Set false to model extra runs as sequential on the
  // same truck (reloadOverheadMinutes then applies).
  parallelExtraRuns: true,

  // --- TODO(weekend): OPEN ITEM --------------------------------------------
  // How extra weekend capacity is requested/granted is not defined yet. This
  // hook exists so the rule can be dropped in without touching the engine.
  // mode: 'undefined_policy' -> use weekday capacity and warn on weekend dates
  //       'same_as_weekday'  -> use weekday capacity silently
  //       'explicit'         -> use weekendOverridesByDriverId below
  weekend: {
    mode: 'undefined_policy',
    weekendOverridesByDriverId: {}, // { driverId: { baseRunsPerDay, extraRunsPerDay } }
  },
};

/** Shallow-merge overrides onto the defaults (one level deep for sub-objects). */
export function makeConfig(overrides = {}) {
  const merged = { ...DEFAULT_CONFIG, ...overrides };
  merged.weekend = { ...DEFAULT_CONFIG.weekend, ...(overrides.weekend || {}) };
  merged.payment = { ...DEFAULT_CONFIG.payment, ...(overrides.payment || {}) };
  return merged;
}
