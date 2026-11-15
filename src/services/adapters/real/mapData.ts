/**
 * Real MapDataService.
 *   Basemaps   NASA Mars Trek WMTS (MRO HiRISE 25 cm, MRO CTX 6 m, MGS MOLA 463 m), each offered only
 *              after one test tile loads from this browser; plus a shaded relief rendered locally from the
 *              HiRISE DTM, which needs no network and is the fallback when Mars Trek is unreachable.
 *   Overlays   elevation and slope drawn cell by cell from the verified grid.
 *   Waypoints  the two cited Perseverance rover positions (science-targets.geojson), validated by the engine.
 */
import { loadScienceTargets, type TerrainDataset } from '@ausnox/scientific-engine'
import type { LayerImagery, MapDataService, MapLayer, Result, ScienceWaypoint } from '@/services/contracts'
import { PROBE_TIMEOUT_MS, REGISTRATION_CAVEAT, TREK_LAYERS, probeUrl, type TrekLayerConfig } from './config'
import { assetUrl, engineSource, type RealContext } from './context'
import { geoToGrid } from './coords'
import { toServiceError } from './errors'
import { realProvenance, type TrekStatus } from './provenance'
import { ELEVATION_RAMP, SLOPE_CLASSES, renderElevation, renderHillshade, renderSlope } from './render'
import { ensureDataset } from './terrain'

const source = engineSource('map', 'NASA Mars Trek imagery and layers drawn from the verified HiRISE DTM grid')
const css = (c: readonly number[]) => `rgb(${c[0]} ${c[1]} ${c[2]})`

const unavailable = (detail: string) =>
  ({ status: 'error', code: 'DATA_UNAVAILABLE', detail, source }) as const

