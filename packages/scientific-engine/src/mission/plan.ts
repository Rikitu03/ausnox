/**
 * One-call mission planning for frontend adapters: both route preferences, the daylight
 * window and a feasibility assessment for each, as one JSON-serialisable response.
 * Each preference is routed independently, so one failing mode never hides the other.
 */
import type { GeographicCoordinate } from '../contracts/geo.js'
import type { ProvenanceRecord } from '../contracts/provenance.js'
import { calculateRoundTrip, roundTripToGeoJSON, type RouteControl } from '../routing/route.js'
import type { LowerSlopeCostParameters, RoundTripResult, RoundTripRoute, RoundTripStop, RoutePreference, SearchLimits } from '../routing/types.js'
import { DAYLIGHT_APPROXIMATIONS, calculateDaylightWindow, type DaylightWindowResult } from '../solar/daylight.js'
import type { TerrainDataset } from '../terrain/dataset.js'
import { ENGINE_VERSION, MISSION_MODEL_VERSION, ROUTING_MODEL_VERSION, SOLAR_MODEL_VERSION } from '../version.js'
import type { MissionAssumptions } from './assumptions.js'
import { MISSION_DISCLAIMER, evaluateMissionFeasibility, type MissionAssessment } from './feasibility.js'

export interface MissionPlanRequest {
  readonly habitat: GeographicCoordinate
  readonly habitatLabel?: string
  /** Visited in this fixed order; the last stop is the destination. */
  readonly stops: readonly RoundTripStop[]
  readonly assumptions: MissionAssumptions
  /** Simulated mission start (Unix ms, UTC). */
  readonly missionStartUtcMs: number
  readonly costModel?: Partial<LowerSlopeCostParameters>
  readonly connectivity?: 4 | 8
  readonly limits?: SearchLimits
  readonly datasetVersion?: string
}

export interface MissionPlanOption {
  readonly preference: RoutePreference
  readonly route: RoundTripResult
  readonly assessment: MissionAssessment
  /** Outbound and return LineStrings (lon, lat), or null when routing failed. */
  readonly geojson: ReturnType<typeof roundTripToGeoJSON> | null
}

export interface MissionPlanComparison {
  readonly identicalRoutes: boolean
  /** lower-slope minus shortest, metres (planimetric, both legs). */
  readonly extraDistanceM: number
  readonly maxSlopeReductionDeg: number
  readonly ascentDifferenceM: number
  /** lower-slope minus shortest return margin, seconds; null when either margin is unknown. */
  readonly marginDifferenceS: number | null
}

export interface MissionPlan {
  readonly status: 'ok'
  readonly engineVersion: string
  readonly datasetId: string
  readonly datasetVersion: string
  readonly missionStartUtcMs: number
  readonly daylight: DaylightWindowResult
  readonly shortest: MissionPlanOption
  readonly lowerSlope: MissionPlanOption
  readonly comparison: MissionPlanComparison | null
  readonly provenance: readonly ProvenanceRecord[]
  readonly disclaimer: string
}

const ENGINE_SOURCE = { label: 'Ausnox scientific engine (docs/SCIENTIFIC_ENGINE_HANDOFF.md)', url: 'https://github.com/Rikitu03/ausnox' }

