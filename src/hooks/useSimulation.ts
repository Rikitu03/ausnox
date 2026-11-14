import { useEffect, useMemo } from 'react'
import { useMissionStore } from '@/stores/missionStore'
import { useSimStore } from '@/stores/simStore'
import { snapshotAt } from '@/utils/simulation'
import { useActiveResults } from './useActiveResults'

/**
 * Keeps the simulated clock in step with the mission: sets its end, pauses and
 * rewinds it when inputs change, and drives playback. Mount once.
 */
export function useSimulationClock() {
  const { okAssessment, current } = useActiveResults()
  const playing = useSimStore((s) => s.playing)

  const endS = current && okAssessment?.totalMissionS != null
    ? Math.max(okAssessment.totalMissionS, okAssessment.windowEndS ?? 0)
    : 0

  useEffect(() => {
    // New or missing results: the old timeline no longer applies.
    useSimStore.getState().reset()
    useSimStore.getState().setEnd(endS)
  }, [endS, okAssessment])

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      useSimStore.getState().tick((now - last) / 1000)
      last = now
    }, 100)
    return () => clearInterval(id)
  }, [playing])
}

/** Snapshot of the simulated mission at the current clock time. */
export function useSimulationSnapshot() {
  const { okAssessment, okRoute, current } = useActiveResults()
  const simS = useSimStore((s) => s.simS)
  const startLtstHours = useMissionStore((s) => s.config.assumptions.startLtstHours)
  return useMemo(
    () => snapshotAt(current ? okAssessment : null, current ? okRoute : null, simS, startLtstHours),
    [current, okAssessment, okRoute, simS, startLtstHours],
  )
}
