import { Route } from 'lucide-react'
import type { ReactNode } from 'react'
import { ElevationProfile } from '@/components/charts/Charts'
import { EmptyState, Stat, StatusAlert } from '@/components/layout/primitives'
import {
  FeasibilityHeadline,
  MarginBreakdown,
  MODE_LABEL,
  ResultOrigin,
  RouteComparison,
  ServiceErrorAlert,
  ViolationList,
} from '@/components/planner/MissionBlocks'
import { SourceBadge } from '@/components/provenance/Provenance'
import { DaylightTimeline, TimelineKey } from '@/components/simulation/DaylightTimeline'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/controls'
import { useActiveResults } from '@/hooks/useActiveResults'
import { MARS_HOUR_SECONDS, services, type GridCoord, type RouteLeg } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useMissionStore } from '@/stores/missionStore'
import { useUiStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'
import { formatDegrees, formatDistance, formatDuration, formatGeo, formatGrid, formatLtst, formatMargin } from '@/utils/format'

function Card({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-panel border border-line bg-surface p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function LegCard({ leg, travelS }: { leg: RouteLeg; travelS: number | null }) {
  const outbound = leg.id === 'outbound'
  return (
    <Card
      title={outbound ? 'Outbound route' : 'Return route'}
      aside={<span className={cn('w-8 border-t-[3px]', outbound ? 'border-out' : 'border-dashed border-ret')} aria-hidden />}
    >
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Distance" value={formatDistance(leg.distanceM)} />
        <Stat label="Walking time" value={formatDuration(travelS)} />
        <Stat label="Steepest slope" value={formatDegrees(leg.maxSlopeDeg)} />
        <Stat label="Mean slope" value={formatDegrees(leg.meanSlopeDeg)} />
        <Stat label="Climb" value={`${Math.round(leg.ascentM)} m`} />
        <Stat label="Descent" value={`${Math.round(leg.descentM)} m`} />
      </dl>
      <p className="mt-3 text-xs text-fg-3">
        {outbound
          ? `Via ${leg.waypointDistancesM.map((w) => `${w.label} at ${formatDistance(w.distanceM)}`).join(', ')}`
          : 'Chosen on its own, in the return direction, straight back to the habitat'}
      </p>
    </Card>
  )
}

/** Position as verified lon/lat when the terrain is georeferenced, otherwise as demo grid metres. */
function Where({ p }: { p: GridCoord }) {
  const verified = useDataStore((s) => s.manifest?.georeference.kind === 'verified')
  const geo = verified ? services.terrain.toGeo(p) : null
  return geo ? (
    <>
      {formatGeo(geo.lonEast, 'lon')} · {formatGeo(geo.latNorth, 'lat')}
    </>
  ) : (
    <>
      x {formatGrid(p.x)} · y {formatGrid(p.y)}
    </>
  )
}

export function SummaryView() {
  const config = useMissionStore((s) => s.config)
  const solar = useMissionStore((s) => s.solar)
  const { route, okRoute, assessment, okAssessment, status, stale } = useActiveResults()
  const setView = useUiStore((s) => s.setView)
  const a = okAssessment?.assumptionsUsed ?? config.assumptions
  const day = solar?.status === 'ok' ? solar.day : null
  const scenario = services.solar.listScenarios().find((s) => s.id === a.solarScenarioId)
  const stops = [...config.stops, ...(config.destination ? [config.destination] : [])]
  const busy = status === 'calculating' || stale
  const verifiedGeo = useDataStore((s) => s.manifest?.georeference.kind === 'verified')

  // The same facts as the cards, as one paragraph for screen readers and copy-paste.
  const plain =
    okAssessment && okRoute
      ? `${config.name}: ${MODE_LABEL[config.routeMode]} route, ${formatDistance(okRoute.totalDistanceM)} round trip, ` +
        `${formatDuration(okAssessment.totalMissionS)} including ${formatDuration(okAssessment.scienceS)} of science, steepest slope ${formatDegrees(okRoute.maxSlopeDeg)} ` +
        `against a ${a.maxSlopeDeg}° limit. Return margin ${formatMargin(okAssessment.returnMarginS)} after a ${formatDuration(okAssessment.reserveS)} reserve. ` +
        `Assessment: ${okAssessment.feasibility} under selected assumptions. ` +
        (okRoute.terrainAwarePathfinding
          ? 'Scientific engine result on real NASA/USGS terrain; constraints are illustrative, not for navigation.'
          : 'Demonstration result, not for navigation.')
      : null

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1120px] space-y-4 px-4 py-6 sm:px-6 sm:py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="num text-xs text-fg-3">{config.id}</p>
            <h1 className="mt-1 truncate text-2xl leading-8 font-medium">{config.name || 'Untitled Marswalk'}</h1>
            <p className="mt-1 text-[13px] text-fg-2">
              Mission summary · {MODE_LABEL[config.routeMode]} route · hypothetical EVA, simulated
            </p>
          </div>
          <Button onClick={() => setView('control')}>Edit mission</Button>
        </header>

        {status === 'idle' ? (
          <EmptyState
            icon={Route}
            title="No mission calculated"
            action={
              <Button variant="primary" onClick={() => setView('control')}>
                Open mission planner
              </Button>
            }
          >
            The summary fills in once a habitat and destination are set and the mission is calculated
          </EmptyState>
        ) : (
          <>
            <section className="rounded-panel border border-line bg-surface p-5" aria-busy={busy}>
              <FeasibilityHeadline size="lg" />
              {assessment && !busy && <ResultOrigin source={assessment.source} className="mt-2" />}
              {busy && !okAssessment ? (
                <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : okAssessment ? (
                <dl className={cn('mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6', busy && 'opacity-45')}>
                  <div className="col-span-2">
                    <Stat emphasis label="Return margin" value={formatMargin(okAssessment.returnMarginS)} sub={`after ${formatDuration(okAssessment.reserveS)} reserve`} />
                  </div>
                  <Stat label="Total distance" value={formatDistance(okRoute?.totalDistanceM)} />
                  <Stat label="Mission duration" value={formatDuration(okAssessment.totalMissionS)} sub="walking plus science" />
                  <Stat
                    label="Walking time"
                    value={formatDuration(okAssessment.outboundTravelS !== null ? okAssessment.outboundTravelS + okAssessment.returnTravelS! : null)}
                  />
                  <Stat label="Science time" value={formatDuration(okAssessment.scienceS)} />
                </dl>
              ) : null}
              {plain && <p className="sr-only">{plain}</p>}
            </section>

            {assessment?.status === 'error' && <ServiceErrorAlert error={assessment} title="Feasibility could not be assessed" />}
            {route?.status === 'error' && <ServiceErrorAlert error={route} title="Route could not be calculated" />}
            {okAssessment && okAssessment.violations.length > 0 && (
              <Card title="Warnings and violated constraints">
                <ViolationList assessment={okAssessment} />
              </Card>
            )}

            <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
              <Card title="Elevation profile" aside={<SourceBadge id="usgs-hirise-dtm" />}>
                {okRoute ? (
                  <>
                    <ElevationProfile route={okRoute} maxSlopeDeg={a.maxSlopeDeg} />
                    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-4">
                      <dl className="flex gap-6">
                        <Stat label="Steepest slope on route" value={formatDegrees(okRoute.maxSlopeDeg)} />
                        <Stat label="Slope limit" value={`${a.maxSlopeDeg}°`} />
                      </dl>
                      <div className="min-w-40 flex-1">
                        <div className="relative h-2 rounded-full bg-raised" aria-hidden>
                          <div className="absolute inset-y-0 left-0 rounded-full bg-fg-2" style={{ width: `${Math.min(100, (okRoute.maxSlopeDeg / a.maxSlopeDeg) * 100)}%` }} />
                        </div>
                        <p className="mt-1.5 text-xs text-fg-3">
                          {((okRoute.maxSlopeDeg / a.maxSlopeDeg) * 100).toFixed(0)}% of the limit. Slope is per terrain cell and cannot see rocks or loose ground
                        </p>
                      </div>
                    </div>
                  </>
                ) : busy ? (
                  <Skeleton className="h-64" />
                ) : (
                  <StatusAlert tone="unknown" title="No profile to show">
                    There is no route, so no elevation profile is drawn
                  </StatusAlert>
                )}
              </Card>

              <Card title="Endpoints and stops">
                <ol className="space-y-3 text-[13px]">
                  <li className="flex items-start justify-between gap-3">
                    <span>
                      Habitat <span className="text-fg-3">· hypothetical</span>
                    </span>
                    <span className="num text-right text-xs text-fg-2">{config.habitat ? <Where p={config.habitat.position} /> : 'Not set'}</span>
                  </li>
                  {stops.map((s, i) => (
                    <li key={s.id} className="flex items-start justify-between gap-3 border-t border-line pt-3">
                      <span>
                        {s.label}
                        <span className="text-fg-3"> · {i === stops.length - 1 ? 'destination' : `stop ${i + 1}`} · {s.durationMin} min science</span>
                      </span>
                      <span className="num shrink-0 text-right text-xs text-fg-2">
                        <Where p={s.position} />
                      </span>
                    </li>
                  ))}
                  {!config.destination && <li className="border-t border-line pt-3 text-fg-3">Destination not set</li>}
                </ol>
                <p className="mt-4 text-xs text-fg-3">
                  {verifiedGeo
                    ? 'Planetocentric longitude and latitude, Mars 2000 (same transform as the scientific engine)'
                    : 'Grid metres on the demo terrain. Not verified Mars coordinates'}
                </p>
              </Card>
            </div>

            {okRoute && okAssessment && (
              <div className="grid gap-4 md:grid-cols-2">
                <LegCard leg={okRoute.outbound} travelS={okAssessment.outboundTravelS} />
                <LegCard leg={okRoute.inbound} travelS={okAssessment.returnTravelS} />
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Daylight and timing" aside={<SourceBadge id="mars24-solar" />}>
                <DaylightTimeline />
                <div className="mt-3">
                  <TimelineKey />
                </div>
                {okAssessment && (
                  <ol className="mt-4 divide-y divide-line border-t border-line text-[13px]">
                    {okAssessment.events.map((e, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
                        <span>{e.label}</span>
                        <span className="num shrink-0 text-xs text-fg-2">
                          {formatLtst(a.startLtstHours + e.atS / MARS_HOUR_SECONDS)} · T+{formatDuration(e.atS)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                {solar?.status === 'error' && (
                  <StatusAlert tone="unknown" title="Daylight window unknown" className="mt-4">
                    {solar.detail}
                  </StatusAlert>
                )}
              </Card>
              <div className="space-y-4">
                {okAssessment && okAssessment.returnMarginS !== null && (
                  <Card title="How the margin is calculated" aside={<SourceBadge id="eva-assumptions" />}>
                    <MarginBreakdown assessment={okAssessment} />
                  </Card>
                )}
                <Card title="Route comparison">
                  <RouteComparison />
                </Card>
              </div>
            </div>

            <Card title="Model assumptions used" aside={<SourceBadge id="eva-assumptions" />}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Walking speed" value={`${a.walkingSpeedMps} m/s`} sub="constant" />
                <Stat label="Slope limit" value={`${a.maxSlopeDeg}°`} />
                <Stat label="Reserve" value={`${a.reserveMin} min`} />
                <Stat label="Mission start" value={formatLtst(a.startLtstHours)} sub="local solar time" />
                <Stat label="EVA limit" value={a.maxEvaEnabled ? `${a.maxEvaHours} h` : 'Off'} />
                <Stat label="Daylight" value={day ? `${formatLtst(day.sunriseLtstHours)}–${formatLtst(day.sunsetLtstHours)}` : '—'} sub={scenario?.title} />
              </dl>
              <ul className="mt-5 space-y-1.5 border-t border-line pt-4 text-[13px] text-fg-2">
                <li>These are illustrative planning values chosen in this app. They are not NASA operational limits</li>
                <li>
                  {okRoute?.outbound.surfaceDistanceM !== undefined
                    ? 'Walking time is the 3-D surface length of the route divided by a constant speed. Slope does not slow the walker in this model'
                    : 'Walking time is distance divided by a constant speed. Slope does not slow the walker in this model'}
                </li>
                <li>The reserve is kept apart from the mission duration and subtracted from the time available</li>
                {okRoute && <li>Route: {okRoute.method}</li>}
                {day?.approximations.map((x) => <li key={x}>Daylight: {x}</li>)}
                <li>Feasible means the plan fits these assumptions. It is never a statement that the walk is safe</li>
              </ul>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
