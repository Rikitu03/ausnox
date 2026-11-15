import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MISSION_ASSUMPTIONS,
  FEASIBILITY_LABELS,
  buildMissionTimeline,
  calculateMissionDuration,
  createSimulation,
  evaluateMissionFeasibility,
  getSimulationSnapshot,
  holdSimulation,
  pauseSimulation,
  positionAlongVertices,
  replanSimulation,
  resetSimulation,
  resumeSimulation,
  setSimulationSpeed,
  startSimulation,
  stepSimulation,
  tickSimulation,
  validateMissionAssumptions,
  type FeasibilityInput,
  type MissionAssumptions,
  type MissionTimeline,
  type SimulationState,
} from '../src/index.js'
import { VERIFIED_TERRAIN, syntheticDaylight, syntheticRoundTrip } from './helpers/syntheticRoute.js'

// Exact arithmetic: 0.5 m/s, 500 m legs -> 1000 s each.
const A: MissionAssumptions = { ...DEFAULT_MISSION_ASSUMPTIONS, walkingSpeedMps: 0.5, reserveS: 1800, turnaroundWarningS: 900 }
const START = Date.UTC(2023, 0, 28, 14, 0, 0)
const route = (activityS = 1800) => syntheticRoundTrip({ outboundM: [500], returnM: 500, activityS: [activityS] })
// total work = 1000 + activity + 1000 s
const daylightFor = (sunsetOffsetS: number, startOffsetS = -3600) =>
  syntheticDaylight({ solStartUtcMs: START - 6 * 3600_000, sunriseUtcMs: START + startOffsetS * 1000, sunsetUtcMs: START + sunsetOffsetS * 1000, solEndUtcMs: START + 18 * 3600_000 })

const base = (over: Partial<FeasibilityInput> = {}): FeasibilityInput => ({
  route: { status: 'ok', route: route() },
  daylight: daylightFor(10_000),
  terrain: VERIFIED_TERRAIN(),
  assumptions: A,
  missionStartUtcMs: START,
  ...over,
})
const assess = (over: Partial<FeasibilityInput> = {}) => evaluateMissionFeasibility(base(over))

describe('mission timeline and duration', () => {
  it('T_mission = outbound + science + return, reserve excluded', () => {
    const r = syntheticRoundTrip({ outboundM: [300, 200], returnM: 450, activityS: [600, 1200] })
    const tl = buildMissionTimeline(r, A)
    expect(tl.status).toBe('ok')
    if (tl.status !== 'ok') return
    const t = tl.timeline
    expect(t.outboundTravelS).toBe(1000)
    expect(t.scienceS).toBe(1800)
    expect(t.returnTravelS).toBe(900)
    expect(t.totalS).toBe(3700)
    expect(t.phases.map((p) => p.kind)).toEqual(['travel-outbound', 'science', 'travel-outbound', 'science', 'travel-return'])
    expect(t.phases.map((p) => [p.startOffsetS, p.endOffsetS])).toEqual([[0, 600], [600, 1200], [1200, 1600], [1600, 2800], [2800, 3700]])
    const d = calculateMissionDuration(r, A)
    expect(d.status === 'ok' && d.totalS).toBe(3700)
  })

  it('lower walking speed increases travel time proportionally; route cost is not used', () => {
    const r = route()
    const fast = calculateMissionDuration(r, { ...A, walkingSpeedMps: 0.5 })
    const slow = calculateMissionDuration(r, { ...A, walkingSpeedMps: 0.25 })
    expect(fast.status === 'ok' && slow.status === 'ok').toBe(true)
    if (fast.status !== 'ok' || slow.status !== 'ok') return
    expect(slow.outboundTravelS + slow.returnTravelS).toBe(2 * (fast.outboundTravelS + fast.returnTravelS))
    expect(slow.scienceS).toBe(fast.scienceS)
    // a lower-slope route with a higher A* cost but the same length takes the same time
    const costly = { ...r, outboundSegments: r.outboundSegments.map((s) => ({ ...s, metrics: { ...s.metrics, totalCost: 5 * s.metrics.totalCost } })) }
    const same = calculateMissionDuration(costly, { ...A, walkingSpeedMps: 0.5 })
    expect(same.status === 'ok' && same.totalS).toBe(fast.totalS)
  })

  it('rejects invalid assumptions and activity durations', () => {
    expect(validateMissionAssumptions(DEFAULT_MISSION_ASSUMPTIONS)).toEqual([])
    for (const bad of [
      { walkingSpeedMps: 0 },
      { walkingSpeedMps: Number.NaN },
      { reserveS: -1 },
      { maxSlopeDeg: 80 },
      { maxEvaDurationS: 10 },
      { daylightPolicy: 'sometimes' as never },
      { turnaroundWarningS: Number.POSITIVE_INFINITY },
    ]) {
      expect(validateMissionAssumptions({ ...A, ...bad }).length, JSON.stringify(bad)).toBeGreaterThan(0)
      expect(buildMissionTimeline(route(), { ...A, ...bad }).status).toBe('error')
    }
    expect(validateMissionAssumptions(null)).toEqual(['mission assumptions are missing'])
    expect(buildMissionTimeline(route(13 * 3600), A).status).toBe('error')
    expect(buildMissionTimeline(route(-5), A).status).toBe('error')
  })

  it('interpolates the walker position along a leg', () => {
    const vs = syntheticRoundTrip({ outboundM: [500], returnM: 500, activityS: [0] }).outboundSegments[0]!.vertices
    expect(positionAlongVertices(vs, 250)!.projected.xM).toBe(250)
    expect(positionAlongVertices(vs, -5)!.surfaceDistanceM).toBe(0)
    expect(positionAlongVertices(vs, 9999)!.surfaceDistanceM).toBe(500)
    expect(positionAlongVertices([], 1)).toBeNull()
  })
})

