import type { GridCoord } from './geo'

export interface Site {
  id: string
  label: string
  position: GridCoord
}

export interface ScienceStop extends Site {
  /** Planned science activity at this stop, minutes. */
  durationMin: number
  /** Set when the stop was created from a listed science waypoint. */
  waypointId: string | null
}

/** Route optimisation modes (docs/SCIENTIFIC_MODELS.md §4). */
export type RouteMode = 'shortest' | 'lower-slope'

/** Illustrative, user-adjustable EVA assumptions. None of these are NASA operational values. */
export interface MissionAssumptions {
  walkingSpeedMps: number
  maxSlopeDeg: number
  /** Time kept in hand before the daylight deadline, minutes. */
  reserveMin: number
  /** Simulated mission start, local true solar time in Mars clock hours (0–24). */
  startLtstHours: number
  maxEvaEnabled: boolean
  maxEvaHours: number
  /** Margin below which a turnaround warning is raised, minutes. */
  warningMarginMin: number
  solarScenarioId: string
}

export interface MissionConfig {
  id: string
  name: string
  /** Hypothetical habitat. No real habitat exists at this location. */
  habitat: Site | null
  destination: ScienceStop | null
  /** Optional intermediate stops, visited on the outbound leg in this fixed order. */
  stops: ScienceStop[]
  routeMode: RouteMode
  assumptions: MissionAssumptions
}

export const ASSUMPTION_LIMITS = {
  walkingSpeedMps: { min: 0.1, max: 2, step: 0.05 },
  maxSlopeDeg: { min: 2, max: 30, step: 1 },
  reserveMin: { min: 0, max: 180, step: 5 },
  startLtstHours: { min: 0, max: 23.75, step: 0.25 },
  maxEvaHours: { min: 1, max: 12, step: 0.5 },
  warningMarginMin: { min: 0, max: 120, step: 5 },
  stopDurationMin: { min: 0, max: 240, step: 5 },
} as const
