/**
 * Public routing API: single legs, mode comparison and independent round trips.
 */
import { engineError, type RoutingError } from '../contracts/errors.js'
import type { GeographicCoordinate, GridCell } from '../contracts/geo.js'
import type { ResultProvenance } from '../contracts/provenance.js'
import { geographicToGrid, gridCellCenterToProjected, indexToCell, projectedToGeographic } from '../coordinates/grid.js'
import type { TerrainDataset } from '../terrain/dataset.js'
import { FLAG_ELEVATION_VALID, FLAG_SLOPE_VALID } from '../terrain/dataset.js'
import { ENGINE_NAME, ENGINE_VERSION, ROUTING_MODEL_VERSION } from '../version.js'
import { AStarSearch, SearchWorkspace, buildPassableMask, moveCost, moveLengthM, type EdgeCostConfig } from './astar.js'
import {
  DEFAULT_LOWER_SLOPE_COST,
  type CombinedLeg,
  type LowerSlopeCostParameters,
  type RoundTripRequest,
  type RoundTripResult,
  type RoundTripRoute,
  type RouteLeg,
  type RouteMetrics,
  type RoutePreference,
  type RouteRequest,
  type RouteResult,
  type RouteVertex,
} from './types.js'

export const DEFAULT_ROUTE_TIMEOUT_MS = 10_000
export const MAX_SUPPORTED_SLOPE_DEG = 60

type Clock = () => number
const defaultClock: Clock = () => {
  const perf = (globalThis as { performance?: { now(): number } }).performance
  return perf ? perf.now() : Date.now()
}

export interface RouteControl {
  /** Injectable clock (ms), for deterministic timeout tests. */
  readonly now?: Clock
  /** Cooperative cancellation check, polled every few thousand expansions. */
  readonly shouldCancel?: () => boolean
}

export interface AsyncRouteControl {
  readonly signal?: { readonly aborted: boolean }
  /** Node expansions between event-loop yields (default 25 000). */
  readonly chunkExpansions?: number
  readonly now?: Clock
}

// ---------------------------------------------------------------------------------------------
// caches (bounded): passable masks per slope policy, one reusable workspace per dataset

const maskCache = new WeakMap<TerrainDataset, Map<number, Uint8Array>>()
const MASK_CACHE_SIZE = 4

function passableFor(dataset: TerrainDataset, maxSlopeDeg: number): Uint8Array {
  let m = maskCache.get(dataset)
  if (!m) {
    m = new Map()
    maskCache.set(dataset, m)
  }
  const hit = m.get(maxSlopeDeg)
  if (hit) {
    m.delete(maxSlopeDeg)
    m.set(maxSlopeDeg, hit)
    return hit
  }
  const mask = buildPassableMask(dataset, maxSlopeDeg)
  m.set(maxSlopeDeg, mask)
  if (m.size > MASK_CACHE_SIZE) m.delete(m.keys().next().value as number)
  return mask
}

const workspaceCache = new WeakMap<TerrainDataset, SearchWorkspace>()

function acquireWorkspace(dataset: TerrainDataset): SearchWorkspace {
  const cached = workspaceCache.get(dataset)
  if (cached && !cached.inUse) {
    cached.inUse = true
    return cached
  }
  const ws = new SearchWorkspace(dataset.statistics.cellCount)
  ws.inUse = true
  if (!cached) workspaceCache.set(dataset, ws)
  return ws
}

function releaseWorkspace(ws: SearchWorkspace): void {
  ws.inUse = false
}

// ---------------------------------------------------------------------------------------------
// validation

interface PreparedLeg {
  readonly startIndex: number
  readonly goalIndex: number
  readonly startLabel: string
  readonly goalLabel: string
}

interface PreparedPolicy {
  readonly preference: RoutePreference
  readonly maxSlopeDeg: number
  readonly connectivity: 4 | 8
  readonly costParams: LowerSlopeCostParameters | null
  readonly cost: EdgeCostConfig
  readonly timeoutMs: number
  readonly maxExpansions: number
}

