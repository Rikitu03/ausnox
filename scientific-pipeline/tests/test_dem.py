"""Unit tests for slope, aggregation and masking on synthetic, clearly separated grids."""
import math

import numpy as np
import pytest

from ausnox_pipeline.dem import (
    FLAG_ELEVATION_VALID,
    FLAG_SLOPE_VALID,
    bilinear_sample,
    block_mean_fail_closed,
    build_flags,
    ground_cell_dx,
    horn_slope_deg,
    row_center_latitudes,
    valid_mask,
)

HIRISE_NODATA = -3.4028226550889045e38


def plane(h, w, ax, ay, dx=1.0, dy=1.0):
    """z = ax * east_m + ay * north_m on a north-up grid (row 0 = north)."""
    cols = np.arange(w) * dx
    rows_north = (h - 1 - np.arange(h)) * dy
    return ax * cols[None, :] + ay * rows_north[:, None]


def test_flat_plane_has_zero_slope_in_interior_and_unknown_edges():
    z = np.full((6, 7), -2500.0)
    s, gx, gy = horn_slope_deg(z, np.full(6, 2.0), 2.0)
    assert np.all(s[1:-1, 1:-1] == 0.0)
    assert np.all(np.isnan(s[0, :])) and np.all(np.isnan(s[-1, :]))
    assert np.all(np.isnan(s[:, 0])) and np.all(np.isnan(s[:, -1]))


def test_known_east_slope_atan_0p1():
    z = plane(7, 9, 0.1, 0.0, dx=2.0, dy=2.0)
    s, gx, gy = horn_slope_deg(z, np.full(7, 2.0), 2.0)
    expect = math.degrees(math.atan(0.1))
    assert expect == pytest.approx(5.710593, abs=1e-6)
    assert np.allclose(s[1:-1, 1:-1], expect, atol=1e-9)
    assert np.allclose(gx[1:-1, 1:-1], 0.1) and np.allclose(gy[1:-1, 1:-1], 0.0)


def test_known_north_slope_sign_and_magnitude():
    z = plane(7, 9, 0.0, 0.25, dx=1.5, dy=2.0)  # rises northward
    s, gx, gy = horn_slope_deg(z, np.full(7, 1.5), 2.0)
    assert np.allclose(gy[1:-1, 1:-1], 0.25)
    assert np.allclose(gx[1:-1, 1:-1], 0.0)
    assert np.allclose(s[1:-1, 1:-1], math.degrees(math.atan(0.25)))


def test_anisotropic_spacing_uses_physical_dx():
    # Same z-step per column, different physical dx -> different slope
    z = np.tile(np.arange(9, dtype=float) * 0.2, (5, 1))
    s_wide, *_ = horn_slope_deg(z, np.full(5, 2.0), 2.0)
    s_narrow, *_ = horn_slope_deg(z, np.full(5, 1.897), 2.0)
    assert np.allclose(s_wide[1:-1, 1:-1], math.degrees(math.atan(0.2 / 2.0)))
    assert np.allclose(s_narrow[1:-1, 1:-1], math.degrees(math.atan(0.2 / 1.897)))


def test_missing_neighbour_makes_slope_unknown():
    z = np.full((5, 5), 10.0)
    z[2, 2] = np.nan
    s, *_ = horn_slope_deg(z, np.full(5, 1.0), 1.0)
    # every interior cell touches (2,2) -> all unknown
    assert np.all(np.isnan(s[1:4, 1:4]))


def test_slope_rejects_nonpositive_spacing():
    with pytest.raises(ValueError):
        horn_slope_deg(np.zeros((3, 3)), np.zeros(3), 1.0)


def test_block_mean_fail_closed():
    a = np.arange(16, dtype=float).reshape(4, 4)
    a[0, 0] = np.nan
    b = block_mean_fail_closed(a, 2)
    assert b.shape == (2, 2)
    assert np.isnan(b[0, 0])
    assert b[0, 1] == pytest.approx(np.mean([2, 3, 6, 7]))
    assert b[1, 1] == pytest.approx(np.mean([10, 11, 14, 15]))
    with pytest.raises(ValueError):
        block_mean_fail_closed(np.zeros((3, 4)), 2)


def test_valid_mask_treats_hirise_nodata_and_nonfinite_as_missing():
    v = np.array([HIRISE_NODATA, -2500.0, np.nan, np.inf, -1e31], dtype=np.float64)
    assert valid_mask(v, HIRISE_NODATA).tolist() == [False, True, False, False, False]
    v32 = v.astype(np.float32)
    assert valid_mask(v32, HIRISE_NODATA).tolist()[:2] == [False, True]


def test_flags():
    e = np.array([[1.0, np.nan], [2.0, 3.0]])
    s = np.array([[np.nan, np.nan], [5.0, np.nan]])
    f = build_flags(e, s)
    assert f[0, 0] == FLAG_ELEVATION_VALID
    assert f[0, 1] == 0
    assert f[1, 0] == FLAG_ELEVATION_VALID | FLAG_SLOPE_VALID


def test_row_latitudes_and_ground_dx():
    R = 3_396_190.0
    top = R * math.radians(18.5)
    lats = row_center_latitudes(top, 2.0, 3, R)
    assert lats[0] == pytest.approx(18.5 - math.degrees(1.0 / R))
    dx = ground_cell_dx(2.0, np.array([0.0, 60.0]))
    assert dx.tolist() == pytest.approx([2.0, 1.0])


def test_bilinear_sample_requires_four_valid_posts():
    a = np.array([[0.0, 1.0], [2.0, 3.0]])
    assert bilinear_sample(a, 1.0, 1.0) == pytest.approx(1.5)
    assert bilinear_sample(a, 0.5, 0.5) == pytest.approx(0.0)
    a[1, 1] = np.nan
    assert bilinear_sample(a, 1.0, 1.0) is None
    assert bilinear_sample(a, 0.2, 0.2) is None  # would need posts outside the array
