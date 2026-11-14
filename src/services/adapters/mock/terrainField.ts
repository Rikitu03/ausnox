/**
 * ILLUSTRATIVE TERRAIN. Not Mars data.
 *
 * A fixed analytic surface that stands in for the Jezero DEM while the real
 * preprocessing pipeline does not exist. It has a hill, a ridge, a bowl, a
 * scarp, two no-data pockets and an irregular footprint, so the UI can be
 * exercised against valid, steep, missing and out-of-coverage cells.
 *
 * Nothing here is derived from a NASA or USGS product. Elevations are metres
 * above an arbitrary zero.
 */
import type { GridCoord, GridSpec, TerrainRaster } from '@/services/contracts'

export const GRID: GridSpec = {
  widthCells: 200,
  heightCells: 150,
  cellSizeM: 20,
  widthM: 4000,
  heightM: 3000,
}

/** Demo DEM footprint: the AOI rectangle with two corners cut off. */
export const COVERAGE: GridCoord[] = [
  { x: 360, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 2240 },
  { x: 3240, y: 3000 },
  { x: 0, y: 3000 },
  { x: 0, y: 420 },
]

const NODATA_POCKETS = [
  { cx: 1500, cy: 2080, rx: 230, ry: 140 },
  { cx: 3020, cy: 820, rx: 130, ry: 210 },
]

const gauss = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) =>
  Math.exp(-((x - cx) ** 2 / (2 * sx * sx) + (y - cy) ** 2 / (2 * sy * sy)))

/** Elevation of the illustrative surface, metres above an arbitrary zero. */
export function elevationAt(x: number, y: number): number {
  return (
    120 +
    0.012 * x -
    0.006 * y +
    70 * gauss(x, y, 1950, 1450, 330, 330) +
    80 * gauss(x, y, 2650, 1780, 200, 300) -
    60 * gauss(x, y, 1000, 900, 260, 260) +
    22 * Math.tanh((y - (2380 + 0.12 * x)) / 95) +
    3.2 * Math.sin(x / 130) * Math.cos(y / 170) +
    1.6 * Math.sin((x + y) / 75)
  )
}

export function insideCoverage(x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = COVERAGE.length - 1; i < COVERAGE.length; j = i++) {
    const a = COVERAGE[i]!
    const b = COVERAGE[j]!
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function inNodataPocket(x: number, y: number): boolean {
  return NODATA_POCKETS.some((p) => ((x - p.cx) / p.rx) ** 2 + ((y - p.cy) / p.ry) ** 2 <= 1)
}

/** Builds the demo raster: elevation per cell centre, validity mask, and nodata-aware slope. */
export function buildRaster(): TerrainRaster {
  const { widthCells: w, heightCells: h, cellSizeM: c } = GRID
  const elevationM = new Float32Array(w * h).fill(NaN)
  const slopeDeg = new Float32Array(w * h).fill(NaN)
  const validity = new Uint8Array(w * h)

  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const x = (col + 0.5) * c
      const y = (row + 0.5) * c
      const i = row * w + col
      if (!insideCoverage(x, y)) validity[i] = 2
      else if (inNodataPocket(x, y)) validity[i] = 0
      else {
        validity[i] = 1
        elevationM[i] = elevationAt(x, y)
      }
    }
  }

  // Finite differences over valid neighbours only. A cell with no valid
  // neighbour pair on an axis has unknown slope and is demoted to nodata.
  const z = (col: number, row: number) =>
    col < 0 || row < 0 || col >= w || row >= h || validity[row * w + col] !== 1 ? NaN : elevationM[row * w + col]!
  const gradient = (a: number, mid: number, b: number) => {
    if (!Number.isNaN(a) && !Number.isNaN(b)) return (b - a) / (2 * c)
    if (!Number.isNaN(b)) return (b - mid) / c
    if (!Number.isNaN(a)) return (mid - a) / c
    return NaN
  }
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const i = row * w + col
      if (validity[i] !== 1) continue
      const mid = elevationM[i]!
      const dzdx = gradient(z(col - 1, row), mid, z(col + 1, row))
      const dzdy = gradient(z(col, row - 1), mid, z(col, row + 1))
      if (Number.isNaN(dzdx) || Number.isNaN(dzdy)) {
        validity[i] = 0
        elevationM[i] = NaN
      } else {
        slopeDeg[i] = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI
      }
    }
  }
  return { widthCells: w, heightCells: h, elevationM, slopeDeg, validity }
}
