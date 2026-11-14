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
| [NASA Mars Trek WMTS](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars) (NASA/JPL) | Georeferenced MRO HiRISE/CTX, MOLA, THEMIS and other tiled raster layers | P0 visual imagery + scientific layers | **Catalog confirmed; exact WMTS URL/CRS/CORS not runtime-tested** |
| [USGS Mars Sample Return HiRISE mosaics](https://www.usgs.gov/data/mars-sample-return-hirise-mosaics-terrain-relative-navigation) | Jezero-region HiRISE stereo-derived digital terrain models, orthoimages and confidence products (2025) | P0 candidate numeric terrain raster | **Product selection/download/coverage not tested**; USGS release marked CC0 1.0 |
| [USGS Astrogeology product page](https://astrogeology.usgs.gov/search/map/mars-sample-return-terrain-relative-navigation-hirise-dtm-mosaic) | Download links, provenance, orthophoto, DTM/confidence mosaic | Alternative entry to above release | Verify exact asset and usable raster size |
| [NASA PDS MOLA MEGDR](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html) — Mars Global Surveyor | Global elevation/topography | Broader context, separate mission and optional cross-check | **Too coarse alone for small obstacle/footstep safety** |
| [NASA Mars24](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html) | Timekeeping/season/solar-position reference equations and worked examples | P0 solar model source | Equations to implement and validate; not a ready-made forecast API |
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

1. Go to the official challenge **Resources** tab: https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=resources . Record which actual NASA resource from this project matches the listing; include the link/screenshot in submission notes. **Status currently UNVERIFIED**.
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
