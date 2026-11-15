"""Registration diagnostics on synthetic, test-only grids: known shifts must be recovered."""
import math

import numpy as np
import pytest

from ausnox_pipeline.registration import (
    Window,
    anti_sun_unit,
    bootstrap_median,
    photometric_window_shift,
    spearman_permutation,
    window_grid,
    xcorr_window_shift,
)


def smooth_field(h, w, seed, passes=6):
    rng = np.random.default_rng(seed)
    z = rng.normal(size=(h, w))
    for _ in range(passes):  # cheap low-pass: repeated 3x3 box blur
        p = np.pad(z, 1, mode="edge")
        z = sum(p[1 + dr:1 + dr + h, 1 + dc:1 + dc + w] for dr in (-1, 0, 1) for dc in (-1, 0, 1)) / 9.0
    return z * 40.0


def gradients(z, dx=2.0, dy=2.0):
    gx = np.full_like(z, np.nan)
    gy = np.full_like(z, np.nan)
    gx[:, 1:-1] = (z[:, 2:] - z[:, :-2]) / (2 * dx)
    gy[1:-1, :] = (z[:-2, :] - z[2:, :]) / (2 * dy)  # north-positive; row 0 = north
    return gx, gy


def lambert(gx, gy, az=269.0, el=30.0):
    a, e = math.radians(az), math.radians(el)
    sx, sy, sz = math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)
    return np.clip((-gx * sx - gy * sy + sz) / np.sqrt(gx * gx + gy * gy + 1), 0, None)


def shifted(img, dr, dc):
    """Image whose content at (r + dr, c + dc) equals img at (r, c): displaced south by dr, east by dc."""
    out = np.full_like(img, np.nan)
    h, w = img.shape
    out[max(dr, 0):h + min(dr, 0), max(dc, 0):w + min(dc, 0)] = img[max(-dr, 0):h + min(-dr, 0), max(-dc, 0):w + min(-dc, 0)]
    return out


def test_window_grid_keeps_search_margin():
    wins = window_grid(100, 120, 20, 8)
    assert all(w.row0 >= 8 and w.col0 >= 8 and w.row0 + 20 <= 92 and w.col0 + 20 <= 112 for w in wins)
    assert len(wins) == 4 * 5


@pytest.mark.parametrize("model", ["linear-all", "quadratic-masked"])
@pytest.mark.parametrize("dr,dc", [(0, 0), (1, 2), (-2, -1)])
def test_photometric_shift_recovers_known_integer_offsets(model, dr, dc):
    z = smooth_field(140, 140, seed=1)
    gx, gy = gradients(z)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    img = shifted(lambert(gx, gy), dr, dc)
    est = photometric_window_shift(img, gx, gy, slope, Window(30, 30, 80), m=5, model=model, max_slope_deg=90.0)
    assert not est.on_boundary
    assert est.shift_rows == pytest.approx(dr, abs=0.15)
    assert est.shift_cols == pytest.approx(dc, abs=0.15)
    assert est.best > est.ring_median


def test_xcorr_shift_recovers_known_offset_and_metres_convention():
    ref = smooth_field(140, 140, seed=2)
    est = xcorr_window_shift(ref, shifted(ref, -1, 3), Window(30, 30, 80), m=5)
    assert (round(est.shift_rows), round(est.shift_cols)) == (-1, 3)
    east, south = est.metres(1.897, 2.0)
    assert east == pytest.approx(3 * 1.897, abs=0.2) and south == pytest.approx(-2.0, abs=0.2)


def test_peak_on_search_boundary_is_flagged():
    ref = smooth_field(140, 140, seed=3)
    est = xcorr_window_shift(ref, shifted(ref, 0, 6), Window(30, 30, 80), m=4)
    assert est.on_boundary


def test_bootstrap_median_and_ci():
    med, lo, hi = bootstrap_median(np.array([1.0, 2.0, 2.0, 3.0, 2.5, 1.5, 2.2]))
    assert lo <= med <= hi and med == pytest.approx(2.0)


def test_spearman_detects_monotonic_relation_and_not_noise():
    x = np.arange(30, dtype=float)
    rho, p = spearman_permutation(x, x ** 2, n=2000)
    assert rho == pytest.approx(1.0) and p < 0.01
    rng = np.random.default_rng(0)
    rho0, p0 = spearman_permutation(rng.normal(size=30), rng.normal(size=30), n=2000)
    assert abs(rho0) < 0.5 and p0 > 0.01


def test_anti_sun_unit_vectors():
    e, s = anti_sun_unit(270.0)  # sun in the west -> away is east
    assert e == pytest.approx(1.0) and s == pytest.approx(0.0, abs=1e-12)
    e, s = anti_sun_unit(180.0)  # sun in the south -> away is north (negative south)
    assert e == pytest.approx(0.0, abs=1e-12) and s == pytest.approx(-1.0)
