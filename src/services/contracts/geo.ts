/** Mars geographic coordinate. Degrees, east-positive longitude, north-positive latitude. */
export interface GeoCoord {
  lonEast: number
  latNorth: number
}

/** Projected terrain-grid coordinate in metres. x grows east, y grows north, origin at the south-west corner of the AOI. */
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
  /** Metres per cell edge. */
  cellSizeM: number
  widthM: number
  heightM: number
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
