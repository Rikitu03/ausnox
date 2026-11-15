import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/overlay'
import { CoordinateEntryDialog, MapTools } from '@/components/map/MapChrome'
import { services } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useMissionStore } from '@/stores/missionStore'
import { useSimStore } from '@/stores/simStore'
import { useUiStore } from '@/stores/uiStore'
import Mars3DViewer from './Mars3DViewer'

// GPU and camera are exercised in Playwright against the production build. This suite isolates
// React/store wiring and a synchronous renderer failure without requiring WebGL in jsdom.
const mocks = vi.hoisted(() => ({ dispose: vi.fn(), fail: false }))
vi.mock('./TerrainScene', () => ({
  activeSurface: (o: Record<string, boolean>) => o.slope ? 'slope' : o.elevation ? 'elevation' : 'relief',
  createTerrainScene: () => {
    if (mocks.fail) throw new Error('WebGL unavailable in this browser')
    return { dispose: mocks.dispose, setScale: vi.fn(), fitTerrain: vi.fn(), focusPoint: vi.fn(), focusRoute: vi.fn(), rotate: vi.fn() }
  },
}))

beforeEach(async () => {
  services.demo!.set('nominal')
  useMissionStore.getState().reset()
  useUiStore.setState({ mapMode: '2d', placement: null, placementIssue: null, coordinateEntry: null, overlays: {} })
  await useDataStore.getState().init()
  useUiStore.getState().loadSample()
  await waitFor(() => expect(useMissionStore.getState().status).toBe('done'))
  mocks.fail = false; mocks.dispose.mockClear()
})

describe('shared 2D/3D controls', () => {
  it('preserves mission config, both route results, assessments and paused simulation without recalculation', async () => {
    const user = userEvent.setup()
    useSimStore.setState({ simS: 300, playing: false })
    const m = useMissionStore.getState(), sim = useSimStore.getState()
    render(<TooltipProvider><MapTools showLayers /></TooltipProvider>)
    const toggle = screen.getByRole('button', { name: '3D terrain view' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(useUiStore.getState().mapMode).toBe('3d')
    await user.keyboard('[Space]')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(useUiStore.getState().mapMode).toBe('2d')
    const after = useMissionStore.getState()
    expect(after.config).toBe(m.config); expect(after.routes).toBe(m.routes); expect(after.assessments).toBe(m.assessments)
    expect(after.requestId).toBe(m.requestId); expect(useSimStore.getState()).toBe(sim)
  })
  it('uses the existing coordinate-entry rejection and explicit snap confirmation in 3D', async () => {
    const user = userEvent.setup()
    useUiStore.setState({ mapMode: '3d' })
    const before = useMissionStore.getState().config.habitat
    render(<TooltipProvider><Mars3DViewer /><CoordinateEntryDialog /></TooltipProvider>)
    useUiStore.getState().openCoordinateEntry('habitat')
    const dialog = await screen.findByRole('dialog', { name: 'Enter habitat coordinates' })
    await user.type(within(dialog).getByLabelText('x, metres east'), '-30')
    await user.type(within(dialog).getByLabelText('y, metres north'), '1500')
    await user.click(within(dialog).getByRole('button', { name: 'Place habitat' }))
    expect(within(dialog).getByText('That location cannot be used')).toBeInTheDocument()
    expect(useMissionStore.getState().config.habitat).toBe(before)
    const snap = useUiStore.getState().placementIssue?.snap
    expect(snap).not.toBeNull()
    await user.click(within(dialog).getByRole('button', { name: /Use nearest usable cell/ }))
    expect(useMissionStore.getState().config.habitat?.position).toEqual(snap)
  })
  it('contains renderer initialization errors and provides a 2D return action; resources are disposed on unmount', async () => {
    const user = userEvent.setup()
    mocks.fail = true
    useUiStore.setState({ mapMode: '3d' })
    const mission = useMissionStore.getState()
    const rendered = render(<TooltipProvider><Mars3DViewer /></TooltipProvider>)
    expect(await screen.findByRole('alert')).toHaveTextContent('WebGL unavailable')
    await user.click(screen.getByRole('button', { name: 'Return to 2D Map' }))
    expect(useUiStore.getState().mapMode).toBe('2d')
    expect(useMissionStore.getState()).toBe(mission)
    // The viewer stays mounted through 2D; reopening 3D retries the scene instead of keeping the failure.
    mocks.fail = false
    act(() => useUiStore.getState().setMapMode('3d'))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(mocks.dispose).not.toHaveBeenCalled()
    rendered.unmount()
    expect(mocks.dispose).toHaveBeenCalledOnce()
    mocks.dispose.mockClear()
    const working = render(<TooltipProvider><Mars3DViewer /></TooltipProvider>)
    working.unmount()
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })
})
