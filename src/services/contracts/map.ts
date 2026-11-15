import type { ProvenanceKind, Result } from './common'
import type { GeoCoord, GridCoord } from './geo'

export type LayerAvailability = 'available' | 'unavailable'

export interface LegendStop {
  label: string
  color: string
  /** Second visual channel so classes never rely on colour alone. */
  pattern: 'solid' | 'hatch' | 'cross'
}

export interface MapLayer {
  id: string
  title: string
  role: 'basemap' | 'overlay'
  /** Mission and instrument responsible for the source data, when there is one. */
  mission: string | null
  provenanceId: string
  availability: LayerAvailability
  /** Why the layer cannot be shown, when unavailable. */
  availabilityNote: string | null
  /** True when the pixels are synthetic stand-ins and not the named dataset. */
  illustrative: boolean
  defaultVisible: boolean
  legend: { title: string; unit: string | null; stops: LegendStop[] } | null
  /** Scientific limitation the UI must show next to the layer (for example an unresolved registration offset). */
  caveat?: string | null
}

/** Raster the map can draw for a layer. Real adapters may return tiles instead of a single image. */
export type LayerImagery =
  | { type: 'image'; url: string; boundsM: { min: GridCoord; max: GridCoord } }
  | {
      type: 'tiles'
      /** Leaflet-style template with {z}/{y}/{x}. The tile grid is equirectangular in degrees, 2 × 1 tiles at level 0. */
      urlTemplate: string
      attribution: string
      /** Geographic footprint of the layer. No tile is requested outside it. */
      bounds: { west: number; south: number; east: number; north: number }
      maxNativeZoom: number
    }

export interface ScienceWaypoint {
  id: string
  title: string
  position: GridCoord
  description: string
  /** `illustrative` waypoints carry no geological claim. `cited` ones need `sourceUrl`. */
  labelQuality: 'illustrative' | 'cited'
  sourceUrl: string | null
  suggestedDurationMin: number
  provenanceId: string
  /** Geographic position as published by the source, when it has one. */
  geo?: GeoCoord
  /** All cited sources, when there are several. */
  sources?: { label: string; url: string }[]
  /** Limitations of the location itself, shown with the waypoint. */
  caveats?: string[]
  /** Mission sol and UTC date of the observation behind the location. */
  observation?: { sol: number | null; utcDate: string | null }
}

export interface ProvenanceRecord {
  id: string
  title: string
  kind: ProvenanceKind
  mission: string | null
  instrument: string | null
  provider: string | null
  measures: string
  coverage: string
  resolution: string | null
  limitations: string[]
  sourceUrl: string | null
  attribution: string
  /**
   * `planned`: named in docs/DATA_SOURCES.md, not ingested.
   * `demo-stand-in`: the app currently shows synthetic data in its place.
   * `integrated`: real data verified and served.
   */
  integration: 'planned' | 'demo-stand-in' | 'integrated'
}

export interface MapDataService {
  listLayers(): Promise<Result<{ layers: MapLayer[] }>>
  /** Requests the pixels for one layer. Fails with DATA_UNAVAILABLE when imagery cannot be fetched. */
  getLayerImagery(layerId: string): Promise<Result<{ imagery: LayerImagery }>>
  listWaypoints(): Promise<Result<{ waypoints: ScienceWaypoint[] }>>
  listProvenance(): ProvenanceRecord[]
}
