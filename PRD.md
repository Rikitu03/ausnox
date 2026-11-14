# AUSNOX — PRODUCT REQUIREMENTS DOCUMENT (PRD)
Version: 1.0 | 2026-11-14 | Scope: NASA Space Apps 2026 MVP

## 1. Problem and value proposition

Mars observations exist in different missions, resolutions, coordinate conventions and archives. A planning user cannot infer a scientifically defensible Marswalk route from a pretty orbital photograph alone. Ausnox layers **documented imagery, elevation and scientific context** into a round-trip exploration planner; it exposes trade-offs and uncertainty rather than falsely predicting safety.

Success means an observer can use a real map to pick a research target, generate a traversable route, see terrain costs, alter a mission assumption, and understand why the resulting feasibility changes.

## 2. Audience and jobs to be done

**Primary:** hypothetical NASA/mission-control planner constructing a sample EVA. **Secondary:** astronaut-in-training/public science learner viewing the plan. No actual NASA operational affiliation is implied.

Jobs: inspect a Martian location; identify which observations are measured; set editable start/destination; compare route modes; plan science stop(s); validate daylight and time budget; understand missing data; demonstrate the choice to a reviewer.

## 3. MVP user journey

1. Land in **Jezero sample mission**; fictional habitat and cited science targets are shown, with "simulation" labels.
2. Inspect layers: HiRISE/CTX imagery, DEM/slope and at least one clearly identified additional NASA mission dataset where available.
3. Click "Set habitat", pick any eligible cell. Click a destination or choose an evidenced science target. Map coordinates and height are shown.
4. Add an optional science activity with explicit duration (no fixed imaginary geology claim).
5. Compare **shortest traversable** and **lower-slope** modes; inspect outbound and return legs and terrain elevation profile.
6. View mission duration and safe-return margin; optional advanced panel adjusts speed, max slope, reserve, science-stop duration and simulated seasonal scenario.
7. Start/pause/step mission time; see margin updates, explicit warnings, feasibility state.
8. Read dataset provenance for layers and simulation assumptions. If permitted, export mission JSON (P1).

## 4. Functional requirements and acceptance

| ID | Priority | Requirement | Testable acceptance |
| --- | --- | --- | --- |
| FR-01 | P0 | Georeferenced Jezero map | Imagery, pins, DEM footprint and route use same Mars CRS and pass alignment checks |
| FR-02 | P0 | Layer manager | User toggles map, elevation/slope and at least two NASA-mission inputs; clear legend/source |
| FR-03 | P0 | DEM validity | Valid pixels retain elevation; nodata are unknown/blocked; slope from measured raster |
| FR-04 | P0 | Place points freely | Any valid grid cell eligible; invalid/outside point rejected with explanation |
| FR-05 | P0 | Science targets | Only cited georeferenced targets; no invented "real" coordinates or mineral claims |
| FR-06 | P0 | A* outbound | Produces connected legal path, distance, elevation and slope metrics or explicit "no route" |
| FR-07 | P0 | A* return | Computed independently, not assumed to equal outward path; returned path ends at habitat |
| FR-08 | P0 | Modes | Shortest vs lower-slope penalty produces deterministic behavior on fixtures |
| FR-09 | P0 | Time budget | Total duration includes both legs plus science stops; reserve treated separately and explicitly |
| FR-10 | P0 | Mars solar model | Local solar/seasonal calculations match NASA worked examples within specified tolerances |
| FR-11 | P0 | Simulated clock | Start/pause/step/scrub; independent of actual telemetry; stale plans recomputed |
| FR-12 | P0 | Feasibility states | feasible / infeasible / indeterminate; explains binding constraints |
| FR-13 | P0 | Provenance | Every measurement, layer and derived figure exposes dataset, spatial scope and type |
| FR-14 | P0 | Unknowns | No data, failed tiles, unsupported coordinate and model errors are distinctly shown |
| FR-15 | P0 | Responsive accessible UI | Full workflow desktop and 768px tablet; keyboard usable; status not color alone |
| FR-16 | P0 | Demo readiness | One end-to-end sample mission works on production static site without backend |
| FR-17 | P1 | Historic weather/thermal context | Source, timestamps, rover locality and no forecast implication |
| FR-18 | P1 | 3D exploration | Georeferenced terrain, correct Mars ellipsoid/height datum, graceful 2D fallback |
| FR-19 | P1 | Import/export | Versioned, validated mission JSON; no browser security-sensitive storage |
| FR-20 | Later | Multi-EVA and life support | Excluded from this hackathon release |

