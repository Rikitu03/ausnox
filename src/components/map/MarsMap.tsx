import L from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'
import { ImageOverlay, MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { useActiveResults } from '@/hooks/useActiveResults'
import { useSimulationSnapshot } from '@/hooks/useSimulation'
import { services, type GridCoord, type LayerImagery, type RoundTripRoute, type ScienceWaypoint } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useMapStore } from '@/stores/mapStore'
import { useMissionStore } from '@/stores/missionStore'
import { useUiStore } from '@/stores/uiStore'

/**
 * Mars map frame. NASA Mars Trek serves equirectangular tiles in degrees with 2 × 1 tiles at level 0,
 * the layout of Leaflet's EPSG:4326 CRS (checked: z15 tile 13024/46859 covers the AOI centre). Distances
 * and the scale bar use the Mars 2000 sphere radius instead of Earth's.
 *
 * Everything drawn is positioned through the active terrain service's `toGeo`, so routes, markers and
 * DTM overlays use the same verified transform as the scientific engine. Nothing is shifted to match
 * imagery (see the X2b registration caveat).
 */
const MARS_RADIUS_M = 3_396_190
const MARS_CRS: L.CRS = L.Util.extend({}, L.CRS.EPSG4326, { code: 'IAU2000:49900', R: MARS_RADIUS_M })

/** Jezero delta front: used only to frame the map before terrain has loaded. */
const DEFAULT_CENTER: L.LatLngTuple = [18.456, 77.4065]

/** Grid metres -> Leaflet [lat, lng] through the terrain transform; null before terrain loads. */
function ll(p: GridCoord): L.LatLngTuple | null {
  const g = services.terrain.toGeo(p)
  return g ? [g.latNorth, g.lonEast] : null
}
const lls = (ps: GridCoord[]): L.LatLngTuple[] => ps.map(ll).filter((x): x is L.LatLngTuple => x !== null)

const GLYPH = {
  habitat:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  destination:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22V4"/><path d="M5 4h12l-2.500 4L17 12H5"/></svg>',
}

