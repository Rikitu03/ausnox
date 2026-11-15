/**
 * Source register for real mode. Terrain, science-target and model records come from the engine
 * (built from the verified manifest); the Mars Trek imagery records are marked `integrated` only
 * after a tile request from this browser succeeded. IDs keep the frontend's names so every
 * provenance badge in the UI resolves in both data modes:
 *
 *   engine terrain-elevation -> usgs-hirise-dtm     engine route-astar          -> route-geometry
 *   engine terrain-slope     -> dem-slope           engine solar-mars24         -> mars24-solar
 *   engine science-target-locations -> science-waypoints   engine mission-assumptions -> eva-assumptions
 */
import { ENGINE_PROVENANCE_RECORDS, type ProvenanceRecord as EngineRecord } from '@ausnox/scientific-engine'
import type { ProvenanceRecord } from '@/services/contracts'
import { REGISTRATION_CAVEAT } from './config'
import type { RealContext } from './context'

const ID_ALIAS: Record<string, string> = {
  'terrain-elevation': 'usgs-hirise-dtm',
  'terrain-slope': 'dem-slope',
  'science-target-locations': 'science-waypoints',
  'route-astar': 'route-geometry',
  'solar-mars24': 'mars24-solar',
  'mission-assumptions': 'eva-assumptions',
}

function fromEngine(r: EngineRecord, extraLimitations: string[] = []): ProvenanceRecord {
  return {
    id: ID_ALIAS[r.id] ?? r.id,
    title: r.title,
    kind: r.category,
    mission: r.mission,
    instrument: r.instrument,
    provider: r.provider,
    measures: r.method ? `${r.measures} Method: ${r.method}` : r.measures,
    coverage: r.coverage ?? 'This mission only',
    resolution: r.resolution,
    limitations: [...r.limitations, ...extraLimitations],
    sourceUrl: r.sources[0]?.url ?? null,
    attribution: r.attribution,
    integration: 'integrated',
  }
}

export type TrekStatus = 'ok' | 'failed' | 'untested'

function trekRecords(status: (id: string) => TrekStatus): ProvenanceRecord[] {
  const integration = (id: string): ProvenanceRecord['integration'] => (status(id) === 'ok' ? 'integrated' : 'planned')
  const reach = (id: string) =>
    status(id) === 'ok' ? [] : [status(id) === 'failed' ? 'Mars Trek did not serve a test tile in this session, so the layer is not shown' : 'Not requested yet in this session']
  return [
    {
      id: 'hirise-ortho',
      title: 'HiRISE Jezero orthomosaic, 25 cm (Mars Trek)',
      kind: 'observed',
      mission: 'Mars Reconnaissance Orbiter',
      instrument: 'HiRISE',
      provider: 'NASA/JPL Mars Trek WMTS (USGS Mars 2020 TRN mosaic)',
      measures: 'Visible-light surface imagery, the map background for route review',
      coverage: '77.22–77.58° E, 18.31–18.67° N, includes the whole terrain grid',
      resolution: '25 cm per pixel source; tiles to level 17 (about 0.3 m per pixel on Mars)',
      limitations: [
        REGISTRATION_CAVEAT,
        'Tile grid checked against the USGS orthomosaic: 0.47 m east, 0.71 m south (check X2a passed)',
        'Imagery alone gives no numeric slope; slope and routes come from the DTM',
        ...reach('hirise-ortho'),
      ],
      sourceUrl: 'https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd/1.0.0/WMTSCapabilities.xml',
      attribution: 'NASA/JPL-Caltech/University of Arizona/USGS · via NASA Mars Trek',
      integration: integration('hirise-ortho'),
    },
    {
      id: 'ctx-mosaic',
      title: 'CTX Jezero mosaic, 6 m (Mars Trek)',
      kind: 'observed',
      mission: 'Mars Reconnaissance Orbiter',
      instrument: 'Context Camera (CTX)',
      provider: 'NASA/JPL Mars Trek WMTS (USGS Mars 2020 TRN mosaic)',
      measures: 'Visible-light context imagery around the delta front',
      coverage: '77.16–77.70° E, 18.21–18.72° N',
      resolution: '6 m per pixel; tiles to level 13',
      limitations: [
        'Regional context. Too coarse to show metre-scale hazards',
        'Registration against the DTM was not measured for this layer',
        ...reach('ctx-mosaic'),
      ],
      sourceUrl: 'https://trek.nasa.gov/tiles/Mars/EQ/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0/1.0.0/WMTSCapabilities.xml',
      attribution: 'NASA/JPL-Caltech/MSSS/USGS · via NASA Mars Trek',
      integration: integration('ctx-mosaic'),
    },
    {
      id: 'mola-shade',
      title: 'MOLA colour hillshade, 463 m (Mars Trek)',
      kind: 'observed',
      mission: 'Mars Global Surveyor',
      instrument: 'Mars Orbiter Laser Altimeter (MOLA)',
      provider: 'NASA/JPL Mars Trek WMTS',
      measures: 'Global topography from laser altimetry, shown as coloured relief for regional context',
      coverage: 'Global',
      resolution: '463 m per pixel; tiles to level 7',
      limitations: [
        'Far too coarse for walking-scale hazards. Zoom out to see Jezero crater and the delta in context',
        'Not used for routing or slope; heights are never mixed with the HiRISE DTM',
        ...reach('mola-shade'),
      ],
      sourceUrl: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/WMTSCapabilities.xml',
      attribution: 'NASA/JPL/GSFC · MOLA Science Team · via NASA Mars Trek',
      integration: integration('mola-shade'),
    },
  ]
}

