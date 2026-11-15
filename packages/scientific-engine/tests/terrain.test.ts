import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  classifyCell,
  classifyTraversability,
  createTerrainDataset,
  deriveHornSlopeDeg,
  findNearestTraversableCell,
  geographicToGrid,
  gridToGeographic,
  listManifestProblems,
  loadTerrainDataset,
  parseScienceTargets,
  resolveSibling,
  sampleTerrainAt,
  sampleTerrainCell,
  validateTerrainDataset,
} from '../src/index.js'
import { writeEvidence } from './helpers/evidence.js'
import { diskFetch, loadRealDataset, readBinary, readJson, readManifest } from './helpers/realAsset.js'
import { makeSyntheticManifestAndBuffer } from './helpers/syntheticGrid.js'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/proj_vectors.json', import.meta.url), 'utf8')) as {
  terrain_sha256: string
  samples: { row: number; col: number; elevation_m: number; slope_deg: number | null; flags: number }[]
}

describe('loading the real Jezero asset', () => {
  it('loads through the network loader with SHA-256 verification', async () => {
    const r = await loadTerrainDataset({ manifestUrl: 'https://example.invalid/data/jezero/manifest.json?v=1', fetch: diskFetch() })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    const d = r.dataset
    expect(d.id).toBe('jezero-delta-front-p0')
    expect([d.geometry.width, d.geometry.height]).toEqual([800, 800])
    expect(d.version).toBe(fixture.terrain_sha256)
    expect(d.verification.checksum).toBe('verified')
    expect(d.verification.pipelineValidation).toBe('passed')
    expect(d.verification.verifiedForFeasibility).toBe(true)
    expect(validateTerrainDataset(d).status).toBe('ok')
    expect(d.provenance.map((p) => p.id)).toEqual(['science-target-locations', 'terrain-elevation', 'terrain-slope'])
    expect(d.provenance.find((p) => p.id === 'terrain-elevation')!.category).toBe('observed')
    expect(d.provenance.find((p) => p.id === 'terrain-slope')!.category).toBe('derived')
  })

  it('reads exactly the values Python wrote (cross-implementation, 25 random cells)', async () => {
    const d = await loadRealDataset()
    for (const s of fixture.samples) {
      const i = s.row * 800 + s.col
      expect(d.elevationM[i]).toBe(s.elevation_m)
      expect(d.flags[i]).toBe(s.flags)
      if (s.slope_deg === null) expect(Number.isNaN(d.slopeDeg[i]!)).toBe(true)
      else expect(d.slopeDeg[i]).toBe(s.slope_deg)
    }
  })

  it('independent TypeScript Horn slope reproduces the shipped slope', async () => {
    const d = await loadRealDataset()
    const s = deriveHornSlopeDeg(d.elevationM, 800, 800, d.rowCellWidthsM, d.cellHeightM)
    let maxDiff = 0
    let nanMismatch = 0
    for (let i = 0; i < s.length; i++) {
      const a = s[i]!
      const b = d.slopeDeg[i]!
      if (Number.isNaN(a) !== Number.isNaN(b)) nanMismatch++
      else if (!Number.isNaN(a)) maxDiff = Math.max(maxDiff, Math.abs(a - b))
    }
    expect(nanMismatch).toBe(0)
    // float32 elevation rounding only; the pipeline used float64 block means
    expect(maxDiff).toBeLessThan(0.01)
    writeEvidence('terrain_crosscheck.json', {
      check: 'TypeScript Horn slope from shipped float32 elevation vs shipped slope (Python, float64 block means)',
      cells: s.length,
      unknown_pattern_mismatches: nanMismatch,
      max_abs_diff_deg: maxDiff,
      tolerance_deg: 0.01,
      python_samples_matched_exactly: fixture.samples.length,
      status: nanMismatch === 0 && maxDiff < 0.01 ? 'PASS' : 'FAIL',
    })
  })

  it('no false flattening: elevations vary and the grid edge has unknown slope', async () => {
    const d = await loadRealDataset()
    const m = d.manifest
    expect(m.elevation.max - m.elevation.min).toBeGreaterThan(100)
    expect(d.statistics.elevationValidCount).toBe(640_000)
    expect(d.statistics.slopeValidCount).toBe(640_000 - 4 * 799)
    for (const c of [{ row: 0, col: 5 }, { row: 799, col: 5 }, { row: 5, col: 0 }, { row: 5, col: 799 }]) {
      expect(sampleTerrainCell(d, c)!.validity).toBe('slope-unknown')
      expect(classifyCell(d, c, 45)).toBe('slope-unknown')
    }
  })

  it('samples, classifies and offers an explicit snap candidate at Skinner Ridge', async () => {
    const d = await loadRealDataset()
    const skinner = { lonEast: 77.40616768, latNorth: 18.45889532 }
    const s = sampleTerrainAt(d, skinner)
    expect(s.status).toBe('ok')
    if (s.status !== 'ok') return
    expect(s.sample.cell).toEqual({ row: 314, col: 390 })
    expect(s.sample.slopeDeg!).toBeGreaterThan(20)
    expect(s.sample.elevationCategory).toBe('observed')
    expect(classifyTraversability(d, skinner, 15)).toBe('too-steep')
    expect(classifyTraversability(d, skinner, 25)).toBe('traversable')
    expect(classifyTraversability(d, { lonEast: 77.5, latNorth: 18.5 }, 15)).toBe('outside-coverage')
    expect(classifyTraversability(d, { lonEast: 77.4, latNorth: 95 }, 15)).toBe('invalid-coordinate')
    const snap = findNearestTraversableCell(d, s.sample.cell, { maxSlopeDeg: 15, maxDistanceM: 10 })
    expect(snap).not.toBeNull()
    expect(snap!.cell).toEqual({ row: 316, col: 390 })
    expect(snap!.distanceM).toBeCloseTo(4, 9)
    expect(classifyCell(d, snap!.cell, 15)).toBe('traversable')
    expect(findNearestTraversableCell(d, s.sample.cell, { maxSlopeDeg: 15, maxDistanceM: 1 })).toBeNull()
  })

  it('parses the cited science targets onto valid cells', async () => {
    const d = await loadRealDataset()
    const raw = readJson('science-targets.geojson') as { features: { properties: { grid_cell: { row: number; col: number } } }[] }
    const r = parseScienceTargets(raw, d)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.targets.map((t) => t.id)).toEqual(['three-forks-depot-area', 'skinner-ridge-sampling-site'])
    r.targets.forEach((t, i) => {
      expect(t.cell).toEqual(raw.features[i]!.properties.grid_cell)
      expect(t.sources.length).toBeGreaterThanOrEqual(3)
      expect(t.labelQuality).toBe('cited-approximate')
      expect(Math.abs(t.elevationDtmM! - t.roverReportedElevationM!)).toBeLessThan(0.5)
    })
    const moved = structuredClone(raw) as unknown as { features: { geometry: { coordinates: number[] } }[] }
    moved.features[0]!.geometry.coordinates = [77.5, 18.5]
    const bad = parseScienceTargets(moved, d)
    expect(bad.status === 'error' && bad.code).toBe('DATASET_INVALID')
  })

  it('grid <-> geographic is consistent on the real grid corners', async () => {
    const d = await loadRealDataset()
    const nw = gridToGeographic({ row: 0, col: 0 }, d.geometry)!
    const se = gridToGeographic({ row: 799, col: 799 }, d.geometry)!
    expect(nw.lonEast).toBeGreaterThan(d.geographicBounds.west)
    expect(nw.latNorth).toBeLessThan(d.geographicBounds.north)
    expect(se.lonEast).toBeLessThan(d.geographicBounds.east)
    expect(se.latNorth).toBeGreaterThan(d.geographicBounds.south)
    const loc = geographicToGrid(se, d.geometry)
    expect(loc.status === 'ok' && loc.cell).toEqual({ row: 799, col: 799 })
  })
})

