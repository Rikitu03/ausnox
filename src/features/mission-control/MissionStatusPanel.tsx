import { ArrowRight, Route } from 'lucide-react'
import { EmptyState, PanelHeader, Section, Stat } from '@/components/layout/primitives'
import {
  FeasibilityHeadline,
  MarginBreakdown,
  ResultOrigin,
  RouteComparison,
  ServiceErrorAlert,
  ViolationList,
} from '@/components/planner/MissionBlocks'
import { SourceBadge } from '@/components/provenance/Provenance'
import { Button } from '@/components/ui/button'
import { Collapsible, Skeleton } from '@/components/ui/controls'
import { useActiveResults } from '@/hooks/useActiveResults'
import { useMissionStore } from '@/stores/missionStore'
import { useUiStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'
import { formatDegrees, formatDistance, formatDuration, formatMargin } from '@/utils/format'

/** Right panel in Mission control: the verdict, the key figures and the route comparison. */
export function MissionStatusPanel() {
  const { route, okRoute, assessment, okAssessment, status, stale } = useActiveResults()
  const name = useMissionStore((s) => s.config.name)
  const maxSlope = useMissionStore((s) => s.config.assumptions.maxSlopeDeg)
  const setView = useUiStore((s) => s.setView)
  const firstRun = status === 'calculating' && !assessment
  const travelS = okAssessment?.outboundTravelS != null ? okAssessment.outboundTravelS + okAssessment.returnTravelS! : null

  return (
    <>
      <PanelHeader title="Mission status" meta={name || 'Untitled Marswalk'} actions={<SourceBadge id="eva-assumptions" />} />
      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={status === 'calculating'}>
        <Section>
          <FeasibilityHeadline />
          {assessment && <ResultOrigin source={assessment.source} className="mt-3" />}
        </Section>

        {status === 'idle' ? (
          <Section>
            <EmptyState icon={Route} title="No mission calculated">
              Set a habitat and destination in the planner, then calculate to see route, timing and return margin
            </EmptyState>
          </Section>
        ) : firstRun ? (
          <Section>
            <div className="space-y-3" role="status" aria-label="Calculating mission">
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </Section>
        ) : (
          <div className={cn('transition-opacity duration-150', (stale || status === 'calculating') && 'opacity-45')} aria-hidden={stale || undefined}>
            {okAssessment && (
              <Section>
                <dl>
                  <Stat
                    emphasis
                    label={`Return margin after ${formatDuration(okAssessment.reserveS)} reserve`}
                    value={formatMargin(okAssessment.returnMarginS)}
                    sub={
                      okAssessment.returnMarginS === null
                        ? 'Unknown: a required input is missing'
                        : okAssessment.windowLimitedBy === 'max-eva'
                          ? 'Against the EVA duration limit'
                          : 'Against geometric sunset, terrain shadows ignored'
                    }
                  />
                </dl>
                <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5">
                  <Stat label="Round trip" value={formatDistance(okRoute?.totalDistanceM)} />
                  <Stat label="Walking time" value={formatDuration(travelS)} sub={`${okAssessment.assumptionsUsed.walkingSpeedMps} m/s, simulated`} />
                  <Stat label="Science time" value={formatDuration(okAssessment.scienceS)} />
                  <Stat label="Steepest slope" value={formatDegrees(okRoute?.maxSlopeDeg)} sub={`limit ${maxSlope}°`} />
                </dl>
              </Section>
            )}

            {assessment?.status === 'error' && (
              <Section>
                <ServiceErrorAlert error={assessment} title="Feasibility could not be assessed" />
              </Section>
            )}
            {route?.status === 'error' && !okAssessment && (
              <Section>
                <ServiceErrorAlert error={route} title="Route could not be calculated" />
              </Section>
            )}
            {okAssessment && okAssessment.violations.length > 0 && (
              <Section title="Why">
                <ViolationList assessment={okAssessment} />
              </Section>
            )}

            {okRoute && (
              <Section title="Legs">
                <table className="w-full text-[13px]">
                  <caption className="sr-only">Outbound and return legs</caption>
                  <thead>
                    <tr className="text-xs text-fg-3">
                      <td />
                      <th scope="col" className="pb-2 text-right font-normal">Distance</th>
                      <th scope="col" className="pb-2 text-right font-normal">Climb</th>
                      <th scope="col" className="pb-2 text-right font-normal">Descent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[okRoute.outbound, okRoute.inbound].map((leg) => (
                      <tr key={leg.id} className="border-t border-line">
                        <th scope="row" className="py-2.5 text-left font-normal">
                          <span className="flex items-center gap-2">
                            <span className={cn('w-4 border-t-[3px]', leg.id === 'outbound' ? 'border-out' : 'border-dashed border-ret')} aria-hidden />
                            {leg.id === 'outbound' ? 'Outbound' : 'Return'}
                          </span>
                        </th>
                        <td className="num py-2.5 text-right">{formatDistance(leg.distanceM)}</td>
                        <td className="num py-2.5 text-right">{Math.round(leg.ascentM)} m</td>
                        <td className="num py-2.5 text-right">{Math.round(leg.descentM)} m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-fg-3">
                  {okRoute.identicalLegs ? 'Return retraces the outbound path' : 'Return takes a different, separately routed path'}
                </p>
              </Section>
            )}

            <Section title="Route comparison">
              <RouteComparison />
            </Section>

            {okAssessment && okAssessment.returnMarginS !== null && (
              <Section>
                <Collapsible title="How the margin is calculated">
                  <MarginBreakdown assessment={okAssessment} />
                </Collapsible>
              </Section>
            )}
          </div>
        )}
      </div>
      <footer className="flex gap-3 border-t border-line p-4">
        <Button className="flex-1" onClick={() => setView('summary')}>
          Full summary
          <ArrowRight />
        </Button>
        <Button className="flex-1" onClick={() => setView('simulation')}>
          Simulate
          <ArrowRight />
        </Button>
      </footer>
    </>
  )
}
