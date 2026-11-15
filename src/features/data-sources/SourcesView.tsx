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

const METHODS: { title: string; kind: BadgeKind; body: string; now: Record<'mock' | 'real', string> }[] = [
  {
    title: 'Slope',
    kind: 'derived',
    body: 'Slope per cell is atan of the gradient magnitude, with Horn (1981) gradients over the 3 × 3 neighbourhood in physical metres (east-west cell width shrinks with cos latitude). A cell is unknown, and never routed through, when it or any neighbour lacks elevation.',
    now: {
      mock: 'Runs today, but on the synthetic demo surface.',
      real: 'Computed by the Python pipeline from the USGS HiRISE DTM and shipped in terrain.bin; matched by an independent recomputation to 1.6e-6° (gate S3).',
    },
  },
  {
    title: 'Routing',
    kind: 'derived',
    body: 'A* over the terrain grid with eight neighbours, no corner cutting, cells without data or above the slope limit forbidden. Shortest mode minimises distance. Lower-slope mode multiplies distance by 1 + 4 × (slope / limit)², a preference score rather than energy. The return leg is searched on its own.',
    now: {
      mock: 'Not implemented. The app draws the best of seven fixed arcs per segment and labels them as demonstration geometry.',
      real: 'Runs in a Web Worker on the 2 m Jezero grid (scientific engine, gates R1–R4 passed). Distances are ground metres on the Mars sphere.',
    },
  },
  {
    title: 'Walking time',
    kind: 'simulated',
    body: 'Leg time is the 3-D surface length of the path divided by a constant walking speed. Mission duration is all legs plus science stops. The reserve is tracked separately.',
    now: {
      mock: 'Runs today as plain arithmetic over the demonstration route.',
      real: 'Computed by the scientific engine from the A* route; the walking speed is an illustrative assumption.',
    },
  },
  {
    title: 'Daylight',
    kind: 'derived',
    body: `Local true solar time, sunrise and sunset from the NASA GISS Mars24 equations at the habitat. One sol is ${SOL_SECONDS.toLocaleString('en-US')} Earth seconds, and Mars clock hours are converted to Earth seconds before any sum with walking time. A modelled sky, not a weather forecast.`,
    now: {
      mock: 'Not implemented. Fixed demonstration sunrise and sunset times are used. The sol-length conversion is real.',
      real: "Mars24 in the scientific engine, checked against NASA's two worked examples: local true solar time within 0.19 s, angles within 0.00065° (gate M1).",
    },
  },
  {
    title: 'Feasibility',
    kind: 'simulated',
    body: 'Return margin is the time left before the window closes (geometric sunset, or the EVA limit) minus remaining work minus reserve. Feasible needs a verified terrain grid, a legal round trip, a start in daylight and a margin of zero or more. A violated known constraint gives infeasible. Any missing route, terrain or daylight input gives indeterminate.',
    now: {
      mock: 'Runs today over demonstration inputs, so the verdict is a demonstration.',
      real: 'Computed by the scientific engine on its own route and daylight results (gates M2, M3 passed). Constraints are illustrative.',
    },
  },
]

const UNCERTAINTY_COMMON = [
  'Sunrise and sunset are geometric: flat horizon, no terrain shadow, no dust, no refraction',
  'A constant walking speed ignores slope, suit, fatigue and surface. Real traverse times would differ',
  'No weather, radiation, communication or life-support model exists in this app',
]

const UNCERTAINTY: Record<'mock' | 'real', string[]> = {
  mock: [
    'Terrain cells are metres wide. Rocks, sand and footing hazards smaller than a cell are invisible to slope',
    ...UNCERTAINTY_COMMON,
    'Datasets from different missions use different grids and vertical datums and are not combined numerically',
  ],
  real: [
    'Unresolved (check X2b failed): the HiRISE DTM and the HiRISE imagery appear offset by 2.3 to 3.2 m east. Routes and slope are aligned with the DTM; over imagery they may look shifted by up to about 3 m. No correction is applied',
    'Cells are 2 m (1.90 m east-west on the ground) and slope uses a ~4 m baseline. Rocks, steps, sand and footing are invisible to it. HiRISE DTM artefacts may be present',
    'Terrain covers one 2.43 km² area of the Jezero delta front. Points outside it have no elevation or slope and cannot be routed',
    'The outer ring of cells has measured elevation but unknown slope, and is never routed through',
    'Science targets are Perseverance rover positions, not the exact rock or sample tube. Skinner Ridge sits on a 20.8° cell, above the default 15° limit',
    ...UNCERTAINTY_COMMON,
    'MOLA, CTX and HiRISE layers use different resolutions; MOLA and CTX are context imagery only and are never mixed with the DTM numerically',
  ],
}

/** Runtime network dependencies of the real build (docs/INTEGRATION_REPORT.md §9). */
const SERVICES = [
  {
    name: 'Bundled Jezero terrain assets',
    detail: 'manifest.json, terrain.bin (5.76 MB), coverage and science-target GeoJSON, served with the app. No account, key or server code',
  },
  {
    name: 'NASA/JPL Mars Trek WMTS tiles',
    detail: 'HiRISE, CTX and MOLA imagery fetched directly by the browser from trek.nasa.gov. Public, no API key, CORS open. If unreachable, the layer is marked unavailable and the DTM relief can be used instead',
  },
  {
    name: 'Everything else',
    detail: 'Routing, Mars24 and feasibility run in your browser. No backend, no analytics, no environment variables',
  },
]

