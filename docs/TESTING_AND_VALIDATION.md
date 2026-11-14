# AUSNOX — TESTING, SCIENTIFIC VALIDATION AND RELEASE GATES
Version: 1.0 | Status: tests specified, not yet executed

## 1. Evidence convention

Every check has **PASS / FAIL / BLOCKED / NOT RUN** and evidence (command, screenshot, fixture, data product hash, URL or manual observation). At documentation creation **all implementation tests are NOT RUN**. A source webpage existing is not a passed integration test.

## 2. Gate matrix

| Gate | Mandatory? | Evidence required |
| --- | --- | --- |
| S1 Real DEM origin | YES | Downloaded original NASA/USGS source and checksum, exact product |
| S2 CRS / alignment | YES | Source GDAL metadata, transform test, imagery/footprint overlap |
| S3 Numeric slope | YES | Difference from hand-computed flat/inclined fixtures + valid nodata masking |
| S4 Multi-mission use | YES | At least two NASA mission products visibly integrated; credited |
| S5 Eligible challenge source | YES | At least one NASA item matches official challenge Resources tab |
| R1 Legal A* | YES | Path stays on in-bounds traversable measured grid; no illegal diagonal |
| R2 Round trip | YES | Independent return calculation, valid endpoints and path lengths |
| R3 Cost modes | YES | Known test grid shows shortest vs lower-slope tradeoff or correct tie |
| R4 No-data fail-closed | YES | Outside footprint/nodata/no path yields explicit error, no route |
| M1 Mars24 reference | YES | Worked example values vs NASA Mars24 documented tolerances |
| M2 Time and reserves | YES | Solar-time unit conversion, negative/zero/positive margin correct |
| M3 Model uncertainty | YES | Missing model inputs produce indeterminate, never feasible |
| U1 User workflow | YES | Real-science Jezero mission start-to-finish without coaching |
| U2 Accessibility | YES | Keyboard, focus and labels; desktop/tablet usable |
| U3 Failure states | YES | Tile outage, invalid location, stalled worker, empty science target |
| D1 Production | YES | Browser access to deployed site; static loading, no backend |
| D2 Attribution | YES | All data, transforms, libraries, images, AI tools credited |
| V1 3D | NO (P1) | If shipped, georeferenced terrain and graceful 2D fallback |

## 3. Deterministic terrain fixtures

Create a **test-only** grid, clearly separated from public/data/jezero:
- Constant 0m plane → 0deg slopes for valid interior.
- Known slope: z(x) = 0.1 * x (meters) → atan(0.1) ≈ 5.71 degrees.
- Masked center cell + diagonally blocked neighbors → no forbidden corner cutting.
- Corridor with high-slope shortcut vs longer level perimeter → cost modes differ predictably.
- Boundary/no-data pockets → cannot traverse invalid data.
- Very steep ramp exceeding chosen threshold → no route or detour; not a "safe" straight line.
- Uphill vs downhill scenario → return can have direction-sensitive cost/time if such model is enabled.
- Coordinate round-trip from local grid → Mars lon/lat → same grid cell within sub-cell tolerance (validated using actual CRS).

## 4. Pathfinding tests

Use Vitest for pure TS engine. Test: valid straight path; path cost lower bound; optimality vs Dijkstra on small graph; consistent units; start=end behavior; duplicate marker updates; no route; out-of-range indices; blocked start/end; maximum slope boundary; deterministic tie; cancels old request; new request does not show old results; AOI manifest version mismatch blocked; outbound + return include habitat and destination accurately.

On an actual cropped DEM, separately sample 5 known grid points and assert finite measured elevation/slope consistent with direct raster extraction and documented tolerance; check no false flattening.

## 5. Solar and mission tests

Reference NASA Mars24: https://www.giss.nasa.gov/tools/mars24/help/algorithm.html . Implement the listed examples (including Mars local time and solar elevation/azimuth where specified) with unit convention and TT offset documented. Target tolerances: LTST <= 60 seconds and solar angle <= 0.1 degree **only where identical epochs/conventions are used**; record actual achieved tolerance.

Edge cases: crossing UTC midnight; crossing Mars sol boundary; longitude sign and wrap (0–360 vs +/-180); sunrise/sunset near sol transitions; no daylight/continuous daylight branches; sol duration ~88775.244 Earth seconds; fixed time mocking; simulation pause and resumed stepping; mission just before/at/after safety threshold; increased stop duration makes margin smaller; invalid speed or reserve cannot pass.

A passing test must distinguish **duration** from **route cost**; A* penalty weights are not Joules nor time unless a separate explicit model says so.

## 6. Integration acceptance scenarios

**Scenario A, valid:** Load real validated Jezero AOI, use default illustrative habitat and documented science site inside coverage, plot both legs, inspect slope legend, show feasible/infeasible/indeterminate status with cited assumptions, start and pause simulation.

**Scenario B, invalid:** Place habitat beyond DEM boundary → reject with coverage explanation, no route or false feasible status.

**Scenario C, no path:** Block connectivity with nodata/threshold → display NO_ROUTE, not a fallback straight line.

**Scenario D, time budget:** Add enough science time to exceed remaining daylight → status infeasible and report required time / remaining time / reserve.

**Scenario E, provider failure:** Block NASA image tiles → local data still works, compliant fallback image or blank background explicitly marked, no fake online state.

**Scenario F, unknown solar:** Force invalid date/solar model failure → status indeterminate and clear correction; never green.

**Scenario G, stale result:** Change destination during path computation → last valid request wins, no phantom route.

**Scenario H, accessibility:** Keyboard-only set location through coordinate fields, generate route, alter advanced assumptions, read results via semantic controls.

## 7. Release commands (only when code exists)

~~~bash
npm ci
npm run typecheck
npm run lint
npm run test -- --run
npm run build
python scripts/validate_terrain.py --manifest public/data/jezero/manifest.json
~~~

These are a **target command contract**, not verified current scripts. The code agent must create/adjust package scripts and verify dependency installation, Python environment and data validation arguments. If a command does not exist, update it transparently rather than recording a pass.

## 8. Deployment check

- Open publicly deployed HTTPS URL in private/incognito window.
- Check map tiles or fallback, georeferenced overlay, route, science stop and daylight labels.
- Simulate no network/API (after local asset load), bad data file, no-data route and stale worker results.
- Check desktop 1440px and tablet ~800px; no clipped panels and no inaccessible critical controls.
- Confirm no secrets in bundled JS and no paid backend dependency.
- Re-check credits and eligibility resource citation in final submission.

## 9. Evidence ledger template

| ID | Status | Date UTC | Dataset / commit | Evidence | Notes |
| --- | --- | --- | --- | --- | --- |
| S1 | NOT RUN | - | - | - | Await real DEM |
| S2 | NOT RUN | - | - | - | Await georeferencing |
| S5 | NOT RUN | - | - | - | Verify exact challenge Resources tab |
| M1 | NOT RUN | - | - | - | Await Mars24 implementation |
| D1 | NOT RUN | - | - | - | Await production deployment |

Fill the matrix as work proceeds; never self-certify unexecuted tests. If any mandatory gate fails, document the blocker and release as incomplete prototype rather than claiming an operational planning system.
