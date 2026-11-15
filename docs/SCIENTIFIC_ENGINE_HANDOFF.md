# AUSNOX — SCIENTIFIC ENGINE HANDOFF

Version 1.0 | 2026-11-15 | Branch `feat/scientific-engine` | Package `@ausnox/scientific-engine@0.1.0`

This is the integration guide for the frontend. Read `docs/SCIENTIFIC_VALIDATION_REPORT.md` for what is verified and `docs/DATA_PIPELINE.md` for how the data were produced. Nothing in this branch touches the frontend code.

## 1. Architecture overview

```text
scientific-pipeline/ (Python, offline)                 packages/scientific-engine/ (TypeScript, browser or Node)
  fetch_sources -> inspect_dem -> build_terrain   --->   terrain/   load + verify manifest and terrain.bin, sample cells
  -> validate_terrain -> cross_validate                  coordinates/ Mars lon/lat <-> projected metres <-> grid cells
           |                                             routing/   A* (shortest, lower-slope), round trips, worker host
           v                                             solar/     Mars24 time, Sun position, geometric daylight
public/data/jezero/  (static assets)  ------------->     mission/   timeline, feasibility, simulation, planMission()
```

- Static-first: no server, database, account or environment variable. The browser downloads 5.78 MB of assets once and computes everything locally.
- Framework-free: no React, Zustand, Leaflet or DOM dependency, and no module-level state apart from bounded caches.
- Fail-closed: every expected failure is returned as `{ status: 'error', code, message, details? }`. Missing or unverified inputs produce "indeterminate", never "feasible".

## 2. Public API

All exports come from `packages/scientific-engine/src/index.ts`.

| Area | Functions | Main types |
| --- | --- | --- |
| Terrain | `loadTerrainDataset`, `createTerrainDataset`, `validateTerrainDataset`, `listManifestProblems`, `verifyTerrainChecksum`, `sha256Hex`, `sampleTerrainCell`, `sampleTerrainAt`, `classifyCell`, `classifyTraversability`, `findNearestTraversableCell`, `deriveHornSlopeDeg`, `parseScienceTargets`, `loadScienceTargets` | `TerrainDataset`, `TerrainManifest`, `TerrainVerification`, `TerrainSample`, `Traversability`, `SnapCandidate`, `ScienceTarget` |
| Coordinates | `geographicToGrid`, `gridToGeographic`, `geographicToProjected`, `projectedToGeographic`, `gridCellCenterToProjected`, `groundDistanceBetweenCellsM`, `greatCircleDistanceM`, `normalizeLongitude180/360`, `eastToWestLongitude`, `westToEastLongitude`, `planetocentricToPlanetographicLatitude`, `validateGeographicCoordinate` | `GeographicCoordinate`, `ProjectedCoordinate`, `GridCell`, `GridGeometry` |
| Routing | `calculateRoute`, `calculateRouteAsync`, `compareRoutes`, `calculateRoundTrip`, `calculateRoundTripAsync`, `compareRoundTrips`, `roundTripToGeoJSON`, `installRouteWorker`, `createRouteWorkerHandler`, `createLatestRequestGate` | `RouteRequest`, `RouteResult`, `RouteLeg`, `RouteVertex`, `RouteMetrics`, `RoundTripRequest`, `RoundTripRoute`, `RoundTripResult`, `LowerSlopeCostParameters`, `RouteWorkerRequest/Response` |
| Mars time | `calculateMarsSolarTime`, `calculateDaylightWindow`, `isDaylightAt`, `findUtcForLocalTrueSolarTime`, `findUtcForSolarLongitude`, `computeMars24Planet`, `computeMars24Local`, `marsHoursToEarthSeconds`, `earthSecondsToMarsHours`, `formatMarsClock`, `ttMinusUtcSeconds` | `MarsSolarTime`, `DaylightWindowResult`, `Mars24Planet`, `Mars24Local` |
| Mission | `buildMissionTimeline`, `calculateMissionDuration`, `evaluateMissionFeasibility`, `validateMissionAssumptions`, `planMission`, `createSimulation`, `startSimulation`, `pauseSimulation`, `resumeSimulation`, `stepSimulation`, `tickSimulation`, `holdSimulation`, `replanSimulation`, `setSimulationSpeed`, `resetSimulation`, `getSimulationSnapshot`, `positionAlongVertices` | `MissionAssumptions`, `MissionTimeline`, `MissionAssessment`, `ConstraintCheck`, `MissionPlan`, `SimulationState`, `SimulationSnapshot` |
| Shared | `engineError`, `isEngineError` | `EngineError`, `EngineErrorCode`, `RoutingError`, `ProvenanceRecord`, `ResultProvenance` |
| Constants | `ENGINE_VERSION`, `SUPPORTED_TERRAIN_SCHEMA_VERSIONS` (`['1.0.0']`), `SOL_SECONDS` (88,775.244147 s), `MARS_HOUR_SECONDS` (3,698.9685 s), `DEFAULT_MISSION_ASSUMPTIONS`, `MISSION_ASSUMPTION_LIMITS`, `DEFAULT_LOWER_SLOPE_COST`, `FEASIBILITY_LABELS`, `MISSION_DISCLAIMER`, `ENGINE_PROVENANCE_RECORDS` | |

