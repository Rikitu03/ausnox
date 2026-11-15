/**
 * Cited science targets (science-targets.geojson written by the pipeline).
 */
import type { GeographicCoordinate, GridCell } from '../contracts/geo.js'
import { engineError, type EngineError } from '../contracts/errors.js'
import type { SourceReference } from '../contracts/provenance.js'
import { geographicToGrid } from '../coordinates/grid.js'
import type { TerrainDataset } from './dataset.js'
import type { FetchLike } from './loader.js'

export interface ScienceTarget {
  readonly id: string
  readonly title: string
  readonly coordinate: GeographicCoordinate
  readonly cell: GridCell
  readonly description: string
  readonly basis: string
  /** `cited-approximate`: a NASA-documented location given by the rover position, not the exact feature. */
  readonly labelQuality: string
  readonly observationSol: number | null
  readonly observationUtcDate: string | null
  readonly elevationDtmM: number | null
  readonly roverReportedElevationM: number | null
  /** Illustrative default for planning; a simulated assumption, not a NASA activity time. */
  readonly suggestedActivityMin: number
  readonly sources: readonly SourceReference[]
  readonly caveats: readonly string[]
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Parse and validate science-target GeoJSON against a dataset (targets must sit on valid cells). */
export function parseScienceTargets(
  geojson: unknown,
  dataset: TerrainDataset,
): { status: 'ok'; targets: ScienceTarget[] } | EngineError<'DATASET_INVALID'> {
  if (!isObj(geojson) || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    return engineError('DATASET_INVALID', 'Science targets must be a GeoJSON FeatureCollection.')
  }
  const targets: ScienceTarget[] = []
  const problems: string[] = []
  for (const f of geojson.features as unknown[]) {
    if (!isObj(f) || !isObj(f.properties) || !isObj(f.geometry) || f.geometry.type !== 'Point') {
      problems.push('feature is not a Point with properties')
      continue
    }
    const p = f.properties
    const coords = f.geometry.coordinates
    if (!Array.isArray(coords) || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') {
      problems.push(`target ${String(p.id)} has no coordinates`)
      continue
    }
    const sources = Array.isArray(p.sources)
      ? (p.sources as unknown[]).filter(
          (s): s is SourceReference => isObj(s) && typeof s.url === 'string' && /^https:\/\//.test(s.url) && typeof s.label === 'string',
        )
      : []
    if (typeof p.id !== 'string' || typeof p.title !== 'string' || sources.length === 0) {
      problems.push(`target ${String(p.id)} lacks id, title or https sources`)
      continue
    }
    const coordinate = { lonEast: coords[0], latNorth: coords[1] }
    const loc = geographicToGrid(coordinate, dataset.geometry)
    if (loc.status === 'error') {
      problems.push(`target ${p.id} is outside the terrain grid`)
      continue
    }
    if ((dataset.flags[loc.index]! & 3) !== 3) {
      problems.push(`target ${p.id} lies on a cell without elevation/slope`)
      continue
    }
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    targets.push({
      id: p.id,
      title: p.title,
      coordinate,
      cell: loc.cell,
      description: typeof p.description === 'string' ? p.description : '',
      basis: typeof p.basis === 'string' ? p.basis : '',
      labelQuality: typeof p.label_quality === 'string' ? p.label_quality : 'unknown',
      observationSol: num(p.observation_sol),
      observationUtcDate: typeof p.observation_utc_date === 'string' ? p.observation_utc_date : null,
      elevationDtmM: num(p.elevation_dtm_m),
      roverReportedElevationM: num(p.rover_reported_elev_geoid_m),
      suggestedActivityMin: num(p.suggested_activity_min) ?? 0,
      sources,
      caveats: Array.isArray(p.caveats) ? (p.caveats as unknown[]).filter((c): c is string => typeof c === 'string') : [],
    })
  }
  if (problems.length > 0) return engineError('DATASET_INVALID', 'Some science targets failed validation.', { problems })
  return { status: 'ok', targets }
}

export async function loadScienceTargets(options: {
  url: string
  dataset: TerrainDataset
  fetch?: FetchLike
}): Promise<{ status: 'ok'; targets: ScienceTarget[] } | EngineError<'DATASET_INVALID' | 'DATASET_UNAVAILABLE'>> {
  const fetchFn = options.fetch ?? ((globalThis as { fetch?: FetchLike }).fetch?.bind(globalThis) as FetchLike | undefined)
  if (!fetchFn) return engineError('DATASET_UNAVAILABLE', 'No fetch implementation is available.')
  try {
    const res = await fetchFn(options.url)
    if (!res.ok) return engineError('DATASET_UNAVAILABLE', `Science targets request failed (HTTP ${res.status}).`)
    return parseScienceTargets(await res.json(), options.dataset)
  } catch (e) {
    return engineError('DATASET_UNAVAILABLE', 'Science targets could not be loaded.', { reason: e instanceof Error ? e.message : String(e) })
  }
}
