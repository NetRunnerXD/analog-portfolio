"""Vectorised reference scorer over Earth cells (numpy). JS port: web/src/scoring/.

Missing data (DATA_CONTRACT.md 3.2 items 5-6, contract v1.1.1; implemented in review-01):
  * A NaN Earth input makes that factor's score NaN (missing) for that cell, never 0. The factor is dropped for the
    cell and the remaining active weights are renormalised. The cell is scored only if the factors present carry at
    least MIN_WEIGHT_COVERAGE (70%) of the active weight; otherwise it is `insufficient_data`: S = NaN, excluded from
    ranking, percentiles, thresholds, the candidate pool, set cover and robustness.
  * A target value that is null / non-finite drops that factor for the whole target (weights renormalised; listed in
    targets.json -> dropped_factors and in each portfolio's dropped_factors). Active weight = profile weight > 0 and
    scorable for the target. F7 / F11 / F12 use only Earth values and are never dropped this way.
  * Nothing here raises on null or NaN (all-missing cells, columns or targets included).
"""
from __future__ import annotations

import numpy as np

from ..contract import load
from ..grid.area import weighted_pct_rank, weighted_quantile
from .normalize import FLOOR

CORE = [f"F{i}" for i in range(1, 11)]
SECONDARY = ["F11", "F12", "F13"]
MIN_WEIGHT_COVERAGE = 0.70
# Factors whose similarity uses the target value (a null target value drops them for that target).
TARGET_DEPENDENT = ["F1", "F2", "F3", "F4", "F5", "F6", "F8", "F9", "F10", "F13"]
_EPS = 1e-12


def area_weights(earth: dict[str, np.ndarray]) -> np.ndarray:
    """cos(lat) of each Earth cell centre (sparse grids carry cell_id). A 0.5 deg cell is ~55.6 km N-S
    but only ~55.6*cos(lat) km E-W, so every Earth statistic is area-weighted."""
    if "_area_w" not in earth:
        row = np.asarray(earth["cell_id"], dtype="int64") // 720
        earth["_area_w"] = np.cos(np.radians(89.75 - 0.5 * row))
    return earth["_area_w"]


def _n_cells(earth: dict[str, np.ndarray]) -> int:
    return len(earth["cell_id"]) if "cell_id" in earth else len(next(iter(earth.values())))


def _col(earth: dict[str, np.ndarray], name: str) -> np.ndarray:
    """Feature column as float64; an absent column is all-missing."""
    if name not in earth:
        return np.full(_n_cells(earth), np.nan)
    return np.asarray(earth[name], dtype="float64")


def _tval(target_values: dict, fid: str) -> float | None:
    """Target value, or None if null / non-numeric / non-finite."""
    v = target_values.get(fid)
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return v if np.isfinite(v) else None


def target_dropped_factors(target_values: dict) -> list[str]:
    """Target-dependent factors with no usable target value (dropped for the whole target)."""
    return [f for f in TARGET_DEPENDENT if _tval(target_values, f) is None]


def _pct_rank(x: np.ndarray, higher_is_better: bool, w: np.ndarray | None = None) -> np.ndarray:
    """Area-weighted within-Earth percentile in [0, 1] (mid-ranks), oriented so 1 = closest to the target direction.
    Computed over cells with a value; a missing (non-finite) value stays NaN."""
    v = np.asarray(x, dtype="float64")
    out = np.full(v.shape, np.nan)
    w = np.ones_like(v) if w is None else np.asarray(w, dtype="float64")
    ok = np.isfinite(v) & (w > 0)
    if ok.any():
        out[ok] = weighted_pct_rank(v, w, higher_is_better)[ok]
    return out


