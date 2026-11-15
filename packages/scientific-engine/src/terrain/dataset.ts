/**
 * In-memory terrain dataset: validated manifest + typed-array views of terrain.bin.
 */
import type { GeographicBounds, GridGeometry, ProjectedBounds } from '../contracts/geo.js'
import { engineError, type EngineError } from '../contracts/errors.js'
import type { ProvenanceRecord } from '../contracts/provenance.js'
import { computeRowCellWidthsM, gridGeographicBounds, gridProjectedBounds } from '../coordinates/grid.js'
import { listManifestProblems, type PipelineValidationStatus, type TerrainManifest } from './manifest.js'

export const FLAG_ELEVATION_VALID = 1
export const FLAG_SLOPE_VALID = 2
const FLAGS_KNOWN = FLAG_ELEVATION_VALID | FLAG_SLOPE_VALID

export type ChecksumStatus = 'verified' | 'not-checked'

export interface CrossValidationSummary {
  readonly overall: 'PASS' | 'FAIL'
  readonly report: string | null
  readonly checks: readonly { readonly id: string; readonly status: string; readonly summary: string }[]
}

export interface TerrainVerification {
  /** Result recorded by scientific-pipeline/scripts/validate_terrain.py. */
  readonly pipelineValidation: PipelineValidationStatus
  /** SHA-256 of terrain.bin compared with the manifest at load time. */
  readonly checksum: ChecksumStatus
  /** True only when the pipeline validation passed; required for a "feasible" verdict. */
  readonly verifiedForFeasibility: boolean
  /**
   * Supplementary cross-checks from scientific-pipeline/scripts/cross_validate.py (CTX DTM
   * agreement, DTM-to-imagery registration). They concern overlay display, not routing data,
   * so they do not change `verifiedForFeasibility`. Null when not recorded.
   */
  readonly crossValidation: CrossValidationSummary | null
  readonly notes: readonly string[]
}

function parseCrossValidation(raw: unknown): CrossValidationSummary | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as { overall?: unknown; report?: unknown; checks?: unknown }
  if ((r.overall !== 'PASS' && r.overall !== 'FAIL') || !Array.isArray(r.checks)) return null
  const checks = r.checks
    .filter((c): c is { id: string; status: string; summary: string } =>
      typeof c === 'object' && c !== null && typeof c.id === 'string' && typeof c.status === 'string' && typeof c.summary === 'string')
    .map((c) => ({ id: c.id, status: c.status, summary: c.summary }))
  return { overall: r.overall, report: typeof r.report === 'string' ? r.report : null, checks }
}

export interface TerrainDataset {
  readonly id: string
  /** Content version: SHA-256 of terrain.bin. Results carry it for stale-result rejection. */
  readonly version: string
  readonly schemaVersion: string
  readonly title: string
  readonly geometry: GridGeometry
  /** Row-major, row 0 = north. NaN = no measured elevation. Metres above the Mars areoid. */
  readonly elevationM: Float32Array
  /** Row-major, row 0 = north. NaN = slope unknown. Degrees. */
  readonly slopeDeg: Float32Array
  /** bit0 ELEVATION_VALID, bit1 SLOPE_VALID. */
  readonly flags: Uint8Array
  /** Physical east-west cell width per row (metres). */
  readonly rowCellWidthsM: Float64Array
  readonly cellHeightM: number
  readonly minCellWidthM: number
  readonly geographicBounds: GeographicBounds
  readonly projectedBounds: ProjectedBounds
  readonly statistics: { readonly cellCount: number; readonly elevationValidCount: number; readonly slopeValidCount: number }
  readonly verification: TerrainVerification
  readonly provenance: readonly ProvenanceRecord[]
  readonly manifest: TerrainManifest
}

export type TerrainDatasetResult =
  | { status: 'ok'; dataset: TerrainDataset }
  | EngineError<'DATASET_INVALID' | 'DATASET_INTEGRITY' | 'UNSUPPORTED_CRS'>

export interface TerrainCheck {
  readonly id: string
  readonly passed: boolean
  readonly detail: string
}

const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1

/** Cross-realm safe ArrayBuffer check (workers, iframes and test VMs have their own constructors). */
function isArrayBuffer(v: unknown): v is ArrayBuffer {
  return v instanceof ArrayBuffer || Object.prototype.toString.call(v) === '[object ArrayBuffer]'
}

function viewFloat32(buffer: ArrayBuffer, offset: number, n: number): Float32Array {
  if (littleEndian) return new Float32Array(buffer, offset, n)
  const out = new Float32Array(n)
  const dv = new DataView(buffer, offset, n * 4)
  for (let i = 0; i < n; i++) out[i] = dv.getFloat32(i * 4, true)
  return out
}

