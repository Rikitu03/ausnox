/** Which family of adapters is serving the app. */
export type DataMode = 'mock' | 'real'

/** Scientific category shown next to every value (docs/SCIENTIFIC_MODELS.md §1). */
export type ProvenanceKind = 'observed' | 'derived' | 'simulated' | 'historical' | 'unknown'

/**
 * Where a result came from. The UI uses `kind` to tell demonstration
 * responses apart from results of the real calculation engine.
 */
export interface ResultSource {
  kind: 'mock' | 'engine'
  adapter: string
  version: string
  /** One plain sentence the UI can show to explain what produced this. */
  note: string
}

export type ServiceErrorCode =
  | 'NO_COVERAGE' // point is outside the terrain footprint
  | 'NO_DATA' // point or path touches cells without terrain data
  | 'NO_ROUTE' // no legal path connects the points
  | 'UNSUPPORTED_SLOPE' // every candidate path exceeds the slope limit
  | 'INVALID_INPUT' // request failed validation
  | 'TIMEOUT' // calculation exceeded its time budget
  | 'MODEL_UNAVAILABLE' // a scientific model could not run
  | 'DATA_UNAVAILABLE' // a dataset or imagery request failed
  | 'NOT_IMPLEMENTED' // real adapter extension point without an implementation

export interface ServiceError {
  status: 'error'
  code: ServiceErrorCode
  detail: string
  source: ResultSource
  /** The scientific engine's own error, kept unchanged for debugging and explanations. Real adapters only. */
  origin?: { code: string; details?: Readonly<Record<string, unknown>>; failedLeg?: string }
}

export type Ok<T> = { status: 'ok'; source: ResultSource } & T
export type Result<T> = Ok<T> | ServiceError
