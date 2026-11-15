/**
 * Runs engine round-trip searches off the UI thread.
 *
 * Web Worker path (browser): one worker, loaded once with a copy of terrain.bin. Requests are queued on
 * the main thread and posted one at a time, so a superseded request that has not started is simply
 * removed. A running request can only be interrupted by terminating the worker (handoff §8); the next
 * request then starts a fresh worker. A watchdog turns a silent worker into a TIMEOUT result, and a
 * crashed worker into an error result, so the planner can never stay in a loading state.
 *
 * Fallback (no Worker, e.g. tests): the engine's cooperative async search on the main thread, which
 * yields every 25,000 expansions and honours the AbortSignal.
 */
import {
  calculateRoundTripAsync,
  createLatestRequestGate,
  engineError,
  type EngineError,
  type RoundTripRequest,
  type RoundTripResult,
  type RouteWorkerRequest,
  type RouteWorkerResponse,
  type TerrainDataset,
} from '@ausnox/scientific-engine'
import { ROUTE_WORKER_WATCHDOG_MS } from './config'
import { abortError } from './errors'

export interface RouteExecutor {
  roundTrip(dataset: TerrainDataset, request: RoundTripRequest, signal?: AbortSignal): Promise<RoundTripResult | EngineError>
  dispose(): void
  readonly kind: 'worker' | 'main-thread'
}

/** Cooperative main-thread executor (no Worker available). */
export function createMainThreadExecutor(): RouteExecutor {
  return {
    kind: 'main-thread',
    async roundTrip(dataset, request, signal) {
      if (signal?.aborted) throw abortError()
      const r = await calculateRoundTripAsync(dataset, request, { signal })
      if (r.status === 'error' && r.code === 'CANCELLED') throw abortError()
      if (signal?.aborted) throw abortError()
      return r
    },
    dispose() {},
  }
}

interface Job {
  id: string
  request: RoundTripRequest
  signal?: AbortSignal
  resolve(v: RoundTripResult | EngineError): void
  reject(e: unknown): void
  cleanup(): void
}

/** Worker-backed executor. `spawn` creates the module worker (injected so tests can fake it). */
export function createWorkerExecutor(
  getBuffer: () => { manifest: unknown; buffer: ArrayBuffer } | null,
  spawn: () => Worker,
): RouteExecutor {
  // Issues the unique message ids; latest-request-wins per route mode is applied by the routing adapter.
  const ids = createLatestRequestGate('route')
  let worker: Worker | null = null
  let ready: Promise<{ datasetVersion: string } | EngineError> | null = null
  let loadResolve: ((v: { datasetVersion: string } | EngineError) => void) | null = null
  let running: Job | null = null
  let watchdog: ReturnType<typeof setTimeout> | undefined
  const queue: Job[] = []

  const kill = () => {
    worker?.terminate()
    worker = null
    ready = null
    loadResolve?.(engineError('MODEL_FAILURE', 'The route worker stopped before it finished loading terrain.'))
    loadResolve = null
  }

  const finish = (job: Job, settle: () => void) => {
    clearTimeout(watchdog)
    job.cleanup()
    if (running === job) running = null
    settle()
    void pump()
  }

  const onMessage = (e: MessageEvent<RouteWorkerResponse>) => {
    const msg = e.data
    if (msg.type === 'loaded' || (msg.type === 'error' && msg.requestId.startsWith('load-'))) {
      loadResolve?.(msg.type === 'loaded' ? { datasetVersion: msg.datasetVersion } : msg.error)
      loadResolve = null
      return
    }
    const job = running
    // Responses for anything but the request in flight (for example from a terminated run) are stale: drop them.
    if (!job || msg.requestId !== job.id) return
    if (msg.type === 'result') finish(job, () => job.resolve(msg.result as RoundTripResult))
    else finish(job, () => job.resolve(msg.error))
  }

  const onCrash = (detail: string) => {
    const job = running
    kill()
    if (job) finish(job, () => job.resolve(engineError('MODEL_FAILURE', `The route worker failed: ${detail}`)))
  }

  const start = (): Promise<{ datasetVersion: string } | EngineError> => {
    if (ready) return ready
    const payload = getBuffer()
    if (!payload) return Promise.resolve(engineError('DATASET_UNAVAILABLE', 'Terrain is not loaded, so the route worker has no data.'))
    try {
      worker = spawn()
    } catch (err) {
      return Promise.resolve(engineError('MODEL_FAILURE', `The route worker could not start: ${err instanceof Error ? err.message : String(err)}`))
    }
    worker.onmessage = onMessage
    worker.onerror = (ev) => {
      ev.preventDefault?.()
      onCrash(ev.message || 'script error')
    }
    worker.onmessageerror = () => onCrash('a message could not be decoded')
    ready = new Promise((resolve) => {
      loadResolve = resolve
    })
    // A copy is transferred: the main thread keeps its own views for synchronous sampling.
    const copy = payload.buffer.slice(0)
    const msg: RouteWorkerRequest = { type: 'load', requestId: `load-${Date.now()}`, manifest: payload.manifest, buffer: copy }
    worker.postMessage(msg, [copy])
    return ready
  }

  async function pump(): Promise<void> {
    if (running || queue.length === 0) return
    const job = queue.shift()!
    if (job.signal?.aborted) {
      job.cleanup()
      job.reject(abortError())
      return pump()
    }
    running = job
    const loaded = await start()
    if (running !== job) return // aborted while the worker was loading
    if ('status' in loaded) {
      kill()
      return finish(job, () => job.resolve(loaded))
    }
    watchdog = setTimeout(() => {
      kill()
      finish(job, () =>
        job.resolve(engineError('COMPUTATION_TIMEOUT', `The route worker did not answer within ${ROUTE_WORKER_WATCHDOG_MS / 1000} s.`)),
      )
    }, ROUTE_WORKER_WATCHDOG_MS)
    const msg: RouteWorkerRequest = { type: 'round-trip', requestId: job.id, datasetVersion: loaded.datasetVersion, request: job.request }
    worker!.postMessage(msg)
  }

  return {
    kind: 'worker',
    roundTrip(_dataset, request, signal) {
      if (signal?.aborted) return Promise.reject(abortError())
      return new Promise((resolve, reject) => {
        const job: Job = {
          id: ids.issue(),
          request,
          signal,
          resolve,
          reject,
          cleanup: () => signal?.removeEventListener('abort', onAbort),
        }
        function onAbort() {
          const i = queue.indexOf(job)
          if (i >= 0) {
            queue.splice(i, 1)
            job.cleanup()
            reject(abortError())
            return
          }
          if (running === job) {
            // Only termination interrupts a synchronous search inside the worker.
            kill()
            finish(job, () => reject(abortError()))
          }
        }
        signal?.addEventListener('abort', onAbort, { once: true })
        queue.push(job)
        void pump()
      })
    },
    dispose() {
      kill()
      for (const job of queue.splice(0)) {
        job.cleanup()
        job.reject(abortError())
      }
    },
  }
}
