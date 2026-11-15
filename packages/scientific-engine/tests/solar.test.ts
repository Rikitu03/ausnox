import { describe, expect, it } from 'vitest'
import {
  MARS_HOUR_SECONDS,
  SOL_SECONDS,
  calculateDaylightWindow,
  calculateMarsSolarTime,
  computeMars24Local,
  computeMars24Planet,
  earthSecondsToMarsHours,
  findUtcForLocalTrueSolarTime,
  findUtcForSolarLongitude,
  formatMarsClock,
  isDaylightAt,
  marsHoursToEarthSeconds,
  planetographicToPlanetocentricLatitude,
  solarElevationDeg,
  ttMinusUtcSeconds,
  validateEpoch,
  westToEastLongitude,
  type Mars24Local,
  type Mars24Planet,
} from '../src/index.js'
import { writeEvidence } from './helpers/evidence.js'

/**
 * NASA GISS Mars24 worked examples, transcribed from
 * https://www.giss.nasa.gov/tools/mars24/help/algorithm.html (section II).
 * Site coordinates are Mars24's planetographic latitude and WEST longitude.
 */
interface Example {
  name: string
  millis: number
  lonWestDeg: number
  latGraphicDeg: number
  expected: [step: string, label: string, value: number, pick: (p: Mars24Planet, l: Mars24Local) => number][]
}

const EXAMPLES: Example[] = [
  {
    name: 'Near coincident Earth and Mars times (2000-01-06 00:00:00 UTC, 0 W 0 N)',
    millis: 947116800000,
    lonWestDeg: 0,
    latGraphicDeg: 0,
    expected: [
      ['A-2', 'JD UT', 2451549.5, (p) => p.jdUt],
      ['A-4', 'TT - UTC (s)', 64.184, (p) => p.ttMinusUtcS],
      ['A-5', 'JD TT', 2451549.50074, (p) => p.jdTt],
      ['A-6', 'dt J2000 (days)', 4.50074, (p) => p.deltaTJ2000Days],
      ['B-1', 'M (deg)', 21.74558, (p) => p.meanAnomalyDeg],
      ['B-2', 'alpha FMS (deg)', 272.74566, (p) => p.fictionMeanSunDeg],
      ['B-3', 'PBS (deg)', 0.00142, (p) => p.perturbersDeg],
      ['B-4', 'nu - M (deg)', 4.44193, (p) => p.equationOfCenterDeg],
      ['B-5', 'Ls (deg)', 277.18758, (p) => p.solarLongitudeDeg],
      ['C-1', 'EOT (deg)', -5.18774, (p) => p.equationOfTimeDeg],
      ['C-1', 'EOT (h)', -0.34585, (p) => p.equationOfTimeHours],
      ['C-2', 'MST (h)', 23.99425, (p) => p.mstHours],
      ['C-3', 'LMST (h)', 23.99425, (_p, l) => l.lmstHours],
      ['C-4', 'LTST (h)', 23.6484, (_p, l) => l.ltstHours],
      ['C-5', 'subsolar longitude (deg W)', 174.726, (p) => p.subsolarLongitudeWestDeg],
      ['D-1', 'solar declination (deg)', -25.22825, (p) => p.solarDeclinationDeg],
      ['D-2', 'heliocentric distance (AU)', 1.39358, (p) => p.heliocentricDistanceAu],
      ['D-3', 'heliocentric longitude (deg)', 2.26352, (p) => p.heliocentricLongitudeDeg],
      ['D-4', 'heliocentric latitude (deg)', -1.35957, (p) => p.heliocentricLatitudeDeg],
      ['D-5', 'solar zenith Z (deg)', 154.26182, (_p, l) => l.solarZenithDeg],
      ['D-6', 'solar azimuth A (deg)', 191.03905, (_p, l) => l.solarAzimuthDeg],
    ],
  },
  {
    name: 'MER-A Spirit landing (2004-01-03 13:46:31 UTC, 184.702 W -14.640 N)',
    millis: 1073137591000,
    lonWestDeg: 184.702,
    latGraphicDeg: -14.64,
    expected: [
      ['A-2', 'JD UT', 2453008.07397, (p) => p.jdUt],
      ['A-4', 'TT - UTC (s)', 64.184, (p) => p.ttMinusUtcS],
      ['A-5', 'JD TT', 2453008.07471, (p) => p.jdTt],
      ['A-6', 'dt J2000 (days)', 1463.07471, (p) => p.deltaTJ2000Days],
      ['B-1', 'M (deg, reduced from 786.06858)', 66.06858, (p) => p.meanAnomalyDeg],
      ['B-2', 'alpha FMS (deg, reduced from 1037.09457)', 317.09457, (p) => p.fictionMeanSunDeg],
      ['B-3', 'PBS (deg)', 0.01614, (p) => p.perturbersDeg],
      ['B-4', 'nu - M (deg)', 10.22959, (p) => p.equationOfCenterDeg],
      ['B-5', 'Ls (deg, reduced from 1047.32416)', 327.32416, (p) => p.solarLongitudeDeg],
      ['C-1', 'EOT (deg)', -12.77553, (p) => p.equationOfTimeDeg],
      ['C-1', 'EOT (h)', -0.8517, (p) => p.equationOfTimeHours],
      ['C-2', 'MST (h)', 13.16537, (p) => p.mstHours],
      ['C-3', 'LMST (h)', 0.8519, (_p, l) => l.lmstHours],
      ['C-4', 'LTST (h)', 0.00025, (_p, l) => l.ltstHours],
      ['C-5', 'subsolar longitude (deg W)', 4.705, (p) => p.subsolarLongitudeWestDeg],
      ['D-1', 'solar declination (deg)', -13.42065, (p) => p.solarDeclinationDeg],
      ['D-2', 'heliocentric distance (AU)', 1.47767, (p) => p.heliocentricDistanceAu],
      ['D-3', 'heliocentric longitude (deg)', 52.37564, (p) => p.heliocentricLongitudeDeg],
      ['D-4', 'heliocentric latitude (deg)', 0.08965, (p) => p.heliocentricLatitudeDeg],
      ['D-5', 'solar zenith Z (deg)', 151.93895, (_p, l) => l.solarZenithDeg],
      ['D-6', 'solar azimuth A (deg)', 179.99383, (_p, l) => l.solarAzimuthDeg],
    ],
  },
]

