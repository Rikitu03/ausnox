"""Registration diagnostics for the unresolved X2b finding (DTM vs imagery).

Pure functions, unit-tested on synthetic grids (tests/test_registration.py). Used by
scripts/registration_windowed.py (test 2: spatial consistency) and
scripts/registration_illumination.py (test 1: dependence on sun direction).

Shift convention (identical to cross_validate.photometric_shift): a shift (dr, dc) in cells means the
image content that matches DTM cell (r, c) is found at image cell (r + dr, c + dc). Positive dc =
image displaced EAST of the DTM; positive dr = image displaced SOUTH (rows grow southward).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Window:
    row0: int
    col0: int
    size: int

    @property
    def rows(self) -> slice:
        return slice(self.row0, self.row0 + self.size)

    @property
    def cols(self) -> slice:
        return slice(self.col0, self.col0 + self.size)


def window_grid(height: int, width: int, size: int, margin: int) -> list[Window]:
    """Non-overlapping square windows inside [margin, dim - margin), so every shift up to `margin` stays in the image."""
    out = []
    for r in range(margin, height - margin - size + 1, size):
        for c in range(margin, width - margin - size + 1, size):
            out.append(Window(r, c, size))
    return out


def parabolic(vm: float, v0: float, vp: float) -> float:
    den = vm - 2 * v0 + vp
    return 0.0 if den == 0 else 0.5 * (vm - vp) / den


@dataclass(frozen=True)
class ShiftEstimate:
    shift_rows: float  # sub-cell, positive = image displaced south
    shift_cols: float  # sub-cell, positive = image displaced east
    best: float  # score at the integer peak (R^2 or correlation)
    zero: float  # score at zero shift
    ring_median: float  # median score on the outermost ring of the search (background level)
    on_boundary: bool  # integer peak on the search boundary (estimate not bracketed)
    n: int  # cells used at the peak

    def metres(self, dx_ground: float, dy: float) -> tuple[float, float]:
        """(east_m, south_m)."""
        return self.shift_cols * dx_ground, self.shift_rows * dy


def _peak(scores: dict[tuple[int, int], float], m: int, n_at: dict[tuple[int, int], int]) -> ShiftEstimate:
    (br, bc), best = max(scores.items(), key=lambda kv: (kv[1] if math.isfinite(kv[1]) else -np.inf))
    on_boundary = abs(br) == m or abs(bc) == m
    sr = br + (0.0 if on_boundary else parabolic(scores[(br - 1, bc)], best, scores[(br + 1, bc)]))
    sc = bc + (0.0 if on_boundary else parabolic(scores[(br, bc - 1)], best, scores[(br, bc + 1)]))
    ring = [v for (r, c), v in scores.items() if max(abs(r), abs(c)) == m and math.isfinite(v)]
    return ShiftEstimate(sr, sc, best, scores[(0, 0)], float(np.median(ring)) if ring else float("nan"), on_boundary, n_at[(br, bc)])


def photometric_window_shift(
    img: np.ndarray,
    gx: np.ndarray,
    gy: np.ndarray,
    slope: np.ndarray,
    win: Window,
    m: int,
    model: str = "quadratic-masked",
    clip: tuple[float, float] | None = None,
    max_slope_deg: float = 15.0,
) -> ShiftEstimate:
    """X2b regression restricted to one window: brightness ~ f(DTM gradients) for every integer shift up to m."""
    GX, GY, SL = gx[win.rows, win.cols], gy[win.rows, win.cols], slope[win.rows, win.cols]
    base = np.isfinite(GX) & np.isfinite(GY)
    if model == "quadratic-masked":
        base &= np.isfinite(SL) & (SL < max_slope_deg)
    scores: dict[tuple[int, int], float] = {}
    n_at: dict[tuple[int, int], int] = {}
    for dr in range(-m, m + 1):
        for dc in range(-m, m + 1):
            I = img[win.row0 + dr:win.row0 + dr + win.size, win.col0 + dc:win.col0 + dc + win.size]
            ok = base & np.isfinite(I)
            if model == "quadratic-masked" and clip is not None:
                ok &= (I > clip[0]) & (I < clip[1])
            k = int(ok.sum())
            n_at[(dr, dc)] = k
            if k < 50:
                scores[(dr, dc)] = float("nan")
                continue
            x, y = GX[ok], GY[ok]
            if model == "quadratic-masked":
                A = np.column_stack([np.ones(k), x, y, x * x, y * y, x * y])
            else:
                A = np.column_stack([np.ones(k), x, y])
            v = I[ok]
            coef, *_ = np.linalg.lstsq(A, v, rcond=None)
            r = v - A @ coef
            tss = float(((v - v.mean()) ** 2).sum())
            scores[(dr, dc)] = 1.0 - float(r @ r) / tss if tss > 0 else float("nan")
    return _peak(scores, m, n_at)


def xcorr_window_shift(reference: np.ndarray, moving: np.ndarray, win: Window, m: int) -> ShiftEstimate:
    """Normalised cross-correlation: where `moving` content sits relative to `reference` inside one window."""
    A = reference[win.rows, win.cols]
    scores: dict[tuple[int, int], float] = {}
    n_at: dict[tuple[int, int], int] = {}
    for dr in range(-m, m + 1):
        for dc in range(-m, m + 1):
            B = moving[win.row0 + dr:win.row0 + dr + win.size, win.col0 + dc:win.col0 + dc + win.size]
            ok = np.isfinite(A) & np.isfinite(B)
            k = int(ok.sum())
            n_at[(dr, dc)] = k
            if k < 50:
                scores[(dr, dc)] = float("nan")
                continue
            a, b = A[ok], B[ok]
            sa, sb = a.std(), b.std()
            scores[(dr, dc)] = float(((a - a.mean()) * (b - b.mean())).mean() / (sa * sb)) if sa > 0 and sb > 0 else float("nan")
    return _peak(scores, m, n_at)


def phase_correlation_shift(reference: np.ndarray, moving: np.ndarray, max_shift: int) -> tuple[int, int, float]:
    """Integer (rows, cols) displacement of `moving` content relative to `reference` by FFT phase correlation.

    Used only for a coarse pre-alignment of whole images (individual HiRISE RDRs can be misplaced by tens of
    metres); NaNs are replaced by the image mean. Returns (dr, dc, peak) with |dr|, |dc| <= max_shift.
    """
    a = np.where(np.isfinite(reference), reference, np.nanmean(reference))
    b = np.where(np.isfinite(moving), moving, np.nanmean(moving))
    a = (a - a.mean()) * np.outer(np.hanning(a.shape[0]), np.hanning(a.shape[1]))
    b = (b - b.mean()) * np.outer(np.hanning(b.shape[0]), np.hanning(b.shape[1]))
    F = np.fft.fft2(b) * np.conj(np.fft.fft2(a))
    r = np.real(np.fft.ifft2(F / np.maximum(np.abs(F), 1e-12)))
    h, w = r.shape
    best = (0, 0, -np.inf)
    for dr in range(-max_shift, max_shift + 1):
        for dc in range(-max_shift, max_shift + 1):
            v = r[dr % h, dc % w]
            if v > best[2]:
                best = (dr, dc, float(v))
    return best


def shift_image(img: np.ndarray, dr: int, dc: int) -> np.ndarray:
    """Move image content by (-dr, -dc) so that content found at (r + dr, c + dc) lands on (r, c); NaN fill."""
    out = np.full_like(img, np.nan, dtype=np.float64)
    h, w = img.shape
    src = img[max(dr, 0):h + min(dr, 0), max(dc, 0):w + min(dc, 0)]
    out[max(-dr, 0):h + min(-dr, 0), max(-dc, 0):w + min(-dc, 0)] = src
    return out


def bootstrap_median(values: np.ndarray, n: int = 2000, seed: int = 20261115) -> tuple[float, float, float]:
    """Median and percentile 95% CI of the median (fixed seed: reproducible)."""
    v = np.asarray(values, dtype=np.float64)
    v = v[np.isfinite(v)]
    if v.size == 0:
        return float("nan"), float("nan"), float("nan")
    rng = np.random.default_rng(seed)
    meds = np.median(v[rng.integers(0, v.size, size=(n, v.size))], axis=1)
    return float(np.median(v)), float(np.percentile(meds, 2.5)), float(np.percentile(meds, 97.5))


def spearman_permutation(x: np.ndarray, y: np.ndarray, n: int = 5000, seed: int = 20261115) -> tuple[float, float]:
    """Spearman rank correlation and a two-sided permutation p-value."""
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    ok = np.isfinite(x) & np.isfinite(y)
    x, y = x[ok], y[ok]
    if x.size < 4:
        return float("nan"), float("nan")
    rx = np.argsort(np.argsort(x)).astype(np.float64)
    ry = np.argsort(np.argsort(y)).astype(np.float64)
    rx -= rx.mean()
    ry -= ry.mean()
    den = math.sqrt(float(rx @ rx) * float(ry @ ry))
    if den == 0:
        return float("nan"), float("nan")
    rho = float(rx @ ry) / den
    rng = np.random.default_rng(seed)
    perm = np.array([float(rx @ rng.permutation(ry)) / den for _ in range(n)])
    p = float((np.sum(np.abs(perm) >= abs(rho)) + 1) / (n + 1))
    return rho, p


def anti_sun_unit(azimuth_deg: float) -> tuple[float, float]:
    """(east, south) components of the unit vector pointing AWAY from the sun (azimuth clockwise from north)."""
    a = math.radians(azimuth_deg)
    east_toward, north_toward = math.sin(a), math.cos(a)
    return -east_toward, north_toward  # away: (-east, -north) -> south component = +north_toward
