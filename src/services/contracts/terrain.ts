import type { Result } from './common'
import type { CellIndex, GeoCoord, GeoReference, GridCoord, GridSpec } from './geo'

export type CellValidity =
  | 'valid'
  | 'nodata' // inside the footprint, but the DEM has no value here
  | 'outside-coverage' // outside the DEM footprint
  | 'unavailable' // terrain has not loaded or failed to load

export interface TerrainManifest {
  aoiId: string
  title: string
  /** `illustrative-demo` terrain is synthetic and only exists to exercise the UI. */
  status: 'illustrative-demo' | 'verified'
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
}

/** Row-major rasters, row 0 = south. `NaN` marks cells without a value. */
export interface TerrainRaster {
  widthCells: number
  heightCells: number
  elevationM: Float32Array
  slopeDeg: Float32Array
  /** 1 = valid, 0 = nodata, 2 = outside coverage. */
  validity: Uint8Array
}

export interface TerrainSample {
  grid: GridCoord
  geo: GeoCoord | null
  cell: CellIndex | null
  validity: CellValidity
  /** Metres. `null` whenever validity is not `valid`. Never substitute a guess. */
  elevationM: number | null
  /** Degrees. `null` whenever validity is not `valid`. */
  slopeDeg: number | null
}

export interface TerrainService {
  /** Loads manifest and raster. Must succeed before `sample` returns values. */
  load(): Promise<Result<{ manifest: TerrainManifest; raster: TerrainRaster }>>
  /** Synchronous lookup against the loaded raster. Returns `unavailable` before a successful load. */
  sample(point: GridCoord): TerrainSample
  /** Nearest valid cell centre within `maxDistanceM`, or null. Used for the confirm-to-snap flow. */
  nearestValid(point: GridCoord, maxDistanceM: number): GridCoord | null
  toGeo(point: GridCoord): GeoCoord | null
  fromGeo(point: GeoCoord): GridCoord | null
}
