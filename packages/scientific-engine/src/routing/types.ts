import type { GeographicCoordinate, GridCell, ProjectedCoordinate } from '../contracts/geo.js'
import type { RoutingError } from '../contracts/errors.js'
import type { ResultProvenance } from '../contracts/provenance.js'

export type RoutePreference = 'shortest' | 'lower-slope'

/**
 * Lower-slope edge cost: C = d * (1 + slopeWeight * S + uphillWeight * U + downhillWeight * D)
 *   d  planimetric edge length (m)
 *   S  ((slope_a + slope_b) / 2 / maxSlope) ^ slopeExponent, in [0, 1]
 *   U  (max(0, dz/d) / tan(maxSlope))^2, in [0, 1]   (squared uphill grade of the move)
 *   D  (max(0, -dz/d) / tan(maxSlope))^2, in [0, 1]  (squared downhill grade of the move)
 * All weights >= 0, so C >= d and the distance heuristic stays admissible.
 * U and D are squared on purpose: a penalty linear in grade adds weight * ascent / tan(maxSlope)
 * to every path, which never changes the optimal path, so direction-dependent routes need a
 * non-linear term. This is a route-preference cost, not a physical energy model.
 */
export interface LowerSlopeCostParameters {
  readonly slopeWeight: number
  readonly slopeExponent: number
  readonly uphillWeight: number
  readonly downhillWeight: number
}

export const DEFAULT_LOWER_SLOPE_COST: LowerSlopeCostParameters = Object.freeze({
  slopeWeight: 4,
  slopeExponent: 2,
  uphillWeight: 0,
  downhillWeight: 0,
})

export interface SearchLimits {
  /** Wall-clock budget per A* search (default 10 000 ms). */
  readonly timeoutMs?: number
  /** Node-expansion budget per search (default: all cells). */
  readonly maxExpansions?: number
}

export interface RouteRequest {
  readonly start: GeographicCoordinate
  readonly destination: GeographicCoordinate
  readonly preference: RoutePreference
  /** Cells and moves steeper than this are forbidden. Illustrative assumption, not a NASA limit. */
  readonly maxSlopeDeg: number
  readonly costModel?: Partial<LowerSlopeCostParameters>
  /** 8 (default) or 4 neighbours. */
  readonly connectivity?: 4 | 8
  readonly limits?: SearchLimits
  /** When given, must equal dataset.version (stale-request protection). */
  readonly datasetVersion?: string
  readonly startLabel?: string
  readonly destinationLabel?: string
}

export interface RouteVertex {
  readonly cell: GridCell
  /** Cell-centre position. */
  readonly geographic: GeographicCoordinate
  readonly projected: ProjectedCoordinate
  readonly elevationM: number
  readonly slopeDeg: number
  /** Cumulative planimetric (map) distance from the start of the leg, metres. */
  readonly distanceM: number
  /** Cumulative 3-D surface distance from the start of the leg, metres. */
  readonly surfaceDistanceM: number
}

export interface RouteMetrics {
  readonly planimetricDistanceM: number
  readonly surfaceDistanceM: number
  readonly ascentM: number
  readonly descentM: number
  readonly netElevationChangeM: number
  readonly minElevationM: number
  readonly maxElevationM: number
  /** Maximum DEM-derived cell slope along the path. */
  readonly maxSlopeDeg: number
  /** Planimetric-distance-weighted mean of DEM-derived slope along the path. */
  readonly meanSlopeDeg: number
  /** Steepest grade of a single move, atan(|dz| / d). */
  readonly maxEdgeGradeDeg: number
  readonly cellCount: number
  /** A* cost (metre-equivalent units; equals planimetric distance in shortest mode). */
  readonly totalCost: number
  readonly costPerMeter: number
}

export interface RouteLeg {
  readonly id: string
  readonly fromLabel: string
  readonly toLabel: string
  readonly preference: RoutePreference
  readonly maxSlopeDeg: number
  readonly costModel: LowerSlopeCostParameters | null
  readonly connectivity: 4 | 8
  readonly vertices: readonly RouteVertex[]
  readonly metrics: RouteMetrics
  readonly search: { readonly nodesExpanded: number; readonly elapsedMs: number }
}

export interface RouteSuccess {
  readonly status: 'ok'
  readonly leg: RouteLeg
  readonly datasetId: string
  readonly datasetVersion: string
  readonly modelVersion: string
  readonly provenance: ResultProvenance
}

export type RouteResult = RouteSuccess | RoutingError

export interface RoundTripStop {
  readonly id: string
  readonly label: string
  readonly coordinate: GeographicCoordinate
  /** Planned science activity at this stop, Earth seconds (simulated assumption). */
  readonly activityDurationS: number
}

export interface RoundTripRequest {
  readonly habitat: GeographicCoordinate
  readonly habitatLabel?: string
  /** Visited in this fixed order on the outbound journey; the last stop is the destination. */
  readonly stops: readonly RoundTripStop[]
  readonly preference: RoutePreference
  readonly maxSlopeDeg: number
  readonly costModel?: Partial<LowerSlopeCostParameters>
  readonly connectivity?: 4 | 8
  readonly limits?: SearchLimits
  readonly datasetVersion?: string
}

export interface CombinedLeg {
  readonly id: 'outbound'
  readonly vertices: readonly RouteVertex[]
  readonly metrics: RouteMetrics
  /** Cumulative distance at which each stop is reached along the outbound journey. */
  readonly arrivals: readonly { readonly stopId: string; readonly label: string; readonly distanceM: number; readonly surfaceDistanceM: number }[]
}

export interface RoundTripRoute {
  readonly preference: RoutePreference
  readonly maxSlopeDeg: number
  readonly costModel: LowerSlopeCostParameters | null
  readonly habitat: GeographicCoordinate
  readonly habitatLabel: string
  readonly stops: readonly RoundTripStop[]
  /** One A* leg per outbound segment, in order. */
  readonly outboundSegments: readonly RouteLeg[]
  readonly outbound: CombinedLeg
  /** Destination -> habitat, computed by an independent A* search. */
  readonly inbound: RouteLeg
  readonly totals: {
    readonly planimetricDistanceM: number
    readonly surfaceDistanceM: number
    readonly ascentM: number
    readonly descentM: number
    readonly maxSlopeDeg: number
    readonly totalCost: number
  }
  /** True when the return path is exactly the reversed outbound path. */
  readonly identicalLegs: boolean
  readonly datasetId: string
  readonly datasetVersion: string
  readonly modelVersion: string
  readonly provenance: ResultProvenance
}

export type RoundTripResult =
  | { readonly status: 'ok'; readonly route: RoundTripRoute }
  | (RoutingError & { readonly failedLeg?: string })
