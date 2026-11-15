#!/usr/bin/env python
"""Test 1 for X2b: does the apparent DTM-to-imagery offset follow the sun?

If the X2b offset is a real displacement d between the DTM and the USGS orthomosaic, it is the same
whatever image is used to measure it. If it is a photometric artifact (for example albedo correlated
with slope aspect), it points away from the sun and rotates with the sun azimuth.

For each HiRISE RDR image k (config/x2b_illumination.json), resampled onto the DTM grid:
  p_k   photometric offset of image k against the DTM (the X2b regression, per window)
  c_k   offset of image k against the USGS orthomosaic (normalised cross-correlation, per window)
  b_k   correlation bias from the different illumination alone: c on synthetic renderings of the DTM lit
        like image k and like the orthomosaic (registered by construction)
  d_k = p_k - (c_k - b_k)
Image k's own geometric errors (pointing, orthorectification on MOLA, parallax) shift p_k and c_k
identically and cancel in d_k. Then d_k = d (real offset) or d_k = artifact(sun_k).

PRE-REGISTERED CRITERIA (committed before any image was downloaded or analysed):
  Windows and search exactly as in registration_windowed.py (96-cell windows, margin 16, +/-6 cells).
  A window counts for image k when p_k passes the test-2 reliability rule AND c_k is not on the search
    boundary, peak correlation >= 0.30, peak - outer-ring median >= 0.05, >= 4000 cells.
  Image validity: synthetic photometric control at the image's own sun gives |median| <= 0.3 m in both
    axes, and the fitted shading azimuth is within 15 deg of the Mars24 azimuth. Otherwise the image is
    INVALID and is not used in the decision.
  Decision on the extreme pair A (sun 226.0 deg) and B (sun 287.7 deg), over windows counted in both:
    predicted change for a pure anti-sun artifact  dpred = M * (u(az_B) - u(az_A)),
    u = unit vector away from the sun, M = the X2b USGS quadratic-masked offset projected on u(fitted
    orthomosaic sun) from evidence/cross_validation_report.json and evidence/photometric_control.json;
    per window s = (d_B - d_A) . dpred / |dpred|^2; s_hat = median, 95 % bootstrap CI (2000, fixed seed).
    REAL-OFFSET-CONSISTENT   CI within [-0.5, 0.5] and CI width <= 1.0
    ARTIFACT-CONSISTENT      CI within [0.5, 1.5]
    INCONCLUSIVE             otherwise, or fewer than 12 paired windows, or A or B INVALID.
  The middle image (265.4 deg, near the orthomosaic's sun) is reported as a consistency check only.
  This script never changes the X2b status; a resolution needs this evidence plus a documented review.

Data: --fetch downloads only the files listed in the config into data/raw/hirise (sizes verified).
Usage: python scripts/registration_illumination.py [--data-dir PATH] [--fetch]
Output: evidence/registration_illumination.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import ssl
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import certifi  # noqa: E402
import numpy as np  # noqa: E402
import rasterio  # noqa: E402
from rasterio.enums import Resampling  # noqa: E402
from rasterio.transform import Affine  # noqa: E402
from rasterio.vrt import WarpedVRT  # noqa: E402

from ausnox_pipeline.dem import ground_cell_dx, horn_slope_deg, row_center_latitudes  # noqa: E402
from ausnox_pipeline.registration import (  # noqa: E402
    anti_sun_unit,
    bootstrap_median,
    phase_correlation_shift,
    photometric_window_shift,
    shift_image,
    window_grid,
    xcorr_window_shift,
)
from ausnox_pipeline.sources import ASSET_DIR, EVIDENCE_DIR, PIPELINE_ROOT  # noqa: E402
from ausnox_pipeline.terrain_asset import read_asset, write_json  # noqa: E402

from photometric_control import cast_shadow, lambert  # noqa: E402
from registration_windowed import CRITERIA as WINDOWED, load_ortho, reliable as reliable_photometric  # noqa: E402

CONFIG = PIPELINE_ROOT / "config" / "x2b_illumination.json"
CRITERIA = {
    "windows": {k: WINDOWED[k] for k in ("window_size_cells", "window_margin_cells", "search_radius_cells")},
    "photometric_reliability": WINDOWED["reliability"],
    "xcorr_reliability": {"peak_not_on_boundary": True, "min_peak_correlation": 0.30, "min_peak_minus_ring_median": 0.05, "min_cells": 4000},
    "image_validity": {"control_max_abs_median_m": 0.3, "sun_fit_max_azimuth_error_deg": 15.0},
    "decision": {"real_ci_within": [-0.5, 0.5], "real_max_ci_width": 1.0, "artifact_ci_within": [0.5, 1.5], "min_paired_windows": 12,
                 "bootstrap": 2000, "seed": 20261115},
    "coarse_prealignment_max_shift_cells": 150,
}


def fetch_files(cfg: dict, raw: Path) -> None:
    raw.mkdir(parents=True, exist_ok=True)
    ctx = ssl.create_default_context(cafile=certifi.where())
    for im in cfg["images"]:
        for f in im["files"]:
            dest = raw / f["name"]
            expect = f["kbytes"] * 1000  # PDS ODE "KBytes" are decimal kilobytes (rounded)
            if dest.exists() and abs(dest.stat().st_size - expect) <= 2048:
                continue
            part = dest.with_suffix(dest.suffix + ".part")
            if part.exists() and abs(part.stat().st_size - expect) <= 2048:
                part.replace(dest)  # completed earlier, only the size check failed
                print(f"kept {f['name']} ({dest.stat().st_size / 1e6:.1f} MB)")
                continue
            req = urllib.request.Request(f["url"], headers={"User-Agent": "ausnox-pipeline/1.0 (validation)"})
            with urllib.request.urlopen(req, timeout=600, context=ctx) as r, open(part, "wb") as out:
                while chunk := r.read(1 << 20):
                    out.write(chunk)
            if abs(part.stat().st_size - expect) > 2048:  # tolerance covers the catalog's rounding to 1 kB
                raise RuntimeError(f"{f['name']}: {part.stat().st_size} bytes, catalog says ~{expect}")
            part.replace(dest)
            print(f"fetched {f['name']} ({dest.stat().st_size / 1e6:.1f} MB)")


def label_values(lbl: Path) -> dict:
    keys = ("MAP_PROJECTION_TYPE", "A_AXIS_RADIUS", "CENTER_LATITUDE", "CENTER_LONGITUDE", "MAP_SCALE", "LINE_PROJECTION_OFFSET",
            "SAMPLE_PROJECTION_OFFSET", "INCIDENCE_ANGLE", "EMISSION_ANGLE", "START_TIME")
    out = {}
    for line in lbl.read_text(encoding="latin-1").splitlines():
        k, _, v = line.partition("=")
        k = k.strip()
        if k in keys and k not in out:
            out[k] = v.strip().strip('"')
    return out


def label_number(lbl: dict, key: str) -> float:
    return float(lbl[key].split("<")[0].strip())


def label_crs(lbl: dict) -> rasterio.crs.CRS:
    """CRS from the PDS label, the authoritative map-projection record of a HiRISE RDR.

    HiRISE equirectangular RDRs are true to scale at CENTER_LATITUDE on a sphere of the local radius
    (A_AXIS_RADIUS). Some older RDRs carry a GeoJP2 header with latitude of true scale and latitude of
    origin swapped, which misplaces the image east-west by a factor cos(CENTER_LATITUDE).
    """
    if lbl.get("MAP_PROJECTION_TYPE") != "EQUIRECTANGULAR":
        raise RuntimeError(f"unsupported projection {lbl.get('MAP_PROJECTION_TYPE')}")
    r_m = label_number(lbl, "A_AXIS_RADIUS") * 1000.0
    return rasterio.crs.CRS.from_proj4(
        f"+proj=eqc +lat_ts={label_number(lbl, 'CENTER_LATITUDE')} +lat_0=0 +lon_0={label_number(lbl, 'CENTER_LONGITUDE')} "
        f"+x_0=0 +y_0=0 +R={r_m} +units=m +no_defs")


def image_on_grid(jp2: Path, lbl: dict, manifest: dict) -> tuple[np.ndarray, dict]:
    g = manifest["grid"]
    dst_crs = rasterio.crs.CRS.from_wkt(manifest["crs"]["source_wkt"])
    transform = Affine(g["cell_size_x_m"], 0.0, g["origin_x_m"], 0.0, -g["cell_size_y_m"], g["origin_y_m"])
    src_crs = label_crs(lbl)
    with rasterio.open(jp2) as src:
        scale = label_number(lbl, "MAP_SCALE")
        # The geotransform must agree with the label offsets to within one pixel (1-based PDS convention).
        dx = abs(src.transform.c - (-label_number(lbl, "SAMPLE_PROJECTION_OFFSET") * scale))
        dy = abs(src.transform.f - (label_number(lbl, "LINE_PROJECTION_OFFSET") * scale))
        if abs(src.transform.a - scale) > 1e-9 or dx > scale or dy > scale:
            raise RuntimeError(f"{jp2.name}: geotransform disagrees with the PDS label (dx {dx:.3f} m, dy {dy:.3f} m)")
        embedded = src.crs.to_proj4() if src.crs else None
        meta = {"src_crs_used": src_crs.to_proj4(), "src_crs_embedded": embedded,
                "embedded_crs_agrees_with_label": bool(src.crs) and src.crs.equals(src_crs) if src.crs else False,
                "src_res_m": [abs(src.transform.a), abs(src.transform.e)], "src_size": [src.width, src.height], "src_dtype": src.dtypes[0]}
        with WarpedVRT(src, src_crs=src_crs, crs=dst_crs, transform=transform, width=g["width"], height=g["height"],
                       resampling=Resampling.average, src_nodata=0, nodata=0) as vrt:
            a = vrt.read(1).astype(np.float64)
    a[a == 0] = np.nan
    meta["valid_fraction"] = round(float(np.isfinite(a).mean()), 4)
    return a, meta


def finite_or_none(obj):
    """Strict JSON: NaN and infinities become null."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: finite_or_none(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [finite_or_none(v) for v in obj]
    return obj


