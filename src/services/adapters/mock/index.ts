import type { AusnoxServices } from '@/services/contracts'
import { createMockMapData } from './mapData'
import { createMockMission } from './mission'
import { createMockRouting } from './routing'
import { DEMO_SCENARIOS, getScenario, setScenario } from './scenario'
import { createMockSolar } from './solar'
import { createMockTerrain } from './terrain'

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
    demo: { scenarios: DEMO_SCENARIOS, get: getScenario, set: setScenario },
  }
}
