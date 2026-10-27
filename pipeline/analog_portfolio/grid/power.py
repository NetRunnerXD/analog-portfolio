"""Read cached NASA POWER climatology boxes (data/raw/earth/power/<PARAM>/box_<lat>_<lon>.json) onto the 0.5 deg grid."""
from __future__ import annotations

import glob
import json

import numpy as np

from ..config import RAW
from . import lat_centres, lon_centres

MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def n_boxes(param: str) -> int:
    return len(glob.glob(str(RAW / "earth/power" / param / "box_*.json")))


def power_grid(param: str, periods=("ANN",)) -> dict[str, np.ndarray]:
    """{period: (360, 720)} bilinear from the POWER native grid; NaN outside downloaded boxes."""
    from scipy.interpolate import RegularGridInterpolator

    pts: dict[tuple[float, float], dict[str, float]] = {}
    for f in glob.glob(str(RAW / "earth/power" / param / "box_*.json")):
        d = json.load(open(f))
        for ft in d["features"]:
            lo, la = ft["geometry"]["coordinates"][:2]
            v = ft["properties"]["parameter"][param]
            pts[(round(la, 4), round(lo, 4))] = {p: (np.nan if v.get(p) is None or v[p] <= -998 else v[p]) for p in periods}
    lats = np.array(sorted({k[0] for k in pts}))
    lons = np.array(sorted({k[1] for k in pts}))
    li = {v: i for i, v in enumerate(lats)}
    oi = {v: i for i, v in enumerate(lons)}
    LA, LO = np.meshgrid(lat_centres(), lon_centres(), indexing="ij")
    out = {}
    for p in periods:
        A = np.full((len(lats), len(lons)), np.nan)
        for (la, lo), v in pts.items():
            A[li[la], oi[lo]] = v[p]
        out[p] = RegularGridInterpolator((lats, lons), A, method="linear", bounds_error=False, fill_value=None)((LA, LO))
    return out


def diurnal_amplitude(hours=("TS_00", "TS_05", "TS_06", "TS_13", "TS_14")) -> np.ndarray:
    """Earth F2: mean over months of (max_h - min_h) of the monthly mean LST diurnal skin-temperature curve."""
    g = {h: power_grid(h, MONTHS) for h in hours}
    amps = [np.max([g[h][m] for h in hours], 0) - np.min([g[h][m] for h in hours], 0) for m in MONTHS]
    return fill_nearest(np.mean(amps, 0))


def fill_nearest(a: np.ndarray) -> np.ndarray:
    """Fill NaNs (edges of downloaded land-only boxes) with the nearest valid cell value."""
    from scipy.ndimage import distance_transform_edt

    bad = ~np.isfinite(a)
    if not bad.any() or bad.all():
        return a
    idx = distance_transform_edt(bad, return_distances=False, return_indices=True)
    return a[tuple(idx)]
