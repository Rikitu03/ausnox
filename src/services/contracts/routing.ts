import type { Result } from './common'
import type { GridCoord } from './geo'
import type { RouteMode } from './mission'

export interface RouteRequest {
  /** Echoed back so stale responses can be discarded. */
  requestId: string
  datasetId: string
  habitat: GridCoord
  /** Intermediate stops in visiting order, then the destination last. */
  waypoints: { label: string; position: GridCoord }[]
  mode: RouteMode
  maxSlopeDeg: number
}

export interface RouteSample {
  grid: GridCoord
  /** Cumulative distance from the start of the leg, metres. */
  distanceM: number
  elevationM: number
  slopeDeg: number
}

export interface RouteLeg {
  id: 'outbound' | 'return'
  path: GridCoord[]
  samples: RouteSample[]
  distanceM: number
  ascentM: number
  descentM: number
  maxSlopeDeg: number
  meanSlopeDeg: number
  /** Cumulative distance at which each waypoint of the leg is reached, metres. */
  waypointDistancesM: { label: string; distanceM: number }[]
}

export interface RoundTripRoute {
  mode: RouteMode
  outbound: RouteLeg
  /** Computed independently of the outbound leg. */
  inbound: RouteLeg
  totalDistanceM: number
  maxSlopeDeg: number
  /** True when both legs follow the same line in opposite directions. */
  identicalLegs: boolean
  datasetId: string
  modelVersion: string
  /** False for demonstration geometry. Only a real pathfinding engine may set this to true. */
  terrainAwarePathfinding: boolean
  /** How the geometry was produced, in words the UI can show. */
  method: string
}

export type RouteResult = Result<{ requestId: string; route: RoundTripRoute }>

export interface RoutingService {
  computeRoundTrip(request: RouteRequest, signal?: AbortSignal): Promise<RouteResult>
}
