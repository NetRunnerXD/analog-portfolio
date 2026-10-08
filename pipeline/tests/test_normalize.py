"""Known-answer tests on contract/test_vectors.json (the JS scorer runs the same vectors)."""
import pytest

from analog_portfolio.contract import load
from analog_portfolio.grid import cell_centre, cell_id
from analog_portfolio.score import (bounded_fraction, flag_match, gaussian, geometric_mean, ordinal_class,
                                    ratio_sim, total_score)
from analog_portfolio.score.setcover import greedy_portfolio

TV = load("test_vectors")
TOL = 1e-9


@pytest.mark.parametrize("c", TV["ratio_sim"])
def test_ratio_sim(c):
    assert ratio_sim(c["x"], c["t"]) == pytest.approx(c["expected"], abs=TOL)


def test_mars_pressure_cap():
    assert ratio_sim(500, 6.36) == pytest.approx(0.0251, abs=1e-4)


@pytest.mark.parametrize("c", TV["bounded_fraction"])
def test_bounded_fraction(c):
    assert bounded_fraction(c["x"], c["t"]) == pytest.approx(c["expected"], abs=TOL)


@pytest.mark.parametrize("c", TV["gaussian"])
def test_gaussian(c):
    assert gaussian(c["x"], c["t"], c["tau"]) == pytest.approx(c["expected"], abs=TOL)


@pytest.mark.parametrize("c", TV["ordinal_class"])
def test_ordinal(c):
    assert ordinal_class(c["x"], c["t"], c["n_classes"]) == pytest.approx(c["expected"], abs=TOL)


@pytest.mark.parametrize("c", TV["flag_match"])
def test_flags(c):
    assert flag_match(c["earth"], c["target"]) == pytest.approx(c["expected"], abs=TOL)


@pytest.mark.parametrize("c", TV["geometric_mean"])
def test_geomean(c):
    assert geometric_mean(c["scores"], c["weights"], c["floor"]) == pytest.approx(c["expected"], abs=TOL)


@pytest.mark.parametrize("c", TV["total_score"])
def test_total(c):
    assert total_score(c["core"], c["secondary"]) == pytest.approx(c["expected"], abs=TOL)


@pytest.mark.parametrize("c", TV["cell_id"])
def test_cell_id(c):
    cid = cell_id(c["lat"], c["lon"])
    assert cid == c["expected"]
    lat, lon = cell_centre(cid)
    assert abs(lat - c["lat"]) <= 0.25 + 1e-9


@pytest.mark.parametrize("c", TV["set_cover"])
def test_set_cover(c):
    chosen, _, _ = greedy_portfolio(c["sites"], c["weights"], c["theta"], c["lam"])
    assert [s["site_id"] for s in chosen] == c["expected_ids"]
