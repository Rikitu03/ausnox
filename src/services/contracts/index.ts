import type { DataMode } from './common'
import type { MissionService } from './feasibility'
import type { GridCoord } from './geo'
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

/** A ready-made mission for the "Load sample" action. Positions are grid metres of the active terrain. */
export interface SampleMission {
  id: string
  name: string
  /** One sentence on where the sample comes from, shown with it. */
  description: string
  habitat: GridCoord
  /** Intermediate stops in visiting order. */
  stops: { label: string; position: GridCoord; durationMin: number; waypointId: string | null }[]
  /**
   * The requested destination. It goes through the same placement check as a click: when it is not
   * usable under the mission slope limit, the user is shown the nearest usable cell and must confirm it.
   */
  destination: { label: string; position: GridCoord; durationMin: number; waypointId: string | null }
  solarScenarioId?: string
  startLtstHours?: number
}

/** Everything the UI needs from the data and science layer. */
export interface AusnoxServices {
  mode: DataMode
  terrain: TerrainService
  mapData: MapDataService
  routing: RoutingService
  solar: SolarService
  mission: MissionService
  /** The sample mission for this data mode, or null while terrain is not loaded. */
  sampleMission(): SampleMission | null
  demo?: DemoControls
}
