import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { TerrainManifest, TerrainRaster } from '@/services/contracts'
import { hasElevation, rasterPoint, type TerrainFrame } from './TerrainCoordinates'

export const MAX_MESH_SAMPLES = 201

/** Bounded display LOD. A summed-area validity mask prevents ANY source no-data cell inside a
 * simplified quad from being bridged, including gaps between retained vertices. No averaging/filling.
 */
export function buildTerrainGeometry(manifest: TerrainManifest, raster: TerrainRaster, frame: TerrainFrame, maxSamples = MAX_MESH_SAMPLES) {
  const { widthCells: W, heightCells: H } = raster
  if (!Number.isInteger(W) || !Number.isInteger(H) || W < 2 || H < 2 || W !== manifest.grid.widthCells || H !== manifest.grid.heightCells ||
      [raster.elevationM.length, raster.slopeDeg.length, raster.validity.length].some((n) => n !== W * H) ||
      !Number.isInteger(maxSamples) || maxSamples < 2 || maxSamples > 256) throw new Error('Unsupported terrain raster dimensions or display LOD.')
  const axis = (n: number) => {
    const step = Math.ceil((n - 1) / (maxSamples - 1))
    const out = []
    for (let i = 0; i < n - 1; i += step) out.push(i)
    out.push(n - 1)
    return out
  }
  const cols = axis(W), rows = axis(H)
  const stride = W + 1
  const missing = new Uint32Array((W + 1) * (H + 1))
  for (let row = 0; row < H; row++) for (let col = 0; col < W; col++) {
    const at = (row + 1) * stride + col + 1
    missing[at] = (hasElevation(raster, row * W + col) ? 0 : 1) + missing[at - 1]! + missing[at - stride]! - missing[at - stride - 1]!
  }
  const positions = new Float32Array(cols.length * rows.length * 3)
  const uv = new Float32Array(cols.length * rows.length * 2)
  const sourceIndices: number[] = []
  let v = 0
  for (const row of rows) for (const col of cols) {
    const i = row * W + col
    const p = rasterPoint(manifest, col, row)
    // Invalid vertices are never indexed. Their unused storage is explicitly NOT a surface value.
    const w = hasElevation(raster, i) ? frame.gridToWorld(p, raster.elevationM[i]!) : null
    positions.set(w ? [w.x, w.y, w.z] : [NaN, NaN, NaN], v * 3)
    uv.set([(col + 0.5) / W, (row + 0.5) / H], v * 2)
    sourceIndices.push(i)
    v++
  }
  const indices: number[] = []
  for (let r = 0; r < rows.length - 1; r++) for (let c = 0; c < cols.length - 1; c++) {
    const x0 = cols[c]!, x1 = cols[c + 1]! + 1, y0 = rows[r]!, y1 = rows[r + 1]! + 1
    const count = missing[y1 * stride + x1]! - missing[y0 * stride + x1]! - missing[y1 * stride + x0]! + missing[y0 * stride + x0]!
    if (count) continue
    const a = r * cols.length + c, b = a + 1, d = a + cols.length, e = d + 1
    indices.push(a, b, d, b, e, d) // normals point UP: north is negative Z
  }
  if (!indices.length) throw new Error('No supported terrain triangles at this display resolution.')
  // Three computes bounds over unused vertices too. Keep unused storage finite AFTER masking,
  // but only indexed vertices are rendered/raycast; no zero-height no-data triangles can exist.
  for (let i = 0; i < positions.length; i++) if (!Number.isFinite(positions[i])) positions[i] = 0
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return { geometry, sourceIndices, columns: cols.length, rows: rows.length, triangles: indices.length / 3 }
}
