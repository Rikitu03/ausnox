/**
 * DEMONSTRATION ROUTING. Not pathfinding.
 *
 * For each segment the adapter considers a fixed fan of arcs between the two
 * points (one straight line and six bowed ones), samples the terrain service
 * along each arc, throws away arcs that touch missing data or exceed the slope
 * limit, and picks one by a simple rule per mode. The real engine replaces this
 * with A* on the validated terrain grid (docs/SCIENTIFIC_MODELS.md §4).
 */
import type {
  GridCoord,
  RouteLeg,
  RouteRequest,
  RouteResult,
  RouteSample,
  RoutingService,
  ServiceErrorCode,
  TerrainService,
} from '@/services/contracts'
import { getScenario, latency, mockError, mockSource, MOCK_VERSION, wait } from './scenario'

const BOWS = [0, 0.14, -0.14, 0.28, -0.28, 0.42, -0.42]
const STEP_M = 10

interface Candidate {
  bow: number
  samples: RouteSample[]
  distanceM: number
  ascentM: number
  descentM: number
  maxSlopeDeg: number
}

type Rejection = 'NO_DATA' | 'NO_COVERAGE' | 'UNSUPPORTED_SLOPE'

function arcPoints(a: GridCoord, b: GridCoord, bow: number): GridCoord[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const n = Math.max(2, Math.ceil(len / STEP_M))
  // Quadratic Bézier with the control point pushed sideways by `bow` × length.
  const cx = (a.x + b.x) / 2 - (b.y - a.y) * bow
  const cy = (a.y + b.y) / 2 + (b.x - a.x) * bow
  const pts: GridCoord[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    pts.push({ x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y })
  }
  return pts
}

function evaluate(
  terrain: TerrainService,
  a: GridCoord,
  b: GridCoord,
  bow: number,
  maxSlopeDeg: number,
): Candidate | Rejection {
  const pts = arcPoints(a, b, bow)
  const samples: RouteSample[] = []
  let distanceM = 0
  let ascentM = 0
  let descentM = 0
  let maxSlope = 0
  let tooSteep = false
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const s = terrain.sample(p)
    if (s.validity === 'outside-coverage') return 'NO_COVERAGE'
    if (s.validity !== 'valid') return 'NO_DATA'
    if (i > 0) {
      const prev = samples[i - 1]!
      distanceM += Math.hypot(p.x - prev.grid.x, p.y - prev.grid.y)
      const dz = s.elevationM! - prev.elevationM
      if (dz > 0) ascentM += dz
      else descentM -= dz
    }
    if (s.slopeDeg! > maxSlopeDeg) tooSteep = true
    maxSlope = Math.max(maxSlope, s.slopeDeg!)
    samples.push({ grid: p, distanceM, elevationM: s.elevationM!, slopeDeg: s.slopeDeg! })
  }
  if (tooSteep) return 'UNSUPPORTED_SLOPE'
  return { bow, samples, distanceM, ascentM, descentM, maxSlopeDeg: maxSlope }
}

function pickSegment(
  terrain: TerrainService,
  a: GridCoord,
  b: GridCoord,
  mode: RouteRequest['mode'],
  maxSlopeDeg: number,
): Candidate | Rejection {
  const rejections: Rejection[] = []
  const legal: Candidate[] = []
  for (const bow of BOWS) {
    const r = evaluate(terrain, a, b, bow, maxSlopeDeg)
    if (typeof r === 'string') rejections.push(r)
    else legal.push(r)
  }
  if (legal.length === 0) {
    // Report the slope limit when it is the reason at least one arc failed, otherwise missing data.
    return rejections.includes('UNSUPPORTED_SLOPE') ? 'UNSUPPORTED_SLOPE' : rejections[0]!
  }
  // Shortest: least distance. Lower slope: penalise steepness and climbing, so direction matters.
  const cost = (c: Candidate) =>
    mode === 'shortest' ? c.distanceM : c.distanceM * (1 + 2.5 * (c.maxSlopeDeg / maxSlopeDeg) ** 2) + 6 * c.ascentM
  return legal.reduce((best, c) => (cost(c) < cost(best) - 1e-9 ? c : best))
}

