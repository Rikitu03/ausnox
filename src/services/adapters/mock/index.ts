import type { AusnoxServices, SampleMission } from '@/services/contracts'
import { createMockMapData } from './mapData'
import { createMockMission } from './mission'
import { createMockRouting } from './routing'
import { DEMO_SCENARIOS, getScenario, setScenario } from './scenario'
import { createMockSolar } from './solar'
import { createMockTerrain } from './terrain'

/** First-run sample. Both points sit on valid cells of the illustrative demo terrain. */
const MOCK_SAMPLE_MISSION: SampleMission = {
  id: 'demo-marswalk-01',
  name: 'Demo Marswalk 01',
  description: 'Demonstration mission on the synthetic illustrative surface. Not Mars data',
  habitat: { x: 700, y: 1500 },
  stops: [],
  destination: { label: 'Sampling stop A', position: { x: 3290, y: 1930 }, durationMin: 30, waypointId: 'wp-a' },
}

/** Deterministic demonstration adapters. Everything they return is labelled as mock. */
export function createMockServices(): AusnoxServices {
  const terrain = createMockTerrain()
  return {
    mode: 'mock',
    terrain,
    mapData: createMockMapData(terrain),
    routing: createMockRouting(terrain),
    solar: createMockSolar(),
    mission: createMockMission(),
    sampleMission: () => MOCK_SAMPLE_MISSION,
    demo: { scenarios: DEMO_SCENARIOS, get: getScenario, set: setScenario },
  }
}
