"""Vectorised reference scorer over Earth cells (numpy). JS port: web/src/scoring/."""
from __future__ import annotations

import numpy as np

from ..contract import load
from ..grid.area import weighted_pct_rank, weighted_quantile
from .normalize import FLOOR

CORE = [f"F{i}" for i in range(1, 11)]
SECONDARY = ["F11", "F12", "F13"]


def area_weights(earth: dict[str, np.ndarray]) -> np.ndarray:
    """cos(lat) of each Earth cell centre (sparse grids carry cell_id). A 0.5 deg cell is ~55.6 km N-S
    but only ~55.6*cos(lat) km E-W, so every Earth statistic is area-weighted."""
    if "_area_w" not in earth:
        row = np.asarray(earth["cell_id"], dtype="int64") // 720
        earth["_area_w"] = np.cos(np.radians(89.75 - 0.5 * row))
    return earth["_area_w"]


def _pct_rank(x: np.ndarray, higher_is_better: bool, w: np.ndarray | None = None) -> np.ndarray:
    """Area-weighted within-Earth percentile in [0, 1], oriented so 1 = closest to the target direction. NaN -> 0."""
    v = np.asarray(x, dtype="float64")
    return weighted_pct_rank(v, np.ones_like(v) if w is None else w, higher_is_better)


def lith_matrix() -> np.ndarray:
    f = load("factors")
    codes = {c["id"]: c["code"] for c in f["lithology_classes"]}
    n = max(codes.values()) + 1
    m = np.zeros((n, n))
    np.fill_diagonal(m, f["lithology_similarity"]["default_same"])
    m[0, 0] = 0.0
    for a, b, s in f["lithology_similarity"]["pairs"]:
        m[codes[a], codes[b]] = m[codes[b], codes[a]] = s
    return m


def clip_targets(target_values: dict[str, float], earth: dict[str, np.ndarray]) -> dict[str, tuple[float, float]]:
    """Return {factor: (t_star, gap)} for factors with earth_clip=true."""
    out = {}
    for f in load("factors")["factors"]:
        t = target_values.get(f["id"])
        if t is None or not f["earth_clip"]:
            continue
        x = earth[f["feature"]]
        lo, hi = weighted_quantile(x, area_weights(earth), [0.005, 0.995])
        ts = float(min(max(t, lo), hi))
        out[f["id"]] = (ts, abs(t - ts))
    return out


def earth_range(earth: dict[str, np.ndarray], col: str) -> tuple[float, float]:
    """Area-weighted Earth land P1 and P99 of a column (range normalisation span for F1/F2), cached per grid."""
    key = f"_p01_p99_{col}"
    if key not in earth:
        lo, hi = weighted_quantile(earth[col], area_weights(earth), [0.01, 0.99])
        earth[key] = (float(lo), float(hi))
    return earth[key]


def factor_scores(earth: dict[str, np.ndarray], target_values: dict[str, float], body: str) -> dict[str, np.ndarray]:
    """Per-factor similarity arrays s_F in [0, 1] for every Earth cell."""
    fac = {f["id"]: f for f in load("factors")["factors"]}
    clips = clip_targets(target_values, earth)
    s: dict[str, np.ndarray] = {}
    aw = area_weights(earth)

    def tstar(fid):
        return clips[fid][0] if fid in clips else target_values[fid]

    def ratio(x, t):
        with np.errstate(invalid="ignore", divide="ignore"):
            r = 1.0 - np.abs(x - t) / (x + t)
        return np.where(x + t == 0, 1.0, r)

    def range_sim(col, fid):  # contract v1.2: F1/F2 range-normalised after the Earth clip
        lo, hi = earth_range(earth, col)
        return np.maximum(0.0, 1.0 - np.abs(earth[col] - tstar(fid)) / (hi - lo))

    s["F1"] = range_sim("ts_mean_k", "F1")
    s["F2"] = range_sim("dt_k", "F2")
    if target_values.get("F3") is not None:  # polar Moon targets have no F3 data -> factor dropped
        s["F3"] = 1.0 - np.abs(earth["ti_class"] - target_values["F3"]) / 4.0
    s["F4"] = np.clip(1.0 - np.abs(earth["slope_lt5_frac"] - target_values["F4"]), 0, 1)
    s["F5"] = ratio(earth["relief_m"], tstar("F5"))
    lm = lith_matrix()
    lc = np.nan_to_num(earth["lith_class"]).astype(int)
    s["F6"] = lm[lc, int(target_values["F6"])]
    s["F7"] = _pct_rank(earth["aridity_index"], False, aw)
    s["F8"] = np.clip(1.0 - np.abs(earth["barren_frac"] - target_values["F8"]), 0, 1)
    s["F9"] = np.clip(1.0 - np.abs(earth["ice_index"] - target_values["F9"]), 0, 1)
    tau = fac["F10"]["params"]["tau"]
    s["F10"] = np.exp(-0.5 * ((earth["noon_sun_elev_deg"] - tstar("F10")) / tau) ** 2)
    p11 = 0.5 * (_pct_rank(earth["column_mass_gcm2"], False, aw) + _pct_rank(earth["cutoff_rigidity_gv"], False, aw))
    s["F11"] = fac["F11"]["params"]["cap"][body] * p11
    s["F12"] = fac["F12"]["params"]["cap"][body] * _pct_rank(earth["uv_index"], True, aw)
    tf = int(target_values["F13"])
    want = bin(tf).count("1")
    ef = np.nan_to_num(earth["geomorph_flags"]).astype(int)
    s["F13"] = np.array([bin(v & tf).count("1") / want if want else 0.0 for v in ef])
    return {k: np.nan_to_num(np.clip(v, 0, 1)) for k, v in s.items()}


def aggregate(s: dict[str, np.ndarray], weights: dict[str, float]) -> tuple[np.ndarray, np.ndarray]:
    """Return (S_core, S) arrays. Factors missing from s (no target data) are dropped and the weights renormalised."""
    wsum = sum(w for f, w in weights.items() if w > 0 and f in s)
    log = np.zeros_like(s["F1"])
    for f, w in weights.items():
        if w > 0 and f in s:
            log += (w / wsum) * np.log(np.maximum(s[f], FLOOR))
    core = np.exp(log)
    sec = np.mean([s[f] for f in SECONDARY], axis=0)
    return core, core * (0.9 + 0.1 * sec)


def hard_filter_mask(earth: dict[str, np.ndarray], profile: dict) -> np.ndarray:
    m = (np.nan_to_num(earth["water_frac"]) < 0.5) & (np.nan_to_num(earth["builtup_frac"]) < 0.5)
    ids = {h["id"] for h in profile.get("hard_filters", [])}
    if "frozen_ground" in ids:
        m &= (np.nan_to_num(earth["ice_index"]) > 0) | (earth["ts_mean_k"] < 273.15)
    if "dry_or_cold_desert" in ids:
        ai = earth["aridity_index"]
        m &= (ai < 0.2) | ((earth["ts_mean_k"] < 273.15) & (ai < 0.5))
    return m


def dropped_factors(s: dict[str, np.ndarray], weights: dict[str, float]) -> list[str]:
    """Weighted core factors that could not be scored because the target has no value."""
    return [f for f in CORE if weights.get(f, 0) > 0 and f not in s]
