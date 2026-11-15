/**
 * Coordinate bridge between the frontend contract and the scientific engine
 * (docs/SCIENTIFIC_ENGINE_HANDOFF.md §12; docs/INTEGRATION_REPORT.md §5).
 *
 *   Frontend GridCoord  metres from the AOI south-west corner, x east, y north (projected metres)
 *   Engine projected    absolute Mars 2000 sphere equirectangular metres (x = R·lon, y = R·lat)
 *   Engine GridCell     row 0 = NORTH, col 0 = west
 *   Frontend CellIndex  row 0 = SOUTH, col 0 = west
 *
 *   x = xM − minX     y = yM − minY     frontendRow = height − 1 − engineRow
 *
 * Projected metres are not ground metres east-west (cos 18.46° = 0.949). Physical distances always
 * come from the engine (route metrics) or from great-circle distance on the Mars sphere.
 */
import {
  geographicToProjected,
  greatCircleDistanceM,
  gridCellCenterToProjected,
  projectedToFractionalGrid,
  projectedToGeographic,
  type GeographicCoordinate,
  type GridCell,
  type ProjectedCoordinate,
  type TerrainDataset,
} from '@ausnox/scientific-engine'
import type { CellIndex, GeoCoord, GridCoord } from '@/services/contracts'

export function gridToProjected(d: TerrainDataset, p: GridCoord): ProjectedCoordinate {
  return { xM: p.x + d.projectedBounds.minX, yM: p.y + d.projectedBounds.minY }
}

export function projectedToGridCoord(d: TerrainDataset, p: ProjectedCoordinate): GridCoord {
  return { x: p.xM - d.projectedBounds.minX, y: p.yM - d.projectedBounds.minY }
}

export function gridToGeo(d: TerrainDataset, p: GridCoord): GeographicCoordinate {
  return projectedToGeographic(gridToProjected(d, p), d.geometry)
}

export function geoToGrid(d: TerrainDataset, g: GeoCoord): GridCoord {
  return projectedToGridCoord(d, geographicToProjected(g, d.geometry))
}

/** Engine cell containing a grid point, or null outside the grid (never clamped). */
export function gridToEngineCell(d: TerrainDataset, p: GridCoord): GridCell | null {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
  const { colF, rowF } = projectedToFractionalGrid(gridToProjected(d, p), d.geometry)
  const col = Math.floor(colF)
  const row = Math.floor(rowF)
  if (col < 0 || row < 0 || col >= d.geometry.width || row >= d.geometry.height) return null
  return { row, col }
}

/** Nearest engine cell to a grid point, clamped into the grid. */
export function clampToEngineCell(d: TerrainDataset, p: GridCoord): GridCell {
  const { colF, rowF } = projectedToFractionalGrid(gridToProjected(d, p), d.geometry)
  const clamp = (v: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor(v)))
  return { row: clamp(rowF, d.geometry.height), col: clamp(colF, d.geometry.width) }
}

export function engineCellCenterToGrid(d: TerrainDataset, cell: GridCell): GridCoord {
  return projectedToGridCoord(d, gridCellCenterToProjected(cell, d.geometry))
}

export function engineCellToCellIndex(d: TerrainDataset, cell: GridCell): CellIndex {
  return { col: cell.col, row: d.geometry.height - 1 - cell.row }
}

/** Great-circle ground distance on the dataset sphere, metres. */
export function groundDistanceM(d: TerrainDataset, a: GridCoord, b: GridCoord): number {
  return greatCircleDistanceM(gridToGeo(d, a), gridToGeo(d, b), d.geometry.sphereRadiusM)
}
