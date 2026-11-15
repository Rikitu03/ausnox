import { ChevronLeft, ChevronRight, PanelLeft, PanelLeftOpen, PanelRight, PanelRightOpen, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { CoordinateBar, DemoMapTag, FocusMapButton, ImageryNotice, InspectedCell, MapLegend, MapTools, PlacementBanner, RegistrationTag } from '@/components/map/MapChrome'
import { MarsMap, type MapPadding } from '@/components/map/MarsMap'
import { TerrainView } from '@/components/map/TerrainView'
import { CameraMenu, SurfaceKey, SurfaceTools, ThreeOverlayError } from '@/components/map/three/ThreeChrome'
import { SimDock } from '@/components/simulation/SimControls'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/overlay'
import { PlannerPanel } from '@/features/mission-planner/PlannerPanel'
import { SimulationControlPanel, SimulationEventsPanel } from '@/features/mission-simulation/SimulationPanels'
import { LayersPanel, TerrainInspectorPanel } from '@/features/terrain-explorer/TerrainPanels'
import { useIsDesktop, useIsTabletUp } from '@/hooks/useMediaQuery'
import { useUiStore, type MapView, type PanelSide } from '@/stores/uiStore'
import { cn } from '@/utils/cn'
import { MissionStatusPanel } from './MissionStatusPanel'

interface PanelDef {
  label: string
  /** Trigger label on phones, where two full labels do not fit beside the focus control. */
  short: string
  node: ReactNode
}

const PANELS: Record<MapView, Record<PanelSide, PanelDef>> = {
  control: {
    left: { label: 'Mission planner', short: 'Planner', node: <PlannerPanel /> },
    right: { label: 'Mission status', short: 'Status', node: <MissionStatusPanel /> },
  },
  terrain: {
    left: { label: 'Layers and science', short: 'Layers', node: <LayersPanel /> },
    right: { label: 'Terrain', short: 'Terrain', node: <TerrainInspectorPanel /> },
  },
  simulation: {
    left: { label: 'Mission simulation', short: 'Simulation', node: <SimulationControlPanel /> },
    right: { label: 'Mission timeline', short: 'Timeline', node: <SimulationEventsPanel /> },
  },
}

/** Desktop column widths. Within the 320–380 (left) and 300–380 (right) ranges of the layout spec. */
const WIDTH: Record<PanelSide, number> = { left: 352, right: 348 }

type Layout = 'columns' | 'drawer' | 'sheet'

/** True while any modal surface (dialog, sheet, popover) is open: Escape belongs to it, not to the map. */
const modalOpen = () => document.querySelector('[role="dialog"]') !== null

const focusTrigger = (side: PanelSide) => document.querySelector<HTMLElement>(`[data-panel-trigger="${side}"]`)?.focus()

/**
 * The map workspace: a side panel on each edge and the map filling everything between them.
 *
 * Desktop (1280 px and up): three columns. Each panel collapses on its own and gives its width back to
 * the map. Tablet: panels are drawers over a full-width map. Phone: bottom sheets, one at a time.
 * Focus map hides every panel without touching the saved layout, so leaving it restores that layout.
 *
 * Panels stay mounted in every layout and are hidden with `hidden`, so typed values survive closing and
 * hidden panels can never hold keyboard focus. The 2D map and, once opened, the 3D scene also stay
 * mounted: switching modes, views of the layout or focus never rebuilds them.
 */
export function Workspace({ view }: { view: MapView }) {
  const desktop = useIsDesktop()
  const tabletUp = useIsTabletUp()
  const layout: Layout = desktop ? 'columns' : tabletUp ? 'drawer' : 'sheet'
  const mapMode = useUiStore((s) => s.mapMode)
  const sheet = useUiStore((s) => s.sheet)
  const focusMode = useUiStore((s) => s.focusMode)
  const saved = useUiStore((s) => s.panels[view])
  const setPanel = useUiStore((s) => s.setPanel)
  const setSheet = useUiStore((s) => s.setSheet)
  const defs = PANELS[view]

  // Mount the 3D viewer the first time it is asked for, then keep it: the scene, camera and GPU
  // buffers survive 2D and back. It renders nothing while hidden.
  const [threeMounted, setThreeMounted] = useState(mapMode === '3d')
  if (mapMode === '3d' && !threeMounted) setThreeMounted(true)

  const open: Record<PanelSide, boolean> = {
    left: layout === 'columns' ? saved.left && !focusMode : sheet === 'left',
    right: layout === 'columns' ? saved.right && !focusMode : sheet === 'right',
  }

  const leftPanel = useRef<HTMLElement>(null)
  const rightPanel = useRef<HTMLElement>(null)

  /** Close a drawer or sheet and hand focus back to the control that opened it. */
  const closeOverlay = (side: PanelSide) => {
    setSheet(null)
    requestAnimationFrame(() => focusTrigger(side))
  }

  const toggle = (side: PanelSide) => {
    if (layout === 'columns') setPanel(view, side, !saved[side])
    else if (sheet === side) closeOverlay(side)
    else setSheet(side)
  }

  // Escape, in order: an open dialog or popover (handled by it), placement, an open drawer, focus map.
  // Listening in the window capture phase runs before Radix's own document listeners, so an open
  // dialog is still in the DOM when checked, and a tooltip that happens to be showing (it would
  // swallow the key) never stops Escape from leaving focus map.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const ui = useUiStore.getState()
      if (ui.coordinateEntry || modalOpen()) return
      if (ui.placement || ui.placementIssue) return ui.cancelPlacement()
      if (ui.sheet && !window.matchMedia('(min-width: 1280px)').matches) {
        const side = ui.sheet
        ui.setSheet(null)
        requestAnimationFrame(() => focusTrigger(side))
        return
      }
      if (ui.focusMode) ui.setFocusMode(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // A drawer or sheet that opens takes focus, so keyboard and screen reader users land inside it.
  useEffect(() => {
    if (layout !== 'columns' && sheet) (sheet === 'left' ? leftPanel : rightPanel).current?.focus({ preventScroll: true })
  }, [layout, sheet])

  const narrow = layout !== 'columns'
  const is3d = mapMode === '3d'
  // Rows of floating chrome along the top of the map. Phones and tablets add a row of panel triggers.
  const toolsTop = narrow && !focusMode ? 60 : 12
  const bannerTop = toolsTop + (is3d ? 48 : 0)
  const padding: MapPadding = { left: 72, right: 24, top: toolsTop + 24, bottom: 180 }

  return (
    <div className="relative flex h-full overflow-hidden">
      <h1 className="sr-only">{defs.left.label}</h1>

      <SidePanel side="left" layout={layout} def={defs.left} open={open.left} panelRef={leftPanel} onClose={() => closeOverlay('left')} />

      <div className="relative min-w-0 flex-1" id="map-workspace">
        <div className={is3d ? 'hidden' : 'absolute inset-0'} aria-hidden={is3d}>
          <MarsMap showWalker padding={padding} />
        </div>
        {threeMounted && (
          <div className={is3d ? 'absolute inset-0' : 'hidden'} aria-hidden={!is3d}>
            <TerrainView />
          </div>
        )}

        {layout === 'columns' && !focusMode && (
          <>
            <EdgeHandle side="left" label={defs.left.label} open={open.left} onToggle={() => toggle('left')} />
            <EdgeHandle side="right" label={defs.right.label} open={open.right} onToggle={() => toggle('right')} />
          </>
        )}

        {/* Upper-left: panel triggers on small screens, then map tools and the 3D surface options. */}
        {narrow && !focusMode && (
          <div className="pointer-events-none absolute top-3 left-3 z-20 flex gap-2">
            {(['left', 'right'] as const).map((side) => (
              <Button
                key={side}
                data-panel-trigger={side}
                aria-expanded={open[side]}
                aria-controls={`panel-${side}`}
                aria-label={defs[side].label}
                onClick={() => toggle(side)}
                className="pointer-events-auto bg-surface"
              >
                {side === 'left' ? <PanelLeft /> : <PanelRight />}
                <span aria-hidden>{tabletUp ? defs[side].label : defs[side].short}</span>
              </Button>
            ))}
          </div>
        )}
        <div className="absolute left-3 z-10" style={{ top: toolsTop }}>
          <MapTools showLayers={view !== 'terrain' || narrow || focusMode} />
        </div>
        {is3d && <SurfaceTools className="absolute left-16 z-10" style={{ top: toolsTop }} />}

        {/* Upper-right: camera and focus. The 3D compass sits under them. */}
        <div className="absolute top-3 right-3 z-20 flex gap-2">
          {is3d && <CameraMenu compact={!desktop} />}
          <FocusMapButton compact={layout === 'sheet'} />
        </div>

        <div className="pointer-events-none absolute right-3 left-16 z-20 flex flex-col items-center gap-2" style={{ top: bannerTop }}>
          <div className="pointer-events-auto">
            <PlacementBanner />
          </div>
          <div className="pointer-events-auto">{is3d ? <ThreeOverlayError /> : <ImageryNotice />}</div>
        </div>

        {/* Lower-left: legend and source tags. Lower-right: the selected cell and the pointer readout. Bottom: clock. */}
        <div className="pointer-events-none absolute right-3 bottom-3 left-3 z-10 flex flex-col gap-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="pointer-events-auto flex min-w-0 flex-wrap items-end gap-2">
              <MapLegend />
              {is3d && <SurfaceKey />}
              <DemoMapTag />
              {!is3d && <RegistrationTag />}
            </div>
            <div className="pointer-events-auto ml-auto flex w-full max-w-[520px] min-w-0 flex-col items-end gap-2 sm:w-auto">
              <InspectedCell />
              <CoordinateBar quiet={focusMode} className="w-full sm:w-auto sm:max-w-[520px]" />
            </div>
          </div>
          <SimDock minimal={focusMode} className="pointer-events-auto" />
        </div>
      </div>

      <SidePanel side="right" layout={layout} def={defs.right} open={open.right} panelRef={rightPanel} onClose={() => closeOverlay('right')} />

      {narrow && sheet && (
        <div className="anim-fade absolute inset-0 z-30 bg-black/45" aria-hidden onClick={() => closeOverlay(sheet)} />
      )}
    </div>
  )
}

const PANEL_LAYOUT: Record<Layout, Record<PanelSide, string>> = {
  columns: {
    left: 'relative z-10 h-full shrink-0 border-r border-line bg-surface panel-in-left',
    right: 'relative z-10 h-full shrink-0 border-l border-line bg-surface panel-in-right',
  },
  drawer: {
    left: 'absolute top-0 bottom-0 left-0 z-40 w-[min(380px,calc(100%-48px))] border-r border-line-strong bg-surface shadow-2xl shadow-black/50 panel-in-left',
    right: 'absolute top-0 right-0 bottom-0 z-40 w-[min(380px,calc(100%-48px))] border-l border-line-strong bg-surface shadow-2xl shadow-black/50 panel-in-right',
  },
  sheet: {
    left: 'sheet absolute inset-x-0 bottom-0 z-40 rounded-t-panel border-t border-line-strong bg-surface panel-in-up',
    right: 'sheet absolute inset-x-0 bottom-0 z-40 rounded-t-panel border-t border-line-strong bg-surface panel-in-up',
  },
}

function SidePanel({
  side,
  layout,
  def,
  open,
  panelRef,
  onClose,
}: {
  side: PanelSide
  layout: Layout
  def: PanelDef
  open: boolean
  panelRef: RefObject<HTMLElement | null>
  onClose(): void
}) {
  return (
    <section
      ref={panelRef}
      id={`panel-${side}`}
      aria-label={def.label}
      tabIndex={-1}
      hidden={!open}
      className={cn('flex min-h-0 flex-col overflow-hidden outline-none', PANEL_LAYOUT[layout][side])}
      style={layout === 'columns' ? { width: WIDTH[side] } : undefined}
    >
      {layout !== 'columns' && (
        <Button variant="ghost" size="icon-sm" aria-label={`Close ${def.label.toLowerCase()}`} className="absolute top-2.5 right-2.5 z-10" onClick={onClose}>
          <X />
        </Button>
      )}
      <div className={cn('flex min-h-0 flex-1 flex-col', layout !== 'columns' && '[&>header]:pr-12')}>{def.node}</div>
    </section>
  )
}

/**
 * The tab on the map edge that collapses or reopens a desktop panel. Open: a slim chevron. Collapsed:
 * the panel name, set vertically like a binder tab, so a closed panel is still findable.
 */
function EdgeHandle({ side, label, open, onToggle }: { side: PanelSide; label: string; open: boolean; onToggle(): void }) {
  const Icon = open ? (side === 'left' ? ChevronLeft : ChevronRight) : side === 'left' ? PanelLeftOpen : PanelRightOpen
  const action = `${open ? 'Hide' : 'Show'} ${label.toLowerCase()}`
  return (
    <Tooltip label={action} side={side === 'left' ? 'right' : 'left'}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`panel-${side}`}
        aria-label={action}
        onClick={onToggle}
        className={cn(
          'absolute top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-2 border border-line-strong bg-surface text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg',
          side === 'left' ? 'left-0 rounded-r-ctl border-l-0' : 'right-0 rounded-l-ctl border-r-0',
          open ? 'h-12 w-5 justify-center' : 'w-7 py-3',
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {!open && (
          <span className="text-xs whitespace-nowrap [writing-mode:vertical-rl]" style={side === 'left' ? { transform: 'rotate(180deg)' } : undefined} aria-hidden>
            {label}
          </span>
        )}
      </button>
    </Tooltip>
  )
}
