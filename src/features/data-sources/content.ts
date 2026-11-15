/**
 * Copy for the Data sources page, kept apart from the layout. Every entry has a short plain-language
 * line for first reading and a technical line that only appears on request.
 *
 * Audited against the code: the 3D terrain viewer (src/components/map/three) is implemented; Mars Trek
 * imagery is probed per session; routing, Mars24 and feasibility run in the scientific engine in real mode.
 */
import type { LucideIcon } from 'lucide-react'
import { Box, Footprints, Mountain, Route, Scale, Sun } from 'lucide-react'
import type { BadgeKind } from '@/components/provenance/Provenance'
import { SOL_SECONDS, type DataMode } from '@/services'

export interface Method {
  id: string
  title: string
  icon: LucideIcon
  kind: BadgeKind
  /** One sentence a non-specialist can read. */
  summary: string
  /** Formula, parameters and edge cases. */
  technical: string
  /** What runs in this build, including validation gates. */
  now: Record<DataMode, string>
  /** Provenance record that backs it, if any. */
  provenanceId?: string
}

export const METHODS: Method[] = [
  {
    id: 'terrain',
    title: 'Terrain processing',
    icon: Mountain,
    kind: 'derived',
    summary: 'Turns measured elevation into a slope for every 2 m cell. Cells with missing data are never walked through.',
    technical:
      'Slope per cell is atan of the gradient magnitude, with Horn (1981) gradients over the 3 × 3 neighbourhood in physical metres (east-west cell width shrinks with cos latitude). A cell is unknown, and never routed through, when it or any neighbour lacks elevation.',
    now: {
      mock: 'Runs on the synthetic demo surface.',
      real: 'Computed by the Python pipeline from the USGS HiRISE DTM and shipped in terrain.bin. An independent recomputation matches to 1.6e-6° (gate S3).',
    },
    provenanceId: 'dem-slope',
  },
  {
    id: 'routing',
    title: 'A* routing',
    icon: Route,
    kind: 'derived',
    summary: 'Searches the slope grid for the shortest walkable path, or one that prefers gentler ground. The return leg is planned separately.',
    technical:
      'A* over the terrain grid with eight neighbours, no corner cutting, cells without data or above the slope limit forbidden. Shortest mode minimises distance. Lower-slope mode multiplies distance by 1 + 4 × (slope / limit)², a preference score rather than energy.',
    now: {
      mock: 'Not implemented. The app draws the best of seven fixed arcs per segment and labels them as demonstration geometry.',
      real: 'Runs in a Web Worker on the 2 m Jezero grid (scientific engine, gates R1–R4 passed). Distances are ground metres on the Mars sphere.',
    },
    provenanceId: 'route-geometry',
  },
  {
    id: 'daylight',
    title: 'Daylight',
    icon: Sun,
    kind: 'derived',
    summary: 'Calculates local solar time, sunrise and sunset at the habitat with NASA’s Mars24 equations. A modelled sky, not a forecast.',
    technical: `Local true solar time, sunrise and sunset from the NASA GISS Mars24 equations at the habitat. One sol is ${SOL_SECONDS.toLocaleString('en-US')} Earth seconds, and Mars clock hours are converted to Earth seconds before any sum with walking time.`,
    now: {
      mock: 'Not implemented. Fixed demonstration sunrise and sunset times are used. The sol-length conversion is real.',
      real: "Mars24 in the scientific engine, checked against NASA's two worked examples: local true solar time within 0.19 s, angles within 0.00065° (gate M1).",
    },
    provenanceId: 'mars24-solar',
  },
  {
    id: 'walking',
    title: 'Walking time',
    icon: Footprints,
    kind: 'simulated',
    summary: 'Route length divided by an assumed walking speed, plus the time spent at each science stop.',
    technical:
      'Leg time is the 3-D surface length of the path divided by a constant walking speed. Mission duration is all legs plus science stops. The reserve is tracked separately.',
    now: {
      mock: 'Plain arithmetic over the demonstration route.',
      real: 'Computed by the scientific engine from the A* route. The walking speed is an illustrative assumption.',
    },
    provenanceId: 'eva-assumptions',
  },
  {
    id: 'feasibility',
    title: 'Feasibility',
    icon: Scale,
    kind: 'simulated',
    summary: 'Checks whether you can get back before sunset or the EVA limit, with your reserve intact. Missing inputs give “indeterminate”, never a guess.',
    technical:
      'Return margin is the time left before the window closes (geometric sunset, or the EVA limit) minus remaining work minus reserve. Feasible needs a verified terrain grid, a legal round trip, a start in daylight and a margin of zero or more. A violated known constraint gives infeasible. Any missing route, terrain or daylight input gives indeterminate.',
    now: {
      mock: 'Runs over demonstration inputs, so the verdict is a demonstration.',
      real: 'Computed by the scientific engine on its own route and daylight results (gates M2, M3 passed). Constraints are illustrative.',
    },
    provenanceId: 'eva-assumptions',
  },
  {
    id: 'terrain-3d',
    title: '3D terrain view',
    icon: Box,
    kind: 'derived',
    summary: 'Shows the same elevation grid as a 3D surface you can orbit. Any vertical exaggeration is labelled; measurements never change with it.',
    technical:
      'A Three.js mesh built from the validated DTM, coloured as relief (10 m contours), elevation or slope class. The display mesh is reduced for speed; every value, route and check uses the full-resolution grid. No orbital imagery is draped. Vertical scale 1×, 2× or 3× is visual only.',
    now: {
      mock: 'Draws the synthetic demo surface.',
      real: 'Draws the USGS HiRISE DTM. Routes and markers follow the full DEM; the 2D map remains the primary planning view.',
    },
    provenanceId: 'usgs-hirise-dtm',
  },
]

