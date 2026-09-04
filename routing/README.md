# Delivery Routing / Load Assignment

Standalone, pure-logic routing module for Backyard Storage Solutions. It runs
**after** the gate pipeline (stock check, permit check, build queue): every
order that reaches it is already a deliverable stop with a known weight and a
geocoded destination.

- **Input:** the day's ready orders + the drivers available that day.
- **Output:** runs per driver, a per-order trace explaining *why* each
  assignment was made, and an explicit list of orders that could not be placed.

No UI, no database, no mapping vendor. In-memory sample data only.

## Run it

```bash
node routing/demo.mjs        # all scenarios + assertions
node routing/demo.mjs C      # one scenario (A-F)
```

The demo prints the full trace, the per-driver/per-run summary, and a set of
PASS/FAIL checks asserting the behaviour the spec calls for. Exit code is
non-zero if any check fails, so it doubles as a regression test.

## Files

| File | What it is |
| --- | --- |
| `config.mjs` | Every tunable constant. Nothing is hardcoded in the engine. |
| `geo.mjs` | `DistanceProvider` interface + haversine **stub**, corridor projection math. |
| `model.mjs` | Order/driver normalisation, seniority order, capacity resolution (weekend hook), allocation pass plan. |
| `router.mjs` | The engine: `planDay()`, run construction, scoring, Gate 5 handoff. |
| `report.mjs` | Text rendering of a plan. |
| `sample-data.mjs` | Yard, places, drivers, six scenarios. |
| `demo.mjs` | Runs the scenarios and asserts the expected behaviour. |
| `index.mjs` | Public exports. |

## How the rules are implemented

**1. Trailer weight — hard cap (8,499 lbs).** Checked before any stop joins a
run; a stop that would breach it is never considered. A single order heavier
than the cap never enters the pool and is reported as unassignable.

**2. Max 4 stops per run.** Hard cap on run growth, independent of weight
headroom.

**3. Corridor clustering + state switching cost.** A run is anchored on the
*farthest* open order; the corridor is the ray from the yard through that
anchor. Another stop joins only if it sits within `corridorHalfWidthMiles`
perpendicular of that ray and between `-corridorBacktrackMiles` and
`anchor + corridorOvershootMiles` along it. That is what makes a run "up the
Turnpike, collecting stops on the way" rather than a radius blob, and it is
what keeps disconnected areas out of the same run.

Route cost:

```
cost = drive_minutes + stateSwitchingCostMinutes × (distinct_states − 1)
```

State lines are allowed, just priced. The switching cost is deliberately a
*scoring* term only — it is not added to the clock, so estimated finish times
stay honest. Tune `stateSwitchingCostMinutes` (default 45) to make crossings
easier or harder to justify. A NJ→PA→NJ loop wins when the drive-time saving
beats the crossing charge; scenario C shows exactly that.

**4/5. Weight-mix is a soft preference; geography wins.** More than
`maxHeavyItemsPerRun` (2) items over `heavyItemLbs` (2,500) raises
`WEIGHT_MIX_EXCEEDED` — a warning, never a block. It is consulted only as a
tiebreaker between options that are already geographically comparable (same
stop count, cost within `tieBreakTolerancePct`). Scenario B keeps three 2,800 lb
sheds together because they are one tight cluster; it flags, it does not split.

**6. In-trailer load configuration is NOT modelled.** Heaviest to the front,
lightest at the rear, fragile "coffin"-packed playsets on top: that is the
driver's call and the module makes no attempt to sequence or validate it. The
only ordering produced is the **drop order along the route**.

**7. Time windows.** From an 0800 nominal departure (yard loading 0600–0900,
real departures 0730–0900), ~45 min per stop. Finishing after **1800** raises
`SOFT_STOP_CROSSED`. Finishing after **2000** is never scheduled — a stop that
would push a run past it is rejected outright. Whether crossing 1800 needs
approval *before* assignment is still an open decision, so it is a config
toggle: `requireApprovalForSoftStopCrossing` (default `false` = warn after
assigning; `true` = the run is held with status `pending_approval`).
`reloadOverheadMinutes` (60) is an **assumption, not confirmed** — it only
applies between genuinely sequential runs on one truck.

**8. Stick-build orders.** A `STICK-BUILD` order is assigned as a solo run and
sets `dayBlocked` on its driver. That flag is a **hard eligibility filter**:
every later pass skips that driver, including their extra/parallel slots.
`toGate5Handoff()` exposes `dayBlockedDriverIds` and per-run `dayBlocking` so
Gate 5 can apply the same filter as its third eligibility test, alongside
capability and active status. A stick-build only goes to a driver with no run
yet; if none is left, it is reported unassigned rather than quietly shared.

**9. Driver capacity and allocation passes.** Each driver has
`baseRunsPerDay`, `extraRunsPerDay` and a seniority rank / date added. Passes
are built by `buildPassPlan()`: base slot #1 for every driver in seniority
order, then base slot #2 for everyone, …, and only once **all** base slots are
done, extra slot #1 for everyone, and so on. Extra capacity therefore never
lets a driver jump the line. Designed for N passes — nothing is hardcoded to 2.

Extra runs model a **second truck in parallel** (e.g. Alfredo's dad running
under Alfredo's name): same departure window, no reload gap, no back-to-back
scheduling. Set `parallelExtraRuns: false` (or per-driver
`extraRunsAreParallel: false`) to model them as sequential on one truck, in
which case `reloadOverheadMinutes` applies.

**Overflow.** Orders left when capacity runs out are returned in
`plan.unassigned` with the reason *"needs another driver or another day"* and
also appear in the trace with status `unassigned`. Nothing is ever silently
dropped — the demo asserts `assigned + unassigned == total` in every scenario.

## Run selection, in one paragraph

For each open slot: build a candidate run from each of the farthest open
orders as anchor (walking inward until enough *feasible* candidates exist, since
late in the day the far anchors can be unreachable before 2000). Each candidate
grows greedily by lowest marginal cost within its corridor, subject to the hard
caps. Candidates are ranked by **most stops → farthest anchor → lowest cost per
stop**; the weight-mix preference breaks ties only between otherwise-similar
options. Drop order within a run is solved exactly — at most 4 stops means at
most 24 orderings.

## Seams left open on purpose

- **Mapping / geocoding.** The engine only talks to a `DistanceProvider`
  (`distanceMiles`, `travelMinutes`). `StubHaversineDistanceProvider` is
  straight-line miles × a circuity factor ÷ an average speed — deliberately
  dumb, and it knows nothing about bridges, tolls or traffic. Implement the two
  methods against Google Maps / Mapbox (with batching and caching) and pass the
  instance to `planDay({ distanceProvider })`. Nothing else changes.
- **Gate 5 (installer capability matching).** Separate module. `toGate5Handoff(plan)`
  is the handoff shape; `isCommittedToDayBlockingJob(plan, driverId)` is the
  day-blocking eligibility check Gate 5 must apply.

## Open items / TODOs

- **Weekend capacity** — how extra weekend runs are requested and granted is not
  defined. `resolveDailyCapacity()` in `model.mjs` is the single place to
  implement it; the default mode reuses weekday capacity and raises
  `WEEKEND_POLICY_UNDEFINED` rather than inventing a rule. Config supports an
  `explicit` mode with per-driver weekend overrides once the rule exists.
- **1800 crossing** — warn vs. require approval is undecided; both are built
  behind `requireApprovalForSoftStopCrossing`.
- **Reload overhead (60 min)** — assumed, needs confirming with ops.
- **Stub travel times** — no river crossings, tolls or traffic; drop orders and
  costs will shift once a real routing API is plugged in.
