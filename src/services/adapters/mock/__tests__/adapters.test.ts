import { beforeEach, describe, expect, it } from 'vitest'
import { MARS_HOUR_SECONDS, type AusnoxServices, type MissionConfig, type RouteRequest } from '@/services/contracts'
import { createRealServices } from '../../real'
import { createMockServices } from '../index'

const request = (over: Partial<RouteRequest> = {}): RouteRequest => ({
  requestId: 'r1',
  datasetId: 'demo',
  habitat: { x: 700, y: 1500 },
  waypoints: [{ label: 'Destination', position: { x: 3290, y: 1930 } }],
  mode: 'shortest',
  maxSlopeDeg: 15,
  ...over,
})

const mission = (over: Partial<MissionConfig['assumptions']> = {}, durationMin = 30): MissionConfig => ({
  id: 'm',
  name: 'Test',
  habitat: { id: 'habitat', label: 'Habitat', position: { x: 700, y: 1500 } },
  destination: { id: 'destination', label: 'Destination', position: { x: 3290, y: 1930 }, durationMin, waypointId: null },
  stops: [],
  routeMode: 'shortest',
  assumptions: {
    walkingSpeedMps: 0.6,
    maxSlopeDeg: 15,
    reserveMin: 30,
    startLtstHours: 13,
    maxEvaEnabled: false,
    maxEvaHours: 8,
    warningMarginMin: 30,
    solarScenarioId: 'demo-mid',
    ...over,
  },
})

let s: AusnoxServices
beforeEach(async () => {
  s = createMockServices()
  s.demo!.set('nominal')
  await s.terrain.load()
})

describe('mock terrain', () => {
  it('labels itself as illustrative demo data from a mock adapter', async () => {
    const r = await s.terrain.load()
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.source.kind).toBe('mock')
    expect(r.manifest.status).toBe('illustrative-demo')
    expect(r.manifest.georeference.kind).toBe('nominal-demo')
    expect(r.manifest.validCellCount).toBeLessThan(r.manifest.totalCellCount)
  })

  it('returns values for valid cells and null, never a guess, elsewhere', () => {
    const valid = s.terrain.sample({ x: 700, y: 1500 })
    expect(valid.validity).toBe('valid')
    expect(valid.elevationM).toEqual(expect.any(Number))
    expect(valid.slopeDeg).toBeGreaterThanOrEqual(0)

    const nodata = s.terrain.sample({ x: 1500, y: 2080 })
    expect(nodata).toMatchObject({ validity: 'nodata', elevationM: null, slopeDeg: null })

    const cutCorner = s.terrain.sample({ x: 60, y: 60 })
    expect(cutCorner).toMatchObject({ validity: 'outside-coverage', elevationM: null, slopeDeg: null })

    const offGrid = s.terrain.sample({ x: -500, y: 9000 })
    expect(offGrid).toMatchObject({ validity: 'outside-coverage', cell: null, elevationM: null })
  })

  it('is deterministic', async () => {
    const a = s.terrain.sample({ x: 2222, y: 1111 })
    const other = createMockServices()
    await other.terrain.load()
    expect(other.terrain.sample({ x: 2222, y: 1111 })).toEqual(a)
  })

  it('offers the nearest valid cell without applying it', () => {
    const snap = s.terrain.nearestValid({ x: 1500, y: 2080 }, 400)
    expect(snap).not.toBeNull()
    expect(s.terrain.sample(snap!).validity).toBe('valid')
    expect(s.terrain.nearestValid({ x: -5000, y: -5000 }, 400)).toBeNull()
  })

  it('round-trips grid and nominal geographic coordinates', () => {
    const p = { x: 1234, y: 987 }
    const back = s.terrain.fromGeo(s.terrain.toGeo(p)!)!
    expect(back.x).toBeCloseTo(p.x, 6)
    expect(back.y).toBeCloseTo(p.y, 6)
  })

  it('reports unavailable when the terrain dataset is missing', async () => {
    s.demo!.set('terrain-missing')
    const r = await s.terrain.load()
    expect(r).toMatchObject({ status: 'error', code: 'DATA_UNAVAILABLE' })
    expect(s.terrain.sample({ x: 700, y: 1500 })).toMatchObject({ validity: 'unavailable', elevationM: null })
  })
})

