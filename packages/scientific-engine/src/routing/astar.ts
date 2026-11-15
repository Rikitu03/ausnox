/**
 * A* over the terrain grid (docs/SCIENTIFIC_MODELS.md §4).
 *
 * Graph: one node per cell; 8 (or 4) neighbours. A move a -> b is legal only if
 *   - a and b are traversable (elevation + slope known, slope <= maxSlope),
 *   - for diagonal moves, BOTH orthogonal cells between a and b are traversable (no corner cutting),
 *   - the move grade |dz| / d <= tan(maxSlope).
 * Edge length d is planimetric ground distance on the Mars sphere:
 *   E-W: dx(row) = cellSizeX * cos(lat_row); N-S: dy; diagonal: sqrt(mean(dx)^2 + dy^2).
 * Heuristic: octile (8-conn) / Manhattan (4-conn) distance using the smallest row width,
 * which never overestimates the remaining distance; costs are >= d, so it is admissible
 * and consistent and A* returns a minimum-cost path.
 * Ties are broken by lower f, then lower h, then lower cell index (deterministic).
 */
import type { TerrainDataset } from '../terrain/dataset.js'
import { FLAG_ELEVATION_VALID, FLAG_SLOPE_VALID } from '../terrain/dataset.js'
import { IndexedMinHeap } from './heap.js'

export interface EdgeCostConfig {
  readonly lowerSlope: boolean
  readonly slopeWeight: number
  readonly slopeExponent: number
  readonly uphillWeight: number
  readonly downhillWeight: number
}

export interface SearchProblem {
  readonly dataset: TerrainDataset
  readonly passable: Uint8Array
  readonly maxSlopeDeg: number
  readonly connectivity: 4 | 8
  readonly cost: EdgeCostConfig
  readonly start: number
  readonly goal: number
}

export type SearchStatus = 'running' | 'found' | 'exhausted'

// Neighbour order is fixed for determinism: N, NE, E, SE, S, SW, W, NW
const DR8 = Int8Array.of(-1, -1, 0, 1, 1, 1, 0, -1)
const DC8 = Int8Array.of(0, 1, 1, 1, 0, -1, -1, -1)
const DR4 = Int8Array.of(-1, 0, 1, 0)
const DC4 = Int8Array.of(0, 1, 0, -1)

const UNSEEN = 0
const OPEN = 1
const CLOSED = 2

export class SearchWorkspace {
  readonly g: Float64Array
  readonly f: Float64Array
  readonly h: Float64Array
  readonly parent: Int32Array
  readonly state: Uint8Array
  readonly heap: IndexedMinHeap
  inUse = false

  constructor(readonly capacity: number) {
    this.g = new Float64Array(capacity)
    this.f = new Float64Array(capacity)
    this.h = new Float64Array(capacity)
    this.parent = new Int32Array(capacity)
    this.state = new Uint8Array(capacity)
    this.heap = new IndexedMinHeap(capacity, this.f, this.h)
  }

  reset(): void {
    this.heap.clear()
    this.g.fill(Infinity)
    this.parent.fill(-1)
    this.state.fill(UNSEEN)
  }
}

/** Traversable-cell mask for a slope policy (1 = traversable). */
export function buildPassableMask(dataset: TerrainDataset, maxSlopeDeg: number): Uint8Array {
  const n = dataset.statistics.cellCount
  const out = new Uint8Array(n)
  const flags = dataset.flags
  const slope = dataset.slopeDeg
  const need = FLAG_ELEVATION_VALID | FLAG_SLOPE_VALID
  for (let i = 0; i < n; i++) out[i] = (flags[i]! & need) === need && slope[i]! <= maxSlopeDeg ? 1 : 0
  return out
}

/** Planimetric length of the move a -> b between adjacent cells (metres). */
export function moveLengthM(dataset: TerrainDataset, a: number, b: number): number {
  const w = dataset.geometry.width
  const ra = (a / w) | 0
  const rb = (b / w) | 0
  const dcol = b - rb * w - (a - ra * w)
  const widths = dataset.rowCellWidthsM
  if (ra === rb) return widths[ra]! * Math.abs(dcol)
  if (dcol === 0) return dataset.cellHeightM
  const dxm = 0.5 * (widths[ra]! + widths[rb]!)
  return Math.sqrt(dxm * dxm + dataset.cellHeightM * dataset.cellHeightM)
}

/** Cost of an adjacent move, or -1 if the move breaks the grade limit. Mirrors the A* inner loop. */
export function moveCost(
  dataset: TerrainDataset,
  a: number,
  b: number,
  maxSlopeDeg: number,
  cost: EdgeCostConfig,
): number {
  const d = moveLengthM(dataset, a, b)
  const tanMax = Math.tan((maxSlopeDeg * Math.PI) / 180)
  const dz = dataset.elevationM[b]! - dataset.elevationM[a]!
  if (Math.abs(dz) > d * tanMax) return -1
  if (!cost.lowerSlope) return d
  const sNorm = (0.5 * (dataset.slopeDeg[a]! + dataset.slopeDeg[b]!)) / maxSlopeDeg
  const S = cost.slopeExponent === 2 ? sNorm * sNorm : Math.pow(sNorm, cost.slopeExponent)
  const gn = dz / d / tanMax
  const U = gn > 0 ? gn * gn : 0
  const D = gn < 0 ? gn * gn : 0
  return d * (1 + cost.slopeWeight * S + cost.uphillWeight * U + cost.downhillWeight * D)
}

