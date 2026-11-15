/**
 * End-to-end scientific workflow on the REAL validated Jezero asset (HiRISE DTM-derived grid,
 * NASA rover-localized science targets). No synthetic terrain is used in this file.
 *
 * Scenario (illustrative): a hypothetical habitat on flat crater floor, a 20 min stop at the
 * Three Forks depot area, then Skinner Ridge as destination. Mission start: 09:00 LTST at the
 * habitat on the sol of 2023-01-28 (the day Perseverance completed the Three Forks depot).
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MISSION_ASSUMPTIONS,
  FLAG_ELEVATION_VALID,
  FLAG_SLOPE_VALID,
  MARS_HOUR_SECONDS,
  buildMissionTimeline,
  calculateDaylightWindow,
  calculateMarsSolarTime,
  calculateRoundTrip,
  calculateRoute,
  calculateRouteAsync,
  createSimulation,
  evaluateMissionFeasibility,
  findNearestTraversableCell,
  findUtcForLocalTrueSolarTime,
  geographicToGrid,
  getSimulationSnapshot,
  gridToGeographic,
  holdSimulation,
  parseScienceTargets,
  planMission,
  replanSimulation,
  startSimulation,
  stepSimulation,
  type MissionAssumptions,
  type RouteLeg,
  type RouteVertex,
  type SimulationState,
  type TerrainDataset,
} from '../src/index.js'
import { writeEvidence } from './helpers/evidence.js'
import { loadRealDataset, readJson } from './helpers/realAsset.js'

const HABITAT_CELL = { row: 572, col: 698 } // flat crater-floor cell chosen from the DTM (max slope 1.8 deg within 10 m)
const SCENARIO_DATE_UTC = Date.UTC(2023, 0, 28, 12)
const ASSUMPTIONS: MissionAssumptions = { ...DEFAULT_MISSION_ASSUMPTIONS } // 0.6 m/s, 15 deg, 30 min reserve

function assertLegalPath(d: TerrainDataset, leg: RouteLeg): void {
  const W = d.geometry.width
  const tanMax = Math.tan((leg.maxSlopeDeg * Math.PI) / 180)
  const ok = (r: number, c: number) => {
    const i = r * W + c
    return (d.flags[i]! & (FLAG_ELEVATION_VALID | FLAG_SLOPE_VALID)) === 3 && d.slopeDeg[i]! <= leg.maxSlopeDeg
  }
  leg.vertices.forEach((v, k) => {
    expect(ok(v.cell.row, v.cell.col), `vertex ${k} traversable`).toBe(true)
    expect(v.elevationM).toBe(d.elevationM[v.cell.row * W + v.cell.col])
    if (k === 0) return
    const p = leg.vertices[k - 1]!
    const dr = v.cell.row - p.cell.row
    const dc = v.cell.col - p.cell.col
    expect(Math.max(Math.abs(dr), Math.abs(dc)), 'adjacent move').toBe(1)
    if (dr !== 0 && dc !== 0) {
      expect(ok(p.cell.row, v.cell.col) && ok(v.cell.row, p.cell.col), 'no corner cutting').toBe(true)
    }
    const d2 = v.distanceM - p.distanceM
    expect(Math.abs(v.elevationM - p.elevationM)).toBeLessThanOrEqual(d2 * tanMax + 1e-9)
  })
}

const checkMetrics = (leg: RouteLeg) => {
  const m = leg.metrics
  const vs = leg.vertices
  expect(m.ascentM - m.descentM).toBeCloseTo(vs[vs.length - 1]!.elevationM - vs[0]!.elevationM, 6)
  expect(m.surfaceDistanceM).toBeGreaterThanOrEqual(m.planimetricDistanceM)
  expect(m.maxSlopeDeg).toBeLessThanOrEqual(leg.maxSlopeDeg)
  expect(m.totalCost).toBeGreaterThanOrEqual(m.planimetricDistanceM - 1e-9)
  for (let k = 1; k < vs.length; k++) expect(vs[k]!.distanceM).toBeGreaterThan(vs[k - 1]!.distanceM)
}

const summarizeLeg = (l: { metrics: RouteLeg['metrics']; vertices: readonly RouteVertex[] }) => ({
  planimetric_m: +l.metrics.planimetricDistanceM.toFixed(2),
  surface_m: +l.metrics.surfaceDistanceM.toFixed(2),
  ascent_m: +l.metrics.ascentM.toFixed(2),
  descent_m: +l.metrics.descentM.toFixed(2),
  max_slope_deg: +l.metrics.maxSlopeDeg.toFixed(2),
  mean_slope_deg: +l.metrics.meanSlopeDeg.toFixed(2),
  cells: l.vertices.length,
})

describe('real Jezero end-to-end workflow', async () => {
  // 1. load the validated real dataset (checksum verified)
  const d = await loadRealDataset()
  const targets = parseScienceTargets(readJson('science-targets.geojson'), d)
  if (targets.status !== 'ok') throw new Error('science targets failed validation')
  const threeForks = targets.targets.find((t) => t.id === 'three-forks-depot-area')!
  const skinner = targets.targets.find((t) => t.id === 'skinner-ridge-sampling-site')!
  const habitat = gridToGeographic(HABITAT_CELL, d.geometry)!
  const evidence: Record<string, unknown> = { dataset: { id: d.id, sha256: d.version, verification: d.verification } }

  it('1-2. dataset is verified and the selected locations are valid cells', () => {
    expect(d.verification.verifiedForFeasibility).toBe(true)
    expect(d.verification.checksum).toBe('verified')
    const h = geographicToGrid(habitat, d.geometry)
    expect(h.status === 'ok' && h.cell).toEqual(HABITAT_CELL)
    expect(d.slopeDeg[HABITAT_CELL.row * 800 + HABITAT_CELL.col]!).toBeLessThan(2)
    expect(d.slopeDeg[threeForks.cell.row * 800 + threeForks.cell.col]!).toBeLessThan(15)
    expect(d.slopeDeg[skinner.cell.row * 800 + skinner.cell.col]!).toBeGreaterThan(15)
    evidence.locations = {
      habitat: { ...habitat, cell: HABITAT_CELL, label: 'Hypothetical habitat (illustrative)' },
      three_forks: { ...threeForks.coordinate, cell: threeForks.cell },
      skinner_ridge: { ...skinner.coordinate, cell: skinner.cell },
    }
  })

  it('a steep cited target is refused with UNSUPPORTED_SLOPE, then reachable after an explicit snap', () => {
    const r = calculateRoute(d, { start: threeForks.coordinate, destination: skinner.coordinate, preference: 'shortest', maxSlopeDeg: 15 })
    expect(r.status === 'error' && r.code).toBe('UNSUPPORTED_SLOPE')
    const snap = findNearestTraversableCell(d, skinner.cell, { maxSlopeDeg: 15, maxDistanceM: 10 })!
    expect(snap.distanceM).toBeLessThanOrEqual(10)
    const r2 = calculateRoute(d, { start: threeForks.coordinate, destination: snap.geographic, preference: 'shortest', maxSlopeDeg: 15 })
    expect(r2.status).toBe('ok')
    evidence.snap = { from: skinner.cell, to: snap.cell, distance_m: snap.distanceM, reason: 'target cell slope above the 15 deg limit; snap confirmed by the planner' }
  })

  const snapped = findNearestTraversableCell(d, skinner.cell, { maxSlopeDeg: 15, maxDistanceM: 10 })!
  const stops = [
    { id: threeForks.id, label: threeForks.title, coordinate: threeForks.coordinate, activityDurationS: 20 * 60 },
    { id: skinner.id, label: `${skinner.title} (nearest traversable cell, ${snapped.distanceM.toFixed(0)} m)`, coordinate: snapped.geographic, activityDurationS: 30 * 60 },
  ]

  it('3-5. outbound and independent return routes in both modes are legal, with consistent metrics', () => {
    const out: Record<string, unknown> = {}
    for (const preference of ['shortest', 'lower-slope'] as const) {
      const t0 = performance.now()
      const rt = calculateRoundTrip(d, { habitat, habitatLabel: 'habitat', stops, preference, maxSlopeDeg: 15 })
      const ms = performance.now() - t0
      expect(rt.status).toBe('ok')
      if (rt.status !== 'ok') return
      const R = rt.route
      for (const leg of [...R.outboundSegments, R.inbound]) {
        assertLegalPath(d, leg)
        checkMetrics(leg)
      }
      expect(R.outbound.vertices[0]!.cell).toEqual(HABITAT_CELL)
      expect(R.inbound.vertices.at(-1)!.cell).toEqual(HABITAT_CELL)
      expect(R.inbound.vertices[0]!.cell).toEqual(snapped.cell)
      expect(R.outbound.vertices.some((v) => v.cell.row === threeForks.cell.row && v.cell.col === threeForks.cell.col)).toBe(true)
      expect(R.identicalLegs).toBe(false)
      expect(ms).toBeLessThan(2000) // PRD performance goal per route calculation
      out[preference] = {
        outbound: summarizeLeg(R.outbound),
        return: summarizeLeg(R.inbound),
        totals: R.totals,
        nodes_expanded: [...R.outboundSegments, R.inbound].map((l) => l.search.nodesExpanded),
        compute_ms: +ms.toFixed(1),
      }
    }
    const s = out.shortest as { outbound: { planimetric_m: number; mean_slope_deg: number }; return: { planimetric_m: number; mean_slope_deg: number } }
    const l = out['lower-slope'] as typeof s
    // trade-off: lower-slope is never shorter and never has a higher mean slope
    expect(l.outbound.planimetric_m + l.return.planimetric_m).toBeGreaterThanOrEqual(s.outbound.planimetric_m + s.return.planimetric_m - 1e-6)
    expect(l.outbound.mean_slope_deg + l.return.mean_slope_deg).toBeLessThanOrEqual(s.outbound.mean_slope_deg + s.return.mean_slope_deg + 1e-6)
    evidence.routes = out
  })

  it('symmetric costs give equal optimal costs in both directions; computation is deterministic', async () => {
    for (const preference of ['shortest', 'lower-slope'] as const) {
      const a = calculateRoute(d, { start: habitat, destination: threeForks.coordinate, preference, maxSlopeDeg: 15 })
      const b = calculateRoute(d, { start: threeForks.coordinate, destination: habitat, preference, maxSlopeDeg: 15 })
      const c = calculateRoute(d, { start: habitat, destination: threeForks.coordinate, preference, maxSlopeDeg: 15 })
      const asyncRun = await calculateRouteAsync(d, { start: habitat, destination: threeForks.coordinate, preference, maxSlopeDeg: 15 }, { chunkExpansions: 2000 })
      expect(a.status === 'ok' && b.status === 'ok' && c.status === 'ok' && asyncRun.status === 'ok').toBe(true)
      if (a.status !== 'ok' || b.status !== 'ok' || c.status !== 'ok' || asyncRun.status !== 'ok') return
      expect(a.leg.metrics.totalCost).toBeCloseTo(b.leg.metrics.totalCost, 6)
      expect(c.leg.vertices.map((v) => v.cell)).toEqual(a.leg.vertices.map((v) => v.cell))
      expect(asyncRun.leg.vertices.map((v) => v.cell)).toEqual(a.leg.vertices.map((v) => v.cell))
    }
    // a direction-sensitive cost (uphill penalty only) may legitimately give different return geometry
    const up = { preference: 'lower-slope' as const, maxSlopeDeg: 15, costModel: { slopeWeight: 4, uphillWeight: 20, downhillWeight: 0 } }
    const o = calculateRoute(d, { ...up, start: threeForks.coordinate, destination: snapped.geographic })
    const r = calculateRoute(d, { ...up, start: snapped.geographic, destination: threeForks.coordinate })
    expect(o.status === 'ok' && r.status === 'ok').toBe(true)
    if (o.status === 'ok' && r.status === 'ok') {
      evidence.direction_sensitive = { uphill_cost: o.leg.metrics.totalCost, downhill_cost: r.leg.metrics.totalCost, ascent_out_m: o.leg.metrics.ascentM, ascent_back_m: r.leg.metrics.ascentM }
      expect(o.leg.metrics.totalCost).toBeGreaterThan(r.leg.metrics.totalCost) // climbing toward the delta costs more
    }
  })

  it('6-7. simulated start time and Mars24 daylight at the habitat', () => {
    const start = findUtcForLocalTrueSolarTime(habitat, 9, SCENARIO_DATE_UTC)
    expect(start.status).toBe('ok')
    if (start.status !== 'ok') return
    const w = calculateDaylightWindow(start.utcMs, habitat)
    expect(w.status === 'ok' && w.kind).toBe('normal')
    if (w.status !== 'ok') return
    const t = calculateMarsSolarTime(start.utcMs, habitat)
    expect(t.status === 'ok' && t.local.ltstHours).toBeCloseTo(9, 6)
    expect(w.sunriseUtcMs!).toBeLessThan(start.utcMs)
    expect(w.sunsetUtcMs!).toBeGreaterThan(start.utcMs)
    // across the 1.5 km AOI, geometric sunset changes by less than 10 s
    const corner = gridToGeographic({ row: 0, col: 0 }, d.geometry)!
    const w2 = calculateDaylightWindow(start.utcMs, corner)
    expect(w2.status === 'ok' && Math.abs(w2.sunsetUtcMs! - w.sunsetUtcMs!)).toBeLessThan(10_000)
    evidence.daylight = {
      mission_start_utc: new Date(start.utcMs).toISOString(),
      mission_start_ltst: 9,
      sol_mars2020: t.status === 'ok' ? Math.floor(t.marsSolDate + habitat.lonEast / 360) - 52304 : null,
      ls_deg: +w.solarLongitudeDegAtNoon.toFixed(3),
      sunrise_utc: new Date(w.sunriseUtcMs!).toISOString(),
      sunset_utc: new Date(w.sunsetUtcMs!).toISOString(),
      sunrise_ltst_h: +w.sunriseLtstHours!.toFixed(4),
      sunset_ltst_h: +w.sunsetLtstHours!.toFixed(4),
      daylight_earth_h: +(w.daylightDurationS / 3600).toFixed(3),
      noon_elevation_deg: +w.noonElevationDeg.toFixed(2),
    }
  })

  it('8-12. duration, margin, assumption changes, mid-mission progress and frontend export', () => {
    const start = findUtcForLocalTrueSolarTime(habitat, 9, SCENARIO_DATE_UTC)
    if (start.status !== 'ok') throw new Error('start')
    const request = { habitat, habitatLabel: 'habitat', stops, assumptions: ASSUMPTIONS, missionStartUtcMs: start.utcMs }
    const t0 = performance.now()
    const plan = planMission(d, request)
    const planMs = performance.now() - t0
    expect(planMs).toBeLessThan(2000)
    for (const opt of [plan.shortest, plan.lowerSlope]) {
      expect(opt.route.status).toBe('ok')
      expect(opt.assessment.feasibility).toBe('feasible')
      const a = opt.assessment
      const dur = a.durations!
      expect(dur.totalS).toBeCloseTo(dur.outboundTravelS + dur.scienceS + dur.returnTravelS, 9)
      expect(dur.scienceS).toBe(50 * 60)
      if (opt.route.status === 'ok') {
        expect(dur.outboundTravelS + dur.returnTravelS).toBeCloseTo(opt.route.route.totals.surfaceDistanceM / 0.6, 6)
      }
      const expectedMargin = (a.window.closesUtcMs! - start.utcMs) / 1000 - dur.totalS - ASSUMPTIONS.reserveS
      expect(a.returnMarginS!).toBeCloseTo(expectedMargin, 6)
      expect(a.window.limitedBy).toBe('sunset')
    }
    expect(plan.comparison).not.toBeNull()

    // 10-11. changed assumptions update feasibility
    const opt = (p: ReturnType<typeof planMission>) => p.shortest.assessment
    const base = opt(plan)
    const moreScience = opt(planMission(d, { ...request, stops: [stops[0]!, { ...stops[1]!, activityDurationS: stops[1]!.activityDurationS + 3600 }] }))
    expect(base.returnMarginS! - moreScience.returnMarginS!).toBeCloseTo(3600, 6)
    const slower = opt(planMission(d, { ...request, assumptions: { ...ASSUMPTIONS, walkingSpeedMps: 0.3 } }))
    expect(slower.durations!.outboundTravelS).toBeCloseTo(2 * base.durations!.outboundTravelS, 6)
    const late = findUtcForLocalTrueSolarTime(habitat, 16.5, SCENARIO_DATE_UTC)
    if (late.status !== 'ok') throw new Error('late')
    const lateStart = opt(planMission(d, { ...request, missionStartUtcMs: late.utcMs }))
    expect(lateStart.feasibility).toBe('infeasible')
    expect(lateStart.bindingConstraint).toBe('daylight-margin')
    const night = findUtcForLocalTrueSolarTime(habitat, 23.5, SCENARIO_DATE_UTC)
    if (night.status !== 'ok') throw new Error('night')
    const nightStart = opt(planMission(d, { ...request, missionStartUtcMs: night.utcMs }))
    expect(nightStart.feasibility).toBe('infeasible')
    expect(nightStart.bindingConstraint).toBe('starts-in-daylight')
    const steepLimit = planMission(d, { ...request, assumptions: { ...ASSUMPTIONS, maxSlopeDeg: 3 } })
    expect(steepLimit.shortest.route.status === 'error' && steepLimit.shortest.route.code).toMatch(/NO_ROUTE|UNSUPPORTED_SLOPE/)
    expect(opt(steepLimit).feasibility).toBe('infeasible')
    const noSolar = evaluateMissionFeasibility({ route: plan.shortest.route, daylight: null, terrain: d, assumptions: ASSUMPTIONS, missionStartUtcMs: start.utcMs })
    expect(noSolar.feasibility).toBe('indeterminate')
    const unverified = evaluateMissionFeasibility({
      route: plan.shortest.route, daylight: plan.daylight, assumptions: ASSUMPTIONS, missionStartUtcMs: start.utcMs,
      terrain: { version: d.version, verification: { ...d.verification, verifiedForFeasibility: false, pipelineValidation: 'failed' } },
    })
    expect(unverified.feasibility).toBe('indeterminate')
    const outside = planMission(d, { ...request, habitat: { lonEast: 77.45, latNorth: 18.44 } })
    expect(outside.shortest.route.status === 'error' && outside.shortest.route.code).toBe('NO_COVERAGE')
    expect(opt(outside).feasibility).toBe('indeterminate')

    // mid-mission progression on the real timeline
    if (plan.shortest.route.status !== 'ok') throw new Error('route')
    const tl = buildMissionTimeline(plan.shortest.route.route, ASSUMPTIONS)
    if (tl.status !== 'ok') throw new Error('timeline')
    const asSim = (s: unknown) => s as SimulationState
    let sim = startSimulation(asSim(createSimulation(tl.timeline, 60)))
    sim = asSim(stepSimulation(sim, 30 * 60))
    let snap = getSimulationSnapshot(sim)
    const atProgress = (s: typeof snap) =>
      evaluateMissionFeasibility({ route: plan.shortest.route, daylight: plan.daylight, terrain: d, assumptions: ASSUMPTIONS, missionStartUtcMs: start.utcMs, progress: { elapsedS: s.elapsedS, remainingWorkS: s.remainingWorkS } })
    expect(atProgress(snap).returnMarginS!).toBeCloseTo(base.returnMarginS!, 6)
    sim = asSim(holdSimulation(sim, 20 * 60))
    snap = getSimulationSnapshot(sim)
    expect(base.returnMarginS! - atProgress(snap).returnMarginS!).toBeCloseTo(20 * 60, 6)
    const slowTl = buildMissionTimeline(plan.shortest.route.route, { ...ASSUMPTIONS, walkingSpeedMps: 0.4 })
    if (slowTl.status !== 'ok') throw new Error('timeline')
    sim = asSim(replanSimulation(sim, slowTl.timeline))
    const after = getSimulationSnapshot(sim)
    expect(after.remainingWorkS).toBeGreaterThan(snap.remainingWorkS)

    // 12. typed response survives JSON serialisation for the frontend / worker boundary
    const json = JSON.parse(JSON.stringify(plan)) as typeof plan
    expect(json.shortest.assessment.feasibility).toBe('feasible')
    expect(json.shortest.geojson!.features[0]!.geometry.coordinates[0]).toEqual([habitat.lonEast, habitat.latNorth])
    expect(json.provenance.map((p) => p.id)).toEqual(['science-target-locations', 'terrain-elevation', 'terrain-slope', 'route-astar', 'solar-mars24', 'mission-assumptions'])
    expect(json.disclaimer).toMatch(/Not for operational navigation/)

    const brief = (a: typeof base) => ({
      feasibility: a.feasibility,
      return_margin_min: a.returnMarginS === null ? null : +(a.returnMarginS / 60).toFixed(2),
      total_work_min: a.durations ? +(a.durations.totalS / 60).toFixed(2) : null,
      binding: a.bindingConstraint,
    })
    evidence.plan = {
      compute_ms_both_modes: +planMs.toFixed(1),
      assumptions: ASSUMPTIONS,
      shortest: brief(plan.shortest.assessment),
      lower_slope: brief(plan.lowerSlope.assessment),
      comparison: plan.comparison,
      variants: {
        science_plus_60_min: brief(moreScience),
        walking_speed_0_3: brief(slower),
        start_16_30_ltst: brief(lateStart),
        start_23_30_ltst: brief(nightStart),
        max_slope_3_deg: brief(opt(steepLimit)),
        no_solar_model: brief(noSolar),
        unverified_terrain: brief(unverified),
        habitat_outside_coverage: brief(opt(outside)),
      },
      mid_mission: {
        after_30_min_on_plan_margin_min: +(atProgress(getSimulationSnapshot(asSim(stepSimulation(startSimulation(asSim(createSimulation(tl.timeline))), 1800)))).returnMarginS! / 60).toFixed(2),
        after_20_min_hold_margin_min: +((base.returnMarginS! - 1200) / 60).toFixed(2),
        remaining_work_after_slowdown_min: +(after.remainingWorkS / 60).toFixed(2),
      },
      mars_hour_seconds: MARS_HOUR_SECONDS,
    }
    writeEvidence('integration_scenario.json', evidence)
  })
})
