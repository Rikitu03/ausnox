import { create } from 'zustand'
import {
  services,
  type AssessmentResult,
  type GridCoord,
  type MissionAssumptions,
  type MissionConfig,
  type RouteMode,
  type RouteResult,
  type ScienceStop,
  type SolarResult,
} from '@/services'
import { validateMission, type ValidationIssue } from '@/utils/validation'

/** Illustrative defaults from docs/SCIENTIFIC_MODELS.md §5. Not NASA operational values. */
export const DEFAULT_ASSUMPTIONS: MissionAssumptions = {
  walkingSpeedMps: 0.6,
  maxSlopeDeg: 15,
  reserveMin: 30,
  startLtstHours: 13,
  maxEvaEnabled: false,
  maxEvaHours: 8,
  warningMarginMin: 30,
  solarScenarioId: 'demo-mid',
}

const emptyMission = (): MissionConfig => ({
  id: 'mission-draft',
  name: 'Untitled Marswalk',
  habitat: null,
  destination: null,
  stops: [],
  routeMode: 'shortest',
  assumptions: { ...DEFAULT_ASSUMPTIONS, solarScenarioId: services.solar.listScenarios()[0]?.id ?? '' },
})

/** First-run sample. Both points sit on valid cells of the illustrative demo terrain. */
const demoMission = (): MissionConfig => ({
  ...emptyMission(),
  id: 'demo-marswalk-01',
  name: 'Demo Marswalk 01',
  habitat: { id: 'habitat', label: 'Habitat', position: { x: 700, y: 1500 } },
  destination: {
    id: 'destination',
    label: 'Sampling stop A',
    position: { x: 3290, y: 1930 },
    durationMin: 30,
    waypointId: 'wp-a',
  },
})

export type CalcStatus = 'idle' | 'calculating' | 'done'

interface MissionState {
  config: MissionConfig
  isDemo: boolean
  status: CalcStatus
  /** True when inputs changed after the shown results were calculated. */
  stale: boolean
  requestId: string | null
  routes: Partial<Record<RouteMode, RouteResult>>
  assessments: Partial<Record<RouteMode, AssessmentResult>>
  solar: SolarResult | null
  /** Shown after a calculation was refused. Cleared on the next edit. */
  issues: ValidationIssue[]

  setName(name: string): void
  setHabitat(position: GridCoord): void
  setDestination(position: GridCoord, label?: string, waypointId?: string | null, durationMin?: number): void
  addStop(position: GridCoord, label?: string, waypointId?: string | null, durationMin?: number): void
  removeStop(id: string): void
  setStopDuration(id: string, durationMin: number): void
  setRouteMode(mode: RouteMode): void
  setAssumption<K extends keyof MissionAssumptions>(key: K, value: MissionAssumptions[K]): void
  restoreDefaultAssumptions(): void
  loadDemo(): void
  reset(): void
  calculate(): Promise<void>
}

let stopCounter = 0
let requestCounter = 0
let controller: AbortController | null = null
let autoTimer: ReturnType<typeof setTimeout> | undefined

/** Delay before an edit triggers an automatic recalculation. */
export const AUTO_RECALC_MS = import.meta.env.MODE === 'test' ? 0 : 550

