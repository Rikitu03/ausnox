/**
 * Real MissionService: the engine's feasibility rules (SCIENTIFIC_MODELS.md §5, §7) applied to the engine's
 * own route and daylight objects. Durations use surface (3-D) route length; the window and the start are
 * absolute UTC instants resolved with Mars24; every missing or unverified input gives `indeterminate`.
 *
 * Unit conversions (handoff §12): reserveS = reserveMin·60, turnaroundWarningS = warningMarginMin·60,
 * maxEvaDurationS = maxEvaEnabled ? maxEvaHours·3600 : null, start = findUtcForLocalTrueSolarTime(
 * habitat, startLtstHours, scenario instant).
 */
import {
  evaluateMissionFeasibility,
  findUtcForLocalTrueSolarTime,
  MISSION_MODEL_VERSION,
  type ConstraintCheck,
  type DaylightWindowResult,
  type MissionAssessment as EngineAssessment,
  type MissionAssumptions as EngineAssumptions,
  type RoundTripResult,
} from '@ausnox/scientific-engine'
import type {
  ConstraintViolation,
  MissionAssessment,
  MissionConfig,
  MissionEvent,
  MissionService,
  RouteResult,
  SolarResult,
  TimelinePhase,
} from '@/services/contracts'
import { engineSource, type RealContext } from './context'
import { gridToGeo } from './coords'
import { scenarioReferenceUtc } from './solar'

const source = engineSource(
  'mission',
  `Engine feasibility rules (${MISSION_MODEL_VERSION}): Mars24 daylight window, A* surface distance, constant walking speed`,
)

export function toEngineAssumptions(a: MissionConfig['assumptions']): EngineAssumptions {
  return {
    walkingSpeedMps: a.walkingSpeedMps,
    maxSlopeDeg: a.maxSlopeDeg,
    reserveS: a.reserveMin * 60,
    maxEvaDurationS: a.maxEvaEnabled ? a.maxEvaHours * 3600 : null,
    daylightPolicy: 'daylight-only',
    turnaroundWarningS: a.warningMarginMin * 60,
  }
}

/** Absolute simulated start: the planned local true solar time at the habitat on the scenario's sol. */
export function missionStartUtcMs(ctx: RealContext, config: MissionConfig): number {
  const d = ctx.dataset
  if (!d || !config.habitat) return Number.NaN
  const ref = scenarioReferenceUtc(config.assumptions.solarScenarioId)
  if (typeof ref !== 'number') return Number.NaN
  const r = findUtcForLocalTrueSolarTime(gridToGeo(d, config.habitat.position), config.assumptions.startLtstHours, ref)
  return r.status === 'ok' ? r.utcMs : Number.NaN
}

function violationOf(c: ConstraintCheck, route: RoundTripResult | null): ConstraintViolation | null {
  const severity = c.status === 'violated' ? 'violation' : c.status === 'unknown' ? 'unknown' : c.status === 'warning' ? 'warning' : null
  if (!severity) return null
  let code: ConstraintViolation['code']
  switch (c.id) {
    case 'assumptions':
    case 'progress':
      code = 'INVALID_ASSUMPTION'
      break
    case 'terrain-verification':
      code = 'MISSING_TERRAIN'
      break
    case 'route':
      code =
        route?.status === 'error'
          ? route.code === 'NO_ROUTE'
            ? 'NO_ROUTE'
            : route.code === 'UNSUPPORTED_SLOPE'
              ? 'TERRAIN_SLOPE'
              : 'MISSING_ROUTE'
          : 'MISSING_ROUTE'
      break
    case 'solar-model':
      code = 'MISSING_SOLAR'
      break
    case 'starts-in-daylight':
      code = 'STARTS_IN_DARKNESS'
      break
    case 'daylight-margin':
    case 'eva-margin':
      code = 'RETURN_MARGIN'
      break
    case 'turnaround-warning':
      code = 'LOW_MARGIN'
      break
  }
  return { code, severity, title: c.title, detail: c.detail.replace(/\.\s*$/, '') }
}

