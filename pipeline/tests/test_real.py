"""Real-run helpers: target vectors, candidate pool tie-breaks + great-circle NMS, robust MC edge cases."""
import numpy as np

from analog_portfolio.export.real import _pool, target_values
from analog_portfolio.score.robust import _wq_rows, top_frac_freq
from analog_portfolio.grid.area import weighted_quantile


def test_target_values_null_f3_dropped_and_defaults():
    rec = {"features": {"ts_mean_k": 100.0, "dt_k": None, "ti_class": None, "geomorph_flags": 49}}
    v = target_values(rec)
    assert v["F1"] == 100.0 and "F2" not in v and "F3" not in v and v["F13"] == 49.0
    assert v["F7"] == 0.0 and v["F8"] == 1.0


def test_pool_tiebreak_and_nms():
    n = 6
    earth = {"cell_id": np.array([10, 11, 12, 5000, 5001, 90000])}
    lat = np.array([0.0, 0.0, 0.0, 30.0, 30.0, -60.0]); lon = np.array([0.0, 0.5, 1.0, 10.0, 10.5, 0.0])
    total = np.array([0.5, 0.5, 0.4, 0.5, 0.3, 0.1])
    s = {f: np.ones(n) for f in ["F1", "F4"]}
    w = {"F1": 50, "F4": 50, "F2": 0}
    kept, med = _pool(s, total, np.ones(n, bool), np.ones(n, bool), w, earth, lat, lon, 10, 300.0, np.ones(n))
    assert kept[0] == 0                       # S tie -> lowest cell_id first
    assert 1 not in kept and 2 not in kept    # within 300 km (great circle) of cell 0
    assert 3 in kept and 4 not in kept and 5 not in kept   # 5 is below the median


def test_wq_rows_matches_weighted_quantile():
    r = np.random.default_rng(0)
    S = r.random((3, 500)).astype("float32"); w = r.random(500)
    for i in range(3):
        assert abs(_wq_rows(S[i:i + 1], w, 0.95)[0] - weighted_quantile(S[i], w, 0.95)[0]) < 1e-6


def test_robust_invalid_cells_excluded_and_nan_renormalised():
    r = np.random.default_rng(1)
    n = 400
    s = {f: r.random(n) for f in ["F1", "F2", "F11", "F12", "F13"]}
    s["F2"][:20] = np.nan                      # missing in 20 cells -> renormalised over F1 only there
    valid = np.ones(n, bool); valid[-10:] = False
    f = top_frac_freq(s, {"F1": 60, "F2": 40, "F3": 0}, np.ones(n, bool), np.ones(n), draws=40, valid=valid)
    assert np.all(f[-10:] == 0) and np.isfinite(f).all() and 0 < f.mean() < 0.2
    hi = np.argmax(np.where(valid, s["F1"] ** 0.6 * np.nan_to_num(s["F2"], nan=s["F1"]) ** 0.4, 0))
    assert f[hi] > 0.5


def test_snap_site_coastal():
    from analog_portfolio.export.real import snap_site
    from analog_portfolio.grid import cell_id

    own = cell_id(29.0, -13.8)
    land = {own + 1: 0, own - 720: 1}           # east neighbour and north neighbour are land
    o, ev, km, snapped = snap_site(29.0, -13.8, land)
    assert o == own and snapped and ev in land and 0 < km < 80
    o, ev, km, snapped = snap_site(29.0, -13.8, {own: 0})
    assert ev == own and not snapped and km is None
    assert snap_site(29.0, -13.8, {own + 5: 0})[1] is None   # beyond 1 cell -> no snap