/** Build a dataset from a manifest object and the matching terrain.bin bytes. */
export function createTerrainDataset(
  manifestRaw: unknown,
  buffer: ArrayBuffer,
  options: { checksum?: ChecksumStatus } = {},
): TerrainDatasetResult {
  const problems = listManifestProblems(manifestRaw)
  if (problems.length > 0) {
    const crsProblem = problems.some((p) => p.startsWith('crs'))
    return engineError(crsProblem ? 'UNSUPPORTED_CRS' : 'DATASET_INVALID', 'The terrain manifest failed validation.', { problems })
  }
  const manifest = manifestRaw as TerrainManifest
  if (!isArrayBuffer(buffer) || buffer.byteLength !== manifest.binary.byte_length) {
    return engineError('DATASET_INTEGRITY', 'terrain.bin length does not match the manifest.', {
      expected: manifest.binary.byte_length,
      actual: isArrayBuffer(buffer) ? buffer.byteLength : null,
    })
  }
  const g = manifest.grid
  const n = g.width * g.height
  const sec = (name: string) => manifest.binary.sections.find((s) => s.name === name)!
  const elevationM = viewFloat32(buffer, sec('elevation_m').byte_offset, n)
  const slopeDeg = viewFloat32(buffer, sec('slope_deg').byte_offset, n)
  const flags = new Uint8Array(buffer, sec('flags').byte_offset, n)

  const geometry: GridGeometry = {
    width: g.width,
    height: g.height,
    originXM: g.origin_x_m,
    originYM: g.origin_y_m,
    cellSizeXM: g.cell_size_x_m,
    cellSizeYM: g.cell_size_y_m,
    sphereRadiusM: manifest.crs.sphere_radius_m,
    latitudeOfTrueScaleDeg: manifest.crs.latitude_of_true_scale_deg,
    centralMeridianDeg: manifest.crs.central_meridian_deg,
  }
  const rowCellWidthsM = computeRowCellWidthsM(geometry)
  let minCellWidthM = Infinity
  for (let r = 0; r < rowCellWidthsM.length; r++) minCellWidthM = Math.min(minCellWidthM, rowCellWidthsM[r]!)

  const partial = {
    elevationM,
    slopeDeg,
    flags,
    geometry,
    statistics: {
      cellCount: n,
      elevationValidCount: manifest.statistics.elevation_valid_count,
      slopeValidCount: manifest.statistics.slope_valid_count,
    },
  }
  const checks = runIntegrityChecks(partial)
  const failed = checks.filter((c) => !c.passed)
  if (failed.length > 0) {
    return engineError('DATASET_INTEGRITY', 'terrain.bin contents are inconsistent with the manifest.', { failed })
  }
  const notes: string[] = []
  if (manifest.validation.status !== 'passed') notes.push(`Pipeline validation status is "${manifest.validation.status}".`)
  if (options.checksum !== 'verified') notes.push('terrain.bin SHA-256 was not verified at load time.')
  const crossValidation = parseCrossValidation((manifestRaw as { cross_validation?: unknown }).cross_validation)
  for (const c of crossValidation?.checks ?? []) {
    if (c.status !== 'PASS') notes.push(`Cross-check ${c.id} ${c.status}: ${c.summary}`)
  }

  const dataset: TerrainDataset = {
    id: manifest.aoi_id,
    version: manifest.binary.sha256,
    schemaVersion: manifest.schema_version,
    title: manifest.title,
    geometry,
    elevationM,
    slopeDeg,
    flags,
    rowCellWidthsM,
    cellHeightM: g.cell_size_y_m,
    minCellWidthM,
    geographicBounds: gridGeographicBounds(geometry),
    projectedBounds: gridProjectedBounds(geometry),
    statistics: partial.statistics,
    verification: {
      pipelineValidation: manifest.validation.status,
      checksum: options.checksum ?? 'not-checked',
      verifiedForFeasibility: manifest.validation.status === 'passed',
      crossValidation,
      notes,
    },
    provenance: terrainProvenance(manifest),
    manifest,
  }
  return { status: 'ok', dataset }
}

function runIntegrityChecks(d: {
  elevationM: Float32Array
  slopeDeg: Float32Array
  flags: Uint8Array
  geometry: GridGeometry
  statistics: { cellCount: number; elevationValidCount: number; slopeValidCount: number }
}): TerrainCheck[] {
  const { elevationM, slopeDeg, flags } = d
  const n = d.statistics.cellCount
  let elevValid = 0
  let slopeValid = 0
  let flagMismatch = 0
  let unknownBits = 0
  let badSlope = 0
  let badElev = 0
  for (let i = 0; i < n; i++) {
    const f = flags[i]!
    const e = elevationM[i]!
    const s = slopeDeg[i]!
    if ((f & ~FLAGS_KNOWN) !== 0) unknownBits++
    const eOk = Number.isFinite(e)
    const sOk = Number.isFinite(s)
    if (eOk) elevValid++
    if (sOk) slopeValid++
    if (eOk !== ((f & FLAG_ELEVATION_VALID) !== 0) || sOk !== ((f & FLAG_SLOPE_VALID) !== 0) || (sOk && !eOk)) flagMismatch++
    if (sOk && (s < 0 || s >= 90)) badSlope++
    if (eOk && (e < -9000 || e > 22000)) badElev++
  }
  return [
    { id: 'flag-consistency', passed: flagMismatch === 0, detail: `${flagMismatch} cells where flags disagree with NaN encoding` },
    { id: 'unknown-flag-bits', passed: unknownBits === 0, detail: `${unknownBits} cells with undefined flag bits` },
    { id: 'slope-range', passed: badSlope === 0, detail: `${badSlope} slopes outside [0, 90) deg` },
    { id: 'elevation-range', passed: badElev === 0, detail: `${badElev} elevations outside the Mars range` },
    {
      id: 'statistics',
      passed: elevValid === d.statistics.elevationValidCount && slopeValid === d.statistics.slopeValidCount,
      detail: `counted ${elevValid} elevation / ${slopeValid} slope cells; manifest ${d.statistics.elevationValidCount} / ${d.statistics.slopeValidCount}`,
    },
  ]
}

