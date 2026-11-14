# AUSNOX

**Navigating the Red Planet from Dawn to Dusk.**

**Status (2026-11-14): planning/documentation only.** This repository has not yet implemented an application, verified an ingest pipeline, or deployed a demo. Do not represent specifications as completed work.

Ausnox is a proposed, science-grounded Marswalk mission-planning prototype for **NASA Space Apps Challenge 2026 — Interplanetary Survival Guide: Martian Map**. Its primary persona is a hypothetical mission-control planner. The app will combine real NASA/USGS Martian imagery and elevation with transparent, simulated EVA assumptions to compare round-trip science routes and daylight/mission time margins. **This is an educational research prototype, not flight-qualified navigation or astronaut safety guidance.**

Official challenge: https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/

## The committed MVP

- **Jezero-only routing** inside a verified high-resolution DEM footprint; broader Mars exploration may be view-only.
- **Real geospatial data**: NASA mission imagery plus DEM-derived elevation and slope; missing cells must remain unknown, never flattened or invented.
- **Layered 2D map** with multiple NASA mission sources, dataset provenance, scientific targets, and clear coverage.
- User-placed habitat and science destination within valid cells, optional stop(s), and explicit outward **and return** path.
- **A*** with shortest-distance and lower-slope modes; infeasible and unknown routes are not called safe.
- Astronomically modeled daylight with a simulated, pausable mission clock; visible remaining return margin and the assumptions behind it.
- Responsive desktop-first dashboard, tablet usable, no login or required database; static-first deployment with offline-ready local processed route data.

**3D**: desirable stretch feature, not a release gate. The published challenge overview requests a layered, integrated Martian map; it does not expressly demand a 3D globe. If time permits, add a georeferenced 3D view without sacrificing the validated 2D workflow.

## Documentation (repository root)

| Read first | Purpose |
| --- | --- |
| [MASTERPLAN.md](MASTERPLAN.md) | Scope, milestones, kill switches and priorities |
| [PRD.md](PRD.md) | Requirements, personas, stories and acceptance criteria |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Static-first system design, schemas and boundaries |
| [DATA_SOURCES.md](DATA_SOURCES.md) | Candidate datasets, provenance, access and licensing checks |
| [SCIENTIFIC_MODELS.md](SCIENTIFIC_MODELS.md) | Mars coordinates, A*, slope, mission and solar models |
| [UI_UX_SPEC.md](UI_UX_SPEC.md) | UX behavior, states, accessibility and Figma handoff |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Agent-ready dependency-ordered work packages |
| [TESTING_AND_VALIDATION.md](TESTING_AND_VALIDATION.md) | Scientific correctness, unit, integration and release gates |
| [AGENT_GUIDELINES.md](AGENT_GUIDELINES.md) | Non-negotiable rules for AI coding agents |

## Quick start (planned, NOT yet runnable)

Proposed implementation: React + TypeScript + Vite + Leaflet + Tailwind/shadcn; TypeScript browser A* and solar simulation; Python + Rasterio/NumPy data preprocessing. Static hosting can use Vercel. Details and environment contracts are in ARCHITECTURE.md.

**Do not run destructive scaffolding commands against these root documents.** An agent must initialize Vite without overwriting this documentation, then establish actual commands, install dependencies, and update this section based on verified output. Until then, no npm, Python, or deployment success is claimed.

## Primary development order

1. Read AGENT_GUIDELINES.md and all ten root files.
2. Inspect the linked Figma draft if access allows; Fable may redesign while retaining task flows.
3. Confirm at least one NASA data source explicitly listed in the challenge's **Resources** tab; document evidence and credits.
4. **P0 data gate**: acquire a real Jezero DEM; validate CRS, geographic extent, nodata, units, slopes and overlap with imagery. No fake DEM substitution.
5. Build functioning georeferenced 2D map, real-data routing, Mars-time and mission feasibility.
6. Execute the full testing/release checklist, deploy and record the live demo.
7. Only then attempt optional 3D or environmental layers.

## Important limits

The initial habitat is fictional; no live astronauts or shelters are tracked. Walking speeds, traversal thresholds and EVA reserves are illustrative user-adjustable assumptions, **not NASA operational values**. MEDA is a localized historic meteorology source and not an operational Jezero-wide forecast or astronaut ionizing-radiation sensor. THEMIS infrared mosaics are contextual historical observations, not real-time temperature or a sunset forecast.

## Links

- NASA Mars Trek WMTS: https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars
- USGS Jezero HiRISE DTM release: https://www.usgs.gov/data/mars-sample-return-hirise-mosaics-terrain-relative-navigation
- NASA Mars24 calculation reference: https://www.giss.nasa.gov/tools/mars24/help/algorithm.html
- NASA Space Apps 2026 Global Offers (optional, not data requirements): https://www.spaceappschallenge.org/2026/global-offers/
- Figma MARS draft (reference only; may require access): https://www.figma.com/design/EejtJslZYEA3RTeYntsURR/MARS?node-id=0-1

## Attribution and eligibility

Before final submission, verify that **at least one NASA resource used by Ausnox is listed in the challenge's own Resources tab**, and cite **every** scientific dataset, image, dependency, third-party asset and AI tool in the project submission. Record versions, licenses and retrieval dates in DATA_SOURCES.md. The connected Figma file could not be inspected using the available integration at documentation time; do not claim design-to-code parity until reviewed.

Documentation drafted on 2026-11-14 from the project brief and user-approved decisions; implementation statuses must be updated with evidence, not assumptions.