def test_candidate_gate_and_range_sim_engine():
    from analog_portfolio.contract import load
    from analog_portfolio.score.engine import factor_scores
    from analog_portfolio.score.gates import candidate_gate

    prof = load("profiles")
    # research.md §8 rule: A AI<=0.2 | B F8>=0.5 | C pf>=0.5 & F8+moss>=0.5 | D (impact|volcanic) & (AI<=0.5 | F8>=0.1)
    earth = {"cell_id": np.arange(9),
             "aridity_index":   np.array([0.20, 1.5, 1.49, 1.6, 0.46, 0.42, 4.3, np.nan, 1.0]),
             "barren_frac":     np.array([0.0, 0.50, 0.20, 0.14, 0.0, 0.01, 0.05, np.nan, 0.05]),
             "permafrost_frac": np.array([0, 0, 1.0, np.nan, 0, 0, 0, 1.0, 0.6]),
             "moss_lichen_frac": np.array([0, 0, 0.80, 0, 0, 0, 0, 0.9, 0.2]),
             "geomorph_flags":  np.array([0, 0, 0, 64, 1, 0, 16, 1, 0])}
    # pilbara(A), iceland(B), haughton(C), hi-seas(D, F8>=0.1), lonar(D, AI<=0.5), rio tinto FAIL, hoh (massif only) FAIL,
    # NaN AI/F8 with moss: C passes (pf 1, 0 + 0.9), D fails; last: pf 0.6 but F8+moss 0.25 -> FAIL
    assert candidate_gate(earth, "mars", prof).tolist() == [True, True, True, True, True, False, False, True, False]
    assert candidate_gate(earth, "moon", prof).all()
    assert not any(f["id"] == "dry_or_cold_desert" for p in prof["profiles"] for f in p["hard_filters"])
    n = 200
    r = np.random.default_rng(3)
    e = {"cell_id": np.arange(n) * 720 + 300, "ts_mean_k": np.linspace(215, 305, n), "dt_k": np.linspace(1, 30, n),
         "ti_class": np.full(n, 3.0), "slope_lt5_frac": r.random(n), "relief_m": r.random(n) * 1000 + 5,
         "lith_class": np.full(n, 9.0), "aridity_index": r.random(n), "barren_frac": r.random(n), "ice_index": r.random(n),
         "noon_sun_elev_deg": r.random(n) * 80, "column_mass_gcm2": np.full(n, 1000.0), "cutoff_rigidity_gv": r.random(n),
         "uv_index": r.random(n), "geomorph_flags": np.zeros(n)}
    s = factor_scores(e, {"F1": 100.0, "F2": 300.0, "F3": 2, "F4": 0.5, "F5": 500, "F6": 9, "F8": 1, "F9": 1, "F10": 5, "F13": 1}, "moon")
    assert s["F1"][0] > 0.9 and s["F1"][-1] == 0.0      # warmest cells no longer near-perfect for a cold target
    assert s["F2"][-1] > 0.9 and s["F2"][0] == 0.0


def test_gaps_no_cross_body_leakage():
    import json

    from analog_portfolio.contract import REPO_ROOT

    g = json.loads((REPO_ROOT / "pipeline" / "inputs" / "gaps.json").read_text())
    for tier in g["tiers"].values():
        for x in tier["gaps"]:
            if x["id"].startswith("lunar_") or "(Moon)" in x["label"] or x["id"] == "hard_vacuum":
                assert x["values"].get("mars") is None, x["id"]
            if x["id"].startswith("mars_"):
                assert x["values"].get("moon") is None, x["id"]


def test_planet_1deg_aggregation():
    from analog_portfolio.export.planet_grids import quant, to_1deg

    a = np.arange(360 * 720, dtype=float).reshape(360, 720)
    m = to_1deg(a, "cont")
    assert m.shape == (180, 360) and m[0, 0] == np.mean([0, 1, 720, 721])
    f = np.zeros((360, 720)); f[0, 0] = 1; f[1, 1] = 32
    assert to_1deg(f, "flags")[0, 0] == 33
    c = np.full((360, 720), 4.0); c[0, 0] = 2
    assert to_1deg(c, "cat")[0, 0] == 4
    sc, off = quant(np.array([25.0, 400.0]), "cont")
    assert off + 254 * sc >= 400 and off <= 25


def test_targets_full_precision_and_scoring_constants():
    import json

    from analog_portfolio.contract import REPO_ROOT

    t = json.loads((REPO_ROOT / "web/public/data/mock/targets.json").read_text())
    sc = t["scoring_constants"]
    assert set(sc["range_norm"]["factors"]) == {"F1", "F2"} and "F1" in sc["earth_clip"]
    for f in ("F1", "F2"):
        r = sc["range_norm"]["factors"][f]
        assert r["p99"] > r["p01"] and abs(r["span"] - (r["p99"] - r["p01"])) < 1e-9
    assert sc["gates"]["mars"]["inputs"][0] == "aridity_index"