function preparePolicy(
  dataset: TerrainDataset,
  req: Pick<RouteRequest, 'preference' | 'maxSlopeDeg' | 'costModel' | 'connectivity' | 'limits' | 'datasetVersion'>,
): PreparedPolicy | RoutingError {
  if (req.datasetVersion !== undefined && req.datasetVersion !== dataset.version) {
    return engineError('DATASET_MISMATCH', 'The request was prepared for a different terrain dataset version.', {
      expected: dataset.version,
      received: req.datasetVersion,
    })
  }
  if (req.preference !== 'shortest' && req.preference !== 'lower-slope') {
    return engineError('INVALID_INPUT', 'Route preference must be "shortest" or "lower-slope".')
  }
  const ms = req.maxSlopeDeg
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0 || ms > MAX_SUPPORTED_SLOPE_DEG) {
    return engineError('INVALID_INPUT', `Maximum slope must be greater than 0 and at most ${MAX_SUPPORTED_SLOPE_DEG} degrees.`, { maxSlopeDeg: ms })
  }
  const connectivity = req.connectivity ?? 8
  if (connectivity !== 4 && connectivity !== 8) return engineError('INVALID_INPUT', 'Connectivity must be 4 or 8.')
  let costParams: LowerSlopeCostParameters | null = null
  if (req.preference === 'lower-slope') {
    costParams = { ...DEFAULT_LOWER_SLOPE_COST, ...(req.costModel ?? {}) }
    const { slopeWeight, slopeExponent, uphillWeight, downhillWeight } = costParams
    const bad = [slopeWeight, uphillWeight, downhillWeight].some((w) => typeof w !== 'number' || !Number.isFinite(w) || w < 0 || w > 1000)
    if (bad || typeof slopeExponent !== 'number' || !(slopeExponent >= 0.5 && slopeExponent <= 4)) {
      return engineError('INVALID_INPUT', 'Cost weights must be in [0, 1000] and the slope exponent in [0.5, 4].', { costModel: costParams })
    }
  }
  const timeoutMs = req.limits?.timeoutMs ?? DEFAULT_ROUTE_TIMEOUT_MS
  const maxExpansions = req.limits?.maxExpansions ?? dataset.statistics.cellCount
  if (!(timeoutMs > 0) || !(maxExpansions > 0)) return engineError('INVALID_INPUT', 'Search limits must be positive.')
  return {
    preference: req.preference,
    maxSlopeDeg: ms,
    connectivity,
    costParams,
    cost: costParams
      ? { lowerSlope: true, ...costParams }
      : { lowerSlope: false, slopeWeight: 0, slopeExponent: 2, uphillWeight: 0, downhillWeight: 0 },
    timeoutMs,
    maxExpansions,
  }
}

function locateEndpoint(
  dataset: TerrainDataset,
  coord: GeographicCoordinate,
  role: string,
  maxSlopeDeg: number,
): { index: number; cell: GridCell } | RoutingError {
  const loc = geographicToGrid(coord, dataset.geometry)
  if (loc.status === 'error') {
    return loc.code === 'NO_COVERAGE'
      ? engineError('NO_COVERAGE', `The ${role} is outside the high-resolution terrain coverage.`, { role, ...loc.details })
      : engineError('INVALID_INPUT', `The ${role} coordinate is invalid: ${loc.message}`, { role })
  }
  const f = dataset.flags[loc.index]!
  if ((f & FLAG_ELEVATION_VALID) === 0) {
    return engineError('NO_DATA', `The ${role} lies on a cell without measured elevation.`, { role, cell: loc.cell })
  }
  if ((f & FLAG_SLOPE_VALID) === 0) {
    return engineError('NO_DATA', `The ${role} lies on a cell whose slope is unknown (edge of data).`, { role, cell: loc.cell })
  }
  const s = dataset.slopeDeg[loc.index]!
  if (s > maxSlopeDeg) {
    return engineError('UNSUPPORTED_SLOPE', `The ${role} cell slope (${s.toFixed(1)} deg) exceeds the ${maxSlopeDeg} deg limit.`, {
      role,
      cell: loc.cell,
      slopeDeg: s,
      maxSlopeDeg,
    })
  }
  return { index: loc.index, cell: loc.cell }
}

