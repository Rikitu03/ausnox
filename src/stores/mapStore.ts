import type { Map as LeafletMap } from 'leaflet'
import { create } from 'zustand'
import type { GridCoord, TerrainSample } from '@/services'

/** Camera actions the 3D scene exposes to the map chrome. Each one keeps the scene; none rebuild it. */
export interface ThreeControls {
  zoom(factor: number): void
  fitTerrain(): void
  focusPoint(point: GridCoord): void
  focusRoute(): void
  rotate(azimuth: number, polar: number): void
}

/** Fast-changing map state, kept apart so pointer moves do not re-render the planner. */
interface MapState {
  map: LeafletMap | null
  threeControls: ThreeControls | null
  /** Latest 3D overlay problem (route, marker or camera action), shown without hiding the terrain. */
  threeOverlayError: string
  zoom: number
  /** Ground metres per screen pixel east-west at the map centre, measured on the Mars sphere. */
  metresPerPx: number | null
  hover: TerrainSample | null
}

export const useMapStore = create<MapState>(() => ({ map: null, threeControls: null, threeOverlayError: '', zoom: 0, metresPerPx: null, hover: null }))
