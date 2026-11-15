/**
 * Mission feasibility and return margin (SCIENTIFIC_MODELS.md §7).
 *
 *   now             = mission start + elapsed simulated time
 *   window closes   = min(geometric sunset [daylight-only policy], start + max EVA [if enabled])
 *   return margin   = window closes - now - remaining mission work - reserve
 *
 * Verdicts: any known violation -> infeasible; otherwise any missing/invalid/unverified
 * input -> indeterminate; otherwise feasible. A drawable path alone never implies feasible.
 */
import type { ResultProvenance } from '../contracts/provenance.js'
import type { RoundTripResult } from '../routing/types.js'
import type { DaylightWindowResult } from '../solar/daylight.js'
import type { TerrainVerification } from '../terrain/dataset.js'
import { ENGINE_NAME, ENGINE_VERSION, MISSION_MODEL_VERSION } from '../version.js'
import { validateMissionAssumptions, type MissionAssumptions } from './assumptions.js'
import { buildMissionTimeline, type MissionDurations, type MissionTimeline } from './timeline.js'

export type Feasibility = 'feasible' | 'infeasible' | 'indeterminate'

export const FEASIBILITY_LABELS: Readonly<Record<Feasibility, string>> = Object.freeze({
  feasible: 'Feasible under selected assumptions',
  infeasible: 'Infeasible under selected assumptions',
  indeterminate: 'Indeterminate',
})

export const MISSION_DISCLAIMER =
  'Educational Marswalk planning simulation. Real NASA/USGS terrain data; mission constraints are illustrative. Not for operational navigation.'

export type ConstraintId =
  | 'assumptions'
  | 'terrain-verification'
  | 'route'
  | 'solar-model'
  | 'starts-in-daylight'
  | 'daylight-margin'
  | 'eva-margin'
  | 'turnaround-warning'
  | 'progress'

export type ConstraintStatus = 'pass' | 'violated' | 'unknown' | 'warning' | 'not-applicable'

export interface ConstraintCheck {
  readonly id: ConstraintId
  readonly status: ConstraintStatus
  readonly title: string
  readonly detail: string
  /** Margin or offending quantity in Earth seconds, when meaningful. */
  readonly valueS?: number
}

export interface MissionProgress {
  /** Simulated seconds since mission start (including holds). */
  readonly elapsedS: number
  /** Remaining planned work from the current position, seconds. */
  readonly remainingWorkS: number
}

export interface FeasibilityInput {
  readonly route: RoundTripResult | null
  readonly daylight: DaylightWindowResult | null
  readonly terrain: { readonly version: string; readonly verification: TerrainVerification } | null
  readonly assumptions: MissionAssumptions
  readonly missionStartUtcMs: number
  readonly progress?: MissionProgress | null
}

export interface MissionAssessment {
  readonly feasibility: Feasibility
  readonly label: string
  readonly durations: MissionDurations | null
  readonly timeline: MissionTimeline | null
  readonly missionStartUtcMs: number
  readonly elapsedS: number
  readonly evaluatedAtUtcMs: number
  readonly remainingWorkS: number | null
  readonly projectedReturnUtcMs: number | null
  readonly window: {
    readonly sunriseUtcMs: number | null
    readonly sunsetUtcMs: number | null
    readonly evaDeadlineUtcMs: number | null
    readonly closesUtcMs: number | null
    readonly limitedBy: 'sunset' | 'max-eva' | null
  }
  readonly reserveS: number
  /** window closes - now - remaining work - reserve; null when no time limit applies or inputs are missing. */
  readonly returnMarginS: number | null
  readonly turnaroundWarning: boolean
  readonly checks: readonly ConstraintCheck[]
  readonly bindingConstraint: ConstraintId | null
  readonly explanation: readonly string[]
  readonly assumptions: MissionAssumptions
  readonly provenance: ResultProvenance
  readonly disclaimer: string
}

const fmtMin = (s: number) => `${(s / 60).toFixed(1)} min`