def fit_sun_azimuth(img: np.ndarray, gx: np.ndarray, gy: np.ndarray) -> tuple[float, float, float]:
    def corr(a, b):
        ok = np.isfinite(a) & np.isfinite(b)
        return float(np.corrcoef(a[ok], b[ok])[0, 1])
    best = (-1.0, 0.0, 0.0)
    for az in range(180, 362, 4):
        for el in range(10, 80, 5):
            c = corr(img[1:-1, 1:-1], lambert(gx, gy, az, el)[1:-1, 1:-1])
            if c > best[0]:
                best = (c, float(az % 360), float(el))
    return best[1], best[2], round(best[0], 4)


def xcorr_reliable(est) -> bool:
    r = CRITERIA["xcorr_reliability"]
    return (not est.on_boundary and math.isfinite(est.best) and est.best >= r["min_peak_correlation"]
            and est.best - est.ring_median >= r["min_peak_minus_ring_median"] and est.n >= r["min_cells"])


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", type=Path, default=Path(os.environ.get("AUSNOX_DATA_DIR", PIPELINE_ROOT / "data")))
    ap.add_argument("--fetch", action="store_true", help="download the configured HiRISE files (sizes verified)")
    args = ap.parse_args(argv)
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    data = args.data_dir.resolve()
    raw = data / "raw" / "hirise"
    if args.fetch:
        fetch_files(cfg, raw)
    missing = [f["name"] for im in cfg["images"] for f in im["files"] if not (raw / f["name"]).exists()]
    if missing:
        print(f"BLOCKED: missing {missing} in {raw}; run with --fetch (downloads ~1.35 GB) or place the files there")
        return 2

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
    ortho = load_ortho(manifest, data / "cache")

    sun_o = json.loads((EVIDENCE_DIR / "photometric_control.json").read_text(encoding="utf-8"))["sun_fit"]
    az_o, el_o = float(sun_o["azimuth_deg"]), float(sun_o["elevation_deg"])
    x2b = json.loads((EVIDENCE_DIR / "cross_validation_report.json").read_text(encoding="utf-8"))
    x2b_q = next(c for c in x2b["checks"] if c["id"].startswith("X2b"))["results"]["usgs-ortho/quadratic-masked"]
    u_o = anti_sun_unit(az_o)
    M = x2b_q["shift_east_m"] * u_o[0] + x2b_q["shift_south_m"] * u_o[1]

    def rendering(az, el):
        lam = lambert(gx, gy, az, el)
        return np.where(cast_shadow(z, dxg, dy, az, el), 0.08 * np.nanmax(lam), lam)

    synth_o = rendering(az_o, el_o)
    wins = window_grid(H, W, CRITERIA["windows"]["window_size_cells"], CRITERIA["windows"]["window_margin_cells"])
    m = CRITERIA["windows"]["search_radius_cells"]
    per_image = {}
    for im in cfg["images"]:
        jp2 = raw / next(f["name"] for f in im["files"] if f["name"].endswith(".JP2"))
        lbl = raw / next(f["name"] for f in im["files"] if f["name"].endswith(".LBL"))
        lbl_values = label_values(lbl)
        img, meta = image_on_grid(jp2, lbl_values, manifest)
        meta["label"] = lbl_values
        dr0, dc0, peak0 = phase_correlation_shift(ortho, img, CRITERIA["coarse_prealignment_max_shift_cells"])
        img = shift_image(img, dr0, dc0)  # common to p_k and c_k: cancels in d_k
        fit_az, fit_el, fit_c = fit_sun_azimuth(img, gx, gy)
        az_k, el_k = im["sun_azimuth_deg"], im["sun_elevation_deg"]
        synth_k = rendering(az_k, el_k)
        clip = tuple(np.nanpercentile(img, [10, 99.5]))
        clip_s = tuple(np.nanpercentile(synth_k, [10, 99.5]))
        rows = []
        for w in wins:
            p = photometric_window_shift(img, gx, gy, slope, w, m, "quadratic-masked", clip)
            c = xcorr_window_shift(ortho, img, w, m)
            pc = photometric_window_shift(synth_k, gx, gy, slope, w, m, "quadratic-masked", clip_s)
            b = xcorr_window_shift(synth_o, synth_k, w, m)
            pe, ps = p.metres(dxg, dy)
            ce, cs = c.metres(dxg, dy)
            be, bs = b.metres(dxg, dy)
            pce, pcs = pc.metres(dxg, dy)
            rows.append({"row0": w.row0, "col0": w.col0, "p_east_m": round(pe, 3), "p_south_m": round(ps, 3), "c_east_m": round(ce, 3),
                         "c_south_m": round(cs, 3), "b_east_m": round(be, 3), "b_south_m": round(bs, 3),
                         "d_east_m": round(pe - (ce - be), 3), "d_south_m": round(ps - (cs - bs), 3),
                         "control_p_east_m": round(pce, 3), "control_p_south_m": round(pcs, 3),
                         "p_reliable": reliable_photometric(p, WINDOWED), "c_reliable": xcorr_reliable(c),
                         "p_peak": round(p.best, 4), "c_peak": round(c.best, 4)})
        used = [r for r in rows if r["p_reliable"] and r["c_reliable"]]
        ctl_e = bootstrap_median(np.array([r["control_p_east_m"] for r in rows]))[0]
        ctl_s = bootstrap_median(np.array([r["control_p_south_m"] for r in rows]))[0]
        iv = CRITERIA["image_validity"]
        az_err = abs((fit_az - az_k + 180) % 360 - 180)
        valid = abs(ctl_e) <= iv["control_max_abs_median_m"] and abs(ctl_s) <= iv["control_max_abs_median_m"] and az_err <= iv["sun_fit_max_azimuth_error_deg"]
        de = bootstrap_median(np.array([r["d_east_m"] for r in used]))
        ds = bootstrap_median(np.array([r["d_south_m"] for r in used]))
        per_image[im["id"]] = {
            "role": im["role"], "sun_azimuth_deg": az_k, "sun_elevation_deg": el_k, "image": meta,
            "coarse_prealignment_cells": [dr0, dc0], "coarse_prealignment_m": [round(dc0 * dxg, 2), round(dr0 * dy, 2)], "coarse_peak": round(peak0, 4),
            "fitted_shading_sun": {"azimuth_deg": fit_az, "elevation_deg": fit_el, "correlation": fit_c, "azimuth_error_deg": round(az_err, 1)},
            "control_median_m": [round(ctl_e, 3), round(ctl_s, 3)], "valid": valid, "windows_used": len(used),
            "D_east_m": [round(v, 3) for v in de], "D_south_m": [round(v, 3) for v in ds],
            "artifact_prediction_m": [round(M * anti_sun_unit(az_k)[0], 3), round(M * anti_sun_unit(az_k)[1], 3)],
            "per_window": rows,
        }
        print(f"{im['id']} sun {az_k:.1f}/{el_k:.1f}: prealign {dc0 * dxg:+.1f} m E {dr0 * dy:+.1f} m S; fitted az {fit_az:.0f} (err {az_err:.0f}); "
              f"control {ctl_e:+.2f}/{ctl_s:+.2f} m; windows {len(used)}; D = {de[0]:+.2f} m E [{de[1]:+.2f},{de[2]:+.2f}], {ds[0]:+.2f} m S [{ds[1]:+.2f},{ds[2]:+.2f}]; valid {valid}")

    A = next(k for k, v in per_image.items() if v["role"] == "extreme-A")
    B = next(k for k, v in per_image.items() if v["role"] == "extreme-B")
    uA, uB = anti_sun_unit(per_image[A]["sun_azimuth_deg"]), anti_sun_unit(per_image[B]["sun_azimuth_deg"])
    dpred = (M * (uB[0] - uA[0]), M * (uB[1] - uA[1]))
    n2 = dpred[0] ** 2 + dpred[1] ** 2
    ra = {(r["row0"], r["col0"]): r for r in per_image[A]["per_window"] if r["p_reliable"] and r["c_reliable"]}
    rb = {(r["row0"], r["col0"]): r for r in per_image[B]["per_window"] if r["p_reliable"] and r["c_reliable"]}
    keys = sorted(set(ra) & set(rb))
    s = np.array([((rb[k]["d_east_m"] - ra[k]["d_east_m"]) * dpred[0] + (rb[k]["d_south_m"] - ra[k]["d_south_m"]) * dpred[1]) / n2 for k in keys])
    dc = CRITERIA["decision"]
    s_hat, s_lo, s_hi = bootstrap_median(s, dc["bootstrap"], dc["seed"]) if len(s) else (float("nan"),) * 3
    if len(keys) < dc["min_paired_windows"] or not (per_image[A]["valid"] and per_image[B]["valid"]):
        outcome = "INCONCLUSIVE"
    elif dc["real_ci_within"][0] <= s_lo and s_hi <= dc["real_ci_within"][1] and s_hi - s_lo <= dc["real_max_ci_width"]:
        outcome = "REAL-OFFSET-CONSISTENT"
    elif dc["artifact_ci_within"][0] <= s_lo and s_hi <= dc["artifact_ci_within"][1]:
        outcome = "ARTIFACT-CONSISTENT"
    else:
        outcome = "INCONCLUSIVE"
    print(f"pair {A} vs {B}: {len(keys)} windows; predicted artifact change {dpred[0]:+.2f} m E {dpred[1]:+.2f} m S; "
          f"s = {s_hat:.2f} [{s_lo:.2f}, {s_hi:.2f}] -> {outcome}")
    write_json(EVIDENCE_DIR / "registration_illumination.json", finite_or_none({
        "generated_utc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "terrain_sha256": manifest["binary"]["sha256"],
        "question": "Does the X2b apparent DTM-to-imagery offset follow the sun azimuth (artifact) or stay fixed (real displacement)?",
        "criteria": CRITERIA,
        "orthomosaic_sun_fit": {"azimuth_deg": az_o, "elevation_deg": el_o},
        "x2b_offset_projected_on_antisun_m": round(M, 3),
        "pair": {"A": A, "B": B, "paired_windows": len(keys), "predicted_artifact_change_m": [round(dpred[0], 3), round(dpred[1], 3)],
                 "s_median": round(s_hat, 3), "s_ci95": [round(s_lo, 3), round(s_hi, 3)]},
        "outcome": outcome,
        "images": per_image,
        "x2b_status_changed": False,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