export class AStarSearch {
  private status: SearchStatus = 'running'
  private expandedCount = 0
  private readonly W: number
  private readonly H: number
  private readonly goalRow: number
  private readonly goalCol: number
  private readonly dxMin: number
  private readonly dy: number
  private readonly diag: number
  private readonly tanMax: number

  constructor(
    private readonly p: SearchProblem,
    private readonly ws: SearchWorkspace,
  ) {
    const g = p.dataset.geometry
    this.W = g.width
    this.H = g.height
    this.goalRow = (p.goal / this.W) | 0
    this.goalCol = p.goal - this.goalRow * this.W
    this.dxMin = p.dataset.minCellWidthM
    this.dy = p.dataset.cellHeightM
    this.diag = Math.sqrt(this.dxMin * this.dxMin + this.dy * this.dy)
    this.tanMax = Math.tan((p.maxSlopeDeg * Math.PI) / 180)
    ws.reset()
    if (!p.passable[p.start] || !p.passable[p.goal]) {
      this.status = 'exhausted'
      return
    }
    ws.g[p.start] = 0
    const h0 = this.heuristic(p.start)
    ws.h[p.start] = h0
    ws.f[p.start] = h0
    ws.state[p.start] = OPEN
    ws.heap.push(p.start)
  }

  get expanded(): number {
    return this.expandedCount
  }

  get currentStatus(): SearchStatus {
    return this.status
  }

  heuristic(i: number): number {
    const r = (i / this.W) | 0
    const dc = Math.abs(i - r * this.W - this.goalCol)
    const dr = Math.abs(r - this.goalRow)
    if (this.p.connectivity === 4) return dc * this.dxMin + dr * this.dy
    const m = dc < dr ? dc : dr
    return m * this.diag + (dc - m) * this.dxMin + (dr - m) * this.dy
  }

  /** Expand up to `maxExpansions` nodes. */
  step(maxExpansions: number): SearchStatus {
    if (this.status !== 'running') return this.status
    const { passable, goal, cost } = this.p
    const { g, f, h, parent, state, heap } = this.ws
    const elev = this.p.dataset.elevationM
    const slope = this.p.dataset.slopeDeg
    const widths = this.p.dataset.rowCellWidthsM
    const W = this.W
    const H = this.H
    const dy = this.dy
    const tanMax = this.tanMax
    const maxSlope = this.p.maxSlopeDeg
    const lower = cost.lowerSlope
    const ws_ = cost.slopeWeight
    const wu = cost.uphillWeight
    const wd = cost.downhillWeight
    const expo = cost.slopeExponent
    const DR = this.p.connectivity === 8 ? DR8 : DR4
    const DC = this.p.connectivity === 8 ? DC8 : DC4
    const K = DR.length
    let budget = maxExpansions

    while (budget-- > 0) {
      const cur = heap.pop()
      if (cur < 0) {
        this.status = 'exhausted'
        return this.status
      }
      state[cur] = CLOSED
      if (cur === goal) {
        this.status = 'found'
        return this.status
      }
      this.expandedCount++
      const r = (cur / W) | 0
      const c = cur - r * W
      const gCur = g[cur]!
      const zCur = elev[cur]!
      for (let k = 0; k < K; k++) {
        const dr = DR[k]!
        const dc = DC[k]!
        const nr = r + dr
        const nc = c + dc
        if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue
        const ni = nr * W + nc
        if (passable[ni] === 0 || state[ni] === CLOSED) continue
        let d: number
        if (dr === 0) {
          d = widths[r]!
        } else if (dc === 0) {
          d = dy
        } else {
          // no corner cutting: both orthogonal cells must be traversable
          if (passable[r * W + nc] === 0 || passable[nr * W + c] === 0) continue
          const dxm = 0.5 * (widths[r]! + widths[nr]!)
          d = Math.sqrt(dxm * dxm + dy * dy)
        }
        const dz = elev[ni]! - zCur
        if ((dz < 0 ? -dz : dz) > d * tanMax) continue
        let edge = d
        if (lower) {
          const sNorm = (0.5 * (slope[cur]! + slope[ni]!)) / maxSlope
          const S = expo === 2 ? sNorm * sNorm : Math.pow(sNorm, expo)
          const gn = dz / d / tanMax
          const U = gn > 0 ? gn * gn : 0
          const D = gn < 0 ? gn * gn : 0
          edge = d * (1 + ws_ * S + wu * U + wd * D)
        }
        const tentative = gCur + edge
        if (tentative < g[ni]!) {
          g[ni] = tentative
          parent[ni] = cur
          if (state[ni] === OPEN) {
            f[ni] = tentative + h[ni]!
            heap.decreaseKey(ni)
          } else {
            const hn = this.heuristic(ni)
            h[ni] = hn
            f[ni] = tentative + hn
            state[ni] = OPEN
            heap.push(ni)
          }
        }
      }
    }
    return this.status
  }

  /** Cell indices from start to goal (inclusive). Only valid after status 'found'. */
  path(): Int32Array {
    if (this.status !== 'found') return new Int32Array(0)
    const out: number[] = []
    for (let i = this.p.goal; i >= 0; i = this.ws.parent[i]!) {
      out.push(i)
      if (i === this.p.start) break
    }
    out.reverse()
    return Int32Array.from(out)
  }

  goalCost(): number {
    return this.status === 'found' ? this.ws.g[this.p.goal]! : Infinity
  }
}
