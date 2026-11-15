#!/usr/bin/env python
"""Test 2 for X2b: is the apparent DTM-to-imagery offset the same everywhere in the AOI?

Runs the X2b photometric regression in 64 windows of 96 x 96 cells (~182 m x 192 m) and asks whether
the per-window offsets agree (a rigid displacement) or vary with terrain (a sign of a photometric
artifact such as albedo correlated with slope aspect). A synthetic rendering of the DTM, registered by
construction, is processed identically as a control of the method's per-window noise and bias.

PRE-REGISTERED CRITERIA (committed before the first run; see git history of this file):
  Window reliability: integer peak not on the +/-6 cell search boundary, peak score >= 0.05,
    peak score - median score on the outermost search ring >= 0.02, >= 4000 cells used at the peak.
  Control validity: on the synthetic control, |median offset| <= 0.3 m in both axes and >= 90 % of
    reliable windows within 1.0 m of the median vector. Otherwise every outcome is INCONCLUSIVE.
  Per configuration (image x shading model), with >= 12 reliable windows:
    RIGID     >= 70 % of reliable windows within 1.0 m of the median vector AND no terrain covariate
              with |Spearman rho| >= 0.4 and permutation p < 0.01 against either offset component;
    VARIABLE  otherwise;
    INCONCLUSIVE with fewer than 12 reliable windows.
  Primary configurations: both images with the quadratic-masked model (the model behind the X2b criterion).
  Interpretation: RIGID is consistent with a real displacement but does not prove it (an albedo effect
  that is uniform across terrain would also look rigid); VARIABLE with covariate dependence points to a
  photometric artifact. This script never changes the X2b status.

Inputs (cached by cross_validate.py, never downloaded here): data/cache/ortho/JEZ_ortho_rows_*.raw and
data/cache/trek/<layer>/15/*.png. --data-dir (or AUSNOX_DATA_DIR) points at another worktree's data/.
Output: evidence/registration_windowed.json

Usage: python scripts/registration_windowed.py [--data-dir PATH]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402

from ausnox_pipeline.dem import ground_cell_dx, horn_slope_deg, row_center_latitudes  # noqa: E402
from ausnox_pipeline.registration import (  # noqa: E402
    anti_sun_unit,
    bootstrap_median,
    photometric_window_shift,
    spearman_permutation,
    window_grid,
)
from ausnox_pipeline.sources import ASSET_DIR, EVIDENCE_DIR, PIPELINE_ROOT  # noqa: E402
from ausnox_pipeline.terrain_asset import read_asset, write_json  # noqa: E402

import cross_validate  # noqa: E402
from photometric_control import cast_shadow, lambert  # noqa: E402

CRITERIA = {
    "window_size_cells": 96,
    "window_margin_cells": 16,
    "search_radius_cells": 6,
    "reliability": {"peak_not_on_boundary": True, "min_peak_score": 0.05, "min_peak_minus_ring_median": 0.02, "min_cells": 4000},
    "control": {"max_abs_median_m": 0.3, "min_fraction_within_1m": 0.90},
    "rigid": {"min_reliable_windows": 12, "min_fraction_within_1m": 0.70, "covariate_max_abs_rho": 0.4, "covariate_alpha": 0.01},
    "primary_configs": ["usgs-ortho/quadratic-masked", "mars-trek/quadratic-masked"],
}
USGS_ORTHO_ORIGIN_X_M = 4577366.0  # orthomosaic left edge, as read from its GeoTIFF header by cross_validate.py


def load_ortho(manifest: dict, cache: Path) -> np.ndarray:
    g = manifest["grid"]
    raws = sorted((cache / "ortho").glob("JEZ_ortho_rows_*.raw"))
    if not raws:
        raise FileNotFoundError("orthomosaic rows not cached; run cross_validate.py first (or pass --data-dir)")
    nrows = int(round(g["height"] * g["cell_size_y_m"] / 0.25))
    raw = np.fromfile(raws[0], dtype=np.uint8).reshape(nrows, -1)
    col_off = int(round((g["origin_x_m"] - USGS_ORTHO_ORIGIN_X_M) / 0.25))
    o = raw[:, col_off:col_off + int(round(g["width"] * g["cell_size_x_m"] / 0.25))].astype(np.float64)
    o[o == 0] = np.nan
    f = int(round(g["cell_size_y_m"] / 0.25))
    return o.reshape(g["height"], f, g["width"], f).mean(axis=(1, 3))


def reliable(est, crit) -> bool:
    r = crit["reliability"]
    return (not est.on_boundary and math.isfinite(est.best) and est.best >= r["min_peak_score"]
            and est.best - est.ring_median >= r["min_peak_minus_ring_median"] and est.n >= r["min_cells"])


def covariates(win, img, z, slope, gx, gy, sun_az) -> dict:
    sl = (win.rows, win.cols)
    im, zz, ss = img[sl], z[sl], slope[sl]
    gxx, gyy = gx[sl], gy[sl]
    ok = np.isfinite(gxx) & np.isfinite(gyy)
    # downslope direction (azimuth clockwise from north) and its alignment with the anti-sun direction
    down_az = np.degrees(np.arctan2(-gxx[ok], -gyy[ok]))
    w = np.hypot(gxx[ok], gyy[ok])
    align = float(np.sum(w * np.cos(np.radians(down_az - (sun_az + 180.0)))) / np.sum(w)) if w.sum() > 0 else float("nan")
    return {
        "mean_brightness": float(np.nanmean(im)),
        "brightness_std": float(np.nanstd(im)),
        "mean_slope_deg": float(np.nanmean(ss)),
        "relief_m": float(np.nanpercentile(zz, 95) - np.nanpercentile(zz, 5)),
        "fraction_slope_below_5deg": float(np.nanmean(ss < 5.0)),
        "downslope_antisun_alignment": align,
    }


def analyse(name, img, gx, gy, slope, z, wins, model, dxg, dy, sun_az, crit) -> dict:
    clip = tuple(np.nanpercentile(img, [10, 99.5])) if model == "quadratic-masked" else None
    rows = []
    for w in wins:
        est = photometric_window_shift(img, gx, gy, slope, w, crit["search_radius_cells"], model, clip)
        east, south = est.metres(dxg, dy)
        rows.append({"row0": w.row0, "col0": w.col0, "east_m": round(east, 3), "south_m": round(south, 3),
                     "peak": round(est.best, 4), "zero": round(est.zero, 4), "ring_median": round(est.ring_median, 4),
                     "on_boundary": est.on_boundary, "n": est.n, "reliable": reliable(est, crit),
                     **{k: round(v, 4) for k, v in covariates(w, img, z, slope, gx, gy, sun_az).items()}})
    rel = [r for r in rows if r["reliable"]]
    out = {"config": f"{name}/{model}", "windows": len(rows), "reliable_windows": len(rel), "per_window": rows}
    if not rel:
        return {**out, "outcome": "INCONCLUSIVE"}
    e = np.array([r["east_m"] for r in rel])
    s = np.array([r["south_m"] for r in rel])
    me, me_lo, me_hi = bootstrap_median(e)
    ms, ms_lo, ms_hi = bootstrap_median(s)
    within = float(np.mean(np.hypot(e - me, s - ms) <= 1.0))
    cov = {}
    for key in ("mean_brightness", "brightness_std", "mean_slope_deg", "relief_m", "fraction_slope_below_5deg", "downslope_antisun_alignment"):
        x = np.array([r[key] for r in rel])
        re_, pe = spearman_permutation(x, e)
        rs_, ps_ = spearman_permutation(x, s)
        cov[key] = {"rho_east": round(re_, 3), "p_east": round(pe, 4), "rho_south": round(rs_, 3), "p_south": round(ps_, 4)}
    rc = crit["rigid"]
    flagged = [k for k, v in cov.items()
               if (abs(v["rho_east"]) >= rc["covariate_max_abs_rho"] and v["p_east"] < rc["covariate_alpha"])
               or (abs(v["rho_south"]) >= rc["covariate_max_abs_rho"] and v["p_south"] < rc["covariate_alpha"])]
    if len(rel) < rc["min_reliable_windows"]:
        outcome = "INCONCLUSIVE"
    elif within >= rc["min_fraction_within_1m"] and not flagged:
        outcome = "RIGID"
    else:
        outcome = "VARIABLE"
    return {**out, "outcome": outcome,
            "median_east_m": round(me, 3), "median_east_ci95_m": [round(me_lo, 3), round(me_hi, 3)],
            "median_south_m": round(ms, 3), "median_south_ci95_m": [round(ms_lo, 3), round(ms_hi, 3)],
            "iqr_east_m": round(float(np.percentile(e, 75) - np.percentile(e, 25)), 3),
            "iqr_south_m": round(float(np.percentile(s, 75) - np.percentile(s, 25)), 3),
            "fraction_within_1m_of_median": round(within, 3),
            "median_projection_on_antisun_m": round(me * anti_sun_unit(sun_az)[0] + ms * anti_sun_unit(sun_az)[1], 3),
            "covariates": cov, "covariates_flagged": flagged}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", type=Path, default=Path(os.environ.get("AUSNOX_DATA_DIR", PIPELINE_ROOT / "data")))
    args = ap.parse_args(argv)
    cache = args.data_dir.resolve() / "cache"
    cross_validate.CACHE_DIR = cache  # reuse the cached tiles of another worktree if asked

    manifest, arr, _ = read_asset(ASSET_DIR)
    g = manifest["grid"]
    H, W = g["height"], g["width"]
    dy = g["cell_size_y_m"]
    lats = row_center_latitudes(g["origin_y_m"], dy, H, manifest["crs"]["sphere_radius_m"])
    dxr = ground_cell_dx(g["cell_size_x_m"], lats)
    dxg = float(dxr[H // 2])
    z = arr.elevation.astype(np.float64)
    _, gx, gy = horn_slope_deg(z, dxr, dy)
    slope = arr.slope.astype(np.float64)

    ortho = load_ortho(manifest, cache)
    trek, lon_left, lat_top, pix, _ = cross_validate.trek_mosaic(manifest, 15, offline=True)
    trek = cross_validate.trek_on_dtm_grid(manifest, trek, lon_left, lat_top, pix)
    ctrl = json.loads((EVIDENCE_DIR / "photometric_control.json").read_text(encoding="utf-8"))["sun_fit"]
    az, el = float(ctrl["azimuth_deg"]), float(ctrl["elevation_deg"])
    lam = lambert(gx, gy, az, el)
    synth = np.where(cast_shadow(z, dxg, dy, az, el), 0.08 * np.nanmax(lam), lam)

    wins = window_grid(H, W, CRITERIA["window_size_cells"], CRITERIA["window_margin_cells"])
    results = {}
    for name, img in (("synthetic-control", synth), ("usgs-ortho", ortho), ("mars-trek", trek)):
        for model in ("quadratic-masked", "linear-all"):
            r = analyse(name, img, gx, gy, slope, z, wins, model, dxg, dy, az, CRITERIA)
            results[r["config"]] = r
            print(f"{r['config']:34} reliable {r['reliable_windows']:2}/{r['windows']}  "
                  f"median {r.get('median_east_m', float('nan')):+.2f} m E {r.get('median_south_m', float('nan')):+.2f} m S  "
                  f"within1m {r.get('fraction_within_1m_of_median', float('nan')):.2f}  flagged {r.get('covariates_flagged')}  -> {r['outcome']}")

    cc = CRITERIA["control"]
    ctl = results["synthetic-control/quadratic-masked"]
    control_ok = (ctl["reliable_windows"] >= CRITERIA["rigid"]["min_reliable_windows"]
                  and abs(ctl.get("median_east_m", 99)) <= cc["max_abs_median_m"] and abs(ctl.get("median_south_m", 99)) <= cc["max_abs_median_m"]
                  and ctl.get("fraction_within_1m_of_median", 0) >= cc["min_fraction_within_1m"])
    primary = {k: (results[k]["outcome"] if control_ok else "INCONCLUSIVE") for k in CRITERIA["primary_configs"]}
    outcomes = set(primary.values())
    overall = outcomes.pop() if len(outcomes) == 1 else "MIXED"
    print(f"control valid: {control_ok}; primary outcomes: {primary}; overall: {overall}")
    write_json(EVIDENCE_DIR / "registration_windowed.json", {
        "generated_utc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "terrain_sha256": manifest["binary"]["sha256"],
        "question": "Is the X2b apparent DTM-to-imagery offset spatially uniform (rigid) or terrain-dependent?",
        "criteria": CRITERIA,
        "sun_used_for_control_and_alignment": {"azimuth_deg": az, "elevation_deg": el, "source": "evidence/photometric_control.json sun_fit"},
        "control_valid": control_ok,
        "primary_outcomes": primary,
        "overall": overall,
        "results": results,
        "x2b_status_changed": False,
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