function buildLeg(
  terrain: TerrainService,
  id: RouteLeg['id'],
  points: { label: string; position: GridCoord }[],
  mode: RouteRequest['mode'],
  maxSlopeDeg: number,
): { leg: RouteLeg; bows: number[] } | { code: ServiceErrorCode; detail: string } {
  const samples: RouteSample[] = []
  const waypointDistancesM: RouteLeg['waypointDistancesM'] = []
  const bows: number[] = []
  let offset = 0
  let ascentM = 0
  let descentM = 0
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!
    const to = points[i + 1]!
    const seg = pickSegment(terrain, from.position, to.position, mode, maxSlopeDeg)
    if (typeof seg === 'string') {
      const between = `between ${from.label} and ${to.label}`
      if (seg === 'UNSUPPORTED_SLOPE') {
        return {
          code: 'UNSUPPORTED_SLOPE',
          detail: `Every demonstration arc ${between} crosses terrain steeper than the ${maxSlopeDeg}° limit`,
        }
      }
      return {
        code: 'NO_ROUTE',
        detail: `Every demonstration arc ${between} crosses cells without terrain data. The demo adapter cannot route around them`,
      }
    }
    bows.push(seg.bow)
    for (const s of seg.samples.slice(i === 0 ? 0 : 1)) samples.push({ ...s, distanceM: s.distanceM + offset })
    offset += seg.distanceM
    ascentM += seg.ascentM
    descentM += seg.descentM
    waypointDistancesM.push({ label: to.label, distanceM: offset })
  }
  const maxSlope = samples.reduce((m, s) => Math.max(m, s.slopeDeg), 0)
  const meanSlope = samples.reduce((sum, s) => sum + s.slopeDeg, 0) / samples.length
  return {
    leg: {
      id,
      path: samples.map((s) => s.grid),
      samples,
      distanceM: offset,
      ascentM,
      descentM,
      maxSlopeDeg: maxSlope,
      meanSlopeDeg: meanSlope,
      waypointDistancesM,
    },
    bows,
  }
}

export function createMockRouting(terrain: TerrainService): RoutingService {
  const adapter = 'mock-routing'
  return {
    async computeRoundTrip(request, signal): Promise<RouteResult> {
      if (getScenario() === 'routing-timeout') {
        await wait(latency.ms * 4, signal)
        return mockError(adapter, 'TIMEOUT', 'Route calculation exceeded its time budget (demo scenario)')
      }
      await wait(latency.ms * 1.6, signal)

      if (!(request.maxSlopeDeg > 0) || request.waypoints.length === 0) {
        return mockError(adapter, 'INVALID_INPUT', 'A route needs a destination and a positive slope limit')
      }
      const all = [{ label: 'Habitat', position: request.habitat }, ...request.waypoints]
      for (const p of all) {
        const s = terrain.sample(p.position)
        if (s.validity === 'unavailable') {
          return mockError(adapter, 'DATA_UNAVAILABLE', 'Terrain data is not loaded, so no route can be calculated')
        }
        if (s.validity === 'outside-coverage') {
          return mockError(adapter, 'NO_COVERAGE', `${p.label} is outside terrain coverage`)
        }
        if (s.validity === 'nodata') {
          return mockError(adapter, 'NO_DATA', `${p.label} sits on a cell without terrain data`)
        }
        if (s.slopeDeg! > request.maxSlopeDeg) {
          return mockError(
            adapter,
            'UNSUPPORTED_SLOPE',
            `${p.label} sits on terrain steeper than the ${request.maxSlopeDeg}° limit`,
          )
        }
      }

      const destination = all[all.length - 1]!
      const outbound = buildLeg(terrain, 'outbound', all, request.mode, request.maxSlopeDeg)
      if ('code' in outbound) return mockError(adapter, outbound.code, `Outbound: ${outbound.detail}`)
      // The return leg is chosen on its own, in its own direction, straight back to the habitat.
      const inbound = buildLeg(terrain, 'return', [destination, all[0]!], request.mode, request.maxSlopeDeg)
      if ('code' in inbound) return mockError(adapter, inbound.code, `Return: ${inbound.detail}`)

      const identicalLegs =
        all.length === 2 && outbound.bows.length === 1 && Math.abs(outbound.bows[0]! + inbound.bows[0]!) < 1e-9

      return {
        status: 'ok',
        source: mockSource(adapter, 'Demonstration geometry. Not a pathfinding result'),
        requestId: request.requestId,
        route: {
          mode: request.mode,
          outbound: outbound.leg,
          inbound: inbound.leg,
          totalDistanceM: outbound.leg.distanceM + inbound.leg.distanceM,
          maxSlopeDeg: Math.max(outbound.leg.maxSlopeDeg, inbound.leg.maxSlopeDeg),
          identicalLegs,
          datasetId: request.datasetId,
          modelVersion: MOCK_VERSION,
          terrainAwarePathfinding: false,
          method:
            'Best of seven fixed arcs per segment, sampled every 10 m on the illustrative surface. A* pathfinding is not implemented yet',
        },
      }
    },
  }
}
