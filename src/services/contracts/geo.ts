/** Mars geographic coordinate. Degrees, east-positive longitude, north-positive latitude. */
export interface GeoCoord {
  lonEast: number
  latNorth: number
}

/**
 * Terrain-grid coordinate in metres. x grows east, y grows north, origin at the south-west corner of the AOI.
 * For real data these are projected metres of the dataset CRS (Mars 2000 sphere, equirectangular), offset by
 * the AOI's south-west corner. Projected metres are not ground metres east-west; use
 * `TerrainService.groundDistanceM` for any physical distance.
 */
export interface GridCoord {
  x: number
  y: number
}

/** Integer cell address in the terrain raster. Row 0 is the southernmost row. */
export interface CellIndex {
  col: number
  row: number
}

export interface GridSpec {
  widthCells: number
  heightCells: number
  /** Grid metres per cell edge (projected metres for real data). */
  cellSizeM: number
  widthM: number
  heightM: number
  /** Physical size of one cell on the ground, when it differs from `cellSizeM` (real equirectangular data). */
  groundCellSizeM?: { eastWest: number; northSouth: number }
  /** Physical extent of the grid on the ground, metres. */
  groundExtentM?: { eastWest: number; northSouth: number }
}

/** How grid metres map to Mars longitude/latitude. */
export interface GeoReference {
  /** `nominal-demo` means the transform is a placeholder and must not be cited. */
  kind: 'nominal-demo' | 'verified'
  note: string
  planetRadiusM: number
  /** Geographic position of the grid origin. */
  origin: GeoCoord
  longitudeConvention: 'east-positive-0-360' | 'east-positive-180'
  latitudeType: 'planetocentric' | 'planetographic' | 'unspecified'
}
