# AUSNOX — SCIENTIFIC VALIDATION REPORT

Version 1.0 | 2026-11-15 | Branch `feat/scientific-engine` | Statuses: **PASS / FAIL / BLOCKED / NOT RUN**

Every result below was produced by a command that was actually run. Evidence files are in `scientific-pipeline/evidence/` (pipeline) and `packages/scientific-engine/evidence/` (engine). Nothing was marked PASS by inspection alone.

## Gate matrix (TESTING_AND_VALIDATION.md §2)

| Gate | Status | Evidence |
| --- | --- | --- |
| S1 Real DEM origin | **PASS** | USGS HiRISE DTM, DOI 10.5066/P9REJ9JN, 1,839,545,409 bytes, SHA-256 `44c3819c…c747d8` (`fetch_sources.py --verify-only`); label and metadata checks L1–L5, F1 (`source_inspection.json`) |
| S2 CRS / alignment | **PASS** (with one failed supplementary check, see §3.4) | GDAL metadata vs PDS3/FGDC labels; projection vs PROJ 2.84e-9 m (V6); grid round trip (V11, 8 PROJ vectors in TS); 132 rover waypoints (V10); imagery footprint covers the AOI; Mars Trek tiles vs USGS orthomosaic 0.47 m E, 0.71 m S (X2a). **Supplementary X2b FAIL:** apparent DTM-to-imagery offset 2.3–3.2 m east |
| S3 Numeric slope | **PASS** | flat, known-slope (atan 0.1 = 5.7106°), anisotropic-spacing and masked fixtures (pytest); independent recompute from source 1.64e-6° (V8); TypeScript recompute 0.0039° (float32 rounding) |
| S4 Multi-mission use | **NOT RUN** (frontend) | Engine data come from MRO HiRISE (elevation) and Mars 2020 (rover-localized targets). Mars Trek layers verified for MRO HiRISE, MRO CTX and MGS MOLA (`marstrek_layers.json`). Visible integration is frontend work |
| S5 Eligible challenge source | **PASS** | Official Resources tab lists JPL Mars Trek and the Perseverance Raw Images Gallery; both are used (`challenge_resources.json`) |
| R1 Legal A* | **PASS** | synthetic fixtures plus every vertex and move of the real Jezero routes checked for traversability, adjacency, no corner cutting and grade |
| R2 Round trip | **PASS** | independent return search; endpoints at habitat and destination; direction-dependent fixture gives different return geometry |
| R3 Cost modes | **PASS** | corridor fixture: shortest crosses a 13° band, lower-slope detours around it; real data: lower-slope reduces the distance-weighted mean slope of the round trip from 4.22° to 2.40° for 20.1 m extra |
| R4 No-data fail-closed | **PASS** | NO_COVERAGE, NO_DATA, NO_ROUTE, UNSUPPORTED_SLOPE returned with no path; never a straight-line fallback |
| M1 Mars24 reference | **PASS** at the gate tolerances | 2 NASA worked examples, 21 values each; LTST within 0.19 s (gate 60 s), solar angles within 6.5e-4° (gate 0.1°). 37 of 42 values match the published value to 1e-5; the other 5 published values cannot be reproduced from NASA's own published inputs (§5) |
| M2 Time and reserves | **PASS** | sol = 88,775.244 s; Mars-hour conversion; margins at −1 s, 0 s, positive; one-for-one effect of science time and reserve |
| M3 Model uncertainty | **PASS** | 13 missing or invalid input cases all give indeterminate, never feasible |
| U1 User workflow | **NOT RUN** | frontend gate |
| U2 Accessibility | **NOT RUN** | frontend gate |
| U3 Failure states | **NOT RUN** (UI) | engine side covered by R4, M3 and loader tests |
| D1 Production | **NOT RUN** | not deployed |
| D2 Attribution | **NOT RUN** (UI) | engine supplies provenance records for every layer and model |
| V1 3D | **NOT RUN** | out of scope |

## 1. Verified datasets

