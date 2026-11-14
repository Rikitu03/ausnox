/**
 * Real adapters: extension points for the scientific-engine phase.
 *
 * Nothing here is implemented. Every call answers NOT_IMPLEMENTED so the UI
 * shows explicit "unavailable" states and never a favourable guess. Replace
 * each factory with a working implementation of the same contract; no UI
 * component needs to change. See docs/FRONTEND_HANDOFF.md.
 *
 *   terrain   preprocessed Jezero DEM assets (public/data/jezero/manifest.json + grid)
 *   mapData   NASA Mars Trek WMTS layers, DEM footprint, cited science targets
 *   routing   A* on the validated terrain grid, ideally in a Web Worker
 *   solar     Mars24-derived local solar time and daylight window
 *   mission   feasibility rules from docs/SCIENTIFIC_MODELS.md §7
 */
import type {
  AusnoxServices,
  MapDataService,
  MissionService,
  ResultSource,
  RoutingService,
  ServiceError,
  SolarService,
  TerrainService,
} from '@/services/contracts'

const source: ResultSource = {
  kind: 'engine',
  adapter: 'real-unimplemented',
  version: '0.0.0',
  note: 'Real adapter extension point without an implementation',
}

const notImplemented = (what: string): ServiceError => ({
  status: 'error',
  code: 'NOT_IMPLEMENTED',
  detail: `${what} is not implemented yet. Run with VITE_DATA_MODE=mock to use demonstration data`,
  source,
})

const terrain: TerrainService = {
  load: async () => notImplemented('The Jezero terrain adapter'),
  sample: (point) => ({ grid: point, geo: null, cell: null, validity: 'unavailable', elevationM: null, slopeDeg: null }),
  nearestValid: () => null,
  toGeo: () => null,
  fromGeo: () => null,
}

const mapData: MapDataService = {
  listLayers: async () => notImplemented('The NASA/USGS map layer adapter'),
  getLayerImagery: async () => notImplemented('The NASA/USGS imagery adapter'),
  listWaypoints: async () => notImplemented('The science waypoint adapter'),
  listProvenance: () => [],
}

const routing: RoutingService = {
  computeRoundTrip: async () => notImplemented('The A* routing engine'),
}

const solar: SolarService = {
  listScenarios: () => [],
  getSolarDay: async () => notImplemented('The Mars24 solar model'),
}

const mission: MissionService = {
  assess: () => notImplemented('The mission feasibility engine'),
}

export function createRealServices(): AusnoxServices {
  return { mode: 'real', terrain, mapData, routing, solar, mission }
}
