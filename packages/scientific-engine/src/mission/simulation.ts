/**
 * Deterministic, pure simulation state machine for a planned EVA timeline.
 * Progress is tracked physically (metres walked in a travel phase, seconds done in a
 * science phase), so changing assumptions mid-mission recomputes the remaining work from
 * the current position instead of replaying the original departure-time margin.
 * Simulated time never reads a real clock: callers pass elapsed real milliseconds to `tick`.
 */
import { engineError, type EngineError } from '../contracts/errors.js'
import type { MissionPhase, MissionTimeline } from './timeline.js'

export type SimulationStatus = 'ready' | 'running' | 'paused' | 'completed'

export interface SimulationState {
  readonly status: SimulationStatus
  readonly timeline: MissionTimeline
  /** Simulated seconds per real second while running. */
  readonly speedMultiplier: number
  readonly elapsedS: number
  /** Index of the current phase; equals phases.length when completed. */
  readonly phaseIndex: number
  /** Metres walked (travel) or seconds done (science) in the current phase. */
  readonly phaseProgress: number
  /** Accumulated unplanned hold time, seconds. */
  readonly holdS: number
}

export interface SimulationSnapshot {
  readonly status: SimulationStatus
  readonly elapsedS: number
  readonly phase: MissionPhase | null
  /** 0..1 completion of the current phase. */
  readonly phaseFraction: number
  readonly completedWorkS: number
  readonly remainingWorkS: number
  readonly holdS: number
  /** Where the walker is: leg id and surface distance along that leg (null during science/after completion). */
  readonly position: { readonly legId: string; readonly surfaceDistanceM: number } | null
  readonly atStopId: string | null
}

export const MAX_SPEED_MULTIPLIER = 10_000

function validSpeed(m: number): boolean {
  return typeof m === 'number' && Number.isFinite(m) && m > 0 && m <= MAX_SPEED_MULTIPLIER
}

export function createSimulation(timeline: MissionTimeline, speedMultiplier = 1): SimulationState | EngineError<'INVALID_INPUT'> {
  if (!timeline || !Array.isArray(timeline.phases)) return engineError('INVALID_INPUT', 'A mission timeline is required.')
  if (!validSpeed(speedMultiplier)) return engineError('INVALID_INPUT', `Speed multiplier must be in (0, ${MAX_SPEED_MULTIPLIER}].`)
  return { status: 'ready', timeline, speedMultiplier, elapsedS: 0, phaseIndex: 0, phaseProgress: 0, holdS: 0 }
}

export function startSimulation(s: SimulationState): SimulationState {
  return s.status === 'ready' || s.status === 'paused' ? { ...s, status: 'running' } : s
}

export function pauseSimulation(s: SimulationState): SimulationState {
  return s.status === 'running' ? { ...s, status: 'paused' } : s
}

export function resumeSimulation(s: SimulationState): SimulationState {
  return s.status === 'paused' ? { ...s, status: 'running' } : s
}

export function resetSimulation(s: SimulationState): SimulationState {
  return { ...s, status: 'ready', elapsedS: 0, phaseIndex: 0, phaseProgress: 0, holdS: 0 }
}

export function setSimulationSpeed(s: SimulationState, multiplier: number): SimulationState | EngineError<'INVALID_INPUT'> {
  if (!validSpeed(multiplier)) return engineError('INVALID_INPUT', `Speed multiplier must be in (0, ${MAX_SPEED_MULTIPLIER}].`)
  return { ...s, speedMultiplier: multiplier }
}

function phaseRemainingS(phase: MissionPhase, progress: number, speed: number): number {
  return phase.kind === 'science' ? Math.max(0, phase.durationS - progress) : Math.max(0, phase.distanceM - progress) / speed
}

