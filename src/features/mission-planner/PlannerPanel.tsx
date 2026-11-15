import { Flag, House, Keyboard, MapPin, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { EmptyState, PanelHeader, Section, StatusAlert } from '@/components/layout/primitives'
import { KindBadge, SourceBadge } from '@/components/provenance/Provenance'
import { Button } from '@/components/ui/button'
import { Collapsible, NumberField, Segmented, Select, Switch } from '@/components/ui/controls'
import { Tooltip } from '@/components/ui/overlay'
import { ASSUMPTION_LIMITS as LIMITS, services, type GridCoord, type RouteMode } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useMissionStore } from '@/stores/missionStore'
import { useUiStore, type PlacementTarget } from '@/stores/uiStore'
import { formatDegrees, formatGeo, formatGrid, formatLtst, formatMetres } from '@/utils/format'
import { validityIssue } from '@/utils/validation'

function Position({ position }: { position: GridCoord }) {
  // Re-read terrain whenever it reloads.
  useDataStore((s) => s.revision)
  const sample = services.terrain.sample(position)
  const issue = validityIssue(sample.validity)
  const nominal = useDataStore((s) => s.manifest?.georeference.kind !== 'verified')
  return (
    <div className="num mt-1.5 space-y-0.5 text-xs text-fg-2">
      <p>
        x {formatGrid(position.x)} · y {formatGrid(position.y)}
      </p>
      {sample.geo && (
        <p className="text-fg-3">
          {formatGeo(sample.geo.lonEast, 'lon')} · {formatGeo(sample.geo.latNorth, 'lat')}
          {nominal && <span className="font-sans"> nominal</span>}
        </p>
      )}
      {issue ? (
        <p className="font-sans text-bad">Unknown: {issue}</p>
      ) : (
        <p>
          {formatMetres(sample.elevationM, 1)} elevation · {formatDegrees(sample.slopeDeg)} slope
        </p>
      )}
    </div>
  )
}

function PlaceActions({ target, placed }: { target: PlacementTarget; placed: boolean }) {
  const active = useUiStore((s) => s.placement === target)
  const start = useUiStore((s) => s.startPlacement)
  const cancel = useUiStore((s) => s.cancelPlacement)
  const entry = useUiStore((s) => s.openCoordinateEntry)
  const terrainReady = useDataStore((s) => s.manifest !== null)
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" disabled={!terrainReady} aria-pressed={active} onClick={() => (active ? cancel() : start(target))}>
        <MapPin />
        {active ? 'Cancel placing' : placed ? 'Move on map' : 'Place on map'}
      </Button>
      <Button size="sm" variant="ghost" disabled={!terrainReady} onClick={() => entry(target)}>
        <Keyboard />
        Enter coordinates
      </Button>
    </div>
  )
}

function AssumptionRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_116px] items-start gap-3">
      <div className="pt-2">
        <p className="text-[13px]">{label}</p>
        {hint && <p className="text-xs text-fg-3">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

export function PlannerPanel() {
  const config = useMissionStore((s) => s.config)
  const isDemo = useMissionStore((s) => s.isDemo)
  const status = useMissionStore((s) => s.status)
  const stale = useMissionStore((s) => s.stale)
  const issues = useMissionStore((s) => s.issues)
  const routes = useMissionStore((s) => s.routes)
  const m = useMissionStore.getState()
  const waypoints = useDataStore((s) => s.waypoints)
  const waypointsError = useDataStore((s) => s.waypointsError)
  const terrainError = useDataStore((s) => s.terrainError)
  const startPlacement = useUiStore((s) => s.startPlacement)
  const nameId = useId()
  const a = config.assumptions
  const scenarios = services.solar.listScenarios()
  const activeRoute = routes[config.routeMode]
  const calculating = status === 'calculating'
  const hasResults = status !== 'idle'

  // Waypoints go through the same placement check as a click: one on terrain steeper than the
  // slope limit opens the confirm-to-snap prompt instead of being used silently.
  const pickWaypoint = (id: string, as: 'destination' | 'stop') => {
    const wp = waypoints.find((w) => w.id === id)
    if (!wp) return
    useUiStore.getState().attemptPlace(as, wp.position, { label: wp.title, waypointId: wp.id, durationMin: wp.suggestedDurationMin })
  }

  return (
    <>
      <PanelHeader
        title="Mission planner"
        meta={isDemo ? 'Sample mission' : 'Hypothetical Marswalk'}
        actions={
          <>
            <Tooltip label="Load the sample mission">
              <Button size="sm" variant="ghost" onClick={() => useUiStore.getState().loadSample()}>
                Sample
              </Button>
            </Tooltip>
            <Tooltip label="Clear the mission">
              <Button size="sm" variant="ghost" onClick={m.reset}>
                <RotateCcw />
                Reset
              </Button>
            </Tooltip>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section>
          <label htmlFor={nameId} className="mb-1 block text-xs text-fg-3">
            Mission name
          </label>
          <input
            id={nameId}
            value={config.name}
            maxLength={48}
            onChange={(e) => m.setName(e.target.value)}
            className="tap h-9 w-full rounded-ctl border border-line-strong bg-bg px-2.5 text-[13px] outline-none focus:border-fg-2"
          />
          <p className="num mt-1.5 text-xs text-fg-3">{config.id}</p>
        </Section>

        {terrainError && (
          <Section>
            <StatusAlert tone="bad" title="Terrain data unavailable">
              Locations cannot be checked or placed until terrain loads
            </StatusAlert>
          </Section>
        )}

        <Section title="Habitat" aside={<KindBadge kind="simulated" />}>
          {config.habitat ? (
            <div className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-fg text-bg" aria-hidden>
                <House className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px]">Hypothetical habitat</p>
                <Position position={config.habitat.position} />
              </div>
            </div>
          ) : (
            <EmptyState icon={House} title="No habitat yet">
              Pick any cell with terrain data. The habitat is fictional
            </EmptyState>
          )}
          <PlaceActions target="habitat" placed={!!config.habitat} />
        </Section>

        <Section title="Science destination">
          {config.destination ? (
            <div className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-ink" aria-hidden>
                <Flag className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px]">{config.destination.label}</p>
                <Position position={config.destination.position} />
              </div>
              <NumberField
                label={`Science time at ${config.destination.label}`}
                hideLabel
                className="w-24 shrink-0"
                value={config.destination.durationMin}
                onCommit={(v) => m.setStopDuration('destination', v)}
                {...LIMITS.stopDurationMin}
                unit="min"
              />
            </div>
          ) : (
            <EmptyState icon={Flag} title="No destination yet">
              Place it on the map or choose a listed waypoint
            </EmptyState>
          )}
          <PlaceActions target="destination" placed={!!config.destination} />
          <div className="mt-3">
            <Select
              aria-label="Use a science waypoint as the destination"
              value={config.destination?.waypointId ?? ''}
              disabled={waypoints.length === 0}
              onChange={(e) => pickWaypoint(e.target.value, 'destination')}
            >
              <option value="" disabled>
                {waypointsError ? 'Waypoints unavailable' : waypoints.length === 0 ? 'No science waypoints listed' : 'Choose from science waypoints'}
              </option>
              {waypoints.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title} ({w.labelQuality === 'cited' ? 'cited rover position' : 'illustrative'})
                </option>
              ))}
            </Select>
          </div>
        </Section>

        <Section title="Science stops on the way out" aside={<span className="num text-xs text-fg-3">{config.stops.length}</span>}>
          {config.stops.length === 0 ? (
            <p className="text-[13px] text-fg-3">Optional. Stops are visited in the order listed, then the destination</p>
          ) : (
            <ol className="space-y-3">
              {config.stops.map((s, i) => (
                <li key={s.id} className="flex items-start gap-3">
                  <span className="num grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] border-fg text-xs" aria-hidden>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px]">{s.label}</p>
                    <p className="num text-xs text-fg-3">
                      x {formatGrid(s.position.x)} · y {formatGrid(s.position.y)}
                    </p>
                  </div>
                  <NumberField
                    label={`Science time at ${s.label}`}
                    hideLabel
                    className="w-24 shrink-0"
                    value={s.durationMin}
                    onCommit={(v) => m.setStopDuration(s.id, v)}
                    {...LIMITS.stopDurationMin}
                    unit="min"
                  />
                  <Button size="icon" variant="ghost" aria-label={`Remove ${s.label}`} onClick={() => m.removeStop(s.id)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => startPlacement('stop')} disabled={!!terrainError}>
              <Plus />
              Add stop on map
            </Button>
            {waypoints.length > 0 && (
              <Select aria-label="Add a science waypoint as a stop" value="" className="h-8 w-44" onChange={(e) => pickWaypoint(e.target.value, 'stop')}>
                <option value="" disabled>
                  Add a waypoint
                </option>
                {waypoints.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </Section>

        <Section title="Route preference" aside={<SourceBadge id="route-geometry" />}>
          <Segmented<RouteMode>
            label="Route preference"
            value={config.routeMode}
            onChange={m.setRouteMode}
            options={[
              { value: 'shortest', label: 'Shortest traversable' },
              { value: 'lower-slope', label: 'Lower slope' },
            ]}
          />
          <p className="mt-2 text-xs text-fg-3">
            {config.routeMode === 'shortest'
              ? 'Least distance among paths that stay on known terrain under the slope limit'
              : 'Accepts extra distance to avoid steep ground and climbing'}
          </p>
        </Section>

        <Section>
          <Collapsible title="Advanced assumptions" hint="Illustrative values. Not NASA operational limits">
            <div className="space-y-3">
              <AssumptionRow label="Walking speed" hint="Constant on all terrain">
                <NumberField label="Walking speed" hideLabel value={a.walkingSpeedMps} onCommit={(v) => m.setAssumption('walkingSpeedMps', v)} {...LIMITS.walkingSpeedMps} unit="m/s" />
              </AssumptionRow>
              <AssumptionRow label="Slope limit" hint="Steeper cells are blocked">
                <NumberField label="Slope limit" hideLabel value={a.maxSlopeDeg} onCommit={(v) => m.setAssumption('maxSlopeDeg', v)} {...LIMITS.maxSlopeDeg} unit="°" />
              </AssumptionRow>
              <AssumptionRow label="Reserve" hint="Kept free before the deadline">
                <NumberField label="Reserve" hideLabel value={a.reserveMin} onCommit={(v) => m.setAssumption('reserveMin', v)} {...LIMITS.reserveMin} unit="min" />
              </AssumptionRow>
              <AssumptionRow label="Mission start" hint={`${formatLtst(a.startLtstHours)} local true solar time`}>
                <NumberField label="Mission start, Mars clock hours" hideLabel value={a.startLtstHours} onCommit={(v) => m.setAssumption('startLtstHours', v)} {...LIMITS.startLtstHours} unit="h" />
              </AssumptionRow>
              <AssumptionRow label="Warning threshold" hint="Margin that triggers a warning">
                <NumberField label="Warning threshold" hideLabel value={a.warningMarginMin} onCommit={(v) => m.setAssumption('warningMarginMin', v)} {...LIMITS.warningMarginMin} unit="min" />
              </AssumptionRow>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor={`${nameId}-solar`} className="text-[13px]">
                    Daylight scenario
                  </label>
                  <SourceBadge id="mars24-solar" />
                </div>
                <Select id={`${nameId}-solar`} value={a.solarScenarioId} disabled={scenarios.length === 0} onChange={(e) => m.setAssumption('solarScenarioId', e.target.value)}>
                  {scenarios.length === 0 && <option value="">No daylight model available</option>}
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`${nameId}-eva`} className="text-[13px]">
                  Limit EVA duration
                  <span className="block text-xs text-fg-3">Earth hours from mission start</span>
                </label>
                <Switch id={`${nameId}-eva`} label="Limit EVA duration" checked={a.maxEvaEnabled} onChange={(on) => m.setAssumption('maxEvaEnabled', on)} />
              </div>
              {a.maxEvaEnabled && (
                <AssumptionRow label="Maximum EVA duration">
                  <NumberField label="Maximum EVA duration" hideLabel value={a.maxEvaHours} onCommit={(v) => m.setAssumption('maxEvaHours', v)} {...LIMITS.maxEvaHours} unit="h" />
                </AssumptionRow>
              )}
              <Button size="sm" variant="ghost" className="-ml-2.5" onClick={m.restoreDefaultAssumptions}>
                Restore default assumptions
              </Button>
            </div>
          </Collapsible>
        </Section>
      </div>

      <footer className="border-t border-line p-4">
        {issues.length > 0 && (
          <StatusAlert live tone="bad" title="Mission cannot be calculated yet" className="mb-3">
            <ul className="space-y-1">
              {issues.map((i) => (
                <li key={i.message}>{i.message}</li>
              ))}
            </ul>
          </StatusAlert>
        )}
        <Button variant="primary" size="lg" className="w-full" loading={calculating} onClick={() => void m.calculate()}>
          {calculating ? 'Calculating' : hasResults ? 'Recalculate mission' : 'Calculate mission'}
        </Button>
        <p className="mt-2 text-xs text-fg-3" role="status">
          {calculating
            ? 'Calculating both route modes'
            : stale
              ? 'Inputs changed. Shown results are out of date'
              : activeRoute
                ? `Up to date · ${activeRoute.source.kind === 'mock' ? 'demonstration adapters, not the scientific engine' : 'scientific engine'}`
                : 'Not calculated yet'}
        </p>
      </footer>
    </>
  )
}
