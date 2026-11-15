import { describe, expect, it } from 'vitest'
import {
  buildPassableMask,
  calculateRoundTrip,
  calculateRoundTripAsync,
  calculateRoute,
  calculateRouteAsync,
  compareRoutes,
  createLatestRequestGate,
  createRouteWorkerHandler,
  moveCost,
  roundTripToGeoJSON,
  type EdgeCostConfig,
  type TerrainDataset,
} from '../src/index.js'
import { cellGeo, makeSyntheticDataset, makeSyntheticManifestAndBuffer } from './helpers/syntheticGrid.js'

const flat = (w: number, h: number) => makeSyntheticDataset({ width: w, height: h, elevation: () => 0, slope: () => 0 })
const SHORT: EdgeCostConfig = { lowerSlope: false, slopeWeight: 0, slopeExponent: 2, uphillWeight: 0, downhillWeight: 0 }

/** Independent reference: plain Dijkstra with the engine's legality rules re-implemented. */
function dijkstra(d: TerrainDataset, start: number, goal: number, maxSlope: number, cost: EdgeCostConfig): number {
  const W = d.geometry.width
  const H = d.geometry.height
  const pass = buildPassableMask(d, maxSlope)
  const dist = new Float64Array(W * H).fill(Infinity)
  const done = new Uint8Array(W * H)
  dist[start] = 0
  for (;;) {
    let u = -1
    let best = Infinity
    for (let i = 0; i < W * H; i++) if (!done[i] && dist[i]! < best) { best = dist[i]!; u = i }
    if (u < 0) return Infinity
    if (u === goal) return best
    done[u] = 1
    const r = Math.floor(u / W)
    const c = u % W
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue
      const v = nr * W + nc
      if (!pass[u] || !pass[v]) continue
      if (dr && dc && (!pass[r * W + nc] || !pass[nr * W + c])) continue
      const e = moveCost(d, u, v, maxSlope, cost)
      if (e < 0) continue
      if (best + e < dist[v]!) dist[v] = best + e
    }
  }
}

