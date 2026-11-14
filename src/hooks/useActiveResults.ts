import { useMemo } from 'react'
import { useMissionStore } from '@/stores/missionStore'

/** Route and assessment for the route mode selected in the planner. */
export function useActiveResults() {
  const route = useMissionStore((s) => s.routes[s.config.routeMode] ?? null)
  const assessment = useMissionStore((s) => s.assessments[s.config.routeMode] ?? null)
  const status = useMissionStore((s) => s.status)
  const stale = useMissionStore((s) => s.stale)
  return useMemo(
    () => ({
      route,
      okRoute: route?.status === 'ok' ? route.route : null,
      assessment,
      okAssessment: assessment?.status === 'ok' ? assessment.assessment : null,
      status,
      stale,
      /** Results exist and reflect the current inputs. */
      current: status === 'done' && !stale,
    }),
    [route, assessment, status, stale],
  )
}
