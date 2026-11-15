#!/usr/bin/env python
"""Control experiment for the X2b photometric DTM-vs-image registration check.

Question: is the ~2.5 m eastward apparent shift found by X2b a real DTM/image offset or a
bias of the method? Method:
  1. fit the sun direction that best explains the USGS orthomosaic brightness with a
     Lambertian rendering of the DTM (grid search over azimuth and elevation, zero shift);
  2. render synthetic images from the DTM with that sun: (a) Lambertian only,
     (b) Lambertian + cast shadows (ray marching over the DTM). These are perfectly
     registered to the DTM by construction;
  3. run the identical X2b shift search on the synthetic images. Any shift found there is
     method bias, not misregistration;
  4. direct image registration: cross-correlate the real image with rendering (b) over
     integer/sub-cell shifts.

Needs the cached orthomosaic range from cross_validate.py (data/cache/ortho).
Writes evidence/photometric_control.json.
"""
from __future__ import annotations

import datetime as dt
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402

from ausnox_pipeline.dem import ground_cell_dx, horn_slope_deg, row_center_latitudes  # noqa: E402
from ausnox_pipeline.sources import ASSET_DIR, CACHE_DIR, EVIDENCE_DIR  # noqa: E402
from ausnox_pipeline.terrain_asset import read_asset, write_json  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cross_validate import parabolic, photometric_shift  # noqa: E402


def lambert(gx: np.ndarray, gy: np.ndarray, az_deg: float, el_deg: float) -> np.ndarray:
    """cos(incidence) for a surface with gradient (dz/dx east, dz/dy north); azimuth clockwise from north."""
    az, el = math.radians(az_deg), math.radians(el_deg)
    sx, sy, sz = math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)
    n = np.sqrt(gx * gx + gy * gy + 1.0)
    return np.clip((-gx * sx - gy * sy + sz) / n, 0.0, None)


def cast_shadow(z: np.ndarray, dx: float, dy: float, az_deg: float, el_deg: float, max_dist_m: float = 400.0) -> np.ndarray:
    """True where a cell is in cast shadow (terrain toward the sun rises above the sun ray)."""
    az = math.radians(az_deg)
    tan_el = math.tan(math.radians(el_deg))
    ux, uy = math.sin(az), math.cos(az)  # toward the sun, east/north
    H, W = z.shape
    shadow = np.zeros_like(z, dtype=bool)
    step = 0.5 * min(dx, dy)
    rows, cols = np.mgrid[0:H, 0:W].astype(np.float64)
    for k in range(1, int(max_dist_m / step) + 1):
        s = k * step
        c = cols + ux * s / dx
        r = rows - uy * s / dy  # north = decreasing row
        ci, ri = np.round(c).astype(int), np.round(r).astype(int)
        inside = (ci >= 0) & (ci < W) & (ri >= 0) & (ri < H)
        zz = np.full_like(z, -np.inf)
        zz[inside] = z[ri[inside], ci[inside]]
        shadow |= zz > z + s * tan_el
    return shadow


def corr(a: np.ndarray, b: np.ndarray) -> float:
    ok = np.isfinite(a) & np.isfinite(b)
    return float(np.corrcoef(a[ok], b[ok])[0, 1])


