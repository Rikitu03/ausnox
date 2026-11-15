/**
 * Network loaders for the static terrain assets (browser or Node >= 20).
 * Every failure is returned as a structured EngineError; nothing falls back to synthetic data.
 */
import { engineError, type EngineError } from '../contracts/errors.js'
import { createTerrainDataset, type TerrainDatasetResult } from './dataset.js'

export interface FetchResponseLike {
  readonly ok: boolean
  readonly status: number
  readonly statusText?: string
  json(): Promise<unknown>
  arrayBuffer(): Promise<ArrayBuffer>
}
export type FetchLike = (url: string, init?: { signal?: unknown }) => Promise<FetchResponseLike>

export interface AbortSignalLike {
  readonly aborted: boolean
}

export interface LoadTerrainOptions {
  /** URL of manifest.json, e.g. "/data/jezero/manifest.json". terrain.bin is resolved next to it. */
  readonly manifestUrl: string
  readonly fetch?: FetchLike
  /** Verify terrain.bin SHA-256 with Web Crypto (default true). */
  readonly verifyChecksum?: boolean
  readonly signal?: AbortSignalLike
}

export type TerrainLoadResult = TerrainDatasetResult | EngineError<'DATASET_UNAVAILABLE' | 'CANCELLED'>

interface SubtleLike {
  digest(algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer>
}

function defaultFetch(): FetchLike | null {
  const f = (globalThis as { fetch?: unknown }).fetch
  return typeof f === 'function' ? (f.bind(globalThis) as FetchLike) : null
}

export function resolveSibling(manifestUrl: string, fileName: string): string {
  const q = manifestUrl.search(/[?#]/)
  const base = q >= 0 ? manifestUrl.slice(0, q) : manifestUrl
  return base.replace(/[^/]*$/, '') + fileName
}

/** SHA-256 of `buffer` as lowercase hex, or null when Web Crypto is unavailable. */
export async function sha256Hex(buffer: ArrayBuffer): Promise<string | null> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleLike } }).crypto?.subtle
  if (!subtle || typeof subtle.digest !== 'function') return null
  const digest = new Uint8Array(await subtle.digest('SHA-256', buffer))
  let hex = ''
  for (let i = 0; i < digest.length; i++) hex += digest[i]!.toString(16).padStart(2, '0')
  return hex
}

export async function verifyTerrainChecksum(
  buffer: ArrayBuffer,
  expectedSha256: string,
): Promise<'verified' | 'mismatch' | 'not-checked'> {
  const hex = await sha256Hex(buffer)
  if (hex === null) return 'not-checked'
  return hex === expectedSha256 ? 'verified' : 'mismatch'
}

/** Fetch manifest + terrain.bin, verify integrity and build a dataset. */
export async function loadTerrainDataset(options: LoadTerrainOptions): Promise<TerrainLoadResult> {
  const fetchFn = options.fetch ?? defaultFetch()
  if (!fetchFn) return engineError('DATASET_UNAVAILABLE', 'No fetch implementation is available to load terrain assets.')
  const cancelled = () => engineError('CANCELLED', 'Terrain loading was cancelled.')
  let manifest: unknown
  try {
    const res = await fetchFn(options.manifestUrl, { signal: options.signal })
    if (!res.ok) {
      return engineError('DATASET_UNAVAILABLE', `Terrain manifest request failed (HTTP ${res.status}).`, { url: options.manifestUrl })
    }
    manifest = await res.json()
  } catch (e) {
    if (options.signal?.aborted) return cancelled()
    return engineError('DATASET_UNAVAILABLE', 'Terrain manifest could not be loaded or parsed.', {
      url: options.manifestUrl,
      reason: e instanceof Error ? e.message : String(e),
    })
  }
  if (options.signal?.aborted) return cancelled()
  const file = (manifest as { binary?: { file?: unknown } } | null)?.binary?.file
  if (typeof file !== 'string' || !/^[A-Za-z0-9._-]+$/.test(file)) {
    return engineError('DATASET_INVALID', 'The terrain manifest does not name a valid binary file.')
  }
  const binUrl = resolveSibling(options.manifestUrl, file)
  let buffer: ArrayBuffer
  try {
    const res = await fetchFn(binUrl, { signal: options.signal })
    if (!res.ok) return engineError('DATASET_UNAVAILABLE', `Terrain grid request failed (HTTP ${res.status}).`, { url: binUrl })
    buffer = await res.arrayBuffer()
  } catch (e) {
    if (options.signal?.aborted) return cancelled()
    return engineError('DATASET_UNAVAILABLE', 'Terrain grid could not be downloaded.', {
      url: binUrl,
      reason: e instanceof Error ? e.message : String(e),
    })
  }
  if (options.signal?.aborted) return cancelled()
  let checksum: 'verified' | 'not-checked' = 'not-checked'
  if (options.verifyChecksum !== false) {
    const expected = (manifest as { binary?: { sha256?: unknown } }).binary?.sha256
    if (typeof expected !== 'string') return engineError('DATASET_INVALID', 'The terrain manifest has no SHA-256 checksum.')
    const status = await verifyTerrainChecksum(buffer, expected)
    if (status === 'mismatch') {
      return engineError('DATASET_INTEGRITY', 'terrain.bin does not match the manifest checksum (corrupted or stale file).', { url: binUrl })
    }
    checksum = status
  }
  return createTerrainDataset(manifest, buffer, { checksum })
}
