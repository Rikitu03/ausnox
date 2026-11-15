/**
 * Mars reference parameters and coordinate conventions.
 *
 * Terrain data (USGS HiRISE DTM) use the Mars 2000 IAU sphere (R = 3 396 190 m) with
 * planetocentric latitude and east-positive longitude. NASA Mars24 solar equations use
 * planetographic latitude and WEST-positive longitude on the IAU 2000 ellipsoid
 * (a = 3 396 190 m, b = 3 376 200 m). Conversions between the two are explicit here.
 */
import type { GeographicCoordinate } from '../contracts/geo.js'
import { engineError, type EngineError } from '../contracts/errors.js'

/** Mars 2000 IAU sphere radius used by the terrain CRS (metres). */
export const MARS_2000_SPHERE_RADIUS_M = 3_396_190
/** IAU 2000 Mars ellipsoid (metres). Used only for planetographic latitude. */
export const MARS_IAU2000_EQUATORIAL_RADIUS_M = 3_396_190
export const MARS_IAU2000_POLAR_RADIUS_M = 3_376_200

const DEG = Math.PI / 180

export function degToRad(deg: number): number {
  return deg * DEG
}

export function radToDeg(rad: number): number {
  return rad / DEG
}

/** Normalise an east-positive longitude to the half-open interval [-180, 180). */
export function normalizeLongitude180(lonDeg: number): number {
  let v = (lonDeg + 180) % 360
  if (v < 0) v += 360
  return v - 180
}

/** Normalise a longitude to [0, 360). */
export function normalizeLongitude360(lonDeg: number): number {
  const v = lonDeg % 360
  return v < 0 ? v + 360 : v === 0 ? 0 : v
}

/** East-positive longitude -> west-positive longitude in [0, 360) (Mars24 convention). */
export function eastToWestLongitude(lonEastDeg: number): number {
  return normalizeLongitude360(-lonEastDeg)
}

/** West-positive longitude -> east-positive longitude in [-180, 180). */
export function westToEastLongitude(lonWestDeg: number): number {
  return normalizeLongitude180(-lonWestDeg)
}

/**
 * Planetocentric -> planetographic latitude on the IAU 2000 ellipsoid:
 * tan(phi_g) = (a/b)^2 * tan(phi_c).
 */
export function planetocentricToPlanetographicLatitude(latCentricDeg: number): number {
  if (Math.abs(latCentricDeg) >= 90) return latCentricDeg
  const k = (MARS_IAU2000_EQUATORIAL_RADIUS_M / MARS_IAU2000_POLAR_RADIUS_M) ** 2
  return radToDeg(Math.atan(k * Math.tan(degToRad(latCentricDeg))))
}

export function planetographicToPlanetocentricLatitude(latGraphicDeg: number): number {
  if (Math.abs(latGraphicDeg) >= 90) return latGraphicDeg
  const k = (MARS_IAU2000_POLAR_RADIUS_M / MARS_IAU2000_EQUATORIAL_RADIUS_M) ** 2
  return radToDeg(Math.atan(k * Math.tan(degToRad(latGraphicDeg))))
}

/** Validate a geographic coordinate. Longitude may be any finite value (it is normalised). */
export function validateGeographicCoordinate(
  geo: GeographicCoordinate | null | undefined,
): { status: 'ok'; value: GeographicCoordinate } | EngineError<'INVALID_INPUT'> {
  if (geo === null || geo === undefined || typeof geo !== 'object') {
    return engineError('INVALID_INPUT', 'A coordinate with lonEast and latNorth (degrees) is required.')
  }
  const { lonEast, latNorth } = geo
  if (typeof lonEast !== 'number' || typeof latNorth !== 'number' || !Number.isFinite(lonEast) || !Number.isFinite(latNorth)) {
    return engineError('INVALID_INPUT', 'Longitude and latitude must be finite numbers in degrees.', { lonEast, latNorth })
  }
  if (latNorth < -90 || latNorth > 90) {
    return engineError('INVALID_INPUT', 'Latitude must be between -90 and 90 degrees.', { latNorth })
  }
  return { status: 'ok', value: { lonEast: normalizeLongitude180(lonEast), latNorth } }
}

/** Great-circle distance on a sphere (default: Mars 2000 sphere), metres. */
export function greatCircleDistanceM(
  a: GeographicCoordinate,
  b: GeographicCoordinate,
  radiusM: number = MARS_2000_SPHERE_RADIUS_M,
): number {
  const p1 = degToRad(a.latNorth)
  const p2 = degToRad(b.latNorth)
  const dp = p2 - p1
  const dl = degToRad(normalizeLongitude180(b.lonEast - a.lonEast))
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * radiusM * Math.asin(Math.min(1, Math.sqrt(h)))
}
