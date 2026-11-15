import { describe, expect, it } from 'vitest'
import { createMockServices } from '@/services/adapters/mock'
import { formatDistance, formatDuration, formatLtst, formatMargin } from '../format'
import { snapshotAt } from '../simulation'
import { validityIssue } from '../validation'

describe('format', () => {
  it('renders missing values as a dash, never as zero', () => {
    expect(formatDistance(null)).toBe('—')
    expect(formatDuration(undefined)).toBe('—')
    expect(formatMargin(NaN)).toBe('—')
    expect(formatLtst(null)).toBe('—')
  })
  it('formats distances, durations, margins and Mars clock time', () => {
    expect(formatDistance(640)).toBe('640 m')
    expect(formatDistance(5250)).toBe('5.25 km')
    expect(formatDuration(45 * 60)).toBe('45 min')
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe('2 h 05 min')
    expect(formatMargin(72 * 60)).toBe('+1 h 12 min')
    expect(formatMargin(-18 * 60)).toBe('−18 min')
    expect(formatLtst(9.5)).toBe('09:30')
    expect(formatLtst(25)).toBe('01:00')
    expect(formatLtst(13.5, true)).toBe('13:30:00')
  })
})

describe('validityIssue', () => {
  it('explains every non-valid state', () => {
    expect(validityIssue('valid')).toBeNull()
    expect(validityIssue('outside-coverage')).toMatch(/outside terrain coverage/i)
    expect(validityIssue('nodata')).toMatch(/no terrain data/i)
    expect(validityIssue('unavailable')).toMatch(/not loaded/i)
  })
})

describe('snapshotAt', () => {
  const setup = async () => {
    const s = createMockServices()
    s.demo!.set('nominal')
    await s.terrain.load()
    const route = await s.routing.computeRoundTrip({
      requestId: 'r',
      datasetId: 'd',
      habitat: { x: 700, y: 1500 },
      waypoints: [{ label: 'Destination', position: { x: 3290, y: 1930 } }],
      mode: 'shortest',
      maxSlopeDeg: 15,
    })
    const solar = await s.solar.getSolarDay('demo-mid', null)
    const config = {
      id: 'm',
      name: 'm',
      habitat: { id: 'habitat', label: 'Habitat', position: { x: 700, y: 1500 } },
      destination: { id: 'destination', label: 'Destination', position: { x: 3290, y: 1930 }, durationMin: 30, waypointId: null },
      stops: [],
      routeMode: 'shortest' as const,
      assumptions: { walkingSpeedMps: 0.6, maxSlopeDeg: 15, reserveMin: 30, startLtstHours: 13, maxEvaEnabled: false, maxEvaHours: 8, warningMarginMin: 30, solarScenarioId: 'demo-mid' },
    }
    const r = s.mission.assess({ config, route, solar })
    if (r.status !== 'ok' || route.status !== 'ok') throw new Error('setup failed')
    return { a: r.assessment, route: route.route }
  }

  it('walks out, stays at the destination for science, and returns to the habitat', async () => {
    const { a, route } = await setup()
    const start = snapshotAt(a, route, 0, 13)
    expect(start.status).toBe('not-started')
    expect(start.position).toEqual({ x: 700, y: 1500 })
    expect(start.ltstHours).toBe(13)

    const midOut = snapshotAt(a, route, a.outboundTravelS! / 2, 13)
    expect(midOut.phase?.kind).toBe('travel-outbound')
    expect(midOut.phaseProgress).toBeCloseTo(0.5, 6)
    expect(midOut.position!.x).toBeGreaterThan(700)
    expect(midOut.position!.x).toBeLessThan(3290)

    const science = snapshotAt(a, route, a.outboundTravelS! + 60, 13)
    expect(science.phase?.kind).toBe('science')
    expect(science.position!.x).toBeCloseTo(3290, 3)

    const done = snapshotAt(a, route, a.totalMissionS! + 1, 13)
    expect(done.status).toBe('complete')
    expect(done.position).toEqual({ x: 700, y: 1500 })
    expect(done.remainingWorkS).toBe(0)
  })

  it('keeps the margin constant on plan, then counts it down after the mission ends', async () => {
    const { a, route } = await setup()
    expect(snapshotAt(a, route, 600, 13).returnMarginS).toBeCloseTo(a.returnMarginS!, 6)
    expect(snapshotAt(a, route, a.totalMissionS! - 1, 13).returnMarginS).toBeCloseTo(a.returnMarginS!, 6)
    expect(snapshotAt(a, route, a.totalMissionS! + 600, 13).returnMarginS).toBeCloseTo(a.returnMarginS! - 600, 6)
    expect(snapshotAt(a, route, a.windowEndS! + 1, 13).pastWindow).toBe(true)
  })

  it('has no position or margin without a plan', () => {
    const snap = snapshotAt(null, null, 120, 9)
    expect(snap).toMatchObject({ status: 'not-started', position: null, returnMarginS: null, remainingWorkS: null })
  })
})