def main() -> int:
    manifest, arr, _ = read_asset(ASSET_DIR)
    g = manifest["grid"]
    H, W = g["height"], g["width"]
    cy = g["cell_size_y_m"]
    lats = row_center_latitudes(g["origin_y_m"], cy, H, manifest["crs"]["sphere_radius_m"])
    dxr = ground_cell_dx(g["cell_size_x_m"], lats)
    dxg = float(dxr[H // 2])
    z = arr.elevation.astype(np.float64)
    _, gx, gy = horn_slope_deg(z, dxr, cy)
    slope = arr.slope.astype(np.float64)

    raws = sorted((CACHE_DIR / "ortho").glob("JEZ_ortho_rows_*.raw"))
    if not raws:
        print("BLOCKED: orthomosaic range not cached; run cross_validate.py first")
        return 2
    raw = np.fromfile(raws[0], dtype=np.uint8)
    nrows = int(round(H * cy / 0.25))
    raw = raw.reshape(nrows, -1)
    col_off = int(round((g["origin_x_m"] - 4577366.0) / 0.25))
    o = raw[:, col_off:col_off + int(round(W * g["cell_size_x_m"] / 0.25))].astype(np.float64)
    o[o == 0] = np.nan
    f = int(round(cy / 0.25))
    img = o.reshape(H, f, W, f).mean(axis=(1, 3))

    # 1. sun fit (coarse then fine)
    best = (-1.0, 0.0, 0.0)
    for az in range(0, 360, 10):
        for el in range(10, 80, 5):
            c = corr(img[1:-1, 1:-1], lambert(gx, gy, az, el)[1:-1, 1:-1])
            if c > best[0]:
                best = (c, az, el)
    _, az0, el0 = best
    for az in np.arange(az0 - 10, az0 + 10.1, 1.0):
        for el in np.arange(max(2, el0 - 5), el0 + 5.1, 1.0):
            c = corr(img[1:-1, 1:-1], lambert(gx, gy, az, el)[1:-1, 1:-1])
            if c > best[0]:
                best = (c, float(az % 360), float(el))
    c_fit, az_fit, el_fit = best
    print(f"sun fit: azimuth {az_fit:.0f} deg (from north, clockwise), elevation {el_fit:.0f} deg, corr {c_fit:.3f}")

    # 2. synthetic renderings, registered to the DTM by construction
    lam = lambert(gx, gy, az_fit, el_fit)
    shad = cast_shadow(z, dxg, cy, az_fit, el_fit)
    lam_sh = np.where(shad, 0.08 * np.nanmax(lam), lam)
    print(f"cast-shadow fraction {shad.mean():.4f}")

    # 3. identical X2b shift search on controls
    controls = {}
    for name, im in (("synthetic-lambert", lam), ("synthetic-lambert-castshadow", lam_sh)):
        for model in ("linear-all", "quadratic-masked"):
            r = photometric_shift(im, gx, gy, slope, model, dxg, cy)
            controls[f"{name}/{model}"] = r
            print(f"control {name}/{model}: {r['shift_east_m']:+.2f} m E, {r['shift_south_m']:+.2f} m S")
    real = {}
    for model in ("linear-all", "quadratic-masked"):
        r = photometric_shift(img, gx, gy, slope, model, dxg, cy)
        real[f"usgs-ortho/{model}"] = r
        print(f"real   usgs-ortho/{model}: {r['shift_east_m']:+.2f} m E, {r['shift_south_m']:+.2f} m S")

    # 4. direct cross-correlation of the real image with the shadowed rendering
    m = 6
    A = lam_sh[m:H - m, m:W - m]
    res = {}
    for dr in range(-m, m + 1):
        for dc in range(-m, m + 1):
            res[(dr, dc)] = corr(A, img[m + dr:H - m + dr, m + dc:W - m + dc])
    (br, bc), cb = max(res.items(), key=lambda kv: kv[1])
    sr = br + parabolic(res[(br - 1, bc)], cb, res[(br + 1, bc)])
    sc = bc + parabolic(res[(br, bc - 1)], cb, res[(br, bc + 1)])
    print(f"direct xcorr image vs shadowed rendering: peak {cb:.3f} at {sc * dxg:+.2f} m E, {sr * cy:+.2f} m S (zero shift {res[(0, 0)]:.3f})")

    ctrl_bias = [math.hypot(v["shift_east_m"], v["shift_south_m"]) for v in controls.values()]
    out = {
        "generated_utc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "terrain_sha256": manifest["binary"]["sha256"],
        "sun_fit": {"azimuth_deg": az_fit, "elevation_deg": el_fit, "correlation": round(c_fit, 4)},
        "cast_shadow_fraction": round(float(shad.mean()), 5),
        "control_shifts_on_perfectly_registered_synthetic_images": controls,
        "real_image_shifts": real,
        "max_control_bias_m": round(max(ctrl_bias), 3),
        "direct_xcorr_vs_shadowed_rendering": {
            "peak_correlation": round(cb, 4), "zero_shift_correlation": round(res[(0, 0)], 4),
            "offset_east_m": round(sc * dxg, 3), "offset_south_m": round(sr * cy, 3)},
    }
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    write_json(EVIDENCE_DIR / "photometric_control.json", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
