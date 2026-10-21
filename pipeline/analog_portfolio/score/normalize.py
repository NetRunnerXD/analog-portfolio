"""Per-factor similarity transforms and aggregation (docs/DATA_CONTRACT.md section 3.1-3.2)."""
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


def range_sim(x: float, t_star: float, p01: float, p99: float) -> float:
    """Range-normalised similarity (contract v1.2, F1/F2): 1 - |x - t*| / (Earth P99 - Earth P1), floored at 0.
    t* is the target already clipped to Earth's P0.5-P99.5; P1/P99 are cos(lat) area-weighted over land."""
    span = p99 - p01
    if span <= 0:
        return 1.0 if x == t_star else 0.0
    return max(0.0, 1.0 - abs(x - t_star) / span)


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


def _present(v) -> bool:
    return v is not None and not (isinstance(v, float) and math.isnan(v))


def geometric_mean(scores: Mapping[str, float], weights: Mapping[str, float], floor: float = FLOOR,
                   min_coverage: float | None = None) -> float:
    """Weighted geometric mean over w > 0. Missing scores (absent key, None, NaN) are dropped and the remaining
    weights renormalised; with min_coverage set, returns NaN if the present weight share is below it.
    No positive weight at all -> 0."""
    act = {f: w for f, w in weights.items() if w > 0}
    wsum = sum(act.values())
    if wsum == 0:
        return 0.0
    present = {f: w for f, w in act.items() if _present(scores.get(f))}
    psum = sum(present.values())
    if psum == 0 or (min_coverage is not None and psum / wsum < min_coverage - 1e-12):
        return math.nan
    log = 0.0
    for f, w in present.items():
        log += (w / psum) * math.log(max(scores[f], floor))
    return math.exp(log)


def total_score(core: float, secondary: list[float]) -> float:
    """S = S_core * (0.9 + 0.1 * mean of the present secondary scores); none present -> S_sec = 0."""
    sec = [v for v in secondary if _present(v)]
    s_sec = sum(sec) / len(sec) if sec else 0.0
    return core * (0.9 + 0.1 * s_sec)
