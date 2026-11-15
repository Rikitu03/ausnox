# AUSNOX — SCIENTIFIC DATA PIPELINE

Version 1.0 | 2026-11-15 | Branch `feat/scientific-engine`

This document explains how the shipped terrain asset in `public/data/jezero/` was produced from authentic NASA/USGS data, and how to reproduce it byte for byte. Every number below was observed while running the pipeline; the machine-readable records are in `scientific-pipeline/evidence/`.

## 1. Source datasets

| Key | Product | Provider / mission / instrument | Role | Bytes | SHA-256 | Retrieved (UTC) |
| --- | --- | --- | --- | ---: | --- | --- |
| `hirise_dtm` | `JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif` | USGS Astrogeology / MRO / HiRISE | Elevation (the only numeric input to routing) | 1,839,545,409 | `44c3819caa33922b06f7a8228534d1e32ab4087aca85144136d825c371c747d8` | 2026-11-14T14:12:08Z |
| `hirise_dtm_fgdc` | same name, `.xml` | USGS | FGDC metadata (accuracy, datum, lineage) | 18,939 | `5455f7a0638aadda8358fc78e2b8c20dac4fa67b59aa0412f2bfad6ca113b79b` | 2026-11-14T14:52:30Z |
| `hirise_dtm_pds3` | same name, `_pds3.lbl` | USGS | PDS3 label (dimensions, projection, conventions) | 2,296 | `99b972f7ea13f9e05e9d3f265435a0566b53dbde4088781673edeb0b6d24cade` | 2026-11-14T14:03:38Z |
| `ctx_dtm` | `JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif` | USGS / MRO / CTX | Independent vertical cross-check only; not shipped | 9,662,387 | `16a1aa66c3f48c1bca252795827db7b417876217aff0f5e1aff18027fab2327b` | 2026-11-14T14:52:29Z |
| `ctx_dtm_fgdc` | same name, `.xml` | USGS | Source of the 3.8 m CTX vertical registration figure | 15,749 | `91e3b93f58b08314f18d505ad85c708e82968025922bf223da5246316ddd4a9a` | 2026-11-14T14:52:30Z |
| `m20_waypoints` | `M20_waypoints.json` (MMGIS layer, through sol 2022) | NASA/JPL-Caltech / Mars 2020 | Rover-localized science target positions | 603,126 | `bd143ee69241229926abd373e6305b8bbb326d6b5a7b4a8d6935262696f93dc4` (live layer, see §3) | 2026-11-14T14:09:40Z |

Download URLs (all HTTPS, no account needed):

- HiRISE DTM: `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif` (also reachable through `https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/...`, which redirects there)
- CTX DTM: same bucket, `mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif`
- Waypoints: `https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json`

Imagery used only for validation (cached under `scientific-pipeline/data/cache/`, never committed or redistributed):

- NASA/JPL Mars Trek WMTS layer `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd`, 36 tiles at zoom 15.
- USGS orthomosaic `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif` (7.36 GB): only the 6,400 rows that cover the AOI, fetched as one 547,840,000-byte HTTP range.

## 2. Product identification and provenance

**Elevation.** *High-Resolution Imaging Science Experiment Digital Terrain Model Mosaic for Mars 2020 Terrain Relative Navigation.* Fergason, R. L., Galuszka, D. M., Hare, T. M., Mayer, D. P., Redding, B. L., Smith, E. D. (2020), U.S. Geological Survey, <https://doi.org/10.5066/P9REJ9JN>.

- Built by USGS with SOCET SET from six HiRISE stereo pairs (seven DTMs; the Jezero_CR pair was split in two), controlled to the Mars 2020 CTX DTM mosaic, mosaicked with a 40-pixel blend. Process date 2019-10-24, published 2020-07-24.
- FGDC accuracy statements: orthoimages co-registered better than 1.1 m (99th percentile, most overlapping pairs; better than 3 m for all pairs); median vertical offset from the CTX DTM about 0.4 m, CTX above HiRISE.
- FGDC access and use constraints: "None". Ausnox redistributes only a cropped, aggregated derivative and cites the authors.
- NASA/JPL Mars Trek catalogues the same product as *MRO HiRISE, Jezero DEM, Controlled* (item_UUID `c3935915-9abe-4d8c-a87c-b96d195a8cfd`). The catalog lists 1,839,718,122 bytes, so the Mars Trek file and the USGS GeoTIFF are not byte-identical packages; Ausnox uses the USGS file.

