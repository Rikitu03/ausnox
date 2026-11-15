import { Component, lazy, Suspense, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useUiStore } from '@/stores/uiStore'

const Mars3DViewer = lazy(() => import('./three/Mars3DViewer'))

/** `resetKey` changes when 3D is reopened, so a crashed viewer gets a fresh try instead of staying failed. */
class TerrainErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidUpdate(previous: { resetKey: string }) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }
  render() {
    return this.state.failed ? <div className="grid h-full place-items-center bg-surface p-4"><div role="alert" className="space-y-3"><p>3D terrain could not load. Your mission is preserved.</p><Button onClick={() => useUiStore.getState().setMapMode('2d')}>Return to 2D Map</Button></div></div> : this.props.children
  }
}

export function TerrainView() {
  const mode = useUiStore((s) => s.mapMode)
  return <TerrainErrorBoundary resetKey={mode}><Suspense fallback={<div className="grid h-full place-items-center bg-surface text-[13px] text-fg-2" role="status">Loading 3D terrain viewer…</div>}><Mars3DViewer /></Suspense></TerrainErrorBoundary>
}
