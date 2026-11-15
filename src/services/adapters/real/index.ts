/**
 * Real adapters: the frontend contracts implemented on @ausnox/scientific-engine and the bundled,
 * validated Jezero assets (docs/INTEGRATION_REPORT.md).
 *
 *   terrain   public/data/jezero/manifest.json + terrain.bin, verified by the engine loader
 *   mapData   NASA Mars Trek WMTS (HiRISE, CTX, MOLA), DTM-derived layers, cited science targets
 *   routing   engine A* (shortest / lower-slope, independent return) in a Web Worker
 *   solar     engine Mars24 daylight window for documented scenarios
 *   mission   engine feasibility rules on the engine's own route and daylight objects
 *
 * Nothing here falls back to mock or synthetic values: a missing input produces an error or an
 * indeterminate assessment.
 */
import type { AusnoxServices, SampleMission } from '@/services/contracts'
import { SAMPLE_MISSION } from './config'
import { createContext, type RealAdapterOptions, type RealContext } from './context'
import { engineCellCenterToGrid, geoToGrid } from './coords'
import { createRealMapData } from './mapData'
import { createRealMission } from './mission'
import { createMainThreadExecutor, createWorkerExecutor, type RouteExecutor } from './routeExecutor'
import { createRealRouting } from './routing'
import { createRealSolar } from './solar'
import { createRealTerrain } from './terrain'

export type { RealAdapterOptions } from './context'

function createExecutor(ctx: RealContext): RouteExecutor {
  if (!ctx.options.useWorker || typeof Worker === 'undefined') return createMainThreadExecutor()
  return createWorkerExecutor(
    () => (ctx.dataset && ctx.buffer ? { manifest: ctx.dataset.manifest, buffer: ctx.buffer } : null),
    () => new Worker(new URL('../../../workers/route.worker.ts', import.meta.url), { type: 'module', name: 'ausnox-route' }),
  )
}

function sampleMission(ctx: RealContext): SampleMission | null {
  const d = ctx.dataset
  const targets = ctx.targets
  if (!d || !targets) return null
  const stop = targets.find((t) => t.id === SAMPLE_MISSION.stopTargetId)
  const dest = targets.find((t) => t.id === SAMPLE_MISSION.destinationTargetId)
  if (!stop || !dest) return null
  return {
    id: SAMPLE_MISSION.id,
    name: SAMPLE_MISSION.name,
    description: SAMPLE_MISSION.description,
    habitat: engineCellCenterToGrid(d, SAMPLE_MISSION.habitatEngineCell),
    stops: [{ label: stop.title, position: geoToGrid(d, stop.coordinate), durationMin: SAMPLE_MISSION.stopDurationMin, waypointId: stop.id }],
    // The published rover position. If it is too steep for the slope limit, the planner shows the nearest
    // traversable cell and waits for the user to confirm it; it is never moved silently.
    destination: { label: dest.title, position: geoToGrid(d, dest.coordinate), durationMin: SAMPLE_MISSION.destinationDurationMin, waypointId: dest.id },
    solarScenarioId: SAMPLE_MISSION.solarScenarioId,
    startLtstHours: SAMPLE_MISSION.startLtstHours,
  }
}

export interface RealServices extends AusnoxServices {
  /** Shared adapter state, exposed for integration tests and diagnostics. */
  readonly context: RealContext
  readonly routeExecutor: RouteExecutor['kind']
  readonly mission: ReturnType<typeof createRealMission>
}

export function createRealServices(options: RealAdapterOptions = {}): RealServices {
  const ctx = createContext(options)
  const executor = createExecutor(ctx)
  return {
    mode: 'real',
    context: ctx,
    routeExecutor: executor.kind,
    terrain: createRealTerrain(ctx),
    mapData: createRealMapData(ctx),
    routing: createRealRouting(ctx, executor),
    solar: createRealSolar(ctx),
    mission: createRealMission(ctx),
    sampleMission: () => sampleMission(ctx),
  }
}