export function evaluateMissionFeasibility(input: FeasibilityInput): MissionAssessment {
  const checks: ConstraintCheck[] = []
  const a = input.assumptions
  const start = input.missionStartUtcMs
  const add = (c: ConstraintCheck) => checks.push(c)

  // 1. assumptions
  const problems = validateMissionAssumptions(a)
  const startValid = typeof start === 'number' && Number.isFinite(start)
  if (problems.length > 0 || !startValid) {
    add({
      id: 'assumptions',
      status: 'unknown',
      title: 'Mission assumptions invalid',
      detail: [...problems, ...(startValid ? [] : ['mission start time must be a finite UTC instant'])].join('; '),
    })
  } else {
    add({ id: 'assumptions', status: 'pass', title: 'Mission assumptions valid', detail: 'All simulated assumptions are within their documented ranges.' })
  }
  const assumptionsOk = problems.length === 0 && startValid

  // 2. terrain verification
  if (!input.terrain) {
    add({ id: 'terrain-verification', status: 'unknown', title: 'Terrain dataset missing', detail: 'No terrain dataset was supplied.' })
  } else if (!input.terrain.verification.verifiedForFeasibility) {
    add({
      id: 'terrain-verification',
      status: 'unknown',
      title: 'Terrain dataset not verified',
      detail: `Pipeline validation status is "${input.terrain.verification.pipelineValidation}".`,
    })
  } else {
    add({ id: 'terrain-verification', status: 'pass', title: 'Terrain dataset verified', detail: 'Pipeline validation passed for this terrain asset.' })
  }

  // 3. route
  let timeline: MissionTimeline | null = null
  const r = input.route
  if (!r) {
    add({ id: 'route', status: 'unknown', title: 'No route', detail: 'No round-trip route has been computed.' })
  } else if (r.status === 'error') {
    const known = r.code === 'NO_ROUTE' || r.code === 'UNSUPPORTED_SLOPE'
    add({ id: 'route', status: known ? 'violated' : 'unknown', title: known ? 'No legal route' : 'Route unavailable', detail: r.message })
  } else if (input.terrain && r.route.datasetVersion !== input.terrain.version) {
    add({ id: 'route', status: 'unknown', title: 'Route is stale', detail: 'The route was computed on a different terrain dataset version.' })
  } else if (assumptionsOk && r.route.maxSlopeDeg !== a.maxSlopeDeg) {
    add({
      id: 'route',
      status: 'unknown',
      title: 'Route is stale',
      detail: `The route used a ${r.route.maxSlopeDeg} deg slope limit but the assumptions now say ${a.maxSlopeDeg} deg; recalculate.`,
    })
  } else {
    add({
      id: 'route',
      status: 'pass',
      title: 'Round trip routed',
      detail: `Outbound ${r.route.outbound.metrics.planimetricDistanceM.toFixed(0)} m and independent return ${r.route.inbound.metrics.planimetricDistanceM.toFixed(0)} m within the ${r.route.maxSlopeDeg} deg limit.`,
    })
    if (assumptionsOk) {
      const tl = buildMissionTimeline(r.route, a)
      if (tl.status === 'ok') timeline = tl.timeline
      else add({ id: 'assumptions', status: 'unknown', title: 'Timeline could not be built', detail: tl.message })
    }
  }

  // 4. progress
  const total = timeline ? timeline.totalS : null
  let elapsed = 0
  let remaining: number | null = total
  if (input.progress) {
    const { elapsedS, remainingWorkS } = input.progress
    if (!Number.isFinite(elapsedS) || elapsedS < 0 || !Number.isFinite(remainingWorkS) || remainingWorkS < 0) {
      add({ id: 'progress', status: 'unknown', title: 'Invalid simulation progress', detail: 'Elapsed and remaining times must be finite and non-negative.' })
      remaining = null
    } else {
      elapsed = elapsedS
      remaining = timeline ? remainingWorkS : null
    }
  }
  const now = startValid ? start + elapsed * 1000 : NaN

  // 5. daylight
  let sunrise: number | null = null
  let sunset: number | null = null
  if (a?.daylightPolicy === 'ignore-daylight') {
    add({ id: 'solar-model', status: 'not-applicable', title: 'Daylight not constrained', detail: 'Daylight policy is disabled for this simulation.' })
  } else {
    const d = input.daylight
    if (!d) {
      add({ id: 'solar-model', status: 'unknown', title: 'Daylight unknown', detail: 'No daylight window was supplied.' })
    } else if (d.status === 'error') {
      add({ id: 'solar-model', status: 'unknown', title: 'Solar model unavailable', detail: d.message })
    } else if (startValid && (start < d.solStartUtcMs || start >= d.solEndUtcMs)) {
      add({ id: 'solar-model', status: 'unknown', title: 'Daylight window is for another sol', detail: 'Recompute the daylight window for the mission start time.' })
    } else {
      add({ id: 'solar-model', status: 'pass', title: 'Mars24 daylight model', detail: 'Geometric daylight window computed with the Mars24 algorithm.' })
      if (d.kind === 'polar-night') {
        add({ id: 'starts-in-daylight', status: 'violated', title: 'No daylight this sol', detail: 'The Sun does not rise at this location on this sol.' })
      } else if (d.kind === 'polar-day') {
        add({ id: 'starts-in-daylight', status: 'pass', title: 'Continuous daylight', detail: 'The Sun does not set on this sol.' })
      } else {
        sunrise = d.sunriseUtcMs
        sunset = d.sunsetUtcMs
        if (startValid && sunrise !== null && sunset !== null && (start < sunrise || start >= sunset)) {
          add({
            id: 'starts-in-daylight',
            status: 'violated',
            title: 'Starts in darkness',
            detail: start < sunrise ? `Start is ${fmtMin((sunrise - start) / 1000)} before geometric sunrise.` : 'Start is after geometric sunset.',
          })
        } else {
          add({ id: 'starts-in-daylight', status: 'pass', title: 'Starts in daylight', detail: 'Mission start is between geometric sunrise and sunset.' })
        }
      }
    }
  }

  // 6. margins
  const reserve = assumptionsOk ? a.reserveS : NaN
  const evaDeadline = assumptionsOk && a.maxEvaDurationS !== null ? start + a.maxEvaDurationS * 1000 : null
  let margin: number | null = null
  let limitedBy: 'sunset' | 'max-eva' | null = null
  let closes: number | null = null
  const timeKnown = remaining !== null && assumptionsOk && Number.isFinite(now)
  if (timeKnown) {
    const candidates: { id: 'daylight-margin' | 'eva-margin'; closes: number; by: 'sunset' | 'max-eva' }[] = []
    if (sunset !== null) candidates.push({ id: 'daylight-margin', closes: sunset, by: 'sunset' })
    if (evaDeadline !== null) candidates.push({ id: 'eva-margin', closes: evaDeadline, by: 'max-eva' })
    for (const c of candidates) {
      const m = (c.closes - now) / 1000 - remaining! - reserve
      add({
        id: c.id,
        status: m >= 0 ? 'pass' : 'violated',
        title: c.id === 'daylight-margin' ? 'Return before sunset with reserve' : 'Within maximum EVA duration with reserve',
        detail:
          m >= 0
            ? `${fmtMin(m)} margin after ${fmtMin(remaining!)} remaining work and ${fmtMin(reserve)} reserve.`
            : `Short by ${fmtMin(-m)}: ${fmtMin(remaining!)} remaining work + ${fmtMin(reserve)} reserve exceed the ${fmtMin((c.closes - now) / 1000)} left before ${c.by === 'sunset' ? 'geometric sunset' : 'the EVA limit'}.`,
        valueS: m,
      })
      if (margin === null || m < margin) {
        margin = m
        limitedBy = c.by
        closes = c.closes
      }
    }
    if (margin !== null && margin >= 0 && margin < a.turnaroundWarningS) {
      add({
        id: 'turnaround-warning',
        status: 'warning',
        title: 'Low return margin',
        detail: `Margin ${fmtMin(margin)} is below the ${fmtMin(a.turnaroundWarningS)} warning threshold (simulated, not a suit alarm).`,
        valueS: margin,
      })
    }
  }

  const violated = checks.filter((c) => c.status === 'violated')
  const unknown = checks.filter((c) => c.status === 'unknown')
  const feasibility: Feasibility = violated.length > 0 ? 'infeasible' : unknown.length > 0 ? 'indeterminate' : 'feasible'
  const binding = violated[0]?.id ?? unknown[0]?.id ?? (margin !== null ? (limitedBy === 'sunset' ? 'daylight-margin' : 'eva-margin') : null)
  const explanation = [...violated, ...unknown, ...checks.filter((c) => c.status === 'warning')].map((c) => `${c.title}: ${c.detail}`)
  if (feasibility === 'feasible' && margin === null) explanation.push('No time limit is enabled (daylight policy off and no maximum EVA duration).')

  return {
    feasibility,
    label: FEASIBILITY_LABELS[feasibility],
    durations: timeline
      ? { outboundTravelS: timeline.outboundTravelS, scienceS: timeline.scienceS, returnTravelS: timeline.returnTravelS, totalS: timeline.totalS }
      : null,
    timeline,
    missionStartUtcMs: start,
    elapsedS: elapsed,
    evaluatedAtUtcMs: now,
    remainingWorkS: remaining,
    projectedReturnUtcMs: remaining !== null && Number.isFinite(now) ? now + remaining * 1000 : null,
    window: { sunriseUtcMs: sunrise, sunsetUtcMs: sunset, evaDeadlineUtcMs: evaDeadline, closesUtcMs: closes, limitedBy },
    reserveS: assumptionsOk ? a.reserveS : NaN,
    returnMarginS: margin,
    turnaroundWarning: checks.some((c) => c.id === 'turnaround-warning'),
    checks,
    bindingConstraint: binding,
    explanation,
    assumptions: a,
    provenance: {
      engine: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      model: 'EVA timeline and return-margin rules (SCIENTIFIC_MODELS.md §5, §7)',
      modelVersion: MISSION_MODEL_VERSION,
      category: 'simulated',
      inputs: ['A* round trip (derived)', 'Mars24 daylight window (derived)', 'walking speed, reserve, activity durations (simulated)'],
    },
    disclaimer: MISSION_DISCLAIMER,
  }
}
