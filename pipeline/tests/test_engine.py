"""Vectorised engine (score/engine.py) vs the scalar reference and the contract (review-01).

engine.py produces every shipped score but had 0% coverage before this file.
"""
import math

import numpy as np
import pytest

from analog_portfolio.contract import load
from analog_portfolio.grid.area import weighted_quantile
from analog_portfolio.score import engine
from analog_portfolio.score.engine import (CORE, SECONDARY, _pct_rank, aggregate, clip_targets, factor_scores,
                                           hard_filter_mask)
from analog_portfolio.score.normalize import (bounded_fraction, flag_match, gaussian, geometric_mean, ordinal_class,
                                              ratio_sim, total_score)

PROFILES = {p["id"]: p for p in load("profiles")["profiles"]}
TARGET = dict(F1=215.0, F2=85.0, F3=3, F4=0.85, F5=600.0, F6=1, F7=0.0, F8=1.0, F9=0.0, F10=72.0, F13=1 | 4)


def earth_fixture(n=400, seed=7):
    r = np.random.default_rng(seed)
    e = {
        "cell_id": np.arange(n, dtype="int64"),
        "ts_mean_k": np.round(r.uniform(220, 305, n), 2), "dt_k": np.round(r.uniform(2, 40, n), 2),
        "ti_class": r.integers(1, 6, n).astype(float), "slope_lt5_frac": np.round(r.uniform(0, 1, n), 3),
        "relief_m": np.round(r.uniform(0, 3000, n)), "lith_class": r.integers(0, 18, n).astype(float),
        "aridity_index": np.round(r.uniform(0, 3, n), 1),  # coarse on purpose: many ties
        "barren_frac": np.round(r.uniform(0, 1, n), 3), "ice_index": np.round(r.uniform(0, 1, n), 3),
        "noon_sun_elev_deg": np.round(r.uniform(-5, 90, n) * 2) / 2,
        "column_mass_gcm2": np.round(r.uniform(320, 1040, n)), "cutoff_rigidity_gv": np.round(r.uniform(0, 15, n)),
        "uv_index": np.round(r.uniform(0, 15, n)), "geomorph_flags": r.choice([0, 1, 4, 5, 64, 127], n).astype(float),
        "water_frac": np.round(r.uniform(0, 0.6, n), 3), "builtup_frac": np.round(r.uniform(0, 0.6, n), 3),
    }
    # a few missing cells
    for k in ("ts_mean_k", "aridity_index", "lith_class", "geomorph_flags"):
        e[k][[3, 50]] = np.nan
    return e


@pytest.fixture(scope="module")
def earth():
    return earth_fixture()


@pytest.fixture(scope="module")
def scores(earth):
    return factor_scores(earth, TARGET, "mars")


MISSING_CELLS = {3, 50}


def test_scores_bounded_finite_except_missing(scores):
    """Scores are in [0, 1]; NaN (missing, review-01 decision #2) only where an Earth input is missing."""
    assert set(scores) == set(CORE + SECONDARY)
    for f, s in scores.items():
        nan = set(np.flatnonzero(np.isnan(s)).tolist())
        assert nan <= MISSING_CELLS, f
        fin = s[np.isfinite(s)]
        assert (fin >= 0).all() and (fin <= 1).all(), f
    for f in ("F1", "F6", "F7", "F13"):  # fed by the NaN columns of the fixture
        assert np.isnan(scores[f][list(MISSING_CELLS)]).all(), f