## 3. Key interfaces

```ts
interface GeographicCoordinate { lonEast: number; latNorth: number }       // degrees, planetocentric, east positive
interface GridCell { row: number; col: number }                            // row 0 = NORTH

interface RoundTripRequest {
  habitat: GeographicCoordinate; habitatLabel?: string
  stops: { id: string; label: string; coordinate: GeographicCoordinate; activityDurationS: number }[] // fixed order, last = destination
  preference: 'shortest' | 'lower-slope'
  maxSlopeDeg: number                                                      // (0, 60]
  costModel?: Partial<{ slopeWeight: number; slopeExponent: number; uphillWeight: number; downhillWeight: number }>
  connectivity?: 4 | 8; limits?: { timeoutMs?: number; maxExpansions?: number }; datasetVersion?: string
}

interface MissionAssumptions {
  walkingSpeedMps: number; maxSlopeDeg: number; reserveS: number
  maxEvaDurationS: number | null; daylightPolicy: 'daylight-only' | 'ignore-daylight'; turnaroundWarningS: number
}

interface MissionPlanRequest {
  habitat: GeographicCoordinate; habitatLabel?: string; stops: RoundTripRequest['stops']
  assumptions: MissionAssumptions; missionStartUtcMs: number
  costModel?: ...; connectivity?: 4 | 8; limits?: ...; datasetVersion?: string
}
// planMission() -> { daylight, shortest: { route, assessment, geojson }, lowerSlope: {...}, comparison, provenance, disclaimer }
```

`RouteVertex` carries the cell, cell-centre lon/lat and projected metres, elevation (m), slope (°), and cumulative planimetric and surface distance. `MissionAssessment` carries the verdict and label, durations, window (sunrise, sunset, EVA deadline, which one binds), reserve, return margin, turnaround warning, every constraint check with status and explanation, the assumptions used, provenance and the disclaimer.

## 4. Installation

The package is self-contained and is not wired into the frontend on this branch.

```powershell
cd packages/scientific-engine
npm ci
npm run build          # emits dist/ (ES2022 modules + .d.ts)
```

Suggested integration (to be decided by the integrator): add `"@ausnox/scientific-engine": "file:packages/scientific-engine"` to the frontend `package.json` and import from `@ausnox/scientific-engine`. The output uses ES modules with `.js` specifiers and works with Vite and the frontend's `moduleResolution: "bundler"`.

## 5. Build and test