/** Engine assessment -> frontend assessment (offsets in Earth seconds from the mission start). */
export function toFrontendAssessment(
  e: EngineAssessment,
  route: RoundTripResult | null,
  config: MissionConfig,
): MissionAssessment {
  const start = e.missionStartUtcMs
  const offset = (ms: number) => (ms - start) / 1000
  const stops = [...config.stops, ...(config.destination ? [config.destination] : [])]

  let windowEndS: number | null = null
  let windowLimitedBy: MissionAssessment['windowLimitedBy'] = null
  if (e.window.closesUtcMs !== null) {
    windowEndS = offset(e.window.closesUtcMs)
    windowLimitedBy = e.window.limitedBy
  } else if (Number.isFinite(start)) {
    // No margin could be computed (for example no route), but the window itself is known.
    const sunset = e.window.sunsetUtcMs
    const eva = e.window.evaDeadlineUtcMs
    if (sunset !== null && (eva === null || sunset <= eva)) {
      windowEndS = offset(sunset)
      windowLimitedBy = 'sunset'
    } else if (eva !== null) {
      windowEndS = offset(eva)
      windowLimitedBy = 'max-eva'
    }
  }

  const phases: TimelinePhase[] = []
  const events: MissionEvent[] = []
  const tl = e.timeline
  if (tl && route?.status === 'ok') {
    const arrivals = route.route.outbound.arrivals
    let leg = 0
    events.push({ atS: 0, kind: 'depart', label: 'Leave habitat' })
    for (const p of tl.phases) {
      if (p.kind === 'travel-outbound') {
        const from = leg === 0 ? 0 : arrivals[leg - 1]!.distanceM
        const to = arrivals[leg]!.distanceM
        const label = arrivals[leg]!.label
        phases.push({ kind: p.kind, label: `Walk to ${label}`, startS: p.startOffsetS, endS: p.endOffsetS, fromDistanceM: from, toDistanceM: to })
        events.push({ atS: p.endOffsetS, kind: 'arrive', label: `Arrive at ${label}` })
        leg++
      } else if (p.kind === 'science') {
        const label = route.route.stops.find((s) => s.id === p.stopId)?.label ?? 'stop'
        if (p.durationS > 0) {
          phases.push({ kind: 'science', label: `Science at ${label}`, startS: p.startOffsetS, endS: p.endOffsetS, fromDistanceM: null, toDistanceM: null })
          events.push({ atS: p.endOffsetS, kind: 'science-complete', label: `Science complete at ${label}` })
        }
      } else {
        phases.push({
          kind: 'travel-return',
          label: 'Walk back to habitat',
          startS: p.startOffsetS,
          endS: p.endOffsetS,
          fromDistanceM: 0,
          toDistanceM: route.route.inbound.metrics.planimetricDistanceM,
        })
        events.push({ atS: p.endOffsetS, kind: 'return-habitat', label: 'Back at habitat' })
      }
    }
  }
  if (windowEndS !== null && phases.length > 0) {
    events.push({ atS: windowEndS - config.assumptions.reserveMin * 60, kind: 'reserve-starts', label: 'Reserve begins' })
    events.push({
      atS: windowEndS,
      kind: 'window-ends',
      label: windowLimitedBy === 'sunset' ? 'Geometric sunset (Mars24)' : 'Maximum EVA duration reached',
    })
  }
  events.sort((a, b) => a.atS - b.atS)

  const violations = e.checks.map((c) => violationOf(c, route)).filter((v): v is ConstraintViolation => v !== null)
  return {
    feasibility: e.feasibility,
    outboundTravelS: e.durations?.outboundTravelS ?? null,
    returnTravelS: e.durations?.returnTravelS ?? null,
    scienceS: e.durations?.scienceS ?? stops.reduce((s, x) => s + x.durationMin * 60, 0),
    totalMissionS: e.durations?.totalS ?? null,
    reserveS: config.assumptions.reserveMin * 60,
    windowEndS,
    windowLimitedBy,
    returnMarginS: e.returnMarginS,
    phases,
    events,
    violations,
    assumptionsUsed: { ...config.assumptions },
  }
}

export interface RealMissionService extends MissionService {
  /** The engine assessment behind a frontend assessment result (for diagnostics and tests). */
  engineAssessment(result: object): EngineAssessment | undefined
}

export function createRealMission(ctx: RealContext): RealMissionService {
  const assessments = new WeakMap<object, EngineAssessment>()
  return {
    engineAssessment: (result) => assessments.get(result),
    assess({ config, route, solar }: { config: MissionConfig; route: RouteResult | null; solar: SolarResult | null }) {
      const d = ctx.dataset
      // Only engine results are trusted: a route or daylight value from anywhere else counts as missing.
      let engineRoute: RoundTripResult | null = route ? (ctx.routeStash.get(route) ?? null) : null
      if (engineRoute?.status === 'ok') {
        // Science durations come from the configuration being assessed (the geometry does not depend on them).
        const stops = [...config.stops, ...(config.destination ? [config.destination] : [])]
        if (stops.length === engineRoute.route.stops.length) {
          engineRoute = {
            ...engineRoute,
            route: {
              ...engineRoute.route,
              stops: engineRoute.route.stops.map((s, i) => ({ ...s, activityDurationS: stops[i]!.durationMin * 60 })),
            },
          }
        } else {
          engineRoute = { status: 'error', code: 'INVALID_INPUT', message: 'The route does not match the planned stops; recalculate' }
        }
      }
      const entry = solar ? ctx.solarStash.get(solar) : undefined
      const daylight: DaylightWindowResult | null =
        entry?.daylight ??
        (solar?.status === 'error' ? { status: 'error', code: 'MODEL_FAILURE', message: solar.detail } : null)

      const engine = evaluateMissionFeasibility({
        route: engineRoute,
        daylight,
        terrain: d ? { version: d.version, verification: d.verification } : null,
        assumptions: toEngineAssumptions(config.assumptions),
        missionStartUtcMs: missionStartUtcMs(ctx, config),
      })
      const result = { status: 'ok' as const, source, assessment: toFrontendAssessment(engine, engineRoute, config) }
      assessments.set(result, engine)
      return result
    },
  }
}