def test_engine_matches_scalar_reference(earth, scores):
    """Every per-cell factor score equals the scalar function from normalize.py (the JS port mirrors those)."""
    clips = clip_targets(TARGET, earth)
    ts = {f: clips[f][0] if f in clips else TARGET[f] for f in TARGET}
    tau = next(f for f in load("factors")["factors"] if f["id"] == "F10")["params"]["tau"]
    lm = engine.lith_matrix()
    for i in range(len(earth["cell_id"])):
        x = {k: earth[k][i] for k in earth}
        exp = {}
        exp["F1"] = ratio_sim(x["ts_mean_k"], ts["F1"]) if not math.isnan(x["ts_mean_k"]) else math.nan
        exp["F2"] = ratio_sim(x["dt_k"], ts["F2"])
        exp["F3"] = max(0.0, ordinal_class(x["ti_class"], TARGET["F3"]))
        exp["F4"] = bounded_fraction(x["slope_lt5_frac"], TARGET["F4"])
        exp["F5"] = ratio_sim(x["relief_m"], ts["F5"])
        exp["F6"] = math.nan if math.isnan(x["lith_class"]) else lm[int(x["lith_class"]), TARGET["F6"]]
        exp["F8"] = bounded_fraction(x["barren_frac"], TARGET["F8"])
        exp["F9"] = bounded_fraction(x["ice_index"], TARGET["F9"])
        exp["F10"] = gaussian(x["noon_sun_elev_deg"], ts["F10"], tau)
        g = x["geomorph_flags"]
        exp["F13"] = math.nan if math.isnan(g) else flag_match(int(g), TARGET["F13"])
        for f, v in exp.items():
            assert scores[f][i] == pytest.approx(v, abs=1e-12, nan_ok=True), (f, i)


def test_aggregate_matches_scalar_geometric_mean(scores):
    """Vectorised and scalar aggregation agree, including the missing-data cells 3 and 50."""
    for pid, prof in PROFILES.items():
        core, total = aggregate(scores, prof["weights"])
        for i in sorted(set(range(0, len(core), 37)) | MISSING_CELLS):
            sc = {f: float(scores[f][i]) for f in CORE}
            c = geometric_mean(sc, prof["weights"], min_coverage=engine.MIN_WEIGHT_COVERAGE)
            assert core[i] == pytest.approx(c, rel=1e-12, nan_ok=True), (pid, i)
            t = total_score(c, [float(scores[f][i]) for f in SECONDARY])
            assert total[i] == pytest.approx(t, rel=1e-12, nan_ok=True), (pid, i)


def test_lith_matrix_symmetric_and_nodata_zero():
    m = engine.lith_matrix()
    assert np.allclose(m, m.T)
    assert m[0].sum() == 0 and m[:, 0].sum() == 0
    assert all(m[i, i] == 1 for i in range(1, len(m)))


def test_earth_clip(earth):
    """Contract v1.1: t* bounds are cos(lat) area-weighted P0.5 / P99.5 (grid.area.weighted_quantile)."""
    aw = engine.area_weights(earth)
    lo, hi = weighted_quantile(earth["ts_mean_k"], aw, [0.005, 0.995])
    clips = clip_targets(dict(TARGET, F1=110.0, F2=20.0), earth)
    assert clips["F1"] == pytest.approx((lo, lo - 110.0))  # below Earth P0.5: t* = P0.5, gap = |t - t*|
    assert clips["F2"] == (20.0, 0.0)  # inside the Earth range: unchanged, no gap
    assert set(clips) == {"F1", "F2", "F5", "F10"}  # earth_clip factors only
    hi_clip = clip_targets(dict(TARGET, F5=1e6), earth)["F5"]
    assert hi_clip[0] == pytest.approx(weighted_quantile(earth["relief_m"], aw, [0.995])[0]) and hi_clip[1] > 0
    assert lo < hi


