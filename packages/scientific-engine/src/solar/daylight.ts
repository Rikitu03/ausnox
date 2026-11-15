/**
 * Geometric daylight window from the Mars24 solar position.
 *
 * Definition: sunrise/sunset are the instants when the centre of the Sun crosses 0 deg
 * elevation for the site's planetographic latitude, computed with the full Mars24 chain at
 * each trial instant (so declination and equation-of-time changes during the sol are
 * included). Not modelled: atmospheric refraction, solar disk radius, dust/twilight,
 * terrain horizon and shadows.
 *
 * The first guess uses cos(H0) = -tan(phi) tan(delta) (SCIENTIFIC_MODELS.md §6.5); the
 * crossing is then located by bisection on the Mars24 elevation to < 1 ms.
 */
import type { GeographicCoordinate } from '../contracts/geo.js'
import { engineError, type EngineError } from '../contracts/errors.js'
import type { ResultProvenance } from '../contracts/provenance.js'
import { MARS_HOUR_SECONDS, SOL_SECONDS, wrapHours12 } from './conversions.js'
import { computeMars24Local, computeMars24Planet, ensureSolarInputs, solarElevationDeg, solarProvenance } from './mars24.js'
import { SUPPORTED_EPOCH_END_UTC_MS, SUPPORTED_EPOCH_START_UTC_MS } from './timeScales.js'

const MARS_HOUR_MS = MARS_HOUR_SECONDS * 1000
const SOL_MS = SOL_SECONDS * 1000

export const DAYLIGHT_APPROXIMATIONS: readonly string[] = [
  'Geometric sunrise/sunset: centre of the Sun at 0 deg elevation.',
  'No atmospheric refraction, solar-disk radius, dust opacity or twilight.',
  'No terrain horizon or shadows (a crater wall or ridge can hide the Sun earlier).',
  'Planetographic latitude on the IAU 2000 ellipsoid; Mars24 (AM2000) orbital model.',
]

export interface DaylightWindowOk {
  readonly status: 'ok'
  readonly kind: 'normal' | 'polar-day' | 'polar-night'
  readonly site: GeographicCoordinate
  /** Local true midnight that starts the sol containing the reference instant. */
  readonly solStartUtcMs: number
  readonly solEndUtcMs: number
  readonly solarNoonUtcMs: number
  /** null for polar day/night. */
  readonly sunriseUtcMs: number | null
  readonly sunsetUtcMs: number | null
  readonly daylightDurationS: number
  readonly sunriseLtstHours: number | null
  readonly sunsetLtstHours: number | null
  readonly solarLongitudeDegAtNoon: number
  readonly solarDeclinationDegAtNoon: number
  readonly noonElevationDeg: number
  readonly marsSolDateAtNoon: number
  readonly ttMinusUtcExtrapolated: boolean
  readonly approximations: readonly string[]
  readonly provenance: ResultProvenance
}

export type DaylightWindowResult = DaylightWindowOk | EngineError<'INVALID_INPUT' | 'UNSUPPORTED_EPOCH' | 'MODEL_FAILURE'>

function ltstAt(utcMs: number, lonW: number, latG: number): number {
  return computeMars24Local(computeMars24Planet(utcMs), lonW, latG).ltstHours
}

/** Instant near `guessMs` at which LTST equals `targetHours` (Newton on the near-linear clock). */
function solveLtst(targetHours: number, guessMs: number, lonW: number, latG: number): number {
  let t = guessMs
  for (let k = 0; k < 12; k++) {
    const diff = wrapHours12(targetHours - ltstAt(t, lonW, latG))
    t += diff * MARS_HOUR_MS
    if (Math.abs(diff) < 1e-10) break
  }
  return t
}

function inRange(t: number): boolean {
  return t >= SUPPORTED_EPOCH_START_UTC_MS && t < SUPPORTED_EPOCH_END_UTC_MS
}

