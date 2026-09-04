/**
 * In-memory sample data. No persistence, no database - this is what the
 * routing module is exercised against until it is wired to real orders.
 *
 * Orders arrive here AFTER the gate pipeline (stock, permit, build queue) has
 * cleared them: each one is a single delivery/install stop with a known weight
 * and a geocoded destination.
 */

export const YARD = {
  name: 'Backyard Storage Solutions yard',
  city: 'Vineland',
  state: 'NJ',
  lat: 39.4864,
  lon: -75.0257,
};

/** Rough real-world coordinates so the corridor logic has something to chew on. */
export const PLACES = {
  Millville:      { city: 'Millville',       state: 'NJ', lat: 39.4020, lon: -75.0393 },
  Hammonton:      { city: 'Hammonton',       state: 'NJ', lat: 39.6362, lon: -74.8024 },
  Williamstown:   { city: 'Williamstown',    state: 'NJ', lat: 39.6837, lon: -74.9954 },
  Glassboro:      { city: 'Glassboro',       state: 'NJ', lat: 39.7029, lon: -75.1119 },
  Sewell:         { city: 'Sewell',          state: 'NJ', lat: 39.7590, lon: -75.0946 },
  Berlin:         { city: 'Berlin',          state: 'NJ', lat: 39.7912, lon: -74.9291 },
  Deptford:       { city: 'Deptford',        state: 'NJ', lat: 39.8320, lon: -75.1177 },
  Marlton:        { city: 'Marlton',         state: 'NJ', lat: 39.8912, lon: -74.9218 },
  CherryHill:     { city: 'Cherry Hill',     state: 'NJ', lat: 39.9348, lon: -75.0307 },
  MountLaurel:    { city: 'Mount Laurel',    state: 'NJ', lat: 39.9340, lon: -74.8910 },
  Bordentown:     { city: 'Bordentown',      state: 'NJ', lat: 40.1465, lon: -74.7118 },
  EastBrunswick:  { city: 'East Brunswick',  state: 'NJ', lat: 40.4279, lon: -74.4160 },
  Edison:         { city: 'Edison',          state: 'NJ', lat: 40.5187, lon: -74.4121 },
  Woodbridge:     { city: 'Woodbridge',      state: 'NJ', lat: 40.5576, lon: -74.2846 },
  Sayreville:     { city: 'Sayreville',      state: 'NJ', lat: 40.4593, lon: -74.3610 },
  Freehold:       { city: 'Freehold',        state: 'NJ', lat: 40.2601, lon: -74.2740 },
  Brick:          { city: 'Brick',           state: 'NJ', lat: 40.0578, lon: -74.1099 },
  TomsRiver:      { city: 'Toms River',      state: 'NJ', lat: 39.9537, lon: -74.1979 },
  Manahawkin:     { city: 'Manahawkin',      state: 'NJ', lat: 39.6951, lon: -74.2596 },
  EggHarbor:      { city: 'Egg Harbor Twp',  state: 'NJ', lat: 39.3737, lon: -74.5946 },
  AtlanticCity:   { city: 'Atlantic City',   state: 'NJ', lat: 39.3643, lon: -74.4229 },
  Philadelphia:   { city: 'Philadelphia',    state: 'PA', lat: 39.9526, lon: -75.1652 },
  Bensalem:       { city: 'Bensalem',        state: 'PA', lat: 40.1004, lon: -74.9515 },
  Levittown:      { city: 'Levittown',       state: 'PA', lat: 40.1551, lon: -74.8288 },
  Media:          { city: 'Media',           state: 'PA', lat: 39.9168, lon: -75.3877 },
  KingOfPrussia:  { city: 'King of Prussia', state: 'PA', lat: 40.0893, lon: -75.3960 },
  Wilmington:     { city: 'Wilmington',      state: 'DE', lat: 39.7459, lon: -75.5466 },
  Baltimore:      { city: 'Baltimore',       state: 'MD', lat: 39.2904, lon: -76.6122 },
  Richmond:       { city: 'Richmond',        state: 'VA', lat: 37.5407, lon: -77.4360 },
  Chesterfield:   { city: 'Chesterfield',    state: 'VA', lat: 37.3771, lon: -77.5047 },
};

let seq = 0;
/** Tiny factory so the sample sets stay readable. */
export function order(placeKey, customer, weightLbs, productType, opts = {}) {
  const place = PLACES[placeKey];
  seq += 1;
  return {
    id: opts.id || `ORD-${String(seq).padStart(3, '0')}`,
    customer,
    address: {
      line1: `${100 + (seq * 7) % 800} Main St`,
      city: place.city,
      state: place.state,
      zip: opts.zip || '00000',
    },
    lat: place.lat + (opts.latJitter || 0),
    lon: place.lon + (opts.lonJitter || 0),
    weightLbs,
    productType,
    tags: opts.tags || [],
  };
}