describe('mock routing', () => {
  it('returns a round trip that is marked as demonstration geometry, not pathfinding', async () => {
    const r = await s.routing.computeRoundTrip(request())
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.source.kind).toBe('mock')
    expect(r.requestId).toBe('r1')
    expect(r.route.terrainAwarePathfinding).toBe(false)
    const { outbound, inbound } = r.route
    expect(outbound.path[0]).toEqual({ x: 700, y: 1500 })
    expect(outbound.path.at(-1)).toEqual({ x: 3290, y: 1930 })
    expect(inbound.path[0]).toEqual({ x: 3290, y: 1930 })
    expect(inbound.path.at(-1)).toEqual({ x: 700, y: 1500 })
    expect(r.route.totalDistanceM).toBeCloseTo(outbound.distanceM + inbound.distanceM, 6)
    expect(outbound.distanceM).toBeGreaterThanOrEqual(Math.hypot(3290 - 700, 1930 - 1500) - 1e-6)
    expect(r.route.maxSlopeDeg).toBeLessThanOrEqual(15)
  })

  it('never crosses cells without terrain data', async () => {
    const r = await s.routing.computeRoundTrip(request())
    if (r.status !== 'ok') throw new Error('expected a route')
    for (const p of [...r.route.outbound.path, ...r.route.inbound.path]) {
      expect(s.terrain.sample(p).validity).toBe('valid')
    }
  })

  it('lower-slope mode trades distance for a gentler route', async () => {
    const short = await s.routing.computeRoundTrip(request())
    const gentle = await s.routing.computeRoundTrip(request({ mode: 'lower-slope' }))
    if (short.status !== 'ok' || gentle.status !== 'ok') throw new Error('expected routes')
    expect(gentle.route.totalDistanceM).toBeGreaterThan(short.route.totalDistanceM)
    expect(gentle.route.maxSlopeDeg).toBeLessThan(short.route.maxSlopeDeg)
  })

  it('visits intermediate stops in order', async () => {
    const r = await s.routing.computeRoundTrip(
      request({
        waypoints: [
          { label: 'Stop 1', position: { x: 1950, y: 1450 } },
          { label: 'Destination', position: { x: 3290, y: 1930 } },
        ],
      }),
    )
    if (r.status !== 'ok') throw new Error('expected a route')
    const marks = r.route.outbound.waypointDistancesM
    expect(marks.map((m) => m.label)).toEqual(['Stop 1', 'Destination'])
    expect(marks[0]!.distanceM).toBeLessThan(marks[1]!.distanceM)
    expect(marks[1]!.distanceM).toBeCloseTo(r.route.outbound.distanceM, 6)
  })

  it.each([
    ['outside coverage', { habitat: { x: 60, y: 60 } }, 'NO_COVERAGE'],
    ['on a no-data cell', { habitat: { x: 1500, y: 2080 } }, 'NO_DATA'],
    ['under an impossible slope limit', { maxSlopeDeg: 6 }, 'UNSUPPORTED_SLOPE'],
    ['with no destination', { waypoints: [] }, 'INVALID_INPUT'],
  ])('fails closed %s', async (_name, over, code) => {
    const r = await s.routing.computeRoundTrip(request(over as Partial<RouteRequest>))
    expect(r).toMatchObject({ status: 'error', code })
  })

  it('reports NO_ROUTE when every candidate crosses missing data', async () => {
    // Both points hug the no-data pocket on opposite sides.
    const r = await s.routing.computeRoundTrip(
      request({ habitat: { x: 1250, y: 2080 }, waypoints: [{ label: 'Destination', position: { x: 1750, y: 2080 } }] }),
    )
    expect(r).toMatchObject({ status: 'error', code: 'NO_ROUTE' })
  })

  it('times out and blocks on missing terrain in the matching demo scenarios', async () => {
    s.demo!.set('routing-timeout')
    expect(await s.routing.computeRoundTrip(request())).toMatchObject({ status: 'error', code: 'TIMEOUT' })
    s.demo!.set('terrain-missing')
    await s.terrain.load()
    expect(await s.routing.computeRoundTrip(request())).toMatchObject({ status: 'error', code: 'DATA_UNAVAILABLE' })
  })

  it('rejects when aborted', async () => {
    const c = new AbortController()
    c.abort()
    await expect(s.routing.computeRoundTrip(request(), c.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('mock solar', () => {
  it('returns fixed demonstration daylight that is not Mars24 validated', async () => {
    const r = await s.solar.getSolarDay('demo-mid', null)
    expect(r).toMatchObject({ status: 'ok', source: { kind: 'mock' }, day: { sunriseLtstHours: 6, sunsetLtstHours: 18, mars24Validated: false } })
  })
  it('fails for unknown scenarios and when the model is unavailable', async () => {
    expect(await s.solar.getSolarDay('nope', null)).toMatchObject({ status: 'error', code: 'INVALID_INPUT' })
    s.demo!.set('solar-unavailable')
    expect(await s.solar.getSolarDay('demo-mid', null)).toMatchObject({ status: 'error', code: 'MODEL_UNAVAILABLE' })
  })
})

describe('mock mission assessment', () => {
  const assess = async (config: MissionConfig, opts: { route?: boolean; solar?: boolean } = {}) => {
    const route = opts.route === false ? null : await s.routing.computeRoundTrip(request({ maxSlopeDeg: config.assumptions.maxSlopeDeg }))
    const solar = opts.solar === false ? null : await s.solar.getSolarDay(config.assumptions.solarScenarioId, null)
    const r = s.mission.assess({ config, route, solar })
    if (r.status !== 'ok') throw new Error('expected an assessment')
    return { a: r.assessment, route, source: r.source }
  }

  it('computes duration, window and margin in Earth seconds', async () => {
    const { a, route, source } = await assess(mission())
    if (route?.status !== 'ok') throw new Error()
    expect(source.kind).toBe('mock')
    expect(a.outboundTravelS).toBeCloseTo(route.route.outbound.distanceM / 0.6, 6)
    expect(a.totalMissionS).toBeCloseTo(a.outboundTravelS! + a.returnTravelS! + 1800, 6)
    // 13:00 to 18:00 is five Mars clock hours, converted to Earth seconds.
    expect(a.windowEndS).toBeCloseTo(5 * MARS_HOUR_SECONDS, 6)
    expect(a.returnMarginS).toBeCloseTo(a.windowEndS! - a.totalMissionS! - 1800, 6)
    expect(a.feasibility).toBe('feasible')
    expect(a.phases.map((p) => p.kind)).toEqual(['travel-outbound', 'science', 'travel-return'])
    expect(a.phases.at(-1)!.endS).toBeCloseTo(a.totalMissionS!, 6)
  })

  it('more science time shrinks the margin until the mission is infeasible', async () => {
    const base = await assess(mission())
    const longer = await assess(mission({}, 90))
    expect(longer.a.returnMarginS).toBeCloseTo(base.a.returnMarginS! - 3600, 6)
    const tooLong = await assess(mission({}, 240))
    expect(tooLong.a.feasibility).toBe('infeasible')
    expect(tooLong.a.violations.map((v) => v.code)).toContain('RETURN_MARGIN')
  })

  it('treats a margin of exactly zero as feasible and just below as infeasible', async () => {
    const { a } = await assess(mission({ warningMarginMin: 0 }))
    const exact = a.returnMarginS! / 60 + 30
    expect((await assess(mission({ reserveMin: exact, warningMarginMin: 0 }))).a.returnMarginS).toBeCloseTo(0, 6)
    expect((await assess(mission({ reserveMin: exact + 1, warningMarginMin: 0 }))).a.feasibility).toBe('infeasible')
  })

  it('warns without failing when the margin is below the warning threshold', async () => {
    const { a } = await assess(mission({ warningMarginMin: 120 }))
    expect(a.feasibility).toBe('feasible')
    expect(a.violations).toEqual([expect.objectContaining({ code: 'LOW_MARGIN', severity: 'warning' })])
  })

  it('is infeasible when the mission starts in darkness and does not shift the start', async () => {
    const { a } = await assess(mission({ startLtstHours: 4 }))
    expect(a.feasibility).toBe('infeasible')
    expect(a.violations.map((v) => v.code)).toContain('STARTS_IN_DARKNESS')
    expect(a.assumptionsUsed.startLtstHours).toBe(4)
  })

  it('applies the EVA duration limit when it is tighter than sunset', async () => {
    const { a } = await assess(mission({ maxEvaEnabled: true, maxEvaHours: 3 }))
    expect(a.windowLimitedBy).toBe('max-eva')
    expect(a.windowEndS).toBe(3 * 3600)
  })

  it('is indeterminate, never feasible, when route or daylight is missing', async () => {
    const noRoute = await assess(mission(), { route: false })
    expect(noRoute.a.feasibility).toBe('indeterminate')
    expect(noRoute.a.returnMarginS).toBeNull()

    const noSolar = await assess(mission(), { solar: false })
    expect(noSolar.a.feasibility).toBe('indeterminate')
    expect(noSolar.a.returnMarginS).toBeNull()

    s.demo!.set('solar-unavailable')
    const failed = await assess(mission())
    expect(failed.a.feasibility).toBe('indeterminate')
    expect(failed.a.violations.map((v) => v.code)).toContain('MISSING_SOLAR')
  })

  it('is infeasible when terrain exceeds the slope limit', async () => {
    const { a } = await assess(mission({ maxSlopeDeg: 6 }))
    expect(a.feasibility).toBe('infeasible')
    expect(a.violations.map((v) => v.code)).toContain('TERRAIN_SLOPE')
  })

  it('is indeterminate for invalid assumptions', async () => {
    const { a } = await assess(mission({ walkingSpeedMps: 0 }))
    expect(a.feasibility).toBe('indeterminate')
    expect(a.totalMissionS).toBeNull()
  })
})

describe('layers, waypoints and provenance', () => {
  it('marks real NASA layers unavailable instead of faking them', async () => {
    const r = await s.mapData.listLayers()
    if (r.status !== 'ok') throw new Error()
    const hirise = r.layers.find((l) => l.id === 'hirise-ortho')!
    expect(hirise.availability).toBe('unavailable')
    expect(hirise.availabilityNote).toBeTruthy()
    expect(await s.mapData.getLayerImagery('hirise-ortho')).toMatchObject({ status: 'error', code: 'NOT_IMPLEMENTED' })
    for (const l of r.layers.filter((x) => x.availability === 'available')) expect(l.illustrative).toBe(true)
  })

  it('fails imagery requests in the imagery-offline scenario', async () => {
    s.demo!.set('imagery-offline')
    expect(await s.mapData.getLayerImagery('schematic-base')).toMatchObject({ status: 'error', code: 'DATA_UNAVAILABLE' })
  })

  it('lists only illustrative waypoints on valid cells, and can be empty', async () => {
    const r = await s.mapData.listWaypoints()
    if (r.status !== 'ok') throw new Error()
    expect(r.waypoints.length).toBeGreaterThan(0)
    for (const w of r.waypoints) {
      expect(w.labelQuality).toBe('illustrative')
      expect(s.terrain.sample(w.position).validity).toBe('valid')
    }
    s.demo!.set('no-waypoints')
    expect(await s.mapData.listWaypoints()).toMatchObject({ status: 'ok', waypoints: [] })
  })

  it('registers no NASA dataset as integrated', () => {
    const records = s.mapData.listProvenance()
    for (const r of records.filter((x) => x.kind === 'observed' || x.kind === 'historical')) {
      expect(r.integration).not.toBe('integrated')
    }
    const ids = records.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('real adapters', () => {
  it('answer NOT_IMPLEMENTED everywhere and never return favourable data', async () => {
    const real = createRealServices()
    expect(real.mode).toBe('real')
    expect(real.demo).toBeUndefined()
    expect(await real.terrain.load()).toMatchObject({ status: 'error', code: 'NOT_IMPLEMENTED', source: { kind: 'engine' } })
    expect(real.terrain.sample({ x: 1, y: 1 })).toMatchObject({ validity: 'unavailable', elevationM: null })
    expect(await real.routing.computeRoundTrip(request())).toMatchObject({ status: 'error', code: 'NOT_IMPLEMENTED' })
    expect(await real.solar.getSolarDay('x', null)).toMatchObject({ status: 'error', code: 'NOT_IMPLEMENTED' })
    expect(real.mission.assess({ config: mission(), route: null, solar: null })).toMatchObject({ status: 'error', code: 'NOT_IMPLEMENTED' })
  })
})
