# AUSNOX — INTEGRATION REPORT

> Historical integration evidence. For the deployed release, current keyboard checks, review fixes and demonstration, see [RELEASE_REPORT.md](RELEASE_REPORT.md). Statements below such as "not deployed" describe the original integration run.

Version 1.0 | 2026-11-15 | Branch `integration/ausnox-mvp` | Statuses: **PASS / FAIL / BLOCKED / NOT RUN**

This report records how the frontend (`feat/frontend-fable`) and the scientific engine (`feat/scientific-engine`) were made into one application, and what was verified. Every result below comes from a command or browser session that was actually run on 2026-11-15 (Windows 11, Node 24.13.0, npm 11.6.2, Python 3.12.10). Historical evidence in `docs/SCIENTIFIC_VALIDATION_REPORT.md`, `scientific-pipeline/evidence/` and `packages/scientific-engine/evidence/` is unchanged.

## 1. Initial merge state

| Item | Finding |
| --- | --- |
| Branch holding the merge | `integration/ausnox-mvp` (not `main`) |
| Merge in progress | No. Two merges were already committed: `720b02a` (frontend into the branch) and `bb8dc1e` (scientific engine) |
| Unmerged index entries / conflict markers | None (`git ls-files -u` empty, `git diff --check` clean) |
| Both implementations present | Yes. Every file of both source branches is in `bb8dc1e`; the only content difference from `feat/scientific-engine` is `README.md` (frontend version kept) |
| Uncommitted work | Clean tree. The sibling worktree `../ausnox-scientific-engine` has one uncommitted line in `docs/SCIENTIFIC_ENGINE_HANDOFF.md` §12; it was left untouched there and the same correction is applied here |
| Root specifications | Relocated to `docs/` by the frontend branch; the scientific branch never modified them, so Git applied the renames. No duplicate root copies remain |

## 2. Conflict resolution

There were no textual conflicts. The merge was nevertheless not an integrated application. Logical conflicts found and fixed:

| # | Defect introduced or exposed by the merge | Fix |
| --- | --- | --- |
| 1 | `npm ci` failed: root `package-lock.json` out of sync (`@emnapi/wasi-threads@2.2.0` missing) | Lockfile regenerated with the engine dependency |
| 2 | Root `eslint .` linted the engine package (2 errors) | Engine linted with the app rules; the two findings fixed (dead assignment in `stepSimulation`, intentional `any` in a corruption test); build output ignored |
| 3 | Root `vitest` ran the engine's Node tests under jsdom (3 files failed) | Root suite scoped to `src/`; engine keeps its own suite (`npm run test:engine`) |
| 4 | The engine was not importable by the app | `"@ausnox/scientific-engine": "file:packages/scientific-engine"`, built on `postinstall` and before `vite build` |
| 5 | Real adapters were stubs answering `NOT_IMPLEMENTED` | Implemented on the engine (§4) |
| 6 | Production defaulted to mock data (`VITE_DATA_MODE` unset → mock) | Real is the default; mock only with `VITE_DATA_MODE=mock`; mock code is tree-shaken out of production |
| 7 | Map used `L.CRS.Simple` in grid metres: no Mars imagery possible | Mars equirectangular CRS (§5) |
| 8 | Sample mission used coordinates of the synthetic 4 × 3 km surface | Replaced by the engine's validated Jezero scenario (§6) |
| 9 | Contract gaps: no "slope unknown" state, no ground distance, snap search ignored the slope limit, waypoint selection bypassed validation | Contracts extended (§4); all placement paths go through one check |

## 3. Modified files

55 files changed since `bb8dc1e` (16 added, 39 modified) in three commits, plus documentation. The engine and pipeline are unchanged apart from the two lint fixes.

