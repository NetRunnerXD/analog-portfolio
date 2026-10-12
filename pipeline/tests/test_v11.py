"""Contract v1.1 (UI spec v0.3): area weighting, robustness rule, three variants, UI display fields."""
import json

import numpy as np
import pytest

from analog_portfolio import CONTRACT_VERSION
from analog_portfolio.contract import CONTRACT_DIR, WEB_DATA_DIR, load
from analog_portfolio.grid.area import cell_area_km2, cell_weights, great_circle_km, weighted_pct_rank, weighted_quantile
from analog_portfolio.score.engine import aggregate
from analog_portfolio.score.robust import top_frac_freq
from analog_portfolio.score.variants import build_variants

TV = json.loads((CONTRACT_DIR / "test_vectors.json").read_text())


@pytest.mark.parametrize("c", TV["weighted_quantile"])
def test_weighted_quantile(c):
    assert weighted_quantile(np.array(c["x"]), np.array(c["w"]), c["q"])[0] == pytest.approx(c["expected"])


@pytest.mark.parametrize("c", TV["weighted_pct_rank"])
def test_weighted_pct_rank(c):
    got = weighted_pct_rank(np.array(c["x"]), np.array(c["w"]), c["higher_is_better"])
    assert got.tolist() == pytest.approx(c["expected"])


def test_geometric_mean_dropped():
    c = TV["geometric_mean_dropped"][0]
    s = {f: np.array([v]) for f, v in c["scores"].items()}
    s.update({f: np.array([0.0]) for f in ("F11", "F12", "F13")})
    core, _ = aggregate(s, c["weights"])
    assert core[0] == pytest.approx(c["expected"])


def test_cell_geometry():
    w = cell_weights()
    assert w.shape == (360, 720) and w[0, 0] == pytest.approx(np.cos(np.radians(89.75)))
    # 0.5 deg cell at 77.5 S: ~55.6 km N-S x ~12 km E-W (design/factcheck.md)
    ew = 2 * np.pi * 6371.0088 / 720 * np.cos(np.radians(77.5))
    assert 11.5 < ew < 12.5
    assert cell_area_km2().sum() * 720 == pytest.approx(4 * np.pi * 6371.0088 ** 2, rel=1e-9)
    assert great_circle_km(0, 0, 0, 1) == pytest.approx(111.195, abs=0.01)


def test_robust_freq_simple():
    rng = np.random.default_rng(0)
    n = 2000
    s = {f"F{i}": rng.uniform(0.2, 0.6, n) for i in range(1, 11)}
    for f in s:
        s[f][:5] = 0.99  # five cells best on every factor -> always top 5%
    s.update({f: np.zeros(n) for f in ("F11", "F12", "F13")})
    w = {f"F{i}": 10 for i in range(1, 11)}
    freq = top_frac_freq(s, w, np.ones(n, bool), np.ones(n), draws=100)
    assert (freq[:5] == 1.0).all()
    assert freq[5:].mean() < 0.06


def _site(i, fs, tt, cont):
    return dict(site_id=f"s{i}", score=0.5, factor_scores=fs, logistics=dict(travel_time_min=tt, continent=cont))


def test_variants_easy_filter_and_continent():
    w = {"F1": 50, "F2": 50}
    pool = [_site(1, {"F1": 0.9, "F2": 0.9}, 2000, "Antarctica"),
            _site(2, {"F1": 0.8, "F2": 0.1}, 100, "Asia"),
            _site(3, {"F1": 0.1, "F2": 0.75}, 300, "Europe"),
            _site(4, {"F1": 0.72, "F2": 0.71}, None, "Asia")]
    v = {x["id"]: x for x in build_variants(pool, w, 0.7)}
    assert [x["id"] for x in build_variants(pool, w, 0.7)] == ["best_match", "easiest_to_reach", "one_continent"]
    assert [s["site_id"] for s in v["best_match"]["sites"]] == ["s1"]
    assert {s["site_id"] for s in v["easiest_to_reach"]["sites"]} == {"s2", "s3"}  # None travel time excluded
    assert all(s["logistics"]["travel_time_min"] <= 360 for s in v["easiest_to_reach"]["sites"])
    assert v["one_continent"]["continent"] == "Antarctica"
    none = build_variants([_site(1, {"F1": 0.9, "F2": 0.9}, 2000, "Asia")], w, 0.7)
    assert none[1]["available"] is False and "6 h" in none[1]["unavailable_reason"]


