"""Mars coordinate reference handling for the pipeline.

The pipeline supports exactly the CRS family of the selected source DTM:
Equirectangular (Equidistant Cylindrical, spherical) on the Mars 2000 IAU sphere
(R = 3 396 190 m), latitude of true scale 0, central meridian 0, no false origin,
planetocentric latitude, east-positive longitude. Any other CRS is rejected so that
Earth defaults (WGS84, Web Mercator) can never be applied silently.

For this CRS the projection is closed-form:
    x = R * lon_rad        y = R * lat_rad
Ground distances on the sphere are therefore anisotropic in projected units:
    ground_dx = projected_dx * cos(lat)      ground_dy = projected_dy
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from pyproj import CRS

MARS_2000_SPHERE_RADIUS_M = 3_396_190.0
EARTH_RADII_M = (6_378_137.0, 6_371_000.0, 6_378_206.4, 6_378_388.0)


class UnsupportedCrsError(ValueError):
    """Raised when a raster CRS is not the supported Mars equirectangular sphere."""


@dataclass(frozen=True)
class MarsEquirectangular:
    radius_m: float
    lat_ts_deg: float
    lon_0_deg: float
    wkt: str
    proj4: str

    def forward(self, lon_east_deg: float, lat_deg: float) -> tuple[float, float]:
        lon = normalize_lon_180(lon_east_deg)
        k = math.cos(math.radians(self.lat_ts_deg))
        return (
            self.radius_m * k * math.radians(lon - self.lon_0_deg),
            self.radius_m * math.radians(lat_deg),
        )

    def inverse(self, x: float, y: float) -> tuple[float, float]:
        k = math.cos(math.radians(self.lat_ts_deg))
        lon = math.degrees(x / (self.radius_m * k)) + self.lon_0_deg
        lat = math.degrees(y / self.radius_m)
        return normalize_lon_180(lon), lat

    def ground_dx_m(self, projected_dx_m: float, lat_deg: float) -> float:
        """Physical east-west length on the sphere of a projected x-interval at latitude ``lat_deg``."""
        k = math.cos(math.radians(self.lat_ts_deg))
        return projected_dx_m * math.cos(math.radians(lat_deg)) / k

    def to_manifest(self) -> dict:
        return {
            "body": "Mars",
            "kind": "mars-equirectangular-sphere",
            "projection": "Equirectangular (Equidistant Cylindrical, spherical)",
            "datum": "Mars 2000 (IAU 2000 sphere)",
            "sphere_radius_m": self.radius_m,
            "latitude_of_true_scale_deg": self.lat_ts_deg,
            "central_meridian_deg": self.lon_0_deg,
            "false_easting_m": 0.0,
            "false_northing_m": 0.0,
            "latitude_type": "planetocentric",
            "longitude_direction": "east-positive",
            "longitude_domain": "-180..180",
            "axis_order_geographic": "longitude,latitude",
            "source_wkt": self.wkt,
            "proj4": self.proj4,
        }


def normalize_lon_180(lon_deg: float) -> float:
    """Normalize an east-positive longitude to the half-open interval [-180, 180)."""
    if not math.isfinite(lon_deg):
        raise ValueError(f"Longitude must be finite, got {lon_deg!r}")
    v = math.fmod(lon_deg + 180.0, 360.0)
    if v < 0:
        v += 360.0
    return v - 180.0


def normalize_lon_360(lon_deg: float) -> float:
    if not math.isfinite(lon_deg):
        raise ValueError(f"Longitude must be finite, got {lon_deg!r}")
    v = math.fmod(lon_deg, 360.0)
    return v + 360.0 if v < 0 else v


def _param(crs: CRS, *names: str) -> float | None:
    conv = crs.coordinate_operation
    if conv is None:
        return None
    for p in conv.params:
        if p.name in names:
            return float(p.value)
    return None


def parse_mars_equirectangular(wkt: str) -> MarsEquirectangular:
    """Validate ``wkt`` and return the closed-form projection. Fails closed with ``UnsupportedCrsError``."""
    if not wkt:
        raise UnsupportedCrsError("Raster has no CRS; refusing to assume one.")
    crs = CRS.from_wkt(wkt)
    if not crs.is_projected:
        raise UnsupportedCrsError(f"CRS is not projected: {crs.name}")
    ell = crs.ellipsoid
    if ell is None:
        raise UnsupportedCrsError("CRS has no ellipsoid definition.")
    a = float(ell.semi_major_metre)
    b = float(ell.semi_minor_metre)
    if any(abs(a - r) < 1000.0 for r in EARTH_RADII_M):
        raise UnsupportedCrsError(f"CRS ellipsoid radius {a} m is an Earth ellipsoid; Mars data required.")
    if abs(a - MARS_2000_SPHERE_RADIUS_M) > 0.5 or abs(b - MARS_2000_SPHERE_RADIUS_M) > 0.5:
        raise UnsupportedCrsError(
            f"CRS body a={a} b={b} m is not the Mars 2000 sphere (R={MARS_2000_SPHERE_RADIUS_M} m)."
        )
    method = (crs.coordinate_operation.method_name if crs.coordinate_operation else "") or ""
    if "Equidistant Cylindrical" not in method and "Equirectangular" not in method:
        raise UnsupportedCrsError(f"Projection method '{method}' is not equirectangular.")
    lat_ts = _param(crs, "Latitude of 1st standard parallel", "Latitude of standard parallel")
    lon_0 = _param(crs, "Longitude of natural origin", "Longitude of false origin")
    fe = _param(crs, "False easting") or 0.0
    fn = _param(crs, "False northing") or 0.0
    if lat_ts is None or lon_0 is None:
        raise UnsupportedCrsError("Could not read latitude of true scale / central meridian from CRS.")
    if abs(fe) > 1e-9 or abs(fn) > 1e-9:
        raise UnsupportedCrsError("False easting/northing must be 0 for the supported CRS.")
    if abs(lat_ts) > 1e-12 or abs(lon_0) > 1e-12:
        # The closed form below supports these, but only lat_ts=0/lon_0=0 has been validated end-to-end.
        raise UnsupportedCrsError(
            f"Only latitude_of_true_scale=0 and central_meridian=0 are validated (got {lat_ts}, {lon_0})."
        )
    units = {ax.unit_name for ax in crs.axis_info}
    if units != {"metre"}:
        raise UnsupportedCrsError(f"Projected axis units must be metres, got {units}.")
    return MarsEquirectangular(
        radius_m=a,
        lat_ts_deg=lat_ts,
        lon_0_deg=lon_0,
        wkt=crs.to_wkt(),
        proj4=crs.to_proj4(),
    )
