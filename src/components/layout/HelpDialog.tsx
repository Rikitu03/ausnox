import {
  ArrowRight,
  BookOpen,
  ChartNoAxesColumn,
  Database,
  Flag,
  Info,
  MapPin,
  Play,
  Route,
  ShieldAlert,
  SlidersHorizontal,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { Tabs } from 'radix-ui'
import type { ReactNode } from 'react'
import { KIND_META, KindBadge, STATUS_META, StatusPill, type BadgeKind } from '@/components/provenance/Provenance'
import { Button } from '@/components/ui/button'
import { Collapsible } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/overlay'
import { dataMode } from '@/services'
import { useUiStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'
import { FEASIBILITY } from './primitives'

const TABS: { id: string; label: string; short: string; icon: LucideIcon }[] = [
  { id: 'start', label: 'Getting started', short: 'Start', icon: Play },
  { id: 'results', label: 'Understanding results', short: 'Results', icon: ChartNoAxesColumn },
  { id: 'data', label: 'Data and science', short: 'Data', icon: Database },
  { id: 'about', label: 'About Ausnox', short: 'About', icon: Info },
]

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: MapPin, title: 'Place a habitat', body: 'Click the map, or enter coordinates. The habitat is hypothetical.' },
  { icon: Flag, title: 'Choose a destination', body: 'Pick a science waypoint or place your own, then add stops on the way.' },
  { icon: Route, title: 'Calculate and compare routes', body: 'Shortest walkable path vs a route that prefers gentler slopes.' },
  { icon: SlidersHorizontal, title: 'Adjust assumptions', body: 'Speed, slope limit, reserve and start time live under advanced assumptions.' },
  { icon: Timer, title: 'Run the simulated clock', body: 'Watch the return margin shrink against sunset and the EVA limit.' },
]

function Heading({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-[15px] leading-6 font-medium">{children}</h3>
      {sub && <p className="mt-0.5 text-[13px] text-fg-2">{sub}</p>}
    </div>
  )
}

/** A short term-and-meaning row: the scannable unit of the help panels. */
function Term({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[140px_1fr] sm:gap-4">
      <dt className="text-[13px] font-medium">{term}</dt>
      <dd className="text-[13px] leading-5 text-fg-2">{children}</dd>
    </div>
  )
}