**Why this product and not the 2025 Mars Sample Return release (DOI 10.5066/P13CPYYU).** That release is a 5.47 GB zip (13.6 GB with images) that must be downloaded whole. The 2020 product is a 1.84 GB uncompressed GeoTIFF with HTTP range support, covers the Jezero delta front and the Three Forks depot area, and shares the USGS SOCET SET lineage. The 2025 release extends coverage westward to the crater rim; Ausnox does not need that area.

**Science targets.** Two NASA-documented Perseverance science locations, each taken unchanged from the MMGIS waypoint layer by its site/drive identifier (RMC) and linked to the sol of the activity through Perseverance raw-image metadata:

| Target | RMC | Rover position (lon E, lat N) | Rover-reported elev. (m) | Activity sol | NASA sources |
| --- | --- | --- | ---: | ---: | --- |
| Three Forks sample depot area | `32_1184` | 77.40844668, 18.45337179 | −2545.203 | 690 (final tube drop) | NASA Photojournal depot map; NASA depot news release |
| Skinner Ridge sampling site | `26_1004` | 77.40616768, 18.45889532 | −2520.852539 | 490 (coring) | NASA Science blog of 2022-07-11; "Meet the Mars Samples: Swift Run and Skyland" |

Each point is a rover position, not the exact sample tube, rock or borehole. `scientific-pipeline/config/jezero_p0.json` stores the full citations and caveats.

## 3. Download procedure

```powershell
cd scientific-pipeline
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe scripts\fetch_sources.py          # ~1.86 GB, resumable
.venv\Scripts\python.exe scripts\fetch_sources.py --verify-only
```

On Linux or macOS use `python3 -m venv .venv` and `.venv/bin/python`.

`fetch_sources.py` downloads into `scientific-pipeline/data/raw/` (git-ignored), resumes interrupted downloads with HTTP Range requests, moves a mismatching file aside instead of overwriting it, and verifies size and SHA-256 before a file is used. Exit code 0 means every selected product verified.

The waypoint file is a live layer: NASA appends new sols, so a later download has a different checksum. The build therefore checks the two records it uses by content. Their sol, longitude, latitude and elevation are pinned in `config/jezero_p0.json`, and the build stops if NASA revises either localization. The manifest records the size and SHA-256 of the waypoint file actually used.

## 4. Python environment

`scientific-pipeline/requirements.txt` pins the environment the shipped asset was built with:

| Package | Version | Purpose |
| --- | --- | --- |
| numpy | 2.5.4 | arrays, aggregation, slope |
| rasterio | 1.5.2 (bundles GDAL 3.12.2) | GeoTIFF reading, windows, vectorizing the coverage footprint |
| pyproj | 3.8.0 (PROJ 9.8.1) | independent reference for every coordinate check |
| certifi | 2026.10.23 | TLS verification for downloads |
| pytest | 9.2.0 | tests |

The asset was built with Python 3.12.10 on Windows. No separate GDAL installation is needed.

## 5. Pipeline commands (in order)

| Step | Command | Output |
| --- | --- | --- |
| 1. Fetch and verify sources | `python scripts/fetch_sources.py` | `data/raw/*` |
| 2. Inspect the source DTM against its labels | `python scripts/inspect_dem.py --stats` | `evidence/source_inspection.json` |
| 3. Build the asset | `python scripts/build_terrain.py` | `public/data/jezero/{manifest.json, terrain.bin, coverage.geojson, science-targets.geojson}`, `evidence/build_record.json` |
| 4. Validate the asset (gates S1–S3) | `python scripts/validate_terrain.py --write-engine-fixtures` | `evidence/validation_report.json`, `manifest.validation`, `packages/scientific-engine/tests/fixtures/proj_vectors.json` |
| 5. Cross-validate with CTX and imagery | `python scripts/cross_validate.py` (`--offline` reuses cached tiles) | `evidence/cross_validation_report.json`, `manifest.cross_validation` |
| 6. Photometric control experiment | `python scripts/photometric_control.py` | `evidence/photometric_control.json` |
| 7. Tests | `python -m pytest -q` | 44 tests |

