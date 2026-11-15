/**
 * Real TerrainService: the validated Jezero HiRISE DTM-derived grid (public/data/jezero),
 * loaded and verified by the scientific engine (manifest schema, Mars CRS, byte length,
 * SHA-256, flag/NaN integrity, pipeline validation record). Nothing is ever substituted:
 * a failed load leaves the service in the `unavailable` state.
 */
import {
  findNearestTraversableCell,
  isEngineError,
  loadTerrainDataset,
  sampleTerrainCell,
  type EngineError,
  type TerrainDataset,
} from '@ausnox/scientific-engine'
import type {
  CellValidity,
  GridCoord,
  Result,
  TerrainManifest,
  TerrainRaster,
  TerrainSample,
  TerrainService,
} from '@/services/contracts'
import { MANIFEST_FILE } from './config'
import { assetUrl, engineSource, type RealContext } from './context'
import {
  clampToEngineCell,
  engineCellCenterToGrid,
  engineCellToCellIndex,
  geoToGrid,
  gridToEngineCell,
  gridToGeo,
  groundDistanceM,
} from './coords'
import { toServiceError } from './errors'

const source = engineSource(
  'terrain',
  'USGS HiRISE DTM of Jezero crater (MRO), resampled to 2 m by the Ausnox pipeline and verified at load time',
)

/** Loads the dataset once; concurrent callers share the same promise. */
export function ensureDataset(ctx: RealContext): Promise<TerrainDataset | EngineError> {
  if (ctx.dataset) return Promise.resolve(ctx.dataset)
  if (!ctx.loading) {
    ctx.loading = loadTerrainDataset({
      manifestUrl: assetUrl(ctx, MANIFEST_FILE),
      fetch: (url, init) => ctx.options.fetch(url, init as RequestInit),
    }).then((r) => {
      if (r.status === 'error') {
        ctx.loading = null // allow a retry
        return r
      }
      ctx.dataset = r.dataset
      // The typed arrays are views on the downloaded buffer; keep it for the route worker.
      ctx.buffer = r.dataset.flags.buffer as ArrayBuffer
      return r.dataset
    })
  }
  return ctx.loading
}

/** Copies the north-up engine grid into the frontend's south-up raster (one copy at load time). */
function toFrontendRaster(d: TerrainDataset): TerrainRaster {
  const W = d.geometry.width
  const H = d.geometry.height
  const elevationM = new Float32Array(W * H)
  const slopeDeg = new Float32Array(W * H)
  const validity = new Uint8Array(W * H)
  for (let r = 0; r < H; r++) {
    const src = (H - 1 - r) * W
    const dst = r * W
    elevationM.set(d.elevationM.subarray(src, src + W), dst)
    slopeDeg.set(d.slopeDeg.subarray(src, src + W), dst)
    for (let c = 0; c < W; c++) {
      const f = d.flags[src + c]!
      // bit0 elevation, bit1 slope: 3 -> valid (1); 1 -> slope unknown (3); 0 -> no data (0)
      validity[dst + c] = f === 3 ? 1 : (f & 1) === 1 ? 3 : 0
    }
  }
  return { widthCells: W, heightCells: H, elevationM, slopeDeg, validity }
}

