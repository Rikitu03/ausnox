import type { GridCoord, TerrainManifest, TerrainRaster, TerrainService } from '@/services/contracts'

export interface WorldPoint { x: number; y: number; z: number }

/** Local tangent-plane approximation at the AOI centre. All world dimensions are ground metres.
 * The verified adapter owns geographic/projected conversion; no Earth CRS is introduced here.
 * X east, Y up, Z south. The common vertical origin is the minimum measured areoid elevation.
 */
export function createTerrainFrame(manifest: TerrainManifest, terrain: TerrainService, verticalScale = 1) {
  const g = manifest.grid
  const extent = g.groundExtentM
  if (manifest.status !== 'verified' || manifest.georeference.kind !== 'verified' ||
      manifest.georeference.latitudeType !== 'planetocentric' || !extent ||
      ![g.widthM, g.heightM, extent.eastWest, extent.northSouth, verticalScale].every((v) => Number.isFinite(v) && v > 0) ||
      !manifest.elevationRangeM.every(Number.isFinite)) {
    throw new Error('3D requires a verified Mars terrain manifest with measured ground spacing and elevation bounds.')
  }
  const eastScale = extent.eastWest / g.widthM
  const northScale = extent.northSouth / g.heightM
  const referenceM = manifest.elevationRangeM[0]
  const gridToWorld = (p: GridCoord, elevationM: number): WorldPoint => {
    if (![p.x, p.y, elevationM].every(Number.isFinite)) throw new Error('Non-finite terrain coordinate or elevation.')
    return { x: (p.x - g.widthM / 2) * eastScale, y: (elevationM - referenceM) * verticalScale, z: -(p.y - g.heightM / 2) * northScale }
  }
  const worldToGrid = (p: Pick<WorldPoint, 'x' | 'z'>): GridCoord => {
    if (![p.x, p.z].every(Number.isFinite)) throw new Error('Non-finite camera or picking coordinate.')
    return { x: p.x / eastScale + g.widthM / 2, y: -p.z / northScale + g.heightM / 2 }
  }
  const surface = (p: GridCoord, offsetM = 0): WorldPoint => {
    const sample = terrain.sample(p)
    if ((sample.validity !== 'valid' && sample.validity !== 'slope-unknown') || sample.elevationM === null || !Number.isFinite(sample.elevationM)) {
      throw new Error(`No measured elevation at x ${p.x.toFixed(2)}, y ${p.y.toFixed(2)}. Overlay omitted.`)
    }
    const w = gridToWorld(p, sample.elevationM)
    return { ...w, y: w.y + offsetM }
  }
  return {
    gridToWorld, worldToGrid, surface, referenceM, verticalScale,
    toGeo: terrain.toGeo, fromGeo: terrain.fromGeo,
    widthM: extent.eastWest, depthM: extent.northSouth,
    heightM: (manifest.elevationRangeM[1] - referenceM) * verticalScale,
  }
}

export type TerrainFrame = ReturnType<typeof createTerrainFrame>

/** Cell-centre registration in the FRONTEND raster: row zero is SOUTH. */
export function rasterPoint(manifest: TerrainManifest, col: number, row: number): GridCoord {
  return { x: (col + 0.5) * manifest.grid.widthM / manifest.grid.widthCells, y: (row + 0.5) * manifest.grid.heightM / manifest.grid.heightCells }
}

export function hasElevation(raster: TerrainRaster, i: number) {
  return (raster.validity[i] === 1 || raster.validity[i] === 3) && Number.isFinite(raster.elevationM[i])
}

/** Every route segment is sampled at <= half a source cell. Missing elevations cause an explicit error.
 * This samples the original raster, never the simplified display mesh or a smoothed curve.
 */
export function surfacePath(path: GridCoord[], frame: TerrainFrame, cellSizeM: number, offsetM = 0.7): WorldPoint[] {
  if (!Number.isFinite(cellSizeM) || cellSizeM <= 0) throw new Error('Invalid route sampling interval.')
  const points: WorldPoint[] = []
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!
    const previous = path[i - 1]
    if (previous) {
      const steps = Math.ceil(Math.hypot(p.x - previous.x, p.y - previous.y) / (cellSizeM / 2))
      if (!Number.isFinite(steps) || steps > 100_000) throw new Error('Invalid route segment.')
      for (let j = 1; j < steps; j++) {
        const t = j / steps
        points.push(frame.surface({ x: previous.x + (p.x - previous.x) * t, y: previous.y + (p.y - previous.y) * t }, offsetM))
      }
    }
    points.push(frame.surface(p, offsetM))
  }
  return points
}

/** Finite focus bounds shared by fit-terrain, fit-route and point focus. */
export function focusBounds(points: WorldPoint[]) {
  if (!points.length || !points.every((p) => [p.x, p.y, p.z].every(Number.isFinite))) throw new Error('No valid coordinates to focus.')
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const p of points) for (const axis of ['x', 'y', 'z'] as const) { min[axis] = Math.min(min[axis], p[axis]); max[axis] = Math.max(max[axis], p[axis]) }
  return { min, max, center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 }, radius: Math.max(70, Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2) }
}