const icon = (cls: string, size: number, html = '') =>
  L.divIcon({ className: '', html: `<div class="mk ${cls}">${html}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] })

const ICONS = {
  habitat: icon('mk-habitat', 30, GLYPH.habitat),
  destination: icon('mk-destination', 30, GLYPH.destination),
  waypoint: icon('mk-waypoint', 14),
  walker: icon('mk-walker', 16),
  inspect: icon('mk-inspect', 18),
  snap: icon('mk-snap', 22),
  stop: (n: number) => icon('mk-stop', 24, String(n)),
}

export interface MapPadding {
  left: number
  right: number
  top: number
  bottom: number
}

/** Ground metres per pixel east-west at the map centre, measured with the Mars radius. */
function measureScale(map: L.Map) {
  const size = map.getSize()
  if (size.x < 120) return
  const y = size.y / 2
  const a = map.containerPointToLatLng([size.x / 2 - 50, y])
  const b = map.containerPointToLatLng([size.x / 2 + 50, y])
  const metres = map.distance(a, b)
  useMapStore.setState({ zoom: map.getZoom(), metresPerPx: Number.isFinite(metres) && metres > 0 ? metres / 100 : null })
}

function Controller({ padding }: { padding: MapPadding }) {
  const map = useMap()
  const manifest = useDataStore((s) => s.manifest)
  const focus = useUiStore((s) => s.focus)
  const placement = useUiStore((s) => s.placement)
  const mapMode = useUiStore((s) => s.mapMode)
  const fitted = useRef<{ manifest: typeof manifest; seq: number } | null>(null)

  useEffect(() => {
    if (mapMode !== '2d') return
    map.invalidateSize()
    measureScale(map)
  }, [map, mapMode])

  useEffect(() => {
    useMapStore.setState({ map })
    measureScale(map)
    return () => useMapStore.setState({ map: null, metresPerPx: null })
  }, [map])

  useEffect(() => {
    map.getContainer().classList.toggle('placing', placement !== null)
  }, [map, placement])

  // Fit the footprint on load, on request, and when the panels around the map change.
  const { left, right, top, bottom } = padding
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.invalidateSize()
    // Panel visibility changes must not reset a camera the user has positioned.
    if (fitted.current?.manifest === manifest && fitted.current.seq === focus.seq) return
    fitted.current = { manifest, seq: focus.seq }
    if (focus.point) {
      const p = ll(focus.point)
      if (p) {
        map.setView(p, Math.max(map.getZoom(), 16), { animate: false })
        // Place the inspected target at the centre of the unobstructed map area.
        map.panBy([(right - left) / 2, (bottom - top) / 2], { animate: !reduce })
      }
      return
    }
    if (!manifest) return
    const sw = ll({ x: 0, y: 0 })
    const ne = ll({ x: manifest.grid.widthM, y: manifest.grid.heightM })
    if (!sw || !ne) return
    map.fitBounds([sw, ne], { paddingTopLeft: [left, top], paddingBottomRight: [right, bottom], animate: false })
    measureScale(map)
  }, [map, manifest, focus, left, right, top, bottom])

  const toGrid = (e: L.LeafletMouseEvent) => services.terrain.fromGeo({ lonEast: e.latlng.lng, latNorth: e.latlng.lat })

  useMapEvents({
    click(e) {
      const point = toGrid(e)
      if (!point) return
      const ui = useUiStore.getState()
      if (ui.placement) ui.attemptPlace(ui.placement, point)
      else ui.inspect(point)
    },
    mousemove(e) {
      const point = toGrid(e)
      useMapStore.setState({ hover: point ? services.terrain.sample(point) : null })
    },
    mouseout() {
      useMapStore.setState({ hover: null })
    },
    zoomend() {
      measureScale(map)
    },
    moveend() {
      measureScale(map)
    },
    resize() {
      measureScale(map)
    },
  })
  return null
}

/** Mars Trek tiles. Repeated tile failures with no successes are reported as unavailable imagery. */
function TrekTiles({ layerId, imagery }: { layerId: string; imagery: Extract<LayerImagery, { type: 'tiles' }> }) {
  const counts = useRef({ ok: 0, failed: 0, reported: false })
  const reportError = useDataStore((s) => s.reportImageryError)
  const b = imagery.bounds
  return (
    <TileLayer
      url={imagery.urlTemplate}
      attribution={imagery.attribution}
      bounds={[
        [b.south, b.west],
        [b.north, b.east],
      ]}
      maxNativeZoom={imagery.maxNativeZoom}
      maxZoom={21}
      noWrap
      keepBuffer={2}
      eventHandlers={{
        tileload() {
          counts.current.ok++
        },
        tileerror() {
          const c = counts.current
          c.failed++
          if (!c.reported && c.ok === 0 && c.failed >= 6) {
            c.reported = true
            reportError(layerId, `NASA Mars Trek tiles failed to load (${c.failed} requests)`)
          }
        },
      }}
    />
  )
}

function LayerImage({ layerId, cells, opacity = 1 }: { layerId: string; cells?: boolean; opacity?: number }) {
  const entry = useDataStore((s) => s.imagery[layerId])
  const load = useDataStore((s) => s.loadImagery)
  const revision = useDataStore((s) => s.revision)
  useEffect(() => {
    void load(layerId)
  }, [layerId, load, revision])
  if (entry?.state !== 'ready') return null
  const { imagery } = entry
  if (imagery.type === 'tiles') return <TrekTiles key={imagery.urlTemplate} layerId={layerId} imagery={imagery} />
  const sw = ll(imagery.boundsM.min)
  const ne = ll(imagery.boundsM.max)
  if (!sw || !ne) return null
  return <ImageOverlay url={imagery.url} bounds={[sw, ne]} opacity={opacity} className={cells ? 'cells' : undefined} />
}

function GridLines({ widthM, heightM }: { widthM: number; heightM: number }) {
  const lines = useMemo(() => {
    const out: L.LatLngTuple[][] = []
    for (let x = 500; x < widthM; x += 500) out.push(lls([{ x, y: 0 }, { x, y: heightM }]))
    for (let y = 500; y < heightM; y += 500) out.push(lls([{ x: 0, y }, { x: widthM, y }]))
    return out.filter((l) => l.length === 2)
  }, [widthM, heightM])
  return <Polyline positions={lines} pathOptions={{ color: '#ece9e2', weight: 1, opacity: 0.12, interactive: false }} />
}

function RouteLines({ route, dim, faint }: { route: RoundTripRoute; dim: boolean; faint?: boolean }) {
  const out = useMemo(() => lls(route.outbound.path), [route])
  const back = useMemo(() => lls(route.inbound.path), [route])
  if (faint) {
    return (
      <>
        <Polyline positions={out} pathOptions={{ color: '#7ed3de', weight: 1.5, opacity: 0.55, dashArray: '2 6', interactive: false }} />
        <Polyline positions={back} pathOptions={{ color: '#ece6da', weight: 1.5, opacity: 0.45, dashArray: '2 6', interactive: false }} />
      </>
    )
  }
  const opacity = dim ? 0.3 : 1
  return (
    <>
      <Polyline positions={out} pathOptions={{ color: '#111110', weight: 7, opacity: opacity * 0.7, interactive: false }} />
      <Polyline positions={out} pathOptions={{ color: dim ? '#8a8882' : '#7ed3de', weight: 3, opacity, interactive: false }} />
      {/* Return is dashed as well as lighter, so the two legs differ without colour. */}
      <Polyline positions={back} pathOptions={{ color: '#111110', weight: 6, opacity: opacity * 0.6, dashArray: '8 9', interactive: false }} />
      <Polyline positions={back} pathOptions={{ color: dim ? '#8a8882' : '#ece6da', weight: 2.5, opacity, dashArray: '8 9', interactive: false }} />
    </>
  )
}

function WaypointMarker({ wp }: { wp: ScienceWaypoint }) {
  const position = ll(wp.position)
  if (!position) return null
  const quality = wp.labelQuality === 'cited' ? 'cited rover position' : 'illustrative'
  return (
    <Marker
      position={position}
      icon={ICONS.waypoint}
      title={`${wp.title}, ${wp.labelQuality === 'cited' ? 'cited science target (rover position)' : 'illustrative science waypoint'}`}
      eventHandlers={{
        click() {
          const ui = useUiStore.getState()
          const meta = { label: wp.title, waypointId: wp.id, durationMin: wp.suggestedDurationMin }
          // Same placement check as a map click: a waypoint on terrain steeper than the limit is never used silently.
          if (ui.placement) ui.attemptPlace(ui.placement, wp.position, ui.placement === 'habitat' ? null : meta)
          else ui.inspect(wp.position)
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -8]}>
        {wp.title} · {quality}
      </Tooltip>
    </Marker>
  )
}

function Point({ p, ...rest }: { p: GridCoord } & Omit<React.ComponentProps<typeof Marker>, 'position'>) {
  const position = ll(p)
  return position ? <Marker position={position} {...rest} /> : null
}

export function MarsMap({ padding, showWalker }: { padding: MapPadding; showWalker: boolean }) {
  const manifest = useDataStore((s) => s.manifest)
  const layers = useDataStore((s) => s.layers)
  const waypoints = useDataStore((s) => s.waypoints)
  const basemapId = useUiStore((s) => s.basemapId)
  const overlays = useUiStore((s) => s.overlays)
  const features = useUiStore((s) => s.features)
  const inspected = useUiStore((s) => s.inspected)
  const issue = useUiStore((s) => s.placementIssue)
  const compare = useUiStore((s) => s.compare)
  const config = useMissionStore((s) => s.config)
  const otherRoute = useMissionStore((s) => s.routes[s.config.routeMode === 'shortest' ? 'lower-slope' : 'shortest'])
  const { okRoute, current } = useActiveResults()
  const snapshot = useSimulationSnapshot()

  const basemap = layers.find((l) => l.id === basemapId && l.availability === 'available')
  const coverage = useMemo(() => (manifest ? lls(manifest.coverage) : []), [manifest])
  const issueLine = issue?.snap ? lls([issue.point, issue.snap]) : []

  return (
    <MapContainer
      crs={MARS_CRS}
      center={DEFAULT_CENTER}
      zoom={14}
      minZoom={7}
      maxZoom={21}
      zoomSnap={0.25}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={120}
      maxBounds={[
        [DEFAULT_CENTER[0] - 8, DEFAULT_CENTER[1] - 12],
        [DEFAULT_CENTER[0] + 8, DEFAULT_CENTER[1] + 12],
      ]}
      zoomControl={false}
      attributionControl={false}
      className="absolute inset-0 z-0"
    >
      <Controller padding={padding} />
      {basemap && <LayerImage key={basemap.id} layerId={basemap.id} />}
      {layers
        .filter((l) => l.role === 'overlay' && l.availability === 'available' && overlays[l.id])
        .map((l) => (
          <LayerImage key={l.id} layerId={l.id} cells opacity={0.9} />
        ))}
      {features.grid && manifest && <GridLines widthM={manifest.grid.widthM} heightM={manifest.grid.heightM} />}
      {features.coverage && coverage.length > 2 && (
        <Polygon positions={coverage} pathOptions={{ color: '#ece9e2', weight: 1.5, opacity: 0.55, dashArray: '5 6', fill: false, interactive: false }} />
      )}
      {compare && otherRoute?.status === 'ok' && <RouteLines route={otherRoute.route} dim={false} faint />}
      {okRoute && <RouteLines route={okRoute} dim={!current} />}
      {features.waypoints && waypoints.map((wp) => <WaypointMarker key={wp.id} wp={wp} />)}
      {config.stops.map((s, i) => (
        <Point key={s.id} p={s.position} icon={ICONS.stop(i + 1)} title={`${s.label}, science stop ${i + 1}`}>
          <Tooltip direction="top" offset={[0, -12]}>
            {s.label} · {s.durationMin} min
          </Tooltip>
        </Point>
      ))}
      {config.destination && (
        <Point p={config.destination.position} icon={ICONS.destination} title={`${config.destination.label}, science destination`} zIndexOffset={500}>
          <Tooltip direction="top" offset={[0, -14]}>
            {config.destination.label} · destination
          </Tooltip>
        </Point>
      )}
      {config.habitat && (
        <Point p={config.habitat.position} icon={ICONS.habitat} title="Habitat, hypothetical" zIndexOffset={600}>
          <Tooltip direction="top" offset={[0, -14]}>
            Habitat · hypothetical
          </Tooltip>
        </Point>
      )}
      {showWalker && snapshot.position && current && snapshot.status !== 'not-started' && (
        <Point p={snapshot.position} icon={ICONS.walker} title="Simulated astronaut position" zIndexOffset={900} interactive={false} />
      )}
      {inspected && !issue && <Point p={inspected.grid} icon={ICONS.inspect} interactive={false} keyboard={false} />}
      {issue && (
        <>
          <Point p={issue.point} icon={ICONS.inspect} interactive={false} keyboard={false} />
          {issue.snap && (
            <>
              <Polyline positions={issueLine} pathOptions={{ color: '#e3bb5c', weight: 1.5, dashArray: '3 5', interactive: false }} />
              <Point p={issue.snap} icon={ICONS.snap} interactive={false} keyboard={false} />
            </>
          )}
        </>
      )}
    </MapContainer>
  )
}
