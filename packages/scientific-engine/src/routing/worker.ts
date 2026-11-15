/**
 * Web Worker-compatible routing host. Framework-free and side-effect free on import.
 *
 * Frontend wiring (Vite):
 *   // src/workers/route.worker.ts
 *   import { installRouteWorker } from '@ausnox/scientific-engine'
 *   installRouteWorker(self as unknown as RouteWorkerScope)
 *
 *   // main thread
 *   const worker = new Worker(new URL('./workers/route.worker.ts', import.meta.url), { type: 'module' })
 *   worker.postMessage({ type: 'load', requestId: 'load-1', manifest, buffer }, [buffer])
 *   worker.postMessage({ type: 'round-trip', requestId: gate.issue(), datasetVersion, request })
 *   // ignore responses for which gate.isLatest(response.requestId) is false
 */
import { engineError, type EngineError } from '../contracts/errors.js'
import { createTerrainDataset, type ChecksumStatus, type TerrainDataset } from '../terrain/dataset.js'
import { verifyTerrainChecksum } from '../terrain/loader.js'
import { planMission, type MissionPlanRequest } from '../mission/plan.js'
import { calculateRoundTrip, calculateRoute, compareRoundTrips, compareRoutes } from './route.js'
import type { RoundTripRequest, RouteRequest } from './types.js'

export type RouteWorkerRequest =
  | { readonly type: 'load'; readonly requestId: string; readonly manifest: unknown; readonly buffer: ArrayBuffer; readonly verifyChecksum?: boolean }
  | { readonly type: 'route'; readonly requestId: string; readonly datasetVersion: string; readonly request: RouteRequest }
  | { readonly type: 'compare'; readonly requestId: string; readonly datasetVersion: string; readonly request: Omit<RouteRequest, 'preference'> }
  | { readonly type: 'round-trip'; readonly requestId: string; readonly datasetVersion: string; readonly request: RoundTripRequest }
  | { readonly type: 'compare-round-trip'; readonly requestId: string; readonly datasetVersion: string; readonly request: Omit<RoundTripRequest, 'preference'> }
  | { readonly type: 'plan-mission'; readonly requestId: string; readonly datasetVersion: string; readonly request: MissionPlanRequest }

export type RouteWorkerResponse =
  | { readonly type: 'loaded'; readonly requestId: string; readonly datasetId: string; readonly datasetVersion: string; readonly checksum: ChecksumStatus }
  | { readonly type: 'result'; readonly requestId: string; readonly datasetVersion: string; readonly kind: RouteWorkerRequest['type']; readonly result: unknown }
  | { readonly type: 'error'; readonly requestId: string; readonly error: EngineError }

export interface RouteWorkerScope {
  onmessage: ((event: { data: RouteWorkerRequest }) => void) | null
  postMessage(message: RouteWorkerResponse): void
}

/** Stateful message handler holding the loaded dataset. */
export function createRouteWorkerHandler(): (message: RouteWorkerRequest) => Promise<RouteWorkerResponse> {
  let dataset: TerrainDataset | null = null
  return async (msg) => {
    const requestId = typeof msg?.requestId === 'string' ? msg.requestId : ''
    if (!msg || typeof msg !== 'object' || requestId === '') {
      return { type: 'error', requestId, error: engineError('INVALID_INPUT', 'Worker messages need a type and a requestId.') }
    }
    if (msg.type === 'load') {
      let checksum: ChecksumStatus = 'not-checked'
      if (msg.verifyChecksum !== false) {
        const expected = (msg.manifest as { binary?: { sha256?: unknown } })?.binary?.sha256
        const st = typeof expected === 'string' ? await verifyTerrainChecksum(msg.buffer, expected) : 'mismatch'
        if (st === 'mismatch') {
          return { type: 'error', requestId, error: engineError('DATASET_INTEGRITY', 'terrain.bin does not match the manifest checksum.') }
        }
        checksum = st
      }
      const r = createTerrainDataset(msg.manifest, msg.buffer, { checksum })
      if (r.status === 'error') return { type: 'error', requestId, error: r }
      dataset = r.dataset
      return { type: 'loaded', requestId, datasetId: dataset.id, datasetVersion: dataset.version, checksum }
    }
    if (!dataset) return { type: 'error', requestId, error: engineError('DATASET_UNAVAILABLE', 'No terrain dataset is loaded in the worker.') }
    if (msg.datasetVersion !== dataset.version) {
      return {
        type: 'error',
        requestId,
        error: engineError('DATASET_MISMATCH', 'The request targets a different terrain dataset version.', {
          loaded: dataset.version,
          requested: msg.datasetVersion,
        }),
      }
    }
    let result: unknown
    switch (msg.type) {
      case 'route':
        result = calculateRoute(dataset, msg.request)
        break
      case 'compare':
        result = compareRoutes(dataset, msg.request)
        break
      case 'round-trip':
        result = calculateRoundTrip(dataset, msg.request)
        break
      case 'compare-round-trip':
        result = compareRoundTrips(dataset, msg.request)
        break
      case 'plan-mission':
        result = planMission(dataset, msg.request)
        break
      default:
        return { type: 'error', requestId, error: engineError('INVALID_INPUT', `Unknown worker message type.`) }
    }
    return { type: 'result', requestId, datasetVersion: dataset.version, kind: msg.type, result }
  }
}

/** Attach the handler to a worker global scope. */
export function installRouteWorker(scope: RouteWorkerScope): void {
  const handle = createRouteWorkerHandler()
  scope.onmessage = (event) => {
    void handle(event.data).then((response) => scope.postMessage(response))
  }
}

/**
 * Latest-request-wins gate for the main thread: issue an id per request and drop any
 * response whose id is no longer the latest (stale-result rejection).
 */
export function createLatestRequestGate(prefix = 'req'): { issue(): string; isLatest(id: string): boolean; latest(): string | null } {
  let counter = 0
  let current: string | null = null
  return {
    issue() {
      counter += 1
      current = `${prefix}-${counter}`
      return current
    },
    isLatest(id: string) {
      return current !== null && id === current
    },
    latest() {
      return current
    },
  }
}
