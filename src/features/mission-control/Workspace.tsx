import { Maximize2, PanelLeft, PanelRight } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Panel } from '@/components/layout/primitives'
import {
  CoordinateBar,
  DemoMapTag,
  ImageryNotice,
  MapLegend,
  MapTools,
  PlacementBanner,
  RegistrationTag,
} from '@/components/map/MapChrome'
import { MarsMap } from '@/components/map/MarsMap'
import { TerrainView } from '@/components/map/TerrainView'
import { SimDock } from '@/components/simulation/SimControls'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/overlay'
import { PlannerPanel } from '@/features/mission-planner/PlannerPanel'
import { SimulationControlPanel, SimulationEventsPanel } from '@/features/mission-simulation/SimulationPanels'
import { LayersPanel, TerrainInspectorPanel } from '@/features/terrain-explorer/TerrainPanels'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useUiStore, type View } from '@/stores/uiStore'
import { MissionStatusPanel } from './MissionStatusPanel'

type MapView = Extract<View, 'control' | 'terrain' | 'simulation'>

const PANELS: Record<MapView, { left: { label: string; node: ReactNode }; right: { label: string; node: ReactNode } }> =
  {
    control: {
      left: { label: 'Mission planner', node: <PlannerPanel /> },
      right: { label: 'Mission status', node: <MissionStatusPanel /> },
    },
    terrain: {
      left: { label: 'Layers and science', node: <LayersPanel /> },
      right: { label: 'Terrain', node: <TerrainInspectorPanel /> },
    },
    simulation: {
      left: { label: 'Mission simulation', node: <SimulationControlPanel /> },
      right: { label: 'Mission timeline', node: <SimulationEventsPanel /> },
    },
  }

const PANEL_W = 348
const GUTTER = 12

/** The map with its two side panels, tools, legend and the simulation dock. */
export function Workspace({ view }: { view: MapView }) {
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const desktop = useIsDesktop()
  const sheet = useUiStore((s) => s.sheet)
  const mapMode = useUiStore((s) => s.mapMode)
  const setSheet = useUiStore((s) => s.setSheet)
  const { left, right } = PANELS[view]
  const inset = desktop && leftOpen ? PANEL_W + GUTTER * 2 : GUTTER
  const rightInset = desktop && rightOpen ? PANEL_W + GUTTER * 2 : GUTTER

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUiStore.getState()
      if (e.key === 'Escape' && (ui.placement || ui.placementIssue) && !ui.coordinateEntry) ui.cancelPlacement()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="workspace relative h-full overflow-hidden">
      <h1 className="sr-only">{left.label}</h1>
      <div className={mapMode === '3d' ? 'hidden' : 'absolute inset-0'} aria-hidden={mapMode === '3d'}>
        <MarsMap
          showWalker
          padding={{ left: inset + (desktop ? 56 : 0), right: rightInset, top: desktop ? 24 : 72, bottom: 160 }}
        />
      </div>
      {mapMode === '3d' && (
        <div className="absolute" style={{ left: inset + 56, right: rightInset, top: desktop ? 12 : 64, bottom: 168 }}>
          <TerrainView />
        </div>
      )}

      {desktop ? (
        <>
          <Panel
            label={left.label}
            className={`anim-rise absolute top-3 bottom-3 left-3 z-10 ${leftOpen ? '' : 'hidden'}`}
          >
            <div className="flex min-h-0 flex-1 flex-col" style={{ width: PANEL_W }}>
              {left.node}
            </div>
          </Panel>
          <Panel
            label={right.label}
            className={`anim-rise absolute top-3 right-3 bottom-3 z-10 [animation-delay:60ms] ${rightOpen ? '' : 'hidden'}`}
          >
            <div className="flex min-h-0 flex-1 flex-col" style={{ width: PANEL_W }}>
              {right.node}
            </div>
          </Panel>
        </>
      ) : (
        <>
          <div className="absolute top-3 right-3 left-3 z-10 flex gap-2">
            <Button id="workspace-planner-toggle" onClick={() => setSheet('left')} className="min-w-0 flex-1 bg-surface sm:flex-none">
              <PanelLeft />
              {left.label}
            </Button>
            <Button onClick={() => setSheet('right')} className="min-w-0 flex-1 bg-surface sm:flex-none">
              <PanelRight />
              {right.label}
            </Button>
          </div>
          <Sheet
            bare
            side="left"
            open={sheet === 'left'}
            onOpenChange={(o) => setSheet(o ? 'left' : null)}
            title={left.label}
          >
            <div className="flex h-full flex-col [&>header]:pr-12">{left.node}</div>
          </Sheet>
          <Sheet
            bare
            side="right"
            open={sheet === 'right'}
            onOpenChange={(o) => setSheet(o ? 'right' : null)}
            title={right.label}
          >
            <div className="flex h-full flex-col [&>header]:pr-12">{right.node}</div>
          </Sheet>
        </>
      )}

      {desktop && (
        <div
          className={`absolute z-10 flex gap-1 rounded-ctl border border-line bg-surface p-1 ${mapMode === '3d' ? 'flex-col' : ''}`}
          style={{ left: mapMode === '3d' ? inset : inset + 56, top: mapMode === '3d' ? 236 : 12 }}
        >
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={leftOpen ? 'Hide planner panel' : 'Show planner panel'}
            aria-pressed={leftOpen}
            onClick={() => setLeftOpen(!leftOpen)}
          >
            <PanelLeft />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Focus map"
            onClick={() => {
              const open = !leftOpen && !rightOpen
              setLeftOpen(open)
              setRightOpen(open)
            }}
          >
            <Maximize2 />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={rightOpen ? 'Hide inspector panel' : 'Show inspector panel'}
            aria-pressed={rightOpen}
            onClick={() => setRightOpen(!rightOpen)}
          >
            <PanelRight />
          </Button>
        </div>
      )}
      <div className="absolute z-10" style={{ left: inset, top: desktop ? 12 : 64 }}>
        <MapTools showLayers={view !== 'terrain' || !desktop} />
      </div>
      <div className="absolute z-10" style={{ right: rightInset, top: desktop ? 12 : 64 }}>
        {mapMode === '2d' && <MapLegend defaultOpen={false} />}
      </div>

      <div
        className="pointer-events-none absolute z-20 flex flex-col items-center gap-2"
        style={{ left: inset + 56, right: rightInset, top: desktop ? 64 : 64 }}
      >
        <div className="pointer-events-auto max-w-full">
          <PlacementBanner />
        </div>
        <div className="pointer-events-auto max-w-full">{mapMode === '2d' && <ImageryNotice />}</div>
      </div>

      <div className="absolute bottom-3 z-10 flex flex-col gap-2" style={{ left: inset, right: rightInset }}>
        <div className="flex items-center gap-2">
          <CoordinateBar className="min-w-0 flex-1" />
          <DemoMapTag className="shrink-0" />
          {mapMode === '2d' && <RegistrationTag className="shrink-0" />}
        </div>
        <SimDock />
      </div>
    </div>
  )
}
