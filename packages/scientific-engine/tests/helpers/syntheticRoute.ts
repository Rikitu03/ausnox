/**
 * TEST-ONLY builders for exact round-trip routes and daylight windows, so feasibility
 * boundaries (e.g. a margin of exactly zero) can be tested with exact arithmetic.
 */
import {
  ENGINE_NAME,
  ROUTING_MODEL_VERSION,
  type DaylightWindowOk,
  type RouteLeg,
  type RouteMetrics,
  type RoundTripRoute,
  type RoundTripStop,
  type RouteVertex,
  type TerrainVerification,
} from '../../src/index.js'

const vertex = (distanceM: number): RouteVertex => ({
  cell: { row: 0, col: Math.round(distanceM) },
  geographic: { lonEast: 0, latNorth: 0 },
  projected: { xM: distanceM, yM: 0 },
  elevationM: 0,
  slopeDeg: 0,
  distanceM,
  surfaceDistanceM: distanceM,
})

const metrics = (d: number): RouteMetrics => ({
  planimetricDistanceM: d,
  surfaceDistanceM: d,
  ascentM: 0,
  descentM: 0,
  netElevationChangeM: 0,
  minElevationM: 0,
  maxElevationM: 0,
  maxSlopeDeg: 0,
  meanSlopeDeg: 0,
  maxEdgeGradeDeg: 0,
  cellCount: 2,
  totalCost: d,
  costPerMeter: 1,
})

const leg = (id: string, from: string, to: string, d: number, maxSlopeDeg: number): RouteLeg => ({
  id,
  fromLabel: from,
  toLabel: to,
  preference: 'shortest',
  maxSlopeDeg,
  costModel: null,
  connectivity: 8,
  vertices: [vertex(0), vertex(d)],
  metrics: metrics(d),
  search: { nodesExpanded: 0, elapsedMs: 0 },
})

export function syntheticRoundTrip(o: {
  outboundM: number[]
  returnM: number
  activityS: number[]
  maxSlopeDeg?: number
  datasetVersion?: string
}): RoundTripRoute {
  const maxSlopeDeg = o.maxSlopeDeg ?? 15
  const stops: RoundTripStop[] = o.activityS.map((s, i) => ({ id: `stop-${i + 1}`, label: `Stop ${i + 1}`, coordinate: { lonEast: 0, latNorth: 0 }, activityDurationS: s }))
  const labels = ['habitat', ...stops.map((s) => s.label)]
  const segments = o.outboundM.map((d, i) => leg(`outbound-${i + 1}`, labels[i]!, labels[i + 1]!, d, maxSlopeDeg))
  const total = o.outboundM.reduce((a, b) => a + b, 0)
  let acc = 0
  return {
    preference: 'shortest',
    maxSlopeDeg,
    costModel: null,
    habitat: { lonEast: 0, latNorth: 0 },
    habitatLabel: 'habitat',
    stops,
    outboundSegments: segments,
    outbound: {
      id: 'outbound',
      vertices: [vertex(0), vertex(total)],
      metrics: metrics(total),
      arrivals: stops.map((s, i) => {
        acc += o.outboundM[i]!
        return { stopId: s.id, label: s.label, distanceM: acc, surfaceDistanceM: acc }
      }),
    },
    inbound: leg('return', labels[labels.length - 1]!, 'habitat', o.returnM, maxSlopeDeg),
    totals: { planimetricDistanceM: total + o.returnM, surfaceDistanceM: total + o.returnM, ascentM: 0, descentM: 0, maxSlopeDeg: 0, totalCost: total + o.returnM },
    identicalLegs: false,
    datasetId: 'synthetic',
    datasetVersion: o.datasetVersion ?? 'synthetic-v1',
    modelVersion: ROUTING_MODEL_VERSION,
    provenance: { engine: ENGINE_NAME, engineVersion: 'test', model: 'synthetic', modelVersion: 'test', category: 'derived', inputs: [] },
  }
}

export function syntheticDaylight(o: { solStartUtcMs: number; sunriseUtcMs: number; sunsetUtcMs: number; solEndUtcMs: number; kind?: DaylightWindowOk['kind'] }): DaylightWindowOk {
  const kind = o.kind ?? 'normal'
  const normal = kind === 'normal'
  return {
    status: 'ok',
    kind,
    site: { lonEast: 0, latNorth: 0 },
    solStartUtcMs: o.solStartUtcMs,
    solEndUtcMs: o.solEndUtcMs,
    solarNoonUtcMs: (o.sunriseUtcMs + o.sunsetUtcMs) / 2,
    sunriseUtcMs: normal ? o.sunriseUtcMs : null,
    sunsetUtcMs: normal ? o.sunsetUtcMs : null,
    daylightDurationS: normal ? (o.sunsetUtcMs - o.sunriseUtcMs) / 1000 : kind === 'polar-day' ? 88775 : 0,
    sunriseLtstHours: normal ? 6 : null,
    sunsetLtstHours: normal ? 18 : null,
    solarLongitudeDegAtNoon: 0,
    solarDeclinationDegAtNoon: 0,
    noonElevationDeg: 60,
    marsSolDateAtNoon: 0,
    ttMinusUtcExtrapolated: false,
    approximations: [],
    provenance: { engine: ENGINE_NAME, engineVersion: 'test', model: 'synthetic', modelVersion: 'test', category: 'derived', inputs: [] },
  }
}

export const VERIFIED_TERRAIN = (version = 'synthetic-v1'): { version: string; verification: TerrainVerification } => ({
  version,
  verification: { pipelineValidation: 'passed', checksum: 'verified', verifiedForFeasibility: true, crossValidation: null, notes: [] },
})