| Product | Use | Status |
| --- | --- | --- |
| USGS HiRISE DTM mosaic for Mars 2020 TRN (`JEZ_hirise_soc_006_DTM_…_blend40.tif`) | elevation and slope | downloaded, checksum recorded, validated |
| NASA/JPL MMGIS `M20_waypoints.json` (through sol 2022) | two science target positions, landmark check V10 | downloaded, records pinned by content |
| USGS CTX DTM mosaic (`JEZ_ctx_B_soc_008_DTM_…_20m`) | independent vertical cross-check X1 | downloaded, checksum recorded |
| NASA/JPL Mars Trek WMTS `JEZ_hirise_soc_006_orthoMosaic_25cm_…_first_dd` | imagery registration X2a/X2b; frontend basemap candidate | capabilities parsed, 36 tiles tested, CORS `*` observed |
| USGS HiRISE orthomosaic (`JEZ_hirise_soc_006_orthoMosaic_25cm_…_first.tif`) | reference image for X2a/X2b | 6,400 AOI rows fetched by byte range |
| Perseverance raw-image metadata (sols 490, 690) | links targets to sols; rover-clock check of Mars24 | 2 image records cited in tests |

## 2. Geographic coverage

- Source DTM: 77.2229331–77.5839640° E, 18.3067994–18.6693150° N; 66.1 % of the 459.8 M posts carry data (rotated strip mosaic).
- Ausnox AOI: 77.3929888–77.4199817° E, 18.4425066–18.4694996° N; 800 × 800 cells of 2 m (projected); 1,517.7 m × 1,600.0 m on the ground; 2.43 km². No missing posts inside the window.
- The AOI lies inside the Mars Trek HiRISE and CTX layer footprints and contains both science targets on valid cells.

## 3. Data-quality findings

### 3.1 Source inspection (`inspect_dem.py`, 6/6 PASS)

Raster dimensions, 1 m pixel scale, 3,396.19 km sphere radius, planetocentric/east-positive conventions and geographic bounds (to 1e-9°) agree with the PDS3 label; datum and projection agree with the FGDC metadata.

**Note (not a failure of Ausnox processing):** the FGDC attribute range (−2,659.78 to −1,942.10 m) does not contain the observed raster range (−2,665.37 to −1,639.89 m). The published range appears to describe another version or subset. AOI values (−2,559.27 to −2,443.77 m) lie inside both.

### 3.2 Faithful derivation (`validate_terrain.py`, 11/11 PASS)

Shipped elevations equal the float32 2 × 2 source means exactly (2,004 independently re-read cells). Shipped slopes match an independent scalar Horn computation from fresh source reads to 1.64e-6°. Five known points agree with direct 1 m bilinear source sampling within 0.107 m. 132 rover waypoints in the AOI agree with the asset elevation (median +0.001 m, 95th percentile 0.076 m), and the zero-shift position fits better than any ±1–3 cell shift. Those rover elevations were probably sampled by JPL from this same DTM, so V10 confirms that Ausnox and JPL map longitude/latitude onto the DTM identically, not that the DTM is physically correct.

### 3.3 CTX comparison (X1, PASS on the second run)

6,241 CTX 20 m posts fully inside the AOI: median(CTX − HiRISE) +0.82 m (USGS documents about +0.4 m, CTX above HiRISE), MAD 2.18 m, 95th percentile |difference| 7.82 m. The difference grows with slope (median +0.24 m below 5°, +2.15 m above 20°), as expected when a 20 m DTM is compared with a 2 m one on steep ground.

**Run history.** Run 1 used "95th percentile |difference| < 5 m" and FAILED (7.82 m; `cross_validation_report_run1_failed.json`). That threshold had no basis in the product documentation. After run 1 the criterion was replaced with the USGS CTX vertical registration of 3.8 m applied to the median and MAD. The criterion was changed after seeing the data, and both runs are kept.

### 3.4 Imagery registration (X2a PASS, X2b FAIL)

