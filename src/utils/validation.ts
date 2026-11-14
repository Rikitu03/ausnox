import { ASSUMPTION_LIMITS, type CellValidity, type MissionConfig, type TerrainService } from '@/services/contracts'

export interface ValidationIssue {
  field: 'habitat' | 'destination' | 'stops' | 'assumptions'
  message: string
}

/** Plain-language reason a point cannot be used, or null when it can. */
export function validityIssue(validity: CellValidity): string | null {
  switch (validity) {
    case 'valid':
      return null
    case 'outside-coverage':
      return 'Outside terrain coverage. Elevation and slope are unknown here'
    case 'nodata':
      return 'No terrain data in this cell. It cannot be used for routing'
    case 'unavailable':
      return 'Terrain data is not loaded, so this location cannot be checked'
  }
}

const inRange = (v: number, limit: { min: number; max: number }) => Number.isFinite(v) && v >= limit.min && v <= limit.max

/** Everything that must hold before a mission calculation is requested. */
export function validateMission(config: MissionConfig, terrain: TerrainService): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!config.habitat) issues.push({ field: 'habitat', message: 'Set a habitat location' })
  else {
    const issue = validityIssue(terrain.sample(config.habitat.position).validity)
    if (issue) issues.push({ field: 'habitat', message: `Habitat: ${issue}` })
  }
  if (!config.destination) issues.push({ field: 'destination', message: 'Set a science destination' })
  else {
    const issue = validityIssue(terrain.sample(config.destination.position).validity)
    if (issue) issues.push({ field: 'destination', message: `Destination: ${issue}` })
    if (!inRange(config.destination.durationMin, ASSUMPTION_LIMITS.stopDurationMin)) {
      issues.push({ field: 'destination', message: 'Science time at the destination must be 0 to 240 min' })
    }
  }
  if (config.habitat && config.destination) {
    const d = Math.hypot(
      config.habitat.position.x - config.destination.position.x,
      config.habitat.position.y - config.destination.position.y,
    )
    if (d < 20) issues.push({ field: 'destination', message: 'Habitat and destination are in the same cell' })
  }
  for (const stop of config.stops) {
    const issue = validityIssue(terrain.sample(stop.position).validity)
    if (issue) issues.push({ field: 'stops', message: `${stop.label}: ${issue}` })
    if (!inRange(stop.durationMin, ASSUMPTION_LIMITS.stopDurationMin)) {
      issues.push({ field: 'stops', message: `${stop.label}: science time must be 0 to 240 min` })
    }
  }
  const a = config.assumptions
  if (!inRange(a.walkingSpeedMps, ASSUMPTION_LIMITS.walkingSpeedMps)) {
    issues.push({ field: 'assumptions', message: 'Walking speed must be 0.1 to 2 m/s' })
  }
  if (!inRange(a.maxSlopeDeg, ASSUMPTION_LIMITS.maxSlopeDeg)) {
    issues.push({ field: 'assumptions', message: 'Slope limit must be 2 to 30°' })
  }
  if (!inRange(a.reserveMin, ASSUMPTION_LIMITS.reserveMin)) {
    issues.push({ field: 'assumptions', message: 'Reserve must be 0 to 180 min' })
  }
  if (!inRange(a.startLtstHours, ASSUMPTION_LIMITS.startLtstHours)) {
    issues.push({ field: 'assumptions', message: 'Start time must be between 00:00 and 23:45' })
  }
  if (a.maxEvaEnabled && !inRange(a.maxEvaHours, ASSUMPTION_LIMITS.maxEvaHours)) {
    issues.push({ field: 'assumptions', message: 'Maximum EVA duration must be 1 to 12 h' })
  }
  if (!inRange(a.warningMarginMin, ASSUMPTION_LIMITS.warningMarginMin)) {
    issues.push({ field: 'assumptions', message: 'Warning threshold must be 0 to 120 min' })
  }
  return issues
}