Run step 3 before steps 4 and 5: the build writes a fresh manifest, and steps 4 and 5 then add their results to it. Step 5 downloads about 0.55 GB on its first run.

## 6. Coordinate reference and transformations

All products share one CRS, read from the GeoTIFF and checked against the PDS3 label and FGDC metadata (`inspect_dem.py`, checks L1–L5 and F1, all PASS):

| Property | Value |
| --- | --- |
| Body / datum | Mars, Mars 2000 IAU sphere, R = 3,396,190 m (ESRI 106971) |
| Projection | Equirectangular (EPSG method 1029, spherical), latitude of true scale 0°, central meridian 0°, no false origin |
| Latitude | planetocentric, north positive |
| Longitude | east positive, domain −180…180 |
| Source grid | 21,400 × 21,488 posts, 1 m, upper-left corner (4,577,366 m, 1,106,618 m), north up, float32, nodata −3.4028226550889045e38 |
| Vertical reference | heights relative to the Mars areoid ("MOLA topography, DeltaGeoid" in the USGS product name), metres |

Closed-form transforms used by both the pipeline and the TypeScript engine:

```text
x = R · cos(lat_ts) · (lon − lon_0)        y = R · lat           (radians; lat_ts = lon_0 = 0)
col = (x − origin_x) / cell_x              row = (origin_y − y) / cell_y     (row 0 = north, centre at +0.5)
ground east-west cell width = cell_x · cos(lat_row)                ground north-south height = cell_y
```

The closed form matches PROJ to 2.84e-9 m (check V6). Any other CRS is rejected (`ausnox_pipeline/mars_crs.py`), including Earth ellipsoids, geographic CRSs, false origins and non-zero standard parallels, so an Earth default can never be applied silently. Mars24 solar calculations need planetographic latitude and west-positive longitude; the engine converts explicitly (`tan φg = (a/b)² tan φc` with a = 3,396,190 m and b = 3,376,200 m).

## 7. Cropping, aggregation and slope

**Area of interest (AOI).** Source window columns 10,080–11,679 and rows 11,844–13,443, both offsets even so 2 × 2 blocks never straddle the edge. Geographic extent 77.3929888–77.4199817° E, 18.4425066–18.4694996° N; 1,517.7 m east-west × 1,600.0 m north-south on the ground; 2.43 km². The window contains no nodata posts, the flat crater floor (for a hypothetical habitat), the steep delta-front scarp (so the two routing modes can differ) and both science targets. It lies inside the Mars Trek HiRISE layer footprint.

**Aggregation.** 2 × 2 block mean to a 2 m grid (800 × 800 cells). A cell is missing if any of its four posts is missing; nothing is interpolated or partially averaged, and upsampling is never used.

**Slope.** Horn (1981) 3 × 3 finite differences with physical spacing per row:

```text
dz/dx = ((z3 + 2 z6 + z9) − (z1 + 2 z4 + z7)) / (8 · dx_row),   dx_row = 2 m · cos(lat_row) ≈ 1.897 m
dz/dy = ((z1 + 2 z2 + z3) − (z7 + 2 z8 + z9)) / (8 · dy),       dy = 2 m
slope = atan( sqrt((dz/dx)² + (dz/dy)²) ) in degrees
```

Slope is unknown (NaN) when the cell or any of its 8 neighbours lacks elevation, which includes the outer ring of the grid (3,196 cells). Unknown slope is never traversable. The gradient spans about 4 m, so rocks, steps and footing hazards smaller than a few metres are not represented.

**Result.** Elevation −2,559.27 to −2,443.77 m (mean −2,511.95 m). Slope 0.007° to 67.48° (median 4.41°, 90th percentile 14.62°, 99th percentile 29.13°); 9.5 % of cells with known slope exceed 15° and 2.0 % exceed 25°.