# popcount lookup for uint8 geomorph flag bitmasks (F13)
_POPCOUNT8 = np.array([bin(i).count("1") for i in range(256)], dtype="float64")


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
    """Return {factor: (t_star, gap)} for factors with earth_clip=true and a usable target value.
    Bounds = area-weighted P0.5 / P99.5 over cells with a value; an all-missing column leaves t unclipped."""
    out = {}
    aw = area_weights(earth) if "cell_id" in earth else None
    for f in load("factors")["factors"]:
        t = _tval(target_values, f["id"])
        if t is None or not f["earth_clip"]:
            continue
        x = _col(earth, f["feature"])
        w = np.ones_like(x) if aw is None else aw
        if not (np.isfinite(x) & (w > 0)).any():
            out[f["id"]] = (t, 0.0)
            continue
        lo, hi = weighted_quantile(x, w, [0.005, 0.995])
        ts = float(min(max(t, lo), hi))
        out[f["id"]] = (ts, abs(t - ts))
    return out


def earth_range(earth: dict[str, np.ndarray], col: str) -> tuple[float, float]:
    """Area-weighted Earth land P1 and P99 of a column (range normalisation span for F1/F2), cached per grid."""
    key = f"_p01_p99_{col}"
    if key not in earth:
        x = _col(earth, col)
        w = area_weights(earth) if "cell_id" in earth else np.ones_like(x)
        if not (np.isfinite(x) & (w > 0)).any():
            earth[key] = (0.0, 1.0)  # all-missing column: span 1 (every score NaN anyway)
        else:
            lo, hi = weighted_quantile(x, w, [0.01, 0.99])
            earth[key] = (float(lo), float(hi)) if hi > lo else (float(lo), float(lo) + 1.0)
    return earth[key]


def factor_scores(earth: dict[str, np.ndarray], target_values: dict[str, float], body: str) -> dict[str, np.ndarray]:
    """Per-factor similarity arrays s_F in [0, 1] for every Earth cell; NaN = missing Earth input.
    Factors whose target value is null are omitted (dropped for this target)."""
    fac = {f["id"]: f for f in load("factors")["factors"]}
    clips = clip_targets(target_values, earth)
    n = _n_cells(earth)
    aw = area_weights(earth) if "cell_id" in earth else np.ones(n)
    s: dict[str, np.ndarray] = {}

    def tv(fid):
        return _tval(target_values, fid)

    def tstar(fid):
        return clips[fid][0] if fid in clips else tv(fid)

    def ratio(x, t):
        with np.errstate(invalid="ignore", divide="ignore"):
            r = 1.0 - np.abs(x - t) / (x + t)
        return np.where(x + t == 0, 1.0, r)  # NaN x stays NaN

    def bounded(col, fid):
        return 1.0 - np.abs(_col(earth, col) - tv(fid))

    def range_sim(col, fid):  # contract v1.2: F1/F2 range-normalised after the Earth clip; NaN x stays NaN
        lo, hi = earth_range(earth, col)
        return np.maximum(0.0, 1.0 - np.abs(_col(earth, col) - tstar(fid)) / (hi - lo))

    for fid, col in (("F1", "ts_mean_k"), ("F2", "dt_k")):
        if tv(fid) is not None:
            s[fid] = range_sim(col, fid)
    if tv("F5") is not None:
        s["F5"] = ratio(_col(earth, "relief_m"), tstar("F5"))
    if tv("F3") is not None:  # polar Moon targets have no F3 data -> factor dropped
        s["F3"] = 1.0 - np.abs(_col(earth, "ti_class") - tv("F3")) / 4.0
    if tv("F4") is not None:
        s["F4"] = bounded("slope_lt5_frac", "F4")
    lm = lith_matrix()
    t6 = tv("F6")
    if t6 is not None and float(t6).is_integer() and 0 <= int(t6) < len(lm):
        lc = _col(earth, "lith_class")
        ok = np.isfinite(lc) & (lc >= 0) & (lc < len(lm))
        f6 = np.full(n, np.nan)
        f6[ok] = lm[lc[ok].astype(int), int(t6)]  # Earth GLiM code 0 ("nd") is mapped to NaN in grid/assemble.py
        s["F6"] = f6
    s["F7"] = _pct_rank(_col(earth, "aridity_index"), False, aw)
    if tv("F8") is not None:
        s["F8"] = bounded("barren_frac", "F8")
    if tv("F9") is not None:
        s["F9"] = bounded("ice_index", "F9")
    if tv("F10") is not None:
        tau = fac["F10"]["params"]["tau"]
        s["F10"] = np.exp(-0.5 * ((_col(earth, "noon_sun_elev_deg") - tstar("F10")) / tau) ** 2)
    with np.errstate(invalid="ignore"):  # NaN + NaN mean -> NaN
        p11 = 0.5 * (_pct_rank(_col(earth, "column_mass_gcm2"), False, aw)
                     + _pct_rank(_col(earth, "cutoff_rigidity_gv"), False, aw))
    s["F11"] = fac["F11"]["params"]["cap"][body] * p11
    s["F12"] = fac["F12"]["params"]["cap"][body] * _pct_rank(_col(earth, "uv_index"), True, aw)
    t13 = tv("F13")
    if t13 is not None:
        tf = int(t13) & 0xFF
        want = bin(tf).count("1")
        g = _col(earth, "geomorph_flags")
        ok = np.isfinite(g)
        f13 = np.full(n, np.nan)
        f13[ok] = (_POPCOUNT8[g[ok].astype(np.int64) & 0xFF & tf] / want) if want else 0.0
        s["F13"] = f13
    return {k: np.clip(v, 0, 1) for k, v in s.items()}  # np.clip keeps NaN


