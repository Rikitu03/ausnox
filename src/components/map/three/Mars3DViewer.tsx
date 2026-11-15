import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useDataStore } from '@/stores/dataStore'
import { useMapStore } from '@/stores/mapStore'
import { useUiStore } from '@/stores/uiStore'
import { createTerrainScene, type TerrainScene } from './TerrainScene'

/**
 * The WebGL canvas, edge to edge in the map workspace. Surface, scale, camera and legend controls are
 * map chrome (see ThreeChrome) so they sit with the 2D controls and survive this lazy chunk loading.
 */
export default function Mars3DViewer() {
  const manifest = useDataStore((s) => s.manifest)
  const raster = useDataStore((s) => s.raster)
  const scale = useUiStore((s) => s.verticalScale)
  const mode = useUiStore((s) => s.mapMode)
  const host = useRef<HTMLDivElement>(null)
  const compass = useRef<HTMLSpanElement>(null)
  const scene = useRef<TerrainScene | null>(null)
  const [error, setError] = useState('')
  // The viewer stays mounted through 2D, so a failed scene is retried each time 3D is reopened.
  const [attempt, setAttempt] = useState(0)
  const [seenMode, setSeenMode] = useState(mode)
  if (mode !== seenMode) {
    setSeenMode(mode)
    if (mode === '3d' && error) {
      setError('')
      setAttempt(attempt + 1)
    }
  }

  useEffect(() => {
    if (!host.current || !compass.current || !manifest || !raster) return
    const setOverlayError = (message: string) => useMapStore.setState({ threeOverlayError: message })
    try {
      scene.current = createTerrainScene(host.current, compass.current, manifest, raster, setError, setOverlayError)
    } catch (e) {
      // External WebGL initialization can fail synchronously; expose the failure in accessible UI.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(e instanceof Error ? e.message : String(e))
    }
    return () => {
      scene.current?.dispose()
      scene.current = null
      useMapStore.setState({ threeOverlayError: '' })
    }
  }, [manifest, raster, attempt])

  useEffect(() => {
    if (error) { scene.current?.dispose(); scene.current = null }
  }, [error])

  const unavailable = error || (!manifest || !raster ? 'The verified terrain is unavailable. Retry terrain loading from the 2D map.' : '')
  return (
    <section aria-label="3D Jezero explorer" className="absolute inset-0 bg-[#171716]">
      <p id="three-instructions" className="sr-only">Drag to orbit; right drag or two fingers to pan; scroll or pinch to zoom. Focus the canvas for arrow-key panning, plus or minus to zoom and R to fit. Open Camera and inspect for equivalent buttons and coordinate entry.</p>
      <div ref={host} className={`absolute inset-0 overflow-hidden${unavailable ? ' invisible' : ''}`} aria-hidden={!!unavailable} />
      <div
        className={`pointer-events-none absolute top-[108px] right-3 z-10 md:top-15 flex flex-col items-center rounded-card border border-line bg-surface/90 px-2.5 py-1.5 whitespace-nowrap text-[11px] leading-4 text-fg-2${unavailable ? ' invisible' : ''}`}
        aria-label="North orientation. World X east, Z south, Y elevation."
      >
        <span ref={compass} className="inline-block origin-center text-sm text-fg" aria-hidden>↑ N</span>
        <span className="mt-0.5 text-center">{scale}× {scale === 1 ? 'true scale' : 'visual only'}</span>
      </div>
      {unavailable && (
        <div className="absolute inset-0 grid place-items-center bg-surface p-4">
          <div role="alert" className="max-w-sm space-y-3 text-[13px]">
            <h2 className="font-medium">3D terrain unavailable</h2>
            <p className="text-fg-2">{unavailable}</p>
            <Button onClick={() => useUiStore.getState().setMapMode('2d')}>Return to 2D Map</Button>
          </div>
        </div>
      )}
    </section>
  )
}
