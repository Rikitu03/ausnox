/**
 * Demonstration feasibility assessment.
 *
 * Follows the timing rules in docs/SCIENTIFIC_MODELS.md §5 and §7 with constant
 * walking speed. It is plain arithmetic over whatever route and daylight inputs
 * it is given, so with mock inputs the outcome is a demonstration, not a
 * validated mission-feasibility result.
 */
import {
  ASSUMPTION_LIMITS,
  MARS_HOUR_SECONDS,
  type ConstraintViolation,
  type MissionAssessment,
  type MissionEvent,
  type MissionService,
  type TimelinePhase,
} from '@/services/contracts'
import { formatDuration, formatLtst } from '@/utils/format'
import { mockSource } from './scenario'

export function createMockMission(): MissionService {
  return {
    assess({ config, route, solar }) {
      const a = config.assumptions
      const violations: ConstraintViolation[] = []
      const stops = [...config.stops, ...(config.destination ? [config.destination] : [])]
      const scienceS = stops.reduce((sum, s) => sum + s.durationMin * 60, 0)
      const reserveS = a.reserveMin * 60

      const assumptionsValid =
        Number.isFinite(a.walkingSpeedMps) &&
        a.walkingSpeedMps >= ASSUMPTION_LIMITS.walkingSpeedMps.min &&
        Number.isFinite(a.reserveMin) &&
        a.reserveMin >= 0 &&
        Number.isFinite(a.startLtstHours) &&
        a.startLtstHours >= 0 &&
        a.startLtstHours < 24 &&
        stops.every((s) => Number.isFinite(s.durationMin) && s.durationMin >= 0)
      if (!assumptionsValid) {
        violations.push({
          code: 'INVALID_ASSUMPTION',
          severity: 'unknown',
          title: 'An assumption is out of range',
          detail: 'Walking speed, reserve, start time and science durations must be valid numbers',
        })
      }

      let outboundTravelS: number | null = null
      let returnTravelS: number | null = null
      const phases: TimelinePhase[] = []
      const events: MissionEvent[] = []

      if (!route) {
        violations.push({
          code: 'MISSING_ROUTE',
          severity: 'unknown',
          title: 'No route calculated',
          detail: 'Set a habitat and a destination, then calculate the mission',
        })
      } else if (route.status === 'error') {
        if (route.code === 'UNSUPPORTED_SLOPE') {
          violations.push({ code: 'TERRAIN_SLOPE', severity: 'violation', title: 'Terrain exceeds the slope limit', detail: route.detail })
        } else if (route.code === 'NO_ROUTE') {
          violations.push({ code: 'NO_ROUTE', severity: 'violation', title: 'No route found', detail: route.detail })
        } else if (route.code === 'DATA_UNAVAILABLE') {
          violations.push({ code: 'MISSING_TERRAIN', severity: 'unknown', title: 'Terrain data unavailable', detail: route.detail })
        } else {
          violations.push({ code: 'MISSING_ROUTE', severity: 'unknown', title: 'Route could not be calculated', detail: route.detail })
        }
      } else if (assumptionsValid) {
        const { outbound, inbound } = route.route
        outboundTravelS = outbound.distanceM / a.walkingSpeedMps
        returnTravelS = inbound.distanceM / a.walkingSpeedMps
        let t = 0
        let fromM = 0
        events.push({ atS: 0, kind: 'depart', label: 'Leave habitat' })
        outbound.waypointDistancesM.forEach((wp, i) => {
          const travel = (wp.distanceM - fromM) / a.walkingSpeedMps
          phases.push({
            kind: 'travel-outbound',
            label: `Walk to ${wp.label}`,
            startS: t,
            endS: t + travel,
            fromDistanceM: fromM,
            toDistanceM: wp.distanceM,
          })
          t += travel
          fromM = wp.distanceM
          events.push({ atS: t, kind: 'arrive', label: `Arrive at ${wp.label}` })
          const science = (stops[i]?.durationMin ?? 0) * 60
          if (science > 0) {
            phases.push({ kind: 'science', label: `Science at ${wp.label}`, startS: t, endS: t + science, fromDistanceM: null, toDistanceM: null })
            t += science
            events.push({ atS: t, kind: 'science-complete', label: `Science complete at ${wp.label}` })
          }
        })
        phases.push({
          kind: 'travel-return',
          label: 'Walk back to habitat',
          startS: t,
          endS: t + returnTravelS,
          fromDistanceM: 0,
          toDistanceM: inbound.distanceM,
        })
        t += returnTravelS
        events.push({ atS: t, kind: 'return-habitat', label: 'Back at habitat' })
      }

      const totalMissionS = outboundTravelS !== null && returnTravelS !== null ? outboundTravelS + returnTravelS + scienceS : null

      let windowEndS: number | null = null
      let windowLimitedBy: MissionAssessment['windowLimitedBy'] = null
      if (!solar || solar.status === 'error') {
        violations.push({
          code: 'MISSING_SOLAR',
          severity: 'unknown',
          title: 'Daylight window unknown',
          detail: solar ? solar.detail : 'The daylight model has not returned a result',
        })
      } else if (assumptionsValid) {
        const { sunriseLtstHours: rise, sunsetLtstHours: set } = solar.day
        // Mars clock hours are converted to Earth seconds before any comparison with walking time.
        windowEndS = (set - a.startLtstHours) * MARS_HOUR_SECONDS
        windowLimitedBy = 'sunset'
        if (a.startLtstHours < rise || a.startLtstHours >= set) {
          violations.push({
            code: 'STARTS_IN_DARKNESS',
            severity: 'violation',
            title: 'Mission starts outside daylight',
            detail: `Start ${formatLtst(a.startLtstHours)} is outside the modelled daylight window ${formatLtst(rise)} to ${formatLtst(set)}. The start is not shifted automatically`,
          })
        }
        if (a.maxEvaEnabled && a.maxEvaHours * 3600 < windowEndS) {
          windowEndS = a.maxEvaHours * 3600
          windowLimitedBy = 'max-eva'
        }
      }

      let returnMarginS: number | null = null
      if (totalMissionS !== null && windowEndS !== null) {
        returnMarginS = windowEndS - totalMissionS - reserveS
        events.push({ atS: windowEndS - reserveS, kind: 'reserve-starts', label: 'Reserve begins' })
        events.push({
          atS: windowEndS,
          kind: 'window-ends',
          label: windowLimitedBy === 'sunset' ? 'Geometric sunset' : 'Maximum EVA duration reached',
        })
        const limit = windowLimitedBy === 'sunset' ? 'sunset' : 'the maximum EVA duration'
        if (returnMarginS < 0) {
          violations.push({
            code: 'RETURN_MARGIN',
            severity: 'violation',
            title: 'Not enough time to return',
            detail: `The mission needs ${formatDuration(totalMissionS)} plus a ${formatDuration(reserveS)} reserve, but only ${formatDuration(Math.max(0, windowEndS))} remain before ${limit}. Short by ${formatDuration(-returnMarginS)}`,
          })
        } else if (returnMarginS < a.warningMarginMin * 60) {
          violations.push({
            code: 'LOW_MARGIN',
            severity: 'warning',
            title: 'Return margin is thin',
            detail: `Only ${formatDuration(returnMarginS)} spare after the reserve, below the ${a.warningMarginMin} min warning threshold`,
          })
        }
      }
      events.sort((x, y) => x.atS - y.atS)

      const feasibility = violations.some((v) => v.severity === 'violation')
        ? 'infeasible'
        : violations.some((v) => v.severity === 'unknown')
          ? 'indeterminate'
          : 'feasible'

      return {
        status: 'ok',
        source: mockSource(
          'mock-mission',
          'Timing arithmetic over demonstration route and daylight inputs. Not a validated feasibility result',
        ),
        assessment: {
          feasibility,
          outboundTravelS,
          returnTravelS,
          scienceS,
          totalMissionS,
          reserveS,
          windowEndS,
          windowLimitedBy,
          returnMarginS,
          phases,
          events,
          violations,
          assumptionsUsed: { ...a },
        },
      }
    },
  }
}
