// @vitest-environment node
/**
 * Integration tests of the REAL adapters on the REAL bundled Jezero assets (public/data/jezero).
 * No synthetic terrain is used here. Expected values come from the scientific engine's recorded
 * evidence (packages/scientific-engine/evidence/integration_scenario.json) and the pipeline outputs
 * (manifest.json, science-targets.geojson), so a mapping error in the adapters shows up as a mismatch.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  createRouteWorkerHandler,
  createSimulation,
  evaluateMissionFeasibility,
  getSimulationSnapshot,
  gridToGeographic,
  positionAlongVertices,
  sha256Hex,
  stepSimulation,
  type RoundTripResult,
  type RouteWorkerRequest,
  type RouteWorkerResponse,
} from '@ausnox/scientific-engine'
import { beforeAll, describe, expect, it } from 'vitest'
import type { MissionConfig, RoundTripRoute, RouteResult, ScienceWaypoint, TerrainManifest, TerrainRaster } from '@/services/contracts'
import { snapshotAt } from '@/utils/simulation'
import { checkPlacement } from '@/utils/validation'
import { createRealServices, type RealServices } from '../index'
import { createContext } from '../context'
import { engineCellCenterToGrid, gridToEngineCell, projectedToGridCoord } from '../coords'
import { toEngineAssumptions } from '../mission'
import { createWorkerExecutor } from '../routeExecutor'
import { createRealRouting } from '../routing'
import { createRealTerrain } from '../terrain'

const PUBLIC = fileURLToPath(new URL('../../../../../public/', import.meta.url))
const EVIDENCE = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../../packages/scientific-engine/evidence/integration_scenario.json', import.meta.url)), 'utf8'),
) as {
  routes: Record<'shortest' | 'lower-slope', { outbound: { planimetric_m: number; surface_m: number; ascent_m: number; max_slope_deg: number; cells: number }; return: { planimetric_m: number; surface_m: number; cells: number } }>
  snap: { to: { row: number; col: number }; distance_m: number }
  daylight: { sunrise_ltst_h: number; sunset_ltst_h: number; mission_start_utc: string }
  plan: {
    shortest: { return_margin_min: number; total_work_min: number }
    lower_slope: { return_margin_min: number; total_work_min: number }
    variants: Record<string, { feasibility: string; return_margin_min: number | null }>
  }
}

/** fetch() stand-in serving public/ from disk, like the static host. */
const diskFetch = async (url: string): Promise<Response> => {
  const rel = url.replace(/^[./]*/, '').split(/[?#]/)[0]!
  try {
    const bytes = readFileSync(PUBLIC + rel)
    const type = rel.endsWith('.json') || rel.endsWith('.geojson') ? 'application/json' : 'application/octet-stream'
    return new Response(bytes, { status: 200, headers: { 'content-type': type } })
  } catch {
    return new Response('not found', { status: 404 })
  }
}
const offlineTiles: typeof diskFetch = async (url) => (url.startsWith('https://trek.nasa.gov') ? Promise.reject(new TypeError('network down')) : diskFetch(url))

let svc: RealServices
let manifest: TerrainManifest
let raster: TerrainRaster
let waypoints: ScienceWaypoint[]

const W = (id: string) => waypoints.find((w) => w.id === id)!

function sampleConfig(over: Partial<MissionConfig['assumptions']> = {}): MissionConfig {
  const sample = svc.sampleMission()!
  const snapped = svc.terrain.nearestValid(sample.destination.position, 400, 15)!
  return {
    id: sample.id,
    name: sample.name,
    habitat: { id: 'habitat', label: 'Habitat', position: sample.habitat },
    stops: sample.stops.map((s, i) => ({ ...s, id: `stop-${i + 1}` })),
    destination: { ...sample.destination, id: 'destination', position: snapped },
    routeMode: 'shortest',
    assumptions: {
      walkingSpeedMps: 0.6,
      maxSlopeDeg: 15,
      reserveMin: 30,
      startLtstHours: sample.startLtstHours!,
      maxEvaEnabled: false,
      maxEvaHours: 8,
      warningMarginMin: 15,
      solarScenarioId: sample.solarScenarioId!,
      ...over,
    },
  }
}

const routeFor = (config: MissionConfig, mode: 'shortest' | 'lower-slope', signal?: AbortSignal) =>
  svc.routing.computeRoundTrip(
    {
      requestId: `t-${mode}`,
      datasetId: manifest.datasetId,
      habitat: config.habitat!.position,
      waypoints: [...config.stops, config.destination!].map((s) => ({ id: s.id, label: s.label, position: s.position, durationMin: s.durationMin })),
      mode,
      maxSlopeDeg: config.assumptions.maxSlopeDeg,
    },
    signal,
  )

async function plan(config: MissionConfig, mode: 'shortest' | 'lower-slope' = 'shortest') {
  const route = await routeFor(config, mode)
  const solar = await svc.solar.getSolarDay(config.assumptions.solarScenarioId, svc.terrain.toGeo(config.habitat!.position))
  const result = svc.mission.assess({ config, route, solar })
  if (result.status !== 'ok') throw new Error('assess failed')
  return { route, solar, result, a: result.assessment }
}

beforeAll(async () => {
  svc = createRealServices({ baseUrl: '/', fetch: diskFetch, useWorker: false, probeImagery: false })
  const t = await svc.terrain.load()
  if (t.status !== 'ok') throw new Error(`terrain failed: ${t.detail}`)
  manifest = t.manifest
  raster = t.raster
  const w = await svc.mapData.listWaypoints()
  if (w.status !== 'ok') throw new Error(`waypoints failed: ${w.detail}`)
  waypoints = w.waypoints
})

describe('terrain asset (real)', () => {
  it('1-2. loads the manifest and verifies the grid checksum', async () => {
    const shipped = JSON.parse(readFileSync(PUBLIC + 'data/jezero/manifest.json', 'utf8'))
    const bin = readFileSync(PUBLIC + 'data/jezero/terrain.bin')
    expect(await sha256Hex(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer)).toBe(shipped.binary.sha256)
    expect(manifest).toMatchObject({
      datasetId: 'jezero-delta-front-p0',
      version: shipped.binary.sha256,
      status: 'verified',
      validCellCount: 636804,
      totalCellCount: 640000,
      elevationProvenanceId: 'usgs-hirise-dtm',
      slopeProvenanceId: 'dem-slope',
    })
    expect(manifest.verification).toMatchObject({ checksum: 'verified', pipelineValidation: 'passed' })
    expect(manifest.georeference).toMatchObject({ kind: 'verified', planetRadiusM: 3396190, latitudeType: 'planetocentric' })
    expect(manifest.grid.groundCellSizeM!.eastWest).toBeCloseTo(1.8971, 3)
    expect(manifest.grid.groundExtentM!.eastWest).toBeCloseTo(1517.7, 0)
  })

  it('3. samples a known valid cell (Three Forks target) exactly as the pipeline recorded it', () => {
    const s = svc.terrain.sample(W('three-forks-depot-area').position)
    expect(s.validity).toBe('valid')
    expect(s.elevationM).toBeCloseTo(-2545.158, 2)
    expect(s.slopeDeg).toBeCloseTo(1.398, 2)
    // engine cell (row 477 from north) -> frontend row 800 - 1 - 477
    expect(s.cell).toEqual({ col: 458, row: 799 - 477 })
  })

  it('4. rejects invalid cells: outside coverage, and the edge ring with unknown slope', () => {
    expect(svc.terrain.sample({ x: -5, y: 100 })).toMatchObject({ validity: 'outside-coverage', elevationM: null, slopeDeg: null })
    const edge = svc.terrain.sample({ x: 801, y: 1599 }) // top row (engine row 0)
    expect(edge.validity).toBe('slope-unknown')
    expect(edge.elevationM).not.toBeNull()
    expect(edge.slopeDeg).toBeNull()
    expect(checkPlacement(svc.terrain, edge.grid, 15)).toMatchObject({ ok: false, problem: 'slope-unknown' })
  })

  it('5. converts coordinates: SW origin, absolute projection, row orientation and ground distance', () => {
    const d = svc.context.dataset!
    const sw = svc.terrain.toGeo({ x: 0, y: 0 })!
    expect(sw.lonEast).toBeCloseTo(d.geographicBounds.west, 9)
    expect(sw.latNorth).toBeCloseTo(d.geographicBounds.south, 9)
    const target = W('skinner-ridge-sampling-site').geo!
    const back = svc.terrain.toGeo(svc.terrain.fromGeo(target)!)!
    expect(back.lonEast).toBeCloseTo(target.lonEast, 10)
    expect(back.latNorth).toBeCloseTo(target.latNorth, 10)
    // habitat cell centre agrees with the engine's own transform
    const hab = engineCellCenterToGrid(d, { row: 572, col: 698 })
    const g = gridToGeographic({ row: 572, col: 698 }, d.geometry)!
    expect(svc.terrain.toGeo(hab)!.lonEast).toBeCloseTo(g.lonEast, 10)
    expect(gridToEngineCell(d, hab)).toEqual({ row: 572, col: 698 })
    // frontend raster row 0 is south = engine row 799
    for (const c of [0, 123, 400, 799]) {
      expect(raster.elevationM[c]).toBe(d.elevationM[799 * 800 + c])
      expect(raster.elevationM[799 * 800 + c]).toBe(d.elevationM[c])
    }
    expect(raster.validity[0]).toBe(3) // corner: elevation measured, slope unknown
    expect(raster.validity[400 * 800 + 400]).toBe(1)
    // 100 grid metres east are ~94.9 m on the ground at 18.46° N; 100 m north are 100 m
    expect(svc.terrain.groundDistanceM({ x: 500, y: 500 }, { x: 600, y: 500 })!).toBeCloseTo(100 * Math.cos((18.455 * Math.PI) / 180), 1)
    expect(svc.terrain.groundDistanceM({ x: 500, y: 500 }, { x: 500, y: 600 })!).toBeCloseTo(100, 3)
  })

  it('6. loads the two cited science targets with sources and caveats', () => {
    expect(waypoints.map((w) => w.id)).toEqual(['three-forks-depot-area', 'skinner-ridge-sampling-site'])
    for (const w of waypoints) {
      expect(w.labelQuality).toBe('cited')
      expect(w.sources!.length).toBeGreaterThan(0)
      expect(w.sources!.every((s) => s.url.startsWith('https://'))).toBe(true)
      expect(w.provenanceId).toBe('science-waypoints')
    }
    expect(W('skinner-ridge-sampling-site').observation).toEqual({ sol: 490, utcDate: '2022-07-07' })
  })

  it('never snaps Skinner Ridge silently; offers the engine-validated cell 4 m away', () => {
    const p = W('skinner-ridge-sampling-site').position
    const check = checkPlacement(svc.terrain, p, 15)
    expect(check).toMatchObject({ ok: false, problem: 'too-steep' })
    expect(check.sample.slopeDeg).toBeCloseTo(20.755, 2)
    const snap = svc.terrain.nearestValid(p, 400, 15)!
    expect(gridToEngineCell(svc.context.dataset!, snap)).toEqual(EVIDENCE.snap.to)
    expect(svc.terrain.sample(snap).slopeDeg!).toBeLessThanOrEqual(15)
    expect(svc.terrain.groundDistanceM(p, snap)!).toBeLessThan(6)
  })
})

describe('routing (real A*)', () => {
  let shortest: RouteResult
  let lower: RouteResult
  beforeAll(async () => {
    const config = sampleConfig()
    ;[shortest, lower] = await Promise.all([routeFor(config, 'shortest'), routeFor(config, 'lower-slope')])
  })

  it('7-8. reproduces the engine fixture for outbound and the independent return leg', () => {
    for (const [mode, r] of [['shortest', shortest], ['lower-slope', lower]] as const) {
      expect(r.status).toBe('ok')
      if (r.status !== 'ok') return
      const ev = EVIDENCE.routes[mode]
      expect(r.source.kind).toBe('engine')
      expect(r.route.terrainAwarePathfinding).toBe(true)
      expect(r.route.outbound.distanceM).toBeCloseTo(ev.outbound.planimetric_m, 1)
      expect(r.route.outbound.surfaceDistanceM!).toBeCloseTo(ev.outbound.surface_m, 1)
      expect(r.route.inbound.distanceM).toBeCloseTo(ev.return.planimetric_m, 1)
      expect(r.route.outbound.ascentM).toBeCloseTo(ev.outbound.ascent_m, 1)
      expect(r.route.outbound.maxSlopeDeg).toBeCloseTo(ev.outbound.max_slope_deg, 1)
      expect(r.route.outbound.path.length).toBe(ev.outbound.cells)
      expect(r.route.inbound.path.length).toBe(ev.return.cells)
      expect(r.route.identicalLegs).toBe(false)
      // legs start and end at the habitat and the snapped destination
      const config = sampleConfig()
      const cell = (p: { x: number; y: number }) => gridToEngineCell(svc.context.dataset!, p)
      expect(cell(r.route.outbound.path[0]!)).toEqual(cell(config.habitat!.position))
      expect(cell(r.route.outbound.path.at(-1)!)).toEqual(cell(config.destination!.position))
      expect(cell(r.route.inbound.path[0]!)).toEqual(cell(config.destination!.position))
      expect(cell(r.route.inbound.path.at(-1)!)).toEqual(cell(config.habitat!.position))
      expect(r.route.outbound.waypointDistancesM.map((w) => w.label)).toEqual(['Three Forks sample depot area', 'Skinner Ridge sampling site'])
    }
  })

  it('9. lower-slope trades distance for gentler slopes', () => {
    if (shortest.status !== 'ok' || lower.status !== 'ok') throw new Error('routes missing')
    const mean = (r: RoundTripRoute) =>
      (r.outbound.meanSlopeDeg * r.outbound.distanceM + r.inbound.meanSlopeDeg * r.inbound.distanceM) / (r.outbound.distanceM + r.inbound.distanceM)
    expect(lower.route.totalDistanceM).toBeGreaterThan(shortest.route.totalDistanceM)
    expect(mean(lower.route)).toBeLessThan(mean(shortest.route))
    expect(mean(shortest.route)).toBeCloseTo(4.22, 1)
    expect(mean(lower.route)).toBeCloseTo(2.4, 1)
  })

  it('10. elevation profile samples equal the terrain grid and distances are monotonic', () => {
    if (shortest.status !== 'ok') throw new Error('route missing')
    for (const leg of [shortest.route.outbound, shortest.route.inbound]) {
      leg.samples.forEach((s, i) => {
        const t = svc.terrain.sample(s.grid)
        expect(t.elevationM).toBe(s.elevationM)
        expect(t.slopeDeg).toBe(s.slopeDeg)
        expect(s.slopeDeg).toBeLessThanOrEqual(15)
        if (i > 0) expect(s.distanceM).toBeGreaterThan(leg.samples[i - 1]!.distanceM)
      })
      expect(leg.samples.at(-1)!.distanceM).toBeCloseTo(leg.distanceM, 6)
    }
  })

  it('maps no-route and slope failures to the frontend codes with the engine origin kept', async () => {
    const r = await routeFor(sampleConfig({ maxSlopeDeg: 3 }), 'shortest')
    expect(r.status).toBe('error')
    if (r.status !== 'error') return
    expect(['UNSUPPORTED_SLOPE', 'NO_ROUTE']).toContain(r.code)
    expect(r.origin?.code).toBe(r.code)
    const outside = await svc.routing.computeRoundTrip({
      requestId: 'x',
      datasetId: manifest.datasetId,
      habitat: { x: -50, y: -50 },
      waypoints: [{ label: 'Destination', position: W('three-forks-depot-area').position }],
      mode: 'shortest',
      maxSlopeDeg: 15,
    })
    expect(outside).toMatchObject({ status: 'error', code: 'NO_COVERAGE' })
    const wrongDataset = await svc.routing.computeRoundTrip({ ...{ requestId: 'y', habitat: { x: 1, y: 1 }, waypoints: [], mode: 'shortest', maxSlopeDeg: 15 }, datasetId: 'demo' })
    expect(wrongDataset).toMatchObject({ status: 'error', code: 'DATA_UNAVAILABLE', origin: { code: 'DATASET_MISMATCH' } })
  })

  it('16. discards stale requests: aborted and superseded ones reject, never resolve as results', async () => {
    const config = sampleConfig()
    const ac = new AbortController()
    const first = routeFor(config, 'shortest', ac.signal)
    ac.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    // superseded without an abort: only the latest request of a mode may answer
    const older = routeFor(config, 'lower-slope')
    const newer = routeFor(config, 'lower-slope')
    await expect(older).rejects.toMatchObject({ name: 'AbortError' })
    expect((await newer).status).toBe('ok')
  })
})

describe('Mars24 daylight and feasibility (real)', () => {
  it('11. computes the documented solar scenario at the habitat', async () => {
    const config = sampleConfig()
    const solar = await svc.solar.getSolarDay('sol-690-three-forks', svc.terrain.toGeo(config.habitat!.position))
    expect(solar.status).toBe('ok')
    if (solar.status !== 'ok') return
    expect(solar.source.kind).toBe('engine')
    expect(solar.day.mars24Validated).toBe(true)
    expect(solar.day.sunriseLtstHours).toBeCloseTo(EVIDENCE.daylight.sunrise_ltst_h, 3)
    expect(solar.day.sunsetLtstHours).toBeCloseTo(EVIDENCE.daylight.sunset_ltst_h, 3)
    expect(solar.day.approximations.join(' ')).toMatch(/refraction/)
    // Ls scenarios are solved, and the northern summer day is longer than the winter one
    const geo = svc.terrain.toGeo(config.habitat!.position)
    const summer = await svc.solar.getSolarDay('ls-90-northern-summer', geo)
    const winter = await svc.solar.getSolarDay('ls-270-northern-winter', geo)
    if (summer.status !== 'ok' || winter.status !== 'ok') throw new Error('Ls scenarios failed')
    expect(summer.day.lsDeg).toBeCloseTo(90, 0)
    expect(winter.day.lsDeg).toBeCloseTo(270, 0)
    expect(summer.day.sunsetLtstHours - summer.day.sunriseLtstHours).toBeGreaterThan(winter.day.sunsetLtstHours - winter.day.sunriseLtstHours)
    expect(await svc.solar.getSolarDay('no-such-scenario', geo)).toMatchObject({ status: 'error', code: 'INVALID_INPUT' })
  })

  it('12. assesses the sample mission exactly like the engine evidence', async () => {
    const { a, result } = await plan(sampleConfig())
    expect(a.feasibility).toBe('feasible')
    expect(result.source.kind).toBe('engine')
    expect(a.totalMissionS! / 60).toBeCloseTo(EVIDENCE.plan.shortest.total_work_min, 1)
    expect(a.returnMarginS! / 60).toBeCloseTo(EVIDENCE.plan.shortest.return_margin_min, 1)
    expect(a.windowLimitedBy).toBe('sunset')
    expect(a.scienceS).toBe(50 * 60)
    expect(a.phases.map((p) => p.kind)).toEqual(['travel-outbound', 'science', 'travel-outbound', 'science', 'travel-return'])
    const engine = svc.mission.engineAssessment(result)!
    expect(new Date(engine.missionStartUtcMs).toISOString().slice(0, 19)).toBe(EVIDENCE.daylight.mission_start_utc.slice(0, 19))
    const lower = await plan(sampleConfig(), 'lower-slope')
    expect(lower.a.returnMarginS! / 60).toBeCloseTo(EVIDENCE.plan.lower_slope.return_margin_min, 1)
  })

  it('13. adding 60 min of science removes exactly 60 min of margin', async () => {
    const base = await plan(sampleConfig())
    const config = sampleConfig()
    config.destination = { ...config.destination!, durationMin: config.destination!.durationMin + 60 }
    const more = svc.mission.assess({ config, route: base.route, solar: base.solar })
    if (more.status !== 'ok') throw new Error('assess failed')
    expect(base.a.returnMarginS! - more.assessment.returnMarginS!).toBeCloseTo(3600, 6)
    expect(more.assessment.returnMarginS! / 60).toBeCloseTo(EVIDENCE.plan.variants.science_plus_60_min!.return_margin_min!, 1)
  })

  it('14. reports infeasible missions: late start, start in darkness, no legal route', async () => {
    const late = await plan(sampleConfig({ startLtstHours: 16.5 }))
    expect(late.a.feasibility).toBe('infeasible')
    expect(late.a.returnMarginS! / 60).toBeCloseTo(EVIDENCE.plan.variants.start_16_30_ltst!.return_margin_min!, 1)
    expect(late.a.violations.map((v) => v.code)).toContain('RETURN_MARGIN')
    const night = await plan(sampleConfig({ startLtstHours: 23.5 }))
    expect(night.a.feasibility).toBe('infeasible')
    expect(night.a.violations.map((v) => v.code)).toContain('STARTS_IN_DARKNESS')
    const steep = await plan(sampleConfig({ maxSlopeDeg: 3 }))
    expect(steep.a.feasibility).toBe('infeasible')
    expect(steep.a.violations.some((v) => v.code === 'TERRAIN_SLOPE' || v.code === 'NO_ROUTE')).toBe(true)
    const eva = await plan(sampleConfig({ maxEvaEnabled: true, maxEvaHours: 1 }))
    expect(eva.a.feasibility).toBe('infeasible')
    expect(eva.a.windowLimitedBy).toBe('max-eva')
  })

  it('15. reports indeterminate when an input is missing or not from the engine', async () => {
    const base = await plan(sampleConfig())
    const noSolar = svc.mission.assess({ config: sampleConfig(), route: base.route, solar: null })
    expect(noSolar.status === 'ok' && noSolar.assessment.feasibility).toBe('indeterminate')
    const solarFailed = svc.mission.assess({
      config: sampleConfig(),
      route: base.route,
      solar: { status: 'error', code: 'MODEL_UNAVAILABLE', detail: 'down', source: base.route.source },
    })
    expect(solarFailed.status === 'ok' && solarFailed.assessment.violations.map((v) => v.code)).toContain('MISSING_SOLAR')
    // A structurally valid route that the engine did not produce is not trusted.
    const forged = { ...base.route } as RouteResult
    const untrusted = svc.mission.assess({ config: sampleConfig(), route: forged, solar: base.solar })
    expect(untrusted.status === 'ok' && untrusted.assessment.feasibility).toBe('indeterminate')
    expect(untrusted.status === 'ok' && untrusted.assessment.violations.map((v) => v.code)).toContain('MISSING_ROUTE')
  })

  it('simulation on the frontend clock follows the engine simulation on the real route', async () => {
    const { route, result, a } = await plan(sampleConfig())
    if (route.status !== 'ok') throw new Error('route missing')
    const engineRoute = svc.context.routeStash.get(route) as Extract<RoundTripResult, { status: 'ok' }>
    const engine = svc.mission.engineAssessment(result)!
    const d = svc.context.dataset!
    const legs = new Map([...engineRoute.route.outboundSegments, engineRoute.route.inbound].map((l) => [l.id, l.vertices]))
    const solar = await svc.solar.getSolarDay('sol-690-three-forks', svc.terrain.toGeo(sampleConfig().habitat!.position))
    const daylight = svc.context.solarStash.get(solar)!.daylight
    let sim = createSimulation(engine.timeline!)
    if ('code' in sim) throw new Error('simulation failed')
    let t = 0
    for (const dt of [300, 600, 700, 1200, 900, 1500, 600]) {
      const next = stepSimulation(sim, dt)
      if ('code' in next) throw new Error('step failed')
      sim = next
      t += dt
      const es = getSimulationSnapshot(sim)
      const fs = snapshotAt(a, route.route, t, 9)
      expect(fs.remainingWorkS!).toBeCloseTo(es.remainingWorkS, 3)
      // on-plan margin equals the engine's progress-aware evaluation
      const live = evaluateMissionFeasibility({
        route: engineRoute,
        daylight,
        terrain: { version: d.version, verification: d.verification },
        assumptions: toEngineAssumptions(sampleConfig().assumptions),
        missionStartUtcMs: engine.missionStartUtcMs,
        progress: { elapsedS: t, remainingWorkS: es.remainingWorkS },
      })
      expect(fs.returnMarginS!).toBeCloseTo(live.returnMarginS!, 3)
      if (es.position) {
        const v = positionAlongVertices(legs.get(es.position.legId)!, es.position.surfaceDistanceM)!
        const enginePoint = projectedToGridCoord(d, v.projected)
        expect(svc.terrain.groundDistanceM(enginePoint, fs.position!)!).toBeLessThan(2.5)
      }
    }
  })
})

describe('map data (real)', () => {
  it('17. imagery failures never fabricate imagery or terrain', async () => {
    const real = createRealServices({ baseUrl: '/', fetch: offlineTiles, useWorker: false, probeImagery: true })
    const layers = await real.mapData.listLayers()
    if (layers.status !== 'ok') throw new Error('layers failed')
    const trek = layers.layers.filter((l) => ['hirise-ortho', 'ctx-mosaic', 'mola-shade'].includes(l.id))
    expect(trek.map((l) => l.availability)).toEqual(['unavailable', 'unavailable', 'unavailable'])
    expect(await real.mapData.getLayerImagery('hirise-ortho')).toMatchObject({ status: 'error', code: 'DATA_UNAVAILABLE' })
    // the local DTM relief stays offered; it is computed from elevation, not imagery
    expect(layers.layers.find((l) => l.id === 'dtm-hillshade')?.availability).toBe('available')
    // terrain values are unaffected by the imagery outage
    await real.terrain.load()
    expect(real.terrain.sample(W('three-forks-depot-area').position).validity).toBe('valid')
    // provenance does not claim Mars Trek layers that did not load
    const rec = real.mapData.listProvenance().find((r) => r.id === 'hirise-ortho')!
    expect(rec.integration).toBe('planned')
    // without a canvas (Node), DTM overlays report an error instead of an empty or invented image
    expect(await real.mapData.getLayerImagery('slope')).toMatchObject({ status: 'error', code: 'DATA_UNAVAILABLE' })
  })

  it('lists HiRISE, CTX and MOLA tile layers with bounds and the X2b caveat when Mars Trek answers', async () => {
    const reachable: typeof diskFetch = async (url) =>
      url.startsWith('https://trek.nasa.gov') ? new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } }) : diskFetch(url)
    const real = createRealServices({ baseUrl: '/', fetch: reachable, useWorker: false })
    const layers = await real.mapData.listLayers()
    if (layers.status !== 'ok') throw new Error('layers failed')
    const hirise = layers.layers.find((l) => l.id === 'hirise-ortho')!
    expect(hirise).toMatchObject({ availability: 'available', role: 'basemap', illustrative: false, defaultVisible: true })
    expect(hirise.caveat).toMatch(/±3 m/)
    const img = await real.mapData.getLayerImagery('hirise-ortho')
    expect(img).toMatchObject({ status: 'ok', imagery: { type: 'tiles', maxNativeZoom: 17 } })
    if (img.status !== 'ok' || img.imagery.type !== 'tiles') return
    expect(img.imagery.urlTemplate).toBe(
      'https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd/1.0.0/default/default028mm/{z}/{y}/{x}.png',
    )
    // the layer footprint contains the whole terrain grid
    const b = img.imagery.bounds
    const g = (await real.terrain.load()).status === 'ok' ? real.context.dataset!.geographicBounds : null
    expect(b.west < g!.west && b.east > g!.east && b.south < g!.south && b.north > g!.north).toBe(true)
    const records = real.mapData.listProvenance()
    for (const id of ['hirise-ortho', 'ctx-mosaic', 'mola-shade', 'usgs-hirise-dtm', 'dem-slope', 'science-waypoints', 'route-geometry', 'mars24-solar', 'eva-assumptions']) {
      expect(records.find((r) => r.id === id)?.integration, id).toBe('integrated')
    }
    expect(new Set(records.filter((r) => r.integration === 'integrated').map((r) => r.mission).filter(Boolean))).toEqual(
      new Set(['Mars Reconnaissance Orbiter (MRO)', 'Mars 2020', 'Mars Reconnaissance Orbiter', 'Mars Global Surveyor']),
    )
  })
})

