import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/controls'
import { SourceBadge } from '@/components/provenance/Provenance'
import { useDataStore } from '@/stores/dataStore'
import { useMissionStore } from '@/stores/missionStore'
import { useUiStore } from '@/stores/uiStore'
import { formatDegrees, formatGeo, formatMetres } from '@/utils/format'
import { activeSurface, createTerrainScene, type TerrainScene } from './TerrainScene'
import { SURFACE_LABELS, type SurfaceStyle } from './TerrainMaterial'

export default function Mars3DViewer() {
  const manifest = useDataStore((s) => s.manifest)
  const raster = useDataStore((s) => s.raster)
  const inspected = useUiStore((s) => s.inspected)
  const overlays = useUiStore((s) => s.overlays)
  const config = useMissionStore((s) => s.config)
  const route = useMissionStore((s) => s.routes[s.config.routeMode])
  const host = useRef<HTMLDivElement>(null)
  const compass = useRef<HTMLSpanElement>(null)
  const scene = useRef<TerrainScene | null>(null)
  const [error, setError] = useState('')
  const [overlayError, setOverlayError] = useState('')
  const [scale, setScale] = useState(1)
  const [controlsOpen, setControlsOpen] = useState(false)
  const style = activeSurface(overlays)

  useEffect(() => {
    if (!host.current || !compass.current || !manifest || !raster) return
    try {
      scene.current = createTerrainScene(host.current, compass.current, manifest, raster, setError, setOverlayError)
    } catch (e) {
      // External WebGL initialization can fail synchronously; expose the failure in accessible UI.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(e instanceof Error ? e.message : String(e))
    }
    return () => { scene.current?.dispose(); scene.current = null }
  }, [manifest, raster])

  useEffect(() => {
    if (error) { scene.current?.dispose(); scene.current = null }
  }, [error])

  const changeStyle = (value: SurfaceStyle) => useUiStore.setState((s) => ({ overlays: { ...s.overlays, slope: value === 'slope', elevation: value === 'elevation' } }))
  const act = (action: (s: TerrainScene) => void) => {
    try { if (scene.current) action(scene.current) } catch (e) { setOverlayError(e instanceof Error ? e.message : String(e)) }
  }
  const unavailable = error || (!manifest || !raster ? 'The verified terrain is unavailable. Retry terrain loading from the 2D map.' : '')
  return (
    <section aria-label="3D Jezero explorer" className="absolute inset-0 flex flex-col gap-2">
      <p id="three-instructions" className="sr-only">Drag to orbit; right drag or two fingers to pan; scroll or pinch to zoom. Focus the canvas for arrow-key panning, plus or minus to zoom and R to fit. Open Camera and inspect for equivalent buttons and coordinate entry.</p>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-line-strong bg-surface p-2">
        <label className="min-w-36 flex-1 text-xs text-fg-2">
          Surface
          <Select aria-label="3D surface" value={style} onChange={(e) => changeStyle(e.target.value as SurfaceStyle)}>
            {(Object.entries(SURFACE_LABELS) as [SurfaceStyle, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </label>
        <label className="w-24 text-xs text-fg-2" title="Visualization only. Elevation, slope, route calculations and timing stay tied to the source DEM.">
          Vertical scale
          <Select aria-label="Vertical scale" value={scale} onChange={(e) => { const value = Number(e.target.value); act((s) => s.setScale(value)); setScale(value) }}>
            <option value={1}>1× true</option><option value={2}>2× visual</option><option value={3}>3× visual</option>
          </Select>
        </label>
        <Button className="min-h-11" aria-expanded={controlsOpen} onClick={() => setControlsOpen(!controlsOpen)}>Camera &amp; inspect</Button>
      </div>
      {controlsOpen && (
        <div className="absolute top-18 right-0 z-10 max-h-[65%] w-[min(360px,100%)] space-y-2 overflow-y-auto rounded-card border border-line-strong bg-surface p-3 shadow-xl">
          <div className="flex flex-wrap gap-2" role="group" aria-label="3D camera controls">
            <Button onClick={() => act((s) => s.fitTerrain())}>Reset camera</Button>
            <Button disabled={!config.habitat} onClick={() => act((s) => s.focusPoint(config.habitat!.position))}>Focus habitat</Button>
            <Button disabled={!config.destination} onClick={() => act((s) => s.focusPoint(config.destination!.position))}>Focus destination</Button>
            <Button disabled={route?.status !== 'ok'} onClick={() => act((s) => s.focusRoute())}>Focus route</Button>
            <Button onClick={() => act((s) => s.rotate(-Math.PI / 8, 0))}>Orbit left</Button>
            <Button onClick={() => act((s) => s.rotate(Math.PI / 8, 0))}>Orbit right</Button>
            <Button onClick={() => act((s) => s.rotate(0, -Math.PI / 12))}>Tilt up</Button>
            <Button onClick={() => act((s) => s.rotate(0, Math.PI / 12))}>Tilt down</Button>
          </div>
          <p className="text-xs text-fg-2">Drag to orbit; right drag or two fingers to pan; scroll or pinch to zoom. Focus the canvas for arrow-key panning, +/− zoom and R to fit. Camera buttons also work by touch and keyboard.</p>
          <InspectCoordinates />
        </div>
      )}
      <div className="relative min-h-0 flex-1 rounded-panel border border-line bg-[#171716]">
        <div ref={host} className={`absolute inset-0 overflow-hidden rounded-panel${unavailable ? ' invisible' : ''}`} aria-hidden={!!unavailable} />
        <div className={`pointer-events-none absolute top-3 right-3 flex flex-col items-center rounded-card border border-line bg-surface px-3 py-2 text-xs text-fg-2${unavailable ? ' invisible' : ''}`} aria-label="North orientation. World X east, Z south, Y elevation.">
          <span ref={compass} className="inline-block origin-center text-base text-fg" aria-hidden>↑ N</span>
          <span className="mt-1">{scale}× {scale === 1 ? 'true scale' : 'visual only'}</span>
        </div>
        {unavailable && <div className="absolute inset-0 grid place-items-center rounded-panel bg-surface p-4">
          <div role="alert" className="max-w-sm space-y-3 text-[13px]"><h2 className="font-medium">3D terrain unavailable</h2><p className="text-fg-2">{unavailable}</p><Button onClick={() => useUiStore.getState().setMapMode('2d')}>Return to 2D Map</Button></div>
        </div>}
        {!unavailable && inspected && <div className="absolute right-2 bottom-2 left-2 rounded-card border border-line-strong bg-surface p-2 text-xs" role="status">
          <div className="flex items-center justify-between gap-2"><span className="font-medium">Measured terrain · {inspected.validity}</span><SourceBadge id="usgs-hirise-dtm" /></div>
          <p className="num mt-1">{inspected.geo && `${formatGeo(inspected.geo.lonEast, 'lon')} · ${formatGeo(inspected.geo.latNorth, 'lat')} · `}{formatMetres(inspected.elevationM, 1)} · slope {inspected.slopeDeg === null ? 'unknown' : formatDegrees(inspected.slopeDeg)}</p>
        </div>}
      </div>
      <div className="space-y-1 rounded-card border border-line bg-surface px-3 py-2 text-xs text-fg-2">
        {style === 'slope' ? <p><span className="text-fg">Slope classes:</span> under 5° neutral · 5–10° amber · 10–15° orange · over 15° red hatch · unknown grey hatch. Source slope, independent of vertical scale.</p>
          : style === 'elevation' ? <><div className="h-2 rounded-sm" style={{ background: 'linear-gradient(to right, #26201e, #624230, #b97e56, #e9ceaa)' }} /><p className="flex justify-between"><span>{formatMetres(manifest?.elevationRangeM[0] ?? null, 1)}</span><span>Elevation · Mars areoid</span><span>{formatMetres(manifest?.elevationRangeM[1] ?? null, 1)}</span></p></>
          : <p>DEM-derived relief · 10 m contours · illustrative lighting · not a NASA photograph.</p>}
        <p><span className="text-out">━ Outbound</span> · <span className="text-ret">┄ Return</span> · white sphere: simulated astronaut. Markers are symbols. Routes remain visible through relief; heights follow the full DEM.</p>
        <p>USGS / MRO HiRISE · display mesh reduced; full-resolution science preserved. Imagery draping unavailable. X2b offset ~3 m unresolved.</p>
        {overlayError && <p role="alert" className="text-warn">3D overlay error: {overlayError}</p>}
      </div>
    </section>
  )
}

/** Inspection is available without pointer picking; placement retains the existing coordinate dialog. */
function InspectCoordinates() {
  const [x, setX] = useState('800'), [y, setY] = useState('800')
  const [error, setError] = useState('')
  return <form className="space-y-2 border-t border-line pt-2" onSubmit={(e) => {
    e.preventDefault()
    if (!x.trim() || !y.trim() || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) { setError('Enter finite projected grid metres.'); return }
    setError('')
    useUiStore.getState().inspect({ x: Number(x), y: Number(y) })
  }}>
    <p className="text-xs text-fg-2">Inspect by projected grid coordinates (southwest origin)</p>
    <div className="flex gap-2">{([
      { label: 'x metres east', value: x, set: setX },
      { label: 'y metres north', value: y, set: setY },
    ]).map(({ label, value, set }) => <label key={label} className="min-w-0 flex-1 text-xs text-fg-2">{label}<input className="mt-1 h-11 w-full rounded-ctl border border-line-strong bg-bg px-2 text-fg" aria-label={`Inspect ${label}`} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} /></label>)}</div>
    {error && <p role="alert" className="text-xs text-warn">{error}</p>}
    <Button type="submit">Inspect coordinates</Button>
  </form>
}