// ---------------------------------------------------------------------------------------------
// search drivers

type Found = { status: 'found'; path: Int32Array; cost: number; expanded: number; elapsedMs: number }
type Exhausted = { status: 'exhausted'; expanded: number }
type RawOutcome = Found | Exhausted | RoutingError
type SearchOutcome = Found | RoutingError

/** Slope limit used only to diagnose a failed search: every cell with a known slope is allowed. */
const DIAGNOSTIC_SLOPE_DEG = 89.9
const DISTANCE_ONLY: EdgeCostConfig = { lowerSlope: false, slopeWeight: 0, slopeExponent: 2, uphillWeight: 0, downhillWeight: 0 }

function diagnosticPolicy(policy: PreparedPolicy): PreparedPolicy {
  return { ...policy, maxSlopeDeg: DIAGNOSTIC_SLOPE_DEG, cost: DISTANCE_ONLY, costParams: null }
}

function searchSync(dataset: TerrainDataset, leg: PreparedLeg, policy: PreparedPolicy, control: RouteControl): RawOutcome {
  const now = control.now ?? defaultClock
  const t0 = now()
  const passable = passableFor(dataset, policy.maxSlopeDeg)
  const ws = acquireWorkspace(dataset)
  try {
    const search = new AStarSearch(
      { dataset, passable, maxSlopeDeg: policy.maxSlopeDeg, connectivity: policy.connectivity, cost: policy.cost, start: leg.startIndex, goal: leg.goalIndex },
      ws,
    )
    const chunk = 4096
    for (;;) {
      const st = search.step(Math.min(chunk, policy.maxExpansions - search.expanded + 1))
      if (st === 'found') return { status: 'found', path: search.path(), cost: search.goalCost(), expanded: search.expanded, elapsedMs: now() - t0 }
      if (st === 'exhausted') return { status: 'exhausted', expanded: search.expanded }
      if (search.expanded >= policy.maxExpansions) return timeout(leg, policy, search.expanded, 'expansion budget')
      if (now() - t0 > policy.timeoutMs) return timeout(leg, policy, search.expanded, 'time budget')
      if (control.shouldCancel?.()) return engineError('CANCELLED', 'The route calculation was cancelled.')
    }
  } finally {
    releaseWorkspace(ws)
  }
}

const yieldToEventLoop = (): Promise<void> => {
  const st = (globalThis as { setTimeout?: (cb: () => void, ms: number) => unknown }).setTimeout
  return new Promise((resolve) => (st ? st(resolve, 0) : resolve()))
}

async function searchAsync(
  dataset: TerrainDataset,
  leg: PreparedLeg,
  policy: PreparedPolicy,
  control: AsyncRouteControl,
): Promise<RawOutcome> {
  const now = control.now ?? defaultClock
  const t0 = now()
  const chunk = control.chunkExpansions ?? 25_000
  const passable = passableFor(dataset, policy.maxSlopeDeg)
  // A private workspace: concurrent async searches must not share buffers.
  const ws = new SearchWorkspace(dataset.statistics.cellCount)
  const search = new AStarSearch(
    { dataset, passable, maxSlopeDeg: policy.maxSlopeDeg, connectivity: policy.connectivity, cost: policy.cost, start: leg.startIndex, goal: leg.goalIndex },
    ws,
  )
  for (;;) {
    if (control.signal?.aborted) return engineError('CANCELLED', 'The route calculation was cancelled.')
    const st = search.step(Math.min(chunk, policy.maxExpansions - search.expanded + 1))
    if (st === 'found') return { status: 'found', path: search.path(), cost: search.goalCost(), expanded: search.expanded, elapsedMs: now() - t0 }
    if (st === 'exhausted') return { status: 'exhausted', expanded: search.expanded }
    if (search.expanded >= policy.maxExpansions) return timeout(leg, policy, search.expanded, 'expansion budget')
    if (now() - t0 > policy.timeoutMs) return timeout(leg, policy, search.expanded, 'time budget')
    await yieldToEventLoop()
  }
}