export function SourcesView() {
  const records = services.mapData.listProvenance()
  const demo = services.demo
  const [scenario, setScenario] = useState(demo?.get() ?? 'nominal')
  const init = useDataStore((s) => s.init)
  const terrainError = useDataStore((s) => s.terrainError)
  const manifest = useDataStore((s) => s.manifest)
  const x2b = manifest?.verification?.crossValidation?.checks.find((c) => c.status !== 'PASS')
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
          <h1 className="text-[28px] leading-9 font-semibold tracking-tight">Data sources and methods</h1>
          <p className="mt-2 max-w-[68ch] text-[13px] text-fg-2">
            What Ausnox is built to use, what it shows today, and how far each number can be trusted. Ausnox is a NASA Space Apps
            2026 project. It is not endorsed by NASA
          </p>
        </header>

        {dataMode === 'mock' ? (
          <StatusAlert tone="info" title="Running on demonstration data">
            No NASA or USGS dataset is loaded in this build. The map shows a synthetic surface, routes are demonstration arcs and
            daylight times are fixed examples. Everything served this way is labelled Illustrative
          </StatusAlert>
        ) : terrainError ? (
          <StatusAlert tone="bad" title="Real terrain could not be loaded">
            {terrainError.detail}. Nothing is estimated in its place, so placement, routing and feasibility are unavailable
          </StatusAlert>
        ) : (
          <StatusAlert tone="info" title="Running on real NASA and USGS data with the Ausnox scientific engine">
            Terrain: USGS HiRISE DTM of Jezero crater (MRO), verified at load
            {manifest?.verification?.checksum === 'verified' ? ' by SHA-256' : ''}. Imagery: NASA Mars Trek (MRO HiRISE and CTX,
            MGS MOLA). Science targets: Perseverance (Mars 2020) rover positions. Routes, daylight and feasibility come from the
            scientific engine. Mission constraints are illustrative.
            {x2b ? ` Open finding: ${x2b.id} ${x2b.status}, overlay registration ±3 m.` : ''}
          </StatusAlert>
        )}

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
                  <h3 className="mt-3 text-base font-semibold">{r.title}</h3>
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
                  <h3 className="text-base font-semibold">{m.title}</h3>
                  <KindBadge kind={m.kind} />
                </div>
                <p className="mt-2 text-[13px] text-fg-2">{m.body}</p>
                <p className="mt-3 border-t border-line pt-3 text-[13px]">
                  <span className="text-fg-3">In this build: </span>
                  {m.now[dataMode]}
                </p>
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Scientific uncertainty">
          <ul className="max-w-[78ch] space-y-2 text-[13px] text-fg-2">
            {UNCERTAINTY[dataMode].map((u) => (
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

        {dataMode === 'real' && (
          <Block title="Network services and access" intro="What this build contacts at runtime. None of it needs an account, key or backend">
            <ul className="grid gap-4 md:grid-cols-3">
              {SERVICES.map((s) => (
                <li key={s.name} className="rounded-panel border border-line bg-surface p-5">
                  <h3 className="text-base font-semibold">{s.name}</h3>
                  <p className="mt-2 text-[13px] text-fg-2">{s.detail}</p>
                </li>
              ))}
            </ul>
          </Block>
        )}

        <Block title="3D terrain view" intro="An optional view of the same verified elevation model">
          <p className="max-w-[78ch] text-[13px] text-fg-2">
            The cube control opens the validated elevation model in 3D, with relief, elevation and slope styles. Vertical
            exaggeration is labelled and changes only the display. Routes and measurements use the original terrain grid.
            A 2D fallback is available if WebGL cannot run. Imagery draping is not implemented
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
            Built with React, Three.js, Leaflet, Recharts, Radix UI, Tailwind CSS and Lucide icons. Typefaces: Instrument Sans and
            IBM Plex Mono. OpenAI GPT models, OpenAI Codex and Anthropic Claude Code assisted planning, interface/code,
            documentation and verification. This describes development assistance; the NASA/USGS observations are authentic.
            Terrain derivatives, calculated routes/daylight and simulated mission assumptions are distinct. Dataset credits are
            listed with each source above. Product IDs, checksums and retrieval dates are recorded in the shipped terrain
            manifest and in docs/DATA_SOURCES.md
          </p>
          <p className="mt-3 max-w-[78ch] text-[13px] text-fg-2">
            <a className="underline underline-offset-4" href="https://github.com/Rikitu03/ausnox/blob/chore/nasa-space-apps-compliance/docs/AI_USAGE.md" target="_blank" rel="noreferrer">AI usage and validation limits</a>
            {' · '}
            <a className="underline underline-offset-4" href="https://github.com/Rikitu03/ausnox/blob/chore/nasa-space-apps-compliance/docs/SI_DISCLOSURE.json" target="_blank" rel="noreferrer">SI metadata</a>
            {' · '}
            <a className="underline underline-offset-4" href="https://github.com/Rikitu03/ausnox/blob/chore/nasa-space-apps-compliance/docs/THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer">Resource and license register</a>
            {' · '}
            <a className="underline underline-offset-4" href="/THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer">Software and font license texts</a>
          </p>
        </Block>
      </div>
    </div>
  )
}
