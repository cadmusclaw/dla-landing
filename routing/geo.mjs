/**
 * Geometry + the pluggable distance/travel-time seam.
 *
 * SWAP SEAM: the engine only ever talks to a DistanceProvider. To move to a
 * real routing API (Google Maps Distance Matrix, Mapbox Directions, ...),
 * implement the two methods below against that API (batch/caching included)
 * and hand the instance to planDay({ distanceProvider }). Nothing else in the
 * module needs to change.
 */

const MILES_PER_DEGREE_LAT = 69.17;
const EARTH_RADIUS_MILES = 3958.8;

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in miles between two { lat, lon } points. */
export function haversineMiles(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Interface. Implement both methods to plug in a real routing API. */
export class DistanceProvider {
  get name() {
    return this.constructor.name;
  }

  /** @returns {number} road-ish miles from a to b */
  distanceMiles(_a, _b) {
    throw new Error('DistanceProvider.distanceMiles not implemented');
  }

  /** @returns {number} travel time in minutes from a to b */
  travelMinutes(_a, _b) {
    throw new Error('DistanceProvider.travelMinutes not implemented');
  }
}

/**
 * Stand-in provider: straight-line distance inflated by a circuity factor,
 * divided by an average speed. Deliberately dumb - it exists so the routing
 * logic can be exercised and tested without a mapping vendor.
 */
export class StubHaversineDistanceProvider extends DistanceProvider {
  constructor({ averageSpeedMph = 45, roadCircuityFactor = 1.25 } = {}) {
    super();
    this.averageSpeedMph = averageSpeedMph;
    this.roadCircuityFactor = roadCircuityFactor;
    this._cache = new Map();
  }

  get name() {
    return 'StubHaversineDistanceProvider';
  }

  distanceMiles(a, b) {
    const key = `${a.lat},${a.lon}|${b.lat},${b.lon}`;
    let miles = this._cache.get(key);
    if (miles === undefined) {
      miles = haversineMiles(a, b) * this.roadCircuityFactor;
      this._cache.set(key, miles);
    }
    return miles;
  }

  travelMinutes(a, b) {
    return (this.distanceMiles(a, b) / this.averageSpeedMph) * 60;
  }
}

/** Local flat-earth projection (miles) of `point` relative to `origin`. */
export function toPlanarMiles(origin, point) {
  const milesPerDegreeLon = MILES_PER_DEGREE_LAT * Math.cos(toRad(origin.lat));
  return {
    x: (point.lon - origin.lon) * milesPerDegreeLon,
    y: (point.lat - origin.lat) * MILES_PER_DEGREE_LAT,
  };
}

/**
 * Project `point` onto the corridor running from `yard` through `anchor`.
 *
 *   alongMiles - how far up the corridor the point sits (negative = behind the
 *                yard, > axisLengthMiles = past the anchor)
 *   crossMiles - perpendicular offset from the corridor centre line
 *
 * This is what makes clustering corridor-shaped rather than radius-shaped: a
 * stop 40 miles up the Turnpike and 3 miles off it is "on the way"; a stop 8
 * miles from the yard but 20 miles off the axis is not.
 */
export function corridorProjection(yard, anchor, point) {
  const a = toPlanarMiles(yard, anchor);
  const p = toPlanarMiles(yard, point);
  const axisLengthMiles = Math.hypot(a.x, a.y);
  if (axisLengthMiles < 1e-9) {
    return { alongMiles: 0, crossMiles: Math.hypot(p.x, p.y), axisLengthMiles: 0 };
  }
  const ux = a.x / axisLengthMiles;
  const uy = a.y / axisLengthMiles;
  const alongMiles = p.x * ux + p.y * uy;
  const crossMiles = Math.abs(p.x * uy - p.y * ux);
  return { alongMiles, crossMiles, axisLengthMiles };
}
