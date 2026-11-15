/**
 * Terrain manifest schema 1.0.0 (written by scientific-pipeline/scripts/build_terrain.py).
 * Keys are snake_case because this is the on-disk JSON format; the parsed
 * `TerrainDataset` exposes camelCase fields.
 */
import { SUPPORTED_TERRAIN_SCHEMA_VERSIONS } from '../version.js'
import { MARS_2000_SPHERE_RADIUS_M } from '../coordinates/mars.js'

export interface TerrainManifestSourceProduct {
  readonly key: string
  readonly role: string
  readonly title: string
  readonly filename: string
  readonly url: string
  readonly landing_page?: string
  readonly doi?: string | null
  readonly citation?: string
  readonly provider: string
  readonly mission: string
  readonly instrument?: string
  readonly bytes: number
  readonly sha256: string
  readonly retrieved_utc: string
  readonly observation_epoch?: string
  readonly redistribution?: string
  readonly mars_trek_layer?: string
}

export interface TerrainManifestSection {
  readonly name: 'elevation_m' | 'slope_deg' | 'flags'
  readonly dtype: 'float32' | 'uint8'
  readonly byte_offset: number
  readonly byte_length: number
}

export type PipelineValidationStatus = 'passed' | 'failed' | 'not-run'

export interface TerrainManifest {
  readonly schema_version: string
  readonly asset_type: 'ausnox-terrain-grid'
  readonly aoi_id: string
  readonly title: string
  readonly category?: string
  readonly source: {
    readonly products: readonly TerrainManifestSourceProduct[]
    readonly window: { readonly col_off: number; readonly row_off: number; readonly width: number; readonly height: number }
    readonly source_resolution_m: number
    readonly source_missing_posts_in_window?: number
    readonly vertical_accuracy_note?: string
  }
  readonly crs: {
    readonly body: 'Mars'
    readonly kind: 'mars-equirectangular-sphere'
    readonly projection: string
    readonly datum: string
    readonly sphere_radius_m: number
    readonly latitude_of_true_scale_deg: number
    readonly central_meridian_deg: number
    readonly false_easting_m: number
    readonly false_northing_m: number
    readonly latitude_type: 'planetocentric'
    readonly longitude_direction: 'east-positive'
    readonly longitude_domain: string
    readonly source_wkt: string
    readonly proj4: string
  }
  readonly grid: {
    readonly width: number
    readonly height: number
    readonly origin_x_m: number
    readonly origin_y_m: number
    readonly cell_size_x_m: number
    readonly cell_size_y_m: number
    readonly row_order: 'north-to-south'
    readonly col_order: 'west-to-east'
    readonly bounds_projected_m: { readonly min_x: number; readonly min_y: number; readonly max_x: number; readonly max_y: number }
    readonly bounds_geographic_deg: { readonly west: number; readonly east: number; readonly south: number; readonly north: number }
    readonly ground_cell_size_m?: Readonly<Record<string, number>>
    readonly aggregation?: { readonly method: string; readonly factor: number; readonly nodata_rule: string }
  }
  readonly elevation: { readonly units: 'm'; readonly vertical_reference: string; readonly min: number; readonly max: number; readonly mean: number }
  readonly slope: { readonly units: 'deg'; readonly method: string; readonly min: number; readonly max: number; readonly mean: number }
  readonly flags: { readonly ELEVATION_VALID: 1; readonly SLOPE_VALID: 2 }
  readonly binary: {
    readonly file: string
    readonly byte_length: number
    readonly sha256: string
    readonly endianness: 'little'
    readonly sections: readonly TerrainManifestSection[]
  }
  readonly statistics: {
    readonly cell_count: number
    readonly elevation_valid_count: number
    readonly slope_valid_count: number
  }
  readonly files?: { readonly coverage?: string; readonly science_targets?: string }
  readonly processing: Readonly<Record<string, unknown>>
  readonly validation: {
    readonly status: PipelineValidationStatus
    readonly report: string | null
    readonly validated_utc: string | null
    readonly checks_passed?: number
    readonly checks_total?: number
  }
  readonly disclaimer?: string
}

