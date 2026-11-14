# AUSNOX — MVP MASTERPLAN
Version: 1.0 | 2026-11-14 | Status: approved scope, not implemented

## 1. Mission and intended outcome

Build a science-grounded **Interplanetary Survival Guide: Martian Map** demonstration where a mission-control planner selects a habitat and science destination in Jezero Crater, compares terrain-aware outbound/return walking routes, and evaluates daylight plus modeled EVA time constraints. The one-sentence demo: **NASA observations change a Marswalk decision.**

This is an educational simulation, not certified human-exploration or emergency navigation software. A result marked "feasible under selected assumptions" is never a claim of safety on Mars.

## 2. Decisions already approved

| Topic | Binding decision |
| --- | --- |
| Team | One human developer, optionally assisted by coding/design agents |
| Repository | Rikitu03/ausnox; user authorized publishing documentation directly to main |
| Priority | Real, functional scientific MVP ahead of visual spectacle |
| Persona | Mission-control planner; hypothetical astronaut EVA as simulation |
| Geography | Jezero Crater; route only within verified high-resolution DEM coverage |
| Map | 2D-first, multiple NASA mission layers; 3D as prioritized stretch |
| Habitat | User may click any eligible traversable cell; not limited to presets |
| Demo | Load a preconfigured illustrative mission which user can edit |
| Routing | A* shortest traversable vs lower-slope; outbound and return independently |
| Time | Mars24-derived local solar/seasonal calculations; simulated, pausable timeline |
| Safety | Complete round trip and science activities with margins and reserves; configurable advanced assumptions |
| Unknown data | Declare unavailable/unknown, never invent measurements |
| Weather | Historical environmental context later; no live Mars forecast claims |
| Persistence | Browser/session or JSON export only; no account or database needed |
| Stack | React, TypeScript, Vite, Leaflet; Python geospatial preprocessing; static-first |
| Deploy | Zero required paid runtime; use promotional offers only if genuinely needed |
| Visual | Figma reference, Fable may redesign; preserve tasks, clarity and accessibility |
| Release | Every core scientific/functional gate is mandatory even if 3D must be cut |
| Documentation | Root Markdown for an implementation agent, with evidence and stop conditions |

## 3. Challenge alignment and eligibility

Official brief: https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/

The published brief requests a **layered, integrated view of a Martian location or route drawing on data from multiple NASA science missions** to enable a meaningful Marswalk. The overview available during planning does **not** mandate 3D; treat 3D as a UX enhancement, not a substitute for integration.

**Critical administrative check (before release):** consult the exact challenge **Resources** tab; verify and record at least one NASA dataset actually used by Ausnox which appears in that list, following 2026 Space Apps eligibility guidance. The Resources tab was not fully accessible during document creation; eligibility is **unverified** until this is checked. Cite every dataset, image, third-party package and AI tool in submission.

The NASA Global Offers page is optional infrastructure/tooling, not a required science API catalog.

## 4. Scope tiers

### P0 — ship or do not claim completion
1. Obtain and validate a **real DEM** at a Jezero subset; produce measured slopes and a traversability grid, with no-data and provenance.
2. Display georeferenced Jezero imagery, terrain coverage and derived hazards; integrate **at least two distinct NASA mission sources** in a meaningful visible workflow (e.g., MRO/HiRISE and MGS/MOLA; a verified third source such as Odyssey/THEMIS strengthens the narrative).
3. Select/snap valid start and destination; reject unsupported location and missing-data areas.
4. Run tested A* in both optimization modes; calculate outbound and return routes, distances, gradients and science stop duration.
5. Compute local Martian solar time, seasonal solar elevation and an approximate daylight window using cited algorithms, with validation against NASA examples.
6. Simulated start/pause/advance mission clock and explicit margin/violation explanations; not a real-time forecast.
7. Desktop-first mission planner with tablet support, complete keyboard flows, legends, sources and graceful errors.
8. Tests, deploy, shareable live app, documented dataset trail, submission video and resource credits.

