/**
 * Mission time budget (SCIENTIFIC_MODELS.md §5):
 *   T_mission = sum(T_outbound legs) + sum(T_science) + T_return
 * Travel time = surface (3-D) path length / walking speed. The A* route cost is never
 * used as a duration.
 */
import { engineError, type EngineError } from '../contracts/errors.js'
import type { RoundTripRoute, RouteVertex } from '../routing/types.js'
import { MISSION_ASSUMPTION_LIMITS, validateMissionAssumptions, type MissionAssumptions } from './assumptions.js'

export type MissionPhaseKind = 'travel-outbound' | 'science' | 'travel-return'

export interface MissionPhase {
  readonly index: number
  readonly kind: MissionPhaseKind
  readonly label: string
  /** Route leg id for travel phases ('outbound-1', ..., 'return'). */
  readonly legId: string | null
  readonly stopId: string | null
  /** Surface distance walked in a travel phase, metres (0 for science). */
  readonly distanceM: number
  readonly durationS: number
  /** Planned offsets from mission start, Earth seconds. */
  readonly startOffsetS: number
  readonly endOffsetS: number
}

export interface MissionDurations {
  readonly outboundTravelS: number
  readonly scienceS: number
  readonly returnTravelS: number
  /** Both legs plus science; the reserve is NOT included. */
  readonly totalS: number
}

export interface MissionTimeline extends MissionDurations {
  readonly phases: readonly MissionPhase[]
  readonly walkingSpeedMps: number
  readonly datasetVersion: string
}

export type MissionTimelineResult = { status: 'ok'; timeline: MissionTimeline } | EngineError<'INVALID_INPUT'>

export function buildMissionTimeline(route: RoundTripRoute, assumptions: MissionAssumptions): MissionTimelineResult {
  const problems = validateMissionAssumptions(assumptions)
  if (problems.length > 0) return engineError('INVALID_INPUT', 'Mission assumptions are invalid.', { problems })
  if (route.outboundSegments.length !== route.stops.length) {
    return engineError('INVALID_INPUT', 'Route segments do not match the planned stops.')
  }
  const lim = MISSION_ASSUMPTION_LIMITS.activityDurationS
  const bad = route.stops.find(
    (s) => typeof s.activityDurationS !== 'number' || !(s.activityDurationS >= lim.min && s.activityDurationS <= lim.max),
  )
  if (bad) return engineError('INVALID_INPUT', `Activity duration at "${bad.label}" must be between 0 and 12 h.`, { stopId: bad.id })
  const v = assumptions.walkingSpeedMps
  const phases: MissionPhase[] = []
  let t = 0
  let outbound = 0
  let science = 0
  const push = (p: Omit<MissionPhase, 'index' | 'startOffsetS' | 'endOffsetS'>) => {
    phases.push({ ...p, index: phases.length, startOffsetS: t, endOffsetS: t + p.durationS })
    t += p.durationS
  }
  route.outboundSegments.forEach((seg, i) => {
    const stop = route.stops[i]!
    const travel = seg.metrics.surfaceDistanceM / v
    outbound += travel
    push({ kind: 'travel-outbound', label: `${seg.fromLabel} to ${seg.toLabel}`, legId: seg.id, stopId: null, distanceM: seg.metrics.surfaceDistanceM, durationS: travel })
    science += stop.activityDurationS
    push({ kind: 'science', label: `Science at ${stop.label}`, legId: null, stopId: stop.id, distanceM: 0, durationS: stop.activityDurationS })
  })
  const ret = route.inbound.metrics.surfaceDistanceM / v
  push({ kind: 'travel-return', label: `${route.inbound.fromLabel} to ${route.inbound.toLabel}`, legId: route.inbound.id, stopId: null, distanceM: route.inbound.metrics.surfaceDistanceM, durationS: ret })
  return {
    status: 'ok',
    timeline: {
      phases,
      outboundTravelS: outbound,
      scienceS: science,
      returnTravelS: ret,
      totalS: outbound + science + ret,
      walkingSpeedMps: v,
      datasetVersion: route.datasetVersion,
    },
  }
}

/** T_outbound + T_science + T_return for a computed round trip. */
export function calculateMissionDuration(
  route: RoundTripRoute,
  assumptions: MissionAssumptions,
): ({ status: 'ok' } & MissionDurations) | EngineError<'INVALID_INPUT'> {
  const r = buildMissionTimeline(route, assumptions)
  if (r.status === 'error') return r
  const { outboundTravelS, scienceS, returnTravelS, totalS } = r.timeline
  return { status: 'ok', outboundTravelS, scienceS, returnTravelS, totalS }
}

/** Interpolated position after walking `surfaceDistanceM` along a leg (for map display). */
export function positionAlongVertices(vertices: readonly RouteVertex[], surfaceDistanceM: number): RouteVertex | null {
  if (vertices.length === 0) return null
  const first = vertices[0]!
  if (surfaceDistanceM <= first.surfaceDistanceM) return first
  const last = vertices[vertices.length - 1]!
  if (surfaceDistanceM >= last.surfaceDistanceM) return last
  let lo = 0
  let hi = vertices.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (vertices[mid]!.surfaceDistanceM <= surfaceDistanceM) lo = mid
    else hi = mid
  }
  const a = vertices[lo]!
  const b = vertices[hi]!
  const span = b.surfaceDistanceM - a.surfaceDistanceM
  const f = span > 0 ? (surfaceDistanceM - a.surfaceDistanceM) / span : 0
  const lerp = (x: number, y: number) => x + (y - x) * f
  return {
    cell: f < 0.5 ? a.cell : b.cell,
    geographic: { lonEast: lerp(a.geographic.lonEast, b.geographic.lonEast), latNorth: lerp(a.geographic.latNorth, b.geographic.latNorth) },
    projected: { xM: lerp(a.projected.xM, b.projected.xM), yM: lerp(a.projected.yM, b.projected.yM) },
    elevationM: lerp(a.elevationM, b.elevationM),
    slopeDeg: lerp(a.slopeDeg, b.slopeDeg),
    distanceM: lerp(a.distanceM, b.distanceM),
    surfaceDistanceM,
  }
}
