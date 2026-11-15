/**
 * State shared by the real adapters: the loaded terrain dataset, the cited science targets, and
 * the engine results behind each frontend result object.
 *
 * The frontend contracts carry display-ready values only. The feasibility assessment, however, must be
 * computed by the engine from the engine's own route and daylight objects (surface distances, absolute
 * UTC instants). The adapters therefore keep those engine objects in WeakMaps keyed by the frontend
 * result they produced, so `MissionService.assess` can hand the originals to the engine.
 */
import {
  ENGINE_VERSION,
  type DaylightWindowResult,
  type EngineError,
  type RoundTripResult,
  type ScienceTarget,
  type TerrainDataset,
} from '@ausnox/scientific-engine'
import type { ResultSource } from '@/services/contracts'

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export interface RealAdapterOptions {
  /** Base URL of the app's static files (default: Vite's BASE_URL). */
  baseUrl?: string
  /** Injected fetch for tests (default: global fetch). */
  fetch?: FetchFn
  /** Compute routes in a Web Worker when available (default true). */
  useWorker?: boolean
  /** Probe Mars Trek with one tile before offering a layer (default true). */
  probeImagery?: boolean
}

export interface SolarEntry {
  daylight: DaylightWindowResult
  /** The instant that fixes the sol of the scenario. */
  referenceUtcMs: number
}

export interface RealContext {
  options: Required<Pick<RealAdapterOptions, 'baseUrl' | 'useWorker' | 'probeImagery'>> & { fetch: FetchFn }
  dataset: TerrainDataset | null
  /** Raw terrain.bin bytes behind `dataset` (its typed arrays are views on this buffer). */
  buffer: ArrayBuffer | null
  /** In-flight or settled terrain load, shared by every adapter that needs the dataset. */
  loading: Promise<TerrainDataset | EngineError> | null
  targets: ScienceTarget[] | null
  routeStash: WeakMap<object, RoundTripResult>
  solarStash: WeakMap<object, SolarEntry>
}

export function createContext(options: RealAdapterOptions = {}): RealContext {
  const fetchFn: FetchFn = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  return {
    options: {
      baseUrl: options.baseUrl ?? import.meta.env.BASE_URL,
      useWorker: options.useWorker ?? true,
      probeImagery: options.probeImagery ?? true,
      fetch: fetchFn,
    },
    dataset: null,
    buffer: null,
    loading: null,
    targets: null,
    routeStash: new WeakMap(),
    solarStash: new WeakMap(),
  }
}

export const assetUrl = (ctx: RealContext, file: string) => `${ctx.options.baseUrl}data/jezero/${file}`

export const engineSource = (adapter: string, note: string): ResultSource => ({
  kind: 'engine',
  adapter: `scientific-engine/${adapter}`,
  version: ENGINE_VERSION,
  note,
})