/** NASA publishes 5 decimals; 1e-5 allows the rounding of the published value plus float error. */
const STRICT_TOL = 1e-5
/** Acceptance targets from docs/SCIENTIFIC_MODELS.md section 9 (gate M1). */
const SPEC_LTST_TOL_S = 60
const SPEC_ANGLE_TOL_DEG = 0.1

// Mars24 formulas D-1, D-5, D-6 re-implemented here, independent of the engine code,
// to test whether a published value can be reproduced from the published inputs of its step.
const R = Math.PI / 180
const declFormula = (lsDeg: number) => Math.asin(0.42565 * Math.sin(lsDeg * R)) / R + 0.25 * Math.sin(lsDeg * R)
const zenithFormula = (d: number, phi: number, h: number) =>
  Math.acos(Math.sin(d * R) * Math.sin(phi * R) + Math.cos(d * R) * Math.cos(phi * R) * Math.cos(h * R)) / R
const azimuthFormula = (d: number, phi: number, h: number) =>
  (((Math.atan2(Math.sin(h * R), Math.cos(phi * R) * Math.tan(d * R) - Math.sin(phi * R) * Math.cos(h * R)) / R) % 360) + 360) % 360

interface Inconsistency {
  /** Value obtained by applying the published formula to the published inputs of the step. */
  formulaFromPublishedInputs: number
  inputs: string
}

/**
 * Published values that cannot be reproduced from NASA's own published inputs with NASA's
 * published formula (difference > 1e-5). For these rows the engine is compared with the
 * formula value instead, and the published value only has to meet the gate tolerance.
 */
