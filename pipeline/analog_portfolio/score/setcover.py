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
    # Ordered lists (not sets) so float sums and tie-breaks don't depend on PYTHONHASHSEED; ties go to
    # the earliest site in input order, as in the JS port. Sites are tracked by index (identity), not
    # dict equality, so two candidates with identical scores stay distinct (JS uses identity too).
    order = [f for f, w in weights.items() if w > 0]
    active = set(order)
    coverable = {f for f in order if any(s["factor_scores"].get(f, 0) >= theta for s in sites)}
    universe = [f for f in order if f in coverable]
    chosen_idx: list[int] = []
    while universe and len(chosen_idx) < max_sites:
        best, best_val = None, 0.0
        for i, s in enumerate(sites):
            if i in chosen_idx:
                continue
            gain = 0.0
            for f in universe:
                v = s["factor_scores"].get(f, 0)
                if v >= theta:
                    gain += weights[f] * v
            val = gain / (1.0 + lam * s.get("cost", 0.0))
            if val > best_val:
                best, best_val = i, val
        if best is None:
            break
        chosen_idx.append(best)
        universe = [f for f in universe if not sites[best]["factor_scores"].get(f, 0) >= theta]
    covered = coverable - set(universe)
    return [sites[i] for i in chosen_idx], covered, active - coverable
