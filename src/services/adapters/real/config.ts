/**
 * Static configuration of the real adapters. Every value here is taken from committed evidence:
 *   public/data/jezero/manifest.json                     terrain asset and its validation record
 *   scientific-pipeline/evidence/marstrek_layers.json   Mars Trek WMTS layers (capabilities parsed, tiles tested)
 *   docs/SCIENTIFIC_VALIDATION_REPORT.md                 scenario dates and the unresolved X2b finding
 */

/** Directory of the bundled Jezero assets, relative to the app's base URL (works with Vite `base: './'`). */
export const JEZERO_DATA_DIR = 'data/jezero/'
export const MANIFEST_FILE = 'manifest.json'

/** Mars Trek WMTS endpoint. Public, no account or key, `Access-Control-Allow-Origin: *` observed. */
const TREK = 'https://trek.nasa.gov/tiles/Mars/EQ'
const tileUrl = (layer: string, ext: 'png' | 'jpg') => `${TREK}/${layer}/1.0.0/default/default028mm/{z}/{y}/{x}.${ext}`

export interface TrekLayerConfig {
  id: 'hirise-ortho' | 'ctx-mosaic' | 'mola-shade'
  layer: string
  urlTemplate: string
  maxNativeZoom: number
  bounds: { west: number; south: number; east: number; north: number }
  /** One tile inside the layer and inside the AOI, fetched before the layer is offered. */
  probe: { z: number; y: number; x: number }
  attribution: string
}

/**
 * The tile grid is equirectangular in degrees with 2 × 1 tiles at level 0 (TileMatrixSet default028mm),
 * the layout of Leaflet's EPSG:4326 CRS. Tile indices of the probes were derived from the AOI centre
 * (77.4065° E, 18.4560° N) and the HiRISE one equals the tile tested in marstrek_layers.json.
 */
export const TREK_LAYERS: Record<TrekLayerConfig['id'], TrekLayerConfig> = {
  'hirise-ortho': {
    id: 'hirise-ortho',
    layer: 'JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd',
    urlTemplate: tileUrl('JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd', 'png'),
    maxNativeZoom: 17,
    bounds: { west: 77.2229331, south: 18.3067994, east: 77.583964, north: 18.669315 },
    probe: { z: 15, y: 13024, x: 46859 },
    attribution: 'NASA/JPL-Caltech/University of Arizona/USGS · HiRISE Jezero mosaic via NASA Mars Trek',
  },
  'ctx-mosaic': {
    id: 'ctx-mosaic',
    layer: 'JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0',
    urlTemplate: tileUrl('JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0', 'png'),
    maxNativeZoom: 13,
    bounds: { west: 77.1604655, south: 18.2110274, east: 77.6991776, north: 18.7211945 },
    probe: { z: 13, y: 3256, x: 11714 },
    attribution: 'NASA/JPL-Caltech/MSSS/USGS · CTX Jezero mosaic via NASA Mars Trek',
  },
  'mola-shade': {
    id: 'mola-shade',
    layer: 'Mars_MGS_MOLA_ClrShade_merge_global_463m',
    urlTemplate: tileUrl('Mars_MGS_MOLA_ClrShade_merge_global_463m', 'jpg'),
    maxNativeZoom: 7,
    bounds: { west: -180, south: -89.9991635, east: 179.9983271, north: 90 },
    probe: { z: 7, y: 50, x: 183 },
    attribution: 'NASA/JPL/GSFC · MOLA Science Team · via NASA Mars Trek',
  },
}

export const probeUrl = (c: TrekLayerConfig) =>
  c.urlTemplate.replace('{z}', String(c.probe.z)).replace('{y}', String(c.probe.y)).replace('{x}', String(c.probe.x))

/** Recommended display label for the unresolved DTM-to-imagery check (SCIENTIFIC_VALIDATION_REPORT.md §3.4, §10). */
export const REGISTRATION_CAVEAT =
  'Overlay registration ±3 m. Check X2b failed: the DTM and the HiRISE imagery appear offset by 2.3 to 3.2 m east, unresolved. Routes and slope come from the DTM and are aligned with it; against imagery they may look shifted by up to about 3 m. No shift is applied'

export type SolarScenarioConfig =
  | { id: string; title: string; description: string; kind: 'date'; utcMs: number }
  | { id: string; title: string; description: string; kind: 'ls'; lsDeg: number; nearUtcMs: number }

/**
 * Daylight scenarios. A scenario fixes the sol; the mission start (local true solar time) picks the instant.
 * Dates are documented Perseverance events at the two cited targets; Ls scenarios are solved with Mars24.
 */
export const SOLAR_SCENARIOS: SolarScenarioConfig[] = [
  {
    id: 'sol-690-three-forks',
    title: 'Sol 690 · 2023-01-28',
    description: 'The sol Perseverance completed the Three Forks sample depot (NASA). Mars24 sunrise and sunset at the habitat',
    kind: 'date',
    utcMs: Date.UTC(2023, 0, 28, 12),
  },
  {
    id: 'sol-490-skinner-ridge',
    title: 'Sol 490 · 2022-07-07',
    description: 'The sol of Perseverance imagery at the Skinner Ridge coring site (NASA). Mars24 sunrise and sunset at the habitat',
    kind: 'date',
    utcMs: Date.UTC(2022, 6, 7, 12),
  },
  {
    id: 'ls-90-northern-summer',
    title: 'Northern summer solstice, Ls 90°',
    description: 'First sol at Ls 90° on or after 2026-01-01, solved with Mars24. Longest daylight at Jezero',
    kind: 'ls',
    lsDeg: 90,
    nearUtcMs: Date.UTC(2026, 0, 1),
  },
  {
    id: 'ls-270-northern-winter',
    title: 'Northern winter solstice, Ls 270°',
    description: 'First sol at Ls 270° on or after 2026-01-01, solved with Mars24. Shortest daylight at Jezero',
    kind: 'ls',
    lsDeg: 270,
    nearUtcMs: Date.UTC(2026, 0, 1),
  },
]

/**
 * Sample mission: the scenario of the engine's validated integration test
 * (packages/scientific-engine/tests/integration.jezero.test.ts).
 * The habitat is hypothetical: a flat crater-floor cell (engine row 572, col 698; max slope 1.8° within 10 m).
 */
export const SAMPLE_MISSION = {
  id: 'jezero-delta-front-marswalk',
  name: 'Jezero delta-front Marswalk',
  description:
    'Hypothetical habitat on the crater floor, 20 min at the Three Forks depot area, then the Skinner Ridge sampling site. Same scenario as the engine integration test',
  habitatEngineCell: { row: 572, col: 698 },
  stopTargetId: 'three-forks-depot-area',
  stopDurationMin: 20,
  destinationTargetId: 'skinner-ridge-sampling-site',
  destinationDurationMin: 30,
  solarScenarioId: 'sol-690-three-forks',
  startLtstHours: 9,
} as const

/** Safety net so a worker that never answers cannot leave the planner in a loading state. */
export const ROUTE_WORKER_WATCHDOG_MS = 30_000
/** Imagery probe timeout. */
export const PROBE_TIMEOUT_MS = 10_000