export const DRIVERS = {
  // Alfredo is the senior contractor. His "extra" run is a second truck run in
  // parallel the same day by his dad, under Alfredo's name - not a back-to-back
  // second run for Alfredo himself.
  alfredo: {
    id: 'DRV-ALFREDO',
    name: 'Alfredo',
    baseRunsPerDay: 1,
    extraRunsPerDay: 1,
    seniorityRank: 1,
    dateAdded: '2019-04-02',
    active: true,
  },
  // "You" - owner-operator running one truck.
  mike: {
    id: 'DRV-MIKE',
    name: 'Mike (you)',
    baseRunsPerDay: 1,
    extraRunsPerDay: 0,
    seniorityRank: 2,
    dateAdded: '2021-08-15',
    active: true,
  },
};

/* ---------------------------------------------------------------------- */
/* Scenario A - ~10 orders, 2 drivers, checks the pass/allocation order    */
/* ---------------------------------------------------------------------- */
export function scenarioA() {
  seq = 0;
  return {
    name: 'A. Ten orders, two drivers - allocation pass order',
    date: '2026-09-09', // a Wednesday
    yard: YARD,
    drivers: [DRIVERS.alfredo, DRIVERS.mike],
    orders: [
      // North corridor (NJ Turnpike / I-295 run)
      order('Woodbridge', 'Ramirez', 2100, 'shed'),
      order('Edison', 'Chen', 1450, 'shed'),
      order('EastBrunswick', 'Doyle', 900, 'playset'),
      order('Bordentown', 'Whitaker', 2650, 'shed'),
      // Shore corridor
      order('TomsRiver', 'Alvarez', 1800, 'shed'),
      order('Manahawkin', 'Kowalski', 1200, 'gazebo'),
      order('EggHarbor', 'Brennan', 950, 'playset'),
      order('AtlanticCity', 'Nguyen', 1600, 'shed'),
      // Close-in I-295 pair
      order('Deptford', 'Halloran', 2400, 'shed'),
      order('Glassboro', 'Osei', 1100, 'playset'),
    ],
  };
}

/* ---------------------------------------------------------------------- */
/* Scenario B - tight cluster, weight-heavy: geography must win            */
/* ---------------------------------------------------------------------- */
export function scenarioB() {
  seq = 0;
  return {
    name: 'B. Tight cluster of heavy sheds - geography wins, weight-mix warns',
    date: '2026-09-09',
    yard: YARD,
    drivers: [DRIVERS.alfredo],
    orders: [
      // Three 2,800 lb sheds within a couple of miles of each other = 8,400 lbs.
      // Under the 8,499 lb hard cap, over the "max 2 heavy" soft preference.
      order('TomsRiver', 'Vasquez', 2800, 'shed', { latJitter: 0.01 }),
      order('TomsRiver', 'Feeney', 2800, 'shed', { latJitter: -0.02, lonJitter: 0.02 }),
      order('TomsRiver', 'Okafor', 2800, 'shed', { latJitter: 0.03, lonJitter: -0.01 }),
      // Light stops elsewhere - available, but not on that corridor.
      order('Glassboro', 'Delacroix', 700, 'playset'),
      order('Sewell', 'Barone', 850, 'gazebo'),
    ],
  };
}

/* ---------------------------------------------------------------------- */
/* Scenario C - NJ -> PA -> NJ loop: allowed, but cost-scored              */
/* ---------------------------------------------------------------------- */
export function scenarioC() {
  seq = 0;
  return {
    name: 'C. NJ -> PA -> back through NJ loop - allowed and cost-scored',
    date: '2026-09-09',
    yard: YARD,
    drivers: [DRIVERS.alfredo],
    orders: [
      order('Bensalem', 'Sokolov', 2200, 'shed'),
      order('Philadelphia', 'Byrne', 1300, 'playset'),
      order('CherryHill', 'Marchetti', 2450, 'shed'),
      order('MountLaurel', 'Adeyemi', 1100, 'gazebo'),
      // Off-corridor: should NOT be pulled into the loop (no zig-zag).
      order('Manahawkin', 'Prescott', 1500, 'shed'),
      order('AtlanticCity', 'Iverson', 1400, 'shed'),
    ],
  };
}

/* ---------------------------------------------------------------------- */
/* Scenario D - stick-build blocks the whole day for its driver            */
/* ---------------------------------------------------------------------- */
export function scenarioD() {
  seq = 0;
  return {
    name: 'D. STICK-BUILD day-blocking job - hard filter, not a note',
    date: '2026-09-09',
    yard: YARD,
    drivers: [DRIVERS.alfredo, DRIVERS.mike],
    orders: [
      order('Bordentown', 'Castellano', 3200, 'shed', { tags: ['STICK-BUILD'] }),
      order('Deptford', 'Nowak', 2400, 'shed'),
      order('Glassboro', 'Ferreira', 1050, 'playset'),
      order('Sewell', 'Lindqvist', 900, 'gazebo'),
      order('CherryHill', 'Ortega', 1750, 'shed'),
      order('Marlton', 'Bhatt', 1600, 'shed'),
    ],
  };
}