/** Bisection for elevation(t) = 0 with elevation(lo) and elevation(hi) of opposite sign. */
function bisectCrossing(lo: number, hi: number, lonW: number, latG: number): number {
  let eLo = solarElevationDeg(lo, lonW, latG)
  for (let k = 0; k < 64 && hi - lo > 0.5; k++) {
    const mid = 0.5 * (lo + hi)
    const eMid = solarElevationDeg(mid, lonW, latG)
    if (eMid === 0) return mid
    if (eMid < 0 === eLo < 0) {
      lo = mid
      eLo = eMid
    } else {
      hi = mid
    }
  }
  return 0.5 * (lo + hi)
}

/** Find a crossing near `guess` inside [minT, maxT] by expanding a bracket. */
function findCrossing(guess: number, minT: number, maxT: number, lonW: number, latG: number): number | null {
  for (const half of [0.25, 0.5, 1, 2, 4, 6]) {
    const lo = Math.max(minT, guess - half * MARS_HOUR_MS)
    const hi = Math.min(maxT, guess + half * MARS_HOUR_MS)
    const a = solarElevationDeg(lo, lonW, latG)
    const b = solarElevationDeg(hi, lonW, latG)
    if (a < 0 !== b < 0) return bisectCrossing(lo, hi, lonW, latG)
  }
  return null
}

/** Local true midnight at or before `utcMs`. */
export function localTrueMidnightBefore(utcMs: number, lonW: number, latG: number): number {
  const ltst = ltstAt(utcMs, lonW, latG)
  let m = solveLtst(0, utcMs - ltst * MARS_HOUR_MS, lonW, latG)
  if (m > utcMs) m = solveLtst(0, m - SOL_MS, lonW, latG)
  return m
}

/**
 * Daylight window of the local true sol that contains `utcMs` at `site`
 * (planetocentric latitude, east-positive longitude).
 */
export function calculateDaylightWindow(utcMs: number, site: GeographicCoordinate): DaylightWindowResult {
  const inp = ensureSolarInputs(utcMs, site)
  if ('status' in inp) return inp
  const { lonWestDeg: lonW, latGraphicDeg: latG } = inp
  const solStart = localTrueMidnightBefore(utcMs, lonW, latG)
  const solEnd = solveLtst(0, solStart + SOL_MS, lonW, latG)
  const noon = solveLtst(12, solStart + 12 * MARS_HOUR_MS, lonW, latG)
  if (!inRange(solStart) || !inRange(solEnd)) {
    return engineError('UNSUPPORTED_EPOCH', 'The sol extends outside the supported epoch range.')
  }
  const pNoon = computeMars24Planet(noon)
  const noonLocal = computeMars24Local(pNoon, lonW, latG)
  const base = {
    status: 'ok' as const,
    site: inp.site,
    solStartUtcMs: solStart,
    solEndUtcMs: solEnd,
    solarNoonUtcMs: noon,
    solarLongitudeDegAtNoon: pNoon.solarLongitudeDeg,
    solarDeclinationDegAtNoon: pNoon.solarDeclinationDeg,
    noonElevationDeg: noonLocal.solarElevationDeg,
    marsSolDateAtNoon: pNoon.marsSolDate,
    ttMinusUtcExtrapolated: pNoon.ttMinusUtcMethod === 'leap-second-table-extrapolated',
    approximations: DAYLIGHT_APPROXIMATIONS,
    provenance: solarProvenance(),
  }
  const cosH0 = -Math.tan((latG * Math.PI) / 180) * Math.tan((pNoon.solarDeclinationDeg * Math.PI) / 180)
  const midnightElev = solarElevationDeg(solStart, lonW, latG)
  if (cosH0 <= -1 && midnightElev > 0) {
    return { ...base, kind: 'polar-day', sunriseUtcMs: null, sunsetUtcMs: null, sunriseLtstHours: null, sunsetLtstHours: null, daylightDurationS: (solEnd - solStart) / 1000 }
  }
  if (cosH0 >= 1 && noonLocal.solarElevationDeg < 0) {
    return { ...base, kind: 'polar-night', sunriseUtcMs: null, sunsetUtcMs: null, sunriseLtstHours: null, sunsetLtstHours: null, daylightDurationS: 0 }
  }
  const H0h = (Math.acos(Math.min(1, Math.max(-1, cosH0))) * 180) / Math.PI / 15
  const rise = findCrossing(noon - H0h * MARS_HOUR_MS, solStart, noon, lonW, latG)
  const set = findCrossing(noon + H0h * MARS_HOUR_MS, noon, solEnd, lonW, latG)
  if (rise === null || set === null) {
    return engineError('MODEL_FAILURE', 'Sunrise or sunset could not be located for this sol (near-polar edge case).', {
      cosH0,
      noonElevationDeg: noonLocal.solarElevationDeg,
    })
  }
  return {
    ...base,
    kind: 'normal',
    sunriseUtcMs: rise,
    sunsetUtcMs: set,
    daylightDurationS: (set - rise) / 1000,
    sunriseLtstHours: ltstAt(rise, lonW, latG),
    sunsetLtstHours: ltstAt(set, lonW, latG),
  }
}

