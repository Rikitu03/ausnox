import type { DemoScenario, ResultSource, ServiceError, ServiceErrorCode } from '@/services/contracts'

export const MOCK_VERSION = 'mock-0.1.0'

/** Conditions the mock adapters can be forced into, so every failure state can be exercised by hand. */
export const DEMO_SCENARIOS: DemoScenario[] = [
  { id: 'nominal', title: 'Nominal', description: 'All mock adapters respond normally' },
  {
    id: 'imagery-offline',
    title: 'Imagery requests fail',
    description: 'Layer imagery cannot be fetched. Terrain data, routing and timing keep working',
  },
  {
    id: 'terrain-missing',
    title: 'Terrain dataset missing',
    description: 'The terrain raster fails to load. Placement, routing and feasibility are blocked',
  },
  {
    id: 'solar-unavailable',
    title: 'Solar model unavailable',
    description: 'The daylight model returns an error. Feasibility becomes indeterminate',
  },
  {
    id: 'routing-timeout',
    title: 'Route calculation times out',
    description: 'The routing adapter gives up after its time budget',
  },
  {
    id: 'no-waypoints',
    title: 'No science waypoints',
    description: 'The science waypoint list comes back empty',
  },
]

let current = 'nominal'

export const getScenario = () => current
export const setScenario = (id: string) => {
  current = DEMO_SCENARIOS.some((s) => s.id === id) ? id : 'nominal'
}

/** Simulated network/compute latency. Zero under test so suites stay fast and deterministic. */
export const latency = { ms: import.meta.env.MODE === 'test' ? 0 : 420 }

export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const id = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(id)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

export const mockSource = (adapter: string, note: string): ResultSource => ({
  kind: 'mock',
  adapter,
  version: MOCK_VERSION,
  note,
})

export const mockError = (adapter: string, code: ServiceErrorCode, detail: string): ServiceError => ({
  status: 'error',
  code,
  detail,
  source: mockSource(adapter, 'Demonstration adapter response'),
})
