import { create } from 'zustand'
import { services, type GridCoord, type TerrainSample } from '@/services'
import { checkPlacement, type PlacementProblem } from '@/utils/validation'
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

/** What a placement carries when it comes from a listed science waypoint (or the sample mission). */
export interface PlacementMeta {
  label: string
  waypointId: string | null
  durationMin: number
}

/** A refused placement, kept on screen until the planner confirms a snap or cancels. */
export interface PlacementIssue {
  target: PlacementTarget
  point: GridCoord
  /** Why the point was refused: missing data, or a measured slope above the mission limit. */
  validity: PlacementProblem
  /** Measured slope of the refused cell, when known. */
  slopeDeg: number | null
  /** Slope limit the point was checked against. */
  maxSlopeDeg: number
  /** Nearest usable cell (known slope at or below the limit), offered as an explicit choice. Never applied silently. */
  snap: GridCoord | null
  /** Ground distance to the snap cell, metres (Mars sphere, not grid metres). */
  snapDistanceM: number | null
  snapSlopeDeg: number | null
  meta: PlacementMeta | null
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
  attemptPlace(target: PlacementTarget, point: GridCoord, meta?: PlacementMeta | null): boolean
  confirmSnap(): void
  /** Loads the sample mission; a destination that fails the placement check opens the confirm-to-snap prompt. */
  loadSample(): void
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

function apply(target: PlacementTarget, point: GridCoord, meta: PlacementMeta | null) {
  const mission = useMissionStore.getState()
  if (target === 'habitat') mission.setHabitat(point)
  else if (target === 'destination') {
    if (meta) mission.setDestination(point, meta.label, meta.waypointId, meta.durationMin)
    else mission.setDestination(point)
  } else if (meta) mission.addStop(point, meta.label, meta.waypointId, meta.durationMin)
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
  basemapId: services.mode === 'mock' ? 'schematic-base' : 'hirise-ortho',
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

  attemptPlace(target, point, meta = null) {
    const maxSlopeDeg = useMissionStore.getState().config.assumptions.maxSlopeDeg
    const check = checkPlacement(services.terrain, point, maxSlopeDeg)
    if (check.ok) {
      apply(target, point, meta)
      set({ placement: null, placementIssue: null, coordinateEntry: null })
      return true
    }
    const snap = check.problem === 'unavailable' ? null : services.terrain.nearestValid(point, SNAP_SEARCH_M, maxSlopeDeg)
    set({
      placementIssue: {
        target,
        point,
        validity: check.problem,
        slopeDeg: check.sample.slopeDeg,
        maxSlopeDeg,
        snap,
        snapDistanceM: snap ? services.terrain.groundDistanceM(point, snap) : null,
        snapSlopeDeg: snap ? services.terrain.sample(snap).slopeDeg : null,
        meta,
      },
    })
    return false
  },
  confirmSnap() {
    const issue = get().placementIssue
    if (!issue?.snap) return
    const mission = useMissionStore.getState()
    const finishSample = issue.target === 'destination' && mission.sampleDestinationPending
    const meta = issue.meta ? { ...issue.meta, label: `${issue.meta.label} (nearest usable cell)` } : null
    apply(issue.target, issue.snap, meta)
    set({ placement: null, placementIssue: null, coordinateEntry: null })
    if (finishSample) {
      // The user confirmed the sample's adjusted destination: the sample is complete, calculate it.
      useMissionStore.setState({ isDemo: true })
      void useMissionStore.getState().calculate()
    }
  },
  loadSample() {
    set({ placement: null, placementIssue: null })
    const outcome = useMissionStore.getState().loadDemo()
    if (outcome.status === 'needs-destination') {
      const { destination } = outcome
      get().attemptPlace('destination', destination.position, {
        label: destination.label,
        waypointId: destination.waypointId,
        durationMin: destination.durationMin,
      })
    }
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