/** Re-run the runtime integrity checks on a loaded dataset. */
export function validateTerrainDataset(dataset: TerrainDataset): { status: 'ok' | 'failed'; checks: TerrainCheck[] } {
  const checks = runIntegrityChecks(dataset)
  checks.push({
    id: 'pipeline-validation',
    passed: dataset.verification.pipelineValidation === 'passed',
    detail: `pipeline validation ${dataset.verification.pipelineValidation}`,
  })
  return { status: checks.every((c) => c.passed) ? 'ok' : 'failed', checks }
}

function terrainProvenance(m: TerrainManifest): ProvenanceRecord[] {
  const elev = m.source.products.find((p) => p.role === 'elevation')!
  const sources = [{ label: elev.title, url: elev.landing_page ?? elev.url }]
  if (elev.doi) sources.push({ label: `DOI ${elev.doi}`, url: `https://doi.org/${elev.doi}` })
  const cellX = m.grid.cell_size_x_m
  const cellY = m.grid.cell_size_y_m
  const targets = m.source.products.find((p) => p.role === 'science-target-locations')
  const extra: ProvenanceRecord[] = targets
    ? [
        {
          id: 'science-target-locations',
          title: 'Science target locations (Perseverance rover positions)',
          category: 'observed',
          mission: targets.mission,
          instrument: null,
          provider: targets.provider,
          measures: 'Localized rover positions at documented Perseverance science activities.',
          method: 'Positions taken unchanged from the NASA/JPL MMGIS waypoint layer by site/drive identifier.',
          coverage: 'Two points inside the terrain grid',
          resolution: null,
          sources: [{ label: targets.title, url: targets.url }],
          limitations: ['A rover position marks where the rover stood, not the exact rock, sample tube or borehole.'],
          attribution: 'NASA/JPL-Caltech',
        },
      ]
    : []
  return [
    ...extra,
    {
      id: 'terrain-elevation',
      title: `Elevation (${elev.instrument ?? 'DTM'} DTM, ${cellY} m grid)`,
      category: 'observed',
      mission: elev.mission,
      instrument: elev.instrument ?? null,
      provider: elev.provider,
      measures: `Surface height in metres; ${m.elevation.vertical_reference}.`,
      method: `${m.grid.aggregation?.method ?? 'block-mean'} of ${m.source.source_resolution_m} m posts (factor ${m.grid.aggregation?.factor ?? 1}); missing posts are never filled.`,
      coverage: `${m.title}; lon ${m.grid.bounds_geographic_deg.west.toFixed(5)}..${m.grid.bounds_geographic_deg.east.toFixed(5)} E, lat ${m.grid.bounds_geographic_deg.south.toFixed(5)}..${m.grid.bounds_geographic_deg.north.toFixed(5)} N`,
      resolution: `${cellX} m x ${cellY} m projected cells (source ${m.source.source_resolution_m} m)`,
      sources,
      limitations: [
        'Objects smaller than a few metres (rocks, steps) are not resolved.',
        'Known HiRISE DTM artefacts (boxes, CCD seams, faceted areas) may be present.',
        m.source.vertical_accuracy_note ?? 'See source product accuracy statement.',
      ],
      attribution: elev.citation ?? elev.title,
    },
    {
      id: 'terrain-slope',
      title: 'DEM-derived slope',
      category: 'derived',
      mission: elev.mission,
      instrument: elev.instrument ?? null,
      provider: 'Ausnox scientific pipeline',
      measures: 'Local terrain slope in degrees.',
      method: m.slope.method,
      coverage: 'Same grid as elevation; unknown at the grid edge and next to missing elevation.',
      resolution: `${cellY} m cells, ~${2 * cellY} m gradient baseline`,
      sources,
      limitations: ['Slope describes metre-scale terrain only; it does not imply stable footing or absence of rocks.'],
      attribution: `Derived from ${elev.title}`,
    },
  ]
}