- Build: `package.json`, `package-lock.json`, `vite.config.ts`, `eslint.config.js`, `tsconfig*.json`, `.gitignore`, `.env.example`, `.env.mock`, `vercel.json`
- Contracts: `src/services/contracts/{common,geo,terrain,map,routing,index}.ts`
- Real adapters (new): `src/services/adapters/real/{config,context,coords,errors,terrain,routing,routeExecutor,solar,mission,mapData,render,provenance,index}.ts`, `src/workers/route.worker.ts`
- Mock adapters (contract only): `src/services/adapters/mock/{index,terrain}.ts`
- Stores and utilities: `src/stores/{dataStore,missionStore,uiStore,mapStore}.ts`, `src/utils/validation.ts`, `src/services/index.ts`
- UI: `src/components/map/{MarsMap,MapChrome}.tsx`, `src/components/{layout/TopBar,planner/MissionBlocks}.tsx`, `src/features/*/…` (planner, terrain, summary, sources, workspace), `src/app/App.tsx`
- Tests: `src/services/adapters/real/__tests__/real.integration.test.ts` (new), updates to the store, adapter and App tests, `src/test/setup.ts`

## 4. Adapter mappings (frontend contract → engine)

| Frontend | Engine | Implementation |
| --- | --- | --- |
| `TerrainService.load` | `loadTerrainDataset` | Verifies schema, Mars CRS, byte length, SHA-256 (Web Crypto), flag/NaN integrity, pipeline record. `status: 'verified'` iff `verification.verifiedForFeasibility`; verification details exposed in `TerrainManifest.verification` |
| `sample` | `sampleTerrainCell` | Engine validity `valid` / `slope-unknown` / `no-elevation` → `valid` / `slope-unknown` (new) / `nodata`; outside grid → `outside-coverage` |
| `nearestValid(p, d, maxSlope)` | `findNearestTraversableCell` | Traversable for the mission slope limit; distance re-checked from the exact point |
| `groundDistanceM` (new) | `greatCircleDistanceM` | Mars 2000 sphere |
| `RoutingService.computeRoundTrip` | `calculateRoundTrip` in a worker (`installRouteWorker`), `calculateRoundTripAsync` fallback | `waypoints` → `stops` with ids and `activityDurationS`; `datasetVersion` = grid SHA-256; vertices → `path`/`samples` in grid metres; `distanceM` = planimetric; `surfaceDistanceM` added; `waypointDistancesM` from `outbound.arrivals`; `terrainAwarePathfinding: true` |
| `SolarService.getSolarDay` | `calculateDaylightWindow`, `findUtcForSolarLongitude` | Scenarios: sol 690 (2023-01-28), sol 490 (2022-07-07), Ls 90°, Ls 270°; `lsDeg` = Ls at noon; `mars24Validated: true` (gate M1) |
| `MissionService.assess` | `evaluateMissionFeasibility`, `findUtcForLocalTrueSolarTime` | Uses the engine route and daylight objects behind the frontend results (WeakMaps). `reserveS = reserveMin·60`, `turnaroundWarningS = warningMarginMin·60`, `maxEvaDurationS = maxEvaEnabled ? maxEvaHours·3600 : null`, `daylightPolicy: 'daylight-only'`. A route or daylight value not produced by the engine is treated as missing |
| `MapDataService` | `loadScienceTargets`, `dataset.provenance`, `ENGINE_PROVENANCE_RECORDS` | Mars Trek tiles offered only after a probe tile loads; DTM relief/elevation/slope rendered from the grid; provenance IDs aliased to the frontend names (`terrain-elevation` → `usgs-hirise-dtm`, `route-astar` → `route-geometry`, …) |

Error codes: `COMPUTATION_TIMEOUT` → `TIMEOUT`; `DATASET_*`, `UNSUPPORTED_CRS` → `DATA_UNAVAILABLE`; `UNSUPPORTED_EPOCH`, `MODEL_FAILURE` → `MODEL_UNAVAILABLE`; `NO_ROUTE`, `UNSUPPORTED_SLOPE`, `NO_COVERAGE`, `NO_DATA`, `INVALID_INPUT` unchanged; `CANCELLED` → the request rejects with `AbortError` and is never shown as a result. The engine code, details and failed leg are kept in `ServiceError.origin`. Feasibility mapping: `daylight-margin`/`eva-margin` → `RETURN_MARGIN`, `starts-in-daylight` → `STARTS_IN_DARKNESS`, route `NO_ROUTE` → `NO_ROUTE`, `UNSUPPORTED_SLOPE` → `TERRAIN_SLOPE`, other route problems → `MISSING_ROUTE`, `terrain-verification` → `MISSING_TERRAIN`, `solar-model` → `MISSING_SOLAR`, `assumptions`/`progress` → `INVALID_ASSUMPTION`, `turnaround-warning` → `LOW_MARGIN`.

