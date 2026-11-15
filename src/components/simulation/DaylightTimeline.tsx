import { useActiveResults } from '@/hooks/useActiveResults'
import { useSimulationSnapshot } from '@/hooks/useSimulation'
import { MARS_HOUR_SECONDS } from '@/services'
import { useMissionStore } from '@/stores/missionStore'
import { useSimStore } from '@/stores/simStore'
import { cn } from '@/utils/cn'
import { formatLtst } from '@/utils/format'

const pct = (hours: number) => `${Math.max(0, Math.min(100, (hours / 24) * 100))}%`

const PHASE_STYLE = {
  'travel-outbound': 'bg-out',
  science: 'bg-accent',
  'travel-return': 'bg-ret',
} as const

/**
 * The sol from midnight to midnight: a daylight band above, the mission plan
 * below, one cursor through both. This is the Ausnox signature: dawn to dusk.
 */
export function DaylightTimeline({ className, compact }: { className?: string; compact?: boolean }) {
  const solar = useMissionStore((s) => s.solar)
  const start = useMissionStore((s) => s.config.assumptions.startLtstHours)
  const { okAssessment, current } = useActiveResults()
  const snapshot = useSimulationSnapshot()
  const seek = useSimStore((s) => s.seek)
  const endS = useSimStore((s) => s.endS)

  const day = solar?.status === 'ok' ? solar.day : null
  const assessment = current ? okAssessment : null
  const at = (s: number) => start + s / MARS_HOUR_SECONDS

  const band = day
    ? `linear-gradient(90deg,
        var(--color-night) 0%,
        var(--color-night) ${pct(day.sunriseLtstHours - 1.1)},
        var(--color-dawn) ${pct(day.sunriseLtstHours)},
        var(--color-day) ${pct(day.sunriseLtstHours + 1.4)},
        var(--color-day) ${pct(day.sunsetLtstHours - 1.4)},
        var(--color-dawn) ${pct(day.sunsetLtstHours)},
        var(--color-night) ${pct(day.sunsetLtstHours + 1.1)},
        var(--color-night) 100%)`
    : undefined

  const summary = day
    ? `Modelled daylight from ${formatLtst(day.sunriseLtstHours)} to ${formatLtst(day.sunsetLtstHours)} local true solar time.` +
      (assessment?.totalMissionS != null
        ? ` Mission planned from ${formatLtst(start)} to ${formatLtst(at(assessment.totalMissionS))}.`
        : ' No mission plan to show.')
    : 'Daylight window unknown.'

  return (
    <div className={cn('min-w-0', className)}>
      <p className="sr-only">{summary}</p>
      <div
        className="relative cursor-pointer"
        aria-hidden
        onClick={(e) => {
          if (endS <= 0) return
          const rect = e.currentTarget.getBoundingClientRect()
          const hours = ((e.clientX - rect.left) / rect.width) * 24
          seek((hours - start) * MARS_HOUR_SECONDS)
        }}
      >
        {/* Daylight band */}
        <div
          className={cn('relative h-3 overflow-hidden rounded-full border border-line-strong', !day && 'hatch bg-raised')}
          style={{ background: band }}
        />
        {/* Mission lane */}
        <div className="relative mt-1.5 h-2 rounded-full bg-raised">
          {assessment?.phases.map((p) => (
            <span
              key={`${p.kind}-${p.startS}`}
              className={cn('absolute inset-y-0 rounded-[2px]', PHASE_STYLE[p.kind])}
              style={{ left: pct(at(p.startS)), width: `calc(${pct(at(p.endS))} - ${pct(at(p.startS))})` }}
            />
          ))}
          {assessment?.windowEndS != null && assessment.reserveS > 0 && (
            <span
              className="hatch absolute inset-y-0 rounded-[2px] border border-line-strong"
              style={{
                left: pct(at(assessment.windowEndS - assessment.reserveS)),
                width: `calc(${pct(at(assessment.windowEndS))} - ${pct(at(assessment.windowEndS - assessment.reserveS))})`,
              }}
            />
          )}
        </div>
        {/* Cursor */}
        {assessment && (
          <span
            className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-fg shadow-[0_0_0_1.5px_var(--color-bg)]"
            style={{ left: pct(snapshot.ltstHours) }}
          />
        )}
      </div>
      <div className="num relative mt-1.5 h-4 text-xs text-fg-3" aria-hidden>
        {(compact ? [0, 6, 12, 18, 24] : [0, 3, 6, 9, 12, 15, 18, 21, 24]).map((h) => (
          <span
            key={h}
            className={cn('absolute', h === 0 ? '' : h === 24 ? '-translate-x-full' : '-translate-x-1/2')}
            style={{ left: pct(h) }}
          >
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Key for the timeline. Words beside every colour and pattern. */
export function TimelineKey() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-fg-2">
      {[
        ['bg-out', 'Walk out'],
        ['bg-accent', 'Science'],
        ['bg-ret', 'Walk back'],
        ['hatch border border-line-strong', 'Reserve'],
      ].map(([cls, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className={cn('h-2 w-4 rounded-[2px]', cls)} aria-hidden />
          {label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="h-2 w-6 rounded-full" style={{ background: 'linear-gradient(90deg,var(--color-night),var(--color-dawn),var(--color-day))' }} aria-hidden />
        Night to day
      </li>
    </ul>
  )
}
