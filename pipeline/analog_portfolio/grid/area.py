"""Area weighting on the 0.5 deg grid. A cell is ~55.6 km N-S but only ~55.6*cos(lat) km E-W,
so every land fraction, percentile, top-x% threshold and validation percentile is cos(lat)-weighted."""
from __future__ import annotations

import numpy as np

from . import NCOLS, NROWS, lat_centres

R_EARTH_KM = 6371.0088


def cell_weights() -> np.ndarray:
    """(NROWS, NCOLS) relative area weights = cos(lat of cell centre) (exact ratio for equal-angle cells)."""
    return np.repeat(np.cos(np.radians(lat_centres()))[:, None], NCOLS, axis=1)


def cell_area_km2(r_km: float = R_EARTH_KM) -> np.ndarray:
    """Exact spherical area of each 0.5 deg cell (rows north-to-south), shape (NROWS,)."""
    lat_n = np.radians(90.0 - 0.5 * np.arange(NROWS))
    lat_s = lat_n - np.radians(0.5)
    return r_km**2 * np.radians(0.5) * (np.sin(lat_n) - np.sin(lat_s))


def weighted_quantile(x: np.ndarray, w: np.ndarray, q) -> np.ndarray:
    """Weighted quantiles (q in [0, 1]) of finite x; midpoint (Hazen-type) interpolation of the weighted CDF."""
    x = np.asarray(x, float).ravel()
    w = np.asarray(w, float).ravel()
    ok = np.isfinite(x) & (w > 0)
    x, w = x[ok], w[ok]
    o = np.argsort(x, kind="stable")
    x, w = x[o], w[o]
    cdf = (np.cumsum(w) - 0.5 * w) / w.sum()
    return np.interp(np.atleast_1d(q), cdf, x)


def weighted_pct_rank(x: np.ndarray, w: np.ndarray, higher_is_better: bool = True) -> np.ndarray:
    """Area-weighted percentile rank in [0, 1] of each element among finite elements (ties share the mean rank).
    1 = best in the given direction. NaN -> 0."""
    x = np.asarray(x, float)
    w = np.asarray(w, float)
    out = np.zeros_like(x, dtype=float)
    ok = np.isfinite(x) & (w > 0)
    xv, wv = x[ok], w[ok]
    o = np.argsort(xv, kind="stable")
    xs, ws = xv[o], wv[o]
    cum = np.cumsum(ws)
    below = cum - ws
    # tie handling: average of first-below and last-cum within equal-value runs
    uniq, start = np.unique(xs, return_index=True)
    end = np.append(start[1:], len(xs)) - 1
    mid = (below[start] + cum[end]) / 2.0 / cum[-1]
    p_sorted = np.repeat(mid, end - start + 1)
    p = np.empty_like(xv)
    p[o] = p_sorted
    out[ok] = p if higher_is_better else 1.0 - p
    return out


def great_circle_km(lat1, lon1, lat2, lon2, r_km: float = R_EARTH_KM):
    """Vectorised haversine distance."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp, dl = p2 - p1, np.radians(np.asarray(lon2) - np.asarray(lon1))
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * r_km * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