describe('A* legality on synthetic fixtures (test-only grids, not Mars data)', () => {
  it('straight path on a flat grid: distance equals 10 cell widths', () => {
    const d = flat(20, 5)
    const r = calculateRoute(d, { start: cellGeo(d, 2, 2), destination: cellGeo(d, 2, 12), preference: 'shortest', maxSlopeDeg: 15 })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.leg.metrics.planimetricDistanceM).toBeCloseTo(10 * d.rowCellWidthsM[2]!, 6)
    expect(r.leg.vertices[0]!.cell).toEqual({ row: 2, col: 2 })
    expect(r.leg.vertices.at(-1)!.cell).toEqual({ row: 2, col: 12 })
    expect(r.leg.metrics.ascentM).toBe(0)
  })

  it('start = destination gives a zero-length path', () => {
    const d = flat(5, 5)
    const r = calculateRoute(d, { start: cellGeo(d, 2, 2), destination: cellGeo(d, 2, 2), preference: 'shortest', maxSlopeDeg: 15 })
    expect(r.status === 'ok' && r.leg.metrics.planimetricDistanceM).toBe(0)
    expect(r.status === 'ok' && r.leg.vertices.length).toBe(1)
  })

  it('no-data cells are never traversed and force a detour', () => {
    const d = makeSyntheticDataset({ width: 11, height: 11, elevation: (r, c) => (c === 5 && r >= 1 ? Number.NaN : 0), slope: () => 0 })
    const r = calculateRoute(d, { start: cellGeo(d, 8, 2), destination: cellGeo(d, 8, 8), preference: 'shortest', maxSlopeDeg: 15 })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    for (const v of r.leg.vertices) expect(Number.isFinite(d.elevationM[v.cell.row * 11 + v.cell.col]!)).toBe(true)
    expect(r.leg.vertices.some((v) => v.cell.row === 0 && v.cell.col === 5)).toBe(true)
  })

  it('unknown-slope cells are blocked like missing data', () => {
    const d = makeSyntheticDataset({ width: 7, height: 3, elevation: () => 0, slope: (_r, c) => (c === 3 ? Number.NaN : 0) })
    const r = calculateRoute(d, { start: cellGeo(d, 1, 1), destination: cellGeo(d, 1, 5), preference: 'shortest', maxSlopeDeg: 15 })
    expect(r.status === 'error' && r.code).toBe('NO_ROUTE')
  })

  it('no diagonal corner cutting between two blocked orthogonal cells', () => {
    // free: (0,0) and (1,1); blocked: (0,1) and (1,0)
    const blocked = new Set(['0,1', '1,0'])
    const d = makeSyntheticDataset({ width: 3, height: 3, elevation: (r, c) => (blocked.has(`${r},${c}`) ? Number.NaN : 0), slope: () => 0 })
    const r = calculateRoute(d, { start: cellGeo(d, 0, 0), destination: cellGeo(d, 1, 1), preference: 'shortest', maxSlopeDeg: 15 })
    expect(r.status === 'error' && r.code).toBe('NO_ROUTE')
    // one blocked orthogonal neighbour is enough to forbid the diagonal: detour required
    const d2 = makeSyntheticDataset({ width: 3, height: 3, elevation: (r, c) => (r === 0 && c === 1 ? Number.NaN : 0), slope: () => 0 })
    const r2 = calculateRoute(d2, { start: cellGeo(d2, 0, 0), destination: cellGeo(d2, 1, 1), preference: 'shortest', maxSlopeDeg: 15 })
    expect(r2.status === 'ok' && r2.leg.vertices.length).toBe(3)
  })

  it('slope threshold: cells steeper than the limit block the route; boundary value is allowed', () => {
    const d = makeSyntheticDataset({ width: 9, height: 1, elevation: () => 0, slope: (_r, c) => (c === 4 ? 15 : 3) })
    const at = calculateRoute(d, { start: cellGeo(d, 0, 0), destination: cellGeo(d, 0, 8), preference: 'shortest', maxSlopeDeg: 15 })
    expect(at.status).toBe('ok')
    const below = calculateRoute(d, { start: cellGeo(d, 0, 0), destination: cellGeo(d, 0, 8), preference: 'shortest', maxSlopeDeg: 14.99 })
    // measured terrain connects the points, only the slope limit blocks them
    expect(below.status === 'error' && below.code).toBe('UNSUPPORTED_SLOPE')
    expect(below.status === 'error' && below.details?.cause).toBe('slope-limit')
  })

  it('a move whose grade exceeds the limit is forbidden even between gentle cells', () => {
    // 10 m step between columns 3 and 4 (grade 10/2 = 78.7 deg) with cell slopes reported as 0
    const d = makeSyntheticDataset({ width: 8, height: 1, elevation: (_r, c) => (c >= 4 ? 10 : 0), slope: () => 0 })
    const r = calculateRoute(d, { start: cellGeo(d, 0, 0), destination: cellGeo(d, 0, 7), preference: 'shortest', maxSlopeDeg: 30 })
    expect(r.status === 'error' && r.code).toBe('UNSUPPORTED_SLOPE')
  })

  it('error codes: outside coverage, no data, steep endpoint, invalid input, dataset mismatch', () => {
    const d = makeSyntheticDataset({ width: 5, height: 5, elevation: (r, c) => (r === 0 && c === 0 ? Number.NaN : 0), slope: (r, c) => (r === 4 && c === 4 ? 40 : 0) })
    const ok = cellGeo(d, 2, 2)
    const code = (x: { status: string; code?: string }) => (x.status === 'error' ? x.code : 'ok')
    expect(code(calculateRoute(d, { start: { lonEast: 10, latNorth: 10 }, destination: ok, preference: 'shortest', maxSlopeDeg: 15 }))).toBe('NO_COVERAGE')
    expect(code(calculateRoute(d, { start: cellGeo(d, 0, 0), destination: ok, preference: 'shortest', maxSlopeDeg: 15 }))).toBe('NO_DATA')
    expect(code(calculateRoute(d, { start: ok, destination: cellGeo(d, 4, 4), preference: 'shortest', maxSlopeDeg: 15 }))).toBe('UNSUPPORTED_SLOPE')
    expect(code(calculateRoute(d, { start: ok, destination: ok, preference: 'shortest', maxSlopeDeg: -1 }))).toBe('INVALID_INPUT')
    expect(code(calculateRoute(d, { start: ok, destination: ok, preference: 'fastest' as never, maxSlopeDeg: 15 }))).toBe('INVALID_INPUT')
    expect(code(calculateRoute(d, { start: { lonEast: Number.NaN, latNorth: 0 }, destination: ok, preference: 'shortest', maxSlopeDeg: 15 }))).toBe('INVALID_INPUT')
    expect(code(calculateRoute(d, { start: ok, destination: ok, preference: 'shortest', maxSlopeDeg: 15, datasetVersion: 'stale' }))).toBe('DATASET_MISMATCH')
    expect(code(calculateRoute(d, { start: ok, destination: ok, preference: 'lower-slope', maxSlopeDeg: 15, costModel: { slopeWeight: -1 } }))).toBe('INVALID_INPUT')
  })

  it('disconnected regions give NO_ROUTE (no straight-line fallback)', () => {
    const d = makeSyntheticDataset({ width: 9, height: 9, elevation: (_r, c) => (c === 4 ? Number.NaN : 0), slope: () => 0 })
    const r = calculateRoute(d, { start: cellGeo(d, 4, 1), destination: cellGeo(d, 4, 7), preference: 'shortest', maxSlopeDeg: 15 })
    expect(r.status === 'error' && r.code).toBe('NO_ROUTE')
    expect(r.status === 'error' && r.details?.cause).toBe('disconnected')
  })

  it('timeout via injected clock and expansion budget', () => {
    // A no-data wall without a gap: the search must expand ~30 000 cells (several 4096-node
    // chunks) before failing, so the cooperative time check runs.
    const d = makeSyntheticDataset({ width: 200, height: 200, elevation: (_r, c) => (c === 150 ? Number.NaN : 0), slope: () => 0 })
    let t = 0
    const r = calculateRoute(
      d,
      { start: cellGeo(d, 100, 10), destination: cellGeo(d, 100, 190), preference: 'shortest', maxSlopeDeg: 15, limits: { timeoutMs: 5 } },
      { now: () => (t += 10) },
    )
    expect(r.status === 'error' && r.code).toBe('COMPUTATION_TIMEOUT')
    const f = flat(60, 60)
    const r2 = calculateRoute(f, { start: cellGeo(f, 0, 0), destination: cellGeo(f, 59, 59), preference: 'shortest', maxSlopeDeg: 15, limits: { maxExpansions: 10 } })
    expect(r2.status === 'error' && r2.code).toBe('COMPUTATION_TIMEOUT')
    let calls = 0
    const r3 = calculateRoute(
      d,
      { start: cellGeo(d, 100, 10), destination: cellGeo(d, 100, 190), preference: 'shortest', maxSlopeDeg: 15 },
      { shouldCancel: () => ++calls > 1 },
    )
    expect(r3.status === 'error' && r3.code).toBe('CANCELLED')
  })
})

