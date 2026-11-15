import { ArrowRight, Route } from 'lucide-react'
import { Details, EmptyState, FEASIBILITY, PanelHeader, Section, Stat } from '@/components/layout/primitives'
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
import { Skeleton } from '@/components/ui/controls'
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
  const travelS =
    okAssessment?.outboundTravelS != null ? okAssessment.outboundTravelS + okAssessment.returnTravelS! : null

  const verdict = okAssessment ? FEASIBILITY[okAssessment.feasibility] : null
  return (
    <>
      <PanelHeader
        title="Mission status"
        meta={name || 'Untitled Marswalk'}
        actions={<SourceBadge id="eva-assumptions" />}
      />
      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={status === 'calculating'}>
        <Section>
          {verdict && !stale && status !== 'calculating' ? (
            <div className="mission-verdict" role="status" aria-label="Mission verdict">
              <verdict.icon className={cn('size-6 shrink-0', verdict.color)} aria-hidden />
              <div>
                <p className="text-xl font-semibold tracking-tight">
                  {verdict.label}
                </p>
                <p className="mt-1 text-[13px] leading-5 text-fg-2">
                  {okAssessment?.feasibility === 'feasible'
                    ? 'The planned round trip meets the selected mission constraints.'
                    : okAssessment?.feasibility === 'infeasible'
                      ? 'A mission constraint is exceeded. Review the issues below.'
                      : 'Required data is missing. Feasibility cannot be confirmed.'}
                </p>
              </div>
            </div>
          ) : (
            <FeasibilityHeadline />
          )}
          {assessment?.source.kind === 'mock' && (
            <p className="mt-2 text-xs text-warn">Demonstration result · illustrative inputs</p>
          )}
        </Section>

        {status === 'idle' ? (
          <Section>
            <EmptyState icon={Route} title="No mission calculated">
              Set a habitat and a science destination in the planner, then calculate. Route, timing and return margin
              appear here
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
          <div
            className={cn('transition-opacity duration-150', (stale || status === 'calculating') && 'opacity-45')}
            aria-hidden={stale || undefined}
          >
            {okAssessment && (
              <Section>
                <dl>
                  <Stat
                    emphasis
                    label="Return margin"
                    value={formatMargin(okAssessment.returnMarginS)}
                    sub={
                      okAssessment.returnMarginS === null
                        ? 'Unknown. A required input is missing'
                        : okAssessment.windowLimitedBy === 'max-eva'
                          ? `After ${formatDuration(okAssessment.reserveS)} reserve · before EVA limit`
                          : `After ${formatDuration(okAssessment.reserveS)} reserve · before sunset`
                    }
                  />
                </dl>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
                  <Stat label="Round trip" value={formatDistance(okRoute?.totalDistanceM)} />
                  <Stat label="Walking time" value={formatDuration(travelS)} />
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
              <Section title="Route breakdown">
                <div className="grid grid-cols-2 gap-3">
                  {[okRoute.outbound, okRoute.inbound].map((leg) => (
                    <div key={leg.id} className="route-leg">
                      <p className="flex items-center gap-2 text-xs text-fg-2">
                        <span
                          className={cn(
                            'w-4 border-t-2',
                            leg.id === 'outbound' ? 'border-out' : 'border-dashed border-ret',
                          )}
                          aria-hidden
                        />
                        {leg.id === 'outbound' ? 'Outbound' : 'Return'}
                      </p>
                      <p className="mt-2 text-lg font-medium">{formatDistance(leg.distanceM)}</p>
                      <p className="mt-1 text-xs text-fg-2">
                        Climb {Math.round(leg.ascentM)} m · descent {Math.round(leg.descentM)} m
                      </p>
                    </div>
                  ))}
                </div>
                <Details title="Leg interpretation">
                  <p>
                    {okRoute.identicalLegs
                      ? 'Return follows the outbound line.'
                      : 'Return is calculated independently and follows a different line.'}
                  </p>
                </Details>
              </Section>
            )}

            <Section>
              <Details title="Compare route options">
                <RouteComparison />
              </Details>
            </Section>

            <Section>
              <Details title="Scientific explanation">
                {assessment && <ResultOrigin source={assessment.source} />}
                {okAssessment && (
                  <>
                    <p>
                      Walking speed: {okAssessment.assumptionsUsed.walkingSpeedMps} m/s, constant over all terrain.
                      Slope limit: {maxSlope}°. Mission constraints are illustrative.
                    </p>
                    <p>Daylight uses geometric sunset, without terrain shadows, dust or refraction.</p>
                    {okAssessment.returnMarginS !== null && (
                      <div><h4 className="mb-3 font-medium text-fg">How the margin is calculated</h4>
                        <MarginBreakdown assessment={okAssessment} />
                      </div>
                    )}
                  </>
                )}
                <SourceBadge id="route-geometry" />
                <SourceBadge id="mars24-solar" />
              </Details>
            </Section>
          </div>
        )}
      </div>
      <footer className="flex gap-2 border-t border-line p-4">
        <Button variant={okAssessment?.feasibility === 'infeasible' ? 'primary' : 'ghost'} className="flex-1" onClick={() => setView('summary')}>
          Full summary
          <ArrowRight />
        </Button>
        <Button variant={okAssessment?.feasibility === 'infeasible' ? 'secondary' : 'primary'} className="flex-1" onClick={() => setView('simulation')}>
          Simulate
          <ArrowRight />
        </Button>
      </footer>
    </>
  )
}