describe('route worker protocol', () => {
  /** In-process stand-in for the module worker: runs the engine's real worker handler asynchronously. */
  class FakeWorker {
    onmessage: ((e: MessageEvent<RouteWorkerResponse>) => void) | null = null
    onerror: ((e: ErrorEvent) => void) | null = null
    onmessageerror: (() => void) | null = null
    terminated = false
    private handle = createRouteWorkerHandler()
    constructor(private delayMs = 0, private crashOnRoute = false) {}
    postMessage(msg: RouteWorkerRequest) {
      setTimeout(async () => {
        if (this.terminated) return
        if (this.crashOnRoute && msg.type !== 'load') {
          this.onerror?.({ message: 'simulated crash', preventDefault() {} } as ErrorEvent)
          return
        }
        const res = await this.handle(msg)
        if (!this.terminated) this.onmessage?.({ data: res } as MessageEvent<RouteWorkerResponse>)
      }, this.delayMs)
    }
    terminate() {
      this.terminated = true
    }
  }

  const setup = (make: () => FakeWorker) => {
    const ctx = createContext({ baseUrl: '/', fetch: diskFetch, useWorker: false })
    const terrain = createRealTerrain(ctx)
    const spawned: FakeWorker[] = []
    const executor = createWorkerExecutor(
      () => (ctx.dataset && ctx.buffer ? { manifest: ctx.dataset.manifest, buffer: ctx.buffer } : null),
      () => {
        const w = make()
        spawned.push(w)
        return w as unknown as Worker
      },
    )
    return { ctx, terrain, routing: createRealRouting(ctx, executor), spawned }
  }
  const req = (datasetId: string, mode: 'shortest' | 'lower-slope' = 'shortest') => {
    const c = sampleConfig()
    return {
      requestId: 'w',
      datasetId,
      habitat: c.habitat!.position,
      waypoints: [...c.stops, c.destination!].map((s) => ({ id: s.id, label: s.label, position: s.position, durationMin: s.durationMin })),
      mode,
      maxSlopeDeg: 15,
    }
  }

  it('loads a copy of the grid, computes in the worker and matches the main-thread result', async () => {
    const { terrain, routing, spawned } = setup(() => new FakeWorker())
    await terrain.load()
    const viaWorker = await routing.computeRoundTrip(req(manifest.datasetId))
    const direct = await routeFor(sampleConfig(), 'shortest')
    expect(viaWorker.status).toBe('ok')
    if (viaWorker.status !== 'ok' || direct.status !== 'ok') return
    expect(viaWorker.route.outbound.path).toEqual(direct.route.outbound.path)
    expect(viaWorker.route.inbound.path).toEqual(direct.route.inbound.path)
    expect(spawned).toHaveLength(1)
  })

  it('terminates a running search on abort and starts a fresh worker for the next request', async () => {
    const { terrain, routing, spawned } = setup(() => new FakeWorker(40))
    await terrain.load()
    const ac = new AbortController()
    const p = routing.computeRoundTrip(req(manifest.datasetId), ac.signal)
    await new Promise((r) => setTimeout(r, 60)) // loaded, search in flight
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(spawned[0]!.terminated).toBe(true)
    const next = await routing.computeRoundTrip(req(manifest.datasetId))
    expect(next.status).toBe('ok')
    expect(spawned).toHaveLength(2)
  })

  it('turns a crashed worker into an error result, never an endless loading state', async () => {
    const { terrain, routing } = setup(() => new FakeWorker(0, true))
    await terrain.load()
    const r = await routing.computeRoundTrip(req(manifest.datasetId))
    expect(r).toMatchObject({ status: 'error', code: 'MODEL_UNAVAILABLE', origin: { code: 'MODEL_FAILURE' } })
  })
})
