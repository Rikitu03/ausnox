"""Versioned terrain asset format shared with the TypeScript engine.

``terrain.bin`` is a little-endian concatenation of three row-major sections (row 0 = north):

    elevation_m  float32  width*height   NaN = no measured elevation
    slope_deg    float32  width*height   NaN = slope unknown (missing neighbour or grid edge)
    flags        uint8    width*height   bit0 ELEVATION_VALID, bit1 SLOPE_VALID

Section offsets are 4-byte aligned so browsers can create typed-array views without copying.
``manifest.json`` describes geometry, CRS, provenance, checksums and validation status.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import TERRAIN_SCHEMA_VERSION
from .dem import FLAG_ELEVATION_VALID, FLAG_SLOPE_VALID

PLACEHOLDER_PREFIX = "SET_"
REQUIRED_TOP_LEVEL = (
    "schema_version", "asset_type", "aoi_id", "title", "source", "crs", "grid", "elevation",
    "slope", "flags", "binary", "statistics", "processing", "validation",
)
SECTION_ORDER = (("elevation_m", "float32", 4), ("slope_deg", "float32", 4), ("flags", "uint8", 1))


class AssetFormatError(ValueError):
    """Raised when a terrain asset is malformed or inconsistent with its manifest."""


@dataclass
class TerrainArrays:
    elevation: np.ndarray  # float32, NaN = missing
    slope: np.ndarray  # float32, NaN = unknown
    flags: np.ndarray  # uint8

    @property
    def shape(self) -> tuple[int, int]:
        return self.elevation.shape


def _align4(n: int) -> int:
    return (n + 3) & ~3


def pack_terrain(arrays: TerrainArrays) -> tuple[bytes, list[dict]]:
    h, w = arrays.shape
    if arrays.slope.shape != (h, w) or arrays.flags.shape != (h, w):
        raise AssetFormatError("Elevation, slope and flags must share one shape.")
    parts = [
        np.ascontiguousarray(arrays.elevation, dtype="<f4").tobytes(order="C"),
        np.ascontiguousarray(arrays.slope, dtype="<f4").tobytes(order="C"),
        np.ascontiguousarray(arrays.flags, dtype="u1").tobytes(order="C"),
    ]
    out = bytearray()
    sections = []
    for (name, dtype, _), blob in zip(SECTION_ORDER, parts):
        offset = _align4(len(out))
        out.extend(b"\x00" * (offset - len(out)))
        out.extend(blob)
        sections.append({"name": name, "dtype": dtype, "byte_offset": offset, "byte_length": len(blob)})
    return bytes(out), sections


def unpack_terrain(blob: bytes, manifest: dict) -> TerrainArrays:
    grid = manifest["grid"]
    w, h = int(grid["width"]), int(grid["height"])
    n = w * h
    binary = manifest["binary"]
    if binary.get("endianness") != "little":
        raise AssetFormatError("Only little-endian terrain assets are supported.")
    if len(blob) != int(binary["byte_length"]):
        raise AssetFormatError(f"terrain.bin has {len(blob)} bytes, manifest says {binary['byte_length']}.")
    by_name = {s["name"]: s for s in binary["sections"]}
    out = {}
    for name, dtype, size in SECTION_ORDER:
        s = by_name.get(name)
        if s is None:
            raise AssetFormatError(f"Missing section {name}.")
        if s["dtype"] != dtype or int(s["byte_length"]) != n * size or int(s["byte_offset"]) % 4:
            raise AssetFormatError(f"Section {name} has inconsistent dtype/length/alignment.")
        start = int(s["byte_offset"])
        np_dtype = "<f4" if dtype == "float32" else "u1"
        out[name] = np.frombuffer(blob, dtype=np_dtype, count=n, offset=start).reshape(h, w)
    return TerrainArrays(out["elevation_m"], out["slope_deg"], out["flags"])


def sha256_bytes(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def find_placeholders(obj, path="") -> list[str]:
    """Return JSON paths whose string values are SET_* placeholders (never allowed in a shipped asset)."""
    hits = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            hits += find_placeholders(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            hits += find_placeholders(v, f"{path}[{i}]")
    elif isinstance(obj, str) and obj.startswith(PLACEHOLDER_PREFIX):
        hits.append(path)
    return hits


def check_manifest_structure(manifest: dict) -> list[str]:
    """Structural manifest checks shared by the builder and the validator. Returns problems."""
    problems = []
    for key in REQUIRED_TOP_LEVEL:
        if key not in manifest:
            problems.append(f"missing top-level key '{key}'")
    if problems:
        return problems
    if manifest["schema_version"] != TERRAIN_SCHEMA_VERSION:
        problems.append(f"schema_version {manifest['schema_version']} != {TERRAIN_SCHEMA_VERSION}")
    if manifest["asset_type"] != "ausnox-terrain-grid":
        problems.append("asset_type must be 'ausnox-terrain-grid'")
    g = manifest["grid"]
    for k in ("width", "height", "cell_size_x_m", "cell_size_y_m", "origin_x_m", "origin_y_m"):
        v = g.get(k)
        if not isinstance(v, (int, float)) or isinstance(v, bool):
            problems.append(f"grid.{k} must be numeric")
    if not problems:
        if g["width"] <= 0 or g["height"] <= 0:
            problems.append("grid dimensions must be positive")
        if g["cell_size_x_m"] <= 0 or g["cell_size_y_m"] <= 0:
            problems.append("cell sizes must be positive")
        if g.get("row_order") != "north-to-south" or g.get("col_order") != "west-to-east":
            problems.append("grid must be row_order north-to-south and col_order west-to-east")
    if manifest["crs"].get("kind") != "mars-equirectangular-sphere":
        problems.append("crs.kind must be 'mars-equirectangular-sphere'")
    if manifest["flags"] != {"ELEVATION_VALID": FLAG_ELEVATION_VALID, "SLOPE_VALID": FLAG_SLOPE_VALID}:
        problems.append("flags definition mismatch")
    for p in find_placeholders(manifest):
        problems.append(f"placeholder value at {p}")
    return problems


def write_asset(out_dir: Path, manifest: dict, arrays: TerrainArrays) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    blob, sections = pack_terrain(arrays)
    manifest = dict(manifest)
    manifest["binary"] = {
        "file": "terrain.bin",
        "byte_length": len(blob),
        "sha256": sha256_bytes(blob),
        "endianness": "little",
        "sections": sections,
    }
    problems = check_manifest_structure(manifest)
    if problems:
        raise AssetFormatError("Refusing to write an invalid manifest: " + "; ".join(problems))
    (out_dir / "terrain.bin").write_bytes(blob)
    write_json(out_dir / "manifest.json", manifest)
    return manifest


def write_json(path: Path, obj) -> None:
    text = json.dumps(obj, indent=2, ensure_ascii=False, allow_nan=False)
    path.write_text(text + "\n", encoding="utf-8", newline="\n")


def read_asset(asset_dir: Path) -> tuple[dict, TerrainArrays, bytes]:
    manifest_path = asset_dir / "manifest.json"
    if not manifest_path.is_file():
        raise AssetFormatError(f"manifest.json not found in {asset_dir}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    problems = check_manifest_structure(manifest)
    if problems:
        raise AssetFormatError("; ".join(problems))
    bin_path = asset_dir / manifest["binary"]["file"]
    if not bin_path.is_file():
        raise AssetFormatError(f"{bin_path.name} not found")
    blob = bin_path.read_bytes()
    if sha256_bytes(blob) != manifest["binary"]["sha256"]:
        raise AssetFormatError("terrain.bin SHA-256 does not match manifest (corrupted or stale asset).")
    return manifest, unpack_terrain(blob, manifest), blob