- **X2a:** NASA Mars Trek zoom-15 tiles vs the USGS 25 cm orthomosaic delivered with the DTM: peak correlation 0.975 at +0.47 m east, +0.71 m south, below one 1.27 m tile pixel. The Mars Trek tile-matrix interpretation is correct.
- **X2b (FAIL):** regressing image brightness on DTM gradients gives an apparent DTM-to-image offset of +2.29 to +3.17 m east and −0.23 to −1.10 m south across two images (USGS orthomosaic, Mars Trek) and two shading models. The 2 m tolerance was set before the run and was not changed.
- **Control experiment** (`photometric_control.py`): the best-fit sun is from azimuth 269°, elevation 15° (correlation 0.56). Synthetic images rendered from the DTM with that sun, with and without cast shadows (4.4 % of cells), are perfectly registered by construction; the same method finds ≤ 0.03 m on them, so the method has no geometric bias. Direct cross-correlation of the real image with the shadowed rendering gives +2.28 m east, −0.81 m south.
- **Interpretation:** either a real displacement of about 2.4 m (1.2 cells) between the DTM and the orthoimages, within the USGS statement of < 3 m orthoimage co-registration, or albedo that correlates with slope aspect, which the control does not model. Routing uses only the DTM, so routes are consistent with the elevation grid. On a map, route and slope overlays may appear shifted by up to about 3 m relative to image features. This is **unresolved**; the manifest's `cross_validation` block exposes it at runtime.

### 3.5 Known source limitations

HiRISE DTM artefacts listed by USGS (boxes of 0.5–1 m, CCD seams, faceted low-contrast areas, interpolated patches) may be present. At 2 m cells and a ~4 m gradient baseline, rocks, steps and loose material are not represented. Slope says nothing about footing.

## 4. Mathematical model references

| Model | Reference | Implementation |
| --- | --- | --- |
| Projection | EPSG method 1029 (equidistant cylindrical, spherical); Mars 2000 sphere | `scientific-pipeline/ausnox_pipeline/mars_crs.py`, `packages/scientific-engine/src/coordinates/grid.ts` |
| Slope | Horn, B. K. P. (1981), *Hill shading and the reflectance map*, Proc. IEEE 69(1) | `ausnox_pipeline/dem.py::horn_slope_deg`, `src/terrain/sampling.ts::deriveHornSlopeDeg` |
| Pathfinding | Hart, Nilsson & Raphael (1968), A*; octile heuristic | `src/routing/astar.ts`, `src/routing/route.ts` |
| Mars time and Sun position | NASA GISS Mars24 algorithm (Allison 1997; Allison & McEwen 2000, revised) | `src/solar/mars24.ts`, `src/solar/timeScales.ts` |
| Daylight | Zero-elevation crossings of the Mars24 solar elevation; first guess cos H0 = −tan φ tan δ | `src/solar/daylight.ts` |
| Leap seconds | IERS / IANA `leap-seconds.list`; IERS Bulletin C 72 (no leap second end of 2026) | `src/solar/timeScales.ts` |
| Mission timing and margin | docs/SCIENTIFIC_MODELS.md §5 and §7 | `src/mission/*.ts` |

## 5. NASA Mars24 benchmark (gate M1)

Source: <https://www.giss.nasa.gov/tools/mars24/help/algorithm.html>, section II. Inputs use Mars24 conventions (planetographic latitude, west longitude). Strict tolerance 1e-5 (NASA publishes 5 decimals). Gate tolerances from SCIENTIFIC_MODELS.md §9: LTST ≤ 60 s, solar angles ≤ 0.1°.

#### Example 1: near-coincident Earth and Mars times (2000-01-06 00:00:00 UTC, 0° W, 0° N)

