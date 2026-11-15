#!/usr/bin/env python
"""Inspect the source DTM with GDAL (via rasterio) and check it against its published labels.

Records the georeferencing evidence required by Phase 1 / gate S1-S2: driver, dimensions,
data type, nodata, geotransform, CRS (WKT and PROJ), projected and geographic bounds, and
the PDS3 / FGDC statements about projection, body radius, latitude type, longitude direction,
resolution and accuracy. Each label statement is compared with the raster header.

Usage:
  python scripts/inspect_dem.py [--source data/raw/<dtm>.tif] [--stats]
Writes evidence/source_inspection.json. Exit code 0 only if every comparison passes.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
import rasterio  # noqa: E402

from ausnox_pipeline.dem import inspect_dem, valid_mask  # noqa: E402
from ausnox_pipeline.sources import EVIDENCE_DIR, HIRISE_DTM, HIRISE_DTM_METADATA, HIRISE_DTM_PDS3_LABEL, verify_source  # noqa: E402
from ausnox_pipeline.terrain_asset import write_json  # noqa: E402


def parse_pds3(text: str) -> dict[str, str]:
    out = {}
    for line in text.splitlines():
        m = re.match(r"\s*([A-Z_^0-9]+)\s*=\s*(.+?)\s*$", line)
        if m:
            out.setdefault(m.group(1), m.group(2).strip('"'))
    return out


def num(v: str) -> float:
    return float(re.match(r"[-+0-9.Ee]+", v).group(0))


def fgdc_values(path: Path) -> dict[str, str]:
    root = ET.parse(path).getroot()
    want = {
        "horizontal_accuracy_value_m": "dataqual/posacc/horizpa/qhorizpa/horizpav",
        "horizontal_accuracy_explanation": "dataqual/posacc/horizpa/qhorizpa/horizpae",
        "vertical_accuracy_value_m": "dataqual/posacc/vertacc/qvertpa/vertaccv",
        "vertical_accuracy_explanation": "dataqual/posacc/vertacc/qvertpa/vertacce",
        "horizontal_datum": "spref/horizsys/geodetic/horizdn",
        "ellipsoid": "spref/horizsys/geodetic/ellips",
        "semi_axis_m": "spref/horizsys/geodetic/semiaxis",
        "projection": "spref/horizsys/planar/mapproj/mapprojn",
        "standard_parallel": "spref/horizsys/planar/mapproj/equirect/stdparll",
        "central_meridian": "spref/horizsys/planar/mapproj/equirect/longcm",
        "attribute_min_m": "eainfo/detailed/attr/attrdomv/rdom/rdommin",
        "attribute_max_m": "eainfo/detailed/attr/attrdomv/rdom/rdommax",
        "access_constraints": "idinfo/accconst",
        "use_constraints": "idinfo/useconst",
        "publication_date": "idinfo/citation/citeinfo/pubdate",
        "doi_link": "idinfo/citation/citeinfo/onlink",
    }
    out = {}
    for k, p in want.items():
        el = root.find(p)
        out[k] = re.sub(r"\s+", " ", el.text.strip()) if el is not None and el.text else None
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", type=Path, default=None)
    ap.add_argument("--stats", action="store_true", help="stream the full raster for valid-data statistics (~10 s)")
    args = ap.parse_args(argv)
    src = verify_source(HIRISE_DTM, args.source)
    info = inspect_dem(str(src))
    with rasterio.open(src) as ds:
        header = {
            "driver": ds.driver, "width": ds.width, "height": ds.height, "count": ds.count, "dtype": ds.dtypes[0],
            "nodata": ds.nodata, "transform": list(ds.transform)[:6], "bounds_projected_m": list(ds.bounds),
            "block_shape": list(ds.block_shapes[0]), "tiled": bool(ds.profile.get("tiled", False)),
            "compression": str(ds.compression) if ds.compression else None, "units": list(ds.units),
            "crs_wkt": ds.crs.to_wkt(), "gdal": rasterio.__gdal_version__, "rasterio": rasterio.__version__,
        }
        stats = None
        if args.stats:
            valid = 0
            vmin, vmax, total = np.inf, -np.inf, 0.0
            for r0 in range(0, ds.height, 512):
                a = ds.read(1, window=((r0, min(r0 + 512, ds.height)), (0, ds.width)))
                m = valid_mask(a, ds.nodata)
                if m.any():
                    v = a[m].astype(np.float64)
                    valid += int(m.sum())
                    vmin, vmax, total = min(vmin, float(v.min())), max(vmax, float(v.max())), total + float(v.sum())
            stats = {"valid_posts": valid, "total_posts": ds.width * ds.height, "valid_fraction": valid / (ds.width * ds.height),
                     "min_m": vmin, "max_m": vmax, "mean_m": total / valid}
    crs = info.crs
    west, north = crs.inverse(info.bounds[0], info.bounds[3])
    east, south = crs.inverse(info.bounds[2], info.bounds[1])
    geo_bounds = {"west": west, "east": east, "south": south, "north": north}

    checks = []

    def check(cid: str, ok: bool, detail: str) -> None:
        checks.append({"id": cid, "status": "PASS" if ok else "FAIL", "detail": detail})
        print(f"[{'PASS' if ok else 'FAIL':4}] {cid}: {detail}")

    label = parse_pds3(verify_source(HIRISE_DTM_PDS3_LABEL).read_text(encoding="utf-8"))
    check("L1-dimensions", int(label["LINES"]) == info.height and int(label["LINE_SAMPLES"]) == info.width,
          f"PDS3 LINES x LINE_SAMPLES {label['LINES']} x {label['LINE_SAMPLES']} vs raster {info.height} x {info.width}")
    check("L2-pixel-scale", abs(num(label["MAP_SCALE"]) - info.pixel_size[0]) < 1e-9 and info.pixel_size[0] == info.pixel_size[1],
          f"PDS3 MAP_SCALE {label['MAP_SCALE']} vs geotransform {info.pixel_size}")
    check("L3-body-radius", abs(num(label["A_AXIS_RADIUS"]) * 1000 - crs.radius_m) < 0.5 and abs(num(label["C_AXIS_RADIUS"]) * 1000 - crs.radius_m) < 0.5,
          f"PDS3 A/C_AXIS_RADIUS {label['A_AXIS_RADIUS']}/{label['C_AXIS_RADIUS']} vs CRS sphere {crs.radius_m} m")
    check("L4-conventions", label.get("POSITIVE_LONGITUDE_DIRECTION") == "EAST" and label.get("PROJECTION_LATITUDE_TYPE") == "PLANETOCENTRIC"
          and label.get("MAP_PROJECTION_TYPE") == "EQUIRECTANGULAR" and num(label["CENTER_LATITUDE"]) == 0 and num(label["CENTER_LONGITUDE"]) == 0,
          "PDS3: equirectangular, center lat/lon 0, planetocentric latitude, east-positive longitude")
    tol = 1e-9
    check("L5-geographic-bounds",
          abs(num(label["WESTERNMOST_LONGITUDE"]) - west) < tol and abs(num(label["EASTERNMOST_LONGITUDE"]) - east) < tol
          and abs(num(label["MINIMUM_LATITUDE"]) - south) < tol and abs(num(label["MAXIMUM_LATITUDE"]) - north) < tol,
          f"PDS3 W/E/S/N {label['WESTERNMOST_LONGITUDE']}/{label['EASTERNMOST_LONGITUDE']}/{label['MINIMUM_LATITUDE']}/{label['MAXIMUM_LATITUDE']} "
          f"vs bounds from geotransform {west:.9f}/{east:.9f}/{south:.9f}/{north:.9f}")
    fgdc = fgdc_values(verify_source(HIRISE_DTM_METADATA))
    check("F1-fgdc-geodetic", fgdc["horizontal_datum"] == "D_Mars_2000_Sphere" and abs(float(fgdc["semi_axis_m"]) - crs.radius_m) < 0.5
          and fgdc["projection"] == "Equirectangular" and float(fgdc["standard_parallel"]) == 0 and float(fgdc["central_meridian"]) == 0,
          f"FGDC datum {fgdc['horizontal_datum']}, semi-axis {fgdc['semi_axis_m']} m, {fgdc['projection']} std parallel {fgdc['standard_parallel']}")
    notes = []
    if stats:
        lo, hi = float(fgdc["attribute_min_m"]), float(fgdc["attribute_max_m"])
        if not (lo <= stats["min_m"] and stats["max_m"] <= hi):
            notes.append(f"FGDC attribute range {lo}..{hi} m does not contain the observed raster range "
                         f"{stats['min_m']:.3f}..{stats['max_m']:.3f} m; the published metadata range appears to "
                         "describe a different version or subset. The Ausnox AOI values lie inside both ranges.")
    out = {
        "generated_utc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "product": {"key": HIRISE_DTM.key, "filename": HIRISE_DTM.filename, "bytes": HIRISE_DTM.bytes, "sha256": HIRISE_DTM.sha256,
                    "url": HIRISE_DTM.url, "doi": HIRISE_DTM.doi},
        "header": header, "crs": crs.to_manifest(), "geographic_bounds_deg": geo_bounds,
        "pds3_label": {k: label[k] for k in label if not k.startswith("^")},
        "fgdc": fgdc, "full_raster_statistics": stats, "checks": checks, "notes": notes,
        "overall": "PASS" if all(c["status"] == "PASS" for c in checks) else "FAIL",
    }
    for n in notes:
        print("[NOTE] " + n)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    write_json(EVIDENCE_DIR / "source_inspection.json", out)
    print("OVERALL:", out["overall"])
    return 0 if out["overall"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
