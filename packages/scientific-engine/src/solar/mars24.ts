/**
 * NASA GISS Mars24 algorithm (Allison & McEwen 2000, with Mars24 revisions), steps A-D.
 * https://www.giss.nasa.gov/tools/mars24/help/algorithm.html
 *
 * Conventions:
 *  - Mars24 uses planetographic latitude and WEST-positive planetographic longitude.
 *  - `calculateMarsSolarTime` accepts the terrain convention (planetocentric latitude,
 *    east-positive longitude) and converts explicitly; `computeMars24` takes Mars24 inputs.
 */
import type { GeographicCoordinate } from '../contracts/geo.js'
import { engineError, type EngineError } from '../contracts/errors.js'
import type { ResultProvenance } from '../contracts/provenance.js'
import { eastToWestLongitude, planetocentricToPlanetographicLatitude, validateGeographicCoordinate } from '../coordinates/mars.js'
import { ENGINE_NAME, ENGINE_VERSION, SOLAR_MODEL_VERSION } from '../version.js'
import { mod } from './conversions.js'
import { computeTimeScales, validateEpoch, type TimeScales } from './timeScales.js'

const D2R = Math.PI / 180
const sinD = (d: number) => Math.sin(d * D2R)
const cosD = (d: number) => Math.cos(d * D2R)
const tanD = (d: number) => Math.tan(d * D2R)

/** Mars24 B-3 perturber terms: A_i (deg), tau_i (Julian years), phi_i (deg). */
const PERTURBERS: readonly (readonly [number, number, number])[] = [
  [0.0071, 2.2353, 49.409],
  [0.0057, 2.7543, 168.173],
  [0.0039, 1.1177, 191.837],
  [0.0037, 15.7866, 21.736],
  [0.0021, 2.1354, 15.704],
  [0.002, 2.4694, 95.528],
  [0.0018, 32.8493, 49.095],
]

export interface Mars24Planet extends TimeScales {
  /** B-1, reduced to [0, 360). */
  readonly meanAnomalyDeg: number
  /** B-2, reduced to [0, 360). */
  readonly fictionMeanSunDeg: number
  /** B-3 */
  readonly perturbersDeg: number
  /** B-4: nu - M */
  readonly equationOfCenterDeg: number
  /** B-5: areocentric solar longitude Ls, [0, 360). */
  readonly solarLongitudeDeg: number
  /** C-1 */
  readonly equationOfTimeDeg: number
  readonly equationOfTimeHours: number
  /** Mars Sol Date (C-2 bracket). */
  readonly marsSolDate: number
  /** C-2: mean solar time at the prime meridian (Airy Mean Time), hours [0, 24). */
  readonly mstHours: number
  /** C-5: subsolar planetographic longitude, degrees west [0, 360). */
  readonly subsolarLongitudeWestDeg: number
  /** D-1: planetographic solar declination. */
  readonly solarDeclinationDeg: number
  /** D-2 */
  readonly heliocentricDistanceAu: number
  /** D-3 */
  readonly heliocentricLongitudeDeg: number
  /** D-4 */
  readonly heliocentricLatitudeDeg: number
}

export interface Mars24Local {
  readonly lonWestDeg: number
  readonly latPlanetographicDeg: number
  /** C-3 */
  readonly lmstHours: number
  /** C-4 */
  readonly ltstHours: number
  /** Hour angle H = Lambda - Lambda_s, wrapped to [-180, 180). */
  readonly hourAngleDeg: number
  /** D-5 */
  readonly solarZenithDeg: number
  readonly solarElevationDeg: number
  /** D-6, clockwise from north, [0, 360). */
  readonly solarAzimuthDeg: number
}

