# AUSNOX — TECHNICAL ARCHITECTURE
Version: 1.0 | Target architecture, not implemented

## 1. System principle: static-first, scientific data prepared offline

There is no server-side routing service, user database or always-on Python API in P0. A deterministic offline Python geospatial pipeline creates a small, checked-in or deployable **processed Jezero AOI**. The React app loads that versioned grid and NASA imagery (online WMTS plus authorized local fallback), runs route/solar calculations in TypeScript, and renders layers. A Web Worker is recommended for heavy A* so UI remains responsive.

~~~mermaid
flowchart TB
 NASA1["NASA Mars Trek: mission imagery WMTS"] --> MAP["React + Leaflet map"]
 NASA2["USGS/PDS HiRISE DEM and metadata"] --> PIPE["Python Rasterio / GDAL preprocessing"]
 NASA3["MOLA / other cited NASA mission products"] --> PIPE
 PIPE --> CHECK["CRS + nodata + coverage + science validations"]
 CHECK --> BUNDLE["Static AOI grid, mask, metadata, GeoJSON"]
 BUNDLE --> APP["React + TypeScript + Vite"]
 APP --> MAP
 APP --> ROUTE["Web Worker A*: outbound + return"]
 APP --> SOL["Mars24-derived solar / mission simulator"]
 ROUTE --> UI["Route comparison, status, provenance"]
 SOL --> UI
 MAP --> UI
~~~

## 2. Framework choices

- **Frontend:** React 19 (or current supported version verified during scaffolding), TypeScript strict, Vite, React Router only if separate pages are warranted.
- **UI:** Tailwind CSS + shadcn/ui or accessible custom primitives, Lucide icons; all colors/tokens are adjustable by Fable.
- **Map:** Leaflet + React Leaflet, **custom Mars CRS/WMTS tile grid**. Never assume Leaflet's default EPSG:3857 Earth projection. A map library switch requires documented CRS fidelity tests.
- **State:** Zustand or React state; route results keyed by dataset, start/end, stops, preferences and assumptions.
- **Charts:** Recharts or SVG elevation profile; units explicit in meters/km/degrees.
- **Compute:** pure TS route/safety modules; optional Web Worker and cancellable requests.
- **Prep:** Python 3.11+, rasterio/GDAL, numpy, pyproj, optional shapely; sourced raster binaries stored outside Git.
- **Data:** versioned JSON/GeoJSON/typed arrays. No live runtime dependence on NASA search endpoints.
- **Deployment:** static assets on Vercel or GitHub Pages; preserve relative asset paths/base configuration.

## 3. Data folders and module contracts

~~~text
/
  README.md
  docs/
    MASTERPLAN.md, PRD.md, ARCHITECTURE.md ...
  public/
    data/jezero/
      manifest.json
      grid.bin (or terrain.json during first working pass)
      slope.bin (optional)
      science-targets.geojson
      preview.webp (only if redistribution permitted)
  scripts/
    inspect_dem.py
    build_terrain.py
    validate_terrain.py
  src/
    components/map/
    components/planner/
    components/mission/
    components/provenance/
    engines/astar.ts
    engines/terrain.ts
    engines/mars-time.ts
    engines/mission.ts
    workers/route.worker.ts
    data/schema.ts
    state/mission.ts
    App.tsx
  tests/
    fixtures/
    astar.test.ts
    mars-time.test.ts
    mission.test.ts
~~~

**Never commit original large rasters**, confidential tokens or copyrighted raw imagery absent a redistribution review. Use provenance documents and small derived artifacts with documented rights. Document exact instructions for re-deriving the bundle.

### Example data contracts (illustrative; validate before production)

~~~json
{
  "schema_version": "1.0.0",
  "aoi_id": "jezero-p0",
  "status": "candidate-unverified",
  "source": {
    "url": "https://www.usgs.gov/data/mars-sample-return-hirise-mosaics-terrain-relative-navigation",
    "product_id": "SET_AFTER_DOWNLOAD",
    "sha256": "SET_AFTER_DOWNLOAD",
    "retrieved_utc": "SET_AFTER_DOWNLOAD",
    "license": "VERIFY_PER_ASSET"
  },
  "crs": {
    "source_wkt": "SET_AFTER_INSPECTION",
    "grid_crs_wkt": "SET_AFTER_INSPECTION",
    "datum": "SET_AFTER_INSPECTION",
    "planet_radius_m": 3396190
  },
  "grid": {
    "width": 0,
    "height": 0,
    "cell_size_m": 0,
    "origin_x_m": 0,
    "origin_y_m": 0,
    "nodata_code": -32768,
    "row_direction": "north-to-south",
    "elevation_units": "m"
  },
  "routing": {
    "valid_cell_count": 0,
    "max_supported_area_km2": 0
  },
  "provenance": {
    "model": "slope-from-dem",
    "build_command": "SET_AFTER_IMPLEMENTATION",
    "created_utc": "SET_AFTER_IMPLEMENTATION"
  }
}
~~~

These zeroes and SET_* are non-operational placeholders. A successful build must reject them, never silently use them.