### P1 — only after all P0 gates pass
- Geographically aligned 3D terrain/exploration view (Cesium Mars if accessible and licensing verified, or a small offline heightmesh rendered from the validated DEM).
- One verified historical THEMIS/MEDA layer with timestamp and scope.
- Mission JSON export/import, more sophisticated science stops.
- Additional science layers with documented regional overlap.

### Out of scope for hackathon
Live astronaut telemetry, a real radiation forecast, dust storm prediction, rover-grade obstruction sensing, regolith load-bearing inference, certified EVA safety, global high-resolution route coverage, oxygen/battery life-support physics, authentication, multi-user collaboration, AI chat, paid always-on APIs, or arbitrary planetwide navigation.

## 5. Critical path (8–12 available development hours)

| Stage | Target budget | Exit evidence | If blocked |
| --- | --- | --- | --- |
| 0. Data and eligibility | 1–2 h | Valid DEM sample; coordinate/units/coverage checked; source registered | Narrow AOI and try a suitable older Jezero floor DEM; do not fake |
| 1. Working map | 1–1.5 h | Map and overlays geographically aligned; offline fallback | Use local authorized imagery; no misplaced tiles |
| 2. Pathfinding | 2–2.5 h | Two distinct A* results on real DEM grid; tests | Reduce crop/grid size; optimize without fabricating |
| 3. Solar + mission | 1.5–2 h | Mars24 benchmark checks and feasible/infeasible scenarios | Reduce animation, retain correct equations |
| 4. UI and usability | 1–1.5 h | End-to-end mission planner on desktop/tablet | Simplify panels, not provenance/warnings |
| 5. Release and submission | 1.5–2 h | Built/deployed/demo recorded; citations and submission checklist | Stop stretch work immediately |

Budgets are planning allocations, not promises. Track actual time and move to core deliverables, not new features, when constrained. Do not promise background work.

## 6. Non-negotiable kill switches

- **P0 data failure:** no verified DEM → routing not complete; never create disguised synthetic topography.
- **CRS or offset error:** do not release slope/route overlay until cross-check against real landmarks and raster bounds passes.
- **Solar benchmark failure:** disable the daylight-feasibility claim and report limitation until corrected.
- **No verified mission-source integration:** no claim of satisfying the challenge.
- **Insufficient time:** drop 3D, extended weather, animation and cosmetic polish before compromising validated P0.
- **Provider outage:** locally processed routes remain operable; mark imagery unavailable and show authorized fallback.
- **Unknown route data:** stop the planned route at coverage boundary or reject; do not route across unknown cells.

## 7. Definition of done

All gates in TESTING_AND_VALIDATION.md must pass; actual executed commands/results, dataset IDs, provenance, deployment URL and successful interactive demo are recorded. The project must demonstrate a change in route/margin after terrain-aware selection or science-stop adjustment. No build, deployment, scientific validation or Figma review is claimed until observed.

## 8. Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Large/high-friction DEM download | Critical | Crop one small AOI, archive source URL, avoid large binary in Git |
| Incompatible Mars CRSs | Critical | GDAL inspection and explicit conversion; no Earth defaults |
| Dataset footprints don't overlap | Critical | Check intersection BEFORE choosing habitat or target |
| Pathfinding/sol time inaccuracies | Critical | Deterministic fixtures, NASA Mars24 worked examples |
| Third-party WMTS unavailable/CORS | High | Local cropped visual fallback with attribution |
| AI agent invents mock data | High | Mandatory provenance schema and stop rule |
| Figma file inaccessible | Medium | UI functional contract remains implementable; design review when access fixed |
| Stretch 3D breaks deadlines | High | 3D strictly gated after P0 passing |
| Cloud credit expires/billing | Medium | Static hosting; no paid runtime dependency |

See IMPLEMENTATION_PLAN.md for exact tickets and AGENT_GUIDELINES.md for agent conduct.