def active_weights(s: dict[str, np.ndarray], weights: dict[str, float]) -> dict[str, float]:
    """Core factors with profile weight > 0 that are scorable for this target (present in s)."""
    return {f: float(w) for f, w in weights.items() if w > 0 and f in s}


def score_cells(s: dict[str, np.ndarray], weights: dict[str, float],
                min_coverage: float = MIN_WEIGHT_COVERAGE) -> dict[str, np.ndarray]:
    """Per cell: core (S_core), total (S), coverage (share of active weight present) and sufficient
    (coverage >= min_coverage). Insufficient cells get S_core = S = NaN.

    A profile with no positive weight at all (e.g. every Custom slider at 0) scores 0 everywhere, matching
    normalize.geometric_mean. Weighted factors that are all dropped for the target leave every cell insufficient.
    """
    n = len(next(iter(s.values()))) if s else 0
    if sum(w for w in weights.values() if w > 0) <= 0:
        z = np.zeros(n)
        return dict(core=z, total=z.copy(), coverage=np.ones(n), sufficient=np.ones(n, dtype=bool))
    act = active_weights(s, weights)
    num = np.zeros(n)
    den = np.zeros(n)
    for f, w in act.items():
        ok = np.isfinite(s[f])
        num += np.where(ok, w * np.log(np.maximum(np.where(ok, s[f], 1.0), FLOOR)), 0.0)
        den += w * ok
    tot = sum(act.values())
    coverage = den / tot if tot > 0 else np.zeros(n)
    sufficient = (coverage >= min_coverage - _EPS) & (den > 0)
    core = np.full(n, np.nan)
    core[sufficient] = np.exp(num[sufficient] / den[sufficient])
    sec = [s[f] for f in SECONDARY if f in s]
    if sec:
        sec = np.stack(sec)
        n_sec = np.isfinite(sec).sum(axis=0)
        s_sec = np.where(n_sec > 0, np.where(np.isfinite(sec), sec, 0.0).sum(axis=0) / np.maximum(n_sec, 1), 0.0)
    else:
        s_sec = np.zeros(n)
    return dict(core=core, total=core * (0.9 + 0.1 * s_sec), coverage=coverage, sufficient=sufficient)