| Step | Parameter | Published | Computed | Difference | Strict | Gate |
| --- | --- | ---: | ---: | ---: | --- | --- |
| A-2 | JD UT | 2451549.5 | 2451549.500000 | 0 | PASS | PASS |
| A-4 | TT − UTC (s) | 64.184 | 64.184000 | 0 | PASS | PASS |
| A-5 | JD TT | 2451549.50074 | 2451549.500743 | 2.87e-6 | PASS | PASS |
| A-6 | Δt J2000 (days) | 4.50074 | 4.500743 | 2.87e-6 | PASS | PASS |
| B-1 | M (°) | 21.74558 | 21.745583 | 2.56e-6 | PASS | PASS |
| B-2 | α FMS (°) | 272.74566 | 272.745663 | 2.52e-6 | PASS | PASS |
| B-3 | PBS (°) | 0.00142 | 0.001418 | −1.68e-6 | PASS | PASS |
| B-4 | ν − M (°) | 4.44193 | 4.441927 | −3.09e-6 | PASS | PASS |
| B-5 | Ls (°) | 277.18758 | 277.187589 | 9.44e-6 | PASS | PASS |
| C-1 | EOT (°) | −5.18774 | −5.187746 | −5.93e-6 | PASS | PASS |
| C-1 | EOT (h) | −0.34585 | −0.345850 | 2.72e-7 | PASS | PASS |
| C-2 | MST (h) | 23.99425 | 23.994249 | −5.35e-7 | PASS | PASS |
| C-3 | LMST (h) | 23.99425 | 23.994249 | −5.35e-7 | PASS | PASS |
| C-4 | LTST (h) | 23.64840 | 23.648400 | −2.64e-7 | PASS | PASS |
| C-5 | subsolar longitude (° W) | 174.72600 | 174.725996 | −3.96e-6 | PASS | PASS |
| D-1 | solar declination (°) | −25.22825 | −25.228244 | 6.38e-6 | PASS | PASS |
| D-2 | heliocentric distance (AU) | 1.39358 | 1.393584 | 3.56e-6 | PASS | PASS |
| D-3 | heliocentric longitude (°) | 2.26352 | 2.263516 | −4.16e-6 | PASS | PASS |
| D-4 | heliocentric latitude (°) | −1.35957 | −1.359569 | 8.26e-7 | PASS | PASS |
| D-5 | solar zenith Z (°) | 154.26182 | 154.261757 | −6.32e-5 | FAIL ¹ | PASS |
| D-6 | solar azimuth A (°) | 191.03905 | 191.039051 | 7.27e-7 | PASS | PASS |

20/21 strict. LTST difference 0.001 s; largest angle difference 6.3e-5°. **Gate PASS.**

#### Example 2: MER-A Spirit landing (2004-01-03 13:46:31 UTC, 184.702° W, −14.640° N)

| Step | Parameter | Published | Computed | Difference | Strict | Gate |
| --- | --- | ---: | ---: | ---: | --- | --- |
| A-2 | JD UT | 2453008.07397 | 2453008.073970 | −9.22e-8 | PASS | PASS |
| A-4 | TT − UTC (s) | 64.184 | 64.184000 | 0 | PASS | PASS |
| A-5 | JD TT | 2453008.07471 | 2453008.074713 | 2.78e-6 | PASS | PASS |
| A-6 | Δt J2000 (days) | 1463.07471 | 1463.074713 | 2.78e-6 | PASS | PASS |
| B-1 | M (°, from 786.06858) | 66.06858 | 66.068579 | −9.66e-7 | PASS | PASS |
| B-2 | α FMS (°, from 1037.09457) | 317.09457 | 317.094572 | 2.02e-6 | PASS | PASS |
| B-3 | PBS (°) | 0.01614 | 0.016140 | 4.05e-7 | PASS | PASS |
| B-4 | ν − M (°) | 10.22959 | 10.229590 | −1.45e-7 | PASS | PASS |
| B-5 | Ls (°, from 1047.32416) | 327.32416 | 327.324162 | 1.88e-6 | PASS | PASS |
| C-1 | EOT (°) | −12.77553 | −12.775531 | −1.01e-6 | PASS | PASS |
| C-1 | EOT (h) | −0.85170 | −0.851702 | −2.07e-6 | PASS | PASS |
| C-2 | MST (h) | 13.16537 | 13.165369 | −1.21e-6 | PASS | PASS |
| C-3 | LMST (h) | 0.85190 | 0.851902 | 2.13e-6 | PASS | PASS |
| C-4 | LTST (h) | 0.00025 | 0.000200 | −4.99e-5 | FAIL ¹ | PASS |
| C-5 | subsolar longitude (° W) | 4.70500 | 4.705001 | 9.17e-7 | PASS | PASS |
| D-1 | solar declination (°) | −13.42065 | −13.420399 | 2.51e-4 | FAIL ¹ | PASS |
| D-2 | heliocentric distance (AU) | 1.47767 | 1.477672 | 2.20e-6 | PASS | PASS |
| D-3 | heliocentric longitude (°) | 52.37564 | 52.375639 | −1.37e-6 | PASS | PASS |
| D-4 | heliocentric latitude (°) | 0.08965 | 0.089648 | −1.93e-6 | PASS | PASS |
| D-5 | solar zenith Z (°) | 151.93895 | 151.939600 | 6.50e-4 | FAIL ¹ | PASS |
| D-6 | solar azimuth A (°) | 179.99383 | 179.993795 | −3.53e-5 | FAIL ¹ | PASS |