/** True when the Sun's centre is above the geometric horizon at `utcMs`. */
export function isDaylightAt(utcMs: number, site: GeographicCoordinate): { status: 'ok'; daylight: boolean; elevationDeg: number } | EngineError {
  const inp = ensureSolarInputs(utcMs, site)
  if ('status' in inp) return inp
  const e = solarElevationDeg(utcMs, inp.lonWestDeg, inp.latGraphicDeg)
  return { status: 'ok', daylight: e > 0, elevationDeg: e }
}

/**
 * UTC instant, on the local true sol containing `nearUtcMs`, at which LTST = `ltstHours`.
 * Used to turn a "start at 09:00 LTST" assumption into an absolute simulated start time.
 */
export function findUtcForLocalTrueSolarTime(
  site: GeographicCoordinate,
  ltstHours: number,
  nearUtcMs: number,
): { status: 'ok'; utcMs: number } | EngineError<'INVALID_INPUT' | 'UNSUPPORTED_EPOCH'> {
  if (typeof ltstHours !== 'number' || !(ltstHours >= 0 && ltstHours < 24)) {
    return engineError('INVALID_INPUT', 'Local true solar time must be in [0, 24) Mars hours.')
  }
  const inp = ensureSolarInputs(nearUtcMs, site)
  if ('status' in inp) return inp
  const solStart = localTrueMidnightBefore(nearUtcMs, inp.lonWestDeg, inp.latGraphicDeg)
  const t = solveLtst(ltstHours, solStart + ltstHours * MARS_HOUR_MS, inp.lonWestDeg, inp.latGraphicDeg)
  return { status: 'ok', utcMs: t }
}

/**
 * First instant at or after `nearUtcMs` at which the areocentric solar longitude equals `lsDeg`
 * (Newton iteration on Mars24 Ls(t); maps "season" scenarios to dates).
 */
export function findUtcForSolarLongitude(lsDeg: number, nearUtcMs: number): { status: 'ok'; utcMs: number } | EngineError {
  if (typeof lsDeg !== 'number' || !(lsDeg >= 0 && lsDeg < 360)) {
    return engineError('INVALID_INPUT', 'Solar longitude must be in [0, 360) degrees.')
  }
  const bad = ensureSolarInputs(nearUtcMs, { lonEast: 0, latNorth: 0 })
  if ('status' in bad) return bad
  const DAY = 86_400_000
  const newton = (guess: number): number => {
    let t = guess
    for (let k = 0; k < 30; k++) {
      const ls = computeMars24Planet(t).solarLongitudeDeg
      const err = ((lsDeg - ls + 540) % 360) - 180
      const rate = (computeMars24Planet(t + DAY).solarLongitudeDeg - ls + 360) % 360
      t += (err / rate) * DAY
      if (Math.abs(err) < 1e-9) break
    }
    return t
  }
  const ls0 = computeMars24Planet(nearUtcMs).solarLongitudeDeg
  let t = newton(nearUtcMs + (((lsDeg - ls0 + 360) % 360) / 0.524) * DAY)
  // converged on the crossing before the reference instant: solve again one Mars year later
  if (t < nearUtcMs - 1000) t = newton(t + 686.98 * DAY)
  if (!inRange(t)) return engineError('UNSUPPORTED_EPOCH', 'The requested season falls outside the supported epoch range.')
  return { status: 'ok', utcMs: t }
}