/**
 * A search that exhausts the graph is re-run once with no slope limit (distance cost only) to
 * tell the user why it failed: if measured terrain connects the points, the slope limit is the
 * cause (UNSUPPORTED_SLOPE); otherwise cells without elevation or slope separate them (NO_ROUTE).
 * Worst-case cost of a failure is therefore two searches, each with its own budget.
 */
function explainExhausted(leg: PreparedLeg, policy: PreparedPolicy, expanded: number, diag: RawOutcome): RoutingError {
  if (diag.status === 'error' && diag.code === 'CANCELLED') return diag
  const base = { from: leg.startLabel, to: leg.goalLabel, maxSlopeDeg: policy.maxSlopeDeg, nodesExpanded: expanded }
  if (diag.status === 'found') {
    return engineError(
      'UNSUPPORTED_SLOPE',
      `Measured terrain connects ${leg.startLabel} and ${leg.goalLabel}, but every such path exceeds the ${policy.maxSlopeDeg} deg slope limit.`,
      { ...base, cause: 'slope-limit' },
    )
  }
  if (diag.status === 'exhausted') {
    return engineError(
      'NO_ROUTE',
      `No path through measured terrain connects ${leg.startLabel} and ${leg.goalLabel}: cells without elevation or slope separate them.`,
      { ...base, cause: 'disconnected' },
    )
  }
  return engineError(
    'NO_ROUTE',
    `No path connects ${leg.startLabel} and ${leg.goalLabel} within the ${policy.maxSlopeDeg} deg slope limit; the cause could not be diagnosed (${diag.code}).`,
    { ...base, cause: 'undiagnosed' },
  )
}

function runSync(dataset: TerrainDataset, leg: PreparedLeg, policy: PreparedPolicy, control: RouteControl): SearchOutcome {
  const out = searchSync(dataset, leg, policy, control)
  if (out.status !== 'exhausted') return out
  return explainExhausted(leg, policy, out.expanded, searchSync(dataset, leg, diagnosticPolicy(policy), control))
}

async function runAsync(
  dataset: TerrainDataset,
  leg: PreparedLeg,
  policy: PreparedPolicy,
  control: AsyncRouteControl,
): Promise<SearchOutcome> {
  const out = await searchAsync(dataset, leg, policy, control)
  if (out.status !== 'exhausted') return out
  return explainExhausted(leg, policy, out.expanded, await searchAsync(dataset, leg, diagnosticPolicy(policy), control))
}

function timeout(leg: PreparedLeg, policy: PreparedPolicy, expanded: number, which: string): RoutingError {
  return engineError('COMPUTATION_TIMEOUT', `The route search exceeded its ${which}.`, {
    from: leg.startLabel,
    to: leg.goalLabel,
    nodesExpanded: expanded,
    timeoutMs: policy.timeoutMs,
    maxExpansions: policy.maxExpansions,
  })
}

// ---------------------------------------------------------------------------------------------
// metrics