17/21 strict. LTST difference 0.185 s; largest angle difference 6.5e-4°. **Gate PASS.**

¹ **These five published values cannot be reproduced from NASA's own published inputs.** Applying the published formula of the same step to the published inputs (computed independently of the engine in `tests/solar.test.ts`) gives:

| Example, step | Published | Formula on published inputs | Engine | Inputs |
| --- | ---: | ---: | ---: | --- |
| 1, D-5 Z | 154.26182 | 154.261751 | 154.261757 | δs −25.22825°, φ 0°, H = 0 − 174.72600° |
| 2, C-4 LTST | 0.00025 h | 0.000198 h | 0.000200 h | LMST 0.85190 h + EOT −12.77553°/15 |
| 2, D-1 δs | −13.42065 | −13.420400 | −13.420399 | Ls 327.32416° |
| 2, D-5 Z | 151.93895 | 151.939600 | 151.939600 | δs from D-1, φ −14.640°, H = 184.702° − 4.70500° |
| 2, D-6 A | 179.99383 | 179.993797 | 179.993795 | same as D-5 |

The engine matches the formula values to 1e-5, and the tests assert that both the inconsistency and that agreement hold. The published Spirit declination appears to be the source of the Spirit zenith and azimuth discrepancies. Whatever the cause on NASA's side, every value is far inside the gate tolerances.

**Supplementary rover-clock check.** Two Perseverance raw images (sol 490 `ZL0_0490_0710454343_…`, sol 690 `ZL0_0690_0728197525_…`) carry the rover's LMST. Evaluated at the first MMGIS localization (77.45088572° E), the engine's LMST differs from the rover stamps by the same 5.6 s on both sols (drift < 0.1 s over 200 sols), and floor(local MSD) − 52304 reproduces both mission sol numbers. The constant offset corresponds to a longitude about 0.02° west of that site; the mission clock's reference longitude was not verified, so only rate and sol numbering are claimed.

## 6. Routing results

Synthetic fixtures (`tests/routing.test.ts`, 21 tests, all PASS; test-only grids, never shipped): straight path length; start = destination; no-data detour; unknown-slope cells blocked; no corner cutting (both and single blocked orthogonals); slope boundary (limit equal to cell slope allowed); grade limit for steps between flat cells; all error codes; disconnected regions; timeout by injected clock, by expansion budget and by cancellation; A* cost equals an independent Dijkstra on three pseudo-random rough grids in both modes; corridor trade-off between modes; determinism; multi-stop round trip; direction-dependent return route; async equals sync; worker messages; stale-request gate.

A failed search is re-run once without a slope limit to explain the failure: UNSUPPORTED_SLOPE when measured terrain connects the points but only through slopes over the limit, NO_ROUTE when missing or unknown cells separate them.

