"""Monte Carlo robustness (review-01 decision #3; DATA_CONTRACT 4.1, contract v1.1.1)."""
import numpy as np
import pytest

from analog_portfolio.contract import load
from analog_portfolio.grid.area import weighted_quantile
from analog_portfolio.score.engine import CORE, SECONDARY, area_weights, score_cells
from analog_portfolio.score.normalize import FLOOR
from analog_portfolio.score.robust import _wq_rows, _wq_rows_full, draw_weights, robust_flags, top_frac_freq

MC = load("profiles")["defaults"]["monte_carlo"]
PROFILES = {p["id"]: p for p in load("profiles")["profiles"]}


def test_profiles_json_matches_decision():
    assert MC["draws"] == 1000 and MC["dirichlet_alpha_scale"] == 50
    assert MC["robust_top_frac"] == 0.05 and MC["robust_min_freq"] == 0.8 and MC["area_weighting"] == "cos_lat"


class TestDraws:
    W = {"F1": 30, "F2": 10, "F3": 0, "F4": 20, "F5": 0, "F6": 40}
    ACTIVE = ["F1", "F2", "F4", "F6"]

    def test_dirichlet_alpha_50w_normalised(self):
        """alpha = 50 * w / sum(w): mean = w / sum(w), var = m (1 - m) / 51 (alpha0 = 50, not 5000)."""
        d = draw_weights(self.W, self.ACTIVE, 40000, 50, 2)
        tot = sum(self.W.values())
        np.testing.assert_allclose(d.sum(axis=1), 1.0, atol=1e-12)
        for j, f in enumerate(self.ACTIVE):
            m = self.W[f] / tot
            assert d[:, j].mean() == pytest.approx(m, abs=2e-3)
            assert d[:, j].var() == pytest.approx(m * (1 - m) / 51, rel=0.05)

    def test_seeded(self):
        a = draw_weights(self.W, self.ACTIVE, 100, 50, MC["seed"])
        assert np.array_equal(a, draw_weights(self.W, self.ACTIVE, 100, 50, MC["seed"]))
        assert not np.array_equal(a, draw_weights(self.W, self.ACTIVE, 100, 50, MC["seed"] + 1))


def synthetic(n=600, seed=0, missing=0.0):
    r = np.random.default_rng(seed)
    s = {f: r.uniform(0.05, 1, n) for f in CORE + SECONDARY}
    if missing:
        for f in ("F2", "F7"):
            s[f][r.uniform(size=n) < missing] = np.nan
    rows = r.integers(10, 350, n)
    aw = area_weights({"cell_id": rows * 720})
    mask = r.uniform(size=n) > 0.1
    return s, mask, aw


class TestZeroWeights:
    def test_zero_weight_factor_cannot_matter(self):
        """Zero-weight factors are not sampled: changing (or blanking) their scores leaves every frequency unchanged."""
        s, mask, aw = synthetic(seed=3)
        w = dict(PROFILES["P2_isru_ice"]["weights"], F5=0, F8=0)
        a = top_frac_freq(s, w, mask, aw, draws=100)
        s2 = dict(s, F5=np.random.default_rng(9).uniform(0, 1, len(aw)), F8=np.full(len(aw), np.nan))
        assert np.array_equal(a, top_frac_freq(s2, w, mask, aw, draws=100))

    def test_zero_weights_stay_exactly_zero_in_draws(self):
        """The draw matrix only has columns for active factors; expanded to all of CORE the others are exact 0."""
        w = PROFILES["P1_landing_mobility"]["weights"]  # F9 = 0
        active = [f for f in CORE if w[f] > 0]
        d = draw_weights(w, active, 500, 50, 1)
        full = np.zeros((500, len(CORE)))
        full[:, [CORE.index(f) for f in active]] = d
        assert w["F9"] == 0 and (full[:, CORE.index("F9")] == 0.0).all()
        assert (d > 0).all()


class TestDeterminism:
    def test_same_seed_same_result_any_chunk(self):
        s, mask, aw = synthetic(seed=2)
        w = PROFILES["P3_habitat_eva_power"]["weights"]
        a = top_frac_freq(s, w, mask, aw, draws=200, seed=MC["seed"], chunk=50)
        assert np.array_equal(a, top_frac_freq(s, w, mask, aw, draws=200, seed=MC["seed"], chunk=50))
        assert np.array_equal(a, top_frac_freq(s, w, mask, aw, draws=200, seed=MC["seed"], chunk=200))
        assert not np.array_equal(a, top_frac_freq(s, w, mask, aw, draws=200, seed=MC["seed"] + 1, chunk=50))