describe('optimality vs an independent Dijkstra (deterministic pseudo-random terrain)', () => {
  const rough = (seed: number) => {
    let s = seed
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
    const z = Array.from({ length: 24 * 24 }, () => rnd() * 1.2)
    return makeSyntheticDataset({
      width: 24, height: 24,
      elevation: (r, c) => (rnd() < 0.08 ? Number.NaN : z[r * 24 + c]!),
      slope: () => rnd() * 18,
    })
  }
  for (const seed of [1, 7, 42]) {
    it(`seed ${seed}: A* cost equals Dijkstra cost in both modes`, () => {
      const d = rough(seed)
      const pass = buildPassableMask(d, 15)
      const free = [...pass.keys()].filter((i) => pass[i])
      const a = free[0]!
      const b = free[free.length - 1]!
      const geo = (i: number) => cellGeo(d, Math.floor(i / 24), i % 24)
      for (const pref of ['shortest', 'lower-slope'] as const) {
        const cost: EdgeCostConfig = pref === 'shortest' ? SHORT : { lowerSlope: true, slopeWeight: 4, slopeExponent: 2, uphillWeight: 0, downhillWeight: 0 }
        const ref = dijkstra(d, a, b, 15, cost)
        const r = calculateRoute(d, { start: geo(a), destination: geo(b), preference: pref, maxSlopeDeg: 15 })
        if (!Number.isFinite(ref)) {
          expect(r.status).toBe('error')
          expect(['NO_ROUTE', 'UNSUPPORTED_SLOPE']).toContain(r.status === 'error' ? r.code : 'ok')
        } else {
          expect(r.status).toBe('ok')
          if (r.status === 'ok') {
            expect(r.leg.metrics.totalCost).toBeCloseTo(ref, 6)
            expect(r.leg.metrics.totalCost).toBeGreaterThanOrEqual(r.leg.metrics.planimetricDistanceM - 1e-9)
          }
        }
      }
    })
  }
})