describe('fail-closed loading (manifest and binary corruption)', () => {
  // Deliberately untyped: these tests corrupt arbitrary nested manifest fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const manifest = () => structuredClone(readManifest()) as Record<string, any>

  it('detects a corrupted terrain.bin by checksum', async () => {
    const r = await loadTerrainDataset({
      manifestUrl: '/data/jezero/manifest.json',
      fetch: diskFetch({
        'terrain.bin': async () => {
          const b = new Uint8Array(readBinary())
          b[1234] = b[1234]! ^ 0xff
          return { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => b.buffer }
        },
      }),
    })
    expect(r.status === 'error' && r.code).toBe('DATASET_INTEGRITY')
  })

  it('rejects truncated binaries, placeholders, Earth CRS, unknown schema and unsafe file names', () => {
    const buf = readBinary()
    const trunc = createTerrainDataset(manifest(), buf.slice(0, buf.byteLength - 4))
    expect(trunc.status === 'error' && trunc.code).toBe('DATASET_INTEGRITY')

    const ph = manifest()
    ph.source.products[0].sha256 = 'SET_AFTER_DOWNLOAD'
    const r1 = createTerrainDataset(ph, buf)
    expect(r1.status === 'error' && r1.code).toBe('DATASET_INVALID')
    expect(listManifestProblems(ph).some((p) => p.includes('placeholder'))).toBe(true)

    const earth = manifest()
    earth.crs.sphere_radius_m = 6_371_000
    const r2 = createTerrainDataset(earth, buf)
    expect(r2.status === 'error' && r2.code).toBe('UNSUPPORTED_CRS')

    const west = manifest()
    west.crs.longitude_direction = 'west-positive'
    expect(createTerrainDataset(west, buf).status === 'error').toBe(true)

    const v2 = manifest()
    v2.schema_version = '2.0.0'
    const r3 = createTerrainDataset(v2, buf)
    expect(r3.status === 'error' && r3.code).toBe('DATASET_INVALID')

    const bounds = manifest()
    bounds.grid.bounds_projected_m.max_x += 10
    expect(listManifestProblems(bounds).some((p) => p.includes('bounds_projected_m'))).toBe(true)

    expect(listManifestProblems(null)).toEqual(['manifest is not a JSON object'])
  })

  it('rejects unsafe binary file names before fetching them', async () => {
    let fetched = ''
    const r = await loadTerrainDataset({
      manifestUrl: '/data/jezero/manifest.json',
      fetch: async (url) => {
        fetched = url
        const m = manifest()
        m.binary.file = '../../secrets.bin'
        return { ok: true, status: 200, json: async () => m, arrayBuffer: async () => new ArrayBuffer(0) }
      },
    })
    expect(r.status === 'error' && r.code).toBe('DATASET_INVALID')
    expect(fetched).toBe('/data/jezero/manifest.json')
  })

  it('reports missing files, network failures and cancellation explicitly', async () => {
    const missing = await loadTerrainDataset({ manifestUrl: '/nowhere/manifest-missing.json', fetch: diskFetch() })
    expect(missing.status === 'error' && missing.code).toBe('DATASET_UNAVAILABLE')
    const offline = await loadTerrainDataset({ manifestUrl: '/x/manifest.json', fetch: async () => { throw new Error('ECONNRESET') } })
    expect(offline.status === 'error' && offline.code).toBe('DATASET_UNAVAILABLE')
    const badJson = await loadTerrainDataset({
      manifestUrl: '/x/manifest.json',
      fetch: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token') }, arrayBuffer: async () => new ArrayBuffer(0) }),
    })
    expect(badJson.status === 'error' && badJson.code).toBe('DATASET_UNAVAILABLE')
    const cancelled = await loadTerrainDataset({ manifestUrl: '/data/jezero/manifest.json', fetch: diskFetch(), signal: { aborted: true } })
    expect(cancelled.status === 'error' && cancelled.code).toBe('CANCELLED')
    expect(resolveSibling('https://h/a/b/manifest.json?v=2', 'terrain.bin')).toBe('https://h/a/b/terrain.bin')
  })

  it('rejects binaries whose flags disagree with the NaN encoding', () => {
    const { manifest: m, buffer } = makeSyntheticManifestAndBuffer({ width: 4, height: 4, elevation: () => 0, slope: () => 0 })
    const sections = (m.binary as { sections: { name: string; byte_offset: number }[] }).sections
    const flags = new Uint8Array(buffer, sections.find((s) => s.name === 'flags')!.byte_offset, 16)
    flags[5] = 1 // claims slope unknown although slope is 0
    const r = createTerrainDataset(m, buffer)
    expect(r.status === 'error' && r.code).toBe('DATASET_INTEGRITY')
  })

  it('a dataset whose pipeline validation did not pass is never verified for feasibility', () => {
    const { manifest: m, buffer } = makeSyntheticManifestAndBuffer({ width: 4, height: 4, elevation: () => 0, slope: () => 0, validation: 'failed' })
    const r = createTerrainDataset(m, buffer)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.dataset.verification.verifiedForFeasibility).toBe(false)
    expect(validateTerrainDataset(r.dataset).status).toBe('failed')
  })
})