/** Advance planned work by `dtS` simulated seconds (manual step). Stepping a ready simulation leaves it paused. */
export function stepSimulation(s: SimulationState, dtS: number): SimulationState | EngineError<'INVALID_INPUT'> {
  if (typeof dtS !== 'number' || !Number.isFinite(dtS) || dtS < 0) return engineError('INVALID_INPUT', 'Step must be a non-negative number of seconds.')
  if (s.status === 'completed' || dtS === 0) return s
  if (s.status === 'ready') s = { ...s, status: 'paused' }
  const phases = s.timeline.phases
  const speed = s.timeline.walkingSpeedMps
  let t = dtS
  let idx = s.phaseIndex
  let prog = s.phaseProgress
  let elapsed = s.elapsedS
  while (idx < phases.length) {
    const ph = phases[idx]!
    const need = phaseRemainingS(ph, prog, speed)
    if (t >= need) {
      t -= need
      elapsed += need
      idx += 1
      prog = 0
      continue
    }
    prog += ph.kind === 'science' ? t : t * speed
    elapsed += t
    break
  }
  const done = idx >= phases.length
  return { ...s, status: done ? 'completed' : s.status, elapsedS: elapsed, phaseIndex: idx, phaseProgress: done ? 0 : prog }
}

/** Advance by real elapsed milliseconds times the speed multiplier, only while running. */
export function tickSimulation(s: SimulationState, realElapsedMs: number): SimulationState | EngineError<'INVALID_INPUT'> {
  if (typeof realElapsedMs !== 'number' || !Number.isFinite(realElapsedMs) || realElapsedMs < 0) {
    return engineError('INVALID_INPUT', 'Real elapsed time must be a non-negative number of milliseconds.')
  }
  if (s.status !== 'running') return s
  return stepSimulation(s, (realElapsedMs / 1000) * s.speedMultiplier)
}

/** Let simulated time pass without progress (an unplanned delay); consumes margin. */
export function holdSimulation(s: SimulationState, dtS: number): SimulationState | EngineError<'INVALID_INPUT'> {
  if (typeof dtS !== 'number' || !Number.isFinite(dtS) || dtS < 0) return engineError('INVALID_INPUT', 'Hold must be a non-negative number of seconds.')
  if (s.status === 'ready') return engineError('INVALID_INPUT', 'Start or step the simulation before adding a hold.')
  if (s.status === 'completed') return s
  return { ...s, elapsedS: s.elapsedS + dtS, holdS: s.holdS + dtS }
}

/**
 * Swap in a recomputed timeline (e.g. new walking speed or activity duration) while keeping
 * the current position. The phase structure (kinds, legs, stops) must be unchanged; a new
 * route requires resetSimulation.
 */
export function replanSimulation(s: SimulationState, next: MissionTimeline): SimulationState | EngineError<'INVALID_INPUT'> {
  const a = s.timeline.phases
  const b = next.phases
  const same = a.length === b.length && a.every((p, i) => p.kind === b[i]!.kind && p.legId === b[i]!.legId && p.stopId === b[i]!.stopId)
  if (!same) return engineError('INVALID_INPUT', 'The plan structure changed; reset the simulation to use the new route.')
  if (s.phaseIndex >= b.length) return { ...s, timeline: next }
  const ph = b[s.phaseIndex]!
  const cap = ph.kind === 'science' ? ph.durationS : ph.distanceM
  if (s.phaseProgress > cap + 1e-9) {
    return engineError('INVALID_INPUT', 'The current phase would already be over-complete under the new plan; reset or step instead.')
  }
  return { ...s, timeline: next }
}

export function getSimulationSnapshot(s: SimulationState): SimulationSnapshot {
  const phases = s.timeline.phases
  const speed = s.timeline.walkingSpeedMps
  let remaining = 0
  for (let i = s.phaseIndex; i < phases.length; i++) {
    remaining += i === s.phaseIndex ? phaseRemainingS(phases[i]!, s.phaseProgress, speed) : phases[i]!.durationS
  }
  const phase = s.phaseIndex < phases.length ? phases[s.phaseIndex]! : null
  let fraction = 1
  if (phase) {
    const extent = phase.kind === 'science' ? phase.durationS : phase.distanceM
    fraction = extent > 0 ? Math.min(1, s.phaseProgress / extent) : 1
  }
  const total = phases.reduce((acc, p) => acc + p.durationS, 0)
  return {
    status: s.status,
    elapsedS: s.elapsedS,
    phase,
    phaseFraction: fraction,
    completedWorkS: Math.max(0, total - remaining),
    remainingWorkS: remaining,
    holdS: s.holdS,
    position: phase && phase.kind !== 'science' && phase.legId ? { legId: phase.legId, surfaceDistanceM: s.phaseProgress } : null,
    atStopId: phase && phase.kind === 'science' ? phase.stopId : null,
  }
}
