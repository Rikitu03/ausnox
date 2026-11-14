import { create } from 'zustand'
import {
  services,
  type LayerImagery,
  type MapLayer,
  type ResultSource,
  type ScienceWaypoint,
  type ServiceError,
  type TerrainManifest,
  type TerrainRaster,
} from '@/services'

export type ImageryState =
  | { state: 'loading' }
  | { state: 'ready'; imagery: LayerImagery }
  | { state: 'error'; error: ServiceError }

interface DataState {
  boot: 'loading' | 'ready'
  manifest: TerrainManifest | null
  raster: TerrainRaster | null
  terrainSource: ResultSource | null
  terrainError: ServiceError | null
  layers: MapLayer[]
  layersError: ServiceError | null
  waypoints: ScienceWaypoint[]
  waypointsError: ServiceError | null
  imagery: Record<string, ImageryState>
  /** Bumps whenever terrain is (re)loaded, so dependants can refresh. */
  revision: number
  init(): Promise<void>
  loadImagery(layerId: string, force?: boolean): Promise<void>
}

export const useDataStore = create<DataState>((set, get) => ({
  boot: 'loading',
  manifest: null,
  raster: null,
  terrainSource: null,
  terrainError: null,
  layers: [],
  layersError: null,
  waypoints: [],
  waypointsError: null,
  imagery: {},
  revision: 0,

  async init() {
    set({ boot: 'loading', imagery: {} })
    const [terrain, layers, waypoints] = await Promise.all([
      services.terrain.load(),
      services.mapData.listLayers(),
      services.mapData.listWaypoints(),
    ])
    set((s) => ({
      boot: 'ready',
      revision: s.revision + 1,
      manifest: terrain.status === 'ok' ? terrain.manifest : null,
      raster: terrain.status === 'ok' ? terrain.raster : null,
      terrainSource: terrain.source,
      terrainError: terrain.status === 'error' ? terrain : null,
      layers: layers.status === 'ok' ? layers.layers : [],
      layersError: layers.status === 'error' ? layers : null,
      waypoints: waypoints.status === 'ok' ? waypoints.waypoints : [],
      waypointsError: waypoints.status === 'error' ? waypoints : null,
    }))
  },

  async loadImagery(layerId, force = false) {
    const existing = get().imagery[layerId]
    if (existing && !force && existing.state !== 'error') return
    set((s) => ({ imagery: { ...s.imagery, [layerId]: { state: 'loading' } } }))
    const result = await services.mapData.getLayerImagery(layerId)
    set((s) => ({
      imagery: {
        ...s.imagery,
        [layerId]: result.status === 'ok' ? { state: 'ready', imagery: result.imagery } : { state: 'error', error: result },
      },
    }))
  },
}))
