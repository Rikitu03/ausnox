import { Box, ChevronDown, Layers, LocateFixed, Maximize, Minus, Plus, RefreshCw, X } from 'lucide-react'
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
import { validityIssue } from '@/utils/validation'
import { LayerControls, LayerLegend } from './LayerControls'

const TARGET_LABEL: Record<PlacementTarget, string> = {
  habitat: 'habitat',
  destination: 'science destination',
  stop: 'science stop',
}

const float = 'rounded-card border border-line-strong bg-surface'

function ToolButton({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <Tooltip label={label} side="right">
      <Button variant="ghost" size="icon" aria-label={label} onClick={onClick} className="text-fg">
        {children}
      </Button>
    </Tooltip>
  )
}

/** Zoom, fit, layers, coordinate entry and the 3D notice. */
export function MapTools({ className, showLayers }: { className?: string; showLayers: boolean }) {
  const map = useMapStore((s) => s.map)
  const focusMap = useUiStore((s) => s.focusMap)
  const [threeD, setThreeD] = useState(false)
  return (
    <div className={cn('flex flex-col gap-2', className)} role="toolbar" aria-label="Map tools" aria-orientation="vertical">
      <div className={cn(float, 'flex flex-col p-1')}>
        <ToolButton label="Zoom in" onClick={() => map?.zoomIn()}>
          <Plus />
        </ToolButton>
        <ToolButton label="Zoom out" onClick={() => map?.zoomOut()}>
          <Minus />
        </ToolButton>
        <ToolButton label="Fit terrain coverage" onClick={() => focusMap()}>
          <Maximize />
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
        <ToolButton label="3D terrain view" onClick={() => setThreeD(true)}>
          <Box />
        </ToolButton>
      </div>
      <Dialog open={threeD} onOpenChange={setThreeD} title="3D terrain view is not available" description="The 2D map has everything needed to plan and review a mission">
        <div className="space-y-3 text-[13px] text-fg-2">
          <p>
            A 3D view needs a validated elevation model with a checked height datum. Until that exists, Ausnox will not draw
            a 3D surface, because a made-up mesh could be mistaken for real Martian relief.
          </p>
          <p>Your mission, map position and layers stay exactly as they are.</p>
          <Button variant="primary" onClick={() => setThreeD(false)}>
            Back to the 2D map
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

const LINE_KEY = [
  { label: 'Outbound route', line: 'border-t-[3px] border-out' },
  { label: 'Return route', line: 'border-t-[3px] border-dashed border-ret' },
  { label: 'Terrain coverage boundary', line: 'border-t-2 border-dashed border-fg-2' },
]

/** Always-available key to lines, markers and active overlays. */
export function MapLegend({ className, defaultOpen }: { className?: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const layers = useDataStore((s) => s.layers)
  const overlays = useUiStore((s) => s.overlays)
  const basemapId = useUiStore((s) => s.basemapId)
  const basemap = layers.find((l) => l.id === basemapId)
  const active = layers.filter((l) => l.role === 'overlay' && overlays[l.id])
  return (
    <div className={cn(float, 'w-60 text-[13px]', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="tap flex w-full items-center justify-between gap-2 rounded-card px-3 py-2 text-left"
      >
        <span className="font-medium">Legend</span>
        <ChevronDown className={cn('size-4 text-fg-3 transition-transform duration-150', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          {basemap && (
            <div>
              <div className="flex items-center justify-between gap-2">
                <span>{basemap.title}</span>
                <SourceBadge id={basemap.provenanceId} kind={basemap.illustrative ? 'illustrative' : undefined} />
              </div>
              {basemap.illustrative && <p className="mt-1 text-xs text-fg-3">A drawing of synthetic terrain. Not NASA imagery</p>}
            </div>
          )}
          <ul className="space-y-1.5">
            {LINE_KEY.map((k) => (
              <li key={k.label} className="flex items-center gap-2.5 text-fg-2">
                <span className={cn('w-6 shrink-0', k.line)} aria-hidden />
                {k.label}
              </li>
            ))}
            <li className="flex items-center gap-2.5 text-fg-2">
              <span className="hatch size-3 shrink-0 rounded-[3px] border border-line-strong bg-raised" aria-hidden />
              No terrain data
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
          {active.map((l) => (
            <div key={l.id} className="border-t border-line pt-3">
              <div className="flex items-center justify-between gap-2">
                <span>{l.title}</span>
                <SourceBadge id={l.provenanceId} kind={l.illustrative ? 'illustrative' : undefined} />
              </div>
              <LayerLegend layer={l} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const NICE = [20, 50, 100, 200, 500, 1000, 2000]

/** Pointer readout and scale. Mars metres from the flat grid, never an Earth scale. */
export function CoordinateBar({ className }: { className?: string }) {
  const hover = useMapStore((s) => s.hover)
  const zoom = useMapStore((s) => s.zoom)
  const inspected = useUiStore((s) => s.inspected)
  const georef = useDataStore((s) => s.manifest?.georeference.kind)
  const sample = hover ?? inspected
  const pxPerM = 2 ** zoom
  const length = [...NICE].reverse().find((n) => n * pxPerM <= 110) ?? NICE[0]!
  const issue = sample ? validityIssue(sample.validity) : null
  return (
    <div className={cn(float, 'flex h-9 items-center gap-4 overflow-hidden px-3 text-xs text-fg-2', className)}>
      <div className="flex shrink-0 items-center gap-2" aria-label={`Map scale: bar is ${length} metres`}>
        <span className="block h-1.5 border-x border-b border-fg-2" style={{ width: length * pxPerM }} aria-hidden />
        <span className="num">{length >= 1000 ? `${length / 1000} km` : `${length} m`}</span>
      </div>
      <div className="h-4 w-px shrink-0 bg-line-strong" aria-hidden />
      {sample ? (
        <div className="num flex min-w-0 items-center gap-4 whitespace-nowrap">
          <span>
            x {formatGrid(sample.grid.x)} · y {formatGrid(sample.grid.y)}
          </span>
          {sample.geo && (
            <span className="hidden md:inline">
              {formatGeo(sample.geo.lonEast, 'lon')} · {formatGeo(sample.geo.latNorth, 'lat')}
              {georef === 'nominal-demo' && <span className="font-sans text-fg-3"> nominal</span>}
            </span>
          )}
          {issue ? (
            <span className="truncate font-sans text-fg">Unknown: {issue.split('.')[0]!.toLowerCase()}</span>
          ) : (
            <span className="text-fg">
              {formatMetres(sample.elevationM, 1)} · {formatDegrees(sample.slopeDeg)}
            </span>
          )}
        </div>
      ) : (
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
          title={`That spot cannot be the ${TARGET_LABEL[target]}`}
          className="border-0 bg-transparent p-0"
          action={
            <>
              {issue.snap && (
                <Button size="sm" variant="primary" onClick={confirmSnap}>
                  Use nearest valid cell, {Math.round(issue.snapDistanceM!)} m away
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
          {validityIssue(issue.validity)}.{' '}
          {issue.snap
            ? 'The dashed marker shows the nearest valid cell. Nothing moves unless you choose it'
            : 'No valid cell within 400 m'}
        </StatusAlert>
      ) : (
        <div className="flex items-center gap-3">
          <LocateFixed className="size-4 shrink-0 text-accent" aria-hidden />
          <p className="min-w-0 flex-1 text-[13px]">
            Select a spot on the map for the {TARGET_LABEL[target]}
            <span className="block text-xs text-fg-3">Any cell with terrain data works. Press Escape to cancel</span>
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
  const range = manifest
    ? mode === 'grid'
      ? `Terrain spans x 0 to ${manifest.grid.widthM} m and y 0 to ${manifest.grid.heightM} m`
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
                  Use nearest valid cell, {Math.round(issue.snapDistanceM!)} m away
                </Button>
              )
            }
          >
            {validityIssue(issue.validity)}
            {issue.snap && (
              <span className="num block">
                Nearest valid cell: x {formatGrid(issue.snap.x)}, y {formatGrid(issue.snap.y)}
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
        <Button size="sm" onClick={() => void load(basemapId, true)}>
          <RefreshCw />
          Try again
        </Button>
      }
    >
      {entry.error.detail}. Terrain data is loaded, so placement, routing and timing still work on a blank background
    </StatusAlert>
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
