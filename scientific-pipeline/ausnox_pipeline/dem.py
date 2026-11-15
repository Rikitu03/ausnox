"""DEM ingestion and terrain derivation (pure functions + thin rasterio I/O).

Conventions
-----------
* Arrays are row-major with row 0 = NORTH (GeoTIFF order). Columns increase eastward.
* Missing elevation is ``NaN`` in float arrays; it is never interpolated or filled.
* Slope uses Horn (1981) 3x3 finite differences with *physical* spacing:
  ``dx_ground(row) = cell_proj_dx * cos(lat(row))`` and ``dy_ground = cell_proj_dy``.
  A cell gets a slope only if all 8 neighbours and the cell itself have elevation;
  otherwise slope is unknown (``NaN``). Grid-edge cells are therefore unknown.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import rasterio
from rasterio.windows import Window

from .mars_crs import MarsEquirectangular, parse_mars_equirectangular

FLAG_ELEVATION_VALID = 1
FLAG_SLOPE_VALID = 2


class DemValidationError(ValueError):
    """Raised when a DEM does not satisfy the documented ingestion requirements."""


@dataclass(frozen=True)
class DemInfo:
    path: str
    driver: str
    width: int
    height: int
    dtype: str
    nodata: float | None
    transform: tuple[float, float, float, float, float, float]
    bounds: tuple[float, float, float, float]
    crs: MarsEquirectangular
    units: tuple[str | None, ...]
    tiled: bool
    block_shape: tuple[int, int]

    @property
    def pixel_size(self) -> tuple[float, float]:
        a, _, _, _, e, _ = self.transform
        return a, -e


def inspect_dem(path: str) -> DemInfo:
    """Open ``path`` and validate the georeferencing needed by the pipeline."""
    with rasterio.open(path) as ds:
        if ds.count != 1:
            raise DemValidationError(f"Expected a single-band DEM, found {ds.count} bands.")
        if ds.crs is None:
            raise DemValidationError("DEM has no CRS.")
        crs = parse_mars_equirectangular(ds.crs.to_wkt())
        t = ds.transform
        if abs(t.b) > 0 or abs(t.d) > 0:
            raise DemValidationError("Rotated geotransforms are not supported.")
        if t.a <= 0 or t.e >= 0:
            raise DemValidationError("Expected north-up raster (positive x step, negative y step).")
        if ds.nodata is None:
            raise DemValidationError("DEM declares no nodata value; refusing to treat any value as valid by default.")
        return DemInfo(
            path=str(path),
            driver=ds.driver,
            width=ds.width,
            height=ds.height,
            dtype=ds.dtypes[0],
            nodata=float(ds.nodata),
            transform=(t.a, t.b, t.c, t.d, t.e, t.f),
            bounds=tuple(ds.bounds),
            crs=crs,
            units=tuple(ds.units),
            tiled=bool(ds.profile.get("tiled", False)),
            block_shape=tuple(ds.block_shapes[0]),
        )


def valid_mask(values: np.ndarray, nodata: float) -> np.ndarray:
    """True where ``values`` carry a measured elevation.

    The HiRISE DTM uses ``-3.4028226550889045e+38`` (float32 lowest) as nodata; any
    non-finite value or value below -1e30 is also treated as missing.
    """
    v = np.asarray(values)
    return np.isfinite(v) & (v != nodata) & (v > -1e30)


def read_window(path: str, window: Window) -> tuple[np.ndarray, rasterio.Affine]:
    """Read ``window`` as float64 with NaN for nodata. The window must lie inside the raster."""
    with rasterio.open(path) as ds:
        if window.col_off < 0 or window.row_off < 0 or window.col_off + window.width > ds.width \
                or window.row_off + window.height > ds.height:
            raise DemValidationError(f"Window {window} exceeds raster {ds.width}x{ds.height}.")
        raw = ds.read(1, window=window)
        nod = ds.nodata
        wt = ds.window_transform(window)
    out = raw.astype(np.float64)
    out[~valid_mask(raw, nod)] = np.nan
    return out, wt


def block_mean_fail_closed(a: np.ndarray, factor: int) -> np.ndarray:
    """Aggregate ``factor`` x ``factor`` blocks by arithmetic mean.

    Any block containing a missing (NaN) post becomes NaN: no partial-coverage averaging,
    so unknown terrain never becomes "known" through resampling. The input shape must be
    an exact multiple of ``factor``.
    """
    if factor < 1:
        raise ValueError("factor must be >= 1")
    h, w = a.shape
    if h % factor or w % factor:
        raise ValueError(f"Array shape {a.shape} is not divisible by factor {factor}.")
    if factor == 1:
        return a.astype(np.float64, copy=True)
    b = a.reshape(h // factor, factor, w // factor, factor).astype(np.float64)
    return b.mean(axis=(1, 3))  # NaN propagates


def row_center_latitudes(top_y: float, cell_dy: float, nrows: int, radius_m: float) -> np.ndarray:
    """Planetocentric latitude (deg) at the centre of each row for the Mars equirectangular sphere."""
    ys = top_y - (np.arange(nrows) + 0.5) * cell_dy
    return np.degrees(ys / radius_m)


def ground_cell_dx(cell_dx_proj: float, latitudes_deg: np.ndarray, lat_ts_deg: float = 0.0) -> np.ndarray:
    return cell_dx_proj * np.cos(np.radians(latitudes_deg)) / math.cos(math.radians(lat_ts_deg))


def horn_slope_deg(z: np.ndarray, dx_rows: np.ndarray, dy: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Horn (1981) slope in degrees plus the gradient components (dz/dx east, dz/dy north).

    ``dx_rows`` holds the physical east-west spacing of each row (metres); ``dy`` the
    north-south spacing (metres). Returns (slope_deg, dzdx, dzdy) with NaN where unknown.
    """
    if z.ndim != 2:
        raise ValueError("z must be 2-D")
    h, w = z.shape
    dx = np.asarray(dx_rows, dtype=np.float64).reshape(h, 1)
    if np.any(dx <= 0) or dy <= 0:
        raise ValueError("Cell spacing must be positive")
    p = np.pad(z.astype(np.float64), 1, mode="constant", constant_values=np.nan)
    z1, z2, z3 = p[:-2, :-2], p[:-2, 1:-1], p[:-2, 2:]
    z4, z5, z6 = p[1:-1, :-2], p[1:-1, 1:-1], p[1:-1, 2:]
    z7, z8, z9 = p[2:, :-2], p[2:, 1:-1], p[2:, 2:]
    # x grows east (column +1); rows grow south, so north is row -1.
    dzdx = ((z3 + 2.0 * z6 + z9) - (z1 + 2.0 * z4 + z7)) / (8.0 * dx)
    dzdy = ((z1 + 2.0 * z2 + z3) - (z7 + 2.0 * z8 + z9)) / (8.0 * dy)
    slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
    unknown = ~np.isfinite(slope) | ~np.isfinite(z5)
    slope[unknown] = np.nan
    dzdx[unknown] = np.nan
    dzdy[unknown] = np.nan
    return slope, dzdx, dzdy


def build_flags(elevation: np.ndarray, slope: np.ndarray) -> np.ndarray:
    flags = np.zeros(elevation.shape, dtype=np.uint8)
    flags[np.isfinite(elevation)] |= FLAG_ELEVATION_VALID
    flags[np.isfinite(slope)] |= FLAG_SLOPE_VALID
    return flags


def bilinear_sample(a: np.ndarray, col_f: float, row_f: float) -> float | None:
    """Bilinear sample at fractional pixel coordinates (pixel centres at +0.5).

    Returns None unless all four surrounding posts are valid (no extrapolation).
    """
    c0 = math.floor(col_f - 0.5)
    r0 = math.floor(row_f - 0.5)
    h, w = a.shape
    if c0 < 0 or r0 < 0 or c0 + 1 >= w or r0 + 1 >= h:
        return None
    q = a[r0:r0 + 2, c0:c0 + 2]
    if not np.all(np.isfinite(q)):
        return None
    fx = (col_f - 0.5) - c0
    fy = (row_f - 0.5) - r0
    return float(q[0, 0] * (1 - fx) * (1 - fy) + q[0, 1] * fx * (1 - fy)
                 + q[1, 0] * (1 - fx) * fy + q[1, 1] * fx * fy)
