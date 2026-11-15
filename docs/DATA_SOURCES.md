# AUSNOX — NASA / USGS DATA SOURCE REGISTER
Version: 1.0 | 2026-11-14 | **Candidate register, ingestion not yet performed**

## 1. Data integrity contract

A URL is not evidence that a dataset has been downloaded, georeferenced or integrated. Each consumed layer/product MUST record: mission/instrument, exact product ID/URL, download UTC, SHA-256, provider, observation date/epoch, horizontal/vertical reference, resolution, coverage, no-data policy, transformation script/version, license/redistribution rules, and display attribution.

Display one of **OBSERVED / DERIVED / SIMULATED / HISTORICAL CONTEXT / UNKNOWN** in the UI. Never use "live" or "real-time weather" for static observations or modeled conditions.

### P0 dataset selection gate

Before planning a route, independently demonstrate that one chosen high-resolution DEM covers the same exact subset of Jezero as the image mosaic and selected sample science destination. Use raster bounds **in the same Mars CRS**. A named Jezero product does not automatically cover the entire crater.

## 2. Candidate sources and use

| Source / mission | What it can provide | Ausnox role | Status / caution |
| --- | --- | --- | --- |
| [NASA Mars Trek WMTS](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars) (NASA/JPL) | Georeferenced MRO HiRISE/CTX, MOLA, THEMIS and other tiled raster layers | P0 visual imagery + scientific layers | **Integrated (2026-11-15)**: HiRISE, CTX and MOLA basemaps; tile matrix verified (X2a PASS), CORS `*`, no key. See §9 |
| [USGS Mars Sample Return HiRISE mosaics](https://www.usgs.gov/data/mars-sample-return-hirise-mosaics-terrain-relative-navigation) | Jezero-region HiRISE stereo-derived digital terrain models, orthoimages and confidence products (2025) | P0 candidate numeric terrain raster | Not used. The shipped terrain comes from the 2020 Mars 2020 TRN HiRISE DTM mosaic (DOI 10.5066/P9REJ9JN), see §9 |
| [USGS Astrogeology product page](https://astrogeology.usgs.gov/search/map/mars-sample-return-terrain-relative-navigation-hirise-dtm-mosaic) | Download links, provenance, orthophoto, DTM/confidence mosaic | Alternative entry to above release | Verify exact asset and usable raster size |
| [NASA PDS MOLA MEGDR](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html) — Mars Global Surveyor | Global elevation/topography | Broader context, separate mission and optional cross-check | **Too coarse alone for small obstacle/footstep safety**. MOLA is shown as the Mars Trek colour hillshade (context only, never mixed with the DTM) |
| [NASA Mars24](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html) | Timekeeping/season/solar-position reference equations and worked examples | P0 solar model source | **Implemented and validated** in the engine (gate M1 PASS); used for the daylight window |
| [ASU Mars Odyssey THEMIS](https://mars.asu.edu/data/) | Historic thermal-infrared day/night mosaics | P1 context layer; optionally P0 if integrated correctly | Infrared values are not current atmospheric temperature; verify product meaning |
| [NASA PDS Perseverance MEDA archive](https://pdsatmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html) | Historic localized rover pressure, temperature, wind, irradiance observations | P1 historic location/time panel | **Not** a Jezero-wide real-time forecast; not a particle-radiation dosimeter |
| [NASA PDS CRISM / MRO](https://pds-imaging.jpl.nasa.gov/) | Spectral/mapped hydrated-mineral context where verified | P1 candidate science layer | Coverage/interpretation/product access must be confirmed |
| Curiosity RAD / MSL via PDS | Ionizing-particle exposure at **Gale** crater | Later explanatory context only | Must never imply measurements at Jezero |

These entries are **source candidates**, not assertions of feature completion. Core Mars imagery and DEM sources originate from NASA mission products even when hosted/processed by USGS.

## 3. Verified Mars Trek identifiers for evaluation

Published layer catalog includes (do not assume browser load until checked):
- **MRO HiRISE Jezero controlled mosaic**: JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd
- **MRO CTX Jezero mosaic**: JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0
- **MGS MOLA color hillshade**: Mars_MGS_MOLA_ClrShade_merge_global_463m
- **MOLA/HRSC hillshade blend**: Mars_MOLA_blend200ppx_HRSC_Shade_clon0dd_200mpp_lzw
- **MOLA roughness**: mola_roughness

**Important:** 25 cm imagery resolution does NOT mean a 25 cm DEM. "Slope" must come from an actual numeric DEM. Mars Trek uses WMTS with layer-specific tile matrix sets, projections and file extensions; inspect GetCapabilities rather than hardcoding an Earth tile URL template. The HiRISE Jezero mosaic published footprint is a candidate area; verify intersection with chosen USGS raster in the same geodetic convention.

Published NASA catalog: https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars

## 4. Exact first-hour verification procedure

1. Go to the official challenge **Resources** tab: https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=resources . Record which actual NASA resource from this project matches the listing; include the link/screenshot in submission notes. **Status: PASS (2026-11-14)**: JPL Mars Trek and the Perseverance Raw Images Gallery are listed and used (`scientific-pipeline/evidence/challenge_resources.json`).
2. Open USGS source release; identify a manageable Jezero DTM file and associated orthoimage/confidence product. Log original file name, DOI **10.5066/P13CPYYU** for the cited 2025 release, file size, checksum and terms.
3. Run gdalinfo -json on the real file. Record CRS WKT, pixel dimensions, meters-per-pixel, corner coordinates, nodata value, planetary datum and uncertainty.
4. Inspect HiRISE Jezero and CTX WMTS metadata (GetCapabilities), confirm layers, tile matrix, image format, browser CORS, attribution and coordinate conventions (longitude east/west and 0–360 vs -180–180).
5. Reproject/crop only when transformation is justified and source vertical reference retained; record a bounding polygon in GeoJSON with longitude-east/latitude-north.
6. Overlay the DEM bounds against imagery and at least one candidate cited science waypoint. If no intersection, select another **real** AOI/product and document the change.
7. Generate and validate grid, slope, masks, derived metrics and manifest. A failed check prevents release.
8. Save small samples only after checking NASA/USGS asset reuse guidelines and any tile caching restrictions.
9. Write reproducible download and preprocessing commands and attribution. Avoid undocumented third-party mirrors.

## 5. Missing data, temporal claims and scientific caution

- A WMTS image is visual context, **not** necessarily a measurement raster.
- No-data and confidence-mask failures remain unknown and non-traversable by default; interpolation cannot silently create navigable coverage.
- Slope maps derive from DEM spatial samples; their resolution defines minimum observable feature size; **boulders/loose regolith/footing hazards may be invisible**.
- MOLA and HiRISE/CTX may differ in horizontal grid and vertical datum; don't combine elevation numerically without checks.
- THEMIS daytime/nighttime mosaics are historical IR measurements with their own geometry/calibration; not a forecast or direct suit thermal loading.
- MEDA and Curiosity RAD are different sensors on different rover missions and places. Do not substitute one for another.
- Sunrise/sunset are modeled local geometric values with season; not meteorological forecasts nor terrain-shadow predictions.

## 6. Source register template for each shipped product

~~~yaml
layer_id: jezero-dem-p0
status: not-yet-acquired
provider: USGS / NASA source mission
mission_instrument: MRO / HiRISE
product_id: TO_VERIFY
doi_or_citation: 10.5066/P13CPYYU
source_url: https://www.usgs.gov/data/mars-sample-return-hirise-mosaics-terrain-relative-navigation
retrieved_at_utc: null
sha256: null
horizontal_crs_wkt: null
vertical_reference: null
pixel_spacing_m: null
nodata_value: null
bounds_lon_east_lat_north: null
observation_epoch: null
processing_script: scripts/build_terrain.py
output_version: null
redistribution_reviewed: false
ui_credit: "MRO HiRISE-derived terrain via USGS (verify product)"
~~~

Do NOT promote any status to verified until evidence exists.

## 7. NASA Global Offers and costs

https://www.spaceappschallenge.org/2026/global-offers/

These are optional tools. Microsoft Planetary Computer and Meteomatics focus mainly on **Earth** datasets and are not suitable substitutes for Mars DEM or Mars weather. Azure/Google Cloud trials may require identity/payment verification, have time/usage limits and do not unlock NASA Mars observations. The MVP must not depend on trial credits or a billing card.

## 8. Attribution checklist

For every dataset used: original scientific team and mission; instrument; USGS transformation credits if applicable; exact image/product, URL and DOI; rights/attribution requirements; retrieved date; processed derivatives and algorithm attribution. For submission also credit map library, icons/fonts, Figma reference assets if actually reused, hosting, coding/AI tools, third-party media and audio. No NASA endorsement is implied.

## 9. Integration status (2026-11-15, `integration/ausnox-mvp`)

Statuses below are backed by recorded evidence (`docs/SCIENTIFIC_VALIDATION_REPORT.md`, `docs/INTEGRATION_REPORT.md`). §2–§6 above are kept as the original candidate analysis.

| Product | Mission / instrument | Used for in the app | Status | Evidence |
| --- | --- | --- | --- | --- |
| USGS HiRISE DTM mosaic for Mars 2020 TRN, `JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif`, DOI 10.5066/P9REJ9JN | MRO / HiRISE | Elevation, slope, A* routing, profiles, DTM relief, overlays (2 m grid of one 2.43 km² AOI) | **Integrated** | S1–S3 PASS; SHA-256 checked at every load |
| Mars Trek `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd` | MRO / HiRISE | Default basemap | **Integrated** | X2a PASS; live tiles 200, CORS `*` |
| Mars Trek `JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0` | MRO / CTX | Context basemap | **Integrated** | live tiles 200, CORS `*`; registration against the DTM not measured |
| Mars Trek `Mars_MGS_MOLA_ClrShade_merge_global_463m` | MGS / MOLA | Regional context basemap | **Integrated** | live tiles 200, CORS `*` |
| NASA/JPL MMGIS `M20_waypoints.json` (RMC 32_1184, 26_1004) | Mars 2020 / Perseverance | Two cited science targets (rover positions) | **Integrated** | engine target validation; V10 |
| Perseverance raw-image metadata (sols 490, 690) | Mars 2020 | Links targets to sols; rover-clock check of Mars24 | **Used in validation** | `tests/solar.test.ts` |
| USGS CTX DTM mosaic `JEZ_ctx_B_soc_008_DTM_…_20m` | MRO / CTX | Vertical cross-check X1 only | **Validation only**, not shipped | X1 PASS |
| THEMIS, MEDA, CRISM, RAD | — | — | **Planned**, not ingested | — |

Unresolved: check X2b (DTM vs imagery registration) **FAIL**, apparent offset 2.3–3.2 m east. Shown in the UI as "overlay registration ±3 m"; no correction applied.

Runtime access: Mars Trek tiles are fetched directly by the browser (public, no key, CORS open); all other data ship with the app. No account, API key, trial credit or backend is needed.
