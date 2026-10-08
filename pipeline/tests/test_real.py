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
