import { beforeEach, describe, expect, it, vi } from 'vitest'
import { services } from '@/services'
import { useDataStore } from '../dataStore'
import { useMissionStore } from '../missionStore'
import { useSimStore } from '../simStore'
import { useUiStore } from '../uiStore'

const settle = () => vi.waitFor(() => expect(useMissionStore.getState()).toMatchObject({ status: 'done', stale: false }))

beforeEach(async () => {
  services.demo!.set('nominal')
  useMissionStore.getState().reset()
  useUiStore.setState({ placement: null, placementIssue: null, coordinateEntry: null })
  await useDataStore.getState().init()
})

describe('mission store', () => {
  it('loads the sample mission and calculates both route modes', async () => {
    useMissionStore.getState().loadDemo()
    expect(useMissionStore.getState().status).toBe('calculating')
    await settle()
    const s = useMissionStore.getState()
    expect(s.isDemo).toBe(true)
    expect(s.routes.shortest?.status).toBe('ok')
    expect(s.routes['lower-slope']?.status).toBe('ok')
    expect(s.assessments.shortest).toMatchObject({ status: 'ok', assessment: { feasibility: 'feasible' } })
  })

  it('refuses to calculate an incomplete mission and says why', async () => {
    await useMissionStore.getState().calculate()
    const s = useMissionStore.getState()
    expect(s.status).toBe('idle')
    expect(s.issues.map((i) => i.message)).toEqual(['Set a habitat location', 'Set a science destination'])
  })

  it('marks results stale on edit, then recalculates with the new inputs', async () => {
    useMissionStore.getState().loadDemo()
    await settle()
    const before = useMissionStore.getState().assessments.shortest
    useMissionStore.getState().setStopDuration('destination', 240)
    expect(useMissionStore.getState().stale).toBe(true)
    await settle()
    const after = useMissionStore.getState().assessments.shortest
    expect(after).not.toBe(before)
    expect(after).toMatchObject({ status: 'ok', assessment: { feasibility: 'infeasible' } })
  })

  it('keeps only the result of the latest request', async () => {
    useMissionStore.getState().loadDemo()
    // Edit while the first calculation is still in flight.
    useMissionStore.getState().setAssumption('maxSlopeDeg', 6)
    await settle()
    const s = useMissionStore.getState()
    expect(s.config.assumptions.maxSlopeDeg).toBe(6)
    expect(s.routes.shortest).toMatchObject({ status: 'error', code: 'UNSUPPORTED_SLOPE' })
    expect(s.assessments.shortest).toMatchObject({ assessment: { feasibility: 'infeasible' } })
  })

  it('switches route mode without recalculating', async () => {
    useMissionStore.getState().loadDemo()
    await settle()
    const routes = useMissionStore.getState().routes
    useMissionStore.getState().setRouteMode('lower-slope')
    const s = useMissionStore.getState()
    expect(s.stale).toBe(false)
    expect(s.routes).toBe(routes)
    expect(s.config.routeMode).toBe('lower-slope')
  })

  it('adds and removes science stops', async () => {
    useMissionStore.getState().loadDemo()
    await settle()
    useMissionStore.getState().addStop({ x: 1950, y: 1450 }, 'Sampling stop B', 'wp-b', 15)
    await settle()
    let s = useMissionStore.getState()
    expect(s.config.stops).toHaveLength(1)
    if (s.routes.shortest?.status !== 'ok') throw new Error('expected a route')
    expect(s.routes.shortest.route.outbound.waypointDistancesM.map((w) => w.label)).toEqual(['Sampling stop B', 'Sampling stop A'])
    useMissionStore.getState().removeStop(s.config.stops[0]!.id)
    await settle()
    s = useMissionStore.getState()
    expect(s.config.stops).toHaveLength(0)
  })

  it('becomes indeterminate when the solar model is unavailable', async () => {
    services.demo!.set('solar-unavailable')
    useMissionStore.getState().loadDemo()
    await settle()
    expect(useMissionStore.getState().assessments.shortest).toMatchObject({ assessment: { feasibility: 'indeterminate' } })
  })

  it('refuses to calculate when terrain is missing', async () => {
    services.demo!.set('terrain-missing')
    await useDataStore.getState().init()
    expect(useDataStore.getState().terrainError).toMatchObject({ code: 'DATA_UNAVAILABLE' })
    useMissionStore.getState().loadDemo()
    await vi.waitFor(() => expect(useMissionStore.getState().issues.length).toBeGreaterThan(0))
    expect(useMissionStore.getState().issues[0]!.message).toMatch(/terrain data is not loaded/i)
    expect(useMissionStore.getState().routes).toEqual({})
  })
})

describe('placement', () => {
  it('accepts a valid cell', () => {
    const ok = useUiStore.getState().attemptPlace('habitat', { x: 900, y: 1600 })
    expect(ok).toBe(true)
    expect(useMissionStore.getState().config.habitat?.position).toEqual({ x: 900, y: 1600 })
  })

  it('rejects an unsupported location and only snaps after confirmation', () => {
    const ok = useUiStore.getState().attemptPlace('habitat', { x: 1500, y: 2080 })
    expect(ok).toBe(false)
    expect(useMissionStore.getState().config.habitat).toBeNull()
    const issue = useUiStore.getState().placementIssue!
    expect(issue.validity).toBe('nodata')
    expect(issue.snap).not.toBeNull()

    useUiStore.getState().confirmSnap()
    expect(useMissionStore.getState().config.habitat?.position).toEqual(issue.snap)
    expect(useUiStore.getState().placementIssue).toBeNull()
  })

  it('offers no snap far outside coverage', () => {
    useUiStore.getState().attemptPlace('destination', { x: -3000, y: -3000 })
    expect(useUiStore.getState().placementIssue).toMatchObject({ validity: 'outside-coverage', snap: null })
    expect(useMissionStore.getState().config.destination).toBeNull()
  })
})

describe('simulation clock', () => {
  beforeEach(() => {
    useSimStore.setState({ simS: 0, playing: false, speed: 300, endS: 0 })
  })

  it('cannot start without a plan', () => {
    useSimStore.getState().play()
    expect(useSimStore.getState().playing).toBe(false)
  })

  it('plays, pauses, steps, clamps and resets', () => {
    const sim = useSimStore.getState()
    sim.setEnd(1000)
    sim.play()
    useSimStore.getState().tick(1)
    expect(useSimStore.getState().simS).toBe(300)
    useSimStore.getState().pause()
    useSimStore.getState().tick(1)
    expect(useSimStore.getState().simS).toBe(300)
    useSimStore.getState().step(300)
    expect(useSimStore.getState().simS).toBe(600)
    useSimStore.getState().step(-5000)
    expect(useSimStore.getState().simS).toBe(0)
    useSimStore.getState().play()
    useSimStore.getState().tick(60)
    expect(useSimStore.getState()).toMatchObject({ simS: 1000, playing: false })
    useSimStore.getState().reset()
    expect(useSimStore.getState()).toMatchObject({ simS: 0, playing: false })
  })
})