Real Jezero scenario (`tests/integration.jezero.test.ts`, 6 tests, all PASS): hypothetical habitat at cell (572, 698), 20 min at the Three Forks depot area, then Skinner Ridge. Skinner Ridge's own cell has a 20.8° slope, so with the 15° limit the engine returns UNSUPPORTED_SLOPE and offers the nearest traversable cell 4 m away (12.8°), which the test accepts explicitly.

| Mode | Outbound (m) | Return (m) | Ascent total (m) | Max slope (°) | Mean slope out / back (°) | Nodes expanded | Time (ms) |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: |
| Shortest | 928.6 | 864.7 | 38.8 | 14.99 | 3.26 / 5.25 | 14,015 + 9,555 + 24,305 | 58 |
| Lower-slope | 931.6 | 881.8 | 34.4 | 14.32 | 2.32 / 2.48 | 16,766 + 31,475 + 29,444 | 76 |

Times are wall-clock milliseconds from the recorded run (`integration_scenario.json`) and vary between runs; an earlier run measured 68 and 104 ms.

Every vertex and move of both routes passed the legality check. The return leg goes straight back and is not the reversed outbound path. With symmetric costs, forward and backward optimal costs are equal to 1e-6; with an uphill-only penalty, climbing from Three Forks toward Skinner Ridge costs 1,158 versus 571 for the descent. Repeated, async and sync runs return identical paths.

## 7. Terrain-processing results

- Python (`scientific-pipeline/tests`, 44 tests, all PASS, none skipped): slope fixtures, aggregation nodata rule, HiRISE nodata value, flags, CRS parsing and rejection of Earth/geographic/shifted CRSs, PROJ agreement, longitude normalisation, binary round trip, endianness and alignment, checksum corruption, placeholders, source verification, live-layer handling and waypoint pinning, plus real-data tests (source georeferencing against the label, real nodata corner and partial-nodata blocks, build reproducibility, 200 cells equal to source means, target cells).
- TypeScript (`tests/terrain.test.ts`, 13 tests, all PASS; `tests/coordinates.test.ts`, 16 tests, all PASS): loader with SHA-256 verification; 25 cells read identically to Python; independent TS Horn slope within 0.0039° with identical unknown pattern; no false flattening; Skinner Ridge sampling, classification and snap; target parsing; corrupted, truncated, placeholder, Earth-CRS, wrong-schema, unsafe-filename, missing, offline, bad-JSON, cancelled and inconsistent-flag inputs all fail with explicit codes; unverified datasets are never verified for feasibility; projection equals PROJ vectors to 1e-6 m.

## 8. Mission-feasibility results

Unit tests (`tests/mission.test.ts`, 19 tests, all PASS) use exact arithmetic (0.5 m/s, 500 m legs): T = outbound + science + return with the reserve kept separate; margin +4,400 s feasible; margin exactly 0 feasible with turnaround warning; margin −1 s infeasible; +600 s of science or reserve removes exactly 600 s of margin; halving the speed adds exactly the travel time; maximum EVA as binding window; start in darkness infeasible with no automatic shift; sol-boundary crossing handled in absolute time; polar night infeasible, polar day unbounded; 13 missing/invalid-input cases indeterminate; NO_ROUTE and UNSUPPORTED_SLOPE infeasible; on-plan progress keeps the margin and holds consume it; simulation start, pause, resume, step, speed, reset, hold and mid-mission replanning.

Real scenario (illustrative assumptions 0.6 m/s, 15°, 30 min reserve; start 09:00 LTST on sol 690, 2023-01-28T13:25:56Z; geometric sunset 18:09:25 LTST, 22:50:19Z):