function buildLeg(
  dataset: TerrainDataset,
  id: string,
  leg: PreparedLeg,
  policy: PreparedPolicy,
  outcome: Extract<SearchOutcome, { status: 'found' }>,
): RouteLeg {
  const g = dataset.geometry
  const path = outcome.path
  const vertices: RouteVertex[] = []
  let dist = 0
  let surf = 0
  let ascent = 0
  let descent = 0
  let maxSlope = 0
  let slopeIntegral = 0
  let maxGrade = 0
  let minZ = Infinity
  let maxZ = -Infinity
  let totalCost = 0
  for (let k = 0; k < path.length; k++) {
    const i = path[k]!
    const z = dataset.elevationM[i]!
    const s = dataset.slopeDeg[i]!
    if (k > 0) {
      const prev = path[k - 1]!
      const d = moveLengthM(dataset, prev, i)
      const dz = z - dataset.elevationM[prev]!
      dist += d
      surf += Math.sqrt(d * d + dz * dz)
      if (dz > 0) ascent += dz
      else descent -= dz
      slopeIntegral += d * 0.5 * (s + dataset.slopeDeg[prev]!)
      maxGrade = Math.max(maxGrade, (Math.atan(Math.abs(dz) / d) * 180) / Math.PI)
      totalCost += moveCost(dataset, prev, i, policy.maxSlopeDeg, policy.cost)
    }
    maxSlope = Math.max(maxSlope, s)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
    const cell = indexToCell(i, g)
    const projected = gridCellCenterToProjected(cell, g)
    vertices.push({
      cell,
      geographic: projectedToGeographic(projected, g),
      projected,
      elevationM: z,
      slopeDeg: s,
      distanceM: dist,
      surfaceDistanceM: surf,
    })
  }
  const zStart = dataset.elevationM[path[0]!]!
  const zEnd = dataset.elevationM[path[path.length - 1]!]!
  const metrics: RouteMetrics = {
    planimetricDistanceM: dist,
    surfaceDistanceM: surf,
    ascentM: ascent,
    descentM: descent,
    netElevationChangeM: zEnd - zStart,
    minElevationM: minZ,
    maxElevationM: maxZ,
    maxSlopeDeg: maxSlope,
    meanSlopeDeg: dist > 0 ? slopeIntegral / dist : dataset.slopeDeg[path[0]!]!,
    maxEdgeGradeDeg: maxGrade,
    cellCount: path.length,
    totalCost,
    costPerMeter: dist > 0 ? totalCost / dist : 1,
  }
  return {
    id,
    fromLabel: leg.startLabel,
    toLabel: leg.goalLabel,
    preference: policy.preference,
    maxSlopeDeg: policy.maxSlopeDeg,
    costModel: policy.costParams,
    connectivity: policy.connectivity,
    vertices,
    metrics,
    search: { nodesExpanded: outcome.expanded, elapsedMs: outcome.elapsedMs },
  }
}

function routeProvenance(dataset: TerrainDataset): ResultProvenance {
  return {
    engine: ENGINE_NAME,
    engineVersion: ENGINE_VERSION,
    model: 'A* on DEM-derived traversability grid',
    modelVersion: ROUTING_MODEL_VERSION,
    category: 'derived',
    inputs: [`terrain ${dataset.id} sha256 ${dataset.version}`, 'simulated assumption: maximum slope'],
  }
}

function prepareSingle(dataset: TerrainDataset, request: RouteRequest): { leg: PreparedLeg; policy: PreparedPolicy } | RoutingError {
  if (!request || typeof request !== 'object') return engineError('INVALID_INPUT', 'A route request object is required.')
  const policy = preparePolicy(dataset, request)
  if ('status' in policy) return policy
  const startLabel = request.startLabel ?? 'start'
  const goalLabel = request.destinationLabel ?? 'destination'
  const a = locateEndpoint(dataset, request.start, startLabel, policy.maxSlopeDeg)
  if ('status' in a) return a
  const b = locateEndpoint(dataset, request.destination, goalLabel, policy.maxSlopeDeg)
  if ('status' in b) return b
  return { leg: { startIndex: a.index, goalIndex: b.index, startLabel, goalLabel }, policy }
}

/** Compute one terrain-aware leg (synchronous). */
export function calculateRoute(dataset: TerrainDataset, request: RouteRequest, control: RouteControl = {}): RouteResult {
  const prep = prepareSingle(dataset, request)
  if ('status' in prep) return prep
  const out = runSync(dataset, prep.leg, prep.policy, control)
  if (out.status !== 'found') return out
  return {
    status: 'ok',
    leg: buildLeg(dataset, 'leg', prep.leg, prep.policy, out),
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    modelVersion: ROUTING_MODEL_VERSION,
    provenance: routeProvenance(dataset),
  }
}

/** Same as calculateRoute but yields to the event loop between chunks and honours an AbortSignal. */
export async function calculateRouteAsync(
  dataset: TerrainDataset,
  request: RouteRequest,
  control: AsyncRouteControl = {},
): Promise<RouteResult> {
  const prep = prepareSingle(dataset, request)
  if ('status' in prep) return prep
  const out = await runAsync(dataset, prep.leg, prep.policy, control)
  if (out.status !== 'found') return out
  return {
    status: 'ok',
    leg: buildLeg(dataset, 'leg', prep.leg, prep.policy, out),
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    modelVersion: ROUTING_MODEL_VERSION,
    provenance: routeProvenance(dataset),
  }
}

