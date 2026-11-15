import { Video } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useState, type CSSProperties, type FormEvent } from 'react'
import { SourceBadge } from '@/components/provenance/Provenance'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/controls'
import { Tooltip } from '@/components/ui/overlay'
import { ELEVATION_RAMP, SLOPE_CLASSES } from '@/services/adapters/real/render'
import { useDataStore } from '@/stores/dataStore'
import { useMapStore, type ThreeControls } from '@/stores/mapStore'
import { useMissionStore } from '@/stores/missionStore'
import { useUiStore, VERTICAL_SCALES, type VerticalScale } from '@/stores/uiStore'
import { cn } from '@/utils/cn'
import { formatMetres } from '@/utils/format'
import { activeSurface, SURFACE_LABELS, type SurfaceStyle } from './surface'

/*
 * 3D map chrome. Nothing here imports `three`: it reads the shared stores and calls the camera actions
 * the scene publishes in the map store, so it can live in the workspace beside the 2D controls.
 */

const float = 'rounded-card border border-line-strong bg-surface'

/** Runs a scene action and reports a failure as an overlay error instead of throwing. */
function act(action: (c: ThreeControls) => void) {
  const controls = useMapStore.getState().threeControls
  try {
    if (controls) action(controls)
  } catch (e) {
    useMapStore.setState({ threeOverlayError: e instanceof Error ? e.message : String(e) })
  }
}

const setSurface = (value: SurfaceStyle) =>
  useUiStore.setState((s) => ({ overlays: { ...s.overlays, slope: value === 'slope', elevation: value === 'elevation' } }))