describe('route modes and round trips', () => {
  // Corridor fixture: a short middle row crossing a 12-14 deg band vs a long flat perimeter.
  const corridor = () => makeSyntheticDataset({
    width: 21, height: 9, elevation: () => 0,
    slope: (r, c) => (r >= 1 && r <= 7 && c >= 6 && c <= 14 ? 13 : 0),
  })

  it('shortest crosses the sloped band; lower-slope detours around it', () => {
    const d = corridor()
    const r = compareRoutes(d, { start: cellGeo(d, 4, 1), destination: cellGeo(d, 4, 19), maxSlopeDeg: 15 })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.shortest.metrics.maxSlopeDeg).toBe(13)
    expect(r.lowerSlope.metrics.maxSlopeDeg).toBe(0)
    expect(r.summary.extraDistanceM).toBeGreaterThan(0)
    expect(r.summary.identicalPath).toBe(false)
    expect(r.shortest.metrics.totalCost).toBeCloseTo(r.shortest.metrics.planimetricDistanceM, 9)
  })

  it('identical inputs give identical outputs (deterministic tie-breaking)', () => {
    const d = flat(30, 30)
    const req = { start: cellGeo(d, 3, 3), destination: cellGeo(d, 25, 17), preference: 'shortest' as const, maxSlopeDeg: 15 }
    const a = calculateRoute(d, req)
    const b = calculateRoute(d, req)
    expect(a.status === 'ok' && b.status === 'ok').toBe(true)
    if (a.status === 'ok' && b.status === 'ok') expect(a.leg.vertices.map((v) => v.cell)).toEqual(b.leg.vertices.map((v) => v.cell))
  })

  it('round trip: independent return, endpoints at habitat and destination, stops in order', () => {
    const d = corridor()
    const r = calculateRoundTrip(d, {
      habitat: cellGeo(d, 4, 1), habitatLabel: 'habitat', preference: 'shortest', maxSlopeDeg: 15,
      stops: [
        { id: 'a', label: 'A', coordinate: cellGeo(d, 0, 10), activityDurationS: 600 },
        { id: 'b', label: 'B', coordinate: cellGeo(d, 4, 19), activityDurationS: 900 },
      ],
    })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    const R = r.route
    expect(R.outboundSegments).toHaveLength(2)
    expect(R.outbound.vertices[0]!.cell).toEqual({ row: 4, col: 1 })
    expect(R.outbound.vertices.at(-1)!.cell).toEqual({ row: 4, col: 19 })
    expect(R.inbound.vertices[0]!.cell).toEqual({ row: 4, col: 19 })
    expect(R.inbound.vertices.at(-1)!.cell).toEqual({ row: 4, col: 1 })
    expect(R.outbound.arrivals.map((a) => a.stopId)).toEqual(['a', 'b'])
    expect(R.outbound.vertices.some((v) => v.cell.row === 0 && v.cell.col === 10)).toBe(true)
    expect(R.inbound.id).toBe('return')
    expect(R.totals.planimetricDistanceM).toBeCloseTo(R.outbound.metrics.planimetricDistanceM + R.inbound.metrics.planimetricDistanceM, 9)
    const gj = roundTripToGeoJSON(R)
    expect(gj.features[0]!.geometry.coordinates[0]).toEqual([R.outbound.vertices[0]!.geographic.lonEast, R.outbound.vertices[0]!.geographic.latNorth])
  })

  it('direction-sensitive cost: squared uphill penalty makes the return route differ from the outbound route', () => {
    // TEST-ONLY fixture. A (row 3, col 0, z = 0 m) and B (row 3, col 12, z = 3 m) are joined by
    //   north corridor (row 0): steady ramp, +0.25 m per column, 18 moves (36 m)
    //   south corridor (row 4): flat to col 8, then +0.75 m per column, 14 moves (28 m)
    // Rows 1-3 between the end columns are missing data. With uphill weight 50 and no downhill
    // weight, climbing A -> B is cheaper on the gentle north ramp (cost ~92 vs ~197), while the
    // descent B -> A has no grade penalty, so the shorter south corridor wins.
    const W = 13
    const d = makeSyntheticDataset({
      width: W,
      height: 5,
      elevation: (r, c) => {
        if (c === 0) return 0
        if (c === W - 1) return 3
        if (r >= 1 && r <= 3) return Number.NaN
        if (r === 0) return c * 0.25
        return c <= 8 ? 0 : (c - 8) * 0.75
      },
      slope: (r, c) => (r === 0 ? 7 : r === 4 && c >= 9 ? 20 : 0),
    })
    const A = cellGeo(d, 3, 0)
    const B = cellGeo(d, 3, W - 1)
    const policy = { maxSlopeDeg: 30, preference: 'lower-slope' as const, costModel: { slopeWeight: 0, uphillWeight: 50, downhillWeight: 0 } }
    const up = calculateRoute(d, { ...policy, start: A, destination: B })
    const down = calculateRoute(d, { ...policy, start: B, destination: A })
    expect(up.status === 'ok' && down.status === 'ok').toBe(true)
    if (up.status !== 'ok' || down.status !== 'ok') return
    const usesNorth = (vs: readonly { cell: { row: number } }[]) => vs.some((v) => v.cell.row === 0)
    expect(usesNorth(up.leg.vertices)).toBe(true)
    expect(usesNorth(down.leg.vertices)).toBe(false)
    expect(up.leg.metrics.ascentM).toBeCloseTo(3, 9)
    expect(down.leg.metrics.descentM).toBeCloseTo(3, 9)
    // Distance-only cost is symmetric: both directions take the shorter south corridor.
    const s1 = calculateRoute(d, { start: A, destination: B, preference: 'shortest', maxSlopeDeg: 30 })
    const s2 = calculateRoute(d, { start: B, destination: A, preference: 'shortest', maxSlopeDeg: 30 })
    expect(s1.status === 'ok' && usesNorth(s1.leg.vertices)).toBe(false)
    expect(s1.status === 'ok' && s2.status === 'ok' && s1.leg.metrics.planimetricDistanceM - s2.leg.metrics.planimetricDistanceM).toBeCloseTo(0, 9)
    const rt = calculateRoundTrip(d, { ...policy, habitat: A, stops: [{ id: 'b', label: 'B', coordinate: B, activityDurationS: 0 }] })
    expect(rt.status).toBe('ok')
    if (rt.status !== 'ok') return
    expect(rt.route.identicalLegs).toBe(false)
    expect(usesNorth(rt.route.outbound.vertices)).toBe(true)
    expect(usesNorth(rt.route.inbound.vertices)).toBe(false)
  })

  it('round-trip validation and failed-leg reporting', () => {
    const d = makeSyntheticDataset({ width: 9, height: 9, elevation: (_r, c) => (c === 4 ? Number.NaN : 0), slope: () => 0 })
    const bad = calculateRoundTrip(d, { habitat: cellGeo(d, 4, 1), preference: 'shortest', maxSlopeDeg: 15, stops: [] })
    expect(bad.status === 'error' && bad.code).toBe('INVALID_INPUT')
    const dup = calculateRoundTrip(d, { habitat: cellGeo(d, 4, 1), preference: 'shortest', maxSlopeDeg: 15, stops: [
      { id: 'x', label: 'x', coordinate: cellGeo(d, 1, 1), activityDurationS: 0 }, { id: 'x', label: 'x', coordinate: cellGeo(d, 2, 1), activityDurationS: 0 }] })
    expect(dup.status === 'error' && dup.code).toBe('INVALID_INPUT')
    const noRoute = calculateRoundTrip(d, { habitat: cellGeo(d, 4, 1), preference: 'shortest', maxSlopeDeg: 15, stops: [{ id: 'far', label: 'far', coordinate: cellGeo(d, 4, 7), activityDurationS: 0 }] })
    expect(noRoute.status === 'error' && noRoute.code).toBe('NO_ROUTE')
    expect(noRoute.status === 'error' && noRoute.failedLeg).toBe('outbound-1')
  })
})