export interface RouteComparison {
  readonly status: 'ok'
  readonly shortest: RouteLeg
  readonly lowerSlope: RouteLeg
  readonly summary: {
    readonly identicalPath: boolean
    readonly extraDistanceM: number
    readonly extraDistancePct: number
    readonly maxSlopeReductionDeg: number
    readonly meanSlopeReductionDeg: number
    readonly ascentDifferenceM: number
  }
  readonly datasetId: string
  readonly datasetVersion: string
}

/** Compute both preferences for the same endpoints and summarise the trade-off. */
export function compareRoutes(
  dataset: TerrainDataset,
  request: Omit<RouteRequest, 'preference'>,
  control: RouteControl = {},
): RouteComparison | RoutingError {
  const a = calculateRoute(dataset, { ...request, preference: 'shortest' }, control)
  if (a.status !== 'ok') return a
  const b = calculateRoute(dataset, { ...request, preference: 'lower-slope' }, control)
  if (b.status !== 'ok') return b
  const s = a.leg.metrics
  const l = b.leg.metrics
  return {
    status: 'ok',
    shortest: a.leg,
    lowerSlope: b.leg,
    summary: {
      identicalPath: samePath(a.leg.vertices, b.leg.vertices, false),
      extraDistanceM: l.planimetricDistanceM - s.planimetricDistanceM,
      extraDistancePct: s.planimetricDistanceM > 0 ? (100 * (l.planimetricDistanceM - s.planimetricDistanceM)) / s.planimetricDistanceM : 0,
      maxSlopeReductionDeg: s.maxSlopeDeg - l.maxSlopeDeg,
      meanSlopeReductionDeg: s.meanSlopeDeg - l.meanSlopeDeg,
      ascentDifferenceM: l.ascentM - s.ascentM,
    },
    datasetId: dataset.id,
    datasetVersion: dataset.version,
  }
}

function samePath(a: readonly RouteVertex[], b: readonly RouteVertex[], reversed: boolean): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!.cell
    const y = b[reversed ? b.length - 1 - i : i]!.cell
    if (x.row !== y.row || x.col !== y.col) return false
  }
  return true
}

function combine(segments: readonly RouteLeg[], stopIds: readonly { id: string; label: string }[]): CombinedLeg {
  const vertices: RouteVertex[] = []
  const arrivals: { stopId: string; label: string; distanceM: number; surfaceDistanceM: number }[] = []
  let dOff = 0
  let sOff = 0
  let ascent = 0
  let descent = 0
  let maxSlope = 0
  let maxGrade = 0
  let slopeIntegral = 0
  let cost = 0
  let minZ = Infinity
  let maxZ = -Infinity
  segments.forEach((seg, si) => {
    seg.vertices.forEach((v, vi) => {
      if (si > 0 && vi === 0) return // junction already present
      vertices.push({ ...v, distanceM: v.distanceM + dOff, surfaceDistanceM: v.surfaceDistanceM + sOff })
    })
    const m = seg.metrics
    ascent += m.ascentM
    descent += m.descentM
    maxSlope = Math.max(maxSlope, m.maxSlopeDeg)
    maxGrade = Math.max(maxGrade, m.maxEdgeGradeDeg)
    slopeIntegral += m.meanSlopeDeg * m.planimetricDistanceM
    cost += m.totalCost
    minZ = Math.min(minZ, m.minElevationM)
    maxZ = Math.max(maxZ, m.maxElevationM)
    dOff += m.planimetricDistanceM
    sOff += m.surfaceDistanceM
    const stop = stopIds[si]!
    arrivals.push({ stopId: stop.id, label: stop.label, distanceM: dOff, surfaceDistanceM: sOff })
  })
  const first = vertices[0]!
  const last = vertices[vertices.length - 1]!
  return {
    id: 'outbound',
    vertices,
    arrivals,
    metrics: {
      planimetricDistanceM: dOff,
      surfaceDistanceM: sOff,
      ascentM: ascent,
      descentM: descent,
      netElevationChangeM: last.elevationM - first.elevationM,
      minElevationM: minZ,
      maxElevationM: maxZ,
      maxSlopeDeg: maxSlope,
      meanSlopeDeg: dOff > 0 ? slopeIntegral / dOff : first.slopeDeg,
      maxEdgeGradeDeg: maxGrade,
      cellCount: vertices.length,
      totalCost: cost,
      costPerMeter: dOff > 0 ? cost / dOff : 1,
    },
  }
}

