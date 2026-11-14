# AUSNOX — AGENT-READY IMPLEMENTATION PLAN
Version: 1.0 | Start 2026-11-14 | Solo developer / 8–12 hours target

## 0. Work rules

Follow AGENT_GUIDELINES.md, scientific/source rules and all acceptance criteria. **No feature can be marked complete merely because a mock UI or placeholder returned success.** Only files in the current project should be changed; work is staged in dependency order, tested before next stage, with no unnecessary paid service. User authorized main publishing **for these documentation files**; future code-branch strategy requires explicit direction, so don't assume unrestricted commits to main.

Use a running evidence log in commit notes/README status with observed commands and outputs. Re-run tests on any changes.

## G0 — preflight and eligibility (critical; ~30 min)

- [ ] Read all root docs and inspect repo before scaffolding. Confirm node/npm/python/gdal tooling.
- [ ] Read official 2026 Martian Map challenge Details/Resources: https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=resources
- [ ] Select at least one NASA resource that is **actually on the challenge's Resources list**, and record citation/why it meets requirements.
- [ ] Inspect Figma if permission permits; coordinate with Fable. Otherwise log UI reference unverified and proceed from UI_UX_SPEC.md.
- [ ] Protect docs during project initialization; do not overwrite existing README/MD files or run destructive root scaffolding.
- [ ] Create running source register and list all API limits and asset permissions.

**Exit:** clear eligibility-source plan and no docs overwritten.

## G1 — source and DEM data validation (CRITICAL PATH, ~1–2 h)

- [ ] Download **real** sample Jezero DTM/DEM from source in DATA_SOURCES.md. If 2025 USGS release is impractically large or doesn't cover chosen science site, locate another authentic published Jezero DEM and cite it.
- [ ] Save original outside Git; compute SHA256; capture gdalinfo -json, geographic extent, CRS/vertical datum, pixel size, nodata/confidence.
- [ ] Find usable Mars Trek imagery coverage and check intersection with selected DEM. Do not use hardcoded fabricated point coordinates.
- [ ] Define a small projected-meter AOI (e.g. ~1–2 km width only if real coverage supports it); retain source resolution or legitimately coarsen.
- [ ] Implement scripts/build_terrain.py and scripts/validate_terrain.py; compute nodata-aware slope, masks, GeoJSON footprint, manifest.
- [ ] Verify one known point using source raster and transformed screen coordinates; compare elevation with direct raster sampling.
- [ ] Build test fixtures from real AOI, plus synthetic **unit-test-only** grids; do not serve synthetic runtime terrain disguised as observed.

**Hard stop:** if real DEM validation fails, don't ship route planning as real-data functionality. Reduce AOI, substitute a **different real source**, or report P0 not complete.

**Exit artifact:** source-backed AOI with checksums, reproducible generation, aligned imagery, valid mask, measured slope.

## G2 — establish app scaffold + map (~1–1.5 h)

- [ ] Initialize Vite React+TS without deleting docs; install and pin dependency versions.
- [ ] Setup static hosting paths, Leaflet Mars CRS/WMTS matrix mapping; test with live GetCapabilities and CORS.
- [ ] Render the selected AOI imagery, DEM coverage boundary, markers, legend, slope overlay and dataset card.
- [ ] Bundle small compliant imagery fallback; never cache indiscriminately against provider terms.
- [ ] Allow users to freely place habitat/destination inside valid raster grid via click or coordinate input; reject invalids with feedback.
- [ ] Verify no route can start outside DEM or on nodata.

**Exit:** georeferenced clickable map backed by real imagery and DEM.

## G3 — pathfinding + mission stops (~2–2.5 h)

- [ ] Implement pure terrain-grid API with projected meter distances, validity and slope classification.
- [ ] Build A* with priority queue, admissible heuristic, deterministic tie-breaking, corner-cut prevention, failure codes and cancellable worker.
- [ ] Produce shortest-distance and lower-slope mode, explaining differing route cost; support optional stop in fixed order.
- [ ] Compute **outbound and return** paths independently; derive path distances/elevations and ascent/descent.
- [ ] Never return feasible if path missing. Profile and set bounded grid/payload size.
- [ ] Unit test with known flat/slope/masked grids, ties, bounds, no-path, asymmetric return, negative cases and actual AOI sanity.

