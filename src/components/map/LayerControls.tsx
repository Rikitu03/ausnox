import { RefreshCw } from 'lucide-react'
import { useId } from 'react'
import { StatusAlert } from '@/components/layout/primitives'
import { SourceBadge } from '@/components/provenance/Provenance'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/controls'
import type { LegendStop, MapLayer } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useUiStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'

export function Swatch({ stop }: { stop: LegendStop }) {
  return (
    <span
      className={cn('inline-block size-3 shrink-0 rounded-[3px] border border-line-strong', stop.pattern === 'hatch' && 'hatch')}
      style={{ backgroundColor: stop.color }}
      aria-hidden
    />
  )
}

export function LayerLegend({ layer }: { layer: MapLayer }) {
  if (!layer.legend) return null
  return (
    <div className="mt-3">
      <p className="text-xs text-fg-3">
        {layer.legend.title}
        {layer.legend.unit ? `, ${layer.legend.unit}` : ''}
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
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
  if (entry?.state === 'loading') return <p className="mt-2 text-xs text-fg-3">Loading imagery</p>
  if (entry?.state !== 'error') return null
  return (
    <div className="mt-2">
      <p className="text-xs text-bad" role="alert">
        Couldn't load: {entry.error.detail}
      </p>
      <Button size="sm" variant="ghost" className="mt-2 -ml-2.5" onClick={() => void load(layerId, true)}>
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
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-3 text-[13px] font-medium text-fg-2">Basemap</legend>
        <ul className="space-y-2">
          {layers
            .filter((l) => l.role === 'basemap')
            .map((l) => {
              const unavailable = l.availability === 'unavailable'
              return (
                <li key={l.id} className={cn('rounded-ctl border border-transparent px-3 py-3', basemapId === l.id && 'border-line-strong bg-raised')}>
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      id={`${group}-${l.id}`}
                      name={group}
                      className="mt-1 accent-(--color-fg)"
                      checked={basemapId === l.id}
                      disabled={unavailable}
                      onChange={() => setBasemap(l.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                        <label htmlFor={`${group}-${l.id}`} className={cn('text-[13px]', unavailable ? 'text-fg-3' : 'cursor-pointer text-fg')}>
                          {l.title}
                        </label>
                        <SourceBadge id={l.provenanceId} kind={l.illustrative ? 'illustrative' : undefined} />
                      </div>
                      {l.mission && <p className="mt-1 text-xs text-fg-3">{l.mission}</p>}
                      {unavailable && <p className="mt-2 text-xs text-fg-3">Unavailable. {l.availabilityNote}</p>}
                      {basemapId === l.id && <ImageryError layerId={l.id} />}
                    </div>
                  </div>
                </li>
              )
            })}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-[13px] font-medium text-fg-2">Terrain overlays</legend>
        <ul className="space-y-2">
          {layers
            .filter((l) => l.role === 'overlay')
            .map((l) => (
              <li key={l.id} className="px-3 py-2">
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor={`${group}-${l.id}`} className="cursor-pointer text-[13px]">
                    {l.title}
                    <span className="mt-1 block text-xs text-fg-3">{l.mission}</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <SourceBadge id={l.provenanceId} kind={l.illustrative ? 'illustrative' : undefined} />
                    <Switch id={`${group}-${l.id}`} label={l.title} checked={!!overlays[l.id]} onChange={(on) => toggleOverlay(l.id, on)} />
                  </div>
                </div>
                {overlays[l.id] && (
                  <>
                    <LayerLegend layer={l} />
                    <ImageryError layerId={l.id} />
                  </>
                )}
              </li>
            ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-[13px] font-medium text-fg-2">Map features</legend>
        <ul className="space-y-2">
          {(
            [
              ['coverage', 'Terrain coverage boundary'],
              ['waypoints', 'Science waypoints'],
              ['grid', '500 m grid'],
            ] as const
          ).map(([key, label]) => (
            <li key={key} className="flex items-center justify-between gap-4 px-3 py-2">
              <label htmlFor={`${group}-${key}`} className="cursor-pointer text-[13px]">
                {label}
              </label>
              <Switch id={`${group}-${key}`} label={label} checked={features[key]} onChange={() => toggleFeature(key)} />
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  )
}