describe('feasibility verdicts and return margin', () => {
  it('positive margin: feasible under selected assumptions', () => {
    const r = assess()
    expect(r.feasibility).toBe('feasible')
    expect(r.label).toBe(FEASIBILITY_LABELS.feasible)
    expect(r.durations!.totalS).toBe(3800)
    expect(r.returnMarginS).toBe(10_000 - 3800 - 1800)
    expect(r.window.limitedBy).toBe('sunset')
    expect(r.turnaroundWarning).toBe(false)
    expect(r.assumptions).toEqual(A)
    expect(r.provenance.category).toBe('simulated')
    expect(r.disclaimer).toMatch(/Not for operational navigation/)
  })

  it('margin exactly zero is feasible and raises the simulated turnaround warning', () => {
    const r = assess({ daylight: daylightFor(3800 + 1800) })
    expect(r.returnMarginS).toBe(0)
    expect(r.feasibility).toBe('feasible')
    expect(r.turnaroundWarning).toBe(true)
    expect(r.checks.find((c) => c.id === 'turnaround-warning')!.status).toBe('warning')
  })

  it('margin of -1 s is infeasible, with the binding constraint explained', () => {
    const r = assess({ daylight: daylightFor(3800 + 1800 - 1) })
    expect(r.returnMarginS).toBe(-1)
    expect(r.feasibility).toBe('infeasible')
    expect(r.bindingConstraint).toBe('daylight-margin')
    expect(r.explanation[0]).toMatch(/Short by/)
  })

  it('more science time, more reserve or a slower walk reduce the margin one-for-one', () => {
    const m0 = assess().returnMarginS!
    const sci = assess({ route: { status: 'ok', route: route(1800 + 600) } }).returnMarginS!
    const res = assess({ assumptions: { ...A, reserveS: A.reserveS + 600 } }).returnMarginS!
    const slow = assess({ assumptions: { ...A, walkingSpeedMps: 0.25 } }).returnMarginS!
    expect(m0 - sci).toBe(600)
    expect(m0 - res).toBe(600)
    expect(m0 - slow).toBe(2000)
    const flip = assess({ assumptions: { ...A, reserveS: A.reserveS + m0 + 1 } })
    expect(flip.feasibility).toBe('infeasible')
  })

  it('maximum EVA duration can be the binding window', () => {
    const r = assess({ assumptions: { ...A, maxEvaDurationS: 3800 + 1800 + 100 } })
    expect(r.window.limitedBy).toBe('max-eva')
    expect(r.returnMarginS).toBe(100)
    expect(r.feasibility).toBe('feasible')
    const over = assess({ assumptions: { ...A, maxEvaDurationS: 3800 + 1800 - 100 } })
    expect(over.feasibility).toBe('infeasible')
    expect(over.bindingConstraint).toBe('eva-margin')
  })

  it('starting in darkness is infeasible under the daylight-only policy (no automatic shift)', () => {
    const r = assess({ daylight: daylightFor(20_000, +600) })
    expect(r.feasibility).toBe('infeasible')
    expect(r.bindingConstraint).toBe('starts-in-daylight')
  })

  it('crossing the sol boundary uses absolute time, not 24-hour wrap arithmetic', () => {
    const solEnd = START + 18 * 3600_000
    const lateStart = solEnd - 30 * 60_000 // 30 min before local true midnight
    const r = evaluateMissionFeasibility({
      ...base(),
      missionStartUtcMs: lateStart,
      assumptions: { ...A, daylightPolicy: 'ignore-daylight', maxEvaDurationS: 3 * 3600 },
    })
    expect(r.feasibility).toBe('feasible')
    expect(r.returnMarginS).toBe(3 * 3600 - 3800 - 1800)
    expect(r.projectedReturnUtcMs).toBe(lateStart + 3800_000)
    expect(r.projectedReturnUtcMs!).toBeGreaterThan(solEnd) // the plan crosses into the next sol
    // the same start under the daylight-only policy is refused, not shifted to the next sunrise
    expect(evaluateMissionFeasibility({ ...base(), missionStartUtcMs: lateStart }).feasibility).toBe('infeasible')
  })

  it('polar night is infeasible; polar day has no sunset limit', () => {
    const night = syntheticDaylight({ solStartUtcMs: START - 6 * 3600_000, sunriseUtcMs: START, sunsetUtcMs: START, solEndUtcMs: START + 18 * 3600_000, kind: 'polar-night' })
    expect(assess({ daylight: night }).feasibility).toBe('infeasible')
    const day = syntheticDaylight({ solStartUtcMs: START - 6 * 3600_000, sunriseUtcMs: START, sunsetUtcMs: START, solEndUtcMs: START + 18 * 3600_000, kind: 'polar-day' })
    const r = assess({ daylight: day })
    expect(r.feasibility).toBe('feasible')
    expect(r.returnMarginS).toBeNull()
    expect(r.explanation.join(' ')).toMatch(/No time limit/)
  })

  it('missing or failed inputs are indeterminate, never feasible', () => {
    const cases: [string, Partial<FeasibilityInput>][] = [
      ['no route', { route: null }],
      ['route timeout', { route: { status: 'error', code: 'COMPUTATION_TIMEOUT', message: 't' } }],
      ['route cancelled', { route: { status: 'error', code: 'CANCELLED', message: 'c' } }],
      ['no daylight', { daylight: null }],
      ['solar epoch unsupported', { daylight: { status: 'error', code: 'UNSUPPORTED_EPOCH', message: 'e' } }],
      ['daylight for another sol', { daylight: syntheticDaylight({ solStartUtcMs: START + 3600_000, sunriseUtcMs: START + 2 * 3600_000, sunsetUtcMs: START + 9 * 3600_000, solEndUtcMs: START + 20 * 3600_000 }) }],
      ['no terrain', { terrain: null }],
      ['unverified terrain', { terrain: { version: 'synthetic-v1', verification: { ...VERIFIED_TERRAIN().verification, pipelineValidation: 'failed', verifiedForFeasibility: false } } }],
      ['stale dataset version', { terrain: VERIFIED_TERRAIN('other-version') }],
      ['stale slope limit', { assumptions: { ...A, maxSlopeDeg: 20 } }],
      ['invalid assumptions', { assumptions: { ...A, walkingSpeedMps: -1 } }],
      ['invalid start', { missionStartUtcMs: Number.NaN }],
      ['invalid progress', { progress: { elapsedS: -5, remainingWorkS: 10 } }],
    ]
    for (const [name, over] of cases) {
      const r = assess(over)
      expect(r.feasibility, name).toBe('indeterminate')
      expect(r.label).toBe('Indeterminate')
      expect(r.explanation.length, name).toBeGreaterThan(0)
    }
  })

  it('known violations outrank unknowns; NO_ROUTE and UNSUPPORTED_SLOPE are infeasible', () => {
    expect(assess({ route: { status: 'error', code: 'NO_ROUTE', message: 'n' } }).feasibility).toBe('infeasible')
    expect(assess({ route: { status: 'error', code: 'UNSUPPORTED_SLOPE', message: 's' } }).feasibility).toBe('infeasible')
    const both = assess({ route: { status: 'error', code: 'NO_ROUTE', message: 'n' }, daylight: null })
    expect(both.feasibility).toBe('infeasible')
  })

  it('mid-mission: on-plan progress keeps the margin; delays consume it', () => {
    const plan = assess()
    const onPlan = assess({ progress: { elapsedS: 1200, remainingWorkS: 3800 - 1200 } })
    expect(onPlan.returnMarginS).toBe(plan.returnMarginS)
    const delayed = assess({ progress: { elapsedS: 1500, remainingWorkS: 3800 - 1200 } })
    expect(plan.returnMarginS! - delayed.returnMarginS!).toBe(300)
    expect(delayed.evaluatedAtUtcMs).toBe(START + 1500_000)
    expect(delayed.remainingWorkS).toBe(2600)
  })
})