Worker protocol: one module worker loaded once with a transferred copy of `terrain.bin` (the main thread keeps its own views for synchronous sampling). Requests are queued and posted one at a time; an abort removes a queued request or terminates the worker if it is running, and the next request starts a fresh worker. A 30 s watchdog and `onerror` turn silent or crashed workers into error results. Per route mode, only the latest request may answer (`createLatestRequestGate`).

## 5. Coordinate transformations

```text
GridCoord (x, y)      metres from the AOI south-west corner (projected metres)
projected (xM, yM)    absolute Mars 2000 sphere equirectangular metres, x = R·lon, y = R·lat, R = 3,396,190 m
                      xM = x + 4,587,446 (minX)      yM = y + 1,093,174 (minY)
geographic            planetocentric latitude, east-positive longitude: lon = xM / R, lat = yM / R (radians)
```

Grid metres are projected metres; east-west they are 5.4 % longer than ground metres at 18.46° N (1 cell = 1.897 m × 2.000 m on the ground). No distance in the app is computed from projected metres: route distances come from the engine, the snap distance and test checks use great-circle distance on the Mars sphere, and the scale bar is measured by Leaflet with the Mars radius.

Map frame: NASA Mars Trek serves equirectangular tiles in degrees, 2 × 1 tiles at level 0 (TileMatrixSet `default028mm`), the layout of Leaflet's EPSG:4326 CRS. The map uses that CRS with `R = 3,396,190 m`. The tile index of the AOI centre at level 15 (`15/13024/46859`) equals the tile tested by the pipeline, and that layout passed check X2a (tiles vs USGS orthomosaic: 0.47 m E, 0.71 m S). Every marker, route and overlay is placed through the terrain service's `toGeo`, the same transform the engine uses.

## 6. Raster orientation and the sample mission

The frontend contract (row 0 = south) was kept. The engine's north-up arrays are copied once at load into south-up `TerrainRaster` arrays (`frontendRow = 799 − engineRow`), with validity 1 = valid, 0 = no data, 3 = elevation measured but slope unknown (new). Cell indices shown in the UI use the same flip. Map overlays are drawn directly from the north-up engine arrays (canvas row 0 = north), so no image is flipped. Tests compare raster rows against engine rows and sampled values against pipeline values.

Sample mission (from the engine integration test): hypothetical habitat at engine cell (572, 698), 20 min at the Three Forks depot area, then 30 min at the Skinner Ridge sampling site, starting 09:00 LTST on sol 690. Skinner Ridge's rover cell has a 20.8° slope, above the 15° default limit. The sample loads without a destination and shows the nearest usable cell (engine cell (316, 390), 4 m, 12.8°); nothing moves until the user confirms. Waypoint buttons, waypoint markers and typed coordinates use the same check.

## 7. Datasets in use

| Dataset | Mission / instrument | Use in the running app | Evidence |
| --- | --- | --- | --- |
| USGS HiRISE DTM mosaic for Mars 2020 TRN (DOI 10.5066/P9REJ9JN), 2 m grid in `public/data/jezero/` | MRO / HiRISE | Elevation, slope, routing, profiles, relief basemap, overlays | SHA-256 verified at load; gates S1–S3 |
| Mars Trek `JEZ_hirise_soc_006_orthoMosaic_25cm…_first_dd` | MRO / HiRISE | Default basemap | Live tiles 200, CORS `*` (2026-11-15) |
| Mars Trek `JEZ_ctx_B_soc_008_orthoMosaic_6m…` | MRO / CTX | Context basemap | Live tiles 200, CORS `*` |
| Mars Trek `Mars_MGS_MOLA_ClrShade_merge_global_463m` | MGS / MOLA | Regional context basemap | Live tiles 200, CORS `*` |
| MMGIS `M20_waypoints.json` (RMC 32_1184, 26_1004) via `science-targets.geojson` | Mars 2020 / Perseverance | Two cited science targets | Engine target validation |
| NASA GISS Mars24 algorithm | — | Daylight window, local solar time | Gate M1 |