const INCONSISTENT: Record<string, Inconsistency> = {
  'ex1 D-5': { formulaFromPublishedInputs: zenithFormula(-25.22825, 0, 0 - 174.726), inputs: 'published delta_s -25.22825, phi 0, H = 0 - 174.72600' },
  'spirit C-4': { formulaFromPublishedInputs: 0.8519 + -12.77553 / 15, inputs: 'published LMST 0.85190 h + EOT -12.77553 deg / 15' },
  'spirit D-1': { formulaFromPublishedInputs: declFormula(327.32416), inputs: 'published Ls 327.32416' },
  'spirit D-5': { formulaFromPublishedInputs: zenithFormula(declFormula(327.32416), -14.64, 184.702 - 4.705), inputs: 'delta_s from D-1 of published Ls, phi -14.640, H = 184.702 - 4.70500' },
  'spirit D-6': { formulaFromPublishedInputs: azimuthFormula(declFormula(327.32416), -14.64, 184.702 - 4.705), inputs: 'delta_s from D-1 of published Ls, phi -14.640, H = 184.702 - 4.70500' },
}

/** Gate tolerance of a row: 60 s for clock values, 0.1 deg for angles, equivalent for days/AU. */
function gateTolerance(label: string): number {
  if (label.includes('(h)')) return SPEC_LTST_TOL_S / MARS_HOUR_SECONDS
  if (label.includes('(s)')) return 1
  if (label.startsWith('JD') || label.startsWith('dt')) return SPEC_LTST_TOL_S / 86400
  if (label.includes('AU')) return 1e-4
  return SPEC_ANGLE_TOL_DEG
}

