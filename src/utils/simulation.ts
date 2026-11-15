import {
  MARS_HOUR_SECONDS,
  type GridCoord,
  type MissionAssessment,
  type RoundTripRoute,
  type RouteLeg,
  type TimelinePhase,
} from '@/services/contracts'

export interface SimulationSnapshot {
  /** Earth seconds since mission start. */
  simS: number
  /** Simulated local true solar time, Mars clock hours. */
  ltstHours: number
  status: 'not-started' | 'in-progress' | 'complete'
  phase: TimelinePhase | null
  /** 0–1 through the current phase. */
  phaseProgress: number
  position: GridCoord | null
  remainingWorkS: number | null
  daylightRemainingS: number | null
  /** window end − now − remaining work − reserve. */
  returnMarginS: number | null
  pastWindow: boolean
}

function pointAtDistance(leg: RouteLeg, distanceM: number): GridCoord {
  const s = leg.samples
  let lo = 0
  let hi = s.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (s[mid]!.distanceM <= distanceM) lo = mid
    else hi = mid
  }
  const a = s[lo]!
  const b = s[hi]!
  const span = b.distanceM - a.distanceM
  const t = span > 0 ? Math.min(1, Math.max(0, (distanceM - a.distanceM) / span)) : 0
  return { x: a.grid.x + (b.grid.x - a.grid.x) * t, y: a.grid.y + (b.grid.y - a.grid.y) * t }
}

/**
 * State of the simulated mission at `simS`, assuming the walk proceeds exactly
 * on plan. Deterministic: the same inputs always give the same snapshot.
 */
export function snapshotAt(
  assessment: MissionAssessment | null,
  route: RoundTripRoute | null,
  simS: number,
  startLtstHours: number,
): SimulationSnapshot {
  const ltstHours = startLtstHours + simS / MARS_HOUR_SECONDS
  const total = assessment?.totalMissionS ?? null
  const windowEnd = assessment?.windowEndS ?? null
  const remainingWorkS = total === null ? null : Math.max(0, total - simS)
  const base = {
    simS,
    ltstHours,
    remainingWorkS,
    daylightRemainingS: windowEnd === null ? null : windowEnd - simS,
    returnMarginS:
      windowEnd === null || remainingWorkS === null || !assessment
        ? null
        : windowEnd - simS - remainingWorkS - assessment.reserveS,
    pastWindow: windowEnd !== null && simS > windowEnd,
  }
  if (!assessment || !route || total === null || assessment.phases.length === 0) {
    return { ...base, status: 'not-started', phase: null, phaseProgress: 0, position: null }
  }
  if (simS >= total) {
    const home = route.inbound.samples[route.inbound.samples.length - 1]!.grid
    return { ...base, status: 'complete', phase: null, phaseProgress: 1, position: home }
  }
  const index = assessment.phases.findIndex((p) => simS < p.endS)
  const phase = assessment.phases[index]!
  const span = phase.endS - phase.startS
  const phaseProgress = span > 0 ? Math.max(0, (simS - phase.startS) / span) : 1
  let position: GridCoord
  if (phase.kind === 'science') {
    // Standing at the end of the walk that led here.
    const before = assessment.phases[index - 1]
    position = pointAtDistance(route.outbound, before?.toDistanceM ?? 0)
  } else {
    const leg = phase.kind === 'travel-outbound' ? route.outbound : route.inbound
    position = pointAtDistance(leg, phase.fromDistanceM! + (phase.toDistanceM! - phase.fromDistanceM!) * phaseProgress)
  }
  return { ...base, status: simS <= 0 ? 'not-started' : 'in-progress', phase, phaseProgress, position }
}