**Exit:** two tested real-data route alternatives and complete round-trip geometry.

## G4 — Mars24 solar + time margin (~1.5–2 h)

- [ ] Implement Mars24 equations with explicit TT/UTC and longitude convention.
- [ ] Validate NASA Mars24 published worked examples including local true solar time and solar angle tolerances.
- [ ] Calculate geometric sunrise/sunset and properly convert Mars clock units to Earth elapsed seconds.
- [ ] Build pause/start/step/accelerate simulation. Show source date/season and approximation warning.
- [ ] Model mission travel + science stop + reserved minutes; feasible/infeasible/indeterminate based on actual known constraints and enabled inputs.
- [ ] Ensure changing speed, stops, time or route invalidates stale feasibility; a negative margin becomes an explained warning.

**Exit:** deterministic day/night model and contrasting feasible/infeasible demo.

## G5 — end-to-end UX, design and accessibility (~1–1.5 h)

- [ ] Build desktop map-first layout and tablet panel behavior; integrate Fable visuals if available without changing scientific contracts.
- [ ] Include initial *fictional* sample scenario with valid in-bounds points and cited science target (or clearly illustrative sampling location if no documented target lies in AOI).
- [ ] Advanced assumptions hidden by default but accessible.
- [ ] Display provenance per layer and result: Observed/Derived/Simulated/Unknown.
- [ ] Implement failure/loading/no-data/provider-offline states and functional keyboard access.
- [ ] Ensure map, routes, margins and labels work without a 3D view.

**Exit:** a human can run the complete scenario without developer assistance.

## G6 — release gate, demo and submission (~1.5–2 h)

- [ ] Typecheck/lint/unit tests/build; show executed results, not aspirational status.
- [ ] Manually test runtime site, desktop/tablet, invalid inputs, offline imagery, missing scientific source, no route and daylight violation.
- [ ] Verify app without paid API or backend; map geospatial registration and dataset provenance.
- [ ] Update README with actual setup, deployed URL, dataset/license credits, demo limitations and what is implemented.
- [ ] Capture 60–120s demonstration and screenshots: choose target → inspect source → generate shortest and lower-slope → change assumption → feasibility warning.
- [ ] Confirm official eligibility-source reference and list all NASA sources and tools in Space Apps submission.
- [ ] Reconfirm submission deadlines/timezone directly on event portal before the final submission.

**Exit:** every mandatory checkbox in TESTING_AND_VALIDATION.md verified. Do not call P0 complete if any scientific gate failed.

## G7 — 3D stretch, only if G0–G6 are complete

- [ ] Prefer georeferenced 3D heightmesh from **same verified cropped DEM** for portability; alternatively evaluate Cesium Mars Community access/license and proper Mars ellipsoid.
- [ ] Display matching waypoints/routes and elevation units; limit exaggeration and label it.
- [ ] Show 3D toggle with fallback preserving current 2D mission, viewport and coordinate.
- [ ] Re-run regression tests and deployed smoke test. If 3D creates regression, disable/revert it.

3D is a **priority stretch** because it may improve the demo, but it is not an excuse to present fake terrain or skip the final release checks.

## 8. Submission storytelling script

"NASA's datasets are powerful, but distributed. Ausnox combines orbital imagery, terrain elevation and solar models to plan a science route at Jezero. Here's the shorter route. Here's the lower-slope alternative. Now I add sampling time / slow our astronaut: the modeled return margin becomes insufficient. The system shows which observations are real, which calculations are derived, and which values are simulated."

## 9. Hand-off output format for every agent stage

~~~text
STAGE:
FILES CHANGED:
DATA SOURCE + URL + HASH (if applicable):
COMMANDS RUN + OBSERVED RESULTS:
WHAT WORKS / WHAT DOES NOT:
TESTS PASSED / FAILED:
SCIENTIFIC ASSUMPTIONS:
NEXT DEPENDENCY / BLOCKERS:
~~~

Never mark unknown findings as passes. The user is solo; keep reports brief, evidence-rich and executable.
