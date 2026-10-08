"""Monte Carlo weight robustness (contract v1.1.1): a cell is robust when it is in the top 5% of scorable Earth land
(cos(lat) area-weighted threshold, recomputed per draw) in >= 80% of 1000 Dirichlet weight draws.

Implementation follows review-01 (pipeline/benchmarks/bench_scoring.py): log-space float32 matmul over chunks of draws,
(draw x cell) layout. Dirichlet alpha_i = alpha_scale * w_i / sum(w) over active core factors (w > 0 and scorable for
this target); zero-weight and dropped factors stay at 0. A NaN factor score means "missing in this cell": the draw's
weights are renormalised over the factors present (same rule as the deterministic score). Cells marked invalid
(insufficient_data) are excluded from the land threshold and are never hits."""
from __future__ import annotations

import numpy as np

from .normalize import FLOOR

CORE = [f"F{i}" for i in range(1, 11)]
SECONDARY = ["F11", "F12", "F13"]


def draw_weights(weights: dict[str, float], active: list[str], draws: int, alpha_scale: float, seed: int) -> np.ndarray:
    w = np.array([weights[f] for f in active], float)
    return np.random.default_rng(seed).dirichlet(alpha_scale * w / w.sum(), size=draws)


def _wq_rows(S: np.ndarray, aw: np.ndarray, q: float) -> np.ndarray:
    """Area-weighted quantile per row of S (c x n), same Hazen-type definition as grid.area.weighted_quantile."""
    o = np.argsort(S, axis=1, kind="stable")
    Ss = np.take_along_axis(S, o, axis=1).astype("float64")
    wo = aw[o]
    cdf = (np.cumsum(wo, axis=1) - 0.5 * wo) / wo.sum(axis=1, keepdims=True)
    n = S.shape[1]
    k = (cdf < q).sum(axis=1)
    hi = np.minimum(k, n - 1)
    lo = np.maximum(k - 1, 0)
    r = np.arange(S.shape[0])
    c0, c1 = cdf[r, lo], cdf[r, hi]
    t = np.where(c1 > c0, (q - c0) / np.where(c1 > c0, c1 - c0, 1), 0.0)
    return Ss[r, lo] + np.clip(t, 0, 1) * (Ss[r, hi] - Ss[r, lo])


def top_frac_freq(
    s: dict[str, np.ndarray],
    weights: dict[str, float],
    mask: np.ndarray,
    area_w: np.ndarray,
    draws: int = 1000,
    alpha_scale: float = 50.0,
    top_frac: float = 0.05,
    seed: int = 20261114,
    chunk: int = 50,
    valid: np.ndarray | None = None,
) -> np.ndarray:
    """Fraction of draws in which each cell's S is >= the area-weighted (1 - top_frac) quantile of scorable land.

    s: per-factor similarity arrays over land cells; factors absent from s are dropped (no target value).
    mask: hard-filter pass mask; filtered cells get S = 0 but stay in the land denominator.
    valid: scorable cells (default all); invalid cells are left out of the threshold and get frequency 0.
    """
    n = len(mask)
    valid = np.ones(n, bool) if valid is None else np.asarray(valid, bool)
    active = [f for f in CORE if weights.get(f, 0) > 0 and f in s]
    W = draw_weights(weights, active, draws, alpha_scale, seed).astype("float32")  # D x K
    raw = np.stack([np.asarray(s[f], "float64")[valid] for f in active])           # K x m
    P = np.isfinite(raw).astype("float32")
    L = (np.log(np.maximum(np.nan_to_num(raw, nan=1.0), FLOOR)) * P).astype("float32")
    sec_f = [f for f in SECONDARY if f in s]
    nudge = (0.9 + 0.1 * np.nanmean(np.stack([np.asarray(s[f])[valid] for f in sec_f]), axis=0)) if sec_f else np.ones(L.shape[1])
    nudge = np.nan_to_num(nudge, nan=0.9).astype("float32") * mask[valid].astype("float32")
    aw = np.asarray(area_w, "float64")[valid]
    all_present = bool(P.min() == 1.0)
    hits = np.zeros(L.shape[1], "int32")
    for d0 in range(0, draws, chunk):
        Wc = W[d0:d0 + chunk]
        S = Wc @ L                                    # c x m log-score (weights sum to 1)
        if not all_present:
            S /= np.maximum(Wc @ P, 1e-12)            # renormalise over factors present in each cell
        np.exp(S, out=S)
        S *= nudge
        thr = _wq_rows(S, aw, 1.0 - top_frac)
        hits += ((S >= thr[:, None]) & (S > 0)).sum(axis=0, dtype="int32")
    out = np.zeros(n)
    out[valid] = hits / draws
    return out