function prepareRoundTrip(
  dataset: TerrainDataset,
  request: RoundTripRequest,
): { legs: PreparedLeg[]; policy: PreparedPolicy } | (RoutingError & { failedLeg?: string }) {
  if (!request || typeof request !== 'object') return engineError('INVALID_INPUT', 'A round-trip request object is required.')
  const policy = preparePolicy(dataset, request)
  if ('status' in policy) return policy
  if (!Array.isArray(request.stops) || request.stops.length === 0) {
    return engineError('INVALID_INPUT', 'A round trip needs at least one stop (the destination).')
  }
  if (request.stops.length > 10) return engineError('INVALID_INPUT', 'At most 10 stops are supported per round trip.')
  const ids = new Set<string>()
  for (const s of request.stops) {
    if (!s || typeof s.id !== 'string' || s.id.length === 0 || ids.has(s.id)) {
      return engineError('INVALID_INPUT', 'Every stop needs a unique non-empty id.')
    }
    ids.add(s.id)
    if (typeof s.activityDurationS !== 'number' || !Number.isFinite(s.activityDurationS) || s.activityDurationS < 0 || s.activityDurationS > 86_400) {
      return engineError('INVALID_INPUT', `Stop "${s.label}" needs an activity duration between 0 and 86400 s.`, { stopId: s.id })
    }
  }
  const habitatLabel = request.habitatLabel ?? 'habitat'
  const habitat = locateEndpoint(dataset, request.habitat, habitatLabel, policy.maxSlopeDeg)
  if ('status' in habitat) return habitat
  const pts: { index: number; label: string }[] = [{ index: habitat.index, label: habitatLabel }]
  for (const s of request.stops) {
    const p = locateEndpoint(dataset, s.coordinate, s.label || s.id, policy.maxSlopeDeg)
    if ('status' in p) return { ...p, failedLeg: s.id }
    pts.push({ index: p.index, label: s.label || s.id })
  }
  const legs: PreparedLeg[] = []
  for (let i = 0; i + 1 < pts.length; i++) {
    legs.push({ startIndex: pts[i]!.index, goalIndex: pts[i + 1]!.index, startLabel: pts[i]!.label, goalLabel: pts[i + 1]!.label })
  }
  const last = pts[pts.length - 1]!
  legs.push({ startIndex: last.index, goalIndex: habitat.index, startLabel: last.label, goalLabel: habitatLabel })
  return { legs, policy }
}

function assembleRoundTrip(
  dataset: TerrainDataset,
  request: RoundTripRequest,
  policy: PreparedPolicy,
  built: RouteLeg[],
): RoundTripRoute {
  const outboundSegments = built.slice(0, -1)
  const inbound = built[built.length - 1]!
  const outbound = combine(
    outboundSegments,
    request.stops.map((s) => ({ id: s.id, label: s.label || s.id })),
  )
  return {
    preference: policy.preference,
    maxSlopeDeg: policy.maxSlopeDeg,
    costModel: policy.costParams,
    habitat: request.habitat,
    habitatLabel: request.habitatLabel ?? 'habitat',
    stops: request.stops.map((s) => ({ ...s })),
    outboundSegments,
    outbound,
    inbound,
    totals: {
      planimetricDistanceM: outbound.metrics.planimetricDistanceM + inbound.metrics.planimetricDistanceM,
      surfaceDistanceM: outbound.metrics.surfaceDistanceM + inbound.metrics.surfaceDistanceM,
      ascentM: outbound.metrics.ascentM + inbound.metrics.ascentM,
      descentM: outbound.metrics.descentM + inbound.metrics.descentM,
      maxSlopeDeg: Math.max(outbound.metrics.maxSlopeDeg, inbound.metrics.maxSlopeDeg),
      totalCost: outbound.metrics.totalCost + inbound.metrics.totalCost,
    },
    identicalLegs: samePath(outbound.vertices, inbound.vertices, true),
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    modelVersion: ROUTING_MODEL_VERSION,
    provenance: routeProvenance(dataset),
  }
}

