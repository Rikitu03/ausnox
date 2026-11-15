/**
 * Mars geographic coordinate, degrees.
 * Latitude is planetocentric (north positive); longitude is east positive.
 * Any finite longitude is accepted and normalised to [-180, 180).
 * Field names match the frontend `GeoCoord` contract (same meaning).
 */
export interface GeographicCoordinate {
  readonly lonEast: number
  readonly latNorth: number
}

/**
 * Projected coordinate in the dataset CRS (Mars 2000 sphere equirectangular), metres.
 * x grows east, y grows north. These are absolute CRS coordinates (x = R * lon_rad),
 * not offsets from the AOI corner.
 */
export interface ProjectedCoordinate {
  readonly xM: number
  readonly yM: number
}

/** Integer raster cell. Row 0 is the NORTHERNMOST row; col 0 the westernmost column. */
export interface GridCell {
  readonly row: number
  readonly col: number
}

/** Geometry of a north-up grid in the Mars equirectangular sphere CRS. */
export interface GridGeometry {
  readonly width: number
  readonly height: number
  /** Projected x of the west edge of column 0. */
  readonly originXM: number
  /** Projected y of the north edge of row 0. */
  readonly originYM: number
  /** Projected cell size. Ground east-west size is cellSizeXM * cos(lat). */
  readonly cellSizeXM: number
  readonly cellSizeYM: number
  readonly sphereRadiusM: number
  readonly latitudeOfTrueScaleDeg: number
  readonly centralMeridianDeg: number
}

export interface GeographicBounds {
  readonly west: number
  readonly east: number
  readonly south: number
  readonly north: number
}

export interface ProjectedBounds {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}
