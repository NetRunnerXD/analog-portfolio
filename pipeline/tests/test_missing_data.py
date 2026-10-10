"""Missing-data rule (review-01 decision #2, DATA_CONTRACT.md section 3.2) and stable ordering (decision #5)."""
import json
import math
import warnings
from pathlib import Path

import numpy as np
import pytest

from analog_portfolio.contract import load
from analog_portfolio.score.engine import (CORE, MIN_WEIGHT_COVERAGE, SECONDARY, TARGET_DEPENDENT, FactorCache,
                                           _pct_rank, area_weights, candidate_indices, clip_targets, factor_scores,
                                           score_cells, score_profile, target_dropped_factors)
from analog_portfolio.score.robust import top_frac_freq
from analog_portfolio.score.normalize import geometric_mean

from test_engine import TARGET, earth_fixture  # tests/ is on sys.path (rootdir-relative, no __init__)

PROFILES = {p["id"]: p for p in load("profiles")["profiles"]}
MOCK = Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "mock"


def scores(**cols):
    """Synthetic factor-score dict: every core/secondary factor 0.5 unless given."""
    n = len(next(iter(cols.values()))) if cols else 1
    s = {f: np.full(n, 0.5) for f in CORE + SECONDARY}
    s.update({k: np.asarray(v, dtype=float) for k, v in cols.items()})
    return s


@pytest.fixture(autouse=True)
def no_numpy_warnings():
    """Missing data must be handled, not survive as RuntimeWarnings (log(0), 0/0, nan comparisons)."""
    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        yield


class TestCoverageBoundary:
    def test_exactly_70_percent_is_scored(self):
        w = {"F1": 7, "F2": 3}
        r = score_cells(scores(F1=[0.8], F2=[np.nan]), w)
        assert r["coverage"][0] == pytest.approx(0.7)
        assert r["sufficient"][0]
        assert r["core"][0] == pytest.approx(0.8)  # renormalised over F1 alone

    def test_just_above_70_percent(self):
        w = {"F1": 70.01, "F2": 29.99}
        r = score_cells(scores(F1=[0.8], F2=[np.nan]), w)
        assert r["coverage"][0] > MIN_WEIGHT_COVERAGE and r["sufficient"][0]
        assert math.isfinite(r["total"][0])

    def test_just_below_70_percent(self):
        w = {"F1": 69.99, "F2": 30.01}
        r = score_cells(scores(F1=[0.8], F2=[np.nan]), w)
        assert r["coverage"][0] < MIN_WEIGHT_COVERAGE and not r["sufficient"][0]
        assert np.isnan(r["core"][0]) and np.isnan(r["total"][0])

    def test_ten_equal_weights(self):
        """3 of 10 equal weights missing = 70% present -> scored; 4 missing = 60% -> insufficient."""
        w = {f: 10 for f in CORE}
        three = scores(F1=[np.nan], F2=[np.nan], F3=[np.nan])
        four = scores(F1=[np.nan], F2=[np.nan], F3=[np.nan], F4=[np.nan])
        assert score_cells(three, w)["sufficient"][0]
        assert not score_cells(four, w)["sufficient"][0]

    def test_renormalised_value_and_scalar_twin(self):
        w = {"F1": 2, "F2": 1, "F3": 1, "F4": 0}
        s = scores(F1=[0.9], F2=[0.4], F3=[np.nan], F4=[np.nan])  # F4 has weight 0: irrelevant
        r = score_cells(s, w)
        want = math.exp((2 * math.log(0.9) + 1 * math.log(0.4)) / 3)
        assert r["coverage"][0] == pytest.approx(0.75)
        assert r["core"][0] == pytest.approx(want)
        sc = {f: float(v[0]) for f, v in s.items()}
        assert geometric_mean(sc, w, min_coverage=MIN_WEIGHT_COVERAGE) == pytest.approx(want)
        assert math.isnan(geometric_mean({"F1": 0.9, "F2": None}, {"F1": 1, "F2": 1}, min_coverage=0.7))

    def test_zero_weight_missing_factor_does_not_lower_coverage(self):
        r = score_cells(scores(F5=[np.nan]), {"F1": 1, "F5": 0})
        assert r["coverage"][0] == 1.0 and r["sufficient"][0]

    def test_secondary_nudge_uses_present_secondaries(self):
        s = scores(F1=[1.0], F11=[np.nan], F12=[0.4], F13=[np.nan])
        r = score_cells(s, {"F1": 1})
        assert r["total"][0] == pytest.approx(0.9 + 0.1 * 0.4)
        s2 = scores(F1=[1.0], F11=[np.nan], F12=[np.nan], F13=[np.nan])
        assert score_cells(s2, {"F1": 1})["total"][0] == pytest.approx(0.9)  # no secondary data: S_sec = 0