def test_profiles_ui_fields():
    p = load("profiles")
    assert p["contract_version"] == CONTRACT_VERSION and CONTRACT_VERSION.startswith("1.")
    assert [v["id"] for v in p["defaults"]["variants"]] == ["best_match", "easiest_to_reach", "one_continent"]
    mc = p["defaults"]["monte_carlo"]
    assert mc["robust_top_frac"] == 0.05 and mc["robust_min_freq"] == 0.8 and "top_k" not in mc
    names = {x["id"]: x["display_name"] for x in p["profiles"]}
    assert names["P2_isru_ice"] == "Ice & resources" and names["P5_astrobiology"] == "Search for life"
    for f in p["global_hard_filters"] + [h for x in p["profiles"] for h in x["hard_filters"]]:
        assert f["ui_short"] and f["ui_tooltip"]


def test_mock_targets_display_and_earth_reference():
    t = json.loads((WEB_DATA_DIR / "mock" / "targets.json").read_text())
    assert all(x["short_name"] and x["description"] for x in t["targets"])
    er = t["earth_reference"]
    assert er["area_weighting"] == "cos_lat"
    for col in ("ts_mean_k", "dt_k"):
        st = er["stats"][col]
        assert st["min"]["value"] <= st["p0_5"] <= st["p50"] <= st["p99_5"] <= st["max"]["value"]


def test_mock_portfolios_three_variants():
    for f in (WEB_DATA_DIR / "mock" / "portfolios").glob("*.json"):
        p = json.loads(f.read_text())
        assert [v["id"] for v in p["variants"]] == ["best_match", "easiest_to_reach", "one_continent"]
        for v in p["variants"]:
            if v["id"] == "easiest_to_reach":
                assert all(s["logistics"]["travel_time_min"] <= 360 for s in v["sites"])
            for s in v["sites"]:
                assert s["robustness"]["robust"] == (s["robustness"]["top5_freq"] >= 0.8)


def test_v111_continent_column_radius_labels():
    import json

    from analog_portfolio.contract import WEB_DATA_DIR, load
    from analog_portfolio.grid import BODY_RADIUS_M, haversine_km
    from analog_portfolio.grid.binary import read_grid
    from analog_portfolio.grid.columns import CONTINENT_CODES, EARTH_COLUMNS

    names = [c[0] for c in EARTH_COLUMNS]
    assert names[24] == "continent" and names[25:] == ["permafrost_frac", "moss_lichen_frac"] and len(names) == 27
    m = json.loads((WEB_DATA_DIR / "mock" / "earth_features.json").read_text())
    arr = {a["name"]: a for a in m["arrays"]}
    assert arr["continent"]["codes"] == {str(k): v for k, v in CONTINENT_CODES.items()}
    g = read_grid(WEB_DATA_DIR / "mock" / "earth_features.json")
    assert set(np.unique(g["continent"]).astype(int)) <= set(CONTINENT_CODES)
    assert BODY_RADIUS_M["earth"] == 6_371_008.8
    assert haversine_km(0, 0, 0, 1) == pytest.approx(great_circle_km(0, 0, 0, 1), rel=1e-12)
    labels = {f["id"]: f["ui_label"] for f in load("factors")["factors"]}
    assert labels["F1"] == "Average ground temperature" and labels["F13"] == "Landforms (tie-breaker)"


def test_v111_mock_sites_have_names_fields():
    import json

    from analog_portfolio.contract import WEB_DATA_DIR

    p = next((WEB_DATA_DIR / "mock" / "portfolios").glob("*.json"))
    port = json.loads(p.read_text())
    st = port["top_cells"][0]
    assert "country" in st and "admin1" in st and st["logistics"]["continent"]
