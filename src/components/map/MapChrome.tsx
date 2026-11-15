import { Box, ChevronUp, Crosshair, Layers, LocateFixed, Maximize2, Minimize2, Minus, Plus, RefreshCw, Scan, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useState, type FormEvent } from 'react'
import { StatusAlert } from '@/components/layout/primitives'
import { KindBadge, SourceBadge } from '@/components/provenance/Provenance'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/controls'
import { Dialog, Tooltip } from '@/components/ui/overlay'
import { services, type GridCoord } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useMapStore } from '@/stores/mapStore'
import { useUiStore, type PlacementTarget } from '@/stores/uiStore'
import { cn } from '@/utils/cn'
import { formatDegrees, formatGeo, formatGrid, formatMetres } from '@/utils/format'
import { placementIssue, validityIssue } from '@/utils/validation'
import { LayerControls, LayerLegend } from './LayerControls'
import { ThreeLegendNotes } from './three/ThreeChrome'

const TARGET_LABEL: Record<PlacementTarget, string> = {
  habitat: 'habitat',
  destination: 'science destination',
  stop: 'science stop',
}

const float = 'rounded-card border border-line-strong bg-surface'

function ToolButton({ label, onClick, pressed, children }: { label: string; onClick?: () => void; pressed?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip label={label} side="right">
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className={cn(pressed ? 'bg-accent text-accent-ink hover:bg-accent/90 hover:text-accent-ink' : 'text-fg')}
      >
        {children}
      </Button>
    </Tooltip>
  )
}

