import type { LayerImagery, MapDataService, MapLayer, ScienceWaypoint, TerrainService } from '@/services/contracts'
import { PROVENANCE } from './provenance'
import { getScenario, latency, mockError, mockSource, wait } from './scenario'
import { elevationAt, GRID, inNodataPocket, insideCoverage } from './terrainField'

const NOT_WIRED = 'Needs the real map adapter. Tile matrix, CRS and CORS are not verified yet'

export const SLOPE_CLASSES = [
  { maxDeg: 5, label: 'Under 5°', rgba: [0, 0, 0, 0] as const, pattern: 'solid' as const },
  { maxDeg: 10, label: '5 to 10°', rgba: [227, 187, 92, 38] as const, pattern: 'solid' as const },
  { maxDeg: 15, label: '10 to 15°', rgba: [217, 138, 78, 105] as const, pattern: 'solid' as const },
  { maxDeg: Infinity, label: 'Over 15°', rgba: [205, 84, 62, 150] as const, pattern: 'hatch' as const },
]

const ELEVATION_RAMP: [number, number, number][] = [
  [38, 32, 30],
  [98, 66, 48],
  [185, 126, 86],
  [233, 206, 170],
]

const css = (c: readonly number[]) => `rgb(${c[0]} ${c[1]} ${c[2]})`

const LAYERS: MapLayer[] = [
  {
    id: 'schematic-base',
    title: 'Terrain schematic',
    role: 'basemap',
    mission: null,
    provenanceId: 'usgs-hirise-dtm',
    availability: 'available',
    availabilityNote: null,
    illustrative: true,
    defaultVisible: true,
    legend: {
      title: 'Contours of the illustrative surface',
      unit: null,
      stops: [
        { label: 'Every 10 m', color: 'rgb(120 116 110)', pattern: 'solid' },
        { label: 'Every 50 m', color: 'rgb(190 184 174)', pattern: 'solid' },
      ],
    },
  },
  {
    id: 'hirise-ortho',
    title: 'HiRISE orthomosaic, 25 cm',
    role: 'basemap',
    mission: 'MRO · HiRISE',
    provenanceId: 'hirise-ortho',
    availability: 'unavailable',
    availabilityNote: NOT_WIRED,
    illustrative: false,
    defaultVisible: false,
    legend: null,
  },
  {
    id: 'ctx-mosaic',
    title: 'CTX mosaic, 6 m',
    role: 'basemap',
    mission: 'MRO · CTX',
    provenanceId: 'ctx-mosaic',
    availability: 'unavailable',
    availabilityNote: NOT_WIRED,
    illustrative: false,
    defaultVisible: false,
    legend: null,
  },
  {
    id: 'mola-shade',
    title: 'MOLA colour hillshade, 463 m',
    role: 'basemap',
    mission: 'MGS · MOLA',
    provenanceId: 'mola-shade',
    availability: 'unavailable',
    availabilityNote: NOT_WIRED,
    illustrative: false,
    defaultVisible: false,
    legend: null,
  },
  {
    id: 'elevation',
    title: 'Elevation',
    role: 'overlay',
    mission: 'MRO · HiRISE DTM',
    provenanceId: 'usgs-hirise-dtm',
    availability: 'available',
    availabilityNote: null,
    illustrative: true,
    defaultVisible: false,
    legend: {
      title: 'Elevation, illustrative surface',
      unit: null,
      stops: ELEVATION_RAMP.map((c, i) => ({
        label: ['Lowest', 'Lower', 'Higher', 'Highest'][i]!,
        color: css(c),
        pattern: 'solid' as const,
      })),
    },
  },
  {
    id: 'slope',
    title: 'Slope',
    role: 'overlay',
    mission: 'Derived from the DTM',
    provenanceId: 'dem-slope',
    availability: 'available',
    availabilityNote: null,
    illustrative: true,
    defaultVisible: true,
    legend: {
      title: 'Slope, derived from the illustrative surface',
      unit: null,
      stops: SLOPE_CLASSES.slice(1).map((c) => ({ label: c.label, color: `rgb(${c.rgba[0]} ${c.rgba[1]} ${c.rgba[2]} / ${Math.min(1, c.rgba[3] / 150)})`, pattern: c.pattern })),
    },
  },
]

