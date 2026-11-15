import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/controls'
import { Tooltip } from '@/components/ui/overlay'
import { useSimulationSnapshot } from '@/hooks/useSimulation'
import { SIM_SPEEDS, SIM_STEP_S, useSimStore } from '@/stores/simStore'
import { useUiStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'
import { formatDuration, formatLtst } from '@/utils/format'
import { DaylightTimeline } from './DaylightTimeline'

export function SimulatedTag({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex h-5 items-center rounded-[5px] border border-line-strong px-1.5 text-xs font-medium tracking-wide text-fg', className)}>
      SIMULATED
    </span>
  )
}

export function PlayButton({ size = 'icon' }: { size?: 'icon' | 'lg' }) {
  const playing = useSimStore((s) => s.playing)
  const endS = useSimStore((s) => s.endS)
  const simS = useSimStore((s) => s.simS)
  const play = useSimStore((s) => s.play)
  const pause = useSimStore((s) => s.pause)
  const label = playing ? 'Pause simulation' : simS > 0 && simS < endS ? 'Resume simulation' : 'Start simulation'
  const button = (
    <Button variant="primary" size={size} disabled={endS <= 0} aria-label={label} onClick={playing ? pause : play} className={size === 'lg' ? 'w-28' : ''}>
      {playing ? <Pause /> : <Play />}
      {size === 'lg' && (playing ? 'Pause' : simS > 0 && simS < endS ? 'Resume' : 'Start')}
    </Button>
  )
  return size === 'icon' ? <Tooltip label={endS <= 0 ? 'Calculate a mission to simulate it' : label}>{button}</Tooltip> : button
}

export function TransportControls() {
  const endS = useSimStore((s) => s.endS)
  const step = useSimStore((s) => s.step)
  const reset = useSimStore((s) => s.reset)
  const disabled = endS <= 0
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Simulation controls">
      <Tooltip label="Reset to mission start">
        <Button size="icon" aria-label="Reset simulation" disabled={disabled} onClick={reset}>
          <RotateCcw />
        </Button>
      </Tooltip>
      <Tooltip label="Step back 5 min">
        <Button size="icon" aria-label="Step back 5 minutes" disabled={disabled} onClick={() => step(-SIM_STEP_S)}>
          <SkipBack />
        </Button>
      </Tooltip>
      <PlayButton size="lg" />
      <Tooltip label="Step forward 5 min">
        <Button size="icon" aria-label="Step forward 5 minutes" disabled={disabled} onClick={() => step(SIM_STEP_S)}>
          <SkipForward />
        </Button>
      </Tooltip>
    </div>
  )
}

export function SpeedControl({ className }: { className?: string }) {
  const speed = useSimStore((s) => s.speed)
  const setSpeed = useSimStore((s) => s.setSpeed)
  return (
    <Segmented
      label="Simulation speed, simulated minutes per second"
      size="sm"
      className={className}
      value={speed}
      onChange={setSpeed}
      options={SIM_SPEEDS.map((s) => ({ value: s, label: `${s / 60} min/s`, hint: `${s} times real time` }))}
    />
  )
}

/** Slim transport strip under the map: clock, play, the sol timeline. */
export function SimDock({ className, minimal }: { className?: string; minimal?: boolean }) {
  const snapshot = useSimulationSnapshot()
  const endS = useSimStore((s) => s.endS)
  const setView = useUiStore((s) => s.setView)
  const view = useUiStore((s) => s.view)
  return (
    <section aria-label="Simulated mission clock" className={cn('flex items-center gap-4 rounded-panel border border-line-strong bg-surface px-4 py-3', className)}>
      <PlayButton />
      <div className="shrink-0">
        <div className="flex items-center gap-2">
          <span className="num text-xl leading-6" aria-label={`Simulated local true solar time ${formatLtst(snapshot.ltstHours)}`}>
            {formatLtst(snapshot.ltstHours)}
          </span>
          <SimulatedTag />
        </div>
        <p className="mt-0.5 text-xs text-fg-3">
          {endS <= 0 ? 'Local solar time · no plan' : `Local solar time · T+${formatDuration(snapshot.simS)}`}
        </p>
      </div>
      <DaylightTimeline compact className="flex-1" />
      {view !== 'simulation' && !minimal && (
        <Button size="sm" variant="ghost" className="hidden shrink-0 sm:inline-flex" onClick={() => setView('simulation')}>
          Open simulation
        </Button>
      )}
    </section>
  )
}
