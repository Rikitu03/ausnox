/**
 * Engine error codes -> frontend error codes (docs/SCIENTIFIC_ENGINE_HANDOFF.md §11-12).
 *
 *   COMPUTATION_TIMEOUT                                   -> TIMEOUT
 *   DATASET_UNAVAILABLE / _INVALID / _INTEGRITY, UNSUPPORTED_CRS -> DATA_UNAVAILABLE
 *   UNSUPPORTED_EPOCH, MODEL_FAILURE                      -> MODEL_UNAVAILABLE
 *   NO_ROUTE, UNSUPPORTED_SLOPE, NO_COVERAGE, NO_DATA, INVALID_INPUT -> same code
 *   CANCELLED                                             -> never a result: the request is dropped (AbortError)
 *   DATASET_MISMATCH                                      -> DATA_UNAVAILABLE (the request is not answered from another dataset)
 *
 * The engine's code, details and failed leg are kept in `origin`.
 */
import type { EngineError, EngineErrorCode } from '@ausnox/scientific-engine'
import type { ResultSource, ServiceError, ServiceErrorCode } from '@/services/contracts'

const CODE_MAP: Record<EngineErrorCode, ServiceErrorCode> = {
  INVALID_INPUT: 'INVALID_INPUT',
  NO_COVERAGE: 'NO_COVERAGE',
  NO_DATA: 'NO_DATA',
  NO_ROUTE: 'NO_ROUTE',
  UNSUPPORTED_SLOPE: 'UNSUPPORTED_SLOPE',
  COMPUTATION_TIMEOUT: 'TIMEOUT',
  CANCELLED: 'DATA_UNAVAILABLE',
  DATASET_UNAVAILABLE: 'DATA_UNAVAILABLE',
  DATASET_INVALID: 'DATA_UNAVAILABLE',
  DATASET_INTEGRITY: 'DATA_UNAVAILABLE',
  DATASET_MISMATCH: 'DATA_UNAVAILABLE',
  UNSUPPORTED_CRS: 'DATA_UNAVAILABLE',
  UNSUPPORTED_EPOCH: 'MODEL_UNAVAILABLE',
  MODEL_FAILURE: 'MODEL_UNAVAILABLE',
}

export function mapEngineCode(code: EngineErrorCode): ServiceErrorCode {
  return CODE_MAP[code] ?? 'MODEL_UNAVAILABLE'
}

/** Sentence-style detail without the trailing full stop (the UI adds its own punctuation). */
const trimStop = (s: string) => s.replace(/\.\s*$/, '')

function describeDetails(e: EngineError): string | null {
  const d = e.details as Record<string, unknown> | undefined
  if (!d) return null
  if (Array.isArray(d.problems) && d.problems.length > 0) return d.problems.slice(0, 3).map(String).join('; ')
  if (Array.isArray(d.failed) && d.failed.length > 0) {
    return d.failed
      .slice(0, 3)
      .map((f) => (typeof f === 'object' && f !== null && 'detail' in f ? String((f as { detail: unknown }).detail) : String(f)))
      .join('; ')
  }
  return null
}

export function toServiceError(e: EngineError & { failedLeg?: string }, source: ResultSource): ServiceError {
  const extra = describeDetails(e)
  const leg = e.failedLeg ? ` (leg ${e.failedLeg})` : ''
  return {
    status: 'error',
    code: mapEngineCode(e.code),
    detail: `${trimStop(e.message)}${leg}${extra ? `: ${extra}` : ''}`,
    source,
    origin: { code: e.code, ...(e.details ? { details: e.details } : {}), ...(e.failedLeg ? { failedLeg: e.failedLeg } : {}) },
  }
}

export const abortError = () => new DOMException('The request was superseded or cancelled', 'AbortError')
