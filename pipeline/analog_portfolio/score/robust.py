"""Monte Carlo weight robustness (contract v1.1): a cell is robust when it is in the top 5% of Earth land
(cos(lat) area-weighted threshold, recomputed per draw) in >= 80% of 1000 Dirichlet weight draws."""
from __future__ import annotations

import numpy as np

from ..grid.area import weighted_quantile
from .normalize import FLOOR

SECONDARY = ["F11", "F12", "F13"]


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
) -> np.ndarray:
    """Fraction of draws in which each cell's S is >= the area-weighted (1 - top_frac) land quantile.

    s: per-factor similarity arrays (factors missing from s are dropped, like engine.aggregate).
    mask: hard-filter pass mask; filtered cells get S = 0 but stay in the land denominator.
    Dirichlet alpha = alpha_scale * w / sum(w) over the active (w > 0, scorable) core factors.
    """
    active = [f for f, w in weights.items() if w > 0 and f in s]
    w = np.array([weights[f] for f in active], float)
    alpha = alpha_scale * w / w.sum()
    rng = np.random.default_rng(seed)
    W = rng.dirichlet(alpha, size=draws)                       # (draws, k)
    L = np.stack([np.log(np.maximum(s[f], FLOOR)) for f in active], axis=1)  # (n, k)
    sec = 0.9 + 0.1 * np.mean([s[f] for f in SECONDARY if f in s], axis=0) if any(f in s for f in SECONDARY) else 1.0
    hits = np.zeros(L.shape[0])
    for i in range(0, draws, chunk):
        S = np.exp(L @ W[i:i + chunk].T) * (sec[:, None] if np.ndim(sec) else sec)  # (n, c)
        S[~mask] = 0.0
        for j in range(S.shape[1]):
            thr = weighted_quantile(S[:, j], area_w, 1.0 - top_frac)[0]
            hits += S[:, j] >= thr
    return hits / draws
