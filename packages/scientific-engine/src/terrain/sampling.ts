/**
 * Terrain lookups, traversability classification and confirm-to-snap candidates.
 */
import type { GeographicCoordinate, GridCell, ProjectedCoordinate } from '../contracts/geo.js'
import type { EngineError } from '../contracts/errors.js'
import type { ProvenanceCategory } from '../contracts/provenance.js'
import {
  geographicToGrid,
  gridCellCenterToProjected,
  groundDistanceBetweenCellsM,
  isCellInside,
  projectedToGeographic,
} from '../coordinates/grid.js'
import { FLAG_ELEVATION_VALID, FLAG_SLOPE_VALID, type TerrainDataset } from './dataset.js'

export type TerrainCellValidity = 'valid' | 'slope-unknown' | 'no-elevation'

export interface TerrainSample {
  readonly cell: GridCell
  readonly index: number
  /** Geographic centre of the cell. */
  readonly geographic: GeographicCoordinate
  readonly projected: ProjectedCoordinate
  readonly validity: TerrainCellValidity
  /** Metres; null unless the DEM has a value. Never substituted. */
  readonly elevationM: number | null
  /** Degrees; null unless slope is known. */
  readonly slopeDeg: number | null
  readonly elevationCategory: ProvenanceCategory
  readonly slopeCategory: ProvenanceCategory
}

export type Traversability = 'traversable' | 'too-steep' | 'slope-unknown' | 'no-elevation' | 'outside-coverage'

export function sampleTerrainCell(dataset: TerrainDataset, cell: GridCell): TerrainSample | null {
  const g = dataset.geometry
  if (!isCellInside(cell, g)) return null
  const index = cell.row * g.width + cell.col
  const f = dataset.flags[index]!
  const hasElev = (f & FLAG_ELEVATION_VALID) !== 0
  const hasSlope = (f & FLAG_SLOPE_VALID) !== 0
  const projected = gridCellCenterToProjected(cell, g)
  return {
    cell,
    index,
    geographic: projectedToGeographic(projected, g),
    projected,
    validity: !hasElev ? 'no-elevation' : hasSlope ? 'valid' : 'slope-unknown',
    elevationM: hasElev ? dataset.elevationM[index]! : null,
    slopeDeg: hasSlope ? dataset.slopeDeg[index]! : null,
    elevationCategory: hasElev ? 'observed' : 'unknown',
    slopeCategory: hasSlope ? 'derived' : 'unknown',
  }
}

export function sampleTerrainAt(
  dataset: TerrainDataset,
  geo: GeographicCoordinate,
): { status: 'ok'; sample: TerrainSample } | EngineError<'INVALID_INPUT' | 'NO_COVERAGE'> {
  const loc = geographicToGrid(geo, dataset.geometry)
  if (loc.status === 'error') return loc
  return { status: 'ok', sample: sampleTerrainCell(dataset, loc.cell)! }
}

/** Classify one cell for a maximum-slope policy. Unknown terrain is never traversable. */
export function classifyCell(dataset: TerrainDataset, cell: GridCell, maxSlopeDeg: number): Traversability {
  if (!isCellInside(cell, dataset.geometry)) return 'outside-coverage'
  const i = cell.row * dataset.geometry.width + cell.col
  const f = dataset.flags[i]!
  if ((f & FLAG_ELEVATION_VALID) === 0) return 'no-elevation'
  if ((f & FLAG_SLOPE_VALID) === 0) return 'slope-unknown'
  return dataset.slopeDeg[i]! <= maxSlopeDeg ? 'traversable' : 'too-steep'
}

export function classifyTraversability(
  dataset: TerrainDataset,
  geo: GeographicCoordinate,
  maxSlopeDeg: number,
): Traversability | 'invalid-coordinate' {
  const loc = geographicToGrid(geo, dataset.geometry)
  if (loc.status === 'error') return loc.code === 'NO_COVERAGE' ? 'outside-coverage' : 'invalid-coordinate'
  return classifyCell(dataset, loc.cell, maxSlopeDeg)
}

export interface SnapCandidate {
  readonly cell: GridCell
  readonly geographic: GeographicCoordinate
  /** Ground distance from the requested point's cell centre, metres. */
  readonly distanceM: number
}

/**
 * Nearest traversable cell within `maxDistanceM` of `cell` (ring search, ties by row then col).
 * Intended for an explicit confirm-to-snap prompt; the engine never moves a point by itself.
 */
export function findNearestTraversableCell(
  dataset: TerrainDataset,
  cell: GridCell,
  options: { maxSlopeDeg: number; maxDistanceM: number },
): SnapCandidate | null {
  const g = dataset.geometry
  const minStep = Math.min(dataset.cellHeightM, dataset.minCellWidthM)
  const maxRing = Math.ceil(options.maxDistanceM / minStep)
  let best: SnapCandidate | null = null
  for (let ring = 0; ring <= maxRing; ring++) {
    // every cell in ring k is at least k * minStep away
    if (best && ring * minStep > best.distanceM) break
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue
        const c = { row: cell.row + dr, col: cell.col + dc }
        if (classifyCell(dataset, c, options.maxSlopeDeg) !== 'traversable') continue
        const d = groundDistanceBetweenCellsM(cell, c, g)
        if (d > options.maxDistanceM) continue
        if (!best || d < best.distanceM - 1e-9 || (Math.abs(d - best.distanceM) <= 1e-9 && (c.row < best.cell.row || (c.row === best.cell.row && c.col < best.cell.col)))) {
          best = { cell: c, geographic: projectedToGeographic(gridCellCenterToProjected(c, g), g), distanceM: d }
        }
      }
    }
  }
  return best
}

/**
 * Horn (1981) slope (degrees) from an elevation grid with physical spacing; NaN where the
 * cell or any neighbour lacks elevation, and on the grid edge. Mirrors the Python pipeline
 * and is used to cross-check shipped slope values.
 */
export function deriveHornSlopeDeg(
  elevation: Float32Array,
  width: number,
  height: number,
  rowCellWidthsM: Float64Array,
  cellHeightM: number,
): Float32Array {
  const out = new Float32Array(width * height).fill(Number.NaN)
  for (let r = 1; r < height - 1; r++) {
    const dx = rowCellWidthsM[r]!
    for (let c = 1; c < width - 1; c++) {
      const i = r * width + c
      const z1 = elevation[i - width - 1]!, z2 = elevation[i - width]!, z3 = elevation[i - width + 1]!
      const z4 = elevation[i - 1]!, z5 = elevation[i]!, z6 = elevation[i + 1]!
      const z7 = elevation[i + width - 1]!, z8 = elevation[i + width]!, z9 = elevation[i + width + 1]!
      const dzdx = (z3 + 2 * z6 + z9 - (z1 + 2 * z4 + z7)) / (8 * dx)
      const dzdy = (z1 + 2 * z2 + z3 - (z7 + 2 * z8 + z9)) / (8 * cellHeightM)
      const s = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI
      if (Number.isFinite(s) && Number.isFinite(z5)) out[i] = s
    }
  }
  return out
}