describe('simulation state machine', () => {
  const timeline = (): MissionTimeline => {
    const t = buildMissionTimeline(route(), A)
    if (t.status !== 'ok') throw new Error('timeline')
    return t.timeline
  }
  const ok = (s: SimulationState | { status: 'error' }): SimulationState => {
    if ((s as { status: string }).status === 'error') throw new Error(JSON.stringify(s))
    return s as SimulationState
  }

  it('start, tick, pause, resume, step, speed and reset', () => {
    let s = ok(createSimulation(timeline(), 60))
    expect(s.status).toBe('ready')
    expect(ok(tickSimulation(s, 1000)).elapsedS).toBe(0) // not running yet
    s = startSimulation(s)
    s = ok(tickSimulation(s, 10_000)) // 10 real s x 60 = 600 simulated s
    expect(s.elapsedS).toBe(600)
    let snap = getSimulationSnapshot(s)
    expect(snap.phase!.kind).toBe('travel-outbound')
    expect(snap.position).toEqual({ legId: 'outbound-1', surfaceDistanceM: 300 })
    expect(snap.remainingWorkS).toBe(3800 - 600)
    s = pauseSimulation(s)
    expect(ok(tickSimulation(s, 60_000)).elapsedS).toBe(600) // paused: no progress
    s = ok(stepSimulation(s, 400)) // manual step while paused
    snap = getSimulationSnapshot(s)
    expect(snap.phase!.kind).toBe('science')
    expect(snap.atStopId).toBe('stop-1')
    expect(snap.phaseFraction).toBe(0)
    s = resumeSimulation(s)
    expect(s.status).toBe('running')
    s = ok(setSimulationSpeed(s, 120))
    s = ok(tickSimulation(s, 15_000)) // 1800 simulated s of science
    expect(getSimulationSnapshot(s).phase!.kind).toBe('travel-return')
    s = ok(stepSimulation(s, 5000))
    expect(s.status).toBe('completed')
    expect(getSimulationSnapshot(s).remainingWorkS).toBe(0)
    expect(s.elapsedS).toBe(3800)
    s = resetSimulation(s)
    expect([s.status, s.elapsedS, s.phaseIndex]).toEqual(['ready', 0, 0])
    expect(ok(stepSimulation(s, 1)).status).toBe('paused')
  })

  it('holds consume time without progress and feed the margin', () => {
    let s = startSimulation(ok(createSimulation(timeline())))
    s = ok(stepSimulation(s, 1200))
    s = ok(holdSimulation(s, 300))
    const snap = getSimulationSnapshot(s)
    expect(s.elapsedS).toBe(1500)
    expect(snap.holdS).toBe(300)
    expect(snap.remainingWorkS).toBe(2600)
    const r = assess({ progress: { elapsedS: snap.elapsedS, remainingWorkS: snap.remainingWorkS } })
    expect(r.returnMarginS).toBe(assess().returnMarginS! - 300)
    expect(holdSimulation(ok(createSimulation(timeline())), 10).status).toBe('error')
  })

  it('replanning mid-mission recomputes the remaining work from the current position', () => {
    let s = startSimulation(ok(createSimulation(timeline())))
    s = ok(stepSimulation(s, 600)) // 300 m of 500 m walked
    const slower = buildMissionTimeline(route(), { ...A, walkingSpeedMps: 0.25 })
    if (slower.status !== 'ok') throw new Error('timeline')
    s = ok(replanSimulation(s, slower.timeline))
    const snap = getSimulationSnapshot(s)
    // 200 m left at 0.25 m/s + 1800 s science + 500 m at 0.25 m/s
    expect(snap.remainingWorkS).toBe(800 + 1800 + 2000)
    const changed = syntheticRoundTrip({ outboundM: [500, 100], returnM: 500, activityS: [1800, 60] })
    const other = buildMissionTimeline(changed, A)
    if (other.status !== 'ok') throw new Error('timeline')
    expect(replanSimulation(s, other.timeline).status).toBe('error')
  })

  it('validates inputs', () => {
    expect(createSimulation(timeline(), 0).status).toBe('error')
    expect(createSimulation(timeline(), 1e9).status).toBe('error')
    const s = ok(createSimulation(timeline()))
    expect(stepSimulation(s, -1).status).toBe('error')
    expect(tickSimulation(s, Number.NaN).status).toBe('error')
    expect(setSimulationSpeed(s, -2).status).toBe('error')
  })
})
