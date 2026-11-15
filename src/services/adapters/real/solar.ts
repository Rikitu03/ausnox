/**
 * Real SolarService: NASA GISS Mars24 (Allison & McEwen 2000, revised) as implemented and validated by
 * the scientific engine (gate M1: LTST within 0.19 s, angles within 6.5e-4° of NASA's worked examples).
 *
 * A scenario fixes one local true sol at the habitat; sunrise and sunset are geometric (centre of the
 * Sun at 0° elevation, no refraction, dust, twilight or terrain horizon). This is a model of the sky,
 * not a weather forecast.
 */
import {
  calculateDaylightWindow,
  findUtcForSolarLongitude,
  type DaylightWindowResult,
  type EngineError,
} from '@ausnox/scientific-engine'
import type { SolarResult, SolarService } from '@/services/contracts'
import { SOLAR_SCENARIOS, type SolarScenarioConfig } from './config'
import { engineSource, type RealContext } from './context'
import { toServiceError } from './errors'

const source = engineSource('solar', 'Mars24 solar position (NASA GISS algorithm) with geometric sunrise and sunset at the habitat')

const lsCache = new Map<string, number | EngineError>()

/** The instant that fixes the sol of a scenario (cached; Ls scenarios are solved with Mars24). */
export function scenarioReferenceUtc(id: string): number | EngineError {
  const sc = SOLAR_SCENARIOS.find((s) => s.id === id)
  if (!sc) return { status: 'error', code: 'INVALID_INPUT', message: `Unknown daylight scenario "${id}"` }
  if (sc.kind === 'date') return sc.utcMs
  const cached = lsCache.get(sc.id)
  if (cached !== undefined) return cached
  const r = findUtcForSolarLongitude(sc.lsDeg, sc.nearUtcMs)
  const value = r.status === 'ok' ? r.utcMs : (r as EngineError)
  lsCache.set(sc.id, value)
  return value
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function solLabel(sc: SolarScenarioConfig, day: Extract<DaylightWindowResult, { status: 'ok' }>): string {
  const msd = Math.floor(day.marsSolDateAtNoon)
  const base = `MSD ${msd} · ${isoDate(day.solarNoonUtcMs)} UTC · Ls ${day.solarLongitudeDegAtNoon.toFixed(1)}°`
  return sc.kind === 'date' ? `${sc.title.split(' · ')[0]} · ${base}` : base
}

export function createRealSolar(ctx: RealContext): SolarService {
  return {
    listScenarios: () => SOLAR_SCENARIOS.map(({ id, title, description }) => ({ id, title, description })),

    async getSolarDay(scenarioId, at): Promise<SolarResult> {
      const keep = (r: SolarResult, daylight: DaylightWindowResult, referenceUtcMs: number) => {
        ctx.solarStash.set(r, { daylight, referenceUtcMs })
        return r
      }
      const sc = SOLAR_SCENARIOS.find((s) => s.id === scenarioId)
      const ref = scenarioReferenceUtc(scenarioId)
      if (!sc || typeof ref !== 'number') {
        const e = typeof ref === 'number' ? ({ status: 'error', code: 'INVALID_INPUT', message: 'Unknown scenario' } as const) : ref
        return toServiceError(e, source)
      }
      if (!at) {
        const e: EngineError = { status: 'error', code: 'INVALID_INPUT', message: 'No habitat location, so the daylight window cannot be computed' }
        return keep(toServiceError(e, source), e as DaylightWindowResult, ref)
      }
      const day = calculateDaylightWindow(ref, at)
      if (day.status === 'error') return keep(toServiceError(day, source), day, ref)
      if (day.kind !== 'normal' || day.sunriseLtstHours === null || day.sunsetLtstHours === null) {
        // Cannot occur at Jezero's latitude; reported rather than drawn as a 0-24 h window.
        const e: EngineError = {
          status: 'error',
          code: 'MODEL_FAILURE',
          message: `The Sun ${day.kind === 'polar-day' ? 'does not set' : 'does not rise'} on this sol at this location`,
        }
        return keep(toServiceError(e, source), day, ref)
      }
      const approximations = [...day.approximations]
      if (day.ttMinusUtcExtrapolated) approximations.push('TT − UTC extrapolated beyond the IERS leap-second table (after 2027-06-30)')
      return keep(
        {
          status: 'ok',
          source,
          day: {
            scenarioId,
            sunriseLtstHours: day.sunriseLtstHours,
            sunsetLtstHours: day.sunsetLtstHours,
            lsDeg: day.solarLongitudeDegAtNoon,
            solLabel: solLabel(sc, day),
            mars24Validated: true,
            approximations,
          },
        },
        day,
        ref,
      )
    },
  }
}
