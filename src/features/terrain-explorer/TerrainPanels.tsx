import { Crosshair, ExternalLink, LocateFixed, MapPinOff } from 'lucide-react'
import { TerrainHistogram } from '@/components/charts/Charts'
import { EmptyState, PanelHeader, Section, Stat, StatusAlert } from '@/components/layout/primitives'
import { LayerControls } from '@/components/map/LayerControls'
import { KindBadge, SourceBadge } from '@/components/provenance/Provenance'
import { Button } from '@/components/ui/button'
import { useDataStore } from '@/stores/dataStore'
import { useMissionStore } from '@/stores/missionStore'
import { useUiStore } from '@/stores/uiStore'
import { formatDegrees, formatGeo, formatGrid, formatMetres } from '@/utils/format'
import { validityIssue } from '@/utils/validation'

/** Left panel in the Terrain view: layers, then the science waypoints. */
export function LayersPanel() {
  const waypoints = useDataStore((s) => s.waypoints)
  const waypointsError = useDataStore((s) => s.waypointsError)
  const focusMap = useUiStore((s) => s.focusMap)
  const inspect = useUiStore((s) => s.inspect)
  const attemptPlace = useUiStore((s) => s.attemptPlace)
  return (
    <>
      <PanelHeader title="Layers and science" meta="Map layers and their sources" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section>
          <LayerControls />
        </Section>
        <Section title="Science waypoints" aside={<SourceBadge id="science-waypoints" />}>
          {waypointsError ? (
            <StatusAlert tone="bad" title="Waypoints unavailable">
              {waypointsError.detail}
            </StatusAlert>
          ) : waypoints.length === 0 ? (
            <EmptyState icon={MapPinOff} title="No science waypoints listed">
              You can still place a destination anywhere on measured terrain
            </EmptyState>
          ) : (
            <ul className="space-y-6">
              {waypoints.map((w) => (
                <li key={w.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-medium">{w.title}</p>
                    <KindBadge kind={w.labelQuality === 'illustrative' ? 'illustrative' : 'observed'} />
                  </div>
                  <p className="mt-2 text-[13px] text-fg-2">{w.description}</p>
                  <p className="num mt-2 text-xs text-fg-3">
                    {w.geo
                      ? `${formatGeo(w.geo.lonEast, 'lon')} · ${formatGeo(w.geo.latNorth, 'lat')}`
                      : `x ${formatGrid(w.position.x)} · y ${formatGrid(w.position.y)}`}
                    {' · '}{w.suggestedDurationMin} min suggested, simulated
                  </p>
                  {w.observation && (w.observation.sol !== null || w.observation.utcDate) && (
                    <p className="mt-1 text-xs text-fg-3">
                      Perseverance{w.observation.sol !== null ? ` sol ${w.observation.sol}` : ''}
                      {w.observation.utcDate ? `, ${w.observation.utcDate}` : ''}
                    </p>
                  )}
                  {w.caveats && w.caveats.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-fg-3">
                      {w.caveats.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  )}
                  {w.sources && w.sources.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {w.sources.map((s) => (
                        <li key={s.url + s.label}>
                          <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fg-2 underline-offset-2 hover:underline">
                            {s.label}
                            <ExternalLink className="size-3" aria-hidden />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        focusMap(w.position)
                        inspect(w.position)
                      }}
                    >
                      <LocateFixed />
                      Show
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => attemptPlace('destination', w.position, { label: w.title, waypointId: w.id, durationMin: w.suggestedDurationMin })}
                    >
                      Set as destination
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => attemptPlace('stop', w.position, { label: w.title, waypointId: w.id, durationMin: w.suggestedDurationMin })}
                    >
                      Add as stop
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
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
      <PanelHeader title="Terrain" meta={manifest?.title ?? 'No terrain loaded'} />
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
              Select a spot on the map to read its elevation, slope and source
            </EmptyState>
          ) : (
            <div aria-live="polite">
              <p className="num text-xs text-fg-2">
                x {formatGrid(inspected.grid.x)} · y {formatGrid(inspected.grid.y)}
                {inspected.cell && ` · cell ${inspected.cell.col}, ${inspected.cell.row}`}
              </p>
              {inspected.geo && (
                <p className="num mt-1 text-xs text-fg-3">
                  {formatGeo(inspected.geo.lonEast, 'lon')} · {formatGeo(inspected.geo.latNorth, 'lat')}{' '}
                  <span className="font-sans">
                    {manifest?.georeference.kind === 'verified' ? 'planetocentric, Mars 2000' : 'nominal, not a verified transform'}
                  </span>
                </p>
              )}
              {issue ? (
                <div className="mt-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <KindBadge kind="unknown" />
                    <p className="text-[13px]">{issue}</p>
                  </div>
                  {inspected.validity === 'slope-unknown' && (
                    <p className="text-xs text-fg-2">Measured elevation: {formatMetres(inspected.elevationM, 1)}. Slope needs all eight neighbours</p>
                  )}
                </div>
              ) : (
                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
                  <div>
                    <Stat label="Elevation" value={formatMetres(inspected.elevationM, 1)} sub={real ? 'above the Mars areoid' : 'above an arbitrary zero'} />
                    <SourceBadge id={manifest?.elevationProvenanceId ?? 'usgs-hirise-dtm'} className="mt-2" />
                  </div>
                  <div>
                    <Stat
                      label="Slope"
                      value={formatDegrees(inspected.slopeDeg)}
                      sub={inspected.slopeDeg! > maxSlope ? `over ${maxSlope}° limit, blocked` : `within ${maxSlope}° limit`}
                    />
                    <SourceBadge id={manifest?.slopeProvenanceId ?? 'dem-slope'} className="mt-2" />
                  </div>
                </dl>
              )}
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
            <Section title="Dataset" aside={manifest.status === 'illustrative-demo' ? <KindBadge kind="illustrative" /> : <KindBadge kind="observed" />}>
              {manifest.status === 'illustrative-demo' && (
                <p className="mb-5 text-[13px] text-fg-2">
                  Synthetic stand-in until the Jezero HiRISE terrain model is downloaded and validated. No value here is a Mars
                  measurement
                </p>
              )}
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Stat
                  label="Area on the ground"
                  value={
                    manifest.grid.groundExtentM
                      ? `${(manifest.grid.groundExtentM.eastWest / 1000).toFixed(2)} × ${(manifest.grid.groundExtentM.northSouth / 1000).toFixed(2)} km`
                      : `${manifest.grid.widthM / 1000} × ${manifest.grid.heightM / 1000} km`
                  }
                  sub="east-west × north-south"
                />
                <Stat
                  label="Cell size"
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
                <div className="col-span-2">
                  <Stat label="Elevation range" value={`${Math.round(manifest.elevationRangeM[0]).toLocaleString('en-US')} to ${Math.round(manifest.elevationRangeM[1]).toLocaleString('en-US')} m`} />
                </div>
              </dl>
              {terrainSource && <p className="mt-5 text-xs text-fg-3">{terrainSource.note}</p>}
              <p className="mt-2 text-xs text-fg-3">Georeference: {manifest.georeference.note}</p>
            </Section>
            {v && (
              <Section title="Verification">
                <ul className="space-y-2.5 text-[13px]">
                  <li className="flex justify-between gap-3">
                    <span className="text-fg-2">Grid checksum (SHA-256)</span>
                    <span className={v.checksum === 'verified' ? 'text-ok' : 'text-warn'}>{v.checksum === 'verified' ? 'Verified at load' : 'Not checked'}</span>
                  </li>
                  <li className="flex justify-between gap-3">
                    <span className="text-fg-2">Pipeline validation</span>
                    <span className={v.pipelineValidation === 'passed' ? 'text-ok' : 'text-bad'}>{v.pipelineValidation === 'passed' ? 'Passed' : v.pipelineValidation}</span>
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
                      {c.summary}. Routes use only the DTM, so they match the elevation grid; the offset only shifts overlays against
                      imagery. No correction is applied
                    </StatusAlert>
                  ))}
              </Section>
            )}
            <Section title="Slope distribution" aside={<SourceBadge id={manifest.slopeProvenanceId} />}>
              <TerrainHistogram raster={raster} kind="slope" limitDeg={maxSlope} />
            </Section>
            <Section title="Elevation distribution" aside={<SourceBadge id={manifest.elevationProvenanceId} />}>
              <TerrainHistogram raster={raster} kind="elevation" />
            </Section>
          </>
        ) : null}
      </div>
    </>
  )
}