/** Provenance records for the models the engine applies on top of the terrain data. */
export const ENGINE_PROVENANCE_RECORDS: readonly ProvenanceRecord[] = Object.freeze([
  {
    id: 'route-astar',
    title: 'Terrain-aware route (A*)',
    category: 'derived',
    mission: null,
    instrument: null,
    provider: 'Ausnox scientific engine',
    measures: 'Minimum-cost walking path over the DEM-derived traversability grid.',
    method: `A* (${ROUTING_MODEL_VERSION}), 8-connected, no corner cutting, cell and move slope limits; shortest = distance, lower-slope = distance x (1 + w x normalised slope^2).`,
    coverage: 'Inside the terrain grid only; unknown cells are never crossed.',
    resolution: 'Grid cell size',
    sources: [ENGINE_SOURCE],
    limitations: [
      'Route cost is a preference score, not energy or time.',
      'Rocks, loose regolith and footing are not resolved by a 2 m DEM.',
    ],
    attribution: 'Ausnox',
  },
  {
    id: 'solar-mars24',
    title: 'Mars local solar time and geometric daylight (Mars24)',
    category: 'derived',
    mission: null,
    instrument: null,
    provider: 'NASA GISS Mars24 algorithm, implemented by Ausnox',
    measures: 'Mars Sol Date, LMST, LTST, Ls, solar elevation, geometric sunrise and sunset.',
    method: `Allison & McEwen (2000) as revised in Mars24 (${SOLAR_MODEL_VERSION}); sunrise/sunset by root finding on solar elevation.`,
    coverage: 'Any Mars location, 1950-2099 UTC',
    resolution: null,
    sources: [{ label: 'NASA GISS Mars24 algorithm and worked examples', url: 'https://www.giss.nasa.gov/tools/mars24/help/algorithm.html' }],
    limitations: [...DAYLIGHT_APPROXIMATIONS],
    attribution: 'Allison & McEwen 2000; NASA GISS Mars24',
  },
  {
    id: 'mission-assumptions',
    title: 'Simulated EVA assumptions and feasibility rules',
    category: 'simulated',
    mission: null,
    instrument: null,
    provider: 'Ausnox scientific engine',
    measures: 'Travel time, science time, reserve and return margin under user-selected assumptions.',
    method: `Constant walking speed over surface distance; margin = window close - now - remaining work - reserve (${MISSION_MODEL_VERSION}).`,
    coverage: null,
    resolution: null,
    sources: [ENGINE_SOURCE],
    limitations: ['Walking speed, slope limit, reserve and activity times are illustrative and are not NASA operational values.'],
    attribution: 'Ausnox',
  },
])

function sameCells(a: RoundTripRoute, b: RoundTripRoute): boolean {
  const eq = (x: readonly { cell: { row: number; col: number } }[], y: readonly { cell: { row: number; col: number } }[]) =>
    x.length === y.length && x.every((v, i) => v.cell.row === y[i]!.cell.row && v.cell.col === y[i]!.cell.col)
  return eq(a.outbound.vertices, b.outbound.vertices) && eq(a.inbound.vertices, b.inbound.vertices)
}

export function planMission(dataset: TerrainDataset, request: MissionPlanRequest, control: RouteControl = {}): MissionPlan {
  const daylight = calculateDaylightWindow(request.missionStartUtcMs, request.habitat)
  const terrain = { version: dataset.version, verification: dataset.verification }
  const option = (preference: RoutePreference): MissionPlanOption => {
    const route = calculateRoundTrip(
      dataset,
      {
        habitat: request.habitat,
        habitatLabel: request.habitatLabel,
        stops: request.stops,
        preference,
        maxSlopeDeg: request.assumptions?.maxSlopeDeg,
        costModel: request.costModel,
        connectivity: request.connectivity,
        limits: request.limits,
        datasetVersion: request.datasetVersion,
      },
      control,
    )
    const assessment = evaluateMissionFeasibility({
      route,
      daylight,
      terrain,
      assumptions: request.assumptions,
      missionStartUtcMs: request.missionStartUtcMs,
    })
    return { preference, route, assessment, geojson: route.status === 'ok' ? roundTripToGeoJSON(route.route) : null }
  }
  const shortest = option('shortest')
  const lowerSlope = option('lower-slope')
  let comparison: MissionPlanComparison | null = null
  if (shortest.route.status === 'ok' && lowerSlope.route.status === 'ok') {
    const s = shortest.route.route.totals
    const l = lowerSlope.route.route.totals
    const ms = shortest.assessment.returnMarginS
    const ml = lowerSlope.assessment.returnMarginS
    comparison = {
      identicalRoutes: sameCells(shortest.route.route, lowerSlope.route.route),
      extraDistanceM: l.planimetricDistanceM - s.planimetricDistanceM,
      maxSlopeReductionDeg: s.maxSlopeDeg - l.maxSlopeDeg,
      ascentDifferenceM: l.ascentM - s.ascentM,
      marginDifferenceS: ms !== null && ml !== null ? ml - ms : null,
    }
  }
  return {
    status: 'ok',
    engineVersion: ENGINE_VERSION,
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    missionStartUtcMs: request.missionStartUtcMs,
    daylight,
    shortest,
    lowerSlope,
    comparison,
    provenance: [...dataset.provenance, ...ENGINE_PROVENANCE_RECORDS],
    disclaimer: MISSION_DISCLAIMER,
  }
}
