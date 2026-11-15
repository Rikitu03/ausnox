import {
  ArrowRight,
  ChevronDown,
  CircleCheck,
  CircleX,
  ExternalLink,
  FileSearch,
  Info,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { Collapsible as RadixCollapsible } from 'radix-ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { StatusAlert } from '@/components/layout/primitives'
import { KIND_META, KindBadge, STATUS_META, StatusPill, type BadgeKind } from '@/components/provenance/Provenance'
import { Button } from '@/components/ui/button'
import { dataMode, services, type ProvenanceRecord } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useMissionStore } from '@/stores/missionStore'
import { useUiStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'
import { GATES, LIMITATIONS, METHODS, NETWORK, SECTIONS, SEVERITY, SOFTWARE, X2B, type Limitation, type Severity } from './content'

type Integration = ProvenanceRecord['integration']
const STATUS_ORDER: Integration[] = ['integrated', 'unavailable', 'demo-stand-in', 'planned']
const CLASS_ORDER: BadgeKind[] = ['observed', 'derived', 'simulated', 'historical']

/* ------------------------------------------------------------------ building blocks */

function SectionHeading({ id, title, intro, aside }: { id: string; title: string; intro: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h2 id={`${id}-title`} tabIndex={-1} className="text-xl leading-7 font-medium tracking-[-0.01em] outline-none">
          {title}
        </h2>
        <p className="mt-1.5 max-w-[64ch] text-[14px] leading-[22px] text-fg-2">{intro}</p>
      </div>
      {aside}
    </div>
  )
}

function Section({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-16 space-y-6">
      {children}
    </section>
  )
}

/** Disclosure with a visible "Show / Hide" affordance, for technical detail that most readers can skip. */
function Disclosure({ summary, hint, children, className }: { summary: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <RadixCollapsible.Root className={cn('rounded-card border border-line bg-surface', className)}>
      <RadixCollapsible.Trigger className="tap group flex w-full items-center justify-between gap-4 rounded-card px-4 py-3.5 text-left transition-colors duration-150 hover:bg-raised">
        <span className="min-w-0">
          <span className="block text-[14px] font-medium">{summary}</span>
          {hint && <span className="mt-0.5 block text-xs text-fg-3">{hint}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-fg-3">
          <span className="group-data-[state=open]:hidden">Show</span>
          <span className="hidden group-data-[state=open]:inline">Hide</span>
          <ChevronDown className="size-4 transition-transform duration-150 group-data-[state=open]:rotate-180" aria-hidden />
        </span>
      </RadixCollapsible.Trigger>
      <RadixCollapsible.Content className="border-t border-line px-4 py-4">{children}</RadixCollapsible.Content>
    </RadixCollapsible.Root>
  )
}

/** Small chip filter. A real radio group, so arrow keys move between options. */
function ChipFilter<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange(v: T): void
  options: { value: T; label: string; count: number; icon?: ReactNode }[]
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-fg-3" aria-hidden>
        {label}
      </span>
      {options.map((o) => {
        const checked = o.value === value
        return (
          <label
            key={o.value}
            className={cn(
              'tap inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-accent',
              o.count === 0 && !checked && 'opacity-50',
              checked ? 'border-fg-2 bg-hover text-fg' : 'border-line-strong text-fg-2 hover:text-fg',
            )}
          >
            <input type="radio" name={label} className="sr-only" checked={checked} onChange={() => onChange(o.value)} />
            {o.icon}
            {o.label}
            <span className="num text-fg-3">{o.count}</span>
          </label>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ overview */

function OverviewColumn({
  kind,
  title,
  lead,
  records,
}: {
  kind: BadgeKind
  title: string
  lead: string
  records: ProvenanceRecord[]
}) {
  const open = useUiStore((s) => s.openProvenance)
  const { icon: Icon } = KIND_META[kind]
  return (
    <div className="flex flex-col rounded-panel border border-line bg-surface p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-raised text-fg" aria-hidden>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] leading-5 font-medium">{title}</h3>
          <p className="text-xs text-fg-3">
            {KIND_META[kind].label} · <span className="num">{records.length}</span> in use
          </p>
        </div>
      </div>
      <p className="mt-4 text-[13px] leading-5 text-fg-2">{lead}</p>
      {records.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-line pt-3">
          {records.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => open(r.id)}
                aria-label={`Inspect source: ${r.title}`}
                className="tap group -mx-2 flex w-[calc(100%+16px)] items-center justify-between gap-3 rounded-ctl px-2 py-1.5 text-left text-[13px] transition-colors duration-150 hover:bg-raised"
              >
                <span className="min-w-0 truncate">{shortTitle(r.title)}</span>
                <FileSearch className="size-3.5 shrink-0 text-fg-3 group-hover:text-fg" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Drops parenthetical asides so titles fit one line in compact lists; the drawer shows the full title. */
const shortTitle = (t: string) => t.replace(/\s*\([^)]*\)\s*$/, '')

/* ------------------------------------------------------------------ datasets */

function DatasetCard({ r }: { r: ProvenanceRecord }) {
  const open = useUiStore((s) => s.openProvenance)
  // Register entries write "What it measures. Method: how it was made". The card leads with the first part only.
  const contributes = r.measures.split(/\s*Method:\s*/)[0]
  const dim = r.integration === 'planned'
  return (
    <li className={cn('flex flex-col rounded-panel border bg-surface p-5', dim ? 'border-dashed border-line-strong' : 'border-line')}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <KindBadge kind={r.kind} />
          {r.integration === 'demo-stand-in' && <KindBadge kind="illustrative" />}
        </div>
        <StatusPill status={r.integration} />
      </div>
      <h3 className={cn('mt-4 text-[15px] leading-[22px] font-medium', dim && 'text-fg-2')}>{r.title}</h3>
      {(r.mission || r.instrument) && <p className="mt-0.5 text-xs text-fg-3">{[r.mission, r.instrument].filter(Boolean).join(' · ')}</p>}
      <p className="mt-3 line-clamp-3 flex-1 text-[13px] leading-5 text-fg-2" title={contributes}>{contributes}</p>
      {r.resolution && (
        <p className="mt-3 text-xs text-fg-3">
          Resolution <span className="num ml-1 text-fg-2">{r.resolution.split(/[;(]/)[0]!.trim()}</span>
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3.5">
        <button
          type="button"
          onClick={() => open(r.id)}
          className="tap inline-flex items-center gap-1.5 rounded-ctl text-[13px] font-medium text-fg transition-colors duration-150 hover:text-accent"
          aria-label={`Inspect provenance: ${r.title}`}
        >
          <FileSearch className="size-4" aria-hidden />
          Inspect
          {r.limitations.length > 0 && (
            <span className="font-normal text-fg-3">
              · <span className="num">{r.limitations.length}</span> {r.limitations.length === 1 ? 'limit' : 'limits'}
            </span>
          )}
        </button>
        {r.sourceUrl && (
          <a
            href={r.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="tap ml-auto inline-flex items-center gap-1.5 rounded-ctl text-[13px] text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg hover:decoration-fg"
          >
            Source
            <ExternalLink className="size-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------ limitations */

const SEVERITY_STYLE: Record<Severity, { icon: LucideIcon; tone: string; frame: string }> = {
  critical: { icon: ShieldAlert, tone: 'text-bad', frame: 'border-bad/40 bg-bad/[0.06]' },
  major: { icon: TriangleAlert, tone: 'text-warn', frame: 'border-line bg-surface' },
  minor: { icon: Info, tone: 'text-fg-3', frame: 'border-line bg-surface' },
}

function LimitationItem({ l }: { l: Limitation }) {
  const { icon: Icon, tone } = SEVERITY_STYLE[l.severity]
  return (
    <li className="flex gap-3">
      <Icon className={cn('mt-0.5 size-4 shrink-0', tone)} aria-hidden />
      <div className="min-w-0">
        <p className="text-[14px] leading-5 font-medium">{l.title}</p>
        <p className="mt-1 text-[13px] leading-5 text-fg-2">{l.detail}</p>
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------ page */

export function SourcesView() {
  const records = services.mapData.listProvenance()
  const demo = services.demo
  const [scenario, setScenario] = useState(demo?.get() ?? 'nominal')
  const init = useDataStore((s) => s.init)
  const terrainError = useDataStore((s) => s.terrainError)
  const manifest = useDataStore((s) => s.manifest)
  const verification = manifest?.verification
  const x2b = verification?.crossValidation?.checks.find((c) => /x2b/i.test(c.id) && c.status !== 'PASS')
  const setView = useUiStore((s) => s.setView)
  const section = useUiStore((s) => s.sourcesSection)
  const clearSection = useUiStore((s) => s.clearSourcesSection)
  const scroller = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<string>('overview')

  const [status, setStatus] = useState<'all' | Integration>('all')
  const [kind, setKind] = useState<'all' | BadgeKind>('all')
  const shown = records
    .filter((r) => (status === 'all' || r.integration === status) && (kind === 'all' || r.kind === kind))
    .sort((a, b) => STATUS_ORDER.indexOf(a.integration) - STATUS_ORDER.indexOf(b.integration))

  const inUse = records.filter((r) => r.integration === 'integrated' || r.integration === 'demo-stand-in')
  const byKind = (k: BadgeKind) => inUse.filter((r) => r.kind === k)

  // Limitations: X2b is always critical in real mode, and shown before anything else.
  const limitations: Limitation[] = [
    ...(dataMode === 'real' ? [{ severity: 'critical' as const, title: X2B.title, detail: X2B.detail }] : []),
    {
      severity: 'critical',
      title: 'Not for navigation or safety decisions',
      detail: 'Ausnox is an educational planning simulation. It is not flight-qualified. “Feasible” always means feasible under the selected assumptions.',
    },
    ...LIMITATIONS[dataMode],
  ]
  const grouped = (['critical', 'major', 'minor'] as Severity[]).map((s) => ({ s, items: limitations.filter((l) => l.severity === s) }))

  // Deep links from Help and the header land on one section.
  useEffect(() => {
    if (!section) return
    const el = document.getElementById(section)
    el?.scrollIntoView({ block: 'start' })
    el?.querySelector<HTMLElement>('h1, h2')?.focus({ preventScroll: true })
    clearSection()
  }, [section, clearSection])

  // Scroll spy for the section navigation.
  useEffect(() => {
    const root = scroller.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(top.target.id)
      },
      { root, rootMargin: '-64px 0px -65% 0px' },
    )
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [])

  const applyScenario = async (id: string) => {
    if (!demo) return
    demo.set(id)
    setScenario(id)
    // Reload data through the adapters, then recalculate whatever mission is on screen.
    await init()
    const mission = useMissionStore.getState()
    if (mission.status !== 'idle') void mission.calculate()
  }

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    setActive(id)
  }

  return (
    <div ref={scroller} className="relative h-full overflow-y-auto">
      {/* Section navigation: sticky, so the page reads as a set of answers rather than one long report. */}
      <nav aria-label="On this page" className="sticky top-0 z-10 border-b border-line bg-bg/92 backdrop-blur-sm">
        <ul className="mx-auto flex max-w-[1120px] gap-1 overflow-x-auto px-4 sm:px-6">
          {SECTIONS.map((s) => (
            <li key={s.id} className="shrink-0">
              <a
                href={`#/sources`}
                onClick={(e) => {
                  e.preventDefault()
                  jump(s.id)
                }}
                aria-current={active === s.id ? 'location' : undefined}
                className={cn(
                  'tap relative flex h-11 items-center px-2.5 text-[13px] transition-colors duration-150',
                  active === s.id ? 'text-fg' : 'text-fg-3 hover:text-fg',
                )}
              >
                {s.label}
                {active === s.id && <span className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-accent" aria-hidden />}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-auto max-w-[1120px] space-y-16 px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
        {/* ---------------------------------------------------------- intro + overview */}
        <Section id="overview">
          <header className="max-w-[72ch]">
            <p className="text-xs text-fg-3">NASA Space Apps 2026 project · not endorsed by NASA</p>
            <h1 id="overview-title" tabIndex={-1} className="mt-2 text-[32px] leading-10 font-medium tracking-[-0.015em] outline-none">
              Data sources and methods
            </h1>
            <p className="mt-3 text-[16px] leading-6 text-fg-2">
              {dataMode === 'real'
                ? 'Ausnox plans on real Mars terrain: NASA and USGS orbital observations of Jezero crater. Routes and daylight are calculated from that data; the mission itself is hypothetical.'
                : 'This build runs on demonstration data. The pages below describe the real sources and models, and what stands in for them today.'}
            </p>
          </header>

          {dataMode === 'mock' ? (
            <StatusAlert tone="info" title="Running on demonstration data">
              No NASA or USGS dataset is loaded in this build. The map shows a synthetic surface, routes are demonstration arcs and daylight times are
              fixed examples. Everything served this way is labelled Illustrative
            </StatusAlert>
          ) : terrainError ? (
            <StatusAlert tone="bad" title="Real terrain could not be loaded">
              {terrainError.detail}. Nothing is estimated in its place, so placement, routing and feasibility are unavailable
            </StatusAlert>
          ) : null}

          {/* Critical findings surface here, not only further down. */}
          <div className="flex flex-col gap-4 rounded-panel border border-bad/40 bg-bad/[0.06] p-5 sm:flex-row sm:items-center">
            <ShieldAlert className="size-5 shrink-0 text-bad" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium">
                {grouped[0]!.items.length} critical {grouped[0]!.items.length === 1 ? 'finding' : 'findings'} to know before reading results
              </p>
              <p className="mt-1 text-[13px] leading-5 text-fg-2">
                {dataMode === 'real'
                  ? `${x2b ? `${x2b.id.split('-')[0]}: ` : ''}overlay registration is uncertain by about ±3 m and is unresolved. Ausnox is not for navigation or safety decisions.`
                  : 'Everything is demonstration data. Ausnox is not for navigation or safety decisions.'}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => jump('limitations')} className="self-start sm:self-auto">
              See limitations
              <ArrowRight />
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <OverviewColumn
              kind="observed"
              title="Real observations"
              lead="What NASA and USGS instruments measured: elevation, imagery and where the rover has been."
              records={byKind('observed')}
            />
            <OverviewColumn
              kind="derived"
              title="Calculated models"
              lead="Computed from those observations or from published equations: slope, routes, sunrise and sunset."
              records={byKind('derived')}
            />
            <OverviewColumn
              kind="simulated"
              title="Simulated assumptions"
              lead="Choices that make a mission plannable: walking speed, stop durations, EVA limits and reserves."
              records={byKind('simulated')}
            />
          </div>

        </Section>

        {/* ---------------------------------------------------------- datasets */}
        <Section id="datasets">
          <SectionHeading
            id="datasets"
            title="Scientific datasets"
            intro={
              <>
                Each card has two separate labels. The <span className="text-fg">badge</span> says what kind of science it is; the{' '}
                <span className="text-fg">dot</span> says whether this build uses it. Inspect a card for method, coverage, limits and credit.
              </>
            }
          />

          {/* Key: classification vs integration status, side by side so the difference is obvious. */}
          <dl className="grid gap-4 rounded-panel border border-line bg-surface p-4 text-[13px] md:grid-cols-2 md:p-5">
            <div>
              <dt className="text-xs text-fg-3">Scientific classification · what it is</dt>
              <dd className="mt-2.5 space-y-2">
                {(['observed', 'derived', 'simulated'] as BadgeKind[]).map((k) => (
                  <p key={k} className="grid grid-cols-[96px_1fr] items-start gap-3">
                    <KindBadge kind={k} className="justify-self-start" />
                    <span className="text-fg-2">{KIND_META[k].meaning}</span>
                  </p>
                ))}
              </dd>
            </div>
            <div className="border-t border-line pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-5">
              <dt className="text-xs text-fg-3">Integration status · is it used here</dt>
              <dd className="mt-2.5 space-y-2">
                {STATUS_ORDER.filter((s) => dataMode === 'mock' || s !== 'demo-stand-in').map((s) => (
                  <p key={s} className="grid grid-cols-[96px_1fr] items-start gap-3">
                    <StatusPill status={s} className="h-5" />
                    <span className="text-fg-2">{STATUS_META[s].meaning}</span>
                  </p>
                ))}
              </dd>
            </div>
          </dl>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <ChipFilter<'all' | BadgeKind>
              label="Type"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'all', label: 'All', count: records.length },
                ...CLASS_ORDER.filter((k) => records.some((r) => r.kind === k)).map((k) => ({
                  value: k,
                  label: KIND_META[k].label,
                  count: records.filter((r) => r.kind === k).length,
                })),
              ]}
            />
            <ChipFilter<'all' | Integration>
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'All', count: records.length },
                ...STATUS_ORDER.filter((s) => s !== 'unavailable' || records.some((r) => r.integration === s))
                  .filter((s) => dataMode === 'mock' || s !== 'demo-stand-in')
                  .map((s) => ({ value: s, label: STATUS_META[s].label, count: records.filter((r) => r.integration === s).length })),
              ]}
            />
          </div>

          {records.length === 0 ? (
            <StatusAlert tone="unknown" title="No source register available">
              The active adapters did not provide a source register
            </StatusAlert>
          ) : shown.length === 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-card border border-dashed border-line-strong p-4 text-[13px] text-fg-2">
              No sources match these filters
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setKind('all')
                  setStatus('all')
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={`${shown.length} sources`}>
              {shown.map((r) => (
                <DatasetCard key={r.id} r={r} />
              ))}
            </ul>
          )}
        </Section>

        {/* ---------------------------------------------------------- methodology */}
        <Section id="methodology">
          <SectionHeading
            id="methodology"
            title="Methodology"
            intro="How a plan is built, in the order Ausnox runs it. Open any step for the formula and how it was validated."
          />
          <ol className="grid gap-3 md:grid-cols-2">
            {METHODS.map((m, i) => (
              <li key={m.id} className="flex flex-col rounded-panel border border-line bg-surface">
                <div className="flex gap-4 p-5 pb-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-raised text-fg" aria-hidden>
                    <m.icon className="size-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-[15px] leading-6 font-medium">
                        <span className="num mr-2 text-xs text-fg-3">{String(i + 1).padStart(2, '0')}</span>
                        {m.title}
                      </h3>
                      <KindBadge kind={dataMode === 'mock' && /Not implemented/.test(m.now.mock) ? 'illustrative' : m.kind} />
                    </div>
                    <p className="mt-1.5 text-[13px] leading-5 text-fg-2">{m.summary}</p>
                  </div>
                </div>
                <RadixCollapsible.Root className="mt-auto border-t border-line">
                  <RadixCollapsible.Trigger className="tap group flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-xs text-fg-3 transition-colors duration-150 hover:text-fg">
                    <span>Formula and validation</span>
                    <ChevronDown className="size-4 transition-transform duration-150 group-data-[state=open]:rotate-180" aria-hidden />
                  </RadixCollapsible.Trigger>
                  <RadixCollapsible.Content className="space-y-3 px-5 pb-5 text-[13px] leading-5">
                    <p className="text-fg-2">{m.technical}</p>
                    <div className="rounded-card bg-raised p-3.5">
                      <p className="text-xs text-fg-3">In this build</p>
                      <p className="mt-1">{m.now[dataMode]}</p>
                    </div>
                  </RadixCollapsible.Content>
                </RadixCollapsible.Root>
              </li>
            ))}
          </ol>
        </Section>

        {/* ---------------------------------------------------------- limitations */}
        <Section id="limitations">
          <SectionHeading
            id="limitations"
            title="Scientific limitations"
            intro="Known limits of the data and models, stated rather than hidden in the numbers. Most important first."
          />
          <div className="space-y-4">
            {grouped.map(({ s, items }) =>
              items.length === 0 ? null : (
                <div key={s} className={cn('rounded-panel border p-5', SEVERITY_STYLE[s].frame)}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="text-[15px] font-medium">
                      {SEVERITY[s].label} <span className="num ml-1 text-xs font-normal text-fg-3">{items.length}</span>
                    </h3>
                    <p className="text-xs text-fg-3">{SEVERITY[s].hint}</p>
                  </div>
                  <ul className={cn('mt-4 grid gap-x-8 gap-y-5', s !== 'critical' && 'md:grid-cols-2')}>
                    {items.map((l) => (
                      <LimitationItem key={l.title} l={l} />
                    ))}
                  </ul>
                </div>
              ),
            )}
          </div>
          <ul className="grid gap-4 text-[13px] sm:grid-cols-3">
            {[
              ['Nothing is live', 'The habitat is fictional. No astronaut, vehicle or shelter is tracked, and there is no telemetry.'],
              ['Feasible is not safe', 'Feasible always means feasible under the selected assumptions. No route is certified safe.'],
              ['No guessed values', 'Missing data shows as unknown or indeterminate. Gaps are never filled with estimates.'],
            ].map(([t, d]) => (
              <li key={t} className="border-l-2 border-accent/60 pl-3">
                <p className="font-medium">{t}</p>
                <p className="mt-1 leading-5 text-fg-2">{d}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* ---------------------------------------------------------- references */}
        <Section id="references">
          <SectionHeading
            id="references"
            title="Technical references and credits"
            intro="Citations, validation evidence and runtime dependencies, for anyone checking the work."
          />
          <div className="space-y-2.5">
            <Disclosure summary="Citations and attribution" hint={`${records.length} sources, with coverage and resolution`}>
              <ul className="divide-y divide-line">
                {records.map((r) => (
                  <li key={r.id} className="grid gap-1 py-3 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-6">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">{r.title}</p>
                      <p className="mt-0.5 text-xs text-fg-3">{r.attribution}</p>
                    </div>
                    <div className="min-w-0 space-y-0.5 text-xs text-fg-2">
                      <p>
                        <span className="text-fg-3">Coverage</span> {r.coverage}
                      </p>
                      {r.resolution && (
                        <p>
                          <span className="text-fg-3">Resolution</span> <span className="num">{r.resolution}</span>
                        </p>
                      )}
                      {r.sourceUrl && (
                        <a
                          href={r.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full items-center gap-1 text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg"
                        >
                          <span className="truncate">{r.sourceUrl.replace(/^https?:\/\//, '')}</span>
                          <ExternalLink className="size-3 shrink-0" aria-hidden />
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Disclosure>

            {dataMode === 'real' && (
              <Disclosure summary="Validation evidence" hint="Load-time checks on this terrain, and the engine’s validation gates">
                <div className="space-y-5 text-[13px]">
                  <div>
                    <p className="text-xs text-fg-3">This session</p>
                    <ul className="mt-2 space-y-1.5">
                      <EvidenceRow ok={verification?.checksum === 'verified'} label="Terrain checksum (SHA-256)" value={verification?.checksum ?? 'not loaded'} />
                      <EvidenceRow ok={verification?.pipelineValidation === 'passed'} label="Pipeline validation" value={verification?.pipelineValidation ?? 'not loaded'} />
                      {verification?.crossValidation?.checks.map((c) => (
                        <EvidenceRow key={c.id} ok={c.status === 'PASS'} label={c.id} value={c.status} detail={c.summary} />
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs text-fg-3">Scientific engine gates (passed)</p>
                    <ul className="mt-2 grid gap-x-6 gap-y-1.5 md:grid-cols-2">
                      {GATES.map((g) => (
                        <li key={g.id} className="grid grid-cols-[48px_1fr] gap-2">
                          <span className="num text-xs leading-5 text-fg">{g.id}</span>
                          <span className="text-fg-2">{g.what}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-xs text-fg-3">Full report: docs/SCIENTIFIC_VALIDATION_REPORT.md in the project repository.</p>
                </div>
              </Disclosure>
            )}

            {dataMode === 'real' && (
              <Disclosure summary="Network dependencies" hint="What this build contacts at runtime. No account, key or backend">
                <ul className="space-y-3 text-[13px]">
                  {NETWORK.map((s) => (
                    <li key={s.name}>
                      <p className="font-medium">{s.name}</p>
                      <p className="mt-0.5 leading-5 text-fg-2">{s.detail}</p>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}

            <Disclosure summary="Software and project credits">
              <p className="max-w-[78ch] text-[13px] leading-5 text-fg-2">
                {SOFTWARE} NASA Space Apps 2026 project; not endorsed by NASA. Dataset credits are listed under Citations and attribution.
              </p>
            </Disclosure>
          </div>
        </Section>

        {demo && (
          <section aria-labelledby="demo-title" className="space-y-6 border-t border-line pt-10">
            <SectionHeading
              id="demo"
              title="Demo scenarios"
              intro="Puts the demonstration adapters into a failure condition so each unavailable state can be checked. Only exists with mock adapters"
            />
            <fieldset>
              <legend className="sr-only">Demo scenario</legend>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {demo.scenarios.map((s) => (
                  <li key={s.id}>
                    <label className="tap flex h-full cursor-pointer gap-3 rounded-card border border-line bg-surface p-4 transition-colors duration-150 hover:bg-raised has-checked:border-fg-2 has-focus-visible:outline-2 has-focus-visible:outline-accent">
                      <input type="radio" name="demo-scenario" className="mt-1 accent-(--color-fg)" checked={scenario === s.id} onChange={() => void applyScenario(s.id)} />
                      <span>
                        <span className="block text-[13px] font-medium">{s.title}</span>
                        <span className="mt-1 block text-[13px] text-fg-2">{s.description}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => setView('control')}>See it in mission control</Button>
              <p className="text-[13px] text-fg-2" role="status">
                {scenario === 'nominal' ? 'All adapters nominal' : `Active: ${demo.scenarios.find((s) => s.id === scenario)?.title}`}
                {terrainError && ' · terrain is currently unavailable'}
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function EvidenceRow({ ok, label, value, detail }: { ok: boolean; label: string; value: string; detail?: string }) {
  const Icon = ok ? CircleCheck : CircleX
  return (
    <li className="flex gap-2.5">
      <Icon className={cn('mt-0.5 size-4 shrink-0', ok ? 'text-ok' : 'text-bad')} aria-hidden />
      <div className="min-w-0">
        <p>
          {label} <span className={cn('num ml-1 text-xs', ok ? 'text-fg-2' : 'text-bad')}>{value}</span>
        </p>
        {detail && <p className="mt-0.5 text-xs leading-5 text-fg-3">{detail}</p>}
      </div>
    </li>
  )
}
