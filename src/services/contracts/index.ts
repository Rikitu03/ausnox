import type { DataMode } from './common'
import type { MissionService } from './feasibility'
import type { MapDataService } from './map'
import type { RoutingService } from './routing'
import type { SolarService } from './solar'
import type { TerrainService } from './terrain'

export * from './common'
export * from './feasibility'
export * from './geo'
export * from './map'
export * from './mission'
export * from './routing'
export * from './solar'
export * from './terrain'

/** A named condition the mock adapters can be put into, to exercise failure states. */
export interface DemoScenario {
  id: string
  title: string
  description: string
}

/** Only mock adapters provide this. Real adapters leave it undefined. */
export interface DemoControls {
  scenarios: DemoScenario[]
  get(): string
  set(id: string): void
}

/** Everything the UI needs from the data and science layer. */
export interface AusnoxServices {
  mode: DataMode
  terrain: TerrainService
  mapData: MapDataService
  routing: RoutingService
  solar: SolarService
  mission: MissionService
  demo?: DemoControls
}