/** Shared zoom, fit and layer controls for both renderers. */
export function MapTools({ className, showLayers }: { className?: string; showLayers: boolean }) {
  const map = useMapStore((s) => s.map)
  const three = useMapStore((s) => s.threeControls)
  const mode = useUiStore((s) => s.mapMode)
  const focusMap = useUiStore((s) => s.focusMap)
  return (
    <div className={cn('flex flex-col gap-2', className)} role="toolbar" aria-label="Map tools" aria-orientation="vertical">
      <div className={cn(float, 'flex flex-col p-1')}>
        <ToolButton label="Zoom in" onClick={() => mode === '3d' ? three?.zoom(0.8) : map?.zoomIn()}>
          <Plus />
        </ToolButton>
        <ToolButton label="Zoom out" onClick={() => mode === '3d' ? three?.zoom(1.25) : map?.zoomOut()}>
          <Minus />
        </ToolButton>
        <ToolButton label="Fit terrain coverage" onClick={() => focusMap()}>
          <Scan />
        </ToolButton>
      </div>
      <div className={cn(float, 'flex flex-col p-1')}>
        {showLayers && (
          <Popover.Root>
            <Tooltip label="Map layers" side="right">
              <Popover.Trigger asChild>
                <Button variant="ghost" size="icon" aria-label="Map layers" className="text-fg">
                  <Layers />
                </Button>
              </Popover.Trigger>
            </Tooltip>
            <Popover.Portal>
              <Popover.Content
                side="right"
                align="start"
                sideOffset={10}
                collisionPadding={12}
                className="anim-fade z-[1000] max-h-[min(560px,calc(100dvh-140px))] w-[min(340px,calc(100vw-80px))] overflow-y-auto rounded-panel border border-line-strong bg-surface p-4"
              >
                <LayerControls />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
        <ToolButton label="3D terrain view" pressed={mode === '3d'} onClick={() => useUiStore.getState().setMapMode(mode === '3d' ? '2d' : '3d')}>
          <Box aria-hidden />
        </ToolButton>
      </div>
    </div>
  )
}

const LINE_KEY = [
  { label: 'Outbound route', line: 'border-t-[3px] border-out' },
  { label: 'Return route', line: 'border-t-[3px] border-dashed border-ret' },
  { label: 'Terrain coverage boundary', line: 'border-t-2 border-dashed border-fg-2' },
]

/** Always-available key to lines, markers, active overlays and their sources. Opens upward from the lower-left corner. */
export function MapLegend({ className }: { className?: string }) {
  const layers = useDataStore((s) => s.layers)
  const overlays = useUiStore((s) => s.overlays)
  const basemapId = useUiStore((s) => s.basemapId)
  const mode = useUiStore((s) => s.mapMode)
  const basemap = layers.find((l) => l.id === basemapId)
  const active = layers.filter((l) => l.role === 'overlay' && overlays[l.id])
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(float, 'tap group flex h-9 shrink-0 items-center gap-2 px-3 text-[13px] text-fg transition-colors duration-150 hover:bg-raised', className)}
        >
          Legend
          <ChevronUp className="size-4 text-fg-3 transition-transform duration-150 group-data-[state=open]:rotate-180" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          aria-label="Map legend"
          className="anim-fade z-[1000] max-h-[min(520px,calc(100dvh-160px))] w-[min(300px,calc(100vw-24px))] space-y-3 overflow-y-auto rounded-panel border border-line-strong bg-surface p-3 text-[13px]"
        >
          {mode === '3d' ? (
            <ThreeLegendNotes />
          ) : (
            basemap && (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span>{basemap.title}</span>
                  <SourceBadge id={basemap.provenanceId} kind={basemap.illustrative ? 'illustrative' : undefined} />
                </div>
                {basemap.illustrative && <p className="mt-1 text-xs text-fg-3">A drawing of synthetic terrain. Not NASA imagery</p>}
                {basemap.caveat && <p className="mt-1 text-xs text-warn">{basemap.caveat}</p>}
                <BasemapAttribution className="mt-1" />
              </div>
            )
          )}
          <ul className="space-y-1.5 border-t border-line pt-3">
            {LINE_KEY.map((k) => (
              <li key={k.label} className="flex items-center gap-2.5 text-fg-2">
                <span className={cn('w-6 shrink-0', k.line)} aria-hidden />
                {k.label}
              </li>
            ))}
            <li className="flex items-center gap-2.5 text-fg-2">
              <span className="hatch size-3 shrink-0 rounded-[3px] border border-line-strong bg-raised" aria-hidden />
              No terrain data or unknown slope
            </li>
          </ul>
          <ul className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-fg-2">
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-[4px] bg-fg" aria-hidden />
              Habitat
            </li>
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-accent" aria-hidden />
              Destination
            </li>
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-full border-[1.5px] border-fg" aria-hidden />
              Science stop
            </li>
            <li className="flex items-center gap-2">
              <span className="size-2.5 rotate-45 rounded-[2px] border-[1.5px] border-fg-2" aria-hidden />
              Waypoint
            </li>
          </ul>
          {mode === '2d' &&
            active.map((l) => (
              <div key={l.id} className="border-t border-line pt-3">
                <div className="flex items-center justify-between gap-2">
                  <span>{l.title}</span>
                  <SourceBadge id={l.provenanceId} kind={l.illustrative ? 'illustrative' : undefined} />
                </div>
                <LayerLegend layer={l} />
              </div>
            ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/**
 * Focus map: hides every panel so the map takes the whole workspace, and brings the saved layout back
 * on exit. Escape also exits; the workspace handles it so it never fights an open dialog.
 */
export function FocusMapButton({ compact }: { compact: boolean }) {
  const on = useUiStore((s) => s.focusMode)
  const set = useUiStore((s) => s.setFocusMode)
  const label = on ? 'Exit focus map' : 'Focus map'
  return (
    <Tooltip label={on ? 'Bring the panels back' : 'Hide the panels and give the map the whole workspace'} side="bottom">
      <Button
        aria-pressed={on}
        aria-label={label}
        aria-keyshortcuts={on ? 'Escape' : undefined}
        size={compact ? 'icon' : 'md'}
        onClick={() => set(!on)}
        className={cn('bg-surface', on && 'border-accent/50')}
      >
        {on ? <Minimize2 className="text-accent" aria-hidden /> : <Maximize2 aria-hidden />}
        {!compact && <span aria-hidden>{on ? 'Exit focus' : 'Focus map'}</span>}
        {!compact && on && (
          <kbd className="key" aria-hidden>
            Esc
          </kbd>
        )}
      </Button>
    </Tooltip>
  )
}

/** The selected terrain cell, lower-right on the map, with its source. Cleared with its close button. */
export function InspectedCell({ className }: { className?: string }) {
  const inspected = useUiStore((s) => s.inspected)
  const issue = useUiStore((s) => s.placementIssue)
  const inspect = useUiStore((s) => s.inspect)
  const manifest = useDataStore((s) => s.manifest)
  if (!inspected || issue) return null
  const measured = manifest?.status !== 'illustrative-demo'
  return (
    <div className={cn(float, 'anim-fade w-[min(320px,100%)] py-1.5 pr-1.5 pl-3 text-xs', className)} role="status">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-fg">
          {measured ? 'Measured terrain' : 'Demo terrain'} · {inspected.validity}
        </span>
        <div className="flex items-center gap-1">
          <SourceBadge id={manifest?.elevationProvenanceId ?? 'usgs-hirise-dtm'} />
          <Button variant="ghost" size="icon-sm" aria-label="Clear selected cell" className="size-7" onClick={() => inspect(null)}>
            <X />
          </Button>
        </div>
      </div>
      <p className="num pr-1.5 pb-0.5 text-fg-2">
        {inspected.geo && `${formatGeo(inspected.geo.lonEast, 'lon')} · ${formatGeo(inspected.geo.latNorth, 'lat')} · `}
        {formatMetres(inspected.elevationM, 1)} · slope {inspected.slopeDeg === null ? 'unknown' : formatDegrees(inspected.slopeDeg)}
      </p>
    </div>
  )
}

const NICE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]

/**
 * Pointer readout and scale. The scale is measured on the Mars sphere (R = 3,396,190 m) east-west at
 * the map centre, never an Earth scale. North-south the equirectangular map is 1/cos(lat) longer.
 */
export function CoordinateBar({ className, quiet }: { className?: string; quiet?: boolean }) {
  const hover = useMapStore((s) => s.hover)
  const metresPerPx = useMapStore((s) => s.metresPerPx)
  const inspected = useUiStore((s) => s.inspected)
  const georef = useDataStore((s) => s.manifest?.georeference.kind)
  const mode = useUiStore((s) => s.mapMode)
  const issueOpen = useUiStore((s) => s.placementIssue !== null)
  // While the selected-cell card is up it carries the selection; this bar then reads the pointer only.
  const cardShown = inspected !== null && !issueOpen
  const sample = hover ?? (cardShown ? null : inspected)
  // A perspective view has no single scale; the bar belongs to the flat map only.
  const pxPerM = metresPerPx && mode === '2d' ? 1 / metresPerPx : null
  const length = pxPerM ? ([...NICE].reverse().find((n) => n * pxPerM <= 110) ?? NICE[0]!) : null
  const issue = sample ? validityIssue(sample.validity) : null
  // Focus map drops the hint text; with no scale and no cell there is then nothing to show.
  if ((quiet || cardShown) && !sample && length === null) return null
  return (
    <div className={cn(float, 'flex h-9 items-center gap-4 overflow-hidden px-3 text-xs text-fg-2', className)}>
      {length !== null && pxPerM !== null && (
        <div className="flex shrink-0 items-center gap-2" aria-label={`Map scale: bar is ${length} metres on Mars, east-west`}>
          <span className="block h-1.5 border-x border-b border-fg-2" style={{ width: length * pxPerM }} aria-hidden />
          <span className="num">{length >= 1000 ? `${length / 1000} km` : `${length} m`}</span>
        </div>
      )}
      {pxPerM !== null && <div className="h-4 w-px shrink-0 bg-line-strong" aria-hidden />}
      {sample ? (
        <div className="num flex min-w-0 items-center gap-4 whitespace-nowrap">
          <span className="hidden lg:inline" title="Grid metres from the south-west corner of the terrain grid">
            x {formatGrid(sample.grid.x)} · y {formatGrid(sample.grid.y)}
          </span>
          {sample.geo && (
            <span className="hidden md:inline">
              {formatGeo(sample.geo.lonEast, 'lon')} · {formatGeo(sample.geo.latNorth, 'lat')}
              {georef === 'nominal-demo' && <span className="font-sans text-fg-3"> nominal</span>}
            </span>
          )}
          {issue ? (
            <span className="truncate font-sans text-fg">
              {sample.validity === 'slope-unknown'
                ? `${formatMetres(sample.elevationM, 1)} · slope unknown`
                : `Unknown: ${issue.split('.')[0]!.toLowerCase()}`}
            </span>
          ) : (
            <span className="text-fg">
              {formatMetres(sample.elevationM, 1)} · {formatDegrees(sample.slopeDeg)}
            </span>
          )}
        </div>
      ) : quiet || cardShown ? null : (
        <span className="truncate">Move over the map or select a cell to read terrain values</span>
      )}
    </div>
  )
}

/** Instructions while placing, and the explicit snap choice after a refused placement. */
export function PlacementBanner({ className }: { className?: string }) {
  const placement = useUiStore((s) => s.placement)
  const issue = useUiStore((s) => s.placementIssue)
  const cancel = useUiStore((s) => s.cancelPlacement)
  const confirmSnap = useUiStore((s) => s.confirmSnap)
  const openEntry = useUiStore((s) => s.openCoordinateEntry)
  if (!placement && !issue) return null
  const target = issue?.target ?? placement!
  return (
    <div className={cn(float, 'anim-rise w-[min(440px,calc(100vw-24px))] p-3', className)} role="status" aria-live="polite">
      {issue ? (
        <StatusAlert
          tone="warn"
          title={issue.meta ? `${issue.meta.label} cannot be the ${TARGET_LABEL[target]} as placed` : `That spot cannot be the ${TARGET_LABEL[target]}`}
          className="border-0 bg-transparent p-0"
          action={
            <>
              {issue.snap && (
                <Button size="sm" variant="primary" onClick={confirmSnap}>
                  Use nearest usable cell, {formatMetres(issue.snapDistanceM, 0)} away
                  {issue.snapSlopeDeg !== null ? ` (${formatDegrees(issue.snapSlopeDeg)})` : ''}
                </Button>
              )}
              <Button size="sm" onClick={() => useUiStore.setState({ placementIssue: null, placement: target })}>
                Pick another spot
              </Button>
              <Button size="sm" variant="ghost" onClick={cancel}>
                Cancel
              </Button>
            </>
          }
        >
          {placementIssue(issue.validity, issue.slopeDeg, issue.maxSlopeDeg)}.{' '}
          {issue.snap
            ? `The dashed marker shows the nearest cell with known slope at or below ${issue.maxSlopeDeg}°. Nothing moves unless you choose it`
            : 'No usable cell within 400 m'}
        </StatusAlert>
      ) : (
        <div className="flex items-center gap-3">
          <LocateFixed className="size-4 shrink-0 text-accent" aria-hidden />
          <p className="min-w-0 flex-1 text-[13px]">
            Select a spot on the map for the {TARGET_LABEL[target]}
            <span className="block text-xs text-fg-3">Any cell with measured terrain at or below the slope limit works. Press Escape to cancel</span>
          </p>
          <Button size="sm" onClick={() => openEntry(target)}>
            Enter coordinates
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Cancel placement" onClick={cancel}>
            <X />
          </Button>
        </div>
      )}
    </div>
  )
}

/** Keyboard alternative to clicking the map: type grid metres or nominal longitude/latitude. */
export function CoordinateEntryDialog() {
  const target = useUiStore((s) => s.coordinateEntry)
  const close = () => useUiStore.getState().openCoordinateEntry(null)
  const attemptPlace = useUiStore((s) => s.attemptPlace)
  const confirmSnap = useUiStore((s) => s.confirmSnap)
  const issue = useUiStore((s) => s.placementIssue)
  const manifest = useDataStore((s) => s.manifest)
  const [mode, setMode] = useState<'grid' | 'geo'>('grid')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!target) return
    const n1 = Number(a)
    const n2 = Number(b)
    if (a.trim() === '' || b.trim() === '' || !Number.isFinite(n1) || !Number.isFinite(n2)) {
      return setError('Enter a number in both fields')
    }
    let point: GridCoord | null = { x: n1, y: n2 }
    if (mode === 'geo') point = services.terrain.fromGeo({ lonEast: n1, latNorth: n2 })
    if (!point) return setError('Longitude and latitude cannot be converted because terrain is not loaded')
    setError(null)
    // On refusal the dialog stays open and shows the reason plus the snap choice.
    useUiStore.setState({ placement: target })
    attemptPlace(target, point)
  }

  const labels = mode === 'grid' ? (['x, metres east', 'y, metres north'] as const) : (['Longitude, degrees east', 'Latitude, degrees north'] as const)
  const verified = manifest?.georeference.kind === 'verified'
  const geoRange = (() => {
    if (!manifest) return null
    const sw = services.terrain.toGeo({ x: 0, y: 0 })
    const ne = services.terrain.toGeo({ x: manifest.grid.widthM, y: manifest.grid.heightM })
    return sw && ne ? `${sw.lonEast.toFixed(5)}–${ne.lonEast.toFixed(5)}° E, ${sw.latNorth.toFixed(5)}–${ne.latNorth.toFixed(5)}° N` : null
  })()
  const range = manifest
    ? mode === 'grid'
      ? verified
        ? `Grid metres from the south-west corner: x 0 to ${manifest.grid.widthM} m, y 0 to ${manifest.grid.heightM} m. These are projected metres; east-west they are about 5% longer than ground metres`
        : `Terrain spans x 0 to ${manifest.grid.widthM} m and y 0 to ${manifest.grid.heightM} m`
      : verified
        ? `Planetocentric latitude, east-positive longitude (Mars 2000). Terrain covers ${geoRange}`
        : 'Longitude and latitude use the nominal demo placement and are not a verified transform'
    : 'Terrain is not loaded'

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(o) => {
        if (!o) {
          close()
          useUiStore.getState().cancelPlacement()
          setError(null)
        }
      }}
      title={target ? `Enter ${TARGET_LABEL[target]} coordinates` : 'Enter coordinates'}
      description="Use this instead of selecting a spot on the map"
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Segmented
          label="Coordinate type"
          value={mode}
          onChange={(m) => {
            setMode(m)
            setA('')
            setB('')
            setError(null)
          }}
          options={[
            { value: 'grid', label: 'Grid metres' },
            { value: 'geo', label: 'Longitude and latitude' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          {[
            [labels[0], a, setA] as const,
            [labels[1], b, setB] as const,
          ].map(([label, value, set], i) => (
            <label key={label} className="block text-[13px] text-fg-2">
              {label}
              <input
                autoFocus={i === 0}
                inputMode="decimal"
                value={value}
                onChange={(e) => set(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby="coord-help"
                className="num tap mt-1 h-9 w-full rounded-ctl border border-line-strong bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-fg-2"
              />
            </label>
          ))}
        </div>
        <p id="coord-help" className="text-xs text-fg-3">
          {range}
        </p>
        {error && (
          <p role="alert" className="text-[13px] text-bad">
            {error}
          </p>
        )}
        {issue && (
          <StatusAlert
            live
            tone="warn"
            title="That location cannot be used"
            action={
              issue.snap && (
                <Button size="sm" variant="primary" onClick={confirmSnap}>
                  Use nearest usable cell, {formatMetres(issue.snapDistanceM, 0)} away
                </Button>
              )
            }
          >
            {placementIssue(issue.validity, issue.slopeDeg, issue.maxSlopeDeg)}
            {issue.snap && (
              <span className="num block">
                Nearest usable cell: x {formatGrid(issue.snap.x)}, y {formatGrid(issue.snap.y)}
                {issue.snapSlopeDeg !== null ? `, slope ${formatDegrees(issue.snapSlopeDeg)}` : ''}
              </span>
            )}
          </StatusAlert>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              close()
              useUiStore.getState().cancelPlacement()
            }}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Place {target ? TARGET_LABEL[target] : ''}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Shown over the map when the basemap cannot be drawn. Terrain data keeps working. */
export function ImageryNotice({ className }: { className?: string }) {
  const basemapId = useUiStore((s) => s.basemapId)
  const entry = useDataStore((s) => s.imagery[basemapId])
  const terrainError = useDataStore((s) => s.terrainError)
  const load = useDataStore((s) => s.loadImagery)
  const init = useDataStore((s) => s.init)
  const setBasemap = useUiStore((s) => s.setBasemap)
  const hasRelief = useDataStore((s) => s.layers.some((l) => l.id === 'dtm-hillshade' && l.availability === 'available'))
  if (terrainError) {
    return (
      <StatusAlert
        live
        tone="bad"
        title="Terrain data unavailable"
        className={cn('w-[min(420px,calc(100vw-24px))] bg-surface', className)}
        action={
          <Button size="sm" onClick={() => void init()}>
            <RefreshCw />
            Try again
          </Button>
        }
      >
        {terrainError.detail}. Placement, routing and feasibility are blocked until terrain loads. Nothing is estimated in
        its place
      </StatusAlert>
    )
  }
  if (entry?.state !== 'error') return null
  return (
    <StatusAlert
      live
      tone="warn"
      title="Map imagery unavailable"
      className={cn('w-[min(420px,calc(100vw-24px))] bg-surface', className)}
      action={
        <>
          <Button size="sm" onClick={() => void load(basemapId, true)}>
            <RefreshCw />
            Try again
          </Button>
          {hasRelief && basemapId !== 'dtm-hillshade' && (
            <Button size="sm" variant="ghost" onClick={() => setBasemap('dtm-hillshade')}>
              Use DTM relief
            </Button>
          )}
        </>
      }
    >
      {entry.error.detail}. Terrain data is loaded, so placement, routing and timing still work. No imagery is substituted
    </StatusAlert>
  )
}

/** Credit line for the active basemap (Mars Trek layers carry their NASA attribution). */
export function BasemapAttribution({ className }: { className?: string }) {
  const basemapId = useUiStore((s) => s.basemapId)
  const entry = useDataStore((s) => s.imagery[basemapId])
  if (entry?.state !== 'ready' || entry.imagery.type !== 'tiles') return null
  return <p className={cn('text-[11px] leading-snug text-fg-3', className)}>Imagery: {entry.imagery.attribution}</p>
}

/** Compact on-map reminder of the unresolved overlay registration (X2b) while imagery is shown. */
export function RegistrationTag({ className }: { className?: string }) {
  const basemapId = useUiStore((s) => s.basemapId)
  const layer = useDataStore((s) => s.layers.find((l) => l.id === basemapId))
  const entry = useDataStore((s) => s.imagery[basemapId])
  if (!layer?.caveat || entry?.state !== 'ready' || entry.imagery.type !== 'tiles') return null
  return (
    <Tooltip label={layer.caveat} side="top">
      <div tabIndex={0} className={cn(float, 'flex h-9 items-center gap-2 px-2.5 text-xs text-fg-2 outline-none focus-visible:border-fg-2', className)}>
        <Crosshair className="size-3.5 shrink-0 text-warn" aria-hidden />
        <span className="hidden sm:inline">{basemapId === 'hirise-ortho' ? 'Overlay registration ±3 m' : 'Context imagery'}</span>
        <span className="sr-only">{layer.caveat}</span>
      </div>
    </Tooltip>
  )
}

export function DemoMapTag({ className }: { className?: string }) {
  const status = useDataStore((s) => s.manifest?.status)
  if (status !== 'illustrative-demo') return null
  return (
    <div className={cn(float, 'flex h-9 items-center gap-2 px-2.5 text-xs text-fg-2', className)}>
      <KindBadge kind="illustrative" />
      <span className="hidden sm:inline">Demo terrain. Not Mars data</span>
    </div>
  )
}