| Command (in `packages/scientific-engine`) | Result on 2026-11-15 |
| --- | --- |
| `npm run typecheck` | 0 errors (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`) |
| `npm run build` | OK |
| `npm test` | 6 files, 88 tests passed |
| `npm run evidence` | runs all three and writes `evidence/*.json` |

Pipeline tests: `scientific-pipeline/.venv/Scripts/python.exe -m pytest -q` (44 passed). Tests in `tests/integration.jezero.test.ts` and `tests/terrain.test.ts` read the real asset from `public/data/jezero/`. Synthetic grids exist only in `tests/helpers/` and are labelled test-only.

## 6. Static assets

| Path | Purpose |
| --- | --- |
| `public/data/jezero/manifest.json` | schema 1.0.0; geometry, CRS, provenance, checksums, validation and cross-validation results |
| `public/data/jezero/terrain.bin` | 5,760,000 bytes (4.12 MB gzip); SHA-256 `fcb96e32bc854fff23d56ee4301bea7a77a38e892afc24ada6d0ce5aea1b7f49` |
| `public/data/jezero/coverage.geojson` | AOI rectangle and measured-elevation outline (lon, lat) |
| `public/data/jezero/science-targets.geojson` | two cited targets |

With Vite's `base: './'`, load with `loadTerrainDataset({ manifestUrl: `${import.meta.env.BASE_URL}data/jezero/manifest.json` })`. The binary is resolved next to the manifest. Ask the host to serve `.bin` with gzip or brotli; otherwise the first load is 5.76 MB.

## 7. Units and coordinate conventions

| Quantity | Engine convention |
| --- | --- |
| Geographic | degrees; **planetocentric** latitude; **east-positive** longitude normalised to [−180, 180); GeoJSON order (lon, lat) |
| Projected | metres in the Mars 2000 sphere equirectangular CRS (x = R·lon, y = R·lat, R = 3,396,190 m); absolute, not AOI-relative |
| Grid | 800 × 800; row 0 = **north**; cell centre at +0.5; 2 m projected cells; ground cell 1.897 m east-west × 2 m north-south |
| Distances | ground metres; `planimetric` = map distance on the sphere; `surface` = 3-D length including height change |
| Elevation | metres relative to the Mars areoid |
| Slope | degrees; NaN/null = unknown |
| Instants | Unix milliseconds, UTC |
| Durations | Earth seconds |
| Mars clock | LMST/LTST in Mars hours (0–24); 1 Mars hour = 3,698.9685 Earth s; 1 sol = 88,775.244 s |
| Mars24 internals | planetographic latitude and west longitude, converted explicitly |

Never compute a distance by Euclidean distance in projected metres: east-west it overstates ground distance by 1/cos(18.46°) = 5.4 %.

## 8. Route-engine integration

- **Synchronous:** `calculateRoundTrip(dataset, request)` took 58 ms (shortest) and 76 ms (lower-slope) for the three-leg sample mission in the recorded run on the development laptop (68 and 104 ms in an earlier run). Fine for a click, but it blocks the main thread.
- **Async on the main thread:** `calculateRoundTripAsync(dataset, request, { signal })` yields every 25,000 expansions and honours an `AbortSignal`.
- **Web Worker (recommended):**

```ts
// src/workers/route.worker.ts
import { installRouteWorker, type RouteWorkerScope } from '@ausnox/scientific-engine'
installRouteWorker(self as unknown as RouteWorkerScope)

// main thread
import { createLatestRequestGate } from '@ausnox/scientific-engine'
const worker = new Worker(new URL('./workers/route.worker.ts', import.meta.url), { type: 'module' })
worker.postMessage({ type: 'load', requestId: 'load-1', manifest, buffer }, [buffer]) // transfers the ArrayBuffer
const gate = createLatestRequestGate()
worker.postMessage({ type: 'plan-mission', requestId: gate.issue(), datasetVersion, request })
worker.onmessage = (e) => { if (!gate.isLatest(e.data.requestId)) return /* stale: drop */ }
```

Message types: `load`, `route`, `compare`, `round-trip`, `compare-round-trip`, `plan-mission`. Every response echoes `requestId`; `loaded` and `result` responses also carry `datasetVersion`. A request whose `datasetVersion` differs from the loaded dataset fails with `DATASET_MISMATCH`. The worker computes one request at a time. To interrupt a running computation, terminate the worker; otherwise drop superseded results with the gate.

- **Placement:** call `classifyTraversability(dataset, geo, maxSlopeDeg)` on click. If the result is not `traversable`, offer `findNearestTraversableCell(...)` and move the point only after the user confirms.
- **Modes:** `shortest` minimises planimetric distance. `lower-slope` uses cost = d·(1 + 4·S²) with S = mean cell slope / max slope. That is a preference score, not energy or time. `comparison.identicalRoutes` tells the UI when both modes give the same path.

## 9. Mars-time integration

```ts
const start = findUtcForLocalTrueSolarTime(habitat, 9, Date.UTC(2023, 0, 28, 12)) // 09:00 LTST on that sol
const day = calculateDaylightWindow(start.utcMs, habitat)  // sunrise/sunset UTC + LTST, Ls, noon elevation
const now = calculateMarsSolarTime(start.utcMs, habitat)   // MSD, LMST, LTST, Ls, declination, elevation, azimuth
const season = findUtcForSolarLongitude(90, Date.UTC(2026, 0, 1)) // map an Ls scenario to a date
```

Daylight is geometric: the Sun's centre at 0° elevation, with no refraction, dust, twilight or terrain horizon. `day.approximations` lists these for display. `kind` is `normal`, `polar-day` or `polar-night`; the last two never occur at Jezero's latitude. Instants outside 1950–2099 return `UNSUPPORTED_EPOCH`. After 2027-06-30 results carry `ttMinusUtcExtrapolated: true`. Gate M1 passed (`docs/SCIENTIFIC_VALIDATION_REPORT.md` §5), so a frontend `mars24Validated` flag may be set to `true` for values produced by this engine.

## 10. Mission-feasibility integration

- `planMission(dataset, request)` returns both modes with daylight and an assessment each; this is the simplest adapter entry point.
- For a running simulation: `buildMissionTimeline` → `createSimulation` → `tickSimulation(state, realElapsedMs)` on each animation frame → `getSimulationSnapshot` → `evaluateMissionFeasibility({ ..., progress: { elapsedS, remainingWorkS } })`. The margin then reflects the current position: on-plan progress keeps it, holds (`holdSimulation`) consume it, and `replanSimulation` applies new speed or activity times to the remaining work only.
- Verdict rules: any violated constraint → `infeasible`; else any unknown input → `indeterminate`; else `feasible`. Show `assessment.label` ("Feasible under selected assumptions", …) and `assessment.explanation`, never "safe".

## 11. Error contracts

| Code | Meaning | Feasibility effect |
| --- | --- | --- |
| `INVALID_INPUT` | request or assumption out of range | indeterminate |
| `NO_COVERAGE` | point outside the terrain grid | indeterminate |
| `NO_DATA` | endpoint cell lacks elevation or slope | indeterminate |
| `NO_ROUTE` | missing or unknown cells separate the points (`details.cause`: `disconnected` or `undiagnosed`) | infeasible |
| `UNSUPPORTED_SLOPE` | endpoint too steep, or measured terrain connects the points only above the slope limit | infeasible |
| `COMPUTATION_TIMEOUT` | time (default 10 s) or expansion budget exceeded | indeterminate |
| `CANCELLED` | aborted by the caller | drop |
| `DATASET_MISMATCH` | request prepared for another dataset version | drop or recompute |
| `DATASET_UNAVAILABLE` / `DATASET_INVALID` / `DATASET_INTEGRITY` / `UNSUPPORTED_CRS` | asset missing, malformed, corrupted or not the supported Mars CRS | block terrain features |
| `UNSUPPORTED_EPOCH` / `MODEL_FAILURE` | solar model cannot run for the input | indeterminate |

Round-trip errors also carry `failedLeg` (`outbound-1`, …, `return`).

## 12. Frontend adapter behaviour

Fable's contracts were read **read-only** from the local working tree of `feat/frontend-fable` on 2026-11-15 (`src/services/contracts/*.ts`, `docs/FRONTEND_HANDOFF.md`). They were uncommitted and the branch was not on `origin`, so re-check this mapping against the pushed version. Neither contract was changed to force compatibility; the adapter in `src/services/adapters/real/` has to perform these transformations.

| Fable contract | Engine | Required transformation |
| --- | --- | --- |
| `GridCoord {x, y}`: metres from the AOI **south-west** corner | `ProjectedCoordinate {xM, yM}`: absolute CRS metres | `x = xM − bounds.minX`, `y = yM − bounds.minY` (`dataset.projectedBounds`); inverse adds them back, then `projectedToGeographic`. These are projected metres. |
| `CellIndex` row 0 = **south** | `GridCell` row 0 = **north** | `fableRow = 799 − row` |
| `GridSpec.cellSizeM` (one value) | 2 m projected; 1.897 m × 2 m ground | report 2 (projected) for drawing; take all distances from engine results |
| `TerrainRaster` row 0 = south, `validity` 1/0/2 | `terrain.bin` row 0 = north, flags bit0/bit1 | copy rows in reverse order; flags 3 → 1; flags 1 or 0 → 0. Fable has no "slope unknown" state, so the 3,196 edge-ring cells with measured elevation would show as nodata; proposing a `'slope-unknown'` value is an open contract decision |
| `TerrainManifest` | `TerrainDataset` | `status: 'verified'` and `georeference.kind: 'verified'` iff `verification.verifiedForFeasibility`; origin = SW corner (`geographicBounds.west/south`); `longitudeConvention: 'east-positive-180'`; `latitudeType: 'planetocentric'`; `validCellCount` = `statistics.slopeValidCount` (636,804); provenance ids `terrain-elevation`, `terrain-slope` |
| `TerrainService.nearestValid` | `findNearestTraversableCell` | engine snaps to a **traversable** cell for the mission slope limit, not merely a cell with data |
| `RouteRequest.waypoints` (stops then destination) | `RoundTripRequest.stops` | map each to `{ id, label, coordinate, activityDurationS }` (durations from `MissionConfig`); keep `requestId` in the adapter with `createLatestRequestGate` |
| `RouteLeg` (`path`, `samples`, `distanceM`, …) | `RouteLeg.vertices`, `metrics` | `path`/`samples` from vertices (convert to `GridCoord`); `distanceM` = `metrics.planimetricDistanceM`; `waypointDistancesM` from `outbound.arrivals`; `terrainAwarePathfinding: true`; `method` e.g. "A* on the HiRISE DTM-derived grid" |
| distance used for timing | engine times use **surface** distance | use the engine's assessment for timing; Fable's mock divides `distanceM` by speed and would differ by about 0.2 % |
| `ServiceErrorCode` | `EngineErrorCode` | `COMPUTATION_TIMEOUT` → `TIMEOUT`; `DATASET_*`, `UNSUPPORTED_CRS` → `DATA_UNAVAILABLE`; `UNSUPPORTED_EPOCH`, `MODEL_FAILURE` → `MODEL_UNAVAILABLE`; `CANCELLED`, `DATASET_MISMATCH` → drop as stale; others unchanged; `message` → `detail` |
| `SolarService.getSolarDay(scenarioId, at)` | `calculateDaylightWindow(utcMs, site)` | adapter maps scenario ids to UTC instants (or Ls via `findUtcForSolarLongitude`); `lsDeg` = `solarLongitudeDegAtNoon`; `mars24Validated: true` |
| `SOL_SECONDS = 88775.244` | 88,775.244147 s | difference 0.15 ms per sol; no action needed |
| `MissionAssumptions` (minutes, hours, `maxEvaEnabled`, `startLtstHours`) | seconds, `maxEvaDurationS \| null`, absolute start | `reserveS = reserveMin·60`; `turnaroundWarningS = warningMarginMin·60`; `maxEvaDurationS = maxEvaEnabled ? maxEvaHours·3600 : null`; `daylightPolicy: 'daylight-only'`; start = `findUtcForLocalTrueSolarTime(habitat, startLtstHours, scenarioUtc)`. Fable's `ASSUMPTION_LIMITS` all lie inside the engine limits |
| `MissionAssessment` (Fable) | `MissionAssessment` (engine) | `totalMissionS` = `durations.totalS`; `windowEndS` = `(window.closesUtcMs − missionStartUtcMs)/1000`; `windowLimitedBy` = `window.limitedBy`; phases from `timeline.phases` (`startOffsetS`/`endOffsetS`); events derived from the phases and the window |
| `ConstraintViolation.code` | `ConstraintCheck.id` and route error code | `daylight-margin`/`eva-margin` violated → `RETURN_MARGIN`; `starts-in-daylight` → `STARTS_IN_DARKNESS`; route `NO_ROUTE` → `NO_ROUTE`, `UNSUPPORTED_SLOPE` → `TERRAIN_SLOPE`, other route unknowns → `MISSING_ROUTE`; `terrain-verification` → `MISSING_TERRAIN`; `solar-model` → `MISSING_SOLAR`; `assumptions`/`progress` → `INVALID_ASSUMPTION`; `turnaround-warning` → `LOW_MARGIN` (severity `warning`) |
| `ScienceWaypoint.labelQuality: 'cited'` | `labelQuality: 'cited-approximate'` | map to `'cited'` and keep the caveat "rover position, not the exact feature" in the description; `sourceUrl` = first source; `provenanceId: 'science-target-locations'` |
| `ProvenanceRecord.kind`, `sourceUrl`, `integration` | `category`, `sources[]` | `kind = category`; `sourceUrl = sources[0].url`; `integration: 'integrated'` |
| `ResultSource` | `ResultProvenance` | `{ kind: 'engine', adapter: 'scientific-engine', version: ENGINE_VERSION, note }` |

**Map layers (Fable owns the map).** The verified Mars Trek facts are in `scientific-pipeline/evidence/marstrek_layers.json`. HiRISE Jezero tiles: `https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd/1.0.0/default/default028mm/{z}/{y}/{x}.png`, levels 0–17, PNG with alpha, `Access-Control-Allow-Origin: *`. The tile grid is equirectangular in degrees with 2 × 1 tiles at level 0, the same layout as Leaflet's `L.CRS.EPSG4326`. A Mars CRS can extend it with `R: 3396190` so scale bars and distances use Mars. Because the projection is linear in lon/lat, Fable's AOI-relative grid metres convert exactly to lon/lat for drawing. Route and slope overlays may appear about 2.4 m east of image features (X2b), so label overlay registration as ±3 m.

## 13. Known limitations

- One 2.43 km² AOI (delta front, Three Forks to Skinner Ridge). Everything else returns `NO_COVERAGE`.
- 2 m cells; rocks, steps and footing are not represented; HiRISE DTM artefacts may be present.
- Unresolved DTM-to-imagery offset of about 2.4 m east (X2b).
- Edge-ring cells have unknown slope and are not traversable.
- Science targets are rover positions; Skinner Ridge needs a 4 m snap at a 15° limit.
- Stops are visited in the given order (at most 10); no reordering.
- Constant walking speed; no slope-dependent speed model.
- Geometric daylight only; evaluated at the habitat.
- Uphill/downhill cost weights default to 0, so default routes have direction-symmetric cost; the return leg is still searched independently.
- Payload 5.76 MB uncompressed.

## 14. Remaining integration work

1. Agree the contract decisions marked above (slope-unknown validity, row orientation, projected vs ground metres in `GridSpec`).
2. Implement `src/services/adapters/real/` on top of this package (terrain, routing in a worker, solar, mission, map data).
3. Configure the Mars CRS and Mars Trek tiles in `MarsMap`, show overlay registration as ±3 m, and add an authorized local fallback image.
4. Replace the illustrative waypoints with `science-targets.geojson` and wire the confirm-to-snap flow.
5. Update `docs/DATA_SOURCES.md` statuses on the integrated branch from the evidence here. This branch leaves the specification documents unchanged because they move to `docs/` on `feat/frontend-fable`.
6. Run the frontend gates (S4, U1–U3, D1, D2) and an end-to-end test against the real adapters, then deploy.
