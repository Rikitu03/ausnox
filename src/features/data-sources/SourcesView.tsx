import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { StatusAlert } from '@/components/layout/primitives'
import { KIND_META, KindBadge, type BadgeKind } from '@/components/provenance/Provenance'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/controls'
import { dataMode, services, SOL_SECONDS, type ProvenanceRecord } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useMissionStore } from '@/stores/missionStore'
import { useUiStore } from '@/stores/uiStore'
import { useState } from 'react'

const STATUS: Record<ProvenanceRecord['integration'], string> = {
  planned: 'Planned',
  'demo-stand-in': 'Demo stand-in shown',
  integrated: 'In use',
}

function Block({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-8">
      <h2 className="text-base font-medium">{title}</h2>
      {intro && <p className="mt-1 max-w-[68ch] text-[13px] text-fg-2">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

const METHODS: { title: string; kind: BadgeKind; body: string; now: string }[] = [
  {
    title: 'Slope',
    kind: 'derived',
    body: 'Slope per cell is atan of the gradient magnitude, with gradients taken by finite differences over valid neighbouring cells in projected metres. Cells without a valid neighbour pair are unknown and blocked.',
    now: 'Runs today, but on the synthetic demo surface.',
  },
  {
    title: 'Routing',
    kind: 'derived',
    body: 'Planned: A* over the terrain grid with eight neighbours, no corner cutting, cells without data or above the slope limit forbidden. Shortest mode minimises distance. Lower-slope mode adds a slope penalty. The return leg is computed on its own.',
    now: 'Not implemented. The app draws the best of seven fixed arcs per segment and labels them as demonstration geometry.',
  },
  {
    title: 'Walking time',
    kind: 'simulated',
    body: 'Leg time is path distance divided by a constant walking speed. Mission duration is both legs plus science stops. The reserve is tracked separately.',
    now: 'Runs today as plain arithmetic over the demonstration route.',
  },
  {
    title: 'Daylight',
    kind: 'derived',
    body: `Planned: local true solar time, sunrise and sunset from the NASA GISS Mars24 equations, validated against the published worked examples. One sol is ${SOL_SECONDS.toLocaleString('en-US')} Earth seconds, and Mars clock hours are converted to Earth seconds before any sum with walking time.`,
    now: 'Not implemented. Fixed demonstration sunrise and sunset times are used. The sol-length conversion is real.',
  },
  {
    title: 'Feasibility',
    kind: 'simulated',
    body: 'Return margin is the time available minus mission duration minus reserve. Feasible needs a valid round trip, a start in daylight and a margin of zero or more. A violated known constraint gives infeasible. Any missing route, terrain or daylight input gives indeterminate.',
    now: 'Runs today over demonstration inputs, so the verdict is a demonstration.',
  },
]

const UNCERTAINTY = [
  'Terrain cells are metres wide. Rocks, sand and footing hazards smaller than a cell are invisible to slope',
  'Sunrise and sunset are geometric: flat horizon, no terrain shadow, no dust, no refraction',
  'A constant walking speed ignores slope, suit, fatigue and surface. Real traverse times would differ',
  'Datasets from different missions use different grids and vertical datums and are not combined numerically',
  'No weather, radiation, communication or life-support model exists in this app',
]

export function SourcesView() {
  const records = services.mapData.listProvenance()
  const demo = services.demo
  const [scenario, setScenario] = useState(demo?.get() ?? 'nominal')
  const init = useDataStore((s) => s.init)
  const terrainError = useDataStore((s) => s.terrainError)
  const setView = useUiStore((s) => s.setView)
  const [filter, setFilter] = useState<'all' | ProvenanceRecord['integration']>('all')
  const shown = records.filter((r) => filter === 'all' || r.integration === filter)

  const applyScenario = async (id: string) => {
    if (!demo) return
    demo.set(id)
    setScenario(id)
    // Reload data through the adapters, then recalculate whatever mission is on screen.
    await init()
    const mission = useMissionStore.getState()
    if (mission.status !== 'idle') void mission.calculate()
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1120px] space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        <header>
          <h1 className="text-2xl leading-8 font-medium">Data sources and methods</h1>
          <p className="mt-2 max-w-[68ch] text-[13px] text-fg-2">
            What Ausnox is built to use, what it shows today, and how far each number can be trusted. Ausnox is a NASA Space Apps
            2026 project. It is not endorsed by NASA
          </p>
        </header>

        <StatusAlert
          tone={dataMode === 'mock' ? 'info' : 'unknown'}
          title={dataMode === 'mock' ? 'Running on demonstration data' : 'Running on real adapters that are not implemented yet'}
        >
          {dataMode === 'mock'
            ? 'No NASA or USGS dataset is loaded in this build. The map shows a synthetic surface, routes are demonstration arcs and daylight times are fixed examples. Everything served this way is labelled Illustrative'
            : 'Real adapters are extension points only. Expect unavailable states until the scientific engine is integrated'}
        </StatusAlert>

        <Block title="Reading the labels" intro="Every layer, figure and assumption carries one of these labels. Select a label anywhere in the app to see its source">
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(KIND_META) as BadgeKind[]).map((k) => (
              <div key={k}>
                <dt>
                  <KindBadge kind={k} />
                </dt>
                <dd className="mt-1.5 text-[13px] text-fg-2">{KIND_META[k].meaning}</dd>
              </div>
            ))}
          </dl>
        </Block>

        <Block title="Datasets and models" intro="Named sources come from the project data register. A source is only marked in use once it has been downloaded, checked and wired in">
          <Segmented<'all' | ProvenanceRecord['integration']>
            label="Filter by status"
            className="mb-4 max-w-md"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `All ${records.length}` },
              { value: 'demo-stand-in', label: 'Stand-in' },
              { value: 'planned', label: 'Planned' },
              { value: 'integrated', label: 'In use' },
            ]}
          />
          {records.length === 0 ? (
            <StatusAlert tone="unknown" title="No source register available">
              The active adapters did not provide a source register
            </StatusAlert>
          ) : shown.length === 0 ? (
            <p className="text-[13px] text-fg-2">No sources with this status</p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {shown.map((r) => (
                <li key={r.id} className="rounded-panel border border-line bg-surface p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <KindBadge kind={r.kind} />
                    {r.integration === 'demo-stand-in' && <KindBadge kind="illustrative" />}
                    <span className="ml-auto text-xs text-fg-3">{STATUS[r.integration]}</span>
                  </div>
                  <h3 className="mt-3 text-sm font-medium">{r.title}</h3>
                  {(r.mission || r.instrument) && <p className="mt-0.5 text-[13px] text-fg-2">{[r.mission, r.instrument].filter(Boolean).join(' · ')}</p>}
                  <dl className="mt-3 space-y-2 text-[13px]">
                    <div className="grid grid-cols-[88px_1fr] gap-3">
                      <dt className="text-fg-3">Measures</dt>
                      <dd>{r.measures}</dd>
                    </div>
                    <div className="grid grid-cols-[88px_1fr] gap-3">
                      <dt className="text-fg-3">Coverage</dt>
                      <dd>{r.coverage}</dd>
                    </div>
                    {r.resolution && (
                      <div className="grid grid-cols-[88px_1fr] gap-3">
                        <dt className="text-fg-3">Resolution</dt>
                        <dd>{r.resolution}</dd>
                      </div>
                    )}
                    <div className="grid grid-cols-[88px_1fr] gap-3">
                      <dt className="text-fg-3">Limits</dt>
                      <dd>
                        <ul className="space-y-1">
                          {r.limitations.map((l) => (
                            <li key={l}>{l}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                    <div className="grid grid-cols-[88px_1fr] gap-3">
                      <dt className="text-fg-3">Credit</dt>
                      <dd className="text-fg-2">{r.attribution}</dd>
                    </div>
                  </dl>
                  {r.sourceUrl && (
                    <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[13px] underline decoration-line-strong underline-offset-4 hover:decoration-fg">
                      Source page
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title="Methods and model assumptions">
          <ul className="grid gap-4 md:grid-cols-2">
            {METHODS.map((m) => (
              <li key={m.title} className="rounded-panel border border-line bg-surface p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{m.title}</h3>
                  <KindBadge kind={m.kind} />
                </div>
                <p className="mt-2 text-[13px] text-fg-2">{m.body}</p>
                <p className="mt-3 border-t border-line pt-3 text-[13px]">
                  <span className="text-fg-3">In this build: </span>
                  {m.now}
                </p>
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Scientific uncertainty">
          <ul className="max-w-[78ch] space-y-2 text-[13px] text-fg-2">
            {UNCERTAINTY.map((u) => (
              <li key={u} className="border-l border-line-strong pl-3">
                {u}
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Navigation and safety">
          <div className="max-w-[78ch] space-y-2 text-[13px] text-fg-2">
            <p className="text-fg">Ausnox is an educational planning simulation. It is not flight-qualified and must not be used for navigation or safety decisions</p>
            <p>The habitat is fictional. No astronaut, vehicle or shelter is tracked, and nothing in the app is live telemetry</p>
            <p>Feasible always means feasible under the selected assumptions. No route is certified safe</p>
            <p>When data is missing the app says unknown or indeterminate. It does not fill gaps with estimates</p>
          </div>
        </Block>

        <Block title="3D terrain view" intro="Planned as an enhancement once the 2D workflow runs on validated data">
          <p className="max-w-[78ch] text-[13px] text-fg-2">
            Not available in this build. A 3D view will only draw the validated elevation model, with any vertical exaggeration
            labelled. Until then the map stays 2D and nothing depends on 3D
          </p>
        </Block>

        {demo && (
          <Block
            title="Demo scenarios"
            intro="Puts the demonstration adapters into a failure condition so each unavailable state can be checked. This control only exists with mock adapters"
          >
            <fieldset>
              <legend className="sr-only">Demo scenario</legend>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {demo.scenarios.map((s) => (
                  <li key={s.id}>
                    <label className="tap flex h-full cursor-pointer gap-3 rounded-card border border-line bg-surface p-3 transition-colors duration-150 hover:bg-raised has-checked:border-fg-2 has-focus-visible:outline-2 has-focus-visible:outline-accent">
                      <input type="radio" name="demo-scenario" className="mt-1 accent-(--color-fg)" checked={scenario === s.id} onChange={() => void applyScenario(s.id)} />
                      <span>
                        <span className="block text-[13px] font-medium">{s.title}</span>
                        <span className="mt-0.5 block text-[13px] text-fg-2">{s.description}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={() => setView('control')}>See it in mission control</Button>
              <p className="text-[13px] text-fg-2" role="status">
                {scenario === 'nominal' ? 'All adapters nominal' : `Active: ${demo.scenarios.find((s) => s.id === scenario)?.title}`}
                {terrainError && ' · terrain is currently unavailable'}
              </p>
            </div>
          </Block>
        )}

        <Block title="Credits">
          <p className="max-w-[78ch] text-[13px] text-fg-2">
            Built with React, Leaflet, Recharts, Radix UI, Tailwind CSS and Lucide icons. Typefaces: Instrument Sans and IBM Plex
            Mono. Interface and code were produced with AI assistance. Dataset credits are listed with each source above and will
            be completed with product IDs, checksums and retrieval dates when the data is ingested
          </p>
        </Block>
      </div>
    </div>
  )
}
