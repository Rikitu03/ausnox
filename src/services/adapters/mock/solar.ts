/**
 * DEMONSTRATION DAYLIGHT. Not Mars24 output.
 *
 * Three fixed sunrise/sunset pairs so the timeline, margin and feasibility UI
 * can be exercised. The real adapter computes these from the NASA GISS Mars24
 * equations and must pass the published worked examples first.
 */
import type { SolarDay, SolarScenario, SolarService } from '@/services/contracts'
import { getScenario, latency, mockError, mockSource, wait } from './scenario'

const DAYS: Record<string, Omit<SolarDay, 'scenarioId'> & SolarScenario> = {
  'demo-mid': {
    id: 'demo-mid',
    title: 'Demo day, 12 h of light',
    description: 'Sunrise 06:00, sunset 18:00 local true solar time',
    sunriseLtstHours: 6,
    sunsetLtstHours: 18,
    lsDeg: null,
    solLabel: 'Demo sol',
    mars24Validated: false,
    approximations: [],
  },
  'demo-short': {
    id: 'demo-short',
    title: 'Demo short day, 10 h of light',
    description: 'Sunrise 07:00, sunset 17:00 local true solar time',
    sunriseLtstHours: 7,
    sunsetLtstHours: 17,
    lsDeg: null,
    solLabel: 'Demo sol',
    mars24Validated: false,
    approximations: [],
  },
  'demo-long': {
    id: 'demo-long',
    title: 'Demo long day, 13 h of light',
    description: 'Sunrise 05:30, sunset 18:30 local true solar time',
    sunriseLtstHours: 5.5,
    sunsetLtstHours: 18.5,
    lsDeg: null,
    solLabel: 'Demo sol',
    mars24Validated: false,
    approximations: [],
  },
}

const APPROXIMATIONS = [
  'Fixed demonstration times. Not computed from date, season or location',
  'Flat horizon. No terrain shadows',
  'No dust, scattering or refraction',
]

export function createMockSolar(): SolarService {
  return {
    listScenarios: () => Object.values(DAYS).map(({ id, title, description }) => ({ id, title, description })),
    async getSolarDay(scenarioId) {
      await wait(latency.ms / 2)
      if (getScenario() === 'solar-unavailable') {
        return mockError(
          'mock-solar',
          'MODEL_UNAVAILABLE',
          'The daylight model could not run (demo scenario: solar model unavailable)',
        )
      }
      const day = DAYS[scenarioId]
      if (!day) return mockError('mock-solar', 'INVALID_INPUT', `Unknown daylight scenario "${scenarioId}"`)
      return {
        status: 'ok',
        source: mockSource('mock-solar', 'Fixed demonstration sunrise and sunset. Not a Mars24 calculation'),
        day: {
          scenarioId,
          sunriseLtstHours: day.sunriseLtstHours,
          sunsetLtstHours: day.sunsetLtstHours,
          lsDeg: null,
          solLabel: day.solLabel,
          mars24Validated: false,
          approximations: APPROXIMATIONS,
        },
      }
    },
  }
}
