"""Serialization, checksum, placeholder and source-verification tests (synthetic data only)."""
import copy
import json

import numpy as np
import pytest

from ausnox_pipeline import TERRAIN_SCHEMA_VERSION
from ausnox_pipeline.sources import SourceProduct, SourceVerificationError, sha256_file, verify_source
from ausnox_pipeline.terrain_asset import (
    AssetFormatError,
    TerrainArrays,
    check_manifest_structure,
    find_placeholders,
    pack_terrain,
    read_asset,
    unpack_terrain,
    write_asset,
)


def minimal_manifest(w=5, h=3):
    return {
        "schema_version": TERRAIN_SCHEMA_VERSION,
        "asset_type": "ausnox-terrain-grid",
        "aoi_id": "unit-test-synthetic",
        "title": "synthetic unit-test grid (not Mars data)",
        "source": {"products": []},
        "crs": {"kind": "mars-equirectangular-sphere"},
        "grid": {"width": w, "height": h, "cell_size_x_m": 2.0, "cell_size_y_m": 2.0, "origin_x_m": 0.0,
                 "origin_y_m": 0.0, "row_order": "north-to-south", "col_order": "west-to-east"},
        "elevation": {}, "slope": {}, "flags": {"ELEVATION_VALID": 1, "SLOPE_VALID": 2},
        "binary": {}, "statistics": {}, "processing": {}, "validation": {"status": "not-run"},
    }


def arrays(w=5, h=3):
    e = np.arange(w * h, dtype=np.float32).reshape(h, w)
    e[0, 0] = np.nan
    s = np.full((h, w), np.nan, dtype=np.float32)
    s[1, 1:-1] = [1.5, 2.5, 3.5]
    f = np.zeros((h, w), dtype=np.uint8)
    f[np.isfinite(e)] |= 1
    f[np.isfinite(s)] |= 2
    return TerrainArrays(e, s, f)


def test_pack_unpack_roundtrip_preserves_values_and_nan(tmp_path):
    m = write_asset(tmp_path, minimal_manifest(), arrays())
    blob = (tmp_path / "terrain.bin").read_bytes()
    back = unpack_terrain(blob, m)
    a = arrays()
    assert np.array_equal(np.isnan(back.elevation), np.isnan(a.elevation))
    assert np.array_equal(back.elevation[1:], a.elevation[1:])
    assert np.array_equal(back.flags, a.flags)
    for s in m["binary"]["sections"]:
        assert s["byte_offset"] % 4 == 0
    assert m["binary"]["endianness"] == "little"


def test_little_endian_layout_is_explicit():
    blob, sections = pack_terrain(arrays())
    first = np.frombuffer(blob, dtype="<f4", count=2, offset=sections[0]["byte_offset"])
    assert np.isnan(first[0]) and first[1] == 1.0


def test_read_asset_detects_corruption(tmp_path):
    write_asset(tmp_path, minimal_manifest(), arrays())
    p = tmp_path / "terrain.bin"
    b = bytearray(p.read_bytes())
    b[10] ^= 0xFF
    p.write_bytes(bytes(b))
    with pytest.raises(AssetFormatError, match="SHA-256"):
        read_asset(tmp_path)


def test_unpack_rejects_wrong_length():
    blob, sections = pack_terrain(arrays())
    m = minimal_manifest()
    m["binary"] = {"byte_length": len(blob) + 4, "endianness": "little", "sections": sections}
    with pytest.raises(AssetFormatError):
        unpack_terrain(blob, m)


def test_placeholders_and_missing_keys_rejected(tmp_path):
    m = minimal_manifest()
    m["source"] = {"product_id": "SET_AFTER_DOWNLOAD"}
    assert find_placeholders(m) == ["source.product_id"]
    with pytest.raises(AssetFormatError, match="placeholder"):
        write_asset(tmp_path, m, arrays())
    m2 = copy.deepcopy(minimal_manifest())
    del m2["crs"]
    assert any("crs" in p for p in check_manifest_structure(m2))


def test_bad_grid_definitions_rejected():
    m = minimal_manifest()
    m["grid"]["row_order"] = "south-to-north"
    assert check_manifest_structure(m)
    m = minimal_manifest()
    m["grid"]["cell_size_x_m"] = 0
    assert check_manifest_structure(m)


def test_written_manifest_is_strict_json(tmp_path):
    write_asset(tmp_path, minimal_manifest(), arrays())
    text = (tmp_path / "manifest.json").read_text(encoding="utf-8")
    json.loads(text)  # NaN would make json.dumps(allow_nan=False) raise during writing
    assert "NaN" not in text


def test_verify_source_fails_closed(tmp_path):
    p = tmp_path / "x.tif"
    prod = SourceProduct(key="x", filename="x.tif", url="", bytes=4, sha256="0" * 64, title="", provider="",
                         mission="", instrument="", citation="", doi=None, landing_page="", retrieved_utc="")
    with pytest.raises(SourceVerificationError, match="not found"):
        verify_source(prod, p)
    p.write_bytes(b"abc")
    with pytest.raises(SourceVerificationError, match="bytes"):
        verify_source(prod, p)
    p.write_bytes(b"abcd")
    with pytest.raises(SourceVerificationError, match="SHA-256"):
        verify_source(prod, p)
    good = SourceProduct(**{**prod.__dict__, "sha256": sha256_file(p)})
    assert verify_source(good, p) == p
