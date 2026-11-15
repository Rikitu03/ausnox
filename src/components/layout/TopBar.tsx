import { ArrowRight, CircleHelp, Eye, FlaskConical, ShieldAlert, SlidersHorizontal, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverClose, Tooltip } from '@/components/ui/overlay'
import { dataMode } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useUiStore, VIEWS } from '@/stores/uiStore'
import { cn } from '@/utils/cn'
import { Logo } from './primitives'

export { HelpDialog } from './HelpDialog'

export function TopBar() {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const openSources = useUiStore((s) => s.openSources)
  const setHelpOpen = useUiStore((s) => s.setHelpOpen)
  const title = useDataStore((s) => s.manifest?.title)
  return (
    <header className="app-header grid shrink-0 grid-cols-[1fr_auto] items-center gap-x-4 border-b border-line bg-bg px-4 sm:px-5 lg:flex lg:h-16">
      <a href="#/control" onClick={() => setView('control')} className="flex shrink-0 items-center gap-2 rounded-ctl" aria-label="Ausnox, mission control">
        <Logo className="size-6 text-accent" />
        <span className="text-base font-semibold tracking-[0.1em]">AUSNOX</span>
      </a>
      <span className="hidden shrink-0 text-xs text-fg-3 xl:inline">{title ?? 'Jezero Crater'}</span>

      <nav aria-label="Views" className="app-navigation order-3 col-span-2 flex min-w-0 flex-1 items-stretch gap-1 self-stretch overflow-x-auto lg:order-none lg:justify-center">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-current={view === v.id ? 'page' : undefined}
            onClick={() => setView(v.id)}
            className={cn(
              'tap relative shrink-0 px-2.5 text-[13px] whitespace-nowrap transition-colors duration-150 sm:px-3',
              view === v.id ? 'font-semibold text-fg' : 'text-fg-2 hover:text-fg',
            )}
          >
            {v.label}
            {view === v.id && <span className="absolute inset-x-2.5 bottom-0 h-px rounded-full bg-accent sm:inset-x-3" aria-hidden />}
          </button>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-1.5">
        <SimulatedMission />
        {dataMode === 'mock' && (
          <Tooltip label="No NASA or USGS data is loaded in this build. See data sources" side="bottom">
            <button
              type="button"
              onClick={() => openSources('overview')}
              className="tap hidden h-7 items-center rounded-ctl border border-line-strong px-2 text-xs text-fg-2 transition-colors duration-150 hover:text-fg lg:inline-flex"
            >
              Demo data
            </button>
          </Tooltip>
        )}
        <Tooltip label="Help" side="bottom">
          <Button variant="ghost" size="icon-sm" aria-label="Help" onClick={() => setHelpOpen(true)}>
            <CircleHelp />
          </Button>
        </Tooltip>
      </div>
    </header>
  )
}

/** What is real and what is assumed, in four lines. Deliberately not the Help dialog. */
const FACTS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: FlaskConical, title: 'The mission is hypothetical', body: 'No astronaut, habitat or rover is tracked. Nothing here is live.' },
  dataMode === 'real'
    ? { icon: Eye, title: 'The terrain is real', body: 'Elevation and imagery are NASA and USGS orbital observations of Jezero crater.' }
    : { icon: Eye, title: 'The terrain is a demo stand-in', body: 'This build uses synthetic terrain. Real builds use NASA and USGS observations.' },
  { icon: SlidersHorizontal, title: 'Assumptions are simulated', body: 'Walking speed, science-stop times and EVA limits are illustrative, and you can change them.' },
  { icon: ShieldAlert, title: 'Feasible is not safe', body: 'A verdict holds only under the chosen assumptions. It is not a safety certification.' },
]

function SimulatedMission() {
  const openSources = useUiStore((s) => s.openSources)
  return (
    <Popover
      label="About this simulated mission"
      trigger={
        <button
          type="button"
          aria-label="Simulated mission: what is real and what is assumed"
          className="tap inline-flex h-7 items-center gap-1.5 rounded-ctl border border-line-strong px-2 text-xs text-fg-2 transition-colors duration-150 hover:text-fg data-[state=open]:border-fg-3 data-[state=open]:text-fg"
        >
          <FlaskConical className="size-3.5" aria-hidden />
          <span className="hidden md:inline">Simulated mission</span>
        </button>
      }
    >
      <div className="border-b border-line px-4 pt-4 pb-3">
        <p className="text-[15px] font-medium">Simulated mission</p>
        <p className="mt-0.5 text-[13px] text-fg-2">What is real in Ausnox, and what is assumed</p>
      </div>
      <ul className="space-y-3.5 px-4 py-4">
        {FACTS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-raised text-fg-2" aria-hidden>
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] leading-5 font-medium">{title}</p>
              <p className="text-[13px] leading-5 text-fg-2">{body}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
        <PopoverClose asChild>
          <button
            type="button"
            onClick={() => openSources('methodology')}
            className="tap inline-flex items-center gap-1.5 rounded-ctl text-[13px] font-medium text-fg transition-colors duration-150 hover:text-accent"
          >
            How the science works
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
        </PopoverClose>
        <PopoverClose asChild>
          <button type="button" onClick={() => openSources('limitations')} className="tap rounded-ctl text-[13px] text-fg-2 hover:text-fg">
            Limitations
          </button>
        </PopoverClose>
      </div>
    </Popover>
  )
}