export function HelpDialog() {
  const open = useUiStore((s) => s.helpOpen)
  const setOpen = useUiStore((s) => s.setHelpOpen)
  const openSources = useUiStore((s) => s.openSources)
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Help"
      description="Plan a Marswalk and read its results"
      bare
      className="h-[min(620px,calc(100dvh-32px))] max-w-[760px]"
    >
      <Tabs.Root defaultValue="start" orientation="vertical" className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Tabs.List
          aria-label="Help topics"
          className="grid shrink-0 grid-cols-4 gap-1 border-b border-line px-3 py-2 md:flex md:w-[208px] md:flex-col md:border-r md:border-b-0 md:px-2.5 md:py-3"
        >
          {TABS.map(({ id, label, short, icon: Icon }) => (
            <Tabs.Trigger
              key={id}
              value={id}
              className={cn(
                'tap flex h-9 shrink-0 items-center justify-center gap-1.5 md:justify-start md:gap-2.5 rounded-ctl px-2.5 text-left text-[13px] whitespace-nowrap text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg',
                'data-[state=active]:bg-hover data-[state=active]:text-fg data-[state=active]:shadow-[inset_0_-2px_0_var(--color-accent)] md:data-[state=active]:shadow-[inset_2px_0_0_var(--color-accent)]',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="md:hidden" aria-hidden>
                {short}
              </span>
              <span className="sr-only md:not-sr-only">{label}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* ---------------------------------------------------------- getting started */}
          <Tabs.Content value="start" className="px-5 py-5 outline-none">
            <Heading sub="Five steps from an empty map to a verdict">Planning a Marswalk</Heading>
            <ol className="space-y-1">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="flex gap-3.5 rounded-card p-2.5">
                  <span className="relative grid size-8 shrink-0 place-items-center rounded-[8px] bg-raised text-fg" aria-hidden>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] leading-5 font-medium">
                      <span className="num mr-1.5 text-xs text-fg-3">{i + 1}</span>
                      {title}
                    </p>
                    <p className="text-[13px] leading-5 text-fg-2">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[13px] text-fg-2">
              New here? Press <span className="text-fg">Sample</span> in the mission planner to load a ready-made mission.
            </p>
            <div className="mt-5 rounded-card border border-line p-3.5">
              <Collapsible title="Keyboard and accessibility" hint="Everything works without a pointer">
                <dl className="divide-y divide-line">
                  <Term term="Tab">Reaches every control</Term>
                  <Term term="Arrow keys">Pan the focused map. In 3D, focus the canvas first</Term>
                  <Term term="+ and −">Zoom the focused map</Term>
                  <Term term="Escape">Cancels placement and closes dialogs</Term>
                  <Term term="Enter coordinates">Places points without a pointer</Term>
                </dl>
              </Collapsible>
            </div>
          </Tabs.Content>

          {/* ---------------------------------------------------------- results */}
          <Tabs.Content value="results" className="space-y-7 px-5 py-5 outline-none">
            <section>
              <Heading sub="Each leg is searched over measured slope">Routes</Heading>
              <dl className="divide-y divide-line">
                <Term term="Shortest">The shortest walkable path within the slope limit</Term>
                <Term term="Lower slope">Accepts a longer walk to stay on gentler ground</Term>
                <Term term="Return leg">Planned on its own, so it may differ from the way out</Term>
              </dl>
            </section>
            <section>
              <Heading>Return margin</Heading>
              <p className="rounded-card bg-raised p-3.5 text-[13px] leading-5 text-fg-2">
                Time left before <span className="text-fg">sunset or the EVA limit</span>, after all walking, science stops and your reserve.
                Positive means a buffer; negative means you would be late.
              </p>
            </section>
            <section>
              <Heading sub="Always conditional on the assumptions you chose">Verdicts</Heading>
              <ul className="space-y-2.5">
                {(['feasible', 'infeasible', 'indeterminate'] as const).map((f) => {
                  const { icon: Icon, color, short } = FEASIBILITY[f]
                  return (
                    <li key={f} className="flex gap-3 text-[13px]">
                      <Icon className={cn('mt-0.5 size-4 shrink-0', color)} aria-hidden />
                      <p className="leading-5 text-fg-2">
                        <span className="font-medium text-fg">{short}</span> ·{' '}
                        {f === 'feasible'
                          ? 'every known constraint is met. Not a safety certification'
                          : f === 'infeasible'
                            ? 'a known constraint is violated, such as returning after sunset'
                            : 'an input is missing (route, terrain or daylight). Ausnox never guesses'}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </section>
            <section>
              <Heading sub="Two separate labels appear across the app">Scientific labels</Heading>
              <p className="mb-2 text-xs text-fg-3">Classification · what kind of science a value is</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(KIND_META) as BadgeKind[]).map((k) => (
                  <li key={k} className="flex items-start gap-2.5 text-[13px] leading-5">
                    <KindBadge kind={k} className="mt-px shrink-0" />
                    <span className="text-fg-2">{KIND_META[k].meaning}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 mb-2 text-xs text-fg-3">Status · whether this build uses a source</p>
              <ul className="flex flex-wrap gap-x-5 gap-y-2">
                {(['integrated', 'unavailable', 'planned'] as const).map((s) => (
                  <li key={s} title={STATUS_META[s].meaning}>
                    <StatusPill status={s} />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[13px] text-fg-2">Select any badge in the app to see exactly where a value comes from.</p>
            </section>
          </Tabs.Content>

          {/* ---------------------------------------------------------- data and science */}
          <Tabs.Content value="data" className="space-y-6 px-5 py-5 outline-none">
            <section>
              <Heading sub={dataMode === 'real' ? 'Real observations, calculated models' : 'This build runs on demonstration data'}>
                Where the numbers come from
              </Heading>
              {dataMode === 'real' ? (
                <dl className="divide-y divide-line">
                  <Term term="Terrain">USGS HiRISE DTM of Jezero crater, 2 m grid (MRO). Checksum verified at load</Term>
                  <Term term="Imagery">NASA Mars Trek: MRO HiRISE and CTX, MGS MOLA</Term>
                  <Term term="Science targets">Perseverance (Mars 2020) rover positions</Term>
                  <Term term="Daylight">NASA GISS Mars24 equations</Term>
                  <Term term="Routing">A* over measured slope, in your browser</Term>
                </dl>
              ) : (
                <p className="rounded-card bg-raised p-3.5 text-[13px] leading-5 text-fg-2">
                  The terrain is synthetic, routes are demonstration arcs and daylight times are fixed examples. Real builds load NASA and
                  USGS data with the scientific engine.
                </p>
              )}
            </section>
            {dataMode === 'real' && (
              <div className="flex gap-3 rounded-card border border-bad/40 bg-bad/[0.06] p-3.5">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
                <div className="text-[13px] leading-5">
                  <p className="font-medium">Open finding: X2b</p>
                  <p className="mt-0.5 text-fg-2">
                    Terrain and imagery may be offset by up to about 3 m. Routes follow the terrain; over imagery they can look shifted.
                  </p>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => openSources('datasets')}>
                <BookOpen />
                Browse data sources
              </Button>
              <Button variant="secondary" onClick={() => openSources('methodology')}>
                Methodology
              </Button>
              <Button variant="ghost" onClick={() => openSources('limitations')}>
                Limitations
                <ArrowRight />
              </Button>
            </div>
          </Tabs.Content>

          {/* ---------------------------------------------------------- about */}
          <Tabs.Content value="about" className="space-y-6 px-5 py-5 outline-none">
            <section>
              <Heading sub="Navigating the Red Planet from dawn to dusk">About Ausnox</Heading>
              <p className="text-[13px] leading-5 text-fg-2">
                An educational Marswalk planner for Jezero crater. It shows how terrain, daylight and walking time limit a crewed traverse on
                Mars, using real orbital data wherever it exists.
              </p>
            </section>
            <ul className="grid gap-3 sm:grid-cols-2">
              <li className="rounded-card border border-line p-3.5">
                <p className="text-[13px] font-medium">Educational only</p>
                <p className="mt-1 text-[13px] leading-5 text-fg-2">Not flight-qualified. Not for navigation or safety decisions.</p>
              </li>
              <li className="rounded-card border border-line p-3.5">
                <p className="text-[13px] font-medium">Every mission is hypothetical</p>
                <p className="mt-1 text-[13px] leading-5 text-fg-2">No astronaut, habitat or vehicle is tracked. No telemetry.</p>
              </li>
            </ul>
            <section>
              <Heading>Credits</Heading>
              <p className="text-[13px] leading-5 text-fg-2">
                Made for NASA Space Apps 2026; not endorsed by NASA.{' '}
                {dataMode === 'real' &&
                  'Terrain: USGS HiRISE DTM mosaic for Mars 2020 TRN (Fergason et al. 2020, doi:10.5066/P9REJ9JN), NASA/JPL-Caltech/University of Arizona. Imagery via NASA/JPL Mars Trek. Rover positions: NASA/JPL-Caltech (MMGIS). '}
                Full dataset and software credits are on the Data sources page.
              </p>
              <Button variant="ghost" size="sm" className="mt-2 -ml-2.5" onClick={() => openSources('references')}>
                References and credits
                <ArrowRight />
              </Button>
            </section>
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </Dialog>
  )
}