/** Mars24 steps A-D (planet part) for a UTC instant. Pure; no validation. */
export function computeMars24Planet(utcMs: number): Mars24Planet {
  const ts = computeTimeScales(utcMs)
  const dt = ts.deltaTJ2000Days
  const M = 19.3871 + 0.52402073 * dt
  const alpha = 270.3871 + 0.524038496 * dt
  let pbs = 0
  for (const [A, tau, phi] of PERTURBERS) pbs += A * cosD((0.985626 * dt) / tau + phi)
  const eoc =
    (10.691 + 3.0e-7 * dt) * sinD(M) + 0.623 * sinD(2 * M) + 0.05 * sinD(3 * M) + 0.005 * sinD(4 * M) + 0.0005 * sinD(5 * M) + pbs
  const Ls = mod(alpha + eoc, 360)
  const eotDeg = 2.861 * sinD(2 * Ls) - 0.071 * sinD(4 * Ls) + 0.002 * sinD(6 * Ls) - eoc
  const msd = (ts.jdTt - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626
  const mst = mod(24 * msd, 24)
  const subsolar = mod(mst * 15 + eotDeg + 180, 360)
  const decl = Math.asin(0.42565 * sinD(Ls)) / D2R + 0.25 * sinD(Ls)
  const Mr = mod(M, 360)
  const rm = 1.52367934 * (1.00436 - 0.09309 * cosD(Mr) - 0.004336 * cosD(2 * Mr) - 0.00031 * cosD(3 * Mr) - 0.00003 * cosD(4 * Mr))
  const lM = mod(Ls + 85.061 - 0.015 * sinD(71 + 2 * Ls) - 5.5e-6 * dt, 360)
  const bM = -(1.8497 - 2.23e-5 * dt) * sinD(Ls - 144.5 + 2.57e-6 * dt)
  return {
    ...ts,
    meanAnomalyDeg: Mr,
    fictionMeanSunDeg: mod(alpha, 360),
    perturbersDeg: pbs,
    equationOfCenterDeg: eoc,
    solarLongitudeDeg: Ls,
    equationOfTimeDeg: eotDeg,
    equationOfTimeHours: eotDeg / 15,
    marsSolDate: msd,
    mstHours: mst,
    subsolarLongitudeWestDeg: subsolar,
    solarDeclinationDeg: decl,
    heliocentricDistanceAu: rm,
    heliocentricLongitudeDeg: lM,
    heliocentricLatitudeDeg: bM,
  }
}

/** Mars24 C-3..C-5 and D-5..D-6 for a site in Mars24 convention (west lon, planetographic lat). */
export function computeMars24Local(planet: Mars24Planet, lonWestDeg: number, latPlanetographicDeg: number): Mars24Local {
  const lmst = mod(planet.mstHours - lonWestDeg / 15, 24)
  const ltst = mod(lmst + planet.equationOfTimeHours, 24)
  const H = mod(lonWestDeg - planet.subsolarLongitudeWestDeg + 180, 360) - 180
  const d = planet.solarDeclinationDeg
  const phi = latPlanetographicDeg
  const cosZ = Math.min(1, Math.max(-1, sinD(d) * sinD(phi) + cosD(d) * cosD(phi) * cosD(H)))
  const Z = Math.acos(cosZ) / D2R
  const A = mod(Math.atan2(sinD(H), cosD(phi) * tanD(d) - sinD(phi) * cosD(H)) / D2R, 360)
  return {
    lonWestDeg: mod(lonWestDeg, 360),
    latPlanetographicDeg: phi,
    lmstHours: lmst,
    ltstHours: ltst,
    hourAngleDeg: H,
    solarZenithDeg: Z,
    solarElevationDeg: 90 - Z,
    solarAzimuthDeg: A,
  }
}

export interface MarsSolarTime extends Mars24Planet {
  readonly status: 'ok'
  readonly site: GeographicCoordinate
  readonly local: Mars24Local
  readonly ttMinusUtcExtrapolated: boolean
  readonly provenance: ResultProvenance
}

export type MarsSolarTimeResult = MarsSolarTime | EngineError<'INVALID_INPUT' | 'UNSUPPORTED_EPOCH'>

export function solarProvenance(): ResultProvenance {
  return {
    engine: ENGINE_NAME,
    engineVersion: ENGINE_VERSION,
    model: 'NASA GISS Mars24 algorithm (Allison & McEwen 2000, revised)',
    modelVersion: SOLAR_MODEL_VERSION,
    category: 'derived',
    inputs: ['UTC instant', 'site longitude (east) / planetocentric latitude', 'IERS leap-second table'],
  }
}

/**
 * Mars time and solar position for a site given in the terrain convention
 * (planetocentric latitude, east-positive longitude).
 */
export function calculateMarsSolarTime(utcMs: number, site: GeographicCoordinate): MarsSolarTimeResult {
  const bad = validateEpoch(utcMs)
  if (bad) return bad
  const v = validateGeographicCoordinate(site)
  if (v.status === 'error') return v
  const planet = computeMars24Planet(utcMs)
  const local = computeMars24Local(planet, eastToWestLongitude(v.value.lonEast), planetocentricToPlanetographicLatitude(v.value.latNorth))
  return {
    status: 'ok',
    ...planet,
    site: v.value,
    local,
    ttMinusUtcExtrapolated: planet.ttMinusUtcMethod === 'leap-second-table-extrapolated',
    provenance: solarProvenance(),
  }
}

/** Solar elevation (deg) at a site in terrain convention. No validation (internal hot path). */
export function solarElevationDeg(utcMs: number, lonWestDeg: number, latPlanetographicDeg: number): number {
  return computeMars24Local(computeMars24Planet(utcMs), lonWestDeg, latPlanetographicDeg).solarElevationDeg
}

export function ensureSolarInputs(
  utcMs: number,
  site: GeographicCoordinate,
): { lonWestDeg: number; latGraphicDeg: number; site: GeographicCoordinate } | EngineError<'INVALID_INPUT' | 'UNSUPPORTED_EPOCH'> {
  const bad = validateEpoch(utcMs)
  if (bad) return bad
  const v = validateGeographicCoordinate(site)
  if (v.status === 'error') return v
  return { lonWestDeg: eastToWestLongitude(v.value.lonEast), latGraphicDeg: planetocentricToPlanetographicLatitude(v.value.latNorth), site: v.value }
}

export function invalidModel(message: string, details?: Record<string, unknown>): EngineError<'MODEL_FAILURE'> {
  return engineError('MODEL_FAILURE', message, details)
}