Three missions contribute visibly: MRO (DTM and imagery), MGS (MOLA context) and Mars 2020 (rover-localized targets).

## 8. Scientific limitations (disclosed in the UI)

- **X2b FAIL, unresolved.** The DTM and the HiRISE imagery appear offset by 2.3–3.2 m east. Routes and slope are computed from the DTM and are aligned with it; over imagery they may look shifted by up to about 3 m. The UI shows "Overlay registration ±3 m" while Mars Trek imagery is the basemap, in the legend, in the layer list, in the Terrain verification panel and on the Data sources page. No shift is applied and no tolerance was changed. The feasibility policy is the engine's: verification requires the pipeline validation (passed); cross-checks concern overlay display.
- One 2.43 km² AOI; the outer ring of cells has unknown slope and is never routed through.
- 2 m cells with a ~4 m slope baseline; rocks, steps and footing are not represented.
- Science targets are rover positions, not the exact features.
- Geometric daylight at the habitat (no refraction, dust, twilight or terrain horizon).
- Constant walking speed over surface distance; constraints are illustrative.
- On-plan simulation interpolates the walker linearly in planimetric distance within a phase while the engine times phases by surface distance; the test shows the two positions agree within 2.5 m (about one cell).

## 9. Network services and authentication

| Provider | Endpoint | Purpose | Auth | Env var | CORS | Restrictions | Failure behaviour | Attribution | Test result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Static host (same origin) | `data/jezero/manifest.json`, `terrain.bin`, `coverage.geojson`, `science-targets.geojson` | Terrain and targets | None | None | Same origin | None | Terrain alert with retry; placement, routing, feasibility blocked; nothing estimated | USGS citation in the manifest and UI | PASS: one request each in the browser (5.76 MB grid) |
| NASA/JPL Mars Trek WMTS | `https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/default/default028mm/{z}/{y}/{x}.{png\|jpg}` | HiRISE, CTX, MOLA basemaps | None (public) | None | `Access-Control-Allow-Origin: *` | Tiles outside a layer's footprint return 404, so layer bounds are set | Probe failure: layer marked unavailable, DTM relief offered; ≥ 6 tile errors with no success: imagery notice; terrain unaffected | Credit line under the legend and in Help/Data sources | PASS: curl with `Origin` → 200 for all three (2026-11-15); browser loaded 49 tiles, no console errors; offline case tested |

Nothing else is contacted at runtime: no API keys, accounts, backend, analytics or CDN fonts (fonts are bundled). The only environment variable is `VITE_DATA_MODE` (public, not secret). Source archives (USGS S3 DTM, MMGIS JSON) are used only by the offline pipeline and are not needed to run or build the app. Cesium is not used. `npm audit --omit=dev`: 0 vulnerabilities; dev tooling has 7 moderate advisories (`minimatch`), not addressed here.

## 10. Tests executed

| Suite | Command | Result |
| --- | --- | --- |
| Frontend typecheck | `npm run typecheck` | **PASS**, 0 errors (app, Node config and integration-test projects) |
| Frontend lint | `npm run lint` | **PASS**, 0 problems (includes the engine sources) |
| Frontend unit, UI and integration tests | `npx vitest run` | **PASS**, 5 files, 86 tests |
| of which real-data integration | `src/services/adapters/real/__tests__/real.integration.test.ts` | **PASS**, 22 tests (below) |
| Scientific engine | `npm ci && npm run typecheck && npm run build && npm test` in `packages/scientific-engine` | **PASS**, 6 files, 88 tests |
| Python pipeline, this worktree | `python -m pytest -q` | **PASS**, 39 passed, 5 skipped (the 5 need the 1.8 GB source DTM in `data/raw`, which this worktree does not hold) |
| Python pipeline with source DTM | same command in the sibling worktree (pipeline code and assets byte-identical to this branch) | **PASS**, 44 passed |
| Clean clone | `git clone` → `npm ci` → typecheck → lint → tests → build; engine `npm ci && npm test` | **PASS** (engine built by `postinstall` without its own `node_modules`) |