const WAYPOINTS: ScienceWaypoint[] = [
  {
    id: 'wp-a',
    title: 'Sampling stop A',
    position: { x: 3290, y: 1930 },
    description:
      'Illustrative sampling stop east of the demo ridge. It marks a place to plan a science activity and makes no claim about what is there',
    labelQuality: 'illustrative',
    sourceUrl: null,
    suggestedDurationMin: 30,
    provenanceId: 'science-waypoints',
  },
  {
    id: 'wp-b',
    title: 'Sampling stop B',
    position: { x: 1950, y: 1450 },
    description: 'Illustrative sampling stop on the demo hill. No geological observation is implied',
    labelQuality: 'illustrative',
    sourceUrl: null,
    suggestedDurationMin: 15,
    provenanceId: 'science-waypoints',
  },
  {
    id: 'wp-c',
    title: 'Sampling stop C',
    position: { x: 1010, y: 890 },
    description: 'Illustrative sampling stop in the demo bowl. No geological observation is implied',
    labelQuality: 'illustrative',
    sourceUrl: null,
    suggestedDurationMin: 20,
    provenanceId: 'science-waypoints',
  },
  {
    id: 'wp-d',
    title: 'Sampling stop D',
    position: { x: 2450, y: 2650 },
    description: 'Illustrative sampling stop above the demo scarp. No geological observation is implied',
    labelQuality: 'illustrative',
    sourceUrl: null,
    suggestedDurationMin: 25,
    provenanceId: 'science-waypoints',
  },
]

/** Metres per pixel of the rendered demo imagery. */
const PX_M = 4

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; image: ImageData } | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = GRID.widthM / PX_M
  canvas.height = GRID.heightM / PX_M
  const ctx = (() => {
    try {
      return canvas.getContext('2d')
    } catch {
      return null
    }
  })()
  if (!ctx) return null
  return { canvas, ctx, image: ctx.createImageData(canvas.width, canvas.height) }
}

/** Contour drawing of the illustrative surface. A diagram, deliberately not photo-like. */
function renderSchematic(): string | null {
  const c = makeCanvas()
  if (!c) return null
  const { width: w, height: h } = c.canvas
  const z = new Float32Array(w * h)
  const state = new Uint8Array(w * h) // 0 outside, 1 valid, 2 nodata
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = (px + 0.5) * PX_M
      const y = GRID.heightM - (py + 0.5) * PX_M
      const i = py * w + px
      if (!insideCoverage(x, y)) continue
      state[i] = inNodataPocket(x, y) ? 2 : 1
      z[i] = elevationAt(x, y)
    }
  }
  const d = c.image.data
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = py * w + px
      const o = i * 4
      if (state[i] === 0) continue
      if (state[i] === 2) {
        const stripe = (px + py) % 8 < 2
        d[o] = d[o + 1] = d[o + 2] = stripe ? 70 : 24
        d[o + 3] = 255
        continue
      }
      const zr = z[Math.min(i + 1, z.length - 1)]!
      const zd = z[Math.min(i + w, z.length - 1)]!
      const zi = z[i]!
      // Soft relief shading, light from the north-west.
      const shade = Math.max(-1, Math.min(1, ((zi - zr) - (zi - zd)) * 0.9))
      let v = 31 + shade * 9
      const band = Math.floor(zi / 10)
      const edge = band !== Math.floor(zr / 10) || band !== Math.floor(zd / 10)
      if (edge) {
        const index = Math.floor(zi / 50) !== Math.floor(zr / 50) || Math.floor(zi / 50) !== Math.floor(zd / 50)
        v += index ? 62 : 26
      }
      d[o] = v * 1.05
      d[o + 1] = v
      d[o + 2] = v * 0.94
      d[o + 3] = 255
    }
  }
  c.ctx.putImageData(c.image, 0, 0)
  return c.canvas.toDataURL('image/png')
}

