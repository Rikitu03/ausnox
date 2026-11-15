/**
 * Raster rendering of the REAL terrain grid for the map (one pixel per 2 m cell, north up).
 * The engine arrays are already north-up, so canvas row r is engine row r. Nothing is interpolated
 * or filled: cells without data stay transparent, cells with unknown slope are hatched.
 */
import type { TerrainDataset } from '@ausnox/scientific-engine'

export const SLOPE_CLASSES = [
  { maxDeg: 5, label: 'Under 5°', rgba: [0, 0, 0, 0] as const, pattern: 'solid' as const },
  { maxDeg: 10, label: '5 to 10°', rgba: [227, 187, 92, 60] as const, pattern: 'solid' as const },
  { maxDeg: 15, label: '10 to 15°', rgba: [217, 138, 78, 125] as const, pattern: 'solid' as const },
  { maxDeg: Infinity, label: 'Over 15°', rgba: [205, 84, 62, 170] as const, pattern: 'hatch' as const },
]

export const ELEVATION_RAMP: [number, number, number][] = [
  [38, 32, 30],
  [98, 66, 48],
  [185, 126, 86],
  [233, 206, 170],
]

function canvasFor(d: TerrainDataset): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; image: ImageData } | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = d.geometry.width
  canvas.height = d.geometry.height
  let ctx: CanvasRenderingContext2D | null
  try {
    ctx = canvas.getContext('2d')
  } catch {
    ctx = null
  }
  if (!ctx) return null
  return { canvas, ctx, image: ctx.createImageData(canvas.width, canvas.height) }
}

async function toUrl(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, image: ImageData): Promise<string> {
  ctx.putImageData(image, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png')
}

export async function renderSlope(d: TerrainDataset): Promise<string | null> {
  const c = canvasFor(d)
  if (!c) return null
  const { width: W, height: H } = d.geometry
  const px = c.image.data
  for (let r = 0; r < H; r++) {
    for (let col = 0; col < W; col++) {
      const i = r * W + col
      const o = i * 4
      const f = d.flags[i]!
      if ((f & 1) === 0) continue // no elevation: transparent
      if ((f & 2) === 0) {
        // measured elevation, unknown slope: grey hatch, never shown as gentle terrain
        const stripe = (r + col) % 6 < 2
        px[o] = px[o + 1] = px[o + 2] = stripe ? 200 : 90
        px[o + 3] = stripe ? 200 : 110
        continue
      }
      const s = d.slopeDeg[i]!
      const cls = SLOPE_CLASSES.find((k) => s < k.maxDeg)!
      const hatch = cls.pattern === 'hatch' && (r + col) % 6 < 2
      px[o] = cls.rgba[0]
      px[o + 1] = cls.rgba[1]
      px[o + 2] = cls.rgba[2]
      px[o + 3] = hatch ? 235 : cls.rgba[3]
    }
  }
  return toUrl(c.canvas, c.ctx, c.image)
}

export async function renderElevation(d: TerrainDataset, range: [number, number]): Promise<string | null> {
  const c = canvasFor(d)
  if (!c) return null
  const px = c.image.data
  const span = range[1] - range[0] || 1
  for (let i = 0; i < d.elevationM.length; i++) {
    if ((d.flags[i]! & 1) === 0) continue
    const t = Math.max(0, Math.min(0.9999, (d.elevationM[i]! - range[0]) / span)) * 3
    const a = ELEVATION_RAMP[Math.floor(t)]!
    const b = ELEVATION_RAMP[Math.floor(t) + 1]!
    const f = t - Math.floor(t)
    const o = i * 4
    px[o] = a[0] + (b[0] - a[0]) * f
    px[o + 1] = a[1] + (b[1] - a[1]) * f
    px[o + 2] = a[2] + (b[2] - a[2]) * f
    px[o + 3] = 205
  }
  return toUrl(c.canvas, c.ctx, c.image)
}

/**
 * Shaded relief of the DTM (Horn gradients with physical cell spacing; light from the north-west at 45°,
 * the cartographic convention). A visual aid derived from the elevation data, not an image of Mars.
 */
export async function renderHillshade(d: TerrainDataset): Promise<string | null> {
  const c = canvasFor(d)
  if (!c) return null
  const { width: W, height: H } = d.geometry
  const z = d.elevationM
  const px = c.image.data
  const az = (315 * Math.PI) / 180
  const alt = (45 * Math.PI) / 180
  const L = [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)] as const
  const dy = d.cellHeightM
  for (let r = 0; r < H; r++) {
    const dx = d.rowCellWidthsM[r]!
    for (let col = 0; col < W; col++) {
      const i = r * W + col
      const o = i * 4
      if ((d.flags[i]! & 1) === 0) continue
      if (r === 0 || col === 0 || r === H - 1 || col === W - 1) {
        px[o] = px[o + 1] = px[o + 2] = 96
        px[o + 3] = 255
        continue
      }
      const a = z[i - W - 1]!, b = z[i - W]!, cc = z[i - W + 1]!
      const dd = z[i - 1]!, f = z[i + 1]!
      const g = z[i + W - 1]!, h = z[i + W]!, ii = z[i + W + 1]!
      // x east, y north; row r-1 is north of row r
      const dzdx = ((cc + 2 * f + ii) - (a + 2 * dd + g)) / (8 * dx)
      const dzdy = ((a + 2 * b + cc) - (g + 2 * h + ii)) / (8 * dy)
      const n = Math.hypot(dzdx, dzdy, 1)
      const shade = Number.isFinite(n) ? Math.max(0, (-dzdx * L[0] - dzdy * L[1] + L[2]) / n) : 0.4
      const v = 28 + shade * 200
      px[o] = v * 1.04
      px[o + 1] = v * 0.96
      px[o + 2] = v * 0.88
      px[o + 3] = 255
    }
  }
  return toUrl(c.canvas, c.ctx, c.image)
}