class TestThreshold:
    @pytest.mark.parametrize("seed", range(5))
    def test_fast_rows_match_full_sort(self, seed):
        """_wq_rows (top slice) == _wq_rows_full (full stable sort) == grid.area.weighted_quantile, with ties."""
        r = np.random.default_rng(seed)
        n = int(r.integers(300, 3000))
        S = np.round(r.uniform(0, 1, (6, n)), int(r.integers(1, 4))).astype("float32")
        S[:, r.uniform(size=n) < 0.3] = 0  # hard-filtered cells (S = 0) stay in the denominator
        w = np.cos(np.radians(r.uniform(-80, 80, n)))
        fast, full = _wq_rows(S, w, 0.95), _wq_rows_full(S, w, 0.95)
        np.testing.assert_allclose(fast, full, rtol=1e-12, atol=0)
        for i in range(len(S)):
            assert fast[i] == pytest.approx(weighted_quantile(S[i], w, 0.95)[0], rel=1e-12)

    def test_widening_when_top_cells_have_little_area(self):
        """Many tiny-area cells at the top: the first slice lies entirely above P95, so it must widen."""
        n = 2000
        S = np.linspace(1, 0, n)[None, :].astype("float32")
        w = np.ones(n)
        w[:1500] = 1e-4
        np.testing.assert_allclose(_wq_rows(S, w, 0.95), _wq_rows_full(S, w, 0.95), rtol=1e-12)

    def test_area_weighting_changes_membership(self):
        """10 top-scoring polar cells (lat 79.75) hold little area, so they all fit in the top 5% of land."""
        rows = np.array([20] * 10 + [179] * 290)
        aw = area_weights({"cell_id": rows * 720})
        S = np.linspace(1, 0.01, 300)
        thr_w = weighted_quantile(S, aw, 0.95)[0]
        thr_u = weighted_quantile(S, np.ones(300), 0.95)[0]
        assert (S >= thr_u).sum() == 15  # unweighted: 5% of 300 cells
        assert (S >= thr_w).sum() > 15  # area-weighted: the polar cells count for ~cos(79.75) = 0.18 each

    def test_matches_float64_reference(self):
        """Chunked float32 matmul vs a plain float64 per-draw recomputation (missing factors renormalised per cell)."""
        s, mask, aw = synthetic(n=400, seed=1, missing=0.2)
        w = PROFILES["P2_isru_ice"]["weights"]
        suff = score_cells(s, w)["sufficient"]
        draws = 40
        got = top_frac_freq(s, w, mask, aw, draws=draws, seed=5, chunk=16, valid=suff)
        act = [f for f in CORE if w[f] > 0]
        W = draw_weights(w, act, draws, 50, 5)
        vi = np.flatnonzero(suff)
        sec = np.stack([s[f][vi] for f in SECONDARY])
        nudge = (0.9 + 0.1 * np.nanmean(sec, axis=0)) * mask[vi]
        hits = np.zeros(len(vi))
        for d in range(draws):
            num = sum(np.where(np.isfinite(s[f][vi]), W[d, k] * np.log(np.maximum(np.nan_to_num(s[f][vi], nan=1), FLOOR)), 0)
                      for k, f in enumerate(act))
            den = sum(W[d, k] * np.isfinite(s[f][vi]) for k, f in enumerate(act))
            S = np.exp(num / den) * nudge
            thr = weighted_quantile(S, aw[vi], 0.95)[0]
            hits += (S >= thr) & (S > 0)
        want = np.zeros(len(aw))
        want[vi] = hits / draws
        assert np.abs(got - want).max() <= 1 / draws + 1e-12  # float32 may flip a cell sitting on a threshold
        assert (got[~suff] == 0).all()


class TestRobustRule:
    def test_flag_boundary(self):
        f = np.array([0.8, 0.799, 1.0, 0.0, np.nan, 800 / 1000, 799 / 1000])
        assert robust_flags(f, 0.8).tolist() == [True, False, True, False, False, True, False]

    def test_dominant_filtered_and_insufficient_cells(self):
        s, mask, aw = synthetic(n=400, seed=4)
        for f in CORE:
            s[f][0] = s[f][1] = 1.0  # cells 0 and 1 dominate every draw ...
            s[f][2] = np.nan  # ... cell 2 has no data at all
        mask[0], mask[1] = True, False  # ... but cell 1 is hard-filtered
        w = PROFILES["P2_isru_ice"]["weights"]
        suff = score_cells(s, w)["sufficient"]
        assert not suff[2]
        freq = top_frac_freq(s, w, mask, aw, draws=100, valid=suff)
        assert freq[0] == 1.0 and freq[1] == 0.0 and freq[2] == 0.0
        assert robust_flags(freq)[0] and not robust_flags(freq)[1:3].any()
        hit_area = (freq * aw)[suff].sum() / aw[suff].sum()
        assert hit_area <= 0.05 + 1e-9  # on average at most 5% of scorable land area is "top 5%"
