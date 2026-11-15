/**
 * Simulated EVA assumptions. Every value is illustrative and user-adjustable;
 * none is a NASA operational or certified limit (SCIENTIFIC_MODELS.md §5).
 */
export type DaylightPolicy = 'daylight-only' | 'ignore-daylight'

export interface MissionAssumptions {
  /** Constant walking speed along the terrain surface, m/s. */
  readonly walkingSpeedMps: number
  /** Maximum traversable slope, degrees (also used by routing). */
  readonly maxSlopeDeg: number
  /** Time that must remain in hand before the window closes, Earth seconds. */
  readonly reserveS: number
  /** Optional maximum EVA duration, Earth seconds; null disables the limit. */
  readonly maxEvaDurationS: number | null
  /** 'daylight-only': the EVA must start after sunrise and end (with reserve) before sunset. */
  readonly daylightPolicy: DaylightPolicy
  /** Margin below which a simulated turnaround warning is raised, Earth seconds. */
  readonly turnaroundWarningS: number
}

/** Illustrative defaults from SCIENTIFIC_MODELS.md §5 (to be reviewed; not NASA values). */
export const DEFAULT_MISSION_ASSUMPTIONS: MissionAssumptions = Object.freeze({
  walkingSpeedMps: 0.6,
  maxSlopeDeg: 15,
  reserveS: 30 * 60,
  maxEvaDurationS: null,
  daylightPolicy: 'daylight-only',
  turnaroundWarningS: 15 * 60,
})

export const MISSION_ASSUMPTION_LIMITS = Object.freeze({
  walkingSpeedMps: { min: 0.05, max: 3 },
  maxSlopeDeg: { min: 1, max: 45 },
  reserveS: { min: 0, max: 6 * 3600 },
  maxEvaDurationS: { min: 600, max: 24 * 3600 },
  turnaroundWarningS: { min: 0, max: 6 * 3600 },
  activityDurationS: { min: 0, max: 12 * 3600 },
})

/** Returns a list of problems; empty means valid. */
export function validateMissionAssumptions(a: MissionAssumptions | null | undefined): string[] {
  if (!a || typeof a !== 'object') return ['mission assumptions are missing']
  const p: string[] = []
  const L = MISSION_ASSUMPTION_LIMITS
  const check = (name: string, v: unknown, lim: { min: number; max: number }, unit: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lim.min || v > lim.max) {
      p.push(`${name} must be between ${lim.min} and ${lim.max} ${unit}`)
    }
  }
  check('walkingSpeedMps', a.walkingSpeedMps, L.walkingSpeedMps, 'm/s')
  if (typeof a.walkingSpeedMps === 'number' && a.walkingSpeedMps <= 0) p.push('walkingSpeedMps must be positive')
  check('maxSlopeDeg', a.maxSlopeDeg, L.maxSlopeDeg, 'deg')
  check('reserveS', a.reserveS, L.reserveS, 's')
  check('turnaroundWarningS', a.turnaroundWarningS, L.turnaroundWarningS, 's')
  if (a.maxEvaDurationS !== null) check('maxEvaDurationS', a.maxEvaDurationS, L.maxEvaDurationS, 's')
  if (a.daylightPolicy !== 'daylight-only' && a.daylightPolicy !== 'ignore-daylight') {
    p.push('daylightPolicy must be "daylight-only" or "ignore-daylight"')
  }
  return p
}