function parseCoverageRing(d: TerrainDataset, geojson: unknown): GridCoord[] | null {
  const fc = geojson as { features?: { properties?: { id?: string }; geometry?: { type?: string; coordinates?: unknown } }[] }
  const f = fc?.features?.find((x) => x.properties?.id === 'elevation-coverage') ?? fc?.features?.find((x) => x.properties?.id === 'aoi-boundary')
  const g = f?.geometry
  let ring: unknown
  if (g?.type === 'MultiPolygon' && Array.isArray(g.coordinates) && g.coordinates.length === 1) ring = (g.coordinates[0] as unknown[])[0]
  else if (g?.type === 'Polygon' && Array.isArray(g.coordinates)) ring = g.coordinates[0]
  if (!Array.isArray(ring) || ring.length < 4) return null
  const pts = ring.filter((p): p is [number, number] => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number')
  return pts.length === ring.length ? pts.map(([lonEast, latNorth]) => geoToGrid(d, { lonEast, latNorth })) : null
}

function buildManifest(d: TerrainDataset, coverage: GridCoord[]): TerrainManifest {
  const g = d.geometry
  let min = Infinity
  let max = -Infinity
  let maxSlope = 0
  for (let i = 0; i < d.elevationM.length; i++) {
    const e = d.elevationM[i]!
    if (Number.isFinite(e)) {
      if (e < min) min = e
      if (e > max) max = e
    }
    const s = d.slopeDeg[i]!
    if (Number.isFinite(s) && s > maxSlope) maxSlope = s
  }
  const midRow = Math.floor(g.height / 2)
  const groundEW = d.rowCellWidthsM[midRow]!
  const v = d.verification
  const verified = v.verifiedForFeasibility
  return {
    aoiId: d.id,
    title: d.title,
    status: verified ? 'verified' : 'unverified',
    datasetId: d.id,
    version: d.version,
    grid: {
      widthCells: g.width,
      heightCells: g.height,
      cellSizeM: g.cellSizeYM,
      widthM: g.width * g.cellSizeXM,
      heightM: g.height * g.cellSizeYM,
      groundCellSizeM: { eastWest: groundEW, northSouth: d.cellHeightM },
      groundExtentM: { eastWest: groundEW * g.width, northSouth: d.cellHeightM * g.height },
    },
    georeference: {
      kind: verified ? 'verified' : 'nominal-demo',
      note: `${d.manifest.crs.datum}, ${d.manifest.crs.projection.toLowerCase()}, R = ${g.sphereRadiusM.toLocaleString('en-US')} m; planetocentric latitude, east-positive longitude. Checked against PROJ and 132 rover localizations (gate S2)`,
      planetRadiusM: g.sphereRadiusM,
      origin: { lonEast: d.geographicBounds.west, latNorth: d.geographicBounds.south },
      longitudeConvention: 'east-positive-180',
      latitudeType: 'planetocentric',
    },
    coverage,
    elevationRangeM: [min, max],
    maxSlopeDeg: maxSlope,
    validCellCount: d.statistics.slopeValidCount,
    totalCellCount: d.statistics.cellCount,
    elevationProvenanceId: 'usgs-hirise-dtm',
    slopeProvenanceId: 'dem-slope',
    verification: {
      checksum: v.checksum,
      pipelineValidation: v.pipelineValidation,
      crossValidation: v.crossValidation
        ? { overall: v.crossValidation.overall, checks: v.crossValidation.checks.map((c) => ({ ...c })) }
        : null,
      notes: [...v.notes],
    },
  }
}

const VALIDITY: Record<'valid' | 'slope-unknown' | 'no-elevation', CellValidity> = {
  valid: 'valid',
  'slope-unknown': 'slope-unknown',
  'no-elevation': 'nodata',
}

export function createRealTerrain(ctx: RealContext): TerrainService {
  return {
    async load(): Promise<Result<{ manifest: TerrainManifest; raster: TerrainRaster }>> {
      const r = await ensureDataset(ctx)
      if (isEngineError(r)) return toServiceError(r, source)
      const d = r
      const raster = toFrontendRaster(d)
      // Coverage outline published by the pipeline. The grid rectangle from the manifest is exact
      // and is used only if the outline file cannot be read.
      let coverage: GridCoord[] | null = null
      const file = d.manifest.files?.coverage
      if (file) {
        try {
          const res = await ctx.options.fetch(assetUrl(ctx, file))
          if (res.ok) coverage = parseCoverageRing(d, await res.json())
        } catch {
          coverage = null
        }
      }
      coverage ??= [
        { x: 0, y: 0 },
        { x: d.geometry.width * d.geometry.cellSizeXM, y: 0 },
        { x: d.geometry.width * d.geometry.cellSizeXM, y: d.geometry.height * d.geometry.cellSizeYM },
        { x: 0, y: d.geometry.height * d.geometry.cellSizeYM },
        { x: 0, y: 0 },
      ]
      return { status: 'ok', source, manifest: buildManifest(d, coverage), raster }
    },

    sample(point): TerrainSample {
      const d = ctx.dataset
      if (!d) return { grid: point, geo: null, cell: null, validity: 'unavailable', elevationM: null, slopeDeg: null }
      const geo = gridToGeo(d, point)
      const cell = gridToEngineCell(d, point)
      if (!cell) return { grid: point, geo, cell: null, validity: 'outside-coverage', elevationM: null, slopeDeg: null }
      const s = sampleTerrainCell(d, cell)!
      return {
        grid: point,
        geo,
        cell: engineCellToCellIndex(d, cell),
        validity: VALIDITY[s.validity],
        elevationM: s.elevationM,
        slopeDeg: s.slopeDeg,
      }
    },

    nearestValid(point, maxDistanceM, maxSlopeDeg) {
      const d = ctx.dataset
      if (!d || !(maxDistanceM >= 0)) return null
      const start = gridToEngineCell(d, point) ?? clampToEngineCell(d, point)
      // The engine searches outward from a cell; slope 90° admits every cell whose slope is known.
      const found = findNearestTraversableCell(d, start, { maxSlopeDeg: maxSlopeDeg ?? 90, maxDistanceM: maxDistanceM + 2 * d.cellHeightM })
      if (!found) return null
      const centre = engineCellCenterToGrid(d, found.cell)
      return groundDistanceM(d, point, centre) <= maxDistanceM ? centre : null
    },

    groundDistanceM: (a, b) => (ctx.dataset ? groundDistanceM(ctx.dataset, a, b) : null),
    toGeo: (p) => (ctx.dataset ? gridToGeo(ctx.dataset, p) : null),
    fromGeo: (g) =>
      ctx.dataset && Number.isFinite(g.lonEast) && Number.isFinite(g.latNorth) && Math.abs(g.latNorth) <= 90
        ? geoToGrid(ctx.dataset, g)
        : null,
  }
}