class TestPercentile:
    def test_ties_share_midrank(self):
        """P = (weight below + half the weight of the tie group) / total weight (contract v1.1.1 mid-ranks)."""
        p = _pct_rank(np.array([3.0, 1.0, 3.0, 2.0, 3.0]), higher_is_better=True)
        assert p.tolist() == pytest.approx([0.7, 0.1, 0.7, 0.3, 0.7])
        w = np.array([1.0, 2.0, 1.0, 1.0, 1.0])  # area weights move the percentiles
        assert _pct_rank(np.array([3.0, 1.0, 3.0, 2.0, 3.0]), True, w).tolist() == pytest.approx(
            [(3 + 1.5) / 6, 1 / 6, 4.5 / 6, 2.5 / 6, 4.5 / 6])

    def test_independent_of_cell_order(self):
        r = np.random.default_rng(1)
        x = np.round(r.uniform(0, 5, 2000))  # 6 distinct values -> huge tie groups
        perm = r.permutation(len(x))
        for hib in (True, False):
            assert np.array_equal(_pct_rank(x, hib)[perm], _pct_rank(x[perm], hib))

    def test_direction_nan_and_degenerate(self):
        """Non-finite inputs are missing: NaN out, and they do not count in n (decision #2)."""
        x = np.array([0.1, np.nan, 0.3, np.inf, 0.2])
        nan = math.nan
        assert _pct_rank(x, False).tolist() == pytest.approx([5 / 6, nan, 1 / 6, nan, 0.5], nan_ok=True)  # lower is better
        assert _pct_rank(x, True).tolist() == pytest.approx([1 / 6, nan, 5 / 6, nan, 0.5], nan_ok=True)
        assert _pct_rank(np.full(4, 2.0), True).tolist() == [0.5] * 4  # all tied
        assert np.isnan(_pct_rank(np.array([np.nan, np.nan]), True)).all()  # all missing: no crash
        assert _pct_rank(np.array([5.0]), False).tolist() == [0.5]


class TestAggregateEdges:
    def test_zero_weight_zero_score_is_ignored(self):
        s = {f: np.array([0.5]) for f in CORE + SECONDARY}
        s["F9"] = np.array([0.0])  # 0^0 must not matter
        core, _ = aggregate(s, {f: (0 if f == "F9" else 10) for f in CORE})
        assert core[0] == pytest.approx(0.5)

    def test_zero_score_floored(self):
        s = {f: np.array([1.0]) for f in CORE + SECONDARY}
        s["F1"] = np.array([0.0])
        core, total = aggregate(s, {"F1": 1, "F2": 1})
        assert core[0] == pytest.approx(math.sqrt(0.01))
        assert total[0] == pytest.approx(core[0] * 1.0)

    def test_all_zero_weights_returns_zero(self):
        s = {f: np.array([0.3, 0.9]) for f in CORE + SECONDARY}
        core, total = aggregate(s, {f: 0 for f in CORE})
        assert core.tolist() == [0.0, 0.0] and total.tolist() == [0.0, 0.0]

    def test_missing_earth_value_is_missing_not_zero(self, earth):
        """Fixed (review-01 H2): a NaN Earth input gives a missing score, not s = 0 -> floor 0.01."""
        s = factor_scores(earth, TARGET, "mars")
        assert np.isnan(s["F1"][3]) and np.isnan(s["F7"][3]) and np.isnan(s["F6"][3])


class TestHardFilters:
    def test_global_filters(self, earth):
        m = hard_filter_mask(earth, PROFILES["P1_landing_mobility"])
        assert np.array_equal(m, (earth["water_frac"] < 0.5) & (earth["builtup_frac"] < 0.5))

    def test_frozen_ground(self, earth):
        m = hard_filter_mask(earth, PROFILES["P2_isru_ice"])
        base = (earth["water_frac"] < 0.5) & (earth["builtup_frac"] < 0.5)
        with np.errstate(invalid="ignore"):
            rule = (earth["ice_index"] > 0) | (earth["ts_mean_k"] < 273.15)
        assert np.array_equal(m, base & rule)

    def test_dry_or_cold_desert_nan_excluded(self):
        e = {k: np.array(v, dtype=float) for k, v in dict(
            water_frac=[0, 0, 0, 0, 0], builtup_frac=[0, 0, 0, 0, 0], ice_index=[0] * 5,
            aridity_index=[0.1, 0.3, 0.3, np.nan, 0.6], ts_mean_k=[300, 300, 260, 260, 260]).items()}
        assert hard_filter_mask(e, PROFILES["P5_astrobiology"]).tolist() == [True, False, True, False, False]


def test_f13_popcount_lut_matches_scalar():
    e = {"geomorph_flags": np.arange(256, dtype=float)}
    for tf in (0, 1, 17, 33, 49, 64, 127, 255):
        ef = e["geomorph_flags"].astype(int)
        want = bin(tf).count("1")
        got = engine._POPCOUNT8[ef & tf] / want if want else np.zeros(256)
        assert got.tolist() == [flag_match(int(v), tf) for v in ef]
