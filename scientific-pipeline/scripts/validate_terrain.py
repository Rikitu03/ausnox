#!/usr/bin/env python
"""Validate the shipped Jezero terrain asset (gate S1-S3 evidence).

Checks are deliberately independent of build_terrain.py's bulk code path where possible:
source values are re-read with small per-block windows, slope is recomputed with a scalar
implementation, and coordinates are checked against PROJ (pyproj) instead of the closed form.

Writes scientific-pipeline/evidence/validation_report.json and, when every check passes,
sets manifest.validation.status = "passed" (otherwise "failed"). Exit code 0 only on PASS.

Usage:
  python scripts/validate_terrain.py [--manifest ../public/data/jezero/manifest.json]
                                     [--source data/raw/<dtm>.tif] [--waypoints data/raw/M20_waypoints.json]
                                     [--write-engine-fixtures]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
import rasterio  # noqa: E402
from pyproj import CRS, Transformer  # noqa: E402
from rasterio.windows import Window  # noqa: E402

from ausnox_pipeline.dem import FLAG_ELEVATION_VALID, FLAG_SLOPE_VALID, bilinear_sample, valid_mask  # noqa: E402
from ausnox_pipeline.mars_crs import parse_mars_equirectangular  # noqa: E402
from ausnox_pipeline.sources import (  # noqa: E402
    ASSET_DIR, ENGINE_FIXTURE_DIR, EVIDENCE_DIR, HIRISE_DTM, M20_WAYPOINTS, SourceVerificationError, verify_source,
)
from ausnox_pipeline.terrain_asset import AssetFormatError, check_manifest_structure, read_asset, write_json  # noqa: E402


class Report:
    def __init__(self) -> None:
        self.checks: list[dict] = []

    def add(self, check_id: str, status: str, detail: str, **data) -> None:
        assert status in ("PASS", "FAIL", "BLOCKED", "NOT RUN")
        self.checks.append({"id": check_id, "status": status, "detail": detail, **data})
        print(f"[{status:7}] {check_id}: {detail}")

    @property
    def passed(self) -> bool:
        return bool(self.checks) and all(c["status"] == "PASS" for c in self.checks)


def scalar_horn(z: np.ndarray, r: int, c: int, dx: float, dy: float) -> float:
    """Independent scalar Horn slope (deg) at (r, c); NaN if any neighbour is missing or off-grid."""
    h, w = z.shape
    if r <= 0 or c <= 0 or r >= h - 1 or c >= w - 1:
        return math.nan
    n = [[float(z[r + i, c + j]) for j in (-1, 0, 1)] for i in (-1, 0, 1)]
    if any(not math.isfinite(v) for row in n for v in row):
        return math.nan
    dzdx = ((n[0][2] + 2 * n[1][2] + n[2][2]) - (n[0][0] + 2 * n[1][0] + n[2][0])) / (8 * dx)
    dzdy = ((n[0][0] + 2 * n[0][1] + n[0][2]) - (n[2][0] + 2 * n[2][1] + n[2][2])) / (8 * dy)
    return math.degrees(math.atan(math.hypot(dzdx, dzdy)))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", type=Path, default=ASSET_DIR / "manifest.json")
    ap.add_argument("--source", type=Path, default=None)
    ap.add_argument("--waypoints", type=Path, default=None)
    ap.add_argument("--write-engine-fixtures", action="store_true")
    ap.add_argument("--samples", type=int, default=2000)
    args = ap.parse_args(argv)
    rep = Report()
    asset_dir = args.manifest.resolve().parent

    # ---- V1 structure + checksum ------------------------------------------------------------
    try:
        manifest, arrays, blob = read_asset(asset_dir)
        rep.add("V1-structure-checksum", "PASS",
                f"manifest schema {manifest['schema_version']}, terrain.bin {len(blob)} bytes, SHA-256 matches",
                sha256=manifest["binary"]["sha256"])
    except AssetFormatError as e:
        rep.add("V1-structure-checksum", "FAIL", str(e))
        _finish(rep, None, args.manifest)
        return 1

    g = manifest["grid"]
    W, H = g["width"], g["height"]
    elev, slope, flags = arrays.elevation, arrays.slope, arrays.flags
    problems = check_manifest_structure(manifest)
    rep.add("V2-no-placeholders", "PASS" if not problems else "FAIL",
            "no SET_* placeholders, required keys present" if not problems else "; ".join(problems))

    # ---- V3 dimensions & flag consistency ---------------------------------------------------
    ok_dims = elev.shape == (H, W) == slope.shape == flags.shape
    ev = np.isfinite(elev)
    sv = np.isfinite(slope)
    f_e = (flags & FLAG_ELEVATION_VALID) > 0
    f_s = (flags & FLAG_SLOPE_VALID) > 0
    consistent = bool(np.array_equal(ev, f_e) and np.array_equal(sv, f_s) and not np.any(sv & ~ev))
    unknown_flags = int(np.count_nonzero(flags & ~np.uint8(FLAG_ELEVATION_VALID | FLAG_SLOPE_VALID)))
    rep.add("V3-dimensions-flags", "PASS" if ok_dims and consistent and unknown_flags == 0 else "FAIL",
            f"shape {elev.shape}; NaN elevation <=> !ELEVATION_VALID; NaN slope <=> !SLOPE_VALID; "
            f"slope never valid without elevation; unknown flag bits {unknown_flags}")
    border = np.zeros((H, W), dtype=bool)
    border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
    rep.add("V4-edge-slope-unknown", "PASS" if not np.any(sv & border) else "FAIL",
            "every grid-edge cell has unknown slope (no one-sided differences)")

    # ---- V5 value ranges --------------------------------------------------------------------
    e_ok = bool(np.all((elev[ev] > -9000) & (elev[ev] < 22000)))
    s_ok = bool(np.all((slope[sv] >= 0) & (slope[sv] < 90)))
    stats_ok = (manifest["statistics"]["elevation_valid_count"] == int(ev.sum())
                and manifest["statistics"]["slope_valid_count"] == int(sv.sum()))
    rep.add("V5-value-ranges", "PASS" if e_ok and s_ok and stats_ok else "FAIL",
            f"elevation {float(np.nanmin(elev)):.3f}..{float(np.nanmax(elev)):.3f} m within Mars range; "
            f"slope {float(np.nanmin(slope)):.4f}..{float(np.nanmax(slope)):.4f} deg in [0,90); manifest counts match")

    # ---- V6 CRS against PROJ ---------------------------------------------------------------
    crs = parse_mars_equirectangular(manifest["crs"]["source_wkt"])
    proj_crs = CRS.from_wkt(manifest["crs"]["source_wkt"])
    tf = Transformer.from_crs(proj_crs.geodetic_crs, proj_crs, always_xy=True)
    bp = g["bounds_projected_m"]
    bg = g["bounds_geographic_deg"]
    test_pts = [(bg["west"], bg["south"]), (bg["east"], bg["north"]), ((bg["west"] + bg["east"]) / 2, (bg["south"] + bg["north"]) / 2),
                (77.40844668, 18.45337179), (77.0, -5.0), (-120.25, 40.5)]
    max_err = 0.0
    for lon, lat in test_pts:
        x1, y1 = crs.forward(lon, lat)
        x2, y2 = tf.transform(lon, lat)
        max_err = max(max_err, abs(x1 - x2), abs(y1 - y2))
        lon_b, lat_b = crs.inverse(x1, y1)
        max_err = max(max_err, abs(lon_b - lon) * 1e5, abs(lat_b - lat) * 1e5)
    corner_ok = (abs(bp["min_x"] - g["origin_x_m"]) < 1e-9 and abs(bp["max_y"] - g["origin_y_m"]) < 1e-9
                 and abs(bp["max_x"] - (g["origin_x_m"] + W * g["cell_size_x_m"])) < 1e-6
                 and abs(bp["min_y"] - (g["origin_y_m"] - H * g["cell_size_y_m"])) < 1e-6)
    gx, gy = crs.forward(bg["west"], bg["north"])
    corner_ok &= abs(gx - bp["min_x"]) < 1e-6 and abs(gy - bp["max_y"]) < 1e-6
    rep.add("V6-crs-vs-proj", "PASS" if max_err < 1e-6 and corner_ok else "FAIL",
            f"closed-form equirectangular vs PROJ max |error| {max_err:.2e} m; bounds consistent with origin/cell size",
            max_error_m=max_err)

    # ---- V7 source re-derivation (independent windowed reads) --------------------------------
    try:
        src = verify_source(HIRISE_DTM, args.source)
    except SourceVerificationError as e:
        rep.add("V7-source-elevation-preserved", "BLOCKED", str(e))
        rep.add("V8-slope-independent-recompute", "BLOCKED", "needs source")
        rep.add("V9-known-points", "BLOCKED", "needs source")
        src = None
    sw = manifest["source"]["window"]
    factor = g["aggregation"]["factor"]
    rng = random.Random(20261114)
    if src is not None:
        with rasterio.open(src) as ds:
            nod = ds.nodata
            if (ds.width, ds.height) != (21400, 21488) or tuple(ds.transform)[:6] != (1.0, 0.0, 4577366.0, 0.0, -1.0, 1106618.0):
                rep.add("V7-source-elevation-preserved", "FAIL", "source raster geometry differs from the documented product")
            else:
                worst = 0.0
                n = 0
                cells = [(rng.randrange(H), rng.randrange(W)) for _ in range(args.samples)]
                cells += [(0, 0), (H - 1, W - 1), (0, W - 1), (H - 1, 0)]
                for r, c in cells:
                    blk = ds.read(1, window=Window(sw["col_off"] + c * factor, sw["row_off"] + r * factor, factor, factor))
                    vm = valid_mask(blk, nod)
                    expect = np.float32(blk.astype(np.float64).mean()) if vm.all() else np.float32(np.nan)
                    got = elev[r, c]
                    if np.isnan(expect) != np.isnan(got) or (not np.isnan(expect) and expect != got):
                        worst = math.inf
                    n += 1
                rep.add("V7-source-elevation-preserved", "PASS" if worst == 0.0 else "FAIL",
                        f"{n} cells re-read from the source with independent {factor}x{factor} windows: "
                        f"elevation equals the float32 block mean exactly (nodata rule respected)",
                        cells_checked=n)
                # slope recompute with scalar Horn on float64 block means
                R = crs.radius_m
                cy = g["cell_size_y_m"]
                worst_s = 0.0
                m = 0
                for _ in range(args.samples):
                    r, c = rng.randrange(1, H - 1), rng.randrange(1, W - 1)
                    blk = ds.read(1, window=Window(sw["col_off"] + (c - 1) * factor, sw["row_off"] + (r - 1) * factor,
                                                   3 * factor, 3 * factor)).astype(np.float64)
                    z3 = blk.reshape(3, factor, 3, factor).mean(axis=(1, 3))
                    lat = math.degrees((g["origin_y_m"] - (r + 0.5) * cy) / R)
                    dx = g["cell_size_x_m"] * math.cos(math.radians(lat))
                    s = scalar_horn(z3, 1, 1, dx, cy)
                    worst_s = max(worst_s, abs(s - float(slope[r, c])))
                    m += 1
                rep.add("V8-slope-independent-recompute", "PASS" if worst_s < 1e-4 else "FAIL",
                        f"{m} interior cells: scalar Horn from fresh source reads vs shipped slope, max |diff| {worst_s:.2e} deg",
                        max_abs_diff_deg=worst_s)
                # known points: science targets + 3 fixed cells, direct source extraction (1 m bilinear) vs asset cell
                targets = json.loads((asset_dir / manifest["files"]["science_targets"]).read_text(encoding="utf-8"))
                pts = [(f["properties"]["id"], f["geometry"]["coordinates"][0], f["geometry"]["coordinates"][1])
                       for f in targets["features"]]
                for (r, c) in ((100, 100), (400, 400), (700, 650)):
                    lon_c, lat_c = crs.inverse(g["origin_x_m"] + (c + 0.5) * g["cell_size_x_m"],
                                               g["origin_y_m"] - (r + 0.5) * cy)
                    pts.append((f"cell-{r}-{c}", lon_c, lat_c))
                rows = []
                inv = ~ds.transform
                for pid, lon, lat in pts:
                    x, y = tf.transform(lon, lat)
                    colf, rowf = inv * (x, y)
                    c0, r0 = math.floor(colf - 0.5), math.floor(rowf - 0.5)
                    win = ds.read(1, window=Window(c0, r0, 2, 2)).astype(np.float64)
                    src_bilinear = bilinear_sample(np.where(valid_mask(win, nod), win, np.nan), colf - c0, rowf - r0)
                    ac = int((x - g["origin_x_m"]) // g["cell_size_x_m"])
                    ar = int((g["origin_y_m"] - y) // cy)
                    asset_val = float(elev[ar, ac])
                    rows.append({"id": pid, "lon_east": lon, "lat_north": lat, "asset_cell": [ar, ac],
                                 "asset_elevation_m": round(asset_val, 4),
                                 "source_bilinear_1m_m": None if src_bilinear is None else round(src_bilinear, 4),
                                 "abs_diff_m": None if src_bilinear is None else round(abs(asset_val - src_bilinear), 4),
                                 "asset_slope_deg": round(float(slope[ar, ac]), 3)})
                tol = 0.5
                ok = all(rw["abs_diff_m"] is not None and rw["abs_diff_m"] <= tol for rw in rows)
                rep.add("V9-known-points", "PASS" if ok else "FAIL",
                        f"{len(rows)} known points: asset 2 m cell vs direct 1 m source bilinear within {tol} m "
                        f"(max {max(rw['abs_diff_m'] or 0 for rw in rows):.3f} m); finite, no flattening",
                        points=rows, tolerance_m=tol)

    # ---- V10 rover waypoints vs asset elevation + registration sensitivity ------------------
    try:
        wps_path = verify_source(M20_WAYPOINTS, args.waypoints)
        wps = json.loads(Path(wps_path).read_text(encoding="utf-8"))["features"]
        cx, cy = g["cell_size_x_m"], g["cell_size_y_m"]
        pts = []
        for f in wps:
            p = f["properties"]
            if bg["west"] <= p["lon"] <= bg["east"] and bg["south"] <= p["lat"] <= bg["north"]:
                x, y = tf.transform(p["lon"], p["lat"])
                pts.append(((x - g["origin_x_m"]) / cx, (g["origin_y_m"] - y) / cy, float(p["elev_geoid"])))
        e64 = elev.astype(np.float64)

        def diffs(dc: float, dr: float) -> np.ndarray:
            out = []
            for colf, rowf, ze in pts:
                v = bilinear_sample(e64, colf + dc, rowf + dr)
                if v is not None:
                    out.append(ze - v)
            return np.array(out)

        d0 = diffs(0.0, 0.0)
        sens = {}
        for s in (-3, -2, -1, 1, 2, 3):
            sens[f"dx{s:+d}"] = round(float(np.median(np.abs(diffs(s, 0)))), 4)
            sens[f"dy{s:+d}"] = round(float(np.median(np.abs(diffs(0, s)))), 4)
        med0 = float(np.median(np.abs(d0)))
        best_shifted = min(sens.values())
        ok = (len(d0) >= 20 and abs(float(np.median(d0))) <= 0.25 and float(np.percentile(np.abs(d0), 95)) <= 1.0
              and med0 < best_shifted)
        rep.add("V10-rover-waypoints", "PASS" if ok else "FAIL",
                f"{len(d0)} NASA MMGIS waypoints in AOI: median(elev_geoid - asset) {np.median(d0):+.3f} m, "
                f"p95 |diff| {np.percentile(np.abs(d0), 95):.3f} m; median |diff| at zero shift {med0:.3f} m is "
                f"lower than any +/-1..3 cell shift (best shifted {best_shifted:.3f} m)",
                n=len(d0), median_m=round(float(np.median(d0)), 4), p95_abs_m=round(float(np.percentile(np.abs(d0), 95)), 4),
                median_abs_by_shift_cells=sens, median_abs_zero_shift_m=round(med0, 4))
    except SourceVerificationError as e:
        rep.add("V10-rover-waypoints", "BLOCKED", str(e))

    # ---- V11 grid <-> geographic round trip --------------------------------------------------
    worst = 0.0
    for _ in range(2000):
        r, c = rng.randrange(H), rng.randrange(W)
        x = g["origin_x_m"] + (c + 0.5) * g["cell_size_x_m"]
        y = g["origin_y_m"] - (r + 0.5) * g["cell_size_y_m"]
        lon, lat = tf.transform(x, y, direction="INVERSE")
        x2, y2 = tf.transform(lon, lat)
        c2 = (x2 - g["origin_x_m"]) / g["cell_size_x_m"] - 0.5
        r2 = (g["origin_y_m"] - y2) / g["cell_size_y_m"] - 0.5
        worst = max(worst, abs(c2 - c), abs(r2 - r))
    rep.add("V11-grid-geo-roundtrip", "PASS" if worst < 1e-6 else "FAIL",
            f"2000 cell centres -> lon/lat (PROJ) -> cell: max error {worst:.2e} cells", max_error_cells=worst)

    if args.write_engine_fixtures:
        write_engine_fixtures(manifest, tf, elev, slope, flags, rng)
    _finish(rep, manifest, args.manifest)
    return 0 if rep.passed else 1


def write_engine_fixtures(manifest, tf, elev, slope, flags, rng) -> None:
    """PROJ-derived coordinate vectors + asset samples for the TypeScript tests (cross-implementation check)."""
    g = manifest["grid"]
    vectors = []
    for lon, lat in [(77.40844668, 18.45337179), (77.40616768, 18.45889532), (77.3930, 18.4430), (77.4199, 18.4694),
                     (0.0, 0.0), (179.999, -45.5), (-179.999, 60.25), (77.45088572, 18.44462715)]:
        x, y = tf.transform(lon, lat)
        col_f = (x - g["origin_x_m"]) / g["cell_size_x_m"]
        row_f = (g["origin_y_m"] - y) / g["cell_size_y_m"]
        inside = 0 <= col_f < g["width"] and 0 <= row_f < g["height"]
        vectors.append({"lon_east": lon, "lat_north": lat, "x_m": x, "y_m": y,
                        "col": math.floor(col_f) if inside else None, "row": math.floor(row_f) if inside else None})
    samples = []
    for _ in range(25):
        r, c = rng.randrange(g["height"]), rng.randrange(g["width"])
        samples.append({"row": r, "col": c, "elevation_m": float(elev[r, c]),
                        "slope_deg": None if not np.isfinite(slope[r, c]) else float(slope[r, c]), "flags": int(flags[r, c])})
    ENGINE_FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    write_json(ENGINE_FIXTURE_DIR / "proj_vectors.json", {
        "generated_by": "scientific-pipeline/scripts/validate_terrain.py --write-engine-fixtures (pyproj/PROJ)",
        "terrain_sha256": manifest["binary"]["sha256"], "crs_proj4": manifest["crs"]["proj4"],
        "vectors": vectors, "samples": samples})
    print(f"wrote {ENGINE_FIXTURE_DIR / 'proj_vectors.json'}")


def _finish(rep: Report, manifest: dict | None, manifest_path: Path) -> None:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    status = "passed" if rep.passed else "failed"
    out = {"validated_utc": now, "overall": "PASS" if rep.passed else "FAIL", "checks": rep.checks,
           "terrain_sha256": manifest["binary"]["sha256"] if manifest else None}
    write_json(EVIDENCE_DIR / "validation_report.json", out)
    if manifest is not None:
        manifest["validation"] = {
            "status": status,
            "report": "scientific-pipeline/evidence/validation_report.json",
            "validated_utc": now,
            "checks_passed": sum(c["status"] == "PASS" for c in rep.checks),
            "checks_total": len(rep.checks),
        }
        write_json(manifest_path, manifest)
    print(f"OVERALL: {'PASS' if rep.passed else 'FAIL'} ({sum(c['status'] == 'PASS' for c in rep.checks)}/{len(rep.checks)})")


if __name__ == "__main__":
    raise SystemExit(main())
