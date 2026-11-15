import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { services } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useMissionStore } from '@/stores/missionStore'
import { useSimStore } from '@/stores/simStore'
import { useUiStore } from '@/stores/uiStore'
import { App } from '../App'

// Leaflet needs real layout. The map has its own manual checks; here it is a stand-in.
vi.mock('@/components/map/MarsMap', () => ({ MarsMap: () => <div data-testid="map" /> }))

beforeEach(() => {
  // Desktop layout: side panels are on screen, not inside sheets.
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  services.demo!.set('nominal')
  useMissionStore.getState().reset()
  useSimStore.setState({ simS: 0, playing: false, endS: 0 })
  useDataStore.setState({ boot: 'loading' })
  useUiStore.setState({ view: 'control', placement: null, placementIssue: null, coordinateEntry: null, provenanceId: null, helpOpen: false, sheet: null })
})

const ready = () => screen.findByText('Feasible under selected assumptions', undefined, { timeout: 4000 })

describe('App', () => {
  it('opens the sample mission with a feasibility verdict and clear demo labelling', async () => {
    render(<App />)
    expect(screen.getByText('Loading terrain and map layers')).toBeInTheDocument()
    await ready()
    expect(screen.getAllByText('SIMULATED').length).toBeGreaterThan(0)
    expect(screen.getByText(/Demonstration response/)).toBeInTheDocument()
    expect(screen.getByText(/Not for operational navigation/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Mission planner' })).toBeInTheDocument()
  })

  it('switches between views', async () => {
    const user = userEvent.setup()
    render(<App />)
    await ready()
    const nav = screen.getByRole('navigation', { name: 'Views' })
    await user.click(within(nav).getByRole('button', { name: 'Summary' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Demo Marswalk 01' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Model assumptions used' })).toBeInTheDocument()

    await user.click(within(nav).getByRole('button', { name: 'Data sources' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Data sources and methods' })).toBeInTheDocument()
    expect(screen.getByText('Running on demonstration data')).toBeInTheDocument()

    await user.click(within(nav).getByRole('button', { name: 'Terrain' }))
    expect(screen.getByRole('region', { name: 'Layers and science' })).toBeInTheDocument()
    expect(screen.getAllByText(/Unavailable\. Needs the real map adapter/).length).toBe(3)

    await user.click(within(nav).getByRole('button', { name: 'Simulation' }))
    expect(screen.getByRole('region', { name: 'Mission timeline' })).toBeInTheDocument()
  })

  it('makes the mission infeasible when science time grows, and explains why', async () => {
    const user = userEvent.setup()
    render(<App />)
    await ready()
    const field = screen.getByRole('spinbutton', { name: 'Science time at Sampling stop A' })
    await user.clear(field)
    await user.type(field, '240')
    expect(await screen.findByText('Infeasible under selected assumptions')).toBeInTheDocument()
    expect(screen.getByText('Not enough time to return')).toBeInTheDocument()
  })

  it('rejects an out-of-range value with a message and keeps the last valid one', async () => {
    const user = userEvent.setup()
    render(<App />)
    await ready()
    const field = screen.getByRole('spinbutton', { name: 'Science time at Sampling stop A' })
    await user.clear(field)
    await user.type(field, '-5')
    expect(screen.getByRole('alert')).toHaveTextContent('Must be 0 to 240 min')
    expect(useMissionStore.getState().config.destination?.durationMin).toBe(30)
  })

  it('places the habitat from typed coordinates, with an explicit snap for unsupported cells', async () => {
    const user = userEvent.setup()
    render(<App />)
    await ready()
    await user.click(screen.getAllByRole('button', { name: 'Enter coordinates' })[0]!)
    const dialog = await screen.findByRole('dialog', { name: 'Enter habitat coordinates' })
    await user.type(within(dialog).getByLabelText('x, metres east'), '1500')
    await user.type(within(dialog).getByLabelText('y, metres north'), '2080')
    await user.click(within(dialog).getByRole('button', { name: 'Place habitat' }))

    expect(await within(dialog).findByText('That location cannot be used')).toBeInTheDocument()
    expect(useMissionStore.getState().config.habitat?.position).toEqual({ x: 700, y: 1500 })

    await user.click(within(dialog).getByRole('button', { name: /Use nearest usable cell/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const placed = useMissionStore.getState().config.habitat!.position
    expect(placed).not.toEqual({ x: 700, y: 1500 })
    expect(services.terrain.sample(placed).validity).toBe('valid')
  })

  it('shows empty states after reset and validation when calculating too early', async () => {
    const user = userEvent.setup()
    render(<App />)
    await ready()
    await user.click(screen.getByRole('button', { name: /Reset/ }))
    expect(screen.getByText('No mission calculated')).toBeInTheDocument()
    expect(screen.getByText('No habitat yet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Calculate mission' }))
    expect(await screen.findByText('Mission cannot be calculated yet')).toBeInTheDocument()
    expect(screen.getByText('Set a habitat location')).toBeInTheDocument()
  })

  it('steps and resets the simulated clock', async () => {
    const user = userEvent.setup()
    render(<App />)
    await ready()
    await user.click(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('button', { name: 'Simulation' }))
    await user.click(screen.getByRole('button', { name: 'Step forward 5 minutes' }))
    expect(useSimStore.getState().simS).toBe(300)
    expect(screen.getByText('Walk to Sampling stop A')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reset simulation' }))
    expect(useSimStore.getState().simS).toBe(0)
    expect(screen.getByText('Ready at habitat')).toBeInTheDocument()
  })

  it('opens the source drawer from a provenance label', async () => {
    const user = userEvent.setup()
    render(<App />)
    await ready()
    await user.click(screen.getAllByRole('button', { name: /Show source: Route geometry/ })[0]!)
    const drawer = await screen.findByRole('dialog', { name: 'Route geometry and terrain metrics' })
    expect(within(drawer).getByText(/not pathfinding results/)).toBeInTheDocument()
  })

  it('reports indeterminate when the solar model is unavailable', async () => {
    services.demo!.set('solar-unavailable')
    render(<App />)
    expect((await screen.findAllByText('Indeterminate', undefined, { timeout: 4000 })).length).toBeGreaterThan(0)
    expect(screen.getByText('Daylight window unknown')).toBeInTheDocument()
    expect(screen.queryByText('Feasible under selected assumptions')).not.toBeInTheDocument()
  })

  it('blocks planning and says so when terrain is unavailable', async () => {
    services.demo!.set('terrain-missing')
    render(<App />)
    expect((await screen.findAllByText('Terrain data unavailable', undefined, { timeout: 4000 })).length).toBeGreaterThan(0)
    for (const b of screen.getAllByRole('button', { name: /Place on map/ })) expect(b).toBeDisabled()
    expect(screen.queryByText('Feasible under selected assumptions')).not.toBeInTheDocument()
  })
})