def aggregate(s: dict[str, np.ndarray], weights: dict[str, float]) -> tuple[np.ndarray, np.ndarray]:
    """Return (S_core, S) arrays. Dropped factors (absent from s) are renormalised away; missing (NaN) factor scores
    are dropped per cell; cells with < 70% of the active weight present get NaN (insufficient_data)."""
    r = score_cells(s, weights)
    return r["core"], r["total"]


def hard_filter_mask(earth: dict[str, np.ndarray], profile: dict) -> np.ndarray:
    """True = passes every hard filter. Missing water / built-up fractions count as 0; a missing value inside a
    profile filter rule makes that rule fail (NaN comparisons are False)."""
    m = (np.nan_to_num(_col(earth, "water_frac")) < 0.5) & (np.nan_to_num(_col(earth, "builtup_frac")) < 0.5)
    ids = {h["id"] for h in profile.get("hard_filters", [])}
    ts = _col(earth, "ts_mean_k")
    with np.errstate(invalid="ignore"):
        if "frozen_ground" in ids:
            m &= (np.nan_to_num(_col(earth, "ice_index")) > 0) | (ts < 273.15)
        if "dry_or_cold_desert" in ids:
            ai = _col(earth, "aridity_index")
            m &= (ai < 0.2) | ((ts < 273.15) & (ai < 0.5))
    return m


def dropped_factors(s: dict[str, np.ndarray], weights: dict[str, float]) -> list[str]:
    """Weighted core factors that could not be scored because the target has no value."""
    return [f for f in CORE if weights.get(f, 0) > 0 and f not in s]


def score_profile(earth: dict[str, np.ndarray], s: dict[str, np.ndarray], profile: dict) -> dict[str, np.ndarray]:
    """Everything one (target, profile) needs from cached per-target factor scores s:
    core, total, coverage, sufficient, mask (hard filters) and S (filtered 0, insufficient NaN, else total)."""
    r = score_cells(s, profile["weights"])
    r["mask"] = hard_filter_mask(earth, profile)
    r["S"] = np.where(r["sufficient"], np.where(r["mask"], r["total"], 0.0), np.nan)
    return r


def candidate_indices(s: dict[str, np.ndarray], S: np.ndarray, mask: np.ndarray, weights: dict[str, float],
                      area_w: np.ndarray, top_n: int) -> list[int]:
    """Candidate pool before NMS (contract 3.2 item 7). Eligible: passes the hard filters, sufficient data and
    S >= the area-weighted median S of such cells. Per active core factor, the top_n eligible cells by a stable
    sort on s_f desc, then S desc, then cell index asc (a missing s_f never ranks). Returned in pool order:
    S desc, then cell index asc."""
    S = np.asarray(S, dtype="float64")
    eligible = np.asarray(mask, bool) & np.isfinite(S)
    if not eligible.any():
        return []
    median = float(weighted_quantile(S[eligible], np.asarray(area_w)[eligible], 0.5)[0])
    ok = np.flatnonzero(eligible & (S >= median))
    chosen: set[int] = set()
    for f in active_weights(s, weights):
        sf = s[f][ok]
        has = np.isfinite(sf)
        idx, sf = ok[has], sf[has]
        o = np.lexsort((idx, -S[idx], -sf))
        chosen.update(idx[o][:top_n].tolist())
    out = np.array(sorted(chosen), dtype=np.int64)
    return out[np.lexsort((out, -S[out]))].tolist() if out.size else []


class FactorCache:
    """Per-target factor-score cache. factor_scores is profile-independent, so compute it once per target and
    reuse it for every profile (review-01 M4: 80-pair deterministic pass 4.56 s -> 1.11 s at 85k cells)."""

    def __init__(self, earth: dict[str, np.ndarray]):
        self.earth = earth
        self._c: dict[tuple, dict[str, np.ndarray]] = {}

    def get(self, target_id: str, target_values: dict, body: str) -> dict[str, np.ndarray]:
        key = (target_id, body)
        if key not in self._c:
            self._c[key] = factor_scores(self.earth, target_values, body)
        return self._c[key]
