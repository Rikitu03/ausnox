/**
 * TEST-ONLY synthetic terrain grids. These are mathematical fixtures for unit tests and are
 * never Mars observations. They use the real Mars CRS conventions so the same code paths run.
 */
import { createTerrainDataset, type TerrainDataset } from '../../src/index.js'

export interface SyntheticOptions {
  width: number
  height: number
  /** z(row, col) in metres; return NaN for missing elevation. */
  elevation: (row: number, col: number) => number
  /** Optional slope override (deg); NaN = unknown. Default: derived exactly from elevation is not needed for tests. */
  slope?: (row: number, col: number) => number
  cellSizeM?: number
  /** Latitude of the north edge; 0 makes cells square on the ground. */
  northLatDeg?: number
  validation?: 'passed' | 'failed' | 'not-run'
}

const R = 3_396_190

export function makeSyntheticManifestAndBuffer(o: SyntheticOptions): { manifest: Record<string, unknown>; buffer: ArrayBuffer } {
  const { width: W, height: H } = o
  const cell = o.cellSizeM ?? 2
  const n = W * H
  const off = (x: number) => (x + 3) & ~3
  const eOff = 0
  const sOff = off(eOff + n * 4)
  const fOff = off(sOff + n * 4)
  const buffer = new ArrayBuffer(fOff + n)
  const elev = new Float32Array(buffer, eOff, n)
  const slope = new Float32Array(buffer, sOff, n)
  const flags = new Uint8Array(buffer, fOff, n)
  let ev = 0
  let sv = 0
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const i = r * W + c
      const z = o.elevation(r, c)
      elev[i] = z
      const s = o.slope ? o.slope(r, c) : Number.isFinite(z) ? 0 : Number.NaN
      slope[i] = Number.isFinite(z) ? s : Number.NaN
      let f = 0
      if (Number.isFinite(elev[i]!)) {
        f |= 1
        ev++
      }
      if (Number.isFinite(slope[i]!)) {
        f |= 2
        sv++
      }
      flags[i] = f
    }
  }
  const originY = R * ((o.northLatDeg ?? 0.01) * Math.PI) / 180
  const originX = 0
  const manifest = {
    schema_version: '1.0.0',
    asset_type: 'ausnox-terrain-grid',
    aoi_id: 'synthetic-unit-test',
    title: 'Synthetic unit-test grid (NOT Mars data)',
    source: {
      products: [{ key: 'synthetic', role: 'elevation', title: 'synthetic fixture', filename: 'none', url: 'https://example.invalid/synthetic', provider: 'test', mission: 'none', bytes: 0, sha256: '0'.repeat(64), retrieved_utc: '2026-01-01T00:00:00Z' }],
      window: { col_off: 0, row_off: 0, width: W, height: H },
      source_resolution_m: cell,
    },
    crs: {
      body: 'Mars', kind: 'mars-equirectangular-sphere', projection: 'Equirectangular', datum: 'Mars 2000 sphere',
      sphere_radius_m: R, latitude_of_true_scale_deg: 0, central_meridian_deg: 0, false_easting_m: 0, false_northing_m: 0,
      latitude_type: 'planetocentric', longitude_direction: 'east-positive', longitude_domain: '-180..180', source_wkt: 'synthetic', proj4: '+proj=eqc +R=3396190',
    },
    grid: {
      width: W, height: H, origin_x_m: originX, origin_y_m: originY, cell_size_x_m: cell, cell_size_y_m: cell,
      row_order: 'north-to-south', col_order: 'west-to-east',
      bounds_projected_m: { min_x: originX, min_y: originY - H * cell, max_x: originX + W * cell, max_y: originY },
      bounds_geographic_deg: { west: 0, east: 0, south: 0, north: 0 },
    },
    elevation: { units: 'm', vertical_reference: 'synthetic', min: 0, max: 0, mean: 0 },
    slope: { units: 'deg', method: 'synthetic', min: 0, max: 0, mean: 0 },
    flags: { ELEVATION_VALID: 1, SLOPE_VALID: 2 },
    binary: {
      file: 'terrain.bin', byte_length: buffer.byteLength, sha256: 'a'.repeat(64), endianness: 'little',
      sections: [
        { name: 'elevation_m', dtype: 'float32', byte_offset: eOff, byte_length: n * 4 },
        { name: 'slope_deg', dtype: 'float32', byte_offset: sOff, byte_length: n * 4 },
        { name: 'flags', dtype: 'uint8', byte_offset: fOff, byte_length: n },
      ],
    },
    statistics: { cell_count: n, elevation_valid_count: ev, slope_valid_count: sv },
    processing: {},
    validation: { status: o.validation ?? 'passed', report: null, validated_utc: null },
  }
  return { manifest, buffer }
}

export function makeSyntheticDataset(o: SyntheticOptions): TerrainDataset {
  const { manifest, buffer } = makeSyntheticManifestAndBuffer(o)
  const r = createTerrainDataset(manifest, buffer, { checksum: 'not-checked' })
  if (r.status !== 'ok') throw new Error(`synthetic dataset invalid: ${JSON.stringify(r)}`)
  return r.dataset
}

/** Geographic centre of a cell in a synthetic dataset. */
export function cellGeo(d: TerrainDataset, row: number, col: number): { lonEast: number; latNorth: number } {
  const g = d.geometry
  const x = g.originXM + (col + 0.5) * g.cellSizeXM
  const y = g.originYM - (row + 0.5) * g.cellSizeYM
  return { lonEast: (x / g.sphereRadiusM) * (180 / Math.PI), latNorth: (y / g.sphereRadiusM) * (180 / Math.PI) }
}