## 8. Output formats

`public/data/jezero/` (static files; the frontend never parses the source GeoTIFF):

| File | Bytes | gzip -9 | Content |
| --- | ---: | ---: | --- |
| `manifest.json` | ~9.9 k | ~4.2 k | Schema 1.0.0: source products with SHA-256, CRS, grid geometry and bounds, units, slope method, flags, binary layout and checksum, statistics, processing versions, validation and cross-validation results, disclaimer |
| `terrain.bin` | 5,760,000 | 4,116,243 | Little-endian sections, each 4-byte aligned, row 0 = north: `elevation_m` float32[640,000] (NaN = missing), `slope_deg` float32[640,000] (NaN = unknown), `flags` uint8[640,000] (bit0 ELEVATION_VALID, bit1 SLOPE_VALID) |
| `coverage.geojson` | ~2.2 k | ~0.6 k | AOI rectangle and the outline of cells with measured elevation (lon, lat) |
| `science-targets.geojson` | ~5.5 k | ~1.6 k | The two cited targets with DTM elevation and slope, rover-reported elevation, sources and caveats |

Shipped `terrain.bin` SHA-256: `fcb96e32bc854fff23d56ee4301bea7a77a38e892afc24ada6d0ce5aea1b7f49`.

The manifest refuses `SET_*` placeholders. The writer validates the manifest before writing, and both the Python reader and the TypeScript loader reject a binary whose SHA-256 does not match.

## 9. Validation commands and what they check

`validate_terrain.py` (11 checks, all PASS; `evidence/validation_report.json`):

| Check | What it proves |
| --- | --- |
| V1 | manifest schema valid; `terrain.bin` SHA-256 matches |
| V2 | no placeholders; required keys present |
| V3 | dimensions agree; flags agree exactly with the NaN encoding |
| V4 | every grid-edge cell has unknown slope |
| V5 | value ranges plausible; statistics match the data |
| V6 | closed-form projection equals PROJ (max 2.84e-9 m) |
| V7 | 2,004 cells re-read from the source with independent 2 × 2 windows equal the shipped values exactly |
| V8 | scalar Horn slope recomputed from fresh source reads matches shipped slope (max 1.64e-6°, 2,000 cells) |
| V9 | 5 known points: asset vs direct 1 m bilinear source sample within 0.5 m (max 0.107 m) |
| V10 | 132 NASA rover waypoints in the AOI: median elevation difference +0.001 m, 95th percentile 0.076 m; zero shift fits better than any ±1–3 cell shift |
| V11 | 2,000 cell centres → lon/lat (PROJ) → cell: max error 4.7e-10 cells |

`cross_validate.py` (supplementary; `evidence/cross_validation_report.json`): X1 CTX vs HiRISE PASS, X2a Mars Trek tiles vs USGS orthomosaic PASS, X2b photometric DTM-to-imagery registration FAIL (about 2.3–3.2 m east). See `docs/SCIENTIFIC_VALIDATION_REPORT.md` §3 for the full findings and the run history.

## 10. Reproducing the asset

1. Create the environment and fetch sources (§3, §4). Confirm `fetch_sources.py --verify-only` reports OK for every non-live product.
2. Run `inspect_dem.py --stats`, then `build_terrain.py`. The printed `terrain_bin_sha256` must equal `fcb96e32…1b7f49`. The same build on the same inputs is byte-identical; `tests/test_real_asset.py::test_build_is_reproducible` rebuilds into a temporary directory and compares `terrain.bin`, `coverage.geojson` and `science-targets.geojson`.
3. Run `validate_terrain.py --write-engine-fixtures` (expect `OVERALL: PASS (11/11)`), then `cross_validate.py` and `photometric_control.py`.
4. Run `python -m pytest -q` in `scientific-pipeline/` and `npm test` in `packages/scientific-engine/`.

If NASA revises one of the two referenced rover localizations, step 2 stops with `WaypointMismatchError`. Review the target, update the pinned values in `config/jezero_p0.json`, and record the change.
