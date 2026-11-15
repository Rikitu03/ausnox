/**
 * Structured, serialisable error contract shared by every engine module.
 * No engine function throws for expected failures; they return `EngineError`.
 */
export type EngineErrorCode =
  // routing (docs/SCIENTIFIC_ENGINE_HANDOFF.md §11)
  | 'INVALID_INPUT'
  | 'NO_COVERAGE'
  | 'NO_DATA'
  | 'NO_ROUTE'
  | 'UNSUPPORTED_SLOPE'
  | 'COMPUTATION_TIMEOUT'
  | 'CANCELLED'
  // datasets
  | 'DATASET_UNAVAILABLE'
  | 'DATASET_INVALID'
  | 'DATASET_INTEGRITY'
  | 'DATASET_MISMATCH'
  | 'UNSUPPORTED_CRS'
  // astronomy
  | 'UNSUPPORTED_EPOCH'
  | 'MODEL_FAILURE'

export type RoutingErrorCode =
  | 'INVALID_INPUT'
  | 'NO_COVERAGE'
  | 'NO_DATA'
  | 'NO_ROUTE'
  | 'UNSUPPORTED_SLOPE'
  | 'COMPUTATION_TIMEOUT'
  | 'CANCELLED'
  | 'DATASET_MISMATCH'

export interface EngineError<C extends EngineErrorCode = EngineErrorCode> {
  readonly status: 'error'
  readonly code: C
  /** One plain-language sentence suitable for display. */
  readonly message: string
  readonly details?: Readonly<Record<string, unknown>>
}

export type RoutingError = EngineError<RoutingErrorCode>

export function engineError<C extends EngineErrorCode>(
  code: C,
  message: string,
  details?: Record<string, unknown>,
): EngineError<C> {
  return details === undefined ? { status: 'error', code, message } : { status: 'error', code, message, details }
}

export function isEngineError(value: unknown): value is EngineError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { status?: unknown }).status === 'error' &&
    typeof (value as { code?: unknown }).code === 'string'
  )
}
