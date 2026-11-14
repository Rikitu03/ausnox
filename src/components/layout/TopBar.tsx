import { CircleHelp, FlaskConical } from 'lucide-react'
import { KIND_META, KindBadge, type BadgeKind } from '@/components/provenance/Provenance'
import { Button } from '@/components/ui/button'
import { Dialog, Tooltip } from '@/components/ui/overlay'
import { dataMode } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useUiStore, VIEWS } from '@/stores/uiStore'
import { cn } from '@/utils/cn'
import { Logo } from './primitives'

export function TopBar() {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const setHelpOpen = useUiStore((s) => s.setHelpOpen)
  const title = useDataStore((s) => s.manifest?.title)
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-bg px-3 sm:gap-4 sm:px-4">
      <a href="#/control" onClick={() => setView('control')} className="flex shrink-0 items-center gap-2 rounded-ctl" aria-label="Ausnox, mission control">
        <Logo />
        <span className="text-[15px] font-semibold tracking-[0.08em]">AUSNOX</span>
      </a>
      <span className="hidden shrink-0 text-xs text-fg-3 xl:inline">{title ?? 'Jezero Crater'}</span>

      <nav aria-label="Views" className="-my-px flex min-w-0 flex-1 items-stretch gap-1 self-stretch overflow-x-auto sm:justify-center">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-current={view === v.id ? 'page' : undefined}
            onClick={() => setView(v.id)}
            className={cn(
              'tap relative shrink-0 px-2.5 text-[13px] whitespace-nowrap transition-colors duration-150 sm:px-3',
              view === v.id ? 'text-fg' : 'text-fg-2 hover:text-fg',
            )}
          >
            {v.label}
            {view === v.id && <span className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-accent sm:inset-x-3" aria-hidden />}
          </button>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-1.5">
        <Tooltip label="Every mission in Ausnox is hypothetical. Nothing here is live" side="bottom">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="tap hidden h-7 items-center gap-1.5 rounded-ctl border border-line-strong px-2 text-xs text-fg-2 transition-colors duration-150 hover:text-fg md:inline-flex"
          >
            <FlaskConical className="size-3.5" aria-hidden />
            Simulated mission
          </button>
        </Tooltip>
        {dataMode === 'mock' && (
          <Tooltip label="No NASA or USGS data is loaded in this build. See data sources" side="bottom">
            <button
              type="button"
              onClick={() => setView('sources')}
              className="tap hidden h-7 items-center rounded-ctl border border-line-strong px-2 text-xs text-fg-2 transition-colors duration-150 hover:text-fg lg:inline-flex"
            >
              Demo data
            </button>
          </Tooltip>
        )}
        <Tooltip label="Help and credits" side="bottom">
          <Button variant="ghost" size="icon-sm" aria-label="Help and credits" onClick={() => setHelpOpen(true)}>
            <CircleHelp />
          </Button>
        </Tooltip>
      </div>
    </header>
  )
}

const STEPS = [
  'Place a hypothetical habitat and a science destination on the map, or type coordinates',
  'Add science stops and set how long each takes',
  'Compare the shortest traversable route with the lower-slope route',
  'Open advanced assumptions to change speed, slope limit, reserve and start time',
  'Run the simulated clock and watch the return margin against sunset',
]

export function HelpDialog() {
  const open = useUiStore((s) => s.helpOpen)
  const setOpen = useUiStore((s) => s.setHelpOpen)
  const setView = useUiStore((s) => s.setView)
  return (
    <Dialog open={open} onOpenChange={setOpen} title="About Ausnox" description="Navigating the Red Planet from dawn to dusk">
      <div className="space-y-5 text-[13px] text-fg-2">
        <p>
          Ausnox is an educational Marswalk planning simulation for Jezero Crater, made for NASA Space Apps 2026. Every mission is
          hypothetical. It is not for operational navigation and is not endorsed by NASA
        </p>
        {dataMode === 'mock' && (
          <p className="rounded-card border border-line bg-raised p-3 text-fg">
            This build runs on demonstration data. The terrain is synthetic, routes are demonstration arcs and daylight times are
            fixed examples. Real NASA and USGS data arrives with the scientific engine
          </p>
        )}
        <div>
          <h3 className="mb-2 font-medium text-fg">Planning a mission</h3>
          <ol className="list-decimal space-y-1.5 pl-5">
            {STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className="mb-2 font-medium text-fg">Labels</h3>
          <ul className="space-y-2">
            {(Object.keys(KIND_META) as BadgeKind[]).map((k) => (
              <li key={k} className="grid grid-cols-[104px_1fr] items-start gap-3">
                <KindBadge kind={k} className="justify-self-start" />
                {KIND_META[k].meaning}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 font-medium text-fg">Keyboard</h3>
          <p>
            Every control is reachable with Tab. With the map focused, arrow keys pan and plus and minus zoom. Use Enter coordinates
            to place points without a pointer. Escape cancels placement and closes dialogs
          </p>
        </div>
        <Button
          onClick={() => {
            setOpen(false)
            setView('sources')
          }}
        >
          Data sources, methods and credits
        </Button>
      </div>
    </Dialog>
  )
}
