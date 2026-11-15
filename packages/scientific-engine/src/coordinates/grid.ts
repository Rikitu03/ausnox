/**
 * Geographic <-> projected <-> grid transforms for the Mars equirectangular sphere CRS.
 *
 * Forward projection (EPSG method 1029, spherical):
 *   x = R * cos(lat_ts) * (lon - lon_0)     y = R * lat
 * Grid (row 0 = north, cell centre at +0.5):
 *   col = (x - originX) / cellSizeX         row = (originY - y) / cellSizeY
 * Ground spacing on the sphere:
 *   dx_ground(row) = cellSizeX * cos(lat_row) / cos(lat_ts)     dy_ground = cellSizeY
 */
import type {
  GeographicBounds,
  GeographicCoordinate,
  GridCell,
  GridGeometry,
  ProjectedBounds,
  ProjectedCoordinate,
} from '../contracts/geo.js'
import { engineError, type EngineError } from '../contracts/errors.js'
import { degToRad, normalizeLongitude180, radToDeg, validateGeographicCoordinate } from './mars.js'

export function geographicToProjected(geo: GeographicCoordinate, g: GridGeometry): ProjectedCoordinate {
  const k = Math.cos(degToRad(g.latitudeOfTrueScaleDeg))
  const dLon = normalizeLongitude180(geo.lonEast - g.centralMeridianDeg)
  return { xM: g.sphereRadiusM * k * degToRad(dLon), yM: g.sphereRadiusM * degToRad(geo.latNorth) }
}

export function projectedToGeographic(p: ProjectedCoordinate, g: GridGeometry): GeographicCoordinate {
  const k = Math.cos(degToRad(g.latitudeOfTrueScaleDeg))
  return {
    lonEast: normalizeLongitude180(radToDeg(p.xM / (g.sphereRadiusM * k)) + g.centralMeridianDeg),
    latNorth: radToDeg(p.yM / g.sphereRadiusM),
  }
}

/** Fractional grid position (cell centres at integer + 0.5). */
export function projectedToFractionalGrid(p: ProjectedCoordinate, g: GridGeometry): { colF: number; rowF: number } {
  return { colF: (p.xM - g.originXM) / g.cellSizeXM, rowF: (g.originYM - p.yM) / g.cellSizeYM }
}

export function gridCellCenterToProjected(cell: GridCell, g: GridGeometry): ProjectedCoordinate {
  return { xM: g.originXM + (cell.col + 0.5) * g.cellSizeXM, yM: g.originYM - (cell.row + 0.5) * g.cellSizeYM }
}

export function isCellInside(cell: GridCell, g: GridGeometry): boolean {
  return (
    Number.isInteger(cell.row) &&
    Number.isInteger(cell.col) &&
    cell.row >= 0 &&
    cell.col >= 0 &&
    cell.row < g.height &&
    cell.col < g.width
  )
}

export function cellToIndex(cell: GridCell, g: GridGeometry): number {
  return cell.row * g.width + cell.col
}

export function indexToCell(index: number, g: GridGeometry): GridCell {
  const row = Math.floor(index / g.width)
  return { row, col: index - row * g.width }
}

export type GridLocation =
  | { status: 'ok'; cell: GridCell; index: number; projected: ProjectedCoordinate; colF: number; rowF: number }
  | EngineError<'INVALID_INPUT' | 'NO_COVERAGE'>

/**
 * Map a geographic coordinate to the grid cell that contains it.
 * Points outside the grid extent return NO_COVERAGE (never clamped to the edge).
 */
export function geographicToGrid(geo: GeographicCoordinate, g: GridGeometry): GridLocation {
  const v = validateGeographicCoordinate(geo)
  if (v.status === 'error') return v
  const projected = geographicToProjected(v.value, g)
  const { colF, rowF } = projectedToFractionalGrid(projected, g)
  const col = Math.floor(colF)
  const row = Math.floor(rowF)
  if (col < 0 || row < 0 || col >= g.width || row >= g.height) {
    return engineError('NO_COVERAGE', 'The location is outside the high-resolution terrain coverage.', {
      lonEast: v.value.lonEast,
      latNorth: v.value.latNorth,
    })
  }
  return { status: 'ok', cell: { row, col }, index: row * g.width + col, projected, colF, rowF }
}

/** Centre of a grid cell in geographic coordinates. Returns null for cells outside the grid. */
export function gridToGeographic(cell: GridCell, g: GridGeometry): GeographicCoordinate | null {
  if (!isCellInside(cell, g)) return null
  return projectedToGeographic(gridCellCenterToProjected(cell, g), g)
}

export function rowCenterLatitudeDeg(row: number, g: GridGeometry): number {
  return radToDeg((g.originYM - (row + 0.5) * g.cellSizeYM) / g.sphereRadiusM)
}

/** Physical east-west width (metres) of the cells in `row`. */
export function groundCellWidthM(row: number, g: GridGeometry): number {
  return (g.cellSizeXM * Math.cos(degToRad(rowCenterLatitudeDeg(row, g)))) / Math.cos(degToRad(g.latitudeOfTrueScaleDeg))
}

/** Physical north-south height (metres) of every cell. */
export function groundCellHeightM(g: GridGeometry): number {
  return g.cellSizeYM
}

export function computeRowCellWidthsM(g: GridGeometry): Float64Array {
  const out = new Float64Array(g.height)
  for (let r = 0; r < g.height; r++) out[r] = groundCellWidthM(r, g)
  return out
}

export function gridProjectedBounds(g: GridGeometry): ProjectedBounds {
  return {
    minX: g.originXM,
    maxX: g.originXM + g.width * g.cellSizeXM,
    maxY: g.originYM,
    minY: g.originYM - g.height * g.cellSizeYM,
  }
}

export function gridGeographicBounds(g: GridGeometry): GeographicBounds {
  const b = gridProjectedBounds(g)
  const sw = projectedToGeographic({ xM: b.minX, yM: b.minY }, g)
  const ne = projectedToGeographic({ xM: b.maxX, yM: b.maxY }, g)
  return { west: sw.lonEast, south: sw.latNorth, east: ne.lonEast, north: ne.latNorth }
}

/**
 * Planimetric ground distance between two cell centres on the local sphere
 * (dx uses the mean latitude of the two rows). Accurate for AOI-scale separations.
 */
export function groundDistanceBetweenCellsM(a: GridCell, b: GridCell, g: GridGeometry): number {
  const latMid = (rowCenterLatitudeDeg(a.row, g) + rowCenterLatitudeDeg(b.row, g)) / 2
  const dx = ((b.col - a.col) * g.cellSizeXM * Math.cos(degToRad(latMid))) / Math.cos(degToRad(g.latitudeOfTrueScaleDeg))
  const dy = (b.row - a.row) * g.cellSizeYM
  return Math.hypot(dx, dy)
}
