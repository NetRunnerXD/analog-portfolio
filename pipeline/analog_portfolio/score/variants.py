"""Portfolio variants (contract v1.1): best_match, easiest_to_reach (hard filter travel_time_min <= 360
on the candidate pool before set cover, no cost weighting) and one_continent."""
from __future__ import annotations

from collections.abc import Mapping, Sequence

from .setcover import greedy_portfolio

EASY_MAX_MIN = 360.0


def _run(pool, weights, theta, max_sites):
    chosen, covered, _unc = greedy_portfolio(pool, weights, theta, 0.0, max_sites)
    return chosen, covered


def _value(covered, chosen, weights):
    return (sum(weights[f] for f in covered), sum(s["score"] for s in chosen))


def build_variants(pool: Sequence[Mapping], weights: Mapping[str, float], theta: float, max_sites: int = 5) -> list[dict]:
    """pool items need site_id, score, factor_scores, logistics.travel_time_min, logistics.continent."""
    active = [f for f, w in weights.items() if w > 0]
    n_active = max(len(active), 1)
    order = lambda fs: sorted(fs, key=lambda x: int(x[1:]))  # noqa: E731
    out = []
    chosen, covered = _run(pool, weights, theta, max_sites)
    out.append(dict(id="best_match", available=bool(chosen), unavailable_reason=None if chosen else "No candidate sites",
                    continent=None, pool_size=len(pool), sites=list(chosen), covers=order(covered),
                    coverage=round(len(covered) / n_active, 4)))
    easy = [p for p in pool if (p.get("logistics") or {}).get("travel_time_min") is not None
            and p["logistics"]["travel_time_min"] <= EASY_MAX_MIN]
    chosen, covered = _run(easy, weights, theta, max_sites) if easy else ([], set())
    out.append(dict(id="easiest_to_reach", available=bool(chosen),
                    unavailable_reason=None if chosen else "No portfolio has every site within 6 h of a city of 50k+.",
                    continent=None, pool_size=len(easy), sites=list(chosen), covers=order(covered),
                    coverage=round(len(covered) / n_active, 4)))
    best = None
    for cont in sorted({(p.get("logistics") or {}).get("continent") for p in pool} - {None}):
        sub = [p for p in pool if p["logistics"].get("continent") == cont]
        ch, cov = _run(sub, weights, theta, max_sites)
        if ch and (best is None or _value(cov, ch, weights) > _value(best[2], best[1], weights)):
            best = (cont, ch, cov, len(sub))
    if best:
        out.append(dict(id="one_continent", available=True, unavailable_reason=None, continent=best[0], pool_size=best[3],
                        sites=list(best[1]), covers=order(best[2]), coverage=round(len(best[2]) / n_active, 4)))
    else:
        out.append(dict(id="one_continent", available=False, unavailable_reason="No candidate sites with a continent",
                        continent=None, pool_size=0, sites=[], covers=[], coverage=0.0))
    return out
