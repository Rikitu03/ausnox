import type {
  GeoCoord,
  GeoReference,
  GridCoord,
  TerrainManifest,
  TerrainRaster,
  TerrainSample,
  TerrainService,
} from '@/services/contracts'
import { getScenario, latency, mockError, mockSource, MOCK_VERSION, wait } from './scenario'
import { buildRaster, COVERAGE, GRID } from './terrainField'

export const DEMO_DATASET_ID = 'demo-illustrative-terrain'

/**
 * Placeholder georeference. The origin sits near Jezero Crater so longitude and
 * latitude read plausibly, but the transform is a plain equirectangular guess on
 * a sphere and has not been checked against any product CRS.
 */
const GEOREF: GeoReference = {
  kind: 'nominal-demo',
  note: 'Nominal placement near Jezero Crater on a 3,396,190 m sphere. Not a verified CRS transform',
  planetRadiusM: 3396190,
  origin: { lonEast: 77.4, latNorth: 18.4 },
  longitudeConvention: 'east-positive-0-360',
  latitudeType: 'unspecified',
}

const M_PER_DEG_LAT = (Math.PI * GEOREF.planetRadiusM) / 180
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((GEOREF.origin.latNorth * Math.PI) / 180)

export function createMockTerrain(): TerrainService {
  let raster: TerrainRaster | null = null

  const toGeo = (p: GridCoord): GeoCoord => ({
    lonEast: GEOREF.origin.lonEast + p.x / M_PER_DEG_LON,
    latNorth: GEOREF.origin.latNorth + p.y / M_PER_DEG_LAT,
  })
  const fromGeo = (g: GeoCoord): GridCoord => ({
    x: (g.lonEast - GEOREF.origin.lonEast) * M_PER_DEG_LON,
    y: (g.latNorth - GEOREF.origin.latNorth) * M_PER_DEG_LAT,
  })

  const sample = (point: GridCoord): TerrainSample => {
    const geo = toGeo(point)
    if (!raster) return { grid: point, geo, cell: null, validity: 'unavailable', elevationM: null, slopeDeg: null }
    const col = Math.floor(point.x / GRID.cellSizeM)
    const row = Math.floor(point.y / GRID.cellSizeM)
    if (col < 0 || row < 0 || col >= GRID.widthCells || row >= GRID.heightCells) {
      return { grid: point, geo, cell: null, validity: 'outside-coverage', elevationM: null, slopeDeg: null }
    }
    const i = row * GRID.widthCells + col
    const v = raster.validity[i]
    if (v !== 1) {
      return {
        grid: point,
        geo,
        cell: { col, row },
        validity: v === 2 ? 'outside-coverage' : 'nodata',
        elevationM: null,
        slopeDeg: null,
      }
    }
    return {
      grid: point,
      geo,
      cell: { col, row },
      validity: 'valid',
      elevationM: raster.elevationM[i]!,
      slopeDeg: raster.slopeDeg[i]!,
    }
  }

  return {
    async load() {
      await wait(latency.ms)
      if (getScenario() === 'terrain-missing') {
        raster = null
        return mockError(
          'mock-terrain',
          'DATA_UNAVAILABLE',
          'The terrain raster could not be loaded (demo scenario: terrain dataset missing)',
        )
      }
      raster = buildRaster()
      let validCellCount = 0
      let min = Infinity
      let max = -Infinity
      let maxSlope = 0
      for (let i = 0; i < raster.validity.length; i++) {
        if (raster.validity[i] !== 1) continue
        validCellCount++
        min = Math.min(min, raster.elevationM[i]!)
        max = Math.max(max, raster.elevationM[i]!)
        maxSlope = Math.max(maxSlope, raster.slopeDeg[i]!)
      }
      const manifest: TerrainManifest = {
        aoiId: 'jezero-demo-aoi',
        title: 'Jezero Crater demo area',
        status: 'illustrative-demo',
        datasetId: DEMO_DATASET_ID,
        version: MOCK_VERSION,
        grid: GRID,
        georeference: GEOREF,
        coverage: COVERAGE,
        elevationRangeM: [min, max],
        maxSlopeDeg: maxSlope,
        validCellCount,
        totalCellCount: raster.validity.length,
        elevationProvenanceId: 'usgs-hirise-dtm',
        slopeProvenanceId: 'dem-slope',
      }
      return {
        status: 'ok',
        source: mockSource('mock-terrain', 'Synthetic illustrative surface. Not a NASA or USGS elevation product'),
        manifest,
        raster,
      }
    },
    sample,
    nearestValid(point, maxDistanceM, maxSlopeDeg) {
      if (!raster) return null
      const c = GRID.cellSizeM
      const col0 = Math.floor(point.x / c)
      const row0 = Math.floor(point.y / c)
      const reach = Math.ceil(maxDistanceM / c)
      let best: GridCoord | null = null
      let bestD = Infinity
      for (let row = Math.max(0, row0 - reach); row <= Math.min(GRID.heightCells - 1, row0 + reach); row++) {
        for (let col = Math.max(0, col0 - reach); col <= Math.min(GRID.widthCells - 1, col0 + reach); col++) {
          const i = row * GRID.widthCells + col
          if (raster.validity[i] !== 1) continue
          if (maxSlopeDeg !== undefined && !(raster.slopeDeg[i]! <= maxSlopeDeg)) continue
          const centre = { x: (col + 0.5) * c, y: (row + 0.5) * c }
          const d = Math.hypot(centre.x - point.x, centre.y - point.y)
          if (d < bestD && d <= maxDistanceM) {
            bestD = d
            best = centre
          }
        }
      }
      return best
    },
    // Demo grid metres are nominal ground metres, so plane distance is the ground distance.
    groundDistanceM: (a, b) => (raster ? Math.hypot(b.x - a.x, b.y - a.y) : null),
    toGeo,
    fromGeo,
  }
}
