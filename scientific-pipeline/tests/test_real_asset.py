"""Tests against the authentic HiRISE DTM and the shipped asset.

Skipped (reported as SKIPPED, never as passed) when the 1.8 GB source DTM is not present locally.
"""
import json
import math

import numpy as np
import pytest
import rasterio
from rasterio.windows import Window

from ausnox_pipeline.dem import block_mean_fail_closed, inspect_dem, read_window, valid_mask
from ausnox_pipeline.sources import ASSET_DIR, HIRISE_DTM, PIPELINE_ROOT
from ausnox_pipeline.terrain_asset import read_asset

pytestmark = pytest.mark.real_data

SOURCE = HIRISE_DTM.path
needs_source = pytest.mark.skipif(not SOURCE.is_file(), reason=f"source DTM not downloaded: {SOURCE}")
needs_asset = pytest.mark.skipif(not (ASSET_DIR / "manifest.json").is_file(), reason="asset not built")


@needs_source
def test_source_georeferencing_matches_product_documentation():
    info = inspect_dem(str(SOURCE))
    assert (info.width, info.height) == (21400, 21488)  # PDS3 label LINE_SAMPLES / LINES
    assert info.transform[:6] == (1.0, 0.0, 4577366.0, 0.0, -1.0, 1106618.0)  # ISIS UpperLeftCorner
    assert info.crs.radius_m == 3396190.0
    assert info.nodata == pytest.approx(-3.4028226550889045e38)
    west, north = info.crs.inverse(info.transform[2], info.transform[5])
    assert west == pytest.approx(77.2229330769714153, abs=1e-9)  # label MinimumLongitude
    assert north == pytest.approx(18.6693150068777456, abs=1e-9)  # label MaximumLatitude


@needs_source
def test_real_nodata_corner_stays_missing_after_aggregation():
    # The rotated mosaic leaves the raster's north-west corner without data.
    z, _ = read_window(str(SOURCE), Window(0, 0, 64, 64))
    assert np.isnan(z).all()
    agg = block_mean_fail_closed(z, 2)
    assert np.isnan(agg).all()


@needs_source
def test_partial_nodata_block_becomes_missing():
    # Find a strip-boundary window that mixes valid and missing posts in the real raster.
    with rasterio.open(SOURCE) as ds:
        row = 6000
        line = ds.read(1, window=Window(0, row, ds.width, 1))
        ok = valid_mask(line, ds.nodata)
        edge = int(np.argmax(ok))  # first valid post on this line
    z, _ = read_window(str(SOURCE), Window(edge - 1 - (edge - 1) % 2, row, 4, 2))
    assert np.isnan(z).any() and np.isfinite(z).any()
    agg = block_mean_fail_closed(z, 2)
    mixed = [np.isnan(z[:, 2 * k:2 * k + 2]).any() for k in range(2)]
    for k in range(2):
        assert np.isnan(agg[0, k]) == mixed[k]


@needs_source
@needs_asset
def test_build_is_reproducible(tmp_path):
    import importlib.util
    spec = importlib.util.spec_from_file_location("build_terrain", PIPELINE_ROOT / "scripts" / "build_terrain.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    record = mod.build(PIPELINE_ROOT / "config" / "jezero_p0.json", None, None, tmp_path, check_hash=False)
    shipped = json.loads((ASSET_DIR / "manifest.json").read_text(encoding="utf-8"))
    assert record["terrain_bin_sha256"] == shipped["binary"]["sha256"]
    assert (tmp_path / "science-targets.geojson").read_bytes() == (ASSET_DIR / "science-targets.geojson").read_bytes()
    assert (tmp_path / "coverage.geojson").read_bytes() == (ASSET_DIR / "coverage.geojson").read_bytes()


@needs_asset
def test_shipped_asset_dimensions_and_validation_status():
    manifest, arr, _ = read_asset(ASSET_DIR)
    assert arr.elevation.shape == (manifest["grid"]["height"], manifest["grid"]["width"]) == (800, 800)
    assert manifest["validation"]["status"] == "passed"
    assert manifest["source"]["products"][0]["sha256"] == HIRISE_DTM.sha256
    assert manifest["source"]["source_missing_posts_in_window"] == 0
    assert np.isfinite(arr.elevation).all()
    # grid edge has unknown slope, interior is known (no nodata in this window)
    assert np.isnan(arr.slope[0]).all() and np.isfinite(arr.slope[1:-1, 1:-1]).all()


@needs_source
@needs_asset
def test_asset_cells_equal_source_block_means():
    manifest, arr, _ = read_asset(ASSET_DIR)
    sw = manifest["source"]["window"]
    rng = np.random.default_rng(7)
    with rasterio.open(SOURCE) as ds:
        for r, c in rng.integers(0, 800, size=(200, 2)):
            blk = ds.read(1, window=Window(sw["col_off"] + 2 * c, sw["row_off"] + 2 * r, 2, 2)).astype(np.float64)
            assert arr.elevation[r, c] == np.float32(blk.mean())


@needs_asset
def test_science_targets_are_inside_and_on_valid_cells():
    manifest, arr, _ = read_asset(ASSET_DIR)
    g = manifest["grid"]
    targets = json.loads((ASSET_DIR / "science-targets.geojson").read_text(encoding="utf-8"))
    assert len(targets["features"]) == 2
    for f in targets["features"]:
        lon, lat = f["geometry"]["coordinates"]
        p = f["properties"]
        x = 3396190.0 * math.radians(lon)
        y = 3396190.0 * math.radians(lat)
        c = math.floor((x - g["origin_x_m"]) / g["cell_size_x_m"])
        r = math.floor((g["origin_y_m"] - y) / g["cell_size_y_m"])
        assert (r, c) == (p["grid_cell"]["row"], p["grid_cell"]["col"])
        assert arr.flags[r, c] == 3
        assert abs(p["elevation_dtm_m"] - p["rover_reported_elev_geoid_m"]) < 0.5
        assert p["sources"] and all(s["url"].startswith("https://") for s in p["sources"])
