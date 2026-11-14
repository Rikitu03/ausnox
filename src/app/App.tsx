import { useEffect } from 'react'
import { HelpDialog, TopBar } from '@/components/layout/TopBar'
import { Logo } from '@/components/layout/primitives'
import { CoordinateEntryDialog } from '@/components/map/MapChrome'
import { ProvenanceDrawer } from '@/components/provenance/Provenance'
import { TooltipProvider } from '@/components/ui/overlay'
import { SourcesView } from '@/features/data-sources/SourcesView'
import { Workspace } from '@/features/mission-control/Workspace'
import { SummaryView } from '@/features/mission-summary/SummaryView'
import { useSimulationClock } from '@/hooks/useSimulation'
import { dataMode } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useMissionStore } from '@/stores/missionStore'
import { useUiStore, VIEWS, type View } from '@/stores/uiStore'

/** Loads terrain, layers and waypoints, then opens the sample mission when terrain is usable. */
async function bootstrap() {
  await useDataStore.getState().init()
  const { layers, manifest } = useDataStore.getState()
  useUiStore.setState({
    overlays: Object.fromEntries(layers.filter((l) => l.role === 'overlay').map((l) => [l.id, l.defaultVisible])),
  })
  if (manifest && useMissionStore.getState().status === 'idle') useMissionStore.getState().loadDemo()
}

function BootScreen() {
  return (
    <div className="grid h-full place-items-center" role="status">
      <div className="flex flex-col items-center gap-4 text-fg-2">
        <Logo className="size-8 text-fg" />
        <p className="text-[13px]">Loading terrain and map layers</p>
        <div className="h-0.5 w-40 overflow-hidden rounded-full bg-raised">
          <div className="h-full w-1/3 rounded-full bg-fg-2 [animation:boot_1.1s_var(--ease-out)_infinite_alternate]" />
        </div>
        <style>{'@keyframes boot{to{transform:translateX(200%)}}'}</style>
      </div>
    </div>
  )
}

export function App() {
  const boot = useDataStore((s) => s.boot)
  const view = useUiStore((s) => s.view)
  useSimulationClock()

  useEffect(() => {
    void bootstrap()
    const onHash = () => {
      const id = window.location.hash.replace(/^#\/?/, '') as View
      if (VIEWS.some((v) => v.id === id) && id !== useUiStore.getState().view) useUiStore.getState().setView(id)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <TooltipProvider delayDuration={350}>
      <div className="flex h-dvh flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[2000] focus:rounded-ctl focus:bg-fg focus:px-3 focus:py-2 focus:text-bg">
          Skip to content
        </a>
        <TopBar />
        <main id="main" className="min-h-0 flex-1">
          {boot === 'loading' ? (
            <BootScreen />
          ) : view === 'summary' ? (
            <SummaryView />
          ) : view === 'sources' ? (
            <SourcesView />
          ) : (
            <Workspace view={view} />
          )}
        </main>
        <footer className="flex min-h-7 shrink-0 items-center justify-center border-t border-line px-3 py-1 text-center text-xs text-fg-3">
          <p>
            Educational Marswalk planning simulation.{' '}
            {dataMode === 'mock' ? 'Terrain shown is illustrative demo data, not NASA or USGS data. ' : ''}Mission constraints are
            illustrative. Not for operational navigation
          </p>
        </footer>
        <ProvenanceDrawer />
        <HelpDialog />
        <CoordinateEntryDialog />
      </div>
    </TooltipProvider>
  )
}
