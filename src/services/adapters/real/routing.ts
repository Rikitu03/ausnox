/**
 * Real RoutingService: A* on the validated terrain grid (engine `calculateRoundTrip`), shortest or
 * lower-slope, with an independently searched return leg. Runs in a Web Worker when available.
 *
 * Mapping (handoff §12): GridCoord -> lon/lat for the request; vertices -> GridCoord path and samples;
 * leg distance = planimetric metres from the engine; ascent, descent, slopes from engine metrics;
 * waypoint distances from `outbound.arrivals`. The engine result is kept for the feasibility assessment.
 */
import {
  createLatestRequestGate,
  ROUTING_MODEL_VERSION,
  type EngineError,
  type RoundTripRequest,
  type RoundTripResult,
  type RouteVertex,
  type RouteLeg as EngineRouteLeg,
  type CombinedLeg,
  type TerrainDataset,
} from '@ausnox/scientific-engine'
import type { RouteLeg, RouteMode, RouteResult, RoundTripRoute, RoutingService } from '@/services/contracts'
import { engineSource, type RealContext } from './context'
import { gridToGeo, projectedToGridCoord } from './coords'
import { abortError, toServiceError } from './errors'
import type { RouteExecutor } from './routeExecutor'
import { ensureDataset } from './terrain'

const source = engineSource(
  'routing',
  `A* (${ROUTING_MODEL_VERSION}) on the HiRISE DTM-derived 2 m grid; return leg searched independently`,
)

function samplesOf(d: TerrainDataset, vertices: readonly RouteVertex[]) {
  return vertices.map((v) => ({
    grid: projectedToGridCoord(d, v.projected),
    distanceM: v.distanceM,
    elevationM: v.elevationM,
    slopeDeg: v.slopeDeg,
  }))
}

function legOf(
  d: TerrainDataset,
  id: 'outbound' | 'return',
  leg: CombinedLeg | EngineRouteLeg,
  waypointDistancesM: RouteLeg['waypointDistancesM'],
): RouteLeg {
  const samples = samplesOf(d, leg.vertices)
  const m = leg.metrics
  return {
    id,
    path: samples.map((s) => s.grid),
    samples,
    distanceM: m.planimetricDistanceM,
    surfaceDistanceM: m.surfaceDistanceM,
    ascentM: m.ascentM,
    descentM: m.descentM,
    maxSlopeDeg: m.maxSlopeDeg,
    meanSlopeDeg: m.meanSlopeDeg,
    waypointDistancesM,
  }
}

export function toFrontendRoute(d: TerrainDataset, r: Extract<RoundTripResult, { status: 'ok' }>['route']): RoundTripRoute {
  const outbound = legOf(
    d,
    'outbound',
    r.outbound,
    r.outbound.arrivals.map((a) => ({ label: a.label, distanceM: a.distanceM })),
  )
  const inbound = legOf(d, 'return', r.inbound, [{ label: r.habitatLabel, distanceM: r.inbound.metrics.planimetricDistanceM }])
  return {
    mode: r.preference,
    outbound,
    inbound,
    totalDistanceM: r.totals.planimetricDistanceM,
    maxSlopeDeg: r.totals.maxSlopeDeg,
    identicalLegs: r.identicalLegs,
    datasetId: r.datasetId,
    modelVersion: r.modelVersion,
    terrainAwarePathfinding: true,
    method:
      r.preference === 'shortest'
        ? 'A* shortest path on the 2 m HiRISE DTM grid: 8-connected, no corner cutting, cells and moves above the slope limit excluded; return leg searched independently'
        : 'A* lower-slope path on the 2 m HiRISE DTM grid: cost = distance × (1 + 4 × (slope / limit)²), a preference score, not energy; return leg searched independently',
  }
}

export function createRealRouting(ctx: RealContext, executor: RouteExecutor): RoutingService {
  // Latest request wins per mode: a newer request makes an older unanswered one stale.
  const gates: Record<RouteMode, ReturnType<typeof createLatestRequestGate>> = {
    shortest: createLatestRequestGate('shortest'),
    'lower-slope': createLatestRequestGate('lower-slope'),
  }

  return {
    async computeRoundTrip(request, signal): Promise<RouteResult> {
      if (signal?.aborted) throw abortError()
      const ticket = gates[request.mode].issue()
      const loaded = await ensureDataset(ctx)
      const stash = (r: RouteResult, engine: RoundTripResult | EngineError) => {
        ctx.routeStash.set(r, engine as RoundTripResult)
        return r
      }
      if ('status' in loaded) return stash(toServiceError(loaded, source), loaded)
      const d = loaded
      if (request.datasetId !== d.id) {
        const e: EngineError = {
          status: 'error',
          code: 'DATASET_MISMATCH',
          message: `The route was requested for dataset "${request.datasetId}" but "${d.id}" is loaded`,
        }
        return stash(toServiceError(e, source), e)
      }
      const engineRequest: RoundTripRequest = {
        habitat: gridToGeo(d, request.habitat),
        habitatLabel: 'Habitat',
        stops: request.waypoints.map((w, i) => ({
          id: w.id ?? `stop-${i + 1}`,
          label: w.label,
          coordinate: gridToGeo(d, w.position),
          activityDurationS: Math.max(0, (w.durationMin ?? 0) * 60),
        })),
        preference: request.mode,
        maxSlopeDeg: request.maxSlopeDeg,
        datasetVersion: d.version,
      }
      const result = await executor.roundTrip(d, engineRequest, signal)
      if (signal?.aborted || !gates[request.mode].isLatest(ticket)) throw abortError()
      if (result.status === 'error') {
        if (result.code === 'CANCELLED') throw abortError()
        return stash(toServiceError(result, source), result)
      }
      if (!('route' in result)) {
        const e: EngineError = { status: 'error', code: 'MODEL_FAILURE', message: 'The route engine returned an unexpected response' }
        return stash(toServiceError(e, source), e)
      }
      if (result.route.datasetVersion !== d.version) {
        const e: EngineError = { status: 'error', code: 'DATASET_MISMATCH', message: 'The route was computed on another terrain version' }
        return stash(toServiceError(e, source), e)
      }
      return stash({ status: 'ok', source, requestId: request.requestId, route: toFrontendRoute(d, result.route) }, result)
    },
  }
}
