import type { Result } from './common'
import type { MissionAssumptions, MissionConfig } from './mission'
import type { RouteResult } from './routing'
import type { SolarResult } from './solar'

/** docs/SCIENTIFIC_MODELS.md §7. Always read as "under selected assumptions". */
export type Feasibility = 'feasible' | 'infeasible' | 'indeterminate'

export interface TimelinePhase {
  kind: 'travel-outbound' | 'science' | 'travel-return'
  label: string
  /** Earth seconds from mission start. */
  startS: number
  endS: number
  /** Distance window along the leg covered by a travel phase, metres. */
  fromDistanceM: number | null
  toDistanceM: number | null
}

export interface MissionEvent {
  /** Earth seconds from mission start. */
  atS: number
  kind: 'depart' | 'arrive' | 'science-complete' | 'return-habitat' | 'reserve-starts' | 'window-ends'
  label: string
}

export interface ConstraintViolation {
  code:
    | 'RETURN_MARGIN'
    | 'STARTS_IN_DARKNESS'
    | 'TERRAIN_SLOPE'
    | 'NO_ROUTE'
    | 'MISSING_ROUTE'
    | 'MISSING_TERRAIN'
    | 'MISSING_SOLAR'
    | 'INVALID_ASSUMPTION'
    | 'LOW_MARGIN'
  /** `violation` makes the mission infeasible, `unknown` makes it indeterminate, `warning` does neither. */
  severity: 'violation' | 'unknown' | 'warning'
  title: string
  detail: string
}

export interface MissionAssessment {
  feasibility: Feasibility
  outboundTravelS: number | null
  returnTravelS: number | null
  scienceS: number
  /** Both legs plus science. The reserve is tracked separately. */
  totalMissionS: number | null
  reserveS: number
  /** End of the usable window, Earth seconds from mission start. */
  windowEndS: number | null
  windowLimitedBy: 'sunset' | 'max-eva' | null
  /** window end − mission end − reserve, at the planned start. Negative means the plan does not fit. */
  returnMarginS: number | null
  phases: TimelinePhase[]
  events: MissionEvent[]
  violations: ConstraintViolation[]
  assumptionsUsed: MissionAssumptions
}

export type AssessmentResult = Result<{ assessment: MissionAssessment }>

export interface MissionService {
  /** Missing or failed inputs must produce `indeterminate`, never a favourable guess. */
  assess(input: { config: MissionConfig; route: RouteResult | null; solar: SolarResult | null }): AssessmentResult
}
