import { Layers, Mountain, RefreshCw } from 'lucide-react'
import { useId } from 'react'
import { Details, StatusAlert } from '@/components/layout/primitives'
import { SourceBadge } from '@/components/provenance/Provenance'
import { Button } from '@/components/ui/button'
import { Select, Switch } from '@/components/ui/controls'
import type { LegendStop, MapLayer } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useUiStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'

export function Swatch({ stop }: { stop: LegendStop }) {
  return (
    <span
      className={cn(
        'inline-block size-3 shrink-0 rounded-[3px] border border-line-strong',
        stop.pattern === 'hatch' && 'hatch',
      )}
      style={{ backgroundColor: stop.color }}
      aria-hidden
    />
  )
}

export function LayerLegend({ layer }: { layer: MapLayer }) {
  if (!layer.legend) return null
  return (
    <div className="mt-2">
      <p className="text-xs text-fg-3">
        {layer.legend.title}
        {layer.legend.unit ? `, ${layer.legend.unit}` : ''}
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {layer.legend.stops.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-xs text-fg-2">
            <Swatch stop={s} />
            {s.label}
            {s.pattern === 'hatch' && <span className="sr-only"> (hatched)</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ImageryError({ layerId }: { layerId: string }) {
  const entry = useDataStore((s) => s.imagery[layerId])
  const load = useDataStore((s) => s.loadImagery)
  if (entry?.state === 'loading') return <p className="mt-1 text-xs text-fg-3">Loading imagery</p>
  if (entry?.state !== 'error') return null
  return (
    <div className="mt-2">
      <p className="text-xs text-bad" role="alert">
        Could not load: {entry.error.detail}
      </p>
      <Button size="sm" variant="ghost" className="mt-1 -ml-2.5" onClick={() => void load(layerId, true)}>
        <RefreshCw />
        Try again
      </Button>
    </div>
  )
}

/** Basemap choice, overlay switches and map features. Shared by the Terrain panel and the map layer menu. */
export function LayerControls() {
  const layers = useDataStore((s) => s.layers)
  const layersError = useDataStore((s) => s.layersError)
  const basemapId = useUiStore((s) => s.basemapId)
  const setBasemap = useUiStore((s) => s.setBasemap)
  const overlays = useUiStore((s) => s.overlays)
  const toggleOverlay = useUiStore((s) => s.toggleOverlay)
  const features = useUiStore((s) => s.features)
  const toggleFeature = useUiStore((s) => s.toggleFeature)
  const group = useId()

  if (layersError) {
    return (
      <StatusAlert tone="bad" title="Map layers unavailable">
        {layersError.detail}
      </StatusAlert>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor={`${group}-base`} className="mb-2 flex items-center gap-2 text-[13px] font-medium">
          <Layers className="size-4 text-fg-2" aria-hidden />
          Base surface
        </label>
        <Select id={`${group}-base`} value={basemapId} onChange={(e) => setBasemap(e.target.value)}>
          {layers
            .filter((l) => l.role === 'basemap')
            .map((l) => (
              <option key={l.id} value={l.id} disabled={l.availability === 'unavailable'}>
                {l.title}
                {l.availability === 'unavailable' ? ' · unavailable' : ''}
              </option>
            ))}
        </Select>
        <Details title="Imagery sources & availability">
          {layers
            .filter((l) => l.role === 'basemap')
            .map((l) => (
              <div key={l.id} className="space-y-1 border-b border-line pb-3 last:border-0">
                <p className="font-medium text-fg">{l.title}</p>
                <SourceBadge id={l.provenanceId} kind={l.illustrative ? 'illustrative' : undefined} />
                {l.mission && <p>{l.mission}</p>}
                {l.availability === 'unavailable' && <p>Unavailable. {l.availabilityNote}</p>}
                {basemapId === l.id && (
                  <>
                    <LayerLegend layer={l} />
                    <ImageryError layerId={l.id} />
                  </>
                )}
              </div>
            ))}
        </Details>
      </div>
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium">Terrain overlays</legend>
        <ul className="space-y-1">
          {layers
            .filter((l) => l.role === 'overlay')
            .map((l) => (
              <li key={l.id} className="px-2.5 py-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor={`${group}-${l.id}`} className="cursor-pointer text-[13px]">
                    <span className="flex items-center gap-2">
                      <Mountain className="size-4 text-fg-2" aria-hidden />
                      {l.title}
                    </span>
                  </label>
                  <div className="flex items-center gap-2.5">
                    <SourceBadge id={l.provenanceId} kind={l.illustrative ? 'illustrative' : undefined} />
                    <Switch
                      id={`${group}-${l.id}`}
                      label={l.title}
                      checked={!!overlays[l.id]}
                      onChange={(on) => toggleOverlay(l.id, on)}
                    />
                  </div>
                </div>
                {overlays[l.id] && (
                  <>
                    <Details title={`${l.title} legend & source`}>
                      <p>{l.mission}</p>
                      <LayerLegend layer={l} />
                      <ImageryError layerId={l.id} />
                    </Details>
                  </>
                )}
              </li>
            ))}
        </ul>
      </fieldset>

      <Details title="Map features">
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-fg-2">Map features</legend>
          <ul className="space-y-1">
            {(
              [
                ['coverage', 'Terrain coverage boundary'],
                ['waypoints', 'Science waypoints'],
                ['grid', '500 m grid'],
              ] as const
            ).map(([key, label]) => (
              <li key={key} className="flex items-center justify-between gap-3 px-2.5 py-2">
                <label htmlFor={`${group}-${key}`} className="cursor-pointer text-[13px]">
                  {label}
                </label>
                <Switch
                  id={`${group}-${key}`}
                  label={label}
                  checked={features[key]}
                  onChange={() => toggleFeature(key)}
                />
              </li>
            ))}
          </ul>
        </fieldset>
      </Details>
    </div>
  )
}