describe('Mars24 worked examples (gate M1)', () => {
  const evidence: unknown[] = []
  for (const ex of EXAMPLES) {
    it(ex.name, () => {
      const tag = ex.millis === 947116800000 ? 'ex1' : 'spirit'
      const p = computeMars24Planet(ex.millis)
      const l = computeMars24Local(p, ex.lonWestDeg, ex.latGraphicDeg)
      const rows = ex.expected.map(([step, label, value, pick]) => {
        const computed = pick(p, l)
        const diff = computed - value
        const known = label.includes('EOT (h)') ? undefined : INCONSISTENT[`${tag} ${step}`]
        const gateTol = gateTolerance(label)
        const row: Record<string, unknown> = {
          step,
          parameter: label,
          expected_published: value,
          computed,
          diff,
          strict_tolerance: STRICT_TOL,
          strict_status: Math.abs(diff) <= STRICT_TOL ? 'PASS' : 'FAIL',
          gate_tolerance: gateTol,
          gate_status: Math.abs(diff) <= gateTol ? 'PASS' : 'FAIL',
        }
        if (known) {
          row.published_value_inconsistent = {
            formula_value_from_published_inputs: known.formulaFromPublishedInputs,
            published_minus_formula: value - known.formulaFromPublishedInputs,
            engine_minus_formula: computed - known.formulaFromPublishedInputs,
            inputs: known.inputs,
          }
        }
        return { row, diff, known, gateTol, label, step }
      })
      for (const { diff, known, gateTol, label, step } of rows) {
        expect(Math.abs(diff), `${step} ${label} (gate)`).toBeLessThanOrEqual(gateTol)
        if (!known) {
          expect(Math.abs(diff), `${step} ${label}`).toBeLessThanOrEqual(STRICT_TOL)
        } else {
          // the published value really is irreproducible from its published inputs ...
          const pub = ex.expected.find(([s, lb]) => s === step && lb === label)![2]
          expect(Math.abs(pub - known.formulaFromPublishedInputs), `${step} published inconsistency`).toBeGreaterThan(STRICT_TOL)
          // ... and the engine reproduces the formula value
          expect(Math.abs(diff + pub - known.formulaFromPublishedInputs), `${step} engine vs formula`).toBeLessThanOrEqual(STRICT_TOL)
        }
      }
      const ltst = rows.find((r) => r.step === 'C-4')!
      const ltstDiffS = Math.abs(ltst.diff) * MARS_HOUR_SECONDS
      const angleDiff = Math.max(...rows.filter((r) => r.step === 'D-5' || r.step === 'D-6').map((r) => Math.abs(r.diff)))
      expect(ltstDiffS).toBeLessThanOrEqual(SPEC_LTST_TOL_S)
      expect(angleDiff).toBeLessThanOrEqual(SPEC_ANGLE_TOL_DEG)
      evidence.push({
        example: ex.name,
        input: { utc_ms: ex.millis, utc: new Date(ex.millis).toISOString(), lon_west_deg: ex.lonWestDeg, lat_planetographic_deg: ex.latGraphicDeg },
        rows: rows.map((r) => r.row),
        rows_within_strict_tolerance: rows.filter((r) => Math.abs(r.diff) <= STRICT_TOL).length,
        rows_total: rows.length,
        ltst_abs_diff_earth_s: ltstDiffS,
        max_solar_angle_abs_diff_deg: angleDiff,
        gate_tolerances: { ltst_s: SPEC_LTST_TOL_S, solar_angle_deg: SPEC_ANGLE_TOL_DEG },
        gate_status: rows.every((r) => Math.abs(r.diff) <= r.gateTol) ? 'PASS' : 'FAIL',
      })
      if (evidence.length === EXAMPLES.length) {
        writeEvidence('mars24_benchmark.json', {
          reference: 'https://www.giss.nasa.gov/tools/mars24/help/algorithm.html (section II, worked examples)',
          strict_tolerance: STRICT_TOL,
          note:
            'Rows marked published_value_inconsistent cannot be reproduced from the published inputs of the same step with the ' +
            'published formula; the engine matches the formula value to 1e-5 and the published value to the gate tolerance.',
          examples: evidence,
        })
      }
    })
  }

  it('terrain-convention wrapper reproduces the Spirit example after east/centric conversion', () => {
    const site = { lonEast: westToEastLongitude(184.702), latNorth: planetographicToPlanetocentricLatitude(-14.64) }
    expect(site.lonEast).toBeCloseTo(175.298, 12)
    const r = calculateMarsSolarTime(1073137591000, site)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.local.lonWestDeg).toBeCloseTo(184.702, 9)
    expect(r.local.latPlanetographicDeg).toBeCloseTo(-14.64, 9)
    // same values as the direct Mars24-convention computation (see the inconsistency notes above)
    const direct = computeMars24Local(computeMars24Planet(1073137591000), 184.702, -14.64)
    expect(r.local.ltstHours).toBeCloseTo(direct.ltstHours, 9)
    expect(r.local.solarZenithDeg).toBeCloseTo(direct.solarZenithDeg, 7)
    expect(Math.abs(r.local.ltstHours - 0.00025) * MARS_HOUR_SECONDS).toBeLessThan(SPEC_LTST_TOL_S)
    expect(formatMarsClock(r.local.lmstHours)).toBe('00:51:07')
    expect(r.ttMinusUtcExtrapolated).toBe(false)
  })
})

