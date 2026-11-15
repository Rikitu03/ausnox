import { useEffect, useRef, useState } from 'react'
import { Crosshair, ExternalLink, LocateFixed, MapPinOff } from 'lucide-react'
import { TerrainHistogram } from '@/components/charts/Charts'
import { Details, EmptyState, PanelHeader, Section, Stat, StatusAlert } from '@/components/layout/primitives'
import { LayerControls } from '@/components/map/LayerControls'
import { KindBadge, SourceBadge } from '@/components/provenance/Provenance'
import { Button } from '@/components/ui/button'
import { useDataStore } from '@/stores/dataStore'
import { useMissionStore } from '@/stores/missionStore'
import { useUiStore } from '@/stores/uiStore'
import { formatDegrees, formatGeo, formatGrid, formatMetres } from '@/utils/format'
import { validityIssue } from '@/utils/validation'

function targetPurpose(title: string, description: string) {
  if (title.includes('Three Forks')) return 'Perseverance’s sample depot near the base of the Jezero delta.'
  if (title.includes('Skinner Ridge')) return 'Delta-front rock abraded and cored by Perseverance.'
  return description.split(/(?<=[.!?])\s/)[0]
}

/** Left panel in the Terrain view: layers, then the science waypoints. */
export function LayersPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const waypoints = useDataStore((s) => s.waypoints)
  const waypointsError = useDataStore((s) => s.waypointsError)
  const focusMap = useUiStore((s) => s.focusMap)
  const inspect = useUiStore((s) => s.inspect)
  const attemptPlace = useUiStore((s) => s.attemptPlace)
  const selected = waypoints.find((w) => w.id === selectedId)
  const detailRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selectedId) {
      detailRef.current?.focus({ preventScroll: true })
      detailRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedId])
  return (
    <>
      <PanelHeader title="Layers and science" meta="Explore the surface. Choose a science target." />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Map layers">
          <LayerControls />
        </Section>
        <Section title="Science targets" aside={<SourceBadge id="science-waypoints" />}>
          {waypointsError ? (
            <StatusAlert tone="bad" title="Waypoints unavailable">
              {waypointsError.detail}
            </StatusAlert>
          ) : waypoints.length === 0 ? (
            <EmptyState icon={MapPinOff} title="No science waypoints listed">
              You can still place a destination anywhere with measured terrain
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {waypoints.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    aria-pressed={w.id === selectedId}
                    onClick={() => setSelectedId(w.id)}
                    className="target-choice"
                  >
                    <span className="block text-sm font-medium leading-5">{w.title}</span>
                    <span className="mt-1 block text-xs text-fg-2">
                      {w.labelQuality === 'illustrative' ? 'Illustrative target' : 'Cited rover location'} ·{' '}
                      {w.suggestedDurationMin} min activity
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-fg-2">
                      {targetPurpose(w.title, w.description)}
                    </span>
                    <span className="mt-1 block text-xs text-accent">
                      {w.id === selectedId ? 'Selected' : 'View target'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
        {selected && (
          <div ref={detailRef} tabIndex={-1} aria-label="Selected target details">
            <Section
              title="Selected target"
              aside={<KindBadge kind={selected.labelQuality === 'illustrative' ? 'illustrative' : 'observed'} />}
            >
              <h4 className="text-base font-semibold leading-6">{selected.title}</h4>
              <p className="mt-2 text-[13px] leading-5 text-fg-2">{targetPurpose(selected.title, selected.description)}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    focusMap(selected.position)
                    inspect(selected.position)
                  }}
                >
                  <LocateFixed />
                  Show on map
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    attemptPlace('destination', selected.position, {
                      label: selected.title,
                      waypointId: selected.id,
                      durationMin: selected.suggestedDurationMin,
                    })
                  }
                >
                  Set destination
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    attemptPlace('stop', selected.position, {
                      label: selected.title,
                      waypointId: selected.id,
                      durationMin: selected.suggestedDurationMin,
                    })
                  }
                >
                  Add stop
                </Button>
              </div>
              <Details title="Scientific details">
                {' '}
                <p className="mt-1 text-[13px] text-fg-2">{selected.description}</p>
                <p className="num mt-1 text-xs text-fg-3">
                  {selected.geo
                    ? `${formatGeo(selected.geo.lonEast, 'lon')} · ${formatGeo(selected.geo.latNorth, 'lat')}`
                    : `x ${formatGrid(selected.position.x)} · y ${formatGrid(selected.position.y)}`}
                  {' · '}suggested {selected.suggestedDurationMin} min (simulated)
                </p>
                {selected.observation && (selected.observation.sol !== null || selected.observation.utcDate) && (
                  <p className="mt-0.5 text-xs text-fg-3">
                    Perseverance{selected.observation.sol !== null ? ` sol ${selected.observation.sol}` : ''}
                    {selected.observation.utcDate ? `, ${selected.observation.utcDate}` : ''}
                  </p>
                )}
                {selected.caveats && selected.caveats.length > 0 && (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-fg-3">
                    {selected.caveats.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
                {selected.sources && selected.sources.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-xs">
                    {selected.sources.map((s) => (
                      <li key={s.url + s.label}>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-fg-2 underline-offset-2 hover:underline"
                        >
                          {s.label}
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <SourceBadge id="science-waypoints" />
              </Details>
            </Section>
          </div>
        )}
        <Section>
          <p className="text-xs leading-5 text-fg-2">
            Observed locations and derived terrain are distinct from simulated mission activity.
          </p>
        </Section>
      </div>
    </>
  )
}

/** Right panel in the Terrain view: the selected cell, then the dataset as a whole. */
export function TerrainInspectorPanel() {
  const manifest = useDataStore((s) => s.manifest)
  const raster = useDataStore((s) => s.raster)
  const terrainError = useDataStore((s) => s.terrainError)
  const terrainSource = useDataStore((s) => s.terrainSource)
  const inspected = useUiStore((s) => s.inspected)
  const inspect = useUiStore((s) => s.inspect)
  const maxSlope = useMissionStore((s) => s.config.assumptions.maxSlopeDeg)
  const issue = inspected ? validityIssue(inspected.validity) : null
  const real = manifest !== null && manifest.status !== 'illustrative-demo'
  const v = manifest?.verification

  return (
    <>
      <PanelHeader title="Terrain" meta={manifest ? 'Jezero Crater · surface analysis' : 'No terrain loaded'} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section
          title="Selected cell"
          aside={
            inspected && (
              <Button size="sm" variant="ghost" className="-my-1.5" onClick={() => inspect(null)}>
                Clear
              </Button>
            )
          }
        >
          {!inspected ? (
            <EmptyState icon={Crosshair} title="No cell selected">
              Select any spot on the map to read its elevation, slope and source
            </EmptyState>
          ) : (
            <div aria-live="polite">
              <p className="mb-3 text-xs text-fg-2">{inspected.cell ? `Jezero terrain · cell ${inspected.cell.col}, ${inspected.cell.row}` : 'Outside the terrain grid'}</p>
              {issue ? (
                <div className="mt-3 space-y-2 rounded-card border border-warn/30 bg-bg p-3">
                  <div className="flex items-start gap-2">
                    <KindBadge kind="unknown" />
                    <p className="text-[13px]">{issue}</p>
                  </div>
                  {inspected.validity === 'slope-unknown' && (
                    <p className="text-xs text-fg-2">
                      Measured elevation: {formatMetres(inspected.elevationM, 1)}. Slope needs all eight neighbours
                    </p>
                  )}
                </div>
              ) : (
                <dl className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <Stat
                      label="Elevation"
                      value={formatMetres(inspected.elevationM, 1)}
                      sub={real ? 'above the Mars areoid' : 'above an arbitrary zero'}
                    />
                    <SourceBadge id={manifest?.elevationProvenanceId ?? 'usgs-hirise-dtm'} className="mt-2" />
                  </div>
                  <div>
                    <Stat
                      label="Slope"
                      value={formatDegrees(inspected.slopeDeg)}
                      sub={
                        inspected.slopeDeg! > maxSlope
                          ? `over the ${maxSlope}° limit, blocked`
                          : `within the ${maxSlope}° limit`
                      }
                    />
                    <SourceBadge id={manifest?.slopeProvenanceId ?? 'dem-slope'} className="mt-2" />
                  </div>
                </dl>
              )}
              <Details title="Cell coordinates & reference">
                {' '}
                <p className="num text-xs text-fg-2">
                  x {formatGrid(inspected.grid.x)} · y {formatGrid(inspected.grid.y)}
                  {inspected.cell && ` · cell ${inspected.cell.col}, ${inspected.cell.row}`}
                </p>
                {inspected.geo && (
                  <p className="num mt-0.5 text-xs text-fg-3">
                    {formatGeo(inspected.geo.lonEast, 'lon')} · {formatGeo(inspected.geo.latNorth, 'lat')}{' '}
                    <span className="font-sans">
                      {manifest?.georeference.kind === 'verified'
                        ? 'planetocentric, Mars 2000'
                        : 'nominal, not a verified transform'}
                    </span>
                  </p>
                )}
              </Details>
            </div>
          )}
        </Section>

        {terrainError ? (
          <Section>
            <StatusAlert tone="bad" title="Terrain dataset unavailable">
              {terrainError.detail}. No elevation or slope is shown, and none is estimated
            </StatusAlert>
          </Section>
        ) : manifest && raster ? (
          <>
            <Section
              title="Dataset overview"
              aside={
                manifest.status === 'illustrative-demo' ? (
                  <KindBadge kind="illustrative" />
                ) : (
                  <KindBadge kind="observed" />
                )
              }
            >
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                <Stat
                  label="Dimensions"
                  value={
                    manifest.grid.groundExtentM
                      ? `${(manifest.grid.groundExtentM.eastWest / 1000).toFixed(2)} × ${(manifest.grid.groundExtentM.northSouth / 1000).toFixed(2)} km`
                      : `${manifest.grid.widthM / 1000} × ${manifest.grid.heightM / 1000} km`
                  }
                  sub="east-west × north-south"
                />
                <Stat
                  label="Spatial resolution"
                  value={
                    manifest.grid.groundCellSizeM
                      ? `${manifest.grid.groundCellSizeM.eastWest.toFixed(2)} × ${manifest.grid.groundCellSizeM.northSouth.toFixed(2)} m`
                      : `${manifest.grid.cellSizeM} m`
                  }
                  sub={`${manifest.grid.widthCells} × ${manifest.grid.heightCells} cells${manifest.grid.groundCellSizeM ? `, ${manifest.grid.cellSizeM} m projected` : ''}`}
                />
                <Stat
                  label={real ? 'Cells with slope' : 'Cells with data'}
                  value={`${((manifest.validCellCount / manifest.totalCellCount) * 100).toFixed(1)}%`}
                  sub={real ? 'the rest is never routed through' : 'the rest is unknown'}
                />
                <Stat
                  label="Elevation range"
                  value={`${Math.round(manifest.elevationRangeM[0]).toLocaleString('en-US')} to ${Math.round(manifest.elevationRangeM[1]).toLocaleString('en-US')} m`}
                />
              </dl>
            </Section>
            {v?.crossValidation?.checks.some((c) => c.status !== 'PASS') && (
              <Section>
                <p className="text-xs leading-5 text-warn">
                  Imagery registration remains uncertain (about 3 m). Routes follow the elevation grid. See scientific
                  metadata.
                </p>
              </Section>
            )}
            <Section>
              <Details title="Scientific metadata">
                <p>{manifest.title}</p>{' '}
                {manifest.status === 'illustrative-demo' && (
                  <p className="mb-3 text-[13px] text-fg-2">
                    This surface is synthetic. It stands in for the Jezero HiRISE terrain model until that product is
                    downloaded and validated. No value here is a Mars measurement
                  </p>
                )}
                <p>
                  {manifest.status === 'illustrative-demo'
                    ? 'Synthetic surface, not a Mars measurement.'
                    : 'Measured HiRISE terrain, with slope derived from the elevation grid.'}
                </p>
                {terrainSource && <p className="mt-3 text-xs text-fg-3">{terrainSource.note}</p>}
                <p className="mt-1 text-xs text-fg-3">Georeference: {manifest.georeference.note}</p>
                {v && (
                  <Section title="Verification">
                    <ul className="space-y-1.5 text-[13px]">
                      <li className="flex justify-between gap-3">
                        <span className="text-fg-2">Grid checksum (SHA-256)</span>
                        <span className={v.checksum === 'verified' ? 'text-ok' : 'text-warn'}>
                          {v.checksum === 'verified' ? 'Verified at load' : 'Not checked'}
                        </span>
                      </li>
                      <li className="flex justify-between gap-3">
                        <span className="text-fg-2">Pipeline validation</span>
                        <span className={v.pipelineValidation === 'passed' ? 'text-ok' : 'text-bad'}>
                          {v.pipelineValidation === 'passed' ? 'Passed' : v.pipelineValidation}
                        </span>
                      </li>
                      {v.crossValidation?.checks.map((c) => (
                        <li key={c.id} className="flex justify-between gap-3">
                          <span className="text-fg-2">{c.id.split('-')[0]} cross-check</span>
                          <span className={c.status === 'PASS' ? 'text-ok' : 'text-warn'}>{c.status}</span>
                        </li>
                      ))}
                    </ul>
                    {v.crossValidation?.checks
                      .filter((c) => c.status !== 'PASS')
                      .map((c) => (
                        <StatusAlert key={c.id} tone="warn" title={`Unresolved: ${c.id}`} className="mt-3">
                          {c.summary}. Routing uses only the DTM, so routes are consistent with the elevation grid; the
                          offset affects how overlays line up with imagery. No correction is applied
                        </StatusAlert>
                      ))}
                  </Section>
                )}
              </Details>
            </Section>
            <Section>
              <Details title="Terrain distributions">
                <Section title="Slope distribution" aside={<SourceBadge id={manifest.slopeProvenanceId} />}>
                  <TerrainHistogram raster={raster} kind="slope" limitDeg={maxSlope} />
                </Section>
                <Section title="Elevation distribution" aside={<SourceBadge id={manifest.elevationProvenanceId} />}>
                  <TerrainHistogram raster={raster} kind="elevation" />
                </Section>
              </Details>
            </Section>
          </>
        ) : null}
      </div>
    </>
  )
}