Real-data integration tests reproduce the engine evidence through the adapters: manifest and SHA-256; a known cell (Three Forks: −2545.158 m, 1.398°); outside-coverage and slope-unknown rejection; SW origin, absolute projection, row flip and ground distance; the two cited targets; Skinner Ridge refused at 15° and the snap cell equal to the evidence; shortest and lower-slope routes equal to the evidence (928.58/864.71 m and 931.61/881.82 m, cell counts, ascent, maximum slope) with an independent return; lower-slope mean slope 2.40° vs 4.22°; profile samples equal the grid; NO_ROUTE/UNSUPPORTED_SLOPE/NO_COVERAGE/DATASET_MISMATCH mapping; Mars24 sunrise 5.845 h and sunset 18.157 h LTST; margins 434.5 / 433.9 min; +60 min science removes exactly 3,600 s; infeasible late start (−27.8 min), start in darkness, 3° limit, 1 h EVA limit; indeterminate without solar or with an untrusted route; frontend simulation vs engine simulation (remaining work, margin, position within 2.5 m); imagery outage never fabricates imagery or terrain; provenance; worker load/abort-terminate/crash.

## 11. Build

`npm run build` **PASS** (engine `tsc`, app `tsc -b`, `vite build` in ~2 s). Chunks: app 419 kB (129 kB gzip), charts 403 kB, leaflet 166 kB, UI primitives 84 kB, engine 51 kB, worker 50 kB; no size warning (previously one 1.05 MB bundle). `dist/data/jezero/terrain.bin` keeps SHA-256 `fcb96e32…1b7f49`. The production bundle contains no mock adapter code.

## 12. Browser verification (production build, `vite preview`, Chrome, 2026-11-15)

| Check | Result |
| --- | --- |
| Boot, real HiRISE imagery, slope overlay, coverage boundary | **PASS** |
| Sample mission: destination refused (20.8° > 15°), suggestion "4 m away (12.8°)", confirm → calculation | **PASS** |
| Mission control: feasible, margin +7 h 14 min, 1.79 km, 50 min walk + 50 min science, steepest 15.0° | **PASS** (matches evidence) |
| Outbound and independent return drawn; route comparison both modes | **PASS** |
| Edit start to 16:30 → automatic recalculation → infeasible, −28 min | **PASS** |
| Terrain view: layers, DTM relief and elevation overlay rendered from the grid, verification panel with X2b FAIL | **PASS** |
| Simulation: step controls; walker at the Three Forks stop at T+25 min and on the dashed return path at T+85 min; clock header Sol 690, Ls 16.2°, sunrise 05:50, sunset 18:09 | **PASS** |
| Summary: legs, timeline, margin derivation, coordinates in planetocentric lon/lat | **PASS** |
| Data sources: real-mode banner, 9 sources in use, THEMIS/MEDA planned, network services, no demo controls | **PASS** |
| Tablet, 820 px frame: sheet buttons, snap prompt, status sheet, dock, legend | **PASS** |
| Mars Trek blocked: no tiles, automatic DTM relief basemap, no ±3 m tag, workflow unaffected | **PASS** |
| Console errors / failed requests | **PASS**: none; terrain grid requested once |
| Real touch device, keyboard-only walkthrough, screen reader (U2) | **NOT RUN** |

## 13. Remaining defects and open items

- Not deployed (D1 **NOT RUN**). Deployment needs the repository owner's hosting account; see `docs/DEPLOYMENT_GUIDE.md`.
- X2b remains **FAIL** (unresolved source limitation, not a software bug).
- Accessibility audit (U2) not run.
- `terrain.bin` is 5.76 MB; it is below the PRD goal only when the host compresses it (4.12 MB gzip).
- The 3D explorer is not built and is not advertised.
- Dev-only `npm audit` advisories (7 moderate).
- Stops cannot be reordered (unchanged from the frontend handoff).

## 14. Deployment readiness

Ready for static hosting: no backend, credentials or environment configuration are required; `vercel.json` sets install/build/output and cache headers; the clean-clone build passes; the production bundle runs in real mode against same-origin assets and public Mars Trek tiles. Deployment itself has not been performed.
