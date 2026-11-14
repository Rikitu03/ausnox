import { Timer } from 'lucide-react'
import { EmptyState, FEASIBILITY, PanelHeader, Section, Stat, StatusAlert } from '@/components/layout/primitives'
import { SourceBadge } from '@/components/provenance/Provenance'
import { TimelineKey } from '@/components/simulation/DaylightTimeline'
import { SimulatedTag, SpeedControl, TransportControls } from '@/components/simulation/SimControls'
import { Button } from '@/components/ui/button'
import { useActiveResults } from '@/hooks/useActiveResults'
import { useSimulationSnapshot } from '@/hooks/useSimulation'
import { MARS_HOUR_SECONDS } from '@/services'
import { useMissionStore } from '@/stores/missionStore'
import { useSimStore } from '@/stores/simStore'
import { useUiStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'
import { formatDuration, formatLtst, formatMargin } from '@/utils/format'

function NoPlan() {
  const setView = useUiStore((s) => s.setView)
  const { status, stale } = useActiveResults()
  return (
    <EmptyState
      icon={Timer}
      title={status === 'calculating' || stale ? 'Mission is being recalculated' : 'Nothing to simulate yet'}
      action={
        <Button size="sm" onClick={() => setView('control')}>
          Open mission planner
        </Button>
      }
    >
      {status === 'calculating' || stale
        ? 'The clock is paused and rewound because inputs changed. It becomes available again when the new result is ready'
        : 'The clock runs along a calculated round trip. Set a habitat and destination, then calculate the mission'}
    </EmptyState>
  )
}

/** Left panel in the Simulation view: clock, transport, live figures. */
export function SimulationControlPanel() {
  const snapshot = useSimulationSnapshot()
  const { okAssessment, current } = useActiveResults()
  const solar = useMissionStore((s) => s.solar)
  const simS = useSimStore((s) => s.simS)
  const endS = useSimStore((s) => s.endS)
  const seek = useSimStore((s) => s.seek)
  const day = solar?.status === 'ok' ? solar.day : null
  const ready = current && okAssessment && endS > 0
  const margin = snapshot.returnMarginS
  const warnAt = (okAssessment?.assumptionsUsed.warningMarginMin ?? 0) * 60

  const phaseLabel =
    snapshot.status === 'complete' ? 'Back at habitat' : snapshot.status === 'not-started' ? 'Ready at habitat' : (snapshot.phase?.label ?? '—')

  return (
    <>
      <PanelHeader title="Mission simulation" meta="Deterministic playback of the planned walk" actions={<SimulatedTag />} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section>
          <p className="text-xs text-fg-3">Simulated local true solar time</p>
          <p className="num mt-1 text-[40px] leading-[44px]" aria-live="off">
            {formatLtst(snapshot.ltstHours, true)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-3">
            {day ? `${day.solLabel} · sunrise ${formatLtst(day.sunriseLtstHours)} · sunset ${formatLtst(day.sunsetLtstHours)}` : 'Daylight window unknown'}
            <SourceBadge id="mars24-solar" />
          </p>
        </Section>

        {!ready ? (
          <Section>
            <NoPlan />
          </Section>
        ) : (
          <>
            <Section>
              <TransportControls />
              <label className="mt-4 block text-xs text-fg-3">
                Scrub mission time
                <input
                  type="range"
                  min={0}
                  max={Math.round(endS)}
                  step={60}
                  value={Math.round(simS)}
                  onChange={(e) => seek(Number(e.target.value))}
                  aria-valuetext={`T plus ${formatDuration(simS)}, ${formatLtst(snapshot.ltstHours)} local solar time`}
                  className="tap mt-1 block w-full accent-(--color-fg)"
                />
              </label>
              <p className="mt-3 mb-1.5 text-xs text-fg-3">Playback speed</p>
              <SpeedControl />
            </Section>

            <Section title="Now">
              <p className="text-[15px]" role="status">
                {phaseLabel}
              </p>
              {snapshot.phase && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-raised" aria-hidden>
                  <div className="h-full bg-fg-2" style={{ width: `${snapshot.phaseProgress * 100}%` }} />
                </div>
              )}
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
                <Stat label="Mission elapsed" value={formatDuration(snapshot.simS)} />
                <Stat label="Mission time remaining" value={formatDuration(snapshot.remainingWorkS)} />
                <Stat
                  label={okAssessment.windowLimitedBy === 'max-eva' ? 'Until EVA limit' : 'Until sunset'}
                  value={snapshot.daylightRemainingS! >= 0 ? formatDuration(snapshot.daylightRemainingS) : 'Passed'}
                />
                <Stat label="Return margin now" value={formatMargin(margin)} sub={`after ${formatDuration(okAssessment.reserveS)} reserve`} />
              </dl>
            </Section>

            <Section>
              {margin !== null && margin < 0 ? (
                <StatusAlert live tone="bad" title="Turnaround warning: return margin is gone">
                  At this point the remaining walk and the reserve no longer fit before{' '}
                  {okAssessment.windowLimitedBy === 'max-eva' ? 'the EVA limit' : 'sunset'}. This is a simulated threshold, not a suit alarm
                </StatusAlert>
              ) : margin !== null && margin < warnAt ? (
                <StatusAlert live tone="warn" title="Turnaround warning: return margin is thin">
                  {formatDuration(margin)} spare, below the {okAssessment.assumptionsUsed.warningMarginMin} min warning threshold. This is a
                  simulated threshold, not a suit alarm
                </StatusAlert>
              ) : (
                <StatusAlert tone="ok" title="Return margin holds on this plan">
                  The walk is assumed to run exactly on plan, so the margin stays constant until the mission ends
                </StatusAlert>
              )}
            </Section>
          </>
        )}
      </div>
    </>
  )
}

/** Right panel in the Simulation view: the plan as a list of timed events. */
export function SimulationEventsPanel() {
  const { okAssessment, current } = useActiveResults()
  const start = useMissionStore((s) => s.config.assumptions.startLtstHours)
  const simS = useSimStore((s) => s.simS)
  const seek = useSimStore((s) => s.seek)
  const endS = useSimStore((s) => s.endS)
  const ready = current && okAssessment && endS > 0
  const f = okAssessment ? FEASIBILITY[okAssessment.feasibility] : null

  return (
    <>
      <PanelHeader title="Mission timeline" meta="Select an event to jump the clock to it" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!ready ? (
          <Section>
            <NoPlan />
          </Section>
        ) : (
          <>
            {f && (
              <Section>
                <p className="flex items-center gap-2 text-[13px]">
                  <f.icon className={cn('size-4', f.color)} aria-hidden />
                  {f.label}
                </p>
                <div className="mt-3">
                  <TimelineKey />
                </div>
              </Section>
            )}
            <Section>
              <ol className="relative">
                {okAssessment.events.map((e, i) => {
                  const passed = simS >= e.atS
                  const reachable = e.atS <= endS
                  return (
                    <li key={`${e.kind}-${i}`}>
                      <button
                        type="button"
                        disabled={!reachable}
                        onClick={() => seek(e.atS)}
                        className="tap group flex w-full items-baseline gap-3 rounded-ctl px-2 py-2 text-left transition-colors duration-150 hover:bg-hover disabled:hover:bg-transparent"
                      >
                        <span
                          className={cn('mt-1 size-2 shrink-0 self-start rounded-full border', passed ? 'border-fg bg-fg' : 'border-fg-3')}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 text-[13px]">
                          {e.label}
                          <span className="sr-only">{passed ? ', passed' : ', upcoming'}</span>
                        </span>
                        <span className="num shrink-0 text-xs text-fg-2">{formatLtst(start + e.atS / MARS_HOUR_SECONDS)}</span>
                        <span className="num w-[104px] shrink-0 text-right text-xs whitespace-nowrap text-fg-3">T+{formatDuration(e.atS)}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </Section>
            {okAssessment.violations.length > 0 && (
              <Section title="Constraints">
                <div className="space-y-2">
                  {okAssessment.violations.map((v) => (
                    <StatusAlert key={v.code} tone={v.severity === 'violation' ? 'bad' : v.severity === 'warning' ? 'warn' : 'unknown'} title={v.title}>
                      {v.detail}
                    </StatusAlert>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
        <Section>
          <p className="text-xs text-fg-3">
            Simulated time only. The clock never reads a real Mars or Earth clock, and no telemetry is involved. One Mars clock
            hour lasts {(MARS_HOUR_SECONDS / 60).toFixed(2)} Earth minutes
          </p>
        </Section>
      </div>
    </>
  )
}
