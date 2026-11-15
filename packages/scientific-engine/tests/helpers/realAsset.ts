/** Access to the shipped, validated Jezero asset in public/data/jezero (real HiRISE-derived data). */
import { readFileSync } from 'node:fs'
import { createTerrainDataset, sha256Hex, type FetchLike, type TerrainDataset } from '../../src/index.js'

export const ASSET_URL = new URL('../../../../public/data/jezero/', import.meta.url)

export function readManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL('manifest.json', ASSET_URL), 'utf8')) as Record<string, unknown>
}

export function readBinary(): ArrayBuffer {
  const b = readFileSync(new URL('terrain.bin', ASSET_URL))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

export function readJson(name: string): unknown {
  return JSON.parse(readFileSync(new URL(name, ASSET_URL), 'utf8'))
}

let cached: TerrainDataset | null = null

/** The real dataset with its SHA-256 verified against the manifest. */
export async function loadRealDataset(): Promise<TerrainDataset> {
  if (cached) return cached
  const manifest = readManifest()
  const buffer = readBinary()
  const sha = await sha256Hex(buffer)
  const expected = (manifest.binary as { sha256: string }).sha256
  if (sha !== expected) throw new Error('terrain.bin checksum mismatch: rebuild the asset')
  const r = createTerrainDataset(manifest, buffer, { checksum: 'verified' })
  if (r.status !== 'ok') throw new Error(`real dataset rejected: ${JSON.stringify(r)}`)
  cached = r.dataset
  return cached
}

/** fetch() stand-in that serves the asset directory from disk (or fails like a server). */
export function diskFetch(overrides: Record<string, () => Promise<unknown>> = {}): FetchLike {
  return async (url) => {
    const name = url.split(/[?#]/)[0]!.split('/').pop()!
    const custom = overrides[name]
    if (custom) return (await custom()) as Awaited<ReturnType<FetchLike>>
    try {
      const b = readFileSync(new URL(name, ASSET_URL))
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(b.toString('utf8')),
        arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
      }
    } catch {
      return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) }
    }
  }
}
