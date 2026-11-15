import type { Result } from './common'
import type { CellIndex, GeoCoord, GeoReference, GridCoord, GridSpec } from './geo'

export type CellValidity =
  | 'valid'
  | 'slope-unknown' // elevation is measured, but slope is unknown (edge ring, or next to missing elevation). Never traversable
  | 'nodata' // inside the footprint, but the DEM has no value here
  | 'outside-coverage' // outside the DEM footprint
  | 'unavailable' // terrain has not loaded or failed to load

/** Integrity and validation state of a real terrain asset, exposed so the UI can disclose it. */
export interface TerrainVerificationInfo {
  /** SHA-256 of the grid compared with the manifest at load time. `not-checked` when Web Crypto is unavailable. */
  checksum: 'verified' | 'not-checked'
  /** Result recorded by the preprocessing pipeline's validation script. */
  pipelineValidation: 'passed' | 'failed' | 'not-run'
  /** Supplementary cross-checks recorded in the manifest (CTX agreement, DTM-to-imagery registration). */
  crossValidation: {
    overall: 'PASS' | 'FAIL'
    checks: { id: string; status: string; summary: string }[]
  } | null
  /** Plain-language notes, one per unresolved finding. */
  notes: string[]
}

export interface TerrainManifest {
  aoiId: string
  title: string
  /**
   * `illustrative-demo` terrain is synthetic and only exists to exercise the UI.
   * `verified`: real asset whose pipeline validation passed. `unverified`: real asset without a passed validation;
   * feasibility can then only be indeterminate.
   */
  status: 'illustrative-demo' | 'verified' | 'unverified'
  datasetId: string
  version: string
  grid: GridSpec
  georeference: GeoReference
  /** DEM footprint polygon in grid metres. */
  coverage: GridCoord[]
  elevationRangeM: [min: number, max: number]
  maxSlopeDeg: number
  validCellCount: number
  totalCellCount: number
  elevationProvenanceId: string
  slopeProvenanceId: string
  /** Present for real assets only. */
  verification?: TerrainVerificationInfo
}

/** Row-major rasters, row 0 = south. `NaN` marks cells without a value. */
export interface TerrainRaster {
  widthCells: number
  heightCells: number
  elevationM: Float32Array
  slopeDeg: Float32Array
  /** 1 = valid, 0 = nodata, 2 = outside coverage, 3 = elevation measured but slope unknown. */
  validity: Uint8Array
}

export interface TerrainSample {
  grid: GridCoord
  geo: GeoCoord | null
  cell: CellIndex | null
  validity: CellValidity
  /** Metres. `null` unless the DEM has a measured value here (`valid` or `slope-unknown`). Never substitute a guess. */
  elevationM: number | null
  /** Degrees. `null` whenever validity is not `valid`. */
  slopeDeg: number | null
}

export interface TerrainService {
  /** Loads manifest and raster. Must succeed before `sample` returns values. */
  load(): Promise<Result<{ manifest: TerrainManifest; raster: TerrainRaster }>>
  /** Synchronous lookup against the loaded raster. Returns `unavailable` before a successful load. */
  sample(point: GridCoord): TerrainSample
  /**
   * Nearest valid cell centre within `maxDistanceM` (ground metres), or null. Used for the confirm-to-snap flow.
   * With `maxSlopeDeg`, only cells whose known slope is at or below the limit qualify (traversable for the mission).
   */
  nearestValid(point: GridCoord, maxDistanceM: number, maxSlopeDeg?: number): GridCoord | null
  /** Physical ground distance between two points on the Mars surface, metres. Null before terrain loads. */
  groundDistanceM(a: GridCoord, b: GridCoord): number | null
  toGeo(point: GridCoord): GeoCoord | null
  fromGeo(point: GeoCoord): GridCoord | null
}
