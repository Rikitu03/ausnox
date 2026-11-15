"""Content checks for records taken from the live NASA/JPL MMGIS waypoint layer."""
from __future__ import annotations

import math


class WaypointMismatchError(ValueError):
    """Raised when a referenced rover waypoint differs from the value pinned in the config."""


def index_by_rmc(features: list[dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for f in features:
        rmc = f["properties"]["RMC"]
        if rmc in out:
            raise WaypointMismatchError(f"Duplicate RMC {rmc} in waypoint file")
        out[rmc] = f
    return out


def check_expected_waypoint(rmc: str, props: dict, expected: dict, tol: float = 1e-9) -> None:
    """Fail unless ``props`` matches the pinned sol / lon / lat / elev_geoid exactly (within ``tol``)."""
    if int(props["sol"]) != int(expected["sol"]):
        raise WaypointMismatchError(f"RMC {rmc}: sol {props['sol']} != pinned {expected['sol']}")
    for key in ("lon", "lat", "elev_geoid"):
        got, want = float(props[key]), float(expected[key])
        if not (math.isfinite(got) and abs(got - want) <= tol):
            raise WaypointMismatchError(
                f"RMC {rmc}: {key} {got!r} != pinned {want!r}; NASA may have revised the localization. "
                "Review the science target before updating config/jezero_p0.json."
            )