const PLANNED: ProvenanceRecord[] = [
  {
    id: 'themis-ir',
    title: 'THEMIS thermal infrared mosaics',
    kind: 'historical',
    mission: 'Mars Odyssey',
    instrument: 'THEMIS',
    provider: 'Arizona State University',
    measures: 'Historic day and night thermal-infrared brightness',
    coverage: 'Near-global mosaics',
    resolution: '100 m per pixel class',
    limitations: ['Later-phase context layer. Not ingested and not shown'],
    sourceUrl: 'https://mars.asu.edu/data/',
    attribution: 'NASA/JPL-Caltech/Arizona State University',
    integration: 'planned',
  },
  {
    id: 'meda',
    title: 'Perseverance MEDA weather records',
    kind: 'historical',
    mission: 'Mars 2020 Perseverance',
    instrument: 'MEDA',
    provider: 'NASA PDS Atmospheres Node',
    measures: 'Pressure, temperature, wind and irradiance at the rover, at recorded times',
    coverage: 'The rover location only',
    resolution: null,
    limitations: ['Later-phase context. Not ingested and not shown', 'Not a forecast and not a radiation dosimeter'],
    sourceUrl: 'https://pdsatmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html',
    attribution: 'NASA/JPL-Caltech/CAB (CSIC-INTA)',
    integration: 'planned',
  },
]

export function realProvenance(ctx: RealContext, trekStatus: (id: string) => TrekStatus): ProvenanceRecord[] {
  const terrain = ctx.dataset
    ? ctx.dataset.provenance.map((r) =>
        fromEngine(
          r,
          r.id === 'terrain-elevation' || r.id === 'terrain-slope'
            ? ['Drawn over imagery, this layer may look shifted by up to about 3 m (check X2b, unresolved). Values themselves are unaffected']
            : r.id === 'science-target-locations'
              ? ['Skinner Ridge: the rover cell is steeper (20.8°) than the default 15° limit; the planner offers the nearest traversable cell and waits for confirmation']
              : [],
        ),
      )
    : []
  return [...terrain, ...ENGINE_PROVENANCE_RECORDS.map((r) => fromEngine(r)), ...trekRecords(trekStatus), ...PLANNED]
}