/** Surface style and vertical scale. Both are kept in the UI store, so they survive 2D and back. */
export function SurfaceTools({ className, style }: { className?: string; style?: CSSProperties }) {
  const overlays = useUiStore((s) => s.overlays)
  const scale = useUiStore((s) => s.verticalScale)
  const setScale = useUiStore((s) => s.setVerticalScale)
  return (
    <div className={cn(float, 'flex items-center gap-1 p-1', className)} style={style} role="group" aria-label="Surface and scale">
      <label className="flex min-w-0 items-center gap-2 pl-2 text-xs text-fg-3">
        <span className="hidden md:inline">Surface</span>
        <Select aria-label="3D surface" className="h-8 w-32 bg-surface md:w-36" value={activeSurface(overlays)} onChange={(e) => setSurface(e.target.value as SurfaceStyle)}>
          {(Object.entries(SURFACE_LABELS) as [SurfaceStyle, string][]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </label>
      <label
        className="flex items-center gap-2 pl-1 text-xs text-fg-3"
        title="Visualization only. Elevation, slope, route calculations and timing stay tied to the source DEM"
      >
        <span className="hidden md:inline">Scale</span>
        <Select
          aria-label="Vertical scale"
          className="h-8 w-[88px] bg-surface"
          value={scale}
          onChange={(e) => setScale(Number(e.target.value) as VerticalScale)}
        >
          {VERTICAL_SCALES.map((s) => (
            <option key={s} value={s}>
              {s === 1 ? '1× true' : `${s}× visual`}
            </option>
          ))}
        </Select>
      </label>
    </div>
  )
}

/** Camera presets, orbit steps and coordinate inspection: the keyboard and touch equivalent of dragging. */
export function CameraMenu({ compact }: { compact: boolean }) {
  const config = useMissionStore((s) => s.config)
  const route = useMissionStore((s) => s.routes[s.config.routeMode])
  return (
    <Popover.Root>
      <Tooltip label="Camera presets and coordinate inspection" side="bottom">
        <Popover.Trigger asChild>
          <Button aria-label={compact ? 'Camera & inspect' : undefined} size={compact ? 'icon' : 'md'} className="bg-surface">
            <Video aria-hidden />
            {!compact && 'Camera & inspect'}
          </Button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="anim-fade z-[1000] max-h-[min(560px,calc(100dvh-140px))] w-[min(320px,calc(100vw-24px))] overflow-y-auto rounded-panel border border-line-strong bg-surface p-3"
        >
          <p className="mb-2 text-xs text-fg-3">View</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="3D camera controls">
            <Button size="sm" onClick={() => act((c) => c.fitTerrain())}>Reset camera</Button>
            <Button size="sm" disabled={route?.status !== 'ok'} onClick={() => act((c) => c.focusRoute())}>Focus route</Button>
            <Button size="sm" disabled={!config.habitat} onClick={() => act((c) => c.focusPoint(config.habitat!.position))}>Focus habitat</Button>
            <Button size="sm" disabled={!config.destination} onClick={() => act((c) => c.focusPoint(config.destination!.position))}>Focus destination</Button>
          </div>
          <p className="mt-4 mb-2 text-xs text-fg-3">Orbit</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="3D orbit controls">
            <Button size="sm" onClick={() => act((c) => c.rotate(-Math.PI / 8, 0))}>Orbit left</Button>
            <Button size="sm" onClick={() => act((c) => c.rotate(Math.PI / 8, 0))}>Orbit right</Button>
            <Button size="sm" onClick={() => act((c) => c.rotate(0, -Math.PI / 12))}>Tilt up</Button>
            <Button size="sm" onClick={() => act((c) => c.rotate(0, Math.PI / 12))}>Tilt down</Button>
          </div>
          <p className="mt-3 text-xs text-fg-3">
            Drag to orbit, right drag to pan, scroll to zoom. With the canvas focused, arrows pan, <kbd className="key">+</kbd>{' '}
            <kbd className="key">−</kbd> zoom and <kbd className="key">R</kbd> fits the terrain
          </p>
          <InspectCoordinates />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Inspection without pointer picking; placement keeps the existing coordinate dialog. */
function InspectCoordinates() {
  const [x, setX] = useState('800')
  const [y, setY] = useState('800')
  const [error, setError] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!x.trim() || !y.trim() || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
      setError('Enter finite projected grid metres')
      return
    }
    setError('')
    useUiStore.getState().inspect({ x: Number(x), y: Number(y) })
  }
  return (
    <form className="mt-4 space-y-2 border-t border-line pt-3" onSubmit={submit}>
      <p className="text-xs text-fg-3">Inspect by grid metres from the south-west corner</p>
      <div className="flex gap-2">
        {[
          { label: 'x metres east', value: x, set: setX },
          { label: 'y metres north', value: y, set: setY },
        ].map(({ label, value, set }) => (
          <label key={label} className="min-w-0 flex-1 text-xs text-fg-2">
            {label}
            <input
              className="num tap mt-1 h-9 w-full rounded-ctl border border-line-strong bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-fg-2"
              aria-label={`Inspect ${label}`}
              inputMode="decimal"
              value={value}
              onChange={(e) => set(e.target.value)}
            />
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-warn">
          {error}
        </p>
      )}
      <Button size="sm" type="submit">
        Inspect coordinates
      </Button>
    </form>
  )
}

const rgb = (c: readonly number[]) => `rgb(${c[0]} ${c[1]} ${c[2]})`

/** Always-visible key to the 3D surface colours. Relief needs none; its notes live in the legend. */
export function SurfaceKey({ className }: { className?: string }) {
  const overlays = useUiStore((s) => s.overlays)
  const range = useDataStore((s) => s.manifest?.elevationRangeM)
  const style = activeSurface(overlays)
  if (style === 'relief') return null
  if (style === 'elevation') {
    return (
      <div className={cn(float, 'w-72 max-w-full px-3 py-2 text-xs whitespace-nowrap text-fg-2', className)}>
        <div className="h-1.5 rounded-full" style={{ background: `linear-gradient(to right, ${ELEVATION_RAMP.map(rgb).join(', ')})` }} aria-hidden />
        <p className="num mt-1.5 flex justify-between gap-2">
          <span>{formatMetres(range?.[0] ?? null, 0)}</span>
          <span className="font-sans text-fg-3">Elevation · Mars areoid</span>
          <span>{formatMetres(range?.[1] ?? null, 0)}</span>
        </p>
      </div>
    )
  }
  return (
    <div className={cn(float, 'px-3 py-2 text-xs text-fg-2', className)}>
      <p className="sr-only">Slope classes, from the source DEM and independent of vertical scale</p>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {SLOPE_CLASSES.map((k) => (
          <li key={k.label} className="flex items-center gap-1.5">
            <span
              className={cn('size-2.5 shrink-0 rounded-[3px] border border-line-strong bg-raised', k.pattern === 'hatch' && 'hatch')}
              style={k.rgba[3] ? { backgroundColor: `rgb(${k.rgba[0]} ${k.rgba[1]} ${k.rgba[2]})` } : undefined}
              aria-hidden
            />
            <span className="num">{k.label.replace(' to ', '–')}</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="hatch size-2.5 shrink-0 rounded-[3px] border border-line-strong bg-raised" aria-hidden />
          Unknown
        </li>
      </ul>
    </div>
  )
}

/** The 3D part of the map legend: what the surface, markers and mesh are, and what they are not. */
export function ThreeLegendNotes() {
  const overlays = useUiStore((s) => s.overlays)
  const style = activeSurface(overlays)
  return (
    <div className="space-y-2 text-xs text-fg-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-fg">3D terrain · {SURFACE_LABELS[style].toLowerCase()}</span>
        <SourceBadge id="usgs-hirise-dtm" />
      </div>
      {style === 'relief' && <p>DEM-derived relief with 10 m contours. Lighting is illustrative; this is not a NASA photograph</p>}
      {style === 'slope' && <p>Slope classes come from the source DEM and do not change with vertical scale</p>}
      <p>The white sphere is the simulated astronaut. Markers are symbols. Routes stay visible through relief and follow the full DEM</p>
      <p>USGS / MRO HiRISE. The display mesh is reduced; science uses full resolution. No imagery is draped. Overlay registration is uncertain by about 3 m (X2b)</p>
    </div>
  )
}

/** A failed route, marker or camera action, reported without hiding the terrain. */
export function ThreeOverlayError({ className }: { className?: string }) {
  const message = useMapStore((s) => s.threeOverlayError)
  if (!message) return null
  return (
    <p role="alert" className={cn(float, 'max-w-md px-3 py-2 text-xs text-warn', className)}>
      3D overlay error: {message}
    </p>
  )
}
