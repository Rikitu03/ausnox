import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { services } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useMissionStore } from '@/stores/missionStore'
import { useSimStore } from '@/stores/simStore'
import { useUiStore } from '@/stores/uiStore'

// Leaflet needs real layout; its resize behaviour is checked in the browser. Here it is a stand-in.
vi.mock('@/components/map/MarsMap', () => ({ MarsMap: () => <div data-testid="map" /> }))

/** Sets the viewport class the workspace sees: 'desktop' (≥1280), 'tablet' (768–1279) or 'phone'. */
function viewport(kind: 'desktop' | 'tablet' | 'phone') {
  const width = kind === 'desktop' ? 1440 : kind === 'tablet' ? 1024 : 390
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    return { matches: min ? width >= Number(min[1]) : false, media: query, addEventListener: () => {}, removeEventListener: () => {} }
  }) as unknown as typeof window.matchMedia
}

const OPEN = { left: true, right: true }

beforeEach(() => {
  window.localStorage.clear()
  viewport('desktop')
  services.demo!.set('nominal')
  useMissionStore.getState().reset()
  useSimStore.setState({ simS: 0, playing: false, endS: 0 })
  useDataStore.setState({ boot: 'loading' })
  useUiStore.setState({
    view: 'control',
    mapMode: '2d',
    placement: null,
    placementIssue: null,
    coordinateEntry: null,
    provenanceId: null,
    helpOpen: false,
    sheet: null,
    focusMode: false,
    panels: { control: { ...OPEN }, terrain: { ...OPEN }, simulation: { ...OPEN } },
  })
})

const ready = () => screen.findByText('Feasible under selected assumptions', undefined, { timeout: 4000 })
const planner = () => screen.queryByRole('region', { name: 'Mission planner' })
const status = () => screen.queryByRole('region', { name: 'Mission status' })

describe('desktop workspace', () => {
  it('collapses each side panel on its own and gives the space back to the map', async () => {
    const user = userEvent.setup()
    render(<App />)
    await ready()
    const hideLeft = screen.getByRole('button', { name: 'Hide mission planner' })
    expect(hideLeft).toHaveAttribute('aria-expanded', 'true')
    expect(hideLeft).toHaveAttribute('aria-controls', 'panel-left')

    await user.click(hideLeft)
    expect(planner()).toBeNull()
    expect(document.getElementById('panel-left')).not.toBeVisible()
    expect(status()).toBeInTheDocument()
    const showLeft = screen.getByRole('button', { name: 'Show mission planner' })
    expect(showLeft).toHaveAttribute('aria-expanded', 'false')
    expect(showLeft).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Hide mission status' }))
    expect(planner()).toBeNull()
    expect(status()).toBeNull()
    expect(useUiStore.getState().panels.control).toEqual({ left: false, right: false })

    await user.click(showLeft)
    expect(planner()).toBeInTheDocument()
    expect(status()).toBeNull()
  })

  it('remembers the layout per view and across reloads', async () => {
    const user = userEvent.setup()
    render(<App />)
    await ready()
    await user.click(screen.getByRole('button', { name: 'Hide mission planner' }))
    const nav = screen.getByRole('navigation', { name: 'Views' })
    await user.click(within(nav).getByRole('button', { name: 'Terrain' }))
    expect(screen.getByRole('region', { name: 'Layers and science' })).toBeInTheDocument()
    await user.click(within(nav).getByRole('button', { name: 'Mission control' }))
    expect(planner()).toBeNull()
    expect(JSON.parse(window.localStorage.getItem('ausnox.panels.v1')!).control).toEqual({ left: false, right: true })
  })

  it('focus map hides every panel and Escape restores the exact layout, without touching the mission', async () => {
    const user = userEvent.setup()
    render(<App />)
    await ready()
    await user.click(screen.getByRole('button', { name: 'Hide mission status' }))
    const mission = useMissionStore.getState()
    const sim = useSimStore.getState()

    const focus = screen.getByRole('button', { name: 'Focus map' })
    expect(focus).toHaveAttribute('aria-pressed', 'false')
    await user.click(focus)
    expect(planner()).toBeNull()
    expect(status()).toBeNull()
    expect(screen.queryByRole('button', { name: /Show mission/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Exit focus map' })).toHaveAttribute('aria-pressed', 'true')
    // Provenance and the disclaimer stay reachable while focused.
    expect(screen.getByRole('button', { name: 'Legend' })).toBeInTheDocument()
    expect(screen.getByText(/Not for operational navigation/)).toBeInTheDocument()
    expect(useUiStore.getState().panels.control).toEqual({ left: true, right: false })

    await user.keyboard('{Escape}')
    expect(useUiStore.getState().focusMode).toBe(false)
    expect(planner()).toBeInTheDocument()
    expect(status()).toBeNull()
    expect(useMissionStore.getState()).toBe(mission)
    expect(useSimStore.getState()).toBe(sim)
  })

  it('leaves Escape to an open dialog before exiting focus map', async () => {
    const user = userEvent.setup()
    render(<App />)
    await ready()
    await user.click(screen.getByRole('button', { name: 'Focus map' }))
    useUiStore.getState().setHelpOpen(true)
    await screen.findByRole('dialog', { name: 'Help' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useUiStore.getState().focusMode).toBe(true)
    await user.keyboard('{Escape}')
    expect(useUiStore.getState().focusMode).toBe(false)
  })

  it('keeps panel state and mission results through 2D and 3D switches', async () => {
    const user = userEvent.setup()
    render(<App />)
    await ready()
    await user.click(screen.getByRole('button', { name: 'Hide mission planner' }))
    const mission = useMissionStore.getState()
    await user.click(screen.getByRole('button', { name: '3D terrain view' }))
    expect(planner()).toBeNull()
    expect(status()).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '3D terrain view' }))
    expect(useUiStore.getState().mapMode).toBe('2d')
    expect(planner()).toBeNull()
    const after = useMissionStore.getState()
    expect(after.config).toBe(mission.config)
    expect(after.routes).toBe(mission.routes)
    expect(after.assessments).toBe(mission.assessments)
  })
})

describe('narrow workspace', () => {
  it('tablet: drawers over a full-width map, one at a time, Escape closes and returns focus', async () => {
    viewport('tablet')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('button', { name: 'Mission planner' }, { timeout: 4000 })
    expect(planner()).toBeNull()
    expect(screen.queryByRole('button', { name: /Hide mission/ })).toBeNull()

    const leftTrigger = screen.getByRole('button', { name: 'Mission planner' })
    await user.click(leftTrigger)
    expect(leftTrigger).toHaveAttribute('aria-expanded', 'true')
    expect(planner()).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Mission status' }))
    expect(planner()).toBeNull()
    expect(status()).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(status()).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mission status' })).toHaveFocus())
  })

  it('phone: the sheet keeps what was typed after it closes', async () => {
    viewport('phone')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('button', { name: 'Mission planner' }, { timeout: 4000 })
    await user.click(screen.getByRole('button', { name: 'Mission planner' }))
    const sheet = planner()!
    const name = within(sheet).getByRole('textbox', { name: 'Mission name' })
    await user.clear(name)
    await user.type(name, 'Delta walk')
    await user.click(within(sheet).getByRole('button', { name: 'Close mission planner' }))
    expect(planner()).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Mission planner' }))
    expect(within(planner()!).getByRole('textbox', { name: 'Mission name' })).toHaveValue('Delta walk')
  })
})