describe('time scales, units and conventions', () => {
  it('TT - UTC uses the leap-second table and the Mars24 pre-1972 polynomial', () => {
    expect(ttMinusUtcSeconds(Date.UTC(2000, 0, 6)).seconds).toBeCloseTo(64.184, 12)
    expect(ttMinusUtcSeconds(Date.UTC(2016, 11, 31, 23, 59, 59)).seconds).toBeCloseTo(68.184, 12)
    expect(ttMinusUtcSeconds(Date.UTC(2017, 0, 1)).seconds).toBeCloseTo(69.184, 12)
    expect(ttMinusUtcSeconds(Date.UTC(1972, 0, 1)).seconds).toBeCloseTo(42.184, 12)
    const pre = ttMinusUtcSeconds(Date.UTC(1970, 0, 1))
    expect(pre.method).toBe('mars24-polynomial-pre-1972')
    expect(pre.seconds).toBeCloseTo(43.5549, 3)
    expect(ttMinusUtcSeconds(Date.UTC(2026, 10, 14)).method).toBe('leap-second-table')
    expect(ttMinusUtcSeconds(Date.UTC(2030, 0, 1)).method).toBe('leap-second-table-extrapolated')
  })

  it('validates epochs and sites explicitly', () => {
    expect(validateEpoch(Number.NaN)?.code).toBe('INVALID_INPUT')
    expect(validateEpoch(Date.UTC(1900, 0, 1))?.code).toBe('UNSUPPORTED_EPOCH')
    expect(validateEpoch(Date.UTC(2100, 0, 1))?.code).toBe('UNSUPPORTED_EPOCH')
    expect(validateEpoch(Date.UTC(2023, 0, 1))).toBeNull()
    const r = calculateMarsSolarTime(Date.UTC(2023, 0, 1), { lonEast: 77.4, latNorth: 95 })
    expect(r.status === 'error' && r.code).toBe('INVALID_INPUT')
    const w = calculateDaylightWindow(Date.UTC(1800, 0, 1), { lonEast: 77.4, latNorth: 18.4 })
    expect(w.status === 'error' && w.code).toBe('UNSUPPORTED_EPOCH')
  })

  it('a sol is 88 775.244 Earth seconds and a Mars hour is not an Earth hour', () => {
    expect(Math.abs(SOL_SECONDS - 88775.244)).toBeLessThan(0.001)
    expect(MARS_HOUR_SECONDS).toBeCloseTo(3698.9685, 3)
    expect(marsHoursToEarthSeconds(24)).toBeCloseTo(SOL_SECONDS, 9)
    expect(earthSecondsToMarsHours(3600)).toBeCloseTo(0.97324, 5)
    expect(earthSecondsToMarsHours(marsHoursToEarthSeconds(7.25))).toBeCloseTo(7.25, 12)
    const t = Date.UTC(2023, 0, 28, 12)
    const a = computeMars24Planet(t)
    const b = computeMars24Planet(t + SOL_SECONDS * 1000)
    expect(b.marsSolDate - a.marsSolDate).toBeCloseTo(1, 9)
    expect(b.mstHours).toBeCloseTo(a.mstHours, 6)
  })

  it('east-positive longitude: 15 deg further east is one Mars hour later', () => {
    const t = Date.UTC(2023, 0, 28, 12)
    const a = calculateMarsSolarTime(t, { lonEast: 77.4, latNorth: 18.4 })
    const b = calculateMarsSolarTime(t, { lonEast: 92.4, latNorth: 18.4 })
    const c = calculateMarsSolarTime(t, { lonEast: 77.4 - 360, latNorth: 18.4 })
    expect(a.status === 'ok' && b.status === 'ok' && c.status === 'ok').toBe(true)
    if (a.status !== 'ok' || b.status !== 'ok' || c.status !== 'ok') return
    expect(((b.local.lmstHours - a.local.lmstHours + 24) % 24)).toBeCloseTo(1, 9)
    expect(c.local.lmstHours).toBeCloseTo(a.local.lmstHours, 9)
    expect(a.local.lonWestDeg).toBeCloseTo(282.6, 9)
  })

  it('rover clock cross-check: LMST runs at the Perseverance mission-clock rate and sol numbers match', () => {
    // Perseverance raw-image metadata (mars.nasa.gov raw images API):
    //   ZL0_0490_0710454343_209EBY_N0261004ZCAM05068_1100LMJ  2022-07-07T08:35:13.198Z  Sol-00490M16:26:01.409
    //   ZL0_0690_0728197525_035EBY_N0321184ZCAM08692_0340LMJ  2023-01-28T17:15:12.065Z  Sol-00690M13:13:48.530
    const landing = { lonEast: 77.45088572, latNorth: 18.44462715 } // first MMGIS localization, sol 13
    const stamps = [
      { utc: Date.parse('2022-07-07T08:35:13.198Z'), sol: 490, lmst: 16 + 26 / 60 + 1.409 / 3600 },
      { utc: Date.parse('2023-01-28T17:15:12.065Z'), sol: 690, lmst: 13 + 13 / 60 + 48.53 / 3600 },
    ]
    const offsets = stamps.map((s) => {
      const r = calculateMarsSolarTime(s.utc, landing)
      if (r.status !== 'ok') throw new Error('solar model failed')
      const localMsd = r.marsSolDate + landing.lonEast / 360
      expect(Math.floor(localMsd) - 52304).toBe(s.sol)
      return (r.local.lmstHours - s.lmst) * 3600 // Mars seconds
    })
    // A constant offset means the same rate over 200 sols; its size corresponds to a ~0.02 deg
    // difference between this site and the longitude the mission clock is referenced to.
    expect(Math.abs(offsets[0]! - offsets[1]!)).toBeLessThan(0.1)
    expect(Math.abs(offsets[0]!)).toBeLessThan(10)
  })
})

