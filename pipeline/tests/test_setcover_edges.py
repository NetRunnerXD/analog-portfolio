"""Greedy set cover edge cases (review-01)."""
import os
import subprocess
import sys

from analog_portfolio.score.setcover import greedy_portfolio


def site(i, cost=0.0, **fs):
    return {"site_id": i, "cost": cost, "factor_scores": fs}


def test_tie_goes_to_first_site():
    a, b = site("a", F1=0.8, F2=0.8), site("b", F1=0.8, F2=0.8)
    assert [s["site_id"] for s in greedy_portfolio([a, b], {"F1": 1, "F2": 1})[0]] == ["a"]
    assert [s["site_id"] for s in greedy_portfolio([b, a], {"F1": 1, "F2": 1})[0]] == ["b"]


def test_identical_content_sites_are_distinct():
    """Equal-content candidates: tracked by index now (was O(n) deep dict equality via `s in chosen`)."""
    a = site("x", F1=0.9, F2=0.1)
    b = dict(a)  # same content, separate candidate
    c = site("y", F1=0.1, F2=0.9)
    chosen, covered, unc = greedy_portfolio([a, b, c], {"F1": 1, "F2": 1})
    assert [s["site_id"] for s in chosen] == ["x", "y"] and covered == {"F1", "F2"} and unc == set()


def test_uncoverable_zero_weight_and_cap():
    sites = [site(str(i), **{f"F{i}": 0.9}) for i in range(1, 8)]
    w = {f"F{i}": 10 for i in range(1, 8)} | {"F8": 10, "F9": 0}
    chosen, covered, unc = greedy_portfolio(sites, w, max_sites=5)
    assert len(chosen) == 5 and len(covered) == 5
    assert unc == {"F8"}  # F9 has weight 0: neither covered nor reported as uncoverable


def test_nan_score_never_covers():
    chosen, covered, unc = greedy_portfolio([site("a", F1=float("nan"))], {"F1": 1})
    assert chosen == [] and unc == {"F1"}


def test_theta_inclusive_and_lambda():
    a, b = site("a", cost=1.0, F1=0.7, F2=0.7), site("b", cost=0.0, F1=0.7)
    assert greedy_portfolio([a, b], {"F1": 1, "F2": 1}, lam=0)[0][0]["site_id"] == "a"
    assert greedy_portfolio([a, b], {"F1": 1, "F2": 1}, lam=5)[0][0]["site_id"] == "b"


def test_deterministic_across_hash_seeds():
    code = ("from analog_portfolio.score.setcover import greedy_portfolio as g;"
            "s=[{'site_id':str(i),'factor_scores':{f'F{j}':0.7+0.01*((i*j)%7) for j in range(1,11)}} for i in range(30)];"
            "print([x['site_id'] for x in g(s,{f'F{j}':0.1*j for j in range(1,11)},max_sites=5)[0]])")
    outs = {subprocess.run([sys.executable, "-c", code], env=dict(os.environ, PYTHONHASHSEED=str(h)),
                           capture_output=True, text=True, check=True).stdout for h in (0, 1, 2, 3)}
    assert len(outs) == 1