/* ---------------------------------------------------------------------- */
/* Scenario E - heavy volume: capacity runs out, nothing silently dropped  */
/* ---------------------------------------------------------------------- */
export function scenarioE() {
  seq = 0;
  const placeKeys = [
    'Millville', 'Hammonton', 'Williamstown', 'Glassboro', 'Sewell', 'Berlin',
    'Deptford', 'Marlton', 'CherryHill', 'MountLaurel', 'Bordentown',
    'EastBrunswick', 'Edison', 'Woodbridge', 'Sayreville', 'Freehold', 'Brick',
    'TomsRiver', 'Manahawkin', 'EggHarbor', 'AtlanticCity', 'Philadelphia',
    'Bensalem', 'Levittown', 'Media', 'KingOfPrussia', 'Wilmington',
    'Glassboro', 'Berlin', 'Marlton', 'TomsRiver', 'Hammonton',
  ];
  const weights = [2800, 950, 1600, 2450, 700, 3100, 1250, 2000];
  const types = ['shed', 'playset', 'shed', 'shed', 'gazebo', 'shed', 'playset', 'shed'];
  const names = [
    'Abbott', 'Bianchi', 'Cortez', 'Dunne', 'Ellison', 'Farrow', 'Gunderson',
    'Haddad', 'Imani', 'Jankowski', 'Keating', 'Larkin', 'Moreau', 'Nakamura',
    'Ortiz', 'Pappas', 'Quinlan', 'Reyes', 'Salvatore', 'Toomey', 'Ueda',
    'Vandermeer', 'Wozniak', 'Xiong', 'Yarborough', 'Zeller', 'Ashcroft',
    'Boucher', 'Calderon', 'Devlin', 'Espinoza', 'Fitzgibbon',
  ];
  return {
    name: 'E. Heavy-volume day (32 orders) - capacity runs out, overflow is explicit',
    date: '2026-09-09',
    yard: YARD,
    drivers: [DRIVERS.alfredo, DRIVERS.mike],
    orders: placeKeys.map((key, i) =>
      order(key, names[i], weights[i % weights.length], types[i % types.length], {
        latJitter: ((i % 5) - 2) * 0.01,
        lonJitter: ((i % 3) - 1) * 0.01,
      }),
    ),
  };
}


/* ---------------------------------------------------------------------- */
/* Scenario F - late departure: 1800 soft stop, 2000 hard stop, approval   */
/*              toggle, and the undefined weekend-capacity hook            */
/* ---------------------------------------------------------------------- */
export function scenarioF() {
  const base = scenarioA();
  return {
    ...base,
    name: 'F. Late 1500 departure on a Saturday - soft/hard stop + approval toggle',
    date: '2026-09-12', // a Saturday: exercises the weekend TODO hook
    drivers: [DRIVERS.alfredo],
    config: {
      departureTimeMinutes: 15 * 60,
      requireApprovalForSoftStopCrossing: true,
    },
  };
}

/* ---------------------------------------------------------------------- */
/* Scenario G - the far two-load day: fewer stops, better money            */
/* ---------------------------------------------------------------------- */
export function scenarioG() {
  seq = 0;
  return {
    name: 'G. Long-haul two-load run vs. a full local milk run - pay decides',
    date: '2026-09-09',
    yard: YARD,
    drivers: [DRIVERS.alfredo],
    // Highway average for a genuine long haul; the local-only scenarios use
    // the slower default.
    config: { averageSpeedMph: 55 },
    orders: [
      // Two Richmond-area drops, both deep in the $2/mile band.
      order('Richmond', 'Whitfield', 2300, 'shed'),
      order('Chesterfield', 'Ramsey', 1900, 'shed'),
      // A tidy local cluster that fills a truck but pays flat-rate money.
      order('Glassboro', 'Petrov', 1200, 'playset'),
      order('Sewell', 'Donnelly', 900, 'gazebo'),
      order('Deptford', 'Amara', 2400, 'shed'),
      order('CherryHill', 'Sunderland', 1700, 'shed'),
      order('MountLaurel', 'Kavanagh', 1500, 'shed'),
      order('Marlton', 'Trujillo', 1100, 'playset'),
    ],
  };
}

export const SCENARIOS = [scenarioA, scenarioB, scenarioC, scenarioD, scenarioE, scenarioF, scenarioG];
