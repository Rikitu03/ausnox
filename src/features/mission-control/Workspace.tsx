import { PanelLeft, PanelRight } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Panel } from '@/components/layout/primitives'
import { CoordinateBar, DemoMapTag, ImageryNotice, MapLegend, MapTools, PlacementBanner } from '@/components/map/MapChrome'
import { MarsMap } from '@/components/map/MarsMap'
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

const PANELS: Record<MapView, { left: { label: string; node: ReactNode }; right: { label: string; node: ReactNode } }> = {
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
  const desktop = useIsDesktop()
  const sheet = useUiStore((s) => s.sheet)
  const setSheet = useUiStore((s) => s.setSheet)
  const { left, right } = PANELS[view]
  const inset = desktop ? PANEL_W + GUTTER * 2 : GUTTER

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUiStore.getState()
      if (e.key === 'Escape' && (ui.placement || ui.placementIssue) && !ui.coordinateEntry) ui.cancelPlacement()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative h-full overflow-hidden">
      <h1 className="sr-only">{left.label}</h1>
      <MarsMap
        showWalker
        padding={{ left: inset + (desktop ? 56 : 0), right: inset, top: desktop ? 24 : 72, bottom: 160 }}
      />

      {desktop ? (
        <>
          <Panel label={left.label} className="anim-rise absolute top-3 bottom-3 left-3 z-10">
            <div className="flex min-h-0 flex-1 flex-col" style={{ width: PANEL_W }}>
              {left.node}
            </div>
          </Panel>
          <Panel label={right.label} className="anim-rise absolute top-3 right-3 bottom-3 z-10 [animation-delay:60ms]">
            <div className="flex min-h-0 flex-1 flex-col" style={{ width: PANEL_W }}>
              {right.node}
            </div>
          </Panel>
        </>
      ) : (
        <>
          <div className="absolute top-3 left-3 z-10 flex gap-2">
            <Button onClick={() => setSheet('left')} className="bg-surface">
              <PanelLeft />
              {left.label}
            </Button>
            <Button onClick={() => setSheet('right')} className="bg-surface">
              <PanelRight />
              {right.label}
            </Button>
          </div>
          <Sheet bare side="left" open={sheet === 'left'} onOpenChange={(o) => setSheet(o ? 'left' : null)} title={left.label}>
            <div className="flex h-full flex-col [&>header]:pr-12">{left.node}</div>
          </Sheet>
          <Sheet bare side="right" open={sheet === 'right'} onOpenChange={(o) => setSheet(o ? 'right' : null)} title={right.label}>
            <div className="flex h-full flex-col [&>header]:pr-12">{right.node}</div>
          </Sheet>
        </>
      )}

      <div className="absolute z-10" style={{ left: inset, top: desktop ? 12 : 64 }}>
        <MapTools showLayers={view !== 'terrain' || !desktop} />
      </div>
      <div className="absolute top-3 z-10" style={{ right: inset }}>
        <MapLegend defaultOpen={false} />
      </div>

      <div className="pointer-events-none absolute z-20 flex flex-col items-center gap-2" style={{ left: inset + 56, right: inset, top: desktop ? 12 : 64 }}>
        <div className="pointer-events-auto">
          <PlacementBanner />
        </div>
        <div className="pointer-events-auto">
          <ImageryNotice />
        </div>
      </div>

      <div className="absolute bottom-3 z-10 flex flex-col gap-2" style={{ left: inset, right: inset }}>
        <div className="flex items-center gap-2">
          <CoordinateBar className="min-w-0 flex-1" />
          <DemoMapTag className="shrink-0" />
        </div>
        <SimDock />
      </div>
    </div>
  )
}