describe('async, cancellation, worker and stale-request handling', () => {
  it('async route equals sync route and honours abort', async () => {
    const d = flat(40, 40)
    const req = { start: cellGeo(d, 1, 1), destination: cellGeo(d, 38, 30), preference: 'lower-slope' as const, maxSlopeDeg: 15 }
    const s = calculateRoute(d, req)
    const a = await calculateRouteAsync(d, req, { chunkExpansions: 50 })
    expect(a.status === 'ok' && s.status === 'ok' && a.leg.metrics.totalCost).toBeCloseTo(s.status === 'ok' ? s.leg.metrics.totalCost : 0, 9)
    const signal = { aborted: true }
    const c = await calculateRouteAsync(d, req, { signal })
    expect(c.status === 'error' && c.code).toBe('CANCELLED')
    const rt = await calculateRoundTripAsync(d, { habitat: cellGeo(d, 1, 1), preference: 'shortest', maxSlopeDeg: 15, stops: [{ id: 'x', label: 'x', coordinate: cellGeo(d, 30, 30), activityDurationS: 0 }] })
    expect(rt.status).toBe('ok')
  })

  it('worker handler: load, route, version mismatch, no dataset', async () => {
    const h = createRouteWorkerHandler()
    const noDs = await h({ type: 'route', requestId: 'r0', datasetVersion: 'x', request: {} as never })
    expect(noDs.type === 'error' && noDs.error.code).toBe('DATASET_UNAVAILABLE')
    const { manifest, buffer } = makeSyntheticManifestAndBuffer({ width: 10, height: 10, elevation: () => 0, slope: () => 0 })
    const loaded = await h({ type: 'load', requestId: 'l1', manifest, buffer, verifyChecksum: false })
    expect(loaded.type).toBe('loaded')
    if (loaded.type !== 'loaded') return
    const badSum = await h({ type: 'load', requestId: 'l2', manifest, buffer })
    expect(badSum.type === 'error' && badSum.error.code).toBe('DATASET_INTEGRITY')
    const d = makeSyntheticDataset({ width: 10, height: 10, elevation: () => 0, slope: () => 0 })
    const res = await h({ type: 'round-trip', requestId: 'q1', datasetVersion: loaded.datasetVersion, request: {
      habitat: cellGeo(d, 1, 1), preference: 'shortest', maxSlopeDeg: 15, stops: [{ id: 's', label: 's', coordinate: cellGeo(d, 8, 8), activityDurationS: 60 }] } })
    expect(res.type === 'result' && res.requestId).toBe('q1')
    expect(res.type === 'result' && (res.result as { status: string }).status).toBe('ok')
    const stale = await h({ type: 'route', requestId: 'q2', datasetVersion: 'other', request: {} as never })
    expect(stale.type === 'error' && stale.error.code).toBe('DATASET_MISMATCH')
  })

  it('latest-request gate drops superseded responses', () => {
    const gate = createLatestRequestGate()
    const first = gate.issue()
    const second = gate.issue()
    expect(gate.isLatest(first)).toBe(false)
    expect(gate.isLatest(second)).toBe(true)
  })
})