export type Severity = 'critical' | 'major' | 'minor'

export const SEVERITY: Record<Severity, { label: string; hint: string }> = {
  critical: { label: 'Critical', hint: 'Changes how you should read the map or results' },
  major: { label: 'Affects results', hint: 'Numbers are still computed, but carry this limit' },
  minor: { label: 'Good to know', hint: 'Scope and context of the models' },
}

export interface Limitation {
  title: string
  detail: string
  severity: Severity
}

const COMMON: Limitation[] = [
  {
    severity: 'major',
    title: 'Constant walking speed',
    detail: 'Speed ignores slope, suit, fatigue and surface. Real traverse times would differ.',
  },
  {
    severity: 'major',
    title: 'Geometric sunrise and sunset',
    detail: 'Flat horizon, no terrain shadow, no dust, no refraction.',
  },
  {
    severity: 'minor',
    title: 'No environment model',
    detail: 'No weather, radiation, communication or life-support model exists in this app.',
  },
]

export const LIMITATIONS: Record<DataMode, Limitation[]> = {
  mock: [
    {
      severity: 'critical',
      title: 'Demonstration data only',
      detail: 'The terrain is synthetic, routes are demonstration arcs and daylight times are fixed examples. Everything served this way is labelled Illustrative.',
    },
    {
      severity: 'major',
      title: 'Small hazards are invisible',
      detail: 'Terrain cells are metres wide. Rocks, sand and footing hazards smaller than a cell do not show up in slope.',
    },
    ...COMMON,
    {
      severity: 'minor',
      title: 'Datasets are not combined numerically',
      detail: 'Datasets from different missions use different grids and vertical datums.',
    },
  ],
  real: [
    {
      severity: 'major',
      title: 'Small hazards are invisible',
      detail: 'Cells are 2 m (1.90 m east-west on the ground) and slope uses a ~4 m baseline. Rocks, steps, sand and footing are invisible to it. HiRISE DTM artefacts may be present.',
    },
    {
      severity: 'major',
      title: 'One small area is covered',
      detail: 'Terrain covers one 2.43 km² area of the Jezero delta front. Points outside it have no elevation or slope and cannot be routed.',
    },
    {
      severity: 'major',
      title: 'Skinner Ridge is steeper than the default limit',
      detail: 'Its rover cell sits at 20.8°, above the default 15°. The planner offers the nearest traversable cell and waits for you to confirm.',
    },
    ...COMMON,
    {
      severity: 'minor',
      title: 'Edge cells have unknown slope',
      detail: 'The outer ring of cells has measured elevation but unknown slope, and is never routed through.',
    },
    {
      severity: 'minor',
      title: 'Science targets are rover positions',
      detail: 'Targets mark where Perseverance was, not the exact rock or sample tube.',
    },
    {
      severity: 'minor',
      title: 'Context layers stay context',
      detail: 'MOLA and CTX have different resolutions and are context imagery only. They are never mixed with the DTM numerically.',
    },
  ],
}

