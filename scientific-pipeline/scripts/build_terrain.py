#!/usr/bin/env python
"""Build the Ausnox Jezero terrain asset from the authentic HiRISE DTM mosaic.

Steps (all deterministic for a given source file and config):
  1. verify source size + SHA-256, inspect CRS / transform / nodata (fail closed)
  2. read the configured source window (1 m posts), keep nodata as NaN
  3. aggregate 2x2 posts by mean; any missing post -> missing cell (no interpolation)
  4. Horn slope with physical spacing (dx = 2 m * cos(lat), dy = 2 m); unknown where any neighbour is missing
  5. flags, statistics, coverage + science-target GeoJSON, manifest, terrain.bin

Usage:
  python scripts/build_terrain.py [--config config/jezero_p0.json] [--out ../public/data/jezero]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import platform
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
import pyproj  # noqa: E402
import rasterio  # noqa: E402
from affine import Affine  # noqa: E402
from rasterio import features  # noqa: E402
from rasterio.windows import Window  # noqa: E402

from ausnox_pipeline import PIPELINE_VERSION, TERRAIN_SCHEMA_VERSION  # noqa: E402
from ausnox_pipeline.dem import (  # noqa: E402
    FLAG_ELEVATION_VALID,
    FLAG_SLOPE_VALID,
    block_mean_fail_closed,
    build_flags,
    ground_cell_dx,
    horn_slope_deg,
    inspect_dem,
    read_window,
    row_center_latitudes,
)
from ausnox_pipeline.sources import (  # noqa: E402
    ASSET_DIR,
    EVIDENCE_DIR,
    HIRISE_DTM,
    M20_WAYPOINTS,
    PIPELINE_ROOT,
    file_fingerprint,
    verify_source,
)
from ausnox_pipeline.terrain_asset import TerrainArrays, write_asset, write_json  # noqa: E402
from ausnox_pipeline.waypoints import check_expected_waypoint, index_by_rmc  # noqa: E402

DISCLAIMER = (
    "Educational Marswalk planning simulation. Real NASA/USGS terrain data; mission constraints are "
    "illustrative. Not for operational navigation."
)


def _round(v: float, nd: int = 6) -> float:
    return float(round(float(v), nd))


def footprint_geojson(mask: np.ndarray, transform: Affine, crs) -> list[dict]:
    """Vectorize valid-elevation cells into lon/lat polygons (exact: the CRS is linear in lon/lat)."""
    feats = []
    for geom, value in features.shapes(mask.astype(np.uint8), mask=mask, transform=transform, connectivity=4):
        if int(value) != 1:
            continue
        rings = []
        for ring in geom["coordinates"]:
            rings.append([[_round(c, 9) for c in crs.inverse(x, y)] for x, y in ring])
        feats.append(rings)
    return feats


def build(config_path: Path, source_path: Path | None, waypoints_path: Path | None, out_dir: Path,
          check_hash: bool) -> dict:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    src = verify_source(HIRISE_DTM, source_path, check_hash=check_hash)
    wps_path = verify_source(M20_WAYPOINTS, waypoints_path, check_hash=check_hash)
    info = inspect_dem(str(src))
    crs = info.crs

    w = config["source_window"]
    factor = int(config["aggregation_factor"])
    if w["width"] % factor or w["height"] % factor:
        raise ValueError("Source window must be divisible by the aggregation factor.")
    window = Window(w["col_off"], w["row_off"], w["width"], w["height"])
    z1m, wt = read_window(str(src), window)
    missing_posts = int(np.count_nonzero(~np.isfinite(z1m)))

    z = block_mean_fail_closed(z1m, factor)
    height, width = z.shape
    src_dx, src_dy = info.pixel_size
    cell_x = src_dx * factor
    cell_y = src_dy * factor
    origin_x, origin_y = wt.c, wt.f
    lats = row_center_latitudes(origin_y, cell_y, height, crs.radius_m)
    dx_rows = ground_cell_dx(cell_x, lats, crs.lat_ts_deg)
    slope, _, _ = horn_slope_deg(z, dx_rows, cell_y)
    flags = build_flags(z, slope)

    elev32 = z.astype(np.float32)
    slope32 = slope.astype(np.float32)

    min_x, max_y = origin_x, origin_y
    max_x = origin_x + width * cell_x
    min_y = origin_y - height * cell_y
    west, south = crs.inverse(min_x, min_y)
    east, north = crs.inverse(max_x, max_y)

    ev = np.isfinite(elev32)
    sv = np.isfinite(slope32)
    slope_vals = slope32[sv].astype(np.float64)
    elev_vals = elev32[ev].astype(np.float64)

    # ---- coverage GeoJSON -------------------------------------------------------------
    agg_transform = Affine(cell_x, 0.0, origin_x, 0.0, -cell_y, origin_y)
    rings = footprint_geojson(ev, agg_transform, crs)
    aoi_ring = [[_round(west, 9), _round(south, 9)], [_round(east, 9), _round(south, 9)],
                [_round(east, 9), _round(north, 9)], [_round(west, 9), _round(north, 9)],
                [_round(west, 9), _round(south, 9)]]
    coverage = {
        "type": "FeatureCollection",
        "name": f"{config['aoi_id']}-coverage",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": "aoi-boundary",
                    "role": "routing-grid-extent",
                    "aoi_id": config["aoi_id"],
                    "source_product": HIRISE_DTM.filename,
                    "coordinate_order": "longitude-east, latitude-north (planetocentric, Mars 2000 sphere)",
                    "precision_note": "Exact grid edge; the projection is linear in longitude/latitude.",
                },
                "geometry": {"type": "Polygon", "coordinates": [aoi_ring]},
            },
            {
                "type": "Feature",
                "properties": {
                    "id": "elevation-coverage",
                    "role": "cells-with-measured-elevation",
                    "aoi_id": config["aoi_id"],
                    "source_product": HIRISE_DTM.filename,
                    "valid_cell_count": int(ev.sum()),
                    "precision_note": "Cell-edge outline of cells whose 2x2 source posts all carry elevation.",
                },
                "geometry": {"type": "MultiPolygon", "coordinates": rings},
            },
        ],
    }

    # ---- science targets ----------------------------------------------------------------
    wps = json.loads(Path(wps_path).read_text(encoding="utf-8"))["features"]
    wp_bytes, wp_sha = file_fingerprint(Path(wps_path))
    by_rmc = index_by_rmc(wps)
    target_features = []
    for t in config["science_targets"]:
        wp = by_rmc.get(t["rmc"])
        if wp is None:
            raise ValueError(f"Science target {t['id']}: RMC {t['rmc']} not found in waypoint file")
        p = wp["properties"]
        check_expected_waypoint(t["rmc"], p, t["expected_waypoint"])
        lon, lat = float(p["lon"]), float(p["lat"])
        x, y = crs.forward(lon, lat)
        col_f = (x - origin_x) / cell_x
        row_f = (origin_y - y) / cell_y
        col, row = math.floor(col_f), math.floor(row_f)
        if not (0 <= col < width and 0 <= row < height):
            raise ValueError(f"Science target {t['id']} lies outside the AOI")
        if (flags[row, col] & (FLAG_ELEVATION_VALID | FLAG_SLOPE_VALID)) != (FLAG_ELEVATION_VALID | FLAG_SLOPE_VALID):
            raise ValueError(f"Science target {t['id']} is on a cell without elevation/slope")
        target_features.append({
            "type": "Feature",
            "properties": {
                "id": t["id"],
                "title": t["title"],
                "lon_east": lon,
                "lat_north": lat,
                "grid_cell": {"row": row, "col": col},
                "elevation_dtm_m": _round(elev32[row, col], 3),
                "slope_dtm_deg": _round(slope32[row, col], 3),
                "rover_reported_elev_geoid_m": float(p["elev_geoid"]),
                "rover_rmc": t["rmc"],
                "rover_waypoint_sol": int(p["sol"]),
                "rover_waypoint_note": p.get("Note"),
                "observation_sol": t["observation_sol"],
                "observation_utc_date": t["observation_utc"],
                "label_quality": t["label_quality"],
                "category": "observed-location",
                "suggested_activity_min": t["suggested_activity_min"],
                "suggested_activity_is_simulated": True,
                "description": t["description"],
                "basis": t["basis"],
                "source_product": f"{M20_WAYPOINTS.filename} (NASA/JPL MMGIS), RMC {t['rmc']}",
                "sources": t["sources"],
                "caveats": t["caveats"],
            },
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
        })
    targets = {"type": "FeatureCollection", "name": f"{config['aoi_id']}-science-targets", "features": target_features}

    # ---- manifest -----------------------------------------------------------------------
    pct = lambda q: _round(np.percentile(slope_vals, q), 4)  # noqa: E731
    manifest = {
        "schema_version": TERRAIN_SCHEMA_VERSION,
        "asset_type": "ausnox-terrain-grid",
        "aoi_id": config["aoi_id"],
        "title": config["title"],
        "category": "derived",
        "source": {
            "products": [
                {
                    "key": HIRISE_DTM.key,
                    "role": "elevation",
                    "title": HIRISE_DTM.title,
                    "filename": HIRISE_DTM.filename,
                    "url": HIRISE_DTM.url,
                    "landing_page": HIRISE_DTM.landing_page,
                    "doi": HIRISE_DTM.doi,
                    "citation": HIRISE_DTM.citation,
                    "provider": HIRISE_DTM.provider,
                    "mission": HIRISE_DTM.mission,
                    "instrument": HIRISE_DTM.instrument,
                    "bytes": HIRISE_DTM.bytes,
                    "sha256": HIRISE_DTM.sha256,
                    "retrieved_utc": HIRISE_DTM.retrieved_utc,
                    "observation_epoch": "HiRISE stereo pairs acquired 2006-2020; DTM process date 2019-10-24; published 2020-07-24",
                    "redistribution": "USGS data release; access and use constraints 'None' in FGDC metadata; cite the authors.",
                    "mars_trek_layer": "MRO HiRISE, Jezero DEM, Controlled (item_UUID c3935915-9abe-4d8c-a87c-b96d195a8cfd)",
                },
                {
                    "key": M20_WAYPOINTS.key,
                    "role": "science-target-locations",
                    "title": M20_WAYPOINTS.title,
                    "filename": M20_WAYPOINTS.filename,
                    "url": M20_WAYPOINTS.url,
                    "provider": M20_WAYPOINTS.provider,
                    "mission": M20_WAYPOINTS.mission,
                    "bytes": wp_bytes,
                    "sha256": wp_sha,
                    "retrieved_utc": M20_WAYPOINTS.retrieved_utc,
                    "live_layer": True,
                    "content_check": "referenced RMC records match the values pinned in the build config",
                    "rmc_used": [t["rmc"] for t in config["science_targets"]],
                },
            ],
            "window": {k: w[k] for k in ("col_off", "row_off", "width", "height")},
            "source_resolution_m": src_dx,
            "source_missing_posts_in_window": missing_posts,
            "vertical_accuracy_note": (
                "FGDC: median vertical offset of ~0.4 m from the CTX DTM mosaic; orthoimage co-registration "
                "better than 1.1 m (most pairs, 99th percentile)."
            ),
        },
        "crs": crs.to_manifest(),
        "grid": {
            "width": width,
            "height": height,
            "origin_x_m": origin_x,
            "origin_y_m": origin_y,
            "origin_definition": "projected coordinates of the north-west corner of cell (row 0, col 0)",
            "cell_size_x_m": cell_x,
            "cell_size_y_m": cell_y,
            "cell_size_note": "Projected metres. Ground east-west spacing is cell_size_x_m * cos(latitude); north-south spacing equals cell_size_y_m.",
            "row_order": "north-to-south",
            "col_order": "west-to-east",
            "cell_registration": "area (cell centre at +0.5 cell)",
            "ground_cell_size_m": {
                "dy": cell_y,
                "dx_at_center_latitude": _round(float(dx_rows[height // 2]), 9),
                "dx_min": _round(float(dx_rows.min()), 9),
                "dx_max": _round(float(dx_rows.max()), 9),
                "center_latitude_deg": _round(float(lats[height // 2]), 9),
            },
            "bounds_projected_m": {"min_x": min_x, "min_y": min_y, "max_x": max_x, "max_y": max_y},
            "bounds_geographic_deg": {"west": west, "east": east, "south": south, "north": north},
            "extent_ground_m": {
                "east_west_at_center": _round(float(dx_rows[height // 2]) * width, 3),
                "north_south": _round(cell_y * height, 3),
            },
            "aggregation": {
                "method": "block-mean",
                "factor": factor,
                "nodata_rule": "a cell is missing if any of its source posts is missing (no interpolation, no partial means)",
            },
        },
        "elevation": {
            "units": "m",
            "vertical_reference": "Heights relative to the Mars areoid (MOLA topography 'DeltaGeoid' convention), per USGS product name and FGDC lineage",
            "encoding": "float32, NaN = no measured elevation",
            "min": _round(elev_vals.min(), 4),
            "max": _round(elev_vals.max(), 4),
            "mean": _round(elev_vals.mean(), 4),
        },
        "slope": {
            "units": "deg",
            "method": "Horn (1981) 3x3 finite differences on the 2 m grid with physical spacing",
            "formula": "slope = atan(sqrt((dz/dx)^2 + (dz/dy)^2)), dx = cell_size_x_m*cos(lat_row), dy = cell_size_y_m",
            "unknown_rule": "unknown (NaN) when the cell or any of its 8 neighbours lacks elevation, including the grid edge",
            "effective_baseline_note": "Gradients span 2 cells (~4 m); features smaller than a few metres (rocks, steps) are not resolved.",
            "encoding": "float32, NaN = unknown",
            "min": _round(slope_vals.min(), 4),
            "max": _round(slope_vals.max(), 4),
            "mean": _round(slope_vals.mean(), 4),
            "p50": pct(50),
            "p90": pct(90),
            "p99": pct(99),
            "fraction_above_deg": {str(t): _round(float(np.mean(slope_vals > t)), 6) for t in (5, 10, 15, 20, 25, 30)},
        },
        "flags": {"ELEVATION_VALID": FLAG_ELEVATION_VALID, "SLOPE_VALID": FLAG_SLOPE_VALID},
        "binary": {},
        "statistics": {
            "cell_count": int(width * height),
            "elevation_valid_count": int(ev.sum()),
            "slope_valid_count": int(sv.sum()),
            "elevation_missing_count": int((~ev).sum()),
            "slope_unknown_count": int((~sv).sum()),
        },
        "routing": {
            "connectivity": 8,
            "area_km2": _round(float(dx_rows.mean()) * width * cell_y * height / 1e6, 6),
            "note": "Cells without both ELEVATION_VALID and SLOPE_VALID are never traversable.",
        },
        "files": {"coverage": "coverage.geojson", "science_targets": "science-targets.geojson"},
        "processing": {
            "pipeline_version": PIPELINE_VERSION,
            "build_command": "python scripts/build_terrain.py " + " ".join(sys.argv[1:]),
            "config": str(config_path.relative_to(PIPELINE_ROOT)).replace("\\", "/"),
            "created_utc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "python": platform.python_version(),
            "numpy": np.__version__,
            "rasterio": rasterio.__version__,
            "gdal": rasterio.__gdal_version__,
            "pyproj": pyproj.__version__,
            "proj": pyproj.proj_version_str,
        },
        "validation": {"status": "not-run", "report": None, "validated_utc": None},
        "disclaimer": DISCLAIMER,
    }

    manifest = write_asset(out_dir, manifest, TerrainArrays(elev32, slope32, flags.astype(np.uint8)))
    write_json(out_dir / "coverage.geojson", coverage)
    write_json(out_dir / "science-targets.geojson", targets)

    record = {
        "aoi_id": config["aoi_id"],
        "terrain_bin_sha256": manifest["binary"]["sha256"],
        "terrain_bin_bytes": manifest["binary"]["byte_length"],
        "grid": [width, height],
        "missing_source_posts": missing_posts,
        "statistics": manifest["statistics"],
        "elevation": {k: manifest["elevation"][k] for k in ("min", "max", "mean")},
        "slope": {k: manifest["slope"][k] for k in ("min", "max", "mean", "p50", "p90", "p99")},
        "science_targets": [
            {k: f["properties"][k] for k in ("id", "lon_east", "lat_north", "grid_cell", "elevation_dtm_m",
                                              "rover_reported_elev_geoid_m", "slope_dtm_deg")}
            for f in target_features
        ],
        "processing": manifest["processing"],
    }
    return record


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", type=Path, default=PIPELINE_ROOT / "config" / "jezero_p0.json")
    ap.add_argument("--source", type=Path, default=None, help="HiRISE DTM GeoTIFF (default: data/raw/...)")
    ap.add_argument("--waypoints", type=Path, default=None, help="M20_waypoints.json (default: data/raw/...)")
    ap.add_argument("--out", type=Path, default=ASSET_DIR)
    ap.add_argument("--skip-hash", action="store_true", help="skip SHA-256 checks (size is still checked)")
    args = ap.parse_args(argv)
    record = build(args.config.resolve(), args.source, args.waypoints, args.out.resolve(), not args.skip_hash)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    write_json(EVIDENCE_DIR / "build_record.json", record)
    print(json.dumps(record, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
