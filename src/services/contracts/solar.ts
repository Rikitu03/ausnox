import type { Result } from './common'
import type { GeoCoord } from './geo'

/** Seconds of Earth time in one Martian sol (NASA Mars24 reference value). */
export const SOL_SECONDS = 88775.244
/** Earth seconds in one Mars clock hour (1/24 sol). */
export const MARS_HOUR_SECONDS = SOL_SECONDS / 24

export interface SolarScenario {
  id: string
  title: string
  description: string
}

export interface SolarDay {
  scenarioId: string
  /** Mars clock hours, local true solar time. */
  sunriseLtstHours: number
  sunsetLtstHours: number
  /** Areocentric solar longitude, degrees. Null when the adapter does not model season. */
  lsDeg: number | null
  solLabel: string
  /** True only when the values were produced by a Mars24-validated model. */
  mars24Validated: boolean
  approximations: string[]
}

export type SolarResult = Result<{ day: SolarDay }>

export interface SolarService {
  listScenarios(): SolarScenario[]
  getSolarDay(scenarioId: string, at: GeoCoord | null): Promise<SolarResult>
}