/** The unresolved imagery-registration finding. Always shown as critical in real mode. */
export const X2B = {
  title: 'Imagery and terrain may not line up (X2b unresolved)',
  detail:
    'The HiRISE DTM and the HiRISE imagery appear offset by 2.3 to 3.2 m east. Routes and slope are aligned with the DTM, so over imagery they may look shifted by up to about 3 m. No correction is applied. Terrain values themselves are unaffected.',
}

/** Runtime network dependencies of the real build (docs/INTEGRATION_REPORT.md §9). */
export const NETWORK = [
  {
    name: 'Bundled Jezero terrain assets',
    detail: 'manifest.json, terrain.bin (5.76 MB), coverage and science-target GeoJSON, served with the app. No account, key or server code.',
  },
  {
    name: 'NASA/JPL Mars Trek WMTS tiles',
    detail:
      'HiRISE, CTX and MOLA imagery fetched directly by the browser from trek.nasa.gov. Public, no API key, CORS open. If unreachable, the layer is marked unavailable and the DTM relief can be used instead.',
  },
  {
    name: 'Everything else runs locally',
    detail: 'Routing, Mars24, feasibility and the 3D view run in your browser. No backend, no analytics, no environment variables.',
  },
]

/** Engine validation gates that passed (docs/SCIENTIFIC_VALIDATION_REPORT.md). */
export const GATES = [
  { id: 'S3', what: 'Numeric slope: independent recomputation from source agrees to 1.64e-6°' },
  { id: 'X2a', what: 'Mars Trek tiles vs USGS orthomosaic: 0.47 m east, 0.71 m south, below one tile pixel' },
  { id: 'R1', what: 'Every A* move checked for traversability, adjacency, no corner cutting and grade' },
  { id: 'R2', what: 'Return leg searched independently; endpoints at habitat and destination' },
  { id: 'R3', what: 'Lower-slope mode cuts mean slope of the sample round trip from 4.22° to 2.40° for 20.1 m extra' },
  { id: 'R4', what: 'Missing data fails closed with a reason, never a straight-line fallback' },
  { id: 'M1', what: "Mars24 matches NASA's worked examples: 0.19 s solar time, 0.00065° angles" },
  { id: 'M2', what: 'Sol length, Mars-hour conversion and margins at −1 s, 0 s and positive' },
  { id: 'M3', what: '13 missing or invalid input cases all give indeterminate, never feasible' },
]

export const SOFTWARE =
  'Built with React, Zustand, Leaflet, Three.js, Recharts, Radix UI, Tailwind CSS and Lucide icons. Typefaces: Instrument Sans and IBM Plex Mono. OpenAI GPT models, OpenAI Codex and Anthropic Claude Code assisted planning, interface/code, documentation and verification; the NASA/USGS observations are authentic and were not generated. Full disclosure: docs/AI_USAGE.md and docs/SI_DISCLOSURE.json in the source repository.'

export const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'datasets', label: 'Datasets' },
  { id: 'methodology', label: 'Methodology' },
  { id: 'limitations', label: 'Limitations' },
  { id: 'references', label: 'References' },
] as const
