import { CircleDashed, LoaderCircle } from 'lucide-react'
import { FEASIBILITY, StatusAlert } from '@/components/layout/primitives'
import { SourceBadge } from '@/components/provenance/Provenance'
import { Switch } from '@/components/ui/controls'
import { useActiveResults } from '@/hooks/useActiveResults'
import type { MissionAssessment, ResultSource, RouteMode, RouteResult, ServiceError } from '@/services'
import { useMissionStore } from '@/stores/missionStore'
import { useUiStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'
import { formatDegrees, formatDistance, formatDuration, formatLtst, formatMargin } from '@/utils/format'

export const MODE_LABEL: Record<RouteMode, string> = { shortest: 'Shortest traversable', 'lower-slope': 'Lower slope' }

/** Says in words whether a result is a demonstration or came from the scientific engine. */
export function ResultOrigin({ source, className }: { source: ResultSource; className?: string }) {
  return (
    <p className={cn('text-xs text-fg-3', className)}>
      <span className="text-fg-2">{source.kind === 'mock' ? 'Demonstration response' : 'Scientific engine result'}</span> · {source.note}
    </p>
  )
}

/** The headline state of the mission, including loading, stale and empty. */
export function FeasibilityHeadline({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { okAssessment, assessment, status, stale } = useActiveResults()
  const text = size === 'lg' ? 'text-xl leading-7' : 'text-base leading-6'
  if (status === 'calculating') {
    return (
      <p className={cn('flex items-center gap-2.5 text-fg-2', text)} role="status">
        <LoaderCircle className="anim-spin size-5 shrink-0" aria-hidden />
        Calculating mission
      </p>
    )
  }
  if (stale) {
    return (
      <p className={cn('flex items-center gap-2.5 text-fg-2', text)} role="status">
        <CircleDashed className="size-5 shrink-0" aria-hidden />
        Out of date. Inputs changed
      </p>
    )
  }
  if (!assessment) {
    return (
      <p className={cn('flex items-center gap-2.5 text-fg-2', text)}>
        <CircleDashed className="size-5 shrink-0" aria-hidden />
        Not calculated
      </p>
    )
  }
  if (!okAssessment) {
    const f = FEASIBILITY.indeterminate
    return (
      <p className={cn('flex items-center gap-2.5', text)} role="status">
        <f.icon className={cn('size-5 shrink-0', f.color)} aria-hidden />
        Indeterminate. Feasibility model unavailable
      </p>
    )
  }
  const f = FEASIBILITY[okAssessment.feasibility]
  return (
    <p className={cn('flex items-center gap-2.5', text)} role="status">
      <f.icon className={cn('size-5 shrink-0', f.color)} aria-hidden />
      {f.label}
    </p>
  )
}

export function ViolationList({ assessment }: { assessment: MissionAssessment }) {
  if (assessment.violations.length === 0) return null
  return (
    <div className="space-y-2">
      {assessment.violations.map((v) => (
        <StatusAlert key={v.code} tone={v.severity === 'violation' ? 'bad' : v.severity === 'warning' ? 'warn' : 'unknown'} title={v.title}>
          {v.detail}
        </StatusAlert>
      ))}
    </div>
  )
}

export function ServiceErrorAlert({ error, title }: { error: ServiceError; title: string }) {
  return (
    <StatusAlert tone={error.code === 'NO_ROUTE' || error.code === 'UNSUPPORTED_SLOPE' ? 'bad' : 'unknown'} title={title}>
      {error.detail}
      <span className="num mt-1 block text-xs text-fg-3">{error.code}</span>
    </StatusAlert>
  )
}

/** The margin sum written out, so the feasibility verdict can be checked by hand. */
export function MarginBreakdown({ assessment }: { assessment: MissionAssessment }) {
  const start = assessment.assumptionsUsed.startLtstHours
  const rows: [string, string, string?][] = [
    [
      assessment.windowLimitedBy === 'max-eva' ? 'Time until the EVA limit' : 'Time from start to sunset',
      formatDuration(assessment.windowEndS),
      `start ${formatLtst(start)}`,
    ],
    ['Walk out', assessment.outboundTravelS === null ? '—' : `− ${formatDuration(assessment.outboundTravelS)}`],
    ['Science', `− ${formatDuration(assessment.scienceS)}`],
    ['Walk back', assessment.returnTravelS === null ? '—' : `− ${formatDuration(assessment.returnTravelS)}`],
    ['Reserve', `− ${formatDuration(assessment.reserveS)}`],
  ]
  return (
    <div>
      <table className="w-full text-[13px]">
        <caption className="sr-only">How the return margin is calculated</caption>
        <tbody>
          {rows.map(([label, value, note]) => (
            <tr key={label} className="border-b border-line">
              <th scope="row" className="py-1.5 text-left font-normal text-fg-2">
                {label}
                {note && <span className="text-fg-3"> · {note}</span>}
              </th>
              <td className="num py-1.5 text-right">{value}</td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="py-2 text-left font-medium">
              Return margin
            </th>
            <td className="num py-2 text-right font-medium">{formatMargin(assessment.returnMarginS)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-xs text-fg-3">
        All durations are Earth time. Mars clock hours are converted before the sum. A missing value makes the result
        indeterminate, never feasible
      </p>
    </div>
  )
}

function cell(route: RouteResult | undefined, pick: (r: Extract<RouteResult, { status: 'ok' }>['route']) => string) {
  return route?.status === 'ok' ? pick(route.route) : '—'
}

/** Side-by-side comparison of the two route modes, with the choice between them. */
export function RouteComparison() {
  const routes = useMissionStore((s) => s.routes)
  const assessments = useMissionStore((s) => s.assessments)
  const mode = useMissionStore((s) => s.config.routeMode)
  const setMode = useMissionStore((s) => s.setRouteMode)
  const compare = useUiStore((s) => s.compare)
  const setCompare = useUiStore((s) => s.setCompare)
  const modes: RouteMode[] = ['shortest', 'lower-slope']
  const a = routes.shortest
  const b = routes['lower-slope']
  const identical =
    a?.status === 'ok' &&
    b?.status === 'ok' &&
    Math.abs(a.route.totalDistanceM - b.route.totalDistanceM) < 0.5 &&
    Math.abs(a.route.maxSlopeDeg - b.route.maxSlopeDeg) < 0.01

  const margin = (m: RouteMode) => {
    const r = assessments[m]
    return r?.status === 'ok' ? formatMargin(r.assessment.returnMarginS) : '—'
  }
  const verdict = (m: RouteMode) => {
    const r = assessments[m]
    return r?.status === 'ok' ? FEASIBILITY[r.assessment.feasibility].short : '—'
  }
  const rows: [string, (m: RouteMode) => string][] = [
    ['Round trip', (m) => cell(routes[m], (r) => formatDistance(r.totalDistanceM))],
    ['Steepest slope', (m) => cell(routes[m], (r) => formatDegrees(r.maxSlopeDeg))],
    ['Total climb', (m) => cell(routes[m], (r) => `${Math.round(r.outbound.ascentM + r.inbound.ascentM)} m`)],
    ['Return margin', margin],
    ['Assessment', verdict],
  ]

  return (
    <div>
      <table className="w-full text-[13px]">
        <caption className="sr-only">Route comparison by mode</caption>
        <thead>
          <tr>
            <td />
            {modes.map((m) => (
              <th key={m} scope="col" className="w-[34%] pb-2 text-right align-bottom font-normal">
                <label
                  className={cn(
                    'tap inline-flex cursor-pointer items-center justify-end gap-1.5 rounded-ctl px-1.5 py-1 text-right has-focus-visible:outline-2 has-focus-visible:outline-accent',
                    mode === m ? 'text-fg' : 'text-fg-2 hover:text-fg',
                  )}
                >
                  <input type="radio" name="compare-mode" className="accent-(--color-fg)" checked={mode === m} onChange={() => setMode(m)} />
                  {MODE_LABEL[m]}
                </label>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-t border-line">
              <th scope="row" className="py-1.5 text-left font-normal text-fg-2">
                {label}
              </th>
              {modes.map((m) => (
                <td key={m} className={cn('num py-1.5 text-right', mode === m ? 'text-fg' : 'text-fg-2')}>
                  {value(m)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {modes.map((m) => {
        const r = routes[m]
        return r?.status === 'error' ? (
          <p key={m} className="mt-2 text-xs text-fg-2">
            {MODE_LABEL[m]}: {r.detail}
          </p>
        ) : null
      })}
      {identical && <p className="mt-2 text-xs text-fg-2">Both modes give the same route for these inputs</p>}
      <div className="mt-3 flex items-center justify-between gap-3">
        <label htmlFor="compare-on-map" className="cursor-pointer text-[13px] text-fg-2">
          Show the other mode on the map
          <span className="block text-xs text-fg-3">Drawn as a thin dotted line</span>
        </label>
        <Switch id="compare-on-map" label="Show the other mode on the map" checked={compare} onChange={setCompare} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-fg-3">
        <SourceBadge id="route-geometry" />
        Demonstration arcs, not pathfinding results
      </div>
    </div>
  )
}
