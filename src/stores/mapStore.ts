import type { Map as LeafletMap } from 'leaflet'
import { create } from 'zustand'
import type { TerrainSample } from '@/services'

/** Fast-changing map state, kept apart so pointer moves do not re-render the planner. */
interface MapState {
  map: LeafletMap | null
  zoom: number
  hover: TerrainSample | null
}

export const useMapStore = create<MapState>(() => ({ map: null, zoom: 0, hover: null }))
