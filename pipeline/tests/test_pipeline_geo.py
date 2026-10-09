"""Real-pipeline helpers: window geometry, grid sampling, POWER readers (synthetic data, no network)."""
import json
import math

import numpy as np
import pytest

from analog_portfolio.extract import targets as T
from analog_portfolio.grid import cell_id
from analog_portfolio.grid import power as PW
from analog_portfolio.grid.area import great_circle_km


@pytest.mark.parametrize("body_r", [1737.4, 3396.19])
def test_destination_and_disc(body_r):
    la, lo = T.destination(-89.4516, -137.2419, 90, 20, body_r)
    assert great_circle_km(-89.4516, -137.2419, la, lo, body_r) == pytest.approx(20, rel=1e-6)
    lats, lons = T.disc_points(-85.0, 30.0, 15, body_r, n=300)
    d = great_circle_km(-85.0, 30.0, lats, lons, body_r)
    assert d.max() <= 15 + 1e-6 and d.mean() == pytest.approx(10, rel=0.05)  # uniform disc: mean r = 2R/3


def test_sample_grid_modes():
    a = np.full((360, 720), np.nan)
    a.flat[cell_id(10.1, 20.1)] = 3
    a.flat[cell_id(10.6, 20.1)] = 5
    lats, lons = np.array([10.1, 10.2, 10.6]), np.array([20.1, 20.2, 20.1])
    assert T.sample_grid(a, lats, lons, "mode") == 3
    assert T.sample_grid(a, lats, lons) == pytest.approx(11 / 3)
    assert T.sample_grid(a, lats, lons, "max") == 5
    assert T.sample_grid(a, np.array([0.0]), np.array([0.0])) is None


def test_power_grid_and_diurnal(tmp_path, monkeypatch):
    monkeypatch.setattr(PW, "RAW", tmp_path)
    months = {m: 0.0 for m in PW.MONTHS}
    for h, val in {"TS_00": 0.0, "TS_05": -5.0, "TS_06": -4.0, "TS_13": 15.0, "TS_14": 14.0}.items():
        d = tmp_path / "earth/power" / h
        d.mkdir(parents=True)
        par = {h: dict(months, **{m: val for m in PW.MONTHS}, ANN=val)}
        feats = [dict(geometry=dict(coordinates=[float(lo), float(la), 0]), properties=dict(parameter=par))
                 for la in np.arange(-90, 90.1, 2.0) for lo in np.arange(-180, 180.1, 2.5)]
        (d / "box_all.json").write_text(json.dumps(dict(features=feats)))
    amp = PW.diurnal_amplitude()
    assert np.nanmin(amp) == pytest.approx(20.0) and np.nanmax(amp) == pytest.approx(20.0)
    assert PW.n_boxes("TS_13") == 1


def test_fill_nearest():
    a = np.array([[1.0, np.nan, 3.0]])
    assert PW.fill_nearest(a).tolist() in ([[1.0, 1.0, 3.0]], [[1.0, 3.0, 3.0]])