class TestAllNaN:
    def test_all_factors_nan_cell(self):
        s = {f: np.array([np.nan, 0.6]) for f in CORE + SECONDARY}  # cell 0: every factor missing
        r = score_cells(s, PROFILES["P1_landing_mobility"]["weights"])
        assert r["coverage"].tolist() == [0.0, 1.0]
        assert r["sufficient"].tolist() == [False, True]
        assert np.isnan(r["total"][0]) and r["total"][1] == pytest.approx(0.6 * (0.9 + 0.1 * 0.6))

    def test_all_nan_earth_runs_end_to_end(self):
        e = earth_fixture(n=60)
        for k in list(e):
            if k != "cell_id":
                e[k] = np.full(60, np.nan)
        prof = PROFILES["P3_habitat_eva_power"]
        s = factor_scores(e, TARGET, "mars")
        assert all(np.isnan(v).all() for v in s.values())
        r = score_profile(e, s, prof)
        assert not r["sufficient"].any() and np.isnan(r["S"]).all()
        aw = area_weights(e)
        assert candidate_indices(s, r["S"], r["mask"], prof["weights"], aw, 50) == []
        assert np.isnan(_pct_rank(r["S"], True, aw)).all()
        freq = top_frac_freq(s, prof["weights"], r["mask"], aw, draws=10, valid=r["sufficient"])
        assert (freq == 0).all()  # insufficient cells are never hits
        assert clip_targets(TARGET, e)["F1"] == (TARGET["F1"], 0.0)  # all-missing column: t unclipped, no crash

    def test_missing_columns_and_null_targets_do_not_crash(self):
        e = {"cell_id": np.arange(5)}  # no feature columns at all
        s = factor_scores(e, {f: None for f in TARGET}, "moon")
        assert set(s) == {"F7", "F11", "F12"}  # target-independent factors survive, as all-NaN
        r = score_profile(e, s, PROFILES["P1_landing_mobility"])
        assert np.isnan(r["S"]).all()

    def test_empty_grid(self):
        e = {k: v[:0] for k, v in earth_fixture(n=60).items()}
        s = factor_scores(e, TARGET, "mars")
        r = score_profile(e, s, PROFILES["P1_landing_mobility"])
        assert r["S"].size == 0


