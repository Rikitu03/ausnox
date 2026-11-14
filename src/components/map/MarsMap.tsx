import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import { ImageOverlay, MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { useActiveResults } from '@/hooks/useActiveResults'
import { useSimulationSnapshot } from '@/hooks/useSimulation'
import { services, type GridCoord, type RoundTripRoute, type ScienceWaypoint } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useMapStore } from '@/stores/mapStore'
import { useMissionStore } from '@/stores/missionStore'
import { useUiStore } from '@/stores/uiStore'

/** Grid metres map straight onto Leaflet's flat CRS: lat = y (north), lng = x (east). */
const ll = (p: GridCoord): L.LatLngTuple => [p.y, p.x]

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

function Controller({ padding }: { padding: MapPadding }) {
  const map = useMap()
  const manifest = useDataStore((s) => s.manifest)
  const focus = useUiStore((s) => s.focus)
  const placement = useUiStore((s) => s.placement)

  useEffect(() => {
    useMapStore.setState({ map, zoom: map.getZoom() })
    return () => useMapStore.setState({ map: null })
  }, [map])

  useEffect(() => {
    map.getContainer().classList.toggle('placing', placement !== null)
  }, [map, placement])

  // Fit the footprint on load, on request, and when the panels around the map change.
  const { left, right, top, bottom } = padding
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (focus.point) {
      map.setView(ll(focus.point), Math.max(map.getZoom(), -1), { animate: !reduce })
      return
    }
    const w = manifest?.grid.widthM ?? 4000
    const h = manifest?.grid.heightM ?? 3000
    map.invalidateSize()
    map.fitBounds([[0, 0], [h, w]], { paddingTopLeft: [left, top], paddingBottomRight: [right, bottom], animate: false })
  }, [map, manifest, focus, left, right, top, bottom])

  useMapEvents({
    click(e) {
      const point = { x: e.latlng.lng, y: e.latlng.lat }
      const ui = useUiStore.getState()
      if (ui.placement) ui.attemptPlace(ui.placement, point)
      else ui.inspect(point)
    },
    mousemove(e) {
      useMapStore.setState({ hover: services.terrain.sample({ x: e.latlng.lng, y: e.latlng.lat }) })
    },
    mouseout() {
      useMapStore.setState({ hover: null })
    },
    zoomend() {
      useMapStore.setState({ zoom: map.getZoom() })
    },
  })
  return null
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
  if (imagery.type === 'tiles') return <TileLayer url={imagery.urlTemplate} attribution={imagery.attribution} opacity={opacity} />
  return (
    <ImageOverlay
      url={imagery.url}
      bounds={[ll(imagery.boundsM.min), ll(imagery.boundsM.max)]}
      opacity={opacity}
      className={cells ? 'cells' : undefined}
    />
  )
}

function GridLines({ widthM, heightM }: { widthM: number; heightM: number }) {
  const lines = useMemo(() => {
    const out: L.LatLngTuple[][] = []
    for (let x = 500; x < widthM; x += 500) out.push([[0, x], [heightM, x]])
    for (let y = 500; y < heightM; y += 500) out.push([[y, 0], [y, widthM]])
    return out
  }, [widthM, heightM])
  return <Polyline positions={lines} pathOptions={{ color: '#ece9e2', weight: 1, opacity: 0.07, interactive: false }} />
}