const SECTION_SPECS = [
  { name: 'elevation_m', dtype: 'float32', bytesPerCell: 4 },
  { name: 'slope_deg', dtype: 'float32', bytesPerCell: 4 },
  { name: 'flags', dtype: 'uint8', bytesPerCell: 1 },
] as const

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0

function findPlaceholders(v: unknown, path: string, out: string[]): void {
  if (typeof v === 'string') {
    if (v.startsWith('SET_')) out.push(path)
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => findPlaceholders(x, `${path}[${i}]`, out))
  } else if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) findPlaceholders(x, path ? `${path}.${k}` : k, out)
  }
}

/**
 * Structural and scientific-convention checks for a raw manifest.
 * Returns a list of human-readable problems; an empty list means the manifest is usable.
 */
export function listManifestProblems(raw: unknown): string[] {
  const p: string[] = []
  if (!isObj(raw)) return ['manifest is not a JSON object']
  const placeholders: string[] = []
  findPlaceholders(raw, '', placeholders)
  for (const ph of placeholders) p.push(`placeholder value at ${ph}`)

  if (!SUPPORTED_TERRAIN_SCHEMA_VERSIONS.includes(raw.schema_version as string)) {
    p.push(`unsupported schema_version ${String(raw.schema_version)} (supported: ${SUPPORTED_TERRAIN_SCHEMA_VERSIONS.join(', ')})`)
  }
  if (raw.asset_type !== 'ausnox-terrain-grid') p.push('asset_type must be "ausnox-terrain-grid"')
  if (!isStr(raw.aoi_id)) p.push('aoi_id missing')

  const crs = raw.crs
  if (!isObj(crs)) {
    p.push('crs missing')
  } else {
    if (crs.kind !== 'mars-equirectangular-sphere') p.push('crs.kind must be "mars-equirectangular-sphere"')
    if (crs.body !== 'Mars') p.push('crs.body must be "Mars"')
    if (!isNum(crs.sphere_radius_m) || Math.abs(crs.sphere_radius_m - MARS_2000_SPHERE_RADIUS_M) > 0.5) {
      p.push('crs.sphere_radius_m must be the Mars 2000 sphere radius 3396190 m')
    }
    if (crs.latitude_of_true_scale_deg !== 0 || crs.central_meridian_deg !== 0) {
      p.push('only latitude_of_true_scale_deg = 0 and central_meridian_deg = 0 are validated')
    }
    if (crs.false_easting_m !== 0 || crs.false_northing_m !== 0) p.push('false easting/northing must be 0')
    if (crs.latitude_type !== 'planetocentric') p.push('crs.latitude_type must be planetocentric')
    if (crs.longitude_direction !== 'east-positive') p.push('crs.longitude_direction must be east-positive')
  }

  const g = raw.grid
  if (!isObj(g)) {
    p.push('grid missing')
  } else {
    for (const k of ['width', 'height', 'origin_x_m', 'origin_y_m', 'cell_size_x_m', 'cell_size_y_m'] as const) {
      if (!isNum(g[k])) p.push(`grid.${k} must be a finite number`)
    }
    if (!Number.isInteger(g.width) || !Number.isInteger(g.height) || (g.width as number) <= 0 || (g.height as number) <= 0) {
      p.push('grid width/height must be positive integers')
    }
    if (!((g.cell_size_x_m as number) > 0) || !((g.cell_size_y_m as number) > 0)) p.push('grid cell sizes must be positive')
    if (g.row_order !== 'north-to-south' || g.col_order !== 'west-to-east') p.push('grid must be north-to-south rows, west-to-east columns')
    const bp = g.bounds_projected_m
    if (isObj(bp) && isNum(g.origin_x_m) && isNum(g.cell_size_x_m) && isNum(g.width) && isNum(g.height) && isNum(g.cell_size_y_m) && isNum(g.origin_y_m)) {
      const tol = 1e-6
      if (
        Math.abs((bp.min_x as number) - g.origin_x_m) > tol ||
        Math.abs((bp.max_y as number) - g.origin_y_m) > tol ||
        Math.abs((bp.max_x as number) - (g.origin_x_m + g.width * g.cell_size_x_m)) > tol ||
        Math.abs((bp.min_y as number) - (g.origin_y_m - g.height * g.cell_size_y_m)) > tol
      ) {
        p.push('grid.bounds_projected_m inconsistent with origin, cell size and dimensions')
      }
    } else {
      p.push('grid.bounds_projected_m missing')
    }
    if (!isObj(g.bounds_geographic_deg)) p.push('grid.bounds_geographic_deg missing')
  }

  if (!isObj(raw.elevation) || raw.elevation.units !== 'm') p.push('elevation.units must be "m"')
  if (!isObj(raw.slope) || raw.slope.units !== 'deg') p.push('slope.units must be "deg"')
  if (!isObj(raw.flags) || raw.flags.ELEVATION_VALID !== 1 || raw.flags.SLOPE_VALID !== 2) {
    p.push('flags must define ELEVATION_VALID=1 and SLOPE_VALID=2')
  }

  const b = raw.binary
  if (!isObj(b)) {
    p.push('binary missing')
  } else {
    if (!isStr(b.file) || !/^[A-Za-z0-9._-]+$/.test(b.file as string) || (b.file as string).includes('..')) {
      p.push('binary.file must be a plain file name next to the manifest')
    }
    if (b.endianness !== 'little') p.push('binary.endianness must be "little"')
    if (!isStr(b.sha256) || !/^[0-9a-f]{64}$/.test(b.sha256 as string)) p.push('binary.sha256 must be 64 lowercase hex digits')
    if (!isNum(b.byte_length) || (b.byte_length as number) <= 0) p.push('binary.byte_length must be positive')
    const sections = Array.isArray(b.sections) ? (b.sections as unknown[]) : []
    const n = isObj(g) && isNum(g.width) && isNum(g.height) ? (g.width as number) * (g.height as number) : NaN
    for (const spec of SECTION_SPECS) {
      const s = sections.find((x) => isObj(x) && x.name === spec.name)
      if (!isObj(s)) {
        p.push(`binary section ${spec.name} missing`)
        continue
      }
      if (s.dtype !== spec.dtype) p.push(`binary section ${spec.name} dtype must be ${spec.dtype}`)
      if (s.byte_length !== n * spec.bytesPerCell) p.push(`binary section ${spec.name} has wrong byte_length`)
      if (!isNum(s.byte_offset) || (s.byte_offset as number) % 4 !== 0 || (s.byte_offset as number) < 0) {
        p.push(`binary section ${spec.name} byte_offset must be a non-negative multiple of 4`)
      } else if (isNum(b.byte_length) && (s.byte_offset as number) + (s.byte_length as number) > (b.byte_length as number)) {
        p.push(`binary section ${spec.name} extends past the end of the file`)
      }
    }
  }

  const st = raw.statistics
  if (!isObj(st) || !isNum(st.cell_count) || !isNum(st.elevation_valid_count) || !isNum(st.slope_valid_count)) {
    p.push('statistics.cell_count / elevation_valid_count / slope_valid_count required')
  }
  const src = raw.source
  if (!isObj(src) || !Array.isArray(src.products) || src.products.length === 0) {
    p.push('source.products must list at least the elevation product')
  } else {
    const elev = (src.products as unknown[]).find((x) => isObj(x) && x.role === 'elevation')
    if (!isObj(elev) || !isStr(elev.sha256) || !isStr(elev.url) || !isStr(elev.title)) {
      p.push('source.products must include the elevation product with title, url and sha256')
    }
  }
  const v = raw.validation
  if (!isObj(v) || !['passed', 'failed', 'not-run'].includes(v.status as string)) {
    p.push('validation.status must be passed, failed or not-run')
  }
  return p
}
