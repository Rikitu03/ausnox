import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { services } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useMissionStore } from '@/stores/missionStore'
import { useUiStore } from '@/stores/uiStore'
import { App } from '@/app/App'

vi.mock('@/components/map/MarsMap', () => ({ MarsMap: () => <div data-testid="map" /> }))

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  Element.prototype.scrollIntoView = vi.fn()
  services.demo!.set('nominal')
  useMissionStore.getState().reset()
  useDataStore.setState({ boot: 'loading' })
  useUiStore.setState({ view: 'sources', provenanceId: null, helpOpen: false, sourcesSection: null, sheet: null })
})

describe('Data sources page', () => {
  it('leads with an overview, then datasets, methodology, limitations and references', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Data sources and methods' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Overview', 'Datasets', 'Methodology', 'Limitations', 'References'])
    for (const name of ['Scientific datasets', 'Methodology', 'Scientific limitations', 'Technical references and credits']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    // Critical findings are visible without expanding anything.
    expect(screen.getByText(/critical findings? to know before reading results/)).toBeInTheDocument()
    // The 3D view is described as implemented, not unavailable.
    expect(screen.getByRole('heading', { name: /3D terrain view/ })).toBeInTheDocument()
    expect(screen.queryByText(/Not available in this build/)).toBeNull()
  })

  it('filters datasets by classification and by status independently', async () => {
    const user = userEvent.setup()
    render(<App />)
    const list = await screen.findByRole('list', { name: /\d+ sources/ })
    const total = within(list).getAllByRole('listitem').length
    const type = screen.getByRole('radiogroup', { name: 'Type' })
    await user.click(within(type).getByRole('radio', { name: /Historical/ }))
    const historical = within(screen.getByRole('list', { name: /\d+ sources/ })).getAllByRole('listitem')
    expect(historical.length).toBeGreaterThan(0)
    expect(historical.length).toBeLessThan(total)
    const status = screen.getByRole('radiogroup', { name: 'Status' })
    await user.click(within(status).getByRole('radio', { name: /In use/ }))
    expect(screen.getByText('No sources match these filters')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(within(screen.getByRole('list', { name: /\d+ sources/ })).getAllByRole('listitem')).toHaveLength(total)
  })

  it('opens provenance details from a dataset card', async () => {
    const user = userEvent.setup()
    render(<App />)
    const list = await screen.findByRole('list', { name: /\d+ sources/ })
    await user.click(within(list).getAllByRole('button', { name: /^Inspect provenance:/ })[0]!)
    expect(useUiStore.getState().provenanceId).not.toBeNull()
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('reveals method formulas only on request', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { level: 2, name: 'Methodology' })
    expect(screen.queryByText(/Horn \(1981\) gradients/)).toBeNull()
    await user.click(screen.getAllByRole('button', { name: 'Formula and validation' })[0]!)
    expect(screen.getByText(/Horn \(1981\) gradients/)).toBeInTheDocument()
  })
})

describe('Header controls', () => {
  it('Simulated mission opens a short popover, distinct from Help, that links to methodology', async () => {
    const user = userEvent.setup()
    useUiStore.setState({ view: 'control' })
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /^Simulated mission/ }))
    const pop = await screen.findByRole('dialog', { name: 'About this simulated mission' })
    for (const t of ['The mission is hypothetical', 'Assumptions are simulated', 'Feasible is not safe']) expect(within(pop).getByText(t)).toBeInTheDocument()
    expect(useUiStore.getState().helpOpen).toBe(false)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'About this simulated mission' })).toBeNull())

    await user.click(screen.getByRole('button', { name: /^Simulated mission/ }))
    await user.click(await screen.findByRole('button', { name: /How the science works/ }))
    expect(useUiStore.getState().view).toBe('sources')
  })

  it('Help is a tabbed dialog with four topics, closes on Escape and deep-links to the data page', async () => {
    const user = userEvent.setup()
    useUiStore.setState({ view: 'control' })
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Help' }))
    const dialog = await screen.findByRole('dialog', { name: 'Help' })
    const tabs = within(dialog).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent?.replace(/^(Start|Results|Data|About)/, ''))).toEqual([
      'Getting started',
      'Understanding results',
      'Data and science',
      'About Ausnox',
    ])
    await user.click(tabs[1]!)
    expect(within(dialog).getByRole('heading', { name: 'Return margin' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Help' })).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Help' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Help' })).getByRole('tab', { name: /Data and science/ }))
    await user.click(screen.getByRole('button', { name: /Browse data sources/ }))
    expect(useUiStore.getState().view).toBe('sources')
    expect(useUiStore.getState().helpOpen).toBe(false)
  })
})
