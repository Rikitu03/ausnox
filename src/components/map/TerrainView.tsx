import { Component, lazy, Suspense, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useUiStore } from '@/stores/uiStore'

const Mars3DViewer = lazy(() => import('./three/Mars3DViewer'))

class TerrainErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <div className="grid h-full place-items-center bg-surface p-4"><div role="alert" className="space-y-3"><p>3D terrain could not load. Your mission is preserved.</p><Button onClick={() => useUiStore.getState().setMapMode('2d')}>Return to 2D Map</Button></div></div> : this.props.children
  }
}

export function TerrainView() {
  return <TerrainErrorBoundary><Suspense fallback={<div className="grid h-full place-items-center bg-surface text-[13px] text-fg-2" role="status">Loading 3D terrain viewer…</div>}><Mars3DViewer /></Suspense></TerrainErrorBoundary>
}