function layersFor(d: TerrainDataset | null, trek: (id: string) => TrekStatus): MapLayer[] {
  const trekLayer = (
    c: TrekLayerConfig,
    title: string,
    mission: string,
    defaultVisible: boolean,
    caveat: string,
  ): MapLayer => ({
    id: c.id,
    title,
    role: 'basemap',
    mission,
    provenanceId: c.id,
    availability: trek(c.id) === 'failed' ? 'unavailable' : 'available',
    availabilityNote: trek(c.id) === 'failed' ? 'NASA Mars Trek did not serve a test tile. Try again later or use the DTM relief' : null,
    illustrative: false,
    defaultVisible,
    legend: null,
    caveat,
  })
  let min = NaN
  let max = NaN
  if (d) {
    min = Infinity
    max = -Infinity
    for (let i = 0; i < d.elevationM.length; i++) {
      const e = d.elevationM[i]!
      if (Number.isFinite(e)) {
        if (e < min) min = e
        if (e > max) max = e
      }
    }
  }
  const metres = (v: number) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString('en-US')} m` : '—')
  return [
    trekLayer(TREK_LAYERS['hirise-ortho'], 'HiRISE orthomosaic, 25 cm', 'MRO · HiRISE', true, REGISTRATION_CAVEAT),
    {
      id: 'dtm-hillshade',
      title: 'Shaded relief from the HiRISE DTM',
      role: 'basemap',
      mission: 'MRO · HiRISE DTM (USGS), rendered by Ausnox',
      provenanceId: 'usgs-hirise-dtm',
      availability: d ? 'available' : 'unavailable',
      availabilityNote: d ? null : 'Needs the terrain grid, which is not loaded',
      illustrative: false,
      defaultVisible: false,
      legend: {
        title: 'Relief lit from the north-west at 45°, a visual aid computed from elevation. Not an image of Mars',
        unit: null,
        stops: [
          { label: 'Facing the light', color: 'rgb(236 220 199)', pattern: 'solid' },
          { label: 'Facing away', color: 'rgb(48 44 40)', pattern: 'solid' },
        ],
      },
      caveat: null,
    },
    trekLayer(
      TREK_LAYERS['ctx-mosaic'],
      'CTX mosaic, 6 m',
      'MRO · CTX',
      false,
      'Regional context imagery. Registration against the DTM was not measured for this layer',
    ),
    trekLayer(
      TREK_LAYERS['mola-shade'],
      'MOLA colour hillshade, 463 m',
      'MGS · MOLA',
      false,
      'Regional context only: one pixel is about 460 m. Zoom out to see the crater',
    ),
    {
      id: 'elevation',
      title: 'Elevation',
      role: 'overlay',
      mission: 'MRO · HiRISE DTM (USGS)',
      provenanceId: 'usgs-hirise-dtm',
      availability: d ? 'available' : 'unavailable',
      availabilityNote: d ? null : 'Needs the terrain grid, which is not loaded',
      illustrative: false,
      defaultVisible: false,
      legend: {
        title: 'Elevation above the Mars areoid',
        unit: 'm',
        stops: ELEVATION_RAMP.map((c, i) => ({
          label: i === 0 ? metres(min) : i === ELEVATION_RAMP.length - 1 ? metres(max) : i === 1 ? 'Lower' : 'Higher',
          color: css(c),
          pattern: 'solid' as const,
        })),
      },
      caveat: 'Over imagery the grid may look shifted by up to about 3 m (check X2b, unresolved)',
    },
    {
      id: 'slope',
      title: 'Slope',
      role: 'overlay',
      mission: 'Derived from the HiRISE DTM (Horn 1981)',
      provenanceId: 'dem-slope',
      availability: d ? 'available' : 'unavailable',
      availabilityNote: d ? null : 'Needs the terrain grid, which is not loaded',
      illustrative: false,
      defaultVisible: true,
      legend: {
        title: 'Slope from the 2 m DTM (about 4 m baseline)',
        unit: null,
        stops: [
          ...SLOPE_CLASSES.slice(1).map((c) => ({
            label: c.label,
            color: `rgb(${c.rgba[0]} ${c.rgba[1]} ${c.rgba[2]} / ${Math.min(1, c.rgba[3] / 170)})`,
            pattern: c.pattern,
          })),
          { label: 'Slope unknown', color: 'rgb(150 150 150 / 0.7)', pattern: 'hatch' as const },
        ],
      },
      caveat: 'Over imagery the grid may look shifted by up to about 3 m (check X2b, unresolved)',
    },
  ]
}

export function createRealMapData(ctx: RealContext): MapDataService {
  const trekState = new Map<string, TrekStatus>()
  const images = new Map<string, Promise<string | null>>()
  const status = (id: string): TrekStatus => trekState.get(id) ?? 'untested'

  async function probe(c: TrekLayerConfig): Promise<TrekStatus> {
    if (!ctx.options.probeImagery) {
      trekState.set(c.id, 'ok')
      return 'ok'
    }
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS)
    try {
      const res = await ctx.options.fetch(probeUrl(c), { signal: ac.signal, mode: 'cors', cache: 'force-cache' })
      const type = res.headers.get('content-type') ?? ''
      const ok = res.ok && type.startsWith('image/')
      trekState.set(c.id, ok ? 'ok' : 'failed')
      return ok ? 'ok' : 'failed'
    } catch {
      trekState.set(c.id, 'failed')
      return 'failed'
    } finally {
      clearTimeout(timer)
    }
  }

  const raster = (key: string, draw: () => Promise<string | null>) => {
    let p = images.get(key)
    if (!p) {
      p = draw()
      images.set(key, p)
      // A failed drawing may succeed later (for example after terrain loads): do not cache it.
      void p.then((url) => url === null && images.delete(key))
    }
    return p
  }

  return {
    async listLayers() {
      const [loaded] = await Promise.all([ensureDataset(ctx), ...Object.values(TREK_LAYERS).map(probe)])
      return { status: 'ok', source, layers: layersFor('status' in loaded ? null : loaded, status) }
    },

    async getLayerImagery(layerId): Promise<Result<{ imagery: LayerImagery }>> {
      const trek = TREK_LAYERS[layerId as TrekLayerConfig['id']]
      if (trek) {
        // Retries re-probe, so "Try again" reflects the current state of the service.
        if ((await probe(trek)) !== 'ok') {
          return unavailable(`NASA Mars Trek did not serve the ${trek.id === 'hirise-ortho' ? 'HiRISE' : trek.id === 'ctx-mosaic' ? 'CTX' : 'MOLA'} test tile`)
        }
        return {
          status: 'ok',
          source,
          imagery: { type: 'tiles', urlTemplate: trek.urlTemplate, attribution: trek.attribution, bounds: trek.bounds, maxNativeZoom: trek.maxNativeZoom },
        }
      }
      const loaded = await ensureDataset(ctx)
      if ('status' in loaded) return toServiceError(loaded, source)
      const d = loaded
      let url: string | null
      if (layerId === 'dtm-hillshade') url = await raster(layerId, () => renderHillshade(d))
      else if (layerId === 'slope') url = await raster(layerId, () => renderSlope(d))
      else if (layerId === 'elevation') {
        let min = Infinity
        let max = -Infinity
        for (let i = 0; i < d.elevationM.length; i++) {
          const e = d.elevationM[i]!
          if (Number.isFinite(e)) {
            if (e < min) min = e
            if (e > max) max = e
          }
        }
        url = await raster(layerId, () => renderElevation(d, [min, max]))
      } else return { status: 'error', code: 'INVALID_INPUT', detail: `Unknown layer "${layerId}"`, source }
      if (!url) return unavailable('This browser could not draw the layer image')
      const g = d.geometry
      return {
        status: 'ok',
        source,
        imagery: { type: 'image', url, boundsM: { min: { x: 0, y: 0 }, max: { x: g.width * g.cellSizeXM, y: g.height * g.cellSizeYM } } },
      }
    },

    async listWaypoints(): Promise<Result<{ waypoints: ScienceWaypoint[] }>> {
      const loaded = await ensureDataset(ctx)
      if ('status' in loaded) return toServiceError(loaded, source)
      const d = loaded
      const file = d.manifest.files?.science_targets ?? 'science-targets.geojson'
      const r = await loadScienceTargets({
        url: assetUrl(ctx, file),
        dataset: d,
        fetch: (url, init) => ctx.options.fetch(url, init as RequestInit),
      })
      if (r.status === 'error') return toServiceError(r, source)
      ctx.targets = r.targets
      return {
        status: 'ok',
        source,
        waypoints: r.targets.map((t) => ({
          id: t.id,
          title: t.title,
          position: geoToGrid(d, t.coordinate),
          description: t.description,
          // 'cited-approximate': a NASA-documented location given by the rover position, not the exact feature.
          labelQuality: t.labelQuality.startsWith('cited') ? 'cited' : 'illustrative',
          sourceUrl: t.sources[0]?.url ?? null,
          suggestedDurationMin: t.suggestedActivityMin,
          provenanceId: 'science-waypoints',
          geo: { ...t.coordinate },
          sources: t.sources.map((s) => ({ ...s })),
          caveats: [...t.caveats, 'Suggested activity time is a simulated planning value, not a NASA activity duration'],
          observation: { sol: t.observationSol, utcDate: t.observationUtcDate },
        })),
      }
    },

    listProvenance: () => realProvenance(ctx, status),
  }
}