/** Per-cell overlays, drawn blocky on purpose so one block reads as one terrain cell. */
function renderCells(terrain: TerrainService, kind: 'elevation' | 'slope', range: [number, number]): string | null {
  const c = makeCanvas()
  if (!c) return null
  const { width: w, height: h } = c.canvas
  const d = c.image.data
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const s = terrain.sample({ x: (px + 0.5) * PX_M, y: GRID.heightM - (py + 0.5) * PX_M })
      if (s.validity !== 'valid') continue
      const o = (py * w + px) * 4
      if (kind === 'elevation') {
        const t = Math.max(0, Math.min(0.9999, (s.elevationM! - range[0]) / (range[1] - range[0]))) * 3
        const a = ELEVATION_RAMP[Math.floor(t)]!
        const b = ELEVATION_RAMP[Math.floor(t) + 1]!
        const f = t - Math.floor(t)
        d[o] = a[0] + (b[0] - a[0]) * f
        d[o + 1] = a[1] + (b[1] - a[1]) * f
        d[o + 2] = a[2] + (b[2] - a[2]) * f
        d[o + 3] = 200
      } else {
        const cls = SLOPE_CLASSES.find((k) => s.slopeDeg! < k.maxDeg)!
        const hatch = cls.pattern === 'hatch' && (px + py) % 6 < 2
        d[o] = cls.rgba[0]
        d[o + 1] = cls.rgba[1]
        d[o + 2] = cls.rgba[2]
        d[o + 3] = hatch ? 255 : cls.rgba[3]
      }
    }
  }
  c.ctx.putImageData(c.image, 0, 0)
  return c.canvas.toDataURL('image/png')
}

export function createMockMapData(terrain: TerrainService): MapDataService {
  const cache = new Map<string, string>()
  const source = mockSource('mock-map', 'Demonstration layer list. Imagery is drawn from the illustrative surface')

  return {
    async listLayers() {
      await wait(latency.ms / 2)
      return { status: 'ok', source, layers: LAYERS }
    },
    async getLayerImagery(layerId) {
      await wait(latency.ms / 2)
      const layer = LAYERS.find((l) => l.id === layerId)
      if (!layer) return mockError('mock-map', 'INVALID_INPUT', `Unknown layer "${layerId}"`)
      if (layer.availability === 'unavailable') {
        return mockError('mock-map', 'NOT_IMPLEMENTED', layer.availabilityNote ?? 'Layer is not available')
      }
      if (getScenario() === 'imagery-offline') {
        return mockError(
          'mock-map',
          'DATA_UNAVAILABLE',
          'Imagery request failed (demo scenario: imagery requests fail)',
        )
      }
      let url = cache.get(layerId) ?? null
      if (!url) {
        if (layerId === 'schematic-base') url = renderSchematic()
        else {
          // Range comes from the loaded raster, so the overlay matches what sampling reports.
          let min = Infinity
          let max = -Infinity
          for (let y = 10; y < GRID.heightM; y += 20) {
            for (let x = 10; x < GRID.widthM; x += 20) {
              const s = terrain.sample({ x, y })
              if (s.elevationM === null) continue
              min = Math.min(min, s.elevationM)
              max = Math.max(max, s.elevationM)
            }
          }
          if (min === Infinity) {
            return mockError('mock-map', 'DATA_UNAVAILABLE', 'Terrain data is not loaded, so this layer cannot be drawn')
          }
          url = renderCells(terrain, layerId as 'elevation' | 'slope', [min, max])
        }
        if (!url) return mockError('mock-map', 'DATA_UNAVAILABLE', 'This browser could not draw the layer image')
        cache.set(layerId, url)
      }
      const imagery: LayerImagery = {
        type: 'image',
        url,
        boundsM: { min: { x: 0, y: 0 }, max: { x: GRID.widthM, y: GRID.heightM } },
      }
      return { status: 'ok', source, imagery }
    },
    async listWaypoints() {
      await wait(latency.ms / 2)
      return { status: 'ok', source, waypoints: getScenario() === 'no-waypoints' ? [] : WAYPOINTS }
    },
    listProvenance: () => PROVENANCE,
  }
}