class TestTargetNull:
    def test_null_target_drops_factor_and_renormalises(self):
        e = earth_fixture(n=200)
        t = dict(TARGET, F3=None, F9=float("nan"))
        assert target_dropped_factors(t) == ["F3", "F9"]
        s_full = factor_scores(e, TARGET, "mars")
        s = factor_scores(e, t, "mars")
        assert "F3" not in s and "F9" not in s and set(s) == set(s_full) - {"F3", "F9"}
        w = PROFILES["P2_isru_ice"]["weights"]
        assert w["F3"] > 0 and w["F9"] > 0
        r = score_cells(s, w)
        # coverage is relative to the scorable weight: a dropped target factor does not count as missing
        act = [f for f in CORE if w[f] > 0 and f in s]
        complete = np.all([np.isfinite(s[f]) for f in act], axis=0)
        assert complete.any() and (r["coverage"][complete] == 1.0).all()
        ok = np.flatnonzero(np.isfinite(s_full["F1"]) & np.isfinite(s_full["F6"]))[:5]
        for i in ok:
            sc = {f: float(s[f][i]) for f in CORE if f in s}
            want = geometric_mean(sc, {f: v for f, v in w.items() if f in s})
            assert r["core"][i] == pytest.approx(want)

    def test_earth_only_factors_never_dropped(self):
        t = {f: None for f in CORE + SECONDARY}
        assert set(target_dropped_factors(t)) == set(TARGET_DEPENDENT)
        assert not {"F7", "F11", "F12"} & set(TARGET_DEPENDENT)

    def test_invalid_lithology_code_drops_f6(self):
        s = factor_scores(earth_fixture(n=60), dict(TARGET, F6=99), "mars")
        assert "F6" not in s

    def test_mock_targets_json_reports_dropped_factors(self):
        doc = json.loads((MOCK / "targets.json").read_text())
        for t in doc["targets"]:
            vals = {f: v["value"] for f, v in t["features"].items()}
            assert t["dropped_factors"] == target_dropped_factors(vals), t["id"]
        schema = json.loads((MOCK.parents[3] / "contract" / "schemas" / "targets.schema.json").read_text())
        assert "dropped_factors" in json.dumps(schema)


class TestStableOrder:
    """Contract 3.2 item 7: s_f desc, then S desc, then cell index asc; pool S desc, then index asc."""

    def test_tie_break_order(self):
        n = 6
        s = scores(F1=[0.9, 0.9, 0.9, 0.5, 0.9, 0.9])
        S = np.array([0.6, 0.8, 0.6, 0.9, 0.8, np.nan])  # cell 5 insufficient
        got = candidate_indices(s, S, np.ones(n, bool), {"F1": 1}, np.ones(n), 3)
        # eligible: S >= weighted median (0.7) -> cells 1, 3, 4; F1 top-3 among them by (s_f, S, index): 1, 4, 3
        assert sorted(got) == [1, 3, 4]
        assert got == [3, 1, 4]  # pool order: S desc (0.9, 0.8, 0.8), then index asc

    def test_candidate_pool_deterministic_with_ties(self):
        """Heavy ties on discrete factors (F3, F6, F13): the pool is fully determined and repeatable."""
        e = earth_fixture(n=400)
        prof = PROFILES["P4_geology_regolith"]
        s = factor_scores(e, TARGET, "mars")
        r = score_profile(e, s, prof)
        aw = area_weights(e)
        a = candidate_indices(s, r["S"], r["mask"], prof["weights"], aw, 7)
        assert len(a) > 7 and a == candidate_indices(s, r["S"], r["mask"], prof["weights"], aw, 7)
        f3 = s["F3"]
        assert len(np.unique(f3[np.isfinite(f3)])) <= 5  # F3 really is discrete here

    def test_top_n_cut_inside_a_tie_takes_lowest_cell_ids(self):
        n = 10
        s = scores(F1=np.full(n, 0.7))  # every cell ties on every factor
        S = np.full(n, 0.5)
        got = candidate_indices(s, S, np.ones(n, bool), {"F1": 1}, np.ones(n), 3)
        assert got == [0, 1, 2]  # complete tie: lowest cell indices win

    def test_insufficient_cells_never_enter_the_pool(self):
        n = 20
        s = scores(F1=np.linspace(0.1, 1, n), F2=np.where(np.arange(n) >= 15, np.nan, 0.9))
        w = {"F1": 1, "F2": 1}  # F2 missing -> 50% coverage -> insufficient for the 5 best F1 cells
        r = score_cells(s, w)
        S = np.where(r["sufficient"], r["total"], np.nan)
        got = candidate_indices(s, S, np.ones(n, bool), w, np.ones(n), 5)
        assert got and max(got) < 15


def test_factor_cache_reuses_scores():
    e = earth_fixture(n=60)
    c = FactorCache(e)
    a = c.get("mars_x", TARGET, "mars")
    assert c.get("mars_x", TARGET, "mars") is a
    for f, v in factor_scores(e, TARGET, "mars").items():
        np.testing.assert_array_equal(a[f], v)
