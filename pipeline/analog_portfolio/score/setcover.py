"""Greedy weighted set cover for the Analog Portfolio Optimizer (plan section 2.5)."""
from __future__ import annotations

from collections.abc import Mapping, Sequence


def greedy_portfolio(
    sites: Sequence[Mapping],
    weights: Mapping[str, float],
    theta: float = 0.7,
    lam: float = 0.0,
    max_sites: int = 5,
) -> tuple[list[Mapping], set[str], set[str]]:
    """Pick up to max_sites sites covering the most weighted factors per unit cost.

    Each site: {"site_id", "factor_scores": {F: s}, "cost": 0..1}. A site covers F if s >= theta.
    Returns (portfolio, covered, uncoverable).
    """
    active = {f for f, w in weights.items() if w > 0}
    coverable = {f for f in active if any(s["factor_scores"].get(f, 0) >= theta for s in sites)}
    universe = set(coverable)
    chosen: list[Mapping] = []
    while universe and len(chosen) < max_sites:
        best, best_val = None, 0.0
        for s in sites:
            if s in chosen:
                continue
            cov = {f for f in universe if s["factor_scores"].get(f, 0) >= theta}
            gain = sum(weights[f] * s["factor_scores"][f] for f in cov)
            val = gain / (1.0 + lam * s.get("cost", 0.0))
            if val > best_val:
                best, best_val = s, val
        if best is None:
            break
        chosen.append(best)
        universe -= {f for f in universe if best["factor_scores"].get(f, 0) >= theta}
    covered = coverable - universe
    return chosen, covered, active - coverable