/**
 * Habitat -> stops (fixed order) -> habitat. Every leg, including the return leg, is an
 * independent A* search; the return is never assumed to equal the reversed outbound path.
 */
export function calculateRoundTrip(dataset: TerrainDataset, request: RoundTripRequest, control: RouteControl = {}): RoundTripResult {
  const prep = prepareRoundTrip(dataset, request)
  if ('status' in prep) return prep
  const built: RouteLeg[] = []
  for (let i = 0; i < prep.legs.length; i++) {
    const leg = prep.legs[i]!
    const out = runSync(dataset, leg, prep.policy, control)
    const id = i === prep.legs.length - 1 ? 'return' : `outbound-${i + 1}`
    if (out.status !== 'found') return { ...out, failedLeg: id }
    built.push(buildLeg(dataset, id, leg, prep.policy, out))
  }
  return { status: 'ok', route: assembleRoundTrip(dataset, request, prep.policy, built) }
}

export async function calculateRoundTripAsync(
  dataset: TerrainDataset,
  request: RoundTripRequest,
  control: AsyncRouteControl = {},
): Promise<RoundTripResult> {
  const prep = prepareRoundTrip(dataset, request)
  if ('status' in prep) return prep
  const built: RouteLeg[] = []
  for (let i = 0; i < prep.legs.length; i++) {
    const leg = prep.legs[i]!
    const out = await runAsync(dataset, leg, prep.policy, control)
    const id = i === prep.legs.length - 1 ? 'return' : `outbound-${i + 1}`
    if (out.status !== 'found') return { ...out, failedLeg: id }
    built.push(buildLeg(dataset, id, leg, prep.policy, out))
  }
  return { status: 'ok', route: assembleRoundTrip(dataset, request, prep.policy, built) }
}

/** Both preferences for a full round trip. */
export function compareRoundTrips(
  dataset: TerrainDataset,
  request: Omit<RoundTripRequest, 'preference'>,
  control: RouteControl = {},
):
  | { status: 'ok'; shortest: RoundTripRoute; lowerSlope: RoundTripRoute }
  | (RoutingError & { failedLeg?: string; preference: RoutePreference }) {
  const a = calculateRoundTrip(dataset, { ...request, preference: 'shortest' }, control)
  if (a.status !== 'ok') return { ...a, preference: 'shortest' }
  const b = calculateRoundTrip(dataset, { ...request, preference: 'lower-slope' }, control)
  if (b.status !== 'ok') return { ...b, preference: 'lower-slope' }
  return { status: 'ok', shortest: a.route, lowerSlope: b.route }
}

/** GeoJSON (lon, lat) FeatureCollection for map display. */
export function roundTripToGeoJSON(route: RoundTripRoute): {
  type: 'FeatureCollection'
  features: { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: 'LineString'; coordinates: [number, number][] } }[]
} {
  const line = (vs: readonly RouteVertex[]) => vs.map((v) => [v.geographic.lonEast, v.geographic.latNorth] as [number, number])
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { id: 'outbound', preference: route.preference, distance_m: route.outbound.metrics.planimetricDistanceM, category: 'derived' },
        geometry: { type: 'LineString', coordinates: line(route.outbound.vertices) },
      },
      {
        type: 'Feature',
        properties: { id: 'return', preference: route.preference, distance_m: route.inbound.metrics.planimetricDistanceM, category: 'derived' },
        geometry: { type: 'LineString', coordinates: line(route.inbound.vertices) },
      },
    ],
  }
}