describe('geometric daylight window', () => {
  const threeForks = { lonEast: 77.40844668, latNorth: 18.45337179 }

  it('sunrise and sunset are true zero-elevation crossings around solar noon', () => {
    const w = calculateDaylightWindow(Date.UTC(2023, 0, 28, 12), threeForks)
    expect(w.status).toBe('ok')
    if (w.status !== 'ok' || w.kind !== 'normal') throw new Error('expected a normal day')
    const lonW = 360 - threeForks.lonEast
    const r1 = isDaylightAt(w.sunriseUtcMs! - 60_000, threeForks)
    const r2 = isDaylightAt(w.sunriseUtcMs! + 60_000, threeForks)
    const r3 = isDaylightAt(w.sunsetUtcMs! - 60_000, threeForks)
    const r4 = isDaylightAt(w.sunsetUtcMs! + 60_000, threeForks)
    expect([r1, r2, r3, r4].map((r) => r.status === 'ok' && r.daylight)).toEqual([false, true, true, false])
    for (const t of [w.sunriseUtcMs!, w.sunsetUtcMs!]) {
      const e = isDaylightAt(t, threeForks)
      expect(e.status === 'ok' && Math.abs(e.elevationDeg)).toBeLessThan(1e-3)
    }
    expect(w.solStartUtcMs).toBeLessThan(w.sunriseUtcMs!)
    expect(w.sunriseUtcMs!).toBeLessThan(w.solarNoonUtcMs)
    expect(w.solarNoonUtcMs).toBeLessThan(w.sunsetUtcMs!)
    expect(w.sunsetUtcMs!).toBeLessThan(w.solEndUtcMs)
    // A true solar sol differs from the 88 775.244 s mean sol by the change in the equation of
    // time over the sol: duration = SOL_SECONDS * (1 - dEOT_h / 24).
    const dEot = computeMars24Planet(w.solEndUtcMs).equationOfTimeHours - computeMars24Planet(w.solStartUtcMs).equationOfTimeHours
    const trueSolS = (w.solEndUtcMs - w.solStartUtcMs) / 1000
    expect(Math.abs(trueSolS - SOL_SECONDS * (1 - dEot / 24))).toBeLessThan(0.01)
    expect(Math.abs(trueSolS - SOL_SECONDS)).toBeLessThan(60)
    // consistent with the hour-angle estimate cos(H0) = -tan(phi) tan(delta)
    const phi = (Math.atan((3396190 / 3376200) ** 2 * Math.tan((threeForks.latNorth * Math.PI) / 180)) * 180) / Math.PI
    const d = w.solarDeclinationDegAtNoon
    const H0h = (Math.acos(-Math.tan((phi * Math.PI) / 180) * Math.tan((d * Math.PI) / 180)) * 180) / Math.PI / 15
    expect(Math.abs(w.sunriseLtstHours! - (12 - H0h))).toBeLessThan(0.02)
    expect(Math.abs(w.sunsetLtstHours! - (12 + H0h))).toBeLessThan(0.02)
    expect(w.daylightDurationS).toBeCloseTo((w.sunsetLtstHours! - w.sunriseLtstHours!) * MARS_HOUR_SECONDS, -2)
    expect(w.noonElevationDeg).toBeGreaterThan(0)
    expect(solarElevationDeg(w.solarNoonUtcMs, lonW, phi)).toBeCloseTo(w.noonElevationDeg, 6)
    expect(w.approximations.length).toBeGreaterThanOrEqual(3)
  })

  it('handles a sol that spans UTC midnight and consecutive sols without gaps', () => {
    const w = calculateDaylightWindow(Date.UTC(2022, 6, 7, 12), threeForks)
    expect(w.status === 'ok' && w.kind).toBe('normal')
    if (w.status !== 'ok') return
    expect(new Date(w.sunriseUtcMs!).getUTCDate()).toBe(6)
    expect(new Date(w.sunsetUtcMs!).getUTCDate()).toBe(7)
    const next = calculateDaylightWindow(w.solEndUtcMs + 1000, threeForks)
    const prev = calculateDaylightWindow(w.solStartUtcMs - 1000, threeForks)
    expect(next.status === 'ok' && Math.abs(next.solStartUtcMs - w.solEndUtcMs)).toBeLessThan(1)
    expect(prev.status === 'ok' && Math.abs(prev.solEndUtcMs - w.solStartUtcMs)).toBeLessThan(1)
    const same = calculateDaylightWindow(w.solEndUtcMs - 1000, threeForks)
    // same sol; the iterative solve converges to within microseconds from a different start
    expect(same.status === 'ok' && Math.abs(same.solStartUtcMs - w.solStartUtcMs)).toBeLessThan(1)
  })

  it('polar day and polar night branches near the northern summer solstice', () => {
    const solstice = findUtcForSolarLongitude(90, Date.UTC(2022, 0, 1))
    expect(solstice.status).toBe('ok')
    if (solstice.status !== 'ok') return
    expect(computeMars24Planet(solstice.utcMs).solarLongitudeDeg).toBeCloseTo(90, 6)
    const north = calculateDaylightWindow(solstice.utcMs, { lonEast: 0, latNorth: 85 })
    const south = calculateDaylightWindow(solstice.utcMs, { lonEast: 0, latNorth: -85 })
    const eq = calculateDaylightWindow(solstice.utcMs, { lonEast: 0, latNorth: 0 })
    expect(north.status === 'ok' && north.kind).toBe('polar-day')
    expect(south.status === 'ok' && south.kind).toBe('polar-night')
    expect(south.status === 'ok' && south.daylightDurationS).toBe(0)
    expect(eq.status === 'ok' && eq.kind).toBe('normal')
  })

  it('maps a local true solar time and a season to UTC instants', () => {
    const near = Date.UTC(2023, 0, 28, 12)
    const r = findUtcForLocalTrueSolarTime(threeForks, 9, near)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    const s = calculateMarsSolarTime(r.utcMs, threeForks)
    expect(s.status === 'ok' && s.local.ltstHours).toBeCloseTo(9, 6)
    const w = calculateDaylightWindow(near, threeForks)
    expect(w.status === 'ok' && r.utcMs >= w.solStartUtcMs && r.utcMs < w.solEndUtcMs).toBe(true)
    expect(findUtcForLocalTrueSolarTime(threeForks, 24, near).status).toBe('error')
    const ls = findUtcForSolarLongitude(0, Date.UTC(2023, 0, 1))
    expect(ls.status === 'ok' && ls.utcMs).toBeGreaterThanOrEqual(Date.UTC(2023, 0, 1))
    expect(ls.status === 'ok' && computeMars24Planet(ls.utcMs).solarLongitudeDeg).toBeCloseTo(0, 5)
    expect(findUtcForSolarLongitude(400, near).status).toBe('error')
  })

  it('is deterministic', () => {
    const a = calculateDaylightWindow(Date.UTC(2023, 0, 28, 12), threeForks)
    const b = calculateDaylightWindow(Date.UTC(2023, 0, 28, 12), threeForks)
    expect(a).toEqual(b)
  })
})