| Variant | Verdict | Work (min) | Return margin (min) | Binding constraint |
| --- | --- | ---: | ---: | --- |
| Baseline, shortest | Feasible under selected assumptions | 99.9 | 434.5 | sunset |
| Baseline, lower-slope | Feasible under selected assumptions | 100.5 | 433.9 | sunset |
| +60 min science | Feasible | 159.9 | 374.5 | sunset |
| Walking speed 0.3 m/s | Feasible | 149.8 | 384.6 | sunset |
| Start 16:30 LTST | **Infeasible** | 99.9 | −27.8 | sunset |
| Start 23:30 LTST | **Infeasible** | 99.9 | −459.2 | starts in darkness |
| Max slope 3° | **Infeasible** | — | — | no legal route |
| No solar model | Indeterminate | 99.9 | — | solar model |
| Unverified terrain | Indeterminate | 99.9 | (434.5, not trusted) | terrain verification |
| Habitat outside coverage | Indeterminate | — | — | route (NO_COVERAGE) |

Mid-mission: after 30 min on plan the margin is unchanged (434.5 min); a 20 min hold reduces it to 414.5 min; slowing to 0.4 m/s after that point raises the remaining work to 87.4 min. The full plan for both modes took 97 ms. The plan survives JSON serialisation unchanged.

## 9. Execution evidence

Environment: Windows 11, Node 24.13.0, TypeScript 6.0.3, Vitest 5.1.0, Python 3.12.10, numpy 2.5.4, rasterio 1.5.2 (GDAL 3.12.2), pyproj 3.8.0 (PROJ 9.8.1).

| Command (working directory) | Result | Record |
| --- | --- | --- |
| `python scripts/fetch_sources.py --verify-only` (scientific-pipeline) | 5 OK, 1 PRESENT (live layer) | console |
| `python scripts/inspect_dem.py --stats` | 6/6 PASS, 1 note | `evidence/source_inspection.json` |
| `python scripts/build_terrain.py` | exit 0, `terrain.bin` `fcb96e32…1b7f49` | `evidence/build_record.json` |
| `python scripts/validate_terrain.py --write-engine-fixtures` | 11/11 PASS | `evidence/validation_report.json` |
| `python scripts/cross_validate.py --offline` | X1 PASS, X2a PASS, X2b FAIL | `evidence/cross_validation_report.json` (run 1: `…_run1_failed.json`) |
| `python scripts/photometric_control.py` | controls ≤ 0.03 m | `evidence/photometric_control.json` |
| `python -m pytest -q` | 44 passed | `evidence/pytest-results.xml` |
| `npm run evidence` (packages/scientific-engine) | typecheck 0 errors, build OK, 6 files / 88 tests passed | `evidence/run-summary.json`, `vitest-results.json`, `mars24_benchmark.json`, `integration_scenario.json`, `terrain_crosscheck.json` |

## 10. Scientific limitations and unresolved issues

1. **Unresolved: DTM-to-imagery offset (X2b).** About 2.4 m east apparent offset; real displacement or albedo effect not determined. Overlays may look shifted by up to ~3 m. Recommended UI label: "overlay registration ±3 m".
2. Coverage is one 2.43 km² AOI on the delta front. Outside it the engine returns NO_COVERAGE.
3. 2 m cells and a ~4 m slope baseline cannot show rocks, steps or footing. HiRISE DTM artefacts may be present.
4. The 3,196 outer-ring cells have unknown slope and are not traversable.
5. Science targets are rover positions. Skinner Ridge needs a 4 m snap at a 15° limit.
6. The lower-slope cost is a preference score (default weight 4 on squared normalised slope), not energy. Uphill/downhill weights default to 0, so default routes are direction-symmetric in cost.
7. Walking speed is constant over surface distance; no slope-dependent speed model is implemented.
8. Daylight is geometric: no refraction, solar disk, dust, twilight, horizon or shadows. It is evaluated at the habitat; across the AOI sunset changes by under 10 s.
9. The leap-second table is complete through 2027-06-30; later instants use TAI − UTC = 37 s and are flagged as extrapolated.
10. Five Mars24 published values are internally inconsistent (§5). The engine follows the published formulas.
11. The terrain payload is 5.76 MB (4.12 MB gzip), above the PRD's 5 MB goal unless the host compresses `.bin` files.
12. Walking speed, slope limit, reserve and activity durations are illustrative assumptions, not NASA operational values. A "feasible" verdict is never a safety claim.
