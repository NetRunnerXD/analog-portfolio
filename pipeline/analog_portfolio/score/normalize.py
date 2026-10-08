"""Per-factor similarity transforms and aggregation (docs/DATA_CONTRACT.md section 4)."""
from __future__ import annotations

import math
from collections.abc import Mapping

FLOOR = 0.01


def ratio_sim(x: float, t: float) -> float:
    """ESI-style ratio similarity 1 - |x - t| / (x + t) for non-negative ratio-scale values."""
    if x < 0 or t < 0:
        raise ValueError("ratio_sim needs non-negative ratio-scale inputs")
    if x + t == 0:
        return 1.0
    return 1.0 - abs(x - t) / (x + t)


def bounded_fraction(x: float, t: float) -> float:
    return max(0.0, 1.0 - abs(x - t))


def gaussian(x: float, t: float, tau: float) -> float:
    return math.exp(-0.5 * ((x - t) / tau) ** 2)


def ordinal_class(x: int, t: int, n_classes: int = 5) -> float:
    return 1.0 - abs(x - t) / (n_classes - 1)


def capped_directional(percentile01: float, cap: float) -> float:
    """s = c * P_dir, P_dir in [0, 1] already oriented toward the target."""
    return cap * max(0.0, min(1.0, percentile01))


def flag_match(earth_flags: int, target_flags: int) -> float:
    """Fraction of the target's geomorphic flags present at the Earth cell."""
    want = bin(target_flags).count("1")
    if want == 0:
        return 0.0
    return bin(earth_flags & target_flags).count("1") / want


def clip_target(t: float, p005: float, p995: float) -> tuple[float, float]:
    """Earth-achievable clip: returns (t_star, gap)."""
    ts = min(max(t, p005), p995)
    return ts, abs(t - ts)


def geometric_mean(scores: Mapping[str, float], weights: Mapping[str, float], floor: float = FLOOR) -> float:
    wsum = sum(w for w in weights.values() if w > 0)
    if wsum == 0:
        return 0.0
    log = 0.0
    for f, w in weights.items():
        if w <= 0:
            continue
        log += (w / wsum) * math.log(max(scores[f], floor))
    return math.exp(log)


def total_score(core: float, secondary: list[float]) -> float:
    s_sec = sum(secondary) / len(secondary) if secondary else 0.0
    return core * (0.9 + 0.1 * s_sec)