A grid cell needs at minimum: elevation_m or nodata; valid/no-data mask; slope_deg or unknown; terrain_penalty computed at runtime. Store grid coordinates in **projected meters** for path distances and apply an explicit, tested transform when mapping to Mars geographic coordinates. Coordinate order must be documented (longitude, latitude for GeoJSON; x, y in projected grid). Do not assume an Earth ellipsoid.

Science GeoJSON properties: unique id, title, longitude east, latitude north, source URL, source_product, observation or literature basis, label_quality and optional task duration. DEM footprint GeoJSON likewise includes source and precision.

## 4. Data acquisition and rendering integration

1. Inspect product metadata with GDAL (gdalinfo) including dimensions, CRS, pixel scale, nodata, vertical datum, rotation, bounds, source uncertainty.
2. Choose an AOI **within actual DEM and imagery overlap**; do not assume the source covers an arbitrary preset.
3. Use projection-aware cropping/reprojection to projected metric grid; retain masks and avoid upsampling low-resolution data into falsely high-resolution hazards.
4. Calculate gradients/slope with nodata-aware neighbors, note edge uncertainty; store source resolution and mask.
5. Add a runtime data-integrity check (schema_version, hash or manifest fields, dimensions, finite values, bounds and mandatory provenance).
6. Register WMTS GetCapabilities and inspect **Mars CRS, tile matrix set, resolution, Y direction, coordinate conventions, CORS and cache/attribution rules**. Leaflet standard TileLayer URL placeholders are **not** guaranteed to match WMTS scheme.
7. Default to online imagery; on failure present authorized local static preview and "imagery unavailable"; routing can continue only where verified grid exists.
8. Gate 3D on validated height/datum mapping and correct Mars globe ellipsoid; never exaggerate terrain without a visible label.

## 5. Computing lifecycle

- Every change to start, end, stop, selected dataset or assumptions invalidates stale route and safety state.
- Placement flow: transform map longitude/latitude → projected grid → valid cell. If invalid, show reason and optional nearest valid candidate, but **require confirmation** to snap.
- Route engine returns discriminated union: success with outbound/return arrays and cost breakdown; or failure code (NO_COVERAGE, NO_DATA, NO_ROUTE, UNSUPPORTED_SLOPE, TIMEOUT, INVALID_INPUT).
- Optimize A* with binary heap; 4/8 neighbors as configured; diagonal corner-cut prevention. Outbound and return both routed; return may have asymmetric slope cost.
- Compute only a legal round trip, or "indeterminate/infeasible" with cause.
- Calculate daylight and simulation state in separately testable pure functions; do not read system clock during unit tests.
- UI never treats web tile availability as proof of grid routing coverage.
- Worker results carry requestId and AOI manifest version; discard results from stale requests.

### Suggested TS result schema

~~~typescript
type RouteResult =
  | { status: "ok"; outbound: Leg; inbound: Leg;
      totalDistanceM: number; totalTravelSeconds: number;
      maxSlopeDeg: number; datasetId: string; modelVersion: string; }
  | { status: "error";
      code: "NO_COVERAGE" | "NO_DATA" | "NO_ROUTE" | "INVALID_INPUT" | "TIMEOUT";
      detail: string; };
type Feasibility = "feasible" | "infeasible" | "indeterminate";
~~~

Do not reuse legacy Earth GeoJSON projections without demonstrating consistent transformed geographic coordinates.

## 6. Runtime responsibilities

| Concern | Owner | Offline? |
| --- | --- | --- |
| Mars Trek map tiles | Public WMTS, with compliant fallback | Fallback only |
| Processed AOI routing grid | Public static assets | Yes after load |
| A* and route metrics | TypeScript/Worker | Yes |
| Mars clock and model | TypeScript | Yes |
| Science target cards | Local cited GeoJSON | Yes |
| Historic weather/thermal | Optional local cited dataset | If packaged |
| 3D | P1 optional, Cesium or local heightmesh | Depends on chosen implementation |

No environment variable may be required just to load the P0 local terrain. Optional keys/credits for 3D or cloud services must be kept server-side if secret, never hardcoded into a public bundle. Public restricted tokens need documented quotas and scope.

## 7. Failure handling, budgets and deployment

Gracefully distinguish: network tiles down, missing asset, invalid manifest, CRS mismatch, no route, solar model error, unsupported region and insufficient margin. Use loading, retry and source badges; no infinite spinners or false green safety indicators.

Set a finite AOI resolution and payload budget; compress assets; lazy-load map/3D; remove heavy charts if they delay the route. Deploy the static app, refresh deep links, verify HTTPS, map assets, CORS, offline/degraded scenario and mobile/tablet. Do not claim deployed until the actual URL was opened and tested.

## 8. Future architecture

FastAPI can be introduced **after** the hackathon if planet-scale preprocessing, shared mission persistence or heavy dynamic geoprocessing is needed. It is explicitly **not** part of this P0 architecture. References: DATA_SOURCES.md, SCIENTIFIC_MODELS.md, TESTING_AND_VALIDATION.md.