FR-02 specifically requires **a credible multi-mission integrated view**, not just two adjacent NASA logos. A HiRISE-derived USGS DEM is MRO-derived; MOLA from MGS is a distinct mission. THEMIS from Mars Odyssey strengthens integration only when truly displayed or otherwise used.

## 5. Requirements by state

**No route / invalid location:** tell user whether origin/destination is outside coverage, nodata, too steep, disconnected or no paths found. Do not silently move a selected point; request confirmation before nearest valid-cell snapping.

**Feasible:** both legs and tasks have computed, nonnegative margin after reserve using enabled, valid constraints; display "Feasible under selected assumptions" (not "safe").

**Infeasible:** compute/report violated daylight, travel-time, or terrain constraint, even if a line is drawable.

**Indeterminate:** required data/model missing or unreliable; prohibit "feasible" badge.

**Provider failure:** local DEM remains usable if cached; base imagery fallback only if licensed, with degraded status.

**Simulation:** clock starts paused and declares simulated time, sol/Ls assumptions and speed multiplier. Avoid live-looking fake weather, radiation or life support.

## 6. Business and nonfunctional requirements

- **No monetary dependence:** zero paid runtime; no login, backend, credit-card-backed service, database or AI inference required to demonstrate.
- **Performance targets (goals, not claims):** <= 5 MB compressed initial scientific payload if practical; route computation < 2 seconds on representative laptop at chosen grid size; map responsive; no uncontrolled memory use.
- **Access:** site usable with keyboard; focus-visible indicators; WCAG AA color contrast target; controls at least 44px tall when feasible; motion-reduction support.
- **Privacy:** no user account or personal location; no analytics by default; local mission settings only.
- **Maintainability:** strict TypeScript, typed schemas, testable pure computational functions; data-production scripts deterministic and logged.
- **Scientific integrity:** all transformed values traceable to source files and assumptions, with recorded date/version.

## 7. Success metrics for judging/demo

A reviewer can: (a) distinguish real measurements vs simulations, (b) inspect two mission datasets on one map, (c) place two valid points, (d) get round-trip route/elevation summary, (e) see shortest vs lower-slope tradeoff, (f) make an example mission infeasible by changing stop time or speed, and (g) find precise source citations. Missing data never yields fabricated results.

## 8. Assumptions and exclusions

No observed habitat exists at the demo start; treat it as hypothetical. No scientifically validated spacesuit resources or terrain load-bearing predictions. Global MOLA cannot justify boulder-scale safe walking. THEMIS IR brightness is not an operational air-temperature forecast. MEDA weather from one rover is not weather across Jezero and MEDA is not the rover's ionizing radiation dosimeter. Detailed shadow casting and historical weather are P1 or later.

## 9. Open verification items (not pending user decisions)

- Identify exact DEM product, license, confidence mask, download path and reachable AOI; record in DATA_SOURCES.md.
- Verify accepted NASA source appears on this challenge's official Resources tab.
- Validate map tile WMTS endpoint/client CORS and any permitted caching.
- Inspect supplied Figma if access becomes available; user grants redesign latitude.
- Confirm submission portal conditions and record final working demo evidence.

All unknowns are engineering verification tasks; do not default them to "done."