function RouteLines({ route, dim, faint }: { route: RoundTripRoute; dim: boolean; faint?: boolean }) {
  const out = route.outbound.path.map(ll)
  const back = route.inbound.path.map(ll)
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
  return (
    <Marker
      position={ll(wp.position)}
      icon={ICONS.waypoint}
      title={`${wp.title}, illustrative science waypoint`}
      eventHandlers={{
        click() {
          const ui = useUiStore.getState()
          const mission = useMissionStore.getState()
          if (ui.placement === 'destination') {
            mission.setDestination(wp.position, wp.title, wp.id, wp.suggestedDurationMin)
            ui.cancelPlacement()
          } else if (ui.placement === 'stop') {
            mission.addStop(wp.position, wp.title, wp.id, wp.suggestedDurationMin)
            ui.cancelPlacement()
          } else if (ui.placement === 'habitat') ui.attemptPlace('habitat', wp.position)
          else ui.inspect(wp.position)
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -8]}>
        {wp.title} · illustrative
      </Tooltip>
    </Marker>
  )
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
  const w = manifest?.grid.widthM ?? 4000
  const h = manifest?.grid.heightM ?? 3000

  return (
    <MapContainer
      crs={L.CRS.Simple}
      center={[h / 2, w / 2]}
      zoom={-2.5}
      minZoom={-4}
      maxZoom={2}
      zoomSnap={0.25}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={120}
      maxBounds={[[-h, -w], [2 * h, 2 * w]]}
      zoomControl={false}
      attributionControl={false}
      className="absolute inset-0 z-0"
    >
      <Controller padding={padding} />
      {basemap && <LayerImage layerId={basemap.id} />}
      {layers
        .filter((l) => l.role === 'overlay' && l.availability === 'available' && overlays[l.id])
        .map((l) => (
          <LayerImage key={l.id} layerId={l.id} cells opacity={0.9} />
        ))}
      {features.grid && <GridLines widthM={w} heightM={h} />}
      {features.coverage && manifest && (
        <Polygon
          positions={manifest.coverage.map(ll)}
          pathOptions={{ color: '#ece9e2', weight: 1.5, opacity: 0.55, dashArray: '5 6', fill: false, interactive: false }}
        />
      )}
      {compare && otherRoute?.status === 'ok' && <RouteLines route={otherRoute.route} dim={false} faint />}
      {okRoute && <RouteLines route={okRoute} dim={!current} />}
      {features.waypoints && waypoints.map((wp) => <WaypointMarker key={wp.id} wp={wp} />)}
      {config.stops.map((s, i) => (
        <Marker key={s.id} position={ll(s.position)} icon={ICONS.stop(i + 1)} title={`${s.label}, science stop ${i + 1}`}>
          <Tooltip direction="top" offset={[0, -12]}>
            {s.label} · {s.durationMin} min
          </Tooltip>
        </Marker>
      ))}
      {config.destination && (
        <Marker position={ll(config.destination.position)} icon={ICONS.destination} title={`${config.destination.label}, science destination`} zIndexOffset={500}>
          <Tooltip direction="top" offset={[0, -14]}>
            {config.destination.label} · destination
          </Tooltip>
        </Marker>
      )}
      {config.habitat && (
        <Marker position={ll(config.habitat.position)} icon={ICONS.habitat} title="Habitat, hypothetical" zIndexOffset={600}>
          <Tooltip direction="top" offset={[0, -14]}>
            Habitat · hypothetical
          </Tooltip>
        </Marker>
      )}
      {showWalker && snapshot.position && current && snapshot.status !== 'not-started' && (
        <Marker position={ll(snapshot.position)} icon={ICONS.walker} title="Simulated astronaut position" zIndexOffset={900} interactive={false} />
      )}
      {inspected && !issue && <Marker position={ll(inspected.grid)} icon={ICONS.inspect} interactive={false} keyboard={false} />}
      {issue && (
        <>
          <Marker position={ll(issue.point)} icon={ICONS.inspect} interactive={false} keyboard={false} />
          {issue.snap && (
            <>
              <Polyline positions={[ll(issue.point), ll(issue.snap)]} pathOptions={{ color: '#e3bb5c', weight: 1.5, dashArray: '3 5', interactive: false }} />
              <Marker position={ll(issue.snap)} icon={ICONS.snap} interactive={false} keyboard={false} />
            </>
          )}
        </>
      )}
    </MapContainer>
  )
}
