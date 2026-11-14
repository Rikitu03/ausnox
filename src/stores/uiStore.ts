import { create } from 'zustand'
import { services, type CellValidity, type GridCoord, type TerrainSample } from '@/services'
import { useMissionStore } from './missionStore'

export type View = 'control' | 'terrain' | 'simulation' | 'summary' | 'sources'
export const VIEWS: { id: View; label: string }[] = [
  { id: 'control', label: 'Mission control' },
  { id: 'terrain', label: 'Terrain' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'summary', label: 'Summary' },
  { id: 'sources', label: 'Data sources' },
]

export type PlacementTarget = 'habitat' | 'destination' | 'stop'

/** A refused placement, kept on screen until the planner confirms a snap or cancels. */
export interface PlacementIssue {
  target: PlacementTarget
  point: GridCoord
  validity: CellValidity
  /** Nearest valid cell, offered as an explicit choice. Never applied silently. */
  snap: GridCoord | null
  snapDistanceM: number | null
}

interface UiState {
  view: View
  placement: PlacementTarget | null
  placementIssue: PlacementIssue | null
  coordinateEntry: PlacementTarget | null
  inspected: TerrainSample | null
  basemapId: string
  overlays: Record<string, boolean>
  features: { coverage: boolean; grid: boolean; waypoints: boolean }
  provenanceId: string | null
  helpOpen: boolean
  /** Draw the route of the other mode on the map as well. */
  compare: boolean
  /** Which side sheet is open on narrow screens. */
  sheet: 'left' | 'right' | null
  /** Incremented to ask the map to fit the terrain footprint, or centre on a point. */
  focus: { seq: number; point: GridCoord | null }

  setView(view: View): void
  startPlacement(target: PlacementTarget): void
  cancelPlacement(): void
  /** Tries to place the active target. Returns true when the point was accepted. */
  attemptPlace(target: PlacementTarget, point: GridCoord): boolean
  confirmSnap(): void
  openCoordinateEntry(target: PlacementTarget | null): void
  inspect(point: GridCoord | null): void
  setBasemap(id: string): void
  toggleOverlay(id: string, on?: boolean): void
  toggleFeature(key: keyof UiState['features']): void
  openProvenance(id: string | null): void
  setHelpOpen(open: boolean): void
  setCompare(compare: boolean): void
  setSheet(sheet: UiState['sheet']): void
  focusMap(point?: GridCoord | null): void
}

const SNAP_SEARCH_M = 400

function apply(target: PlacementTarget, point: GridCoord) {
  const mission = useMissionStore.getState()
  if (target === 'habitat') mission.setHabitat(point)
  else if (target === 'destination') mission.setDestination(point)
  else mission.addStop(point)
}

const viewFromHash = (): View => {
  const id = window.location.hash.replace(/^#\/?/, '')
  return VIEWS.some((v) => v.id === id) ? (id as View) : 'control'
}

export const useUiStore = create<UiState>((set, get) => ({
  view: viewFromHash(),
  placement: null,
  placementIssue: null,
  coordinateEntry: null,
  inspected: null,
  basemapId: 'schematic-base',
  overlays: {},
  features: { coverage: true, grid: true, waypoints: true },
  provenanceId: null,
  helpOpen: false,
  compare: false,
  sheet: null,
  focus: { seq: 0, point: null },

  setView(view) {
    if (window.location.hash !== `#/${view}`) window.history.replaceState(null, '', `#/${view}`)
    set({ view, sheet: null, placement: null, placementIssue: null })
  },
  startPlacement: (target) => set({ placement: target, placementIssue: null, sheet: null }),
  cancelPlacement: () => set({ placement: null, placementIssue: null }),

  attemptPlace(target, point) {
    const sample = services.terrain.sample(point)
    if (sample.validity === 'valid') {
      apply(target, point)
      set({ placement: null, placementIssue: null, coordinateEntry: null })
      return true
    }
    const snap = sample.validity === 'unavailable' ? null : services.terrain.nearestValid(point, SNAP_SEARCH_M)
    set({
      placementIssue: {
        target,
        point,
        validity: sample.validity,
        snap,
        snapDistanceM: snap ? Math.hypot(snap.x - point.x, snap.y - point.y) : null,
      },
    })
    return false
  },
  confirmSnap() {
    const issue = get().placementIssue
    if (!issue?.snap) return
    apply(issue.target, issue.snap)
    set({ placement: null, placementIssue: null, coordinateEntry: null })
  },
  openCoordinateEntry: (target) => set({ coordinateEntry: target, placementIssue: null, sheet: target ? null : get().sheet }),
  inspect: (point) => set({ inspected: point ? services.terrain.sample(point) : null }),
  setBasemap: (basemapId) => set({ basemapId }),
  toggleOverlay: (id, on) => set((s) => ({ overlays: { ...s.overlays, [id]: on ?? !s.overlays[id] } })),
  toggleFeature: (key) => set((s) => ({ features: { ...s.features, [key]: !s.features[key] } })),
  openProvenance: (provenanceId) => set({ provenanceId }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setCompare: (compare) => set({ compare }),
  setSheet: (sheet) => set({ sheet }),
  focusMap: (point = null) => set((s) => ({ focus: { seq: s.focus.seq + 1, point } })),
}))