export const useMissionStore = create<MissionState>((set, get) => {
  /** Applies an edit, marks results stale and schedules a recalculation when results already exist. */
  const edit = (patch: (c: MissionConfig) => MissionConfig) => {
    controller?.abort()
    const hadResults = get().status !== 'idle'
    set((s) => ({
      config: patch(s.config),
      isDemo: false,
      stale: hadResults,
      issues: [],
      status: s.status === 'calculating' ? 'done' : s.status,
      requestId: null,
    }))
    clearTimeout(autoTimer)
    if (hadResults) autoTimer = setTimeout(() => void get().calculate(), AUTO_RECALC_MS)
  }

  return {
    config: emptyMission(),
    isDemo: false,
    status: 'idle',
    stale: false,
    requestId: null,
    routes: {},
    assessments: {},
    solar: null,
    issues: [],

    setName: (name) => set((s) => ({ config: { ...s.config, name } })),
    setHabitat: (position) => edit((c) => ({ ...c, habitat: { id: 'habitat', label: 'Habitat', position } })),
    setDestination: (position, label = 'Science destination', waypointId = null, durationMin) =>
      edit((c) => ({
        ...c,
        destination: {
          id: 'destination',
          label,
          position,
          waypointId,
          durationMin: durationMin ?? c.destination?.durationMin ?? 15,
        },
      })),
    addStop: (position, label, waypointId = null, durationMin = 15) =>
      edit((c) => {
        const stop: ScienceStop = {
          id: `stop-${++stopCounter}`,
          label: label ?? `Stop ${c.stops.length + 1}`,
          position,
          waypointId,
          durationMin,
        }
        return { ...c, stops: [...c.stops, stop] }
      }),
    removeStop: (id) => edit((c) => ({ ...c, stops: c.stops.filter((s) => s.id !== id) })),
    setStopDuration: (id, durationMin) =>
      edit((c) =>
        id === 'destination' && c.destination
          ? { ...c, destination: { ...c.destination, durationMin } }
          : { ...c, stops: c.stops.map((s) => (s.id === id ? { ...s, durationMin } : s)) },
      ),
    // Both modes are calculated together, so switching between them needs no new request.
    setRouteMode: (routeMode) => set((s) => ({ config: { ...s.config, routeMode } })),
    setAssumption: (key, value) => edit((c) => ({ ...c, assumptions: { ...c.assumptions, [key]: value } })),
    restoreDefaultAssumptions: () =>
      edit((c) => ({ ...c, assumptions: { ...DEFAULT_ASSUMPTIONS, solarScenarioId: c.assumptions.solarScenarioId } })),

    loadDemo() {
      controller?.abort()
      clearTimeout(autoTimer)
      set({ config: demoMission(), isDemo: true, status: 'idle', stale: false, routes: {}, assessments: {}, solar: null, issues: [] })
      void get().calculate()
    },
    reset() {
      controller?.abort()
      clearTimeout(autoTimer)
      set({ config: emptyMission(), isDemo: false, status: 'idle', stale: false, routes: {}, assessments: {}, solar: null, issues: [], requestId: null })
    },

    async calculate() {
      clearTimeout(autoTimer)
      const { config } = get()
      const issues = validateMission(config, services.terrain)
      if (issues.length > 0) {
        // Refuse to calculate. Any earlier results stay marked stale so they cannot be mistaken for current.
        set((s) => ({ issues, status: s.status === 'calculating' ? 'done' : s.status }))
        return
      }
      controller?.abort()
      controller = new AbortController()
      const { signal } = controller
      const requestId = `req-${++requestCounter}`
      set({ status: 'calculating', requestId, issues: [] })

      const request = (mode: RouteMode) =>
        services.routing.computeRoundTrip(
          {
            requestId,
            datasetId: 'active-terrain',
            habitat: config.habitat!.position,
            waypoints: [...config.stops, config.destination!].map((s) => ({ label: s.label, position: s.position })),
            mode,
            maxSlopeDeg: config.assumptions.maxSlopeDeg,
          },
          signal,
        )
      try {
        const [solar, shortest, lowerSlope] = await Promise.all([
          services.solar.getSolarDay(config.assumptions.solarScenarioId, services.terrain.toGeo(config.habitat!.position)),
          request('shortest'),
          request('lower-slope'),
        ])
        // A newer request or an edit has superseded this one: drop the result.
        if (get().requestId !== requestId) return
        const routes = { shortest, 'lower-slope': lowerSlope }
        set({
          status: 'done',
          stale: false,
          solar,
          routes,
          assessments: {
            shortest: services.mission.assess({ config, route: shortest, solar }),
            'lower-slope': services.mission.assess({ config, route: lowerSlope, solar }),
          },
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        throw error
      }
    },
  }
})

/** Results for the route mode currently selected in the planner. */
export function selectActive(s: MissionState) {
  const route = s.routes[s.config.routeMode] ?? null
  const assessment = s.assessments[s.config.routeMode] ?? null
  return {
    route,
    okRoute: route?.status === 'ok' ? route.route : null,
    assessment,
    okAssessment: assessment?.status === 'ok' ? assessment.assessment : null,
  }
}
