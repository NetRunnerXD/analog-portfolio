"""0.5 deg global grid shared by Earth, Moon and Mars (cell-centre registration)."""
from __future__ import annotations

import math

import numpy as np

RES = 0.5
NCOLS = 720
NROWS = 360
NCELLS = NCOLS * NROWS
BODY_RADIUS_M = {"earth": 6_371_008.8, "moon": 1_737_400.0, "mars": 3_396_190.0}


def lon_centres() -> np.ndarray:
    return -179.75 + RES * np.arange(NCOLS)


def lat_centres() -> np.ndarray:
    """North-to-south: row 0 is 89.75."""
    return 89.75 - RES * np.arange(NROWS)


def wrap_lon(lon: float) -> float:
    """Map any longitude (e.g. 0..360 E) to [-180, 180)."""
    return ((lon + 180.0) % 360.0) - 180.0


def cell_id(lat: float, lon: float) -> int:
    lon = wrap_lon(lon)
    col = min(int(math.floor((lon + 180.0) / RES)), NCOLS - 1)
    row = min(int(math.floor((90.0 - lat) / RES)), NROWS - 1)
    return row * NCOLS + col


def cell_centre(cid: int) -> tuple[float, float]:
    row, col = divmod(int(cid), NCOLS)
    return 89.75 - RES * row, -179.75 + RES * col


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float, body: str = "earth") -> float:
    r = BODY_RADIUS_M[body] / 1000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
