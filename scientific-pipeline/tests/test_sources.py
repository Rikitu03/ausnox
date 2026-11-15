"""Source registry, live-layer handling and waypoint content checks (no network)."""
import json

import pytest

from ausnox_pipeline.sources import ALL_DOWNLOADS, M20_WAYPOINTS, SourceProduct, SourceVerificationError, file_fingerprint, verify_source
from ausnox_pipeline.waypoints import WaypointMismatchError, check_expected_waypoint, index_by_rmc


def test_registry_has_no_placeholders_and_https_urls():
    keys = [p.key for p in ALL_DOWNLOADS]
    assert len(keys) == len(set(keys))
    for p in ALL_DOWNLOADS:
        assert p.url.startswith("https://")
        assert not p.sha256.startswith("SET_") and "PLACEHOLDER" not in p.retrieved_utc
        if not p.live:
            assert len(p.sha256) == 64 and p.bytes > 0


def test_live_layer_requires_existence_but_not_a_fixed_checksum(tmp_path):
    p = tmp_path / "M20_waypoints.json"
    with pytest.raises(SourceVerificationError):
        verify_source(M20_WAYPOINTS, p)
    p.write_text('{"type": "FeatureCollection", "features": []}', encoding="utf-8")
    assert verify_source(M20_WAYPOINTS, p) == p
    size, sha = file_fingerprint(p)
    assert size == p.stat().st_size and len(sha) == 64


def test_non_live_product_still_fails_closed(tmp_path):
    prod = SourceProduct(key="k", filename="k.bin", url="https://x", bytes=3, sha256="0" * 64, title="", provider="",
                         mission="", instrument="", citation="", doi=None, landing_page="", retrieved_utc="")
    (tmp_path / "k.bin").write_bytes(b"abc")
    with pytest.raises(SourceVerificationError, match="SHA-256"):
        verify_source(prod, tmp_path / "k.bin")


def _wp(rmc, sol=686, lon=77.40844668, lat=18.45337179, elev=-2545.203):
    return {"properties": {"RMC": rmc, "sol": sol, "lon": lon, "lat": lat, "elev_geoid": elev}}


EXPECTED = {"sol": 686, "lon": 77.40844668, "lat": 18.45337179, "elev_geoid": -2545.203}


def test_expected_waypoint_match_and_mismatch():
    check_expected_waypoint("32_1184", _wp("32_1184")["properties"], EXPECTED)
    with pytest.raises(WaypointMismatchError, match="lon"):
        check_expected_waypoint("32_1184", _wp("32_1184", lon=77.4085)["properties"], EXPECTED)
    with pytest.raises(WaypointMismatchError, match="sol"):
        check_expected_waypoint("32_1184", _wp("32_1184", sol=690)["properties"], EXPECTED)
    with pytest.raises(WaypointMismatchError):
        check_expected_waypoint("32_1184", _wp("32_1184", elev=float("nan"))["properties"], EXPECTED)


def test_index_by_rmc_rejects_duplicates():
    assert set(index_by_rmc([_wp("a"), _wp("b")])) == {"a", "b"}
    with pytest.raises(WaypointMismatchError, match="Duplicate"):
        index_by_rmc([_wp("a"), _wp("a")])


def test_config_pins_every_science_target():
    from ausnox_pipeline.sources import PIPELINE_ROOT
    cfg = json.loads((PIPELINE_ROOT / "config" / "jezero_p0.json").read_text(encoding="utf-8"))
    for t in cfg["science_targets"]:
        assert set(t["expected_waypoint"]) == {"sol", "lon", "lat", "elev_geoid"}
        assert all(s["url"].startswith("https://") for s in t["sources"])
