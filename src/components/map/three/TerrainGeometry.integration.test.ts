// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRealServices } from '@/services/adapters/real'
import type { GridCoord, TerrainManifest, TerrainRaster, TerrainService } from '@/services/contracts'
import { createTerrainFrame, focusBounds, rasterPoint, surfacePath } from './TerrainCoordinates'
import { buildTerrainGeometry } from './TerrainMesh'
import { terrainPixels } from './TerrainMaterial'

const PUBLIC = fileURLToPath(new URL('../../../../public/', import.meta.url))
const diskFetch = async (url: string) => {
  try { return new Response(readFileSync(PUBLIC + url.replace(/^\//, ''))) } catch { return new Response('', { status: 404 }) }
}
const svc = createRealServices({ baseUrl: '/', fetch: diskFetch, useWorker: false, probeImagery: false })
let manifest: TerrainManifest, raster: TerrainRaster
beforeAll(async () => {
  const result = await svc.terrain.load()
  if (result.status === 'error') throw new Error(result.detail)
  manifest = result.manifest; raster = result.raster
})

describe('actual committed Jezero DEM -> Three.js', () => {
  it('maps southwest-origin grid coordinates east, up and north = negative Z', () => {
    const f = createTerrainFrame(manifest, svc.terrain)
    const a = f.gridToWorld({ x: 1, y: 1 }, -2540)
    const east = f.gridToWorld({ x: 3, y: 1 }, -2530)
    const north = f.gridToWorld({ x: 1, y: 3 }, -2540)
    expect(east.x - a.x).toBeCloseTo(1.897134, 5)
    expect(north.z - a.z).toBeCloseTo(-2, 8)
    expect(east.y - a.y).toBe(10)
    expect(a.y).toBeGreaterThan(0)
    expect(f.worldToGrid(a)).toEqual({ x: 1, y: 1 })
  })
  it('round-trips real geographic, projected-grid and world coordinates through the existing adapter', () => {
    const f = createTerrainFrame(manifest, svc.terrain)
    for (const p of [{ x: 1, y: 1 }, { x: 801, y: 967 }, { x: 1599, y: 1599 }]) {
      const geo = f.toGeo(p)!, back = f.fromGeo(geo)!
      expect(back.x).toBeCloseTo(p.x, 7); expect(back.y).toBeCloseTo(p.y, 7)
      const world = f.surface(p)
      expect(f.worldToGrid(world).x).toBeCloseTo(p.x, 7)
      expect(f.worldToGrid(world).y).toBeCloseTo(p.y, 7)
      // The centre-latitude tangent-plane approximation is <0.01% from geodesic cell spacing.
      const q = { x: p.x + 1, y: p.y }
      expect(Math.abs((f.gridToWorld(q, 0).x - f.gridToWorld(p, 0).x) / svc.terrain.groundDistanceM(p, q)! - 1)).toBeLessThan(0.0001)
    }
  })
  it('retains source cell-centre elevation values and north/south raster orientation without flattening', () => {
    const frame = createTerrainFrame(manifest, svc.terrain)
    const result = buildTerrainGeometry(manifest, raster, frame)
    expect(result.columns).toBe(201); expect(result.rows).toBe(201)
    expect(result.triangles).toBe(80_000)
    const position = result.geometry.getAttribute('position')
    const binary = readFileSync(PUBLIC + 'data/jezero/terrain.bin')
    let low = Infinity, high = -Infinity
    for (let v = 0; v < result.sourceIndices.length; v += 137) {
      const i = result.sourceIndices[v]!, row = Math.floor(i / raster.widthCells), col = i % raster.widthCells
      const engineIndex = (raster.heightCells - 1 - row) * raster.widthCells + col
      const sourceElevation = binary.readFloatLE(engineIndex * 4)
      expect(raster.elevationM[i]).toBe(sourceElevation)
      expect(position.getY(v)).toBeCloseTo(sourceElevation - frame.referenceM, 4)
      const p = rasterPoint(manifest, col, row)
      expect(svc.terrain.sample(p).elevationM).toBe(sourceElevation)
      expect(position.getX(v)).toBeCloseTo(frame.gridToWorld(p, sourceElevation).x, 3)
      expect(position.getZ(v)).toBeCloseTo(frame.gridToWorld(p, sourceElevation).z, 3)
      low = Math.min(low, position.getY(v)); high = Math.max(high, position.getY(v))
    }
    expect(high - low).toBeGreaterThan(100)
    expect(result.geometry.getAttribute('normal').getY(1000)).toBeGreaterThan(0)
    result.geometry.dispose()
  })
  it('aligns real A* outbound/independent return vertices and markers with full-resolution measured elevation', async () => {
    await svc.mapData.listWaypoints()
    const sample = svc.sampleMission()!
    const destination = svc.terrain.nearestValid(sample.destination.position, 400, 15)!
    const result = await svc.routing.computeRoundTrip({ requestId: '3d-real', datasetId: manifest.datasetId, habitat: sample.habitat,
      waypoints: [...sample.stops.map((s) => ({ ...s })), { label: 'destination', position: destination }], mode: 'shortest', maxSlopeDeg: 15 })
    if (result.status === 'error') throw new Error(result.detail)
    const f = createTerrainFrame(manifest, svc.terrain)
    for (const leg of [result.route.outbound, result.route.inbound]) {
      for (const p of surfacePath(leg.path, f, manifest.grid.cellSizeM)) {
        expect(p.y - 0.7 + f.referenceM).toBe(svc.terrain.sample(f.worldToGrid(p)).elevationM)
      }
    }
    for (const p of [sample.habitat, destination, ...sample.stops.map((s) => s.position)]) {
      const w = f.surface(p, 2)
      expect(w.y - 2 + f.referenceM).toBe(svc.terrain.sample(p).elevationM)
    }
    expect(focusBounds([f.surface(sample.habitat)]).center).toEqual(f.surface(sample.habitat))
  })
  it('changes only visual height at 3x; source arrays, measured slope and route service are unchanged', () => {
    const p = { x: 805, y: 805 }, original = svc.terrain.sample(p)
    const before = raster.elevationM.slice()
    const one = createTerrainFrame(manifest, svc.terrain), three = createTerrainFrame(manifest, svc.terrain, 3)
    expect(three.surface(p).y).toBeCloseTo(one.surface(p).y * 3, 8)
    expect(three.surface(p).x).toBe(one.surface(p).x)
    expect(three.surface(p).z).toBe(one.surface(p).z)
    expect(svc.terrain.sample(p)).toEqual(original)
    expect(raster.elevationM).toEqual(before)
  })
  it('distinguishes unknown slope on the actual edge ring from known gentle slope', () => {
    const pixels = terrainPixels(manifest, raster, 'slope')
    expect(raster.validity[0]).toBe(3)
    expect([...pixels.slice(0, 3)]).toEqual([210, 210, 210])
    expect(svc.terrain.sample({ x: 1, y: 1 }).validity).toBe('slope-unknown')
  })
  it('rejects unsupported manifests, dimensions, coordinates and surface overlays', () => {
    expect(() => createTerrainFrame({ ...manifest, status: 'unverified' }, svc.terrain)).toThrow(/verified/)
    expect(() => createTerrainFrame({ ...manifest, grid: { ...manifest.grid, groundExtentM: undefined } }, svc.terrain)).toThrow(/spacing/)
    const f = createTerrainFrame(manifest, svc.terrain)
    expect(() => f.surface({ x: -1, y: 500 })).toThrow(/No measured elevation/)
    expect(() => f.worldToGrid({ x: NaN, z: 0 })).toThrow(/Non-finite/)
    expect(() => focusBounds([{ x: NaN, y: 0, z: 0 }])).toThrow(/valid coordinates/)
    expect(() => buildTerrainGeometry(manifest, { ...raster, widthCells: 1 }, f)).toThrow(/dimensions/)
  })
})

describe('deterministic test-only no-data fixture', () => {
  it('never bridges a missing source cell skipped by mesh decimation; unknown slope still has elevation', () => {
    const small: TerrainRaster = { widthCells: 9, heightCells: 9, elevationM: new Float32Array(81).fill(-100), slopeDeg: new Float32Array(81), validity: new Uint8Array(81).fill(1) }
    const m = { ...manifest, grid: { ...manifest.grid, widthCells: 9, heightCells: 9, widthM: 18, heightM: 18, groundExtentM: { eastWest: 17, northSouth: 18 } }, elevationRangeM: [-110, -90] as [number, number] }
    const sample: TerrainService['sample'] = (p: GridCoord) => {
      const col = Math.floor(p.x / 2), row = Math.floor(p.y / 2), i = row * 9 + col
      return { grid: p, geo: null, cell: { row, col }, validity: small.validity[i] === 0 ? 'nodata' : 'valid', elevationM: small.validity[i] === 0 ? null : small.elevationM[i]!, slopeDeg: 0 }
    }
    const terrain = { ...svc.terrain, sample }
    const frame = createTerrainFrame(m, terrain)
    const full = buildTerrainGeometry(m, small, frame, 3)
    expect(full.triangles).toBe(8)
    full.geometry.dispose()
    // (2,2) is inside a simplified quad, not a retained vertex.
    small.validity[2 * 9 + 2] = 0; small.elevationM[2 * 9 + 2] = NaN
    small.validity[8] = 3; small.slopeDeg[8] = NaN
    const hole = buildTerrainGeometry(m, small, frame, 3)
    expect(hole.triangles).toBe(6)
    const idx = hole.geometry.index!.array
    expect([...idx]).not.toContain(0)
    expect(() => surfacePath([{ x: 1, y: 5 }, { x: 17, y: 5 }], frame, 2)).toThrow(/No measured elevation/)
    expect(terrainPixels(m, small, 'slope')[8 * 4 + 3]).toBe(255)
    expect(terrainPixels(m, small, 'relief')[(2 * 9 + 2) * 4 + 3]).toBe(0)
    hole.geometry.dispose()
  })
})
