"""Generate deterministic MOCK assets in web/public/data/mock/ that match the contract schemas.

Values are synthetic (latitude/elevation heuristics + hand-set analog cells) and flagged "mock": true.
They exist so the front end can be built before real layers land. Run:
    python -m analog_portfolio.export.mock
"""
from __future__ import annotations

import csv
import json
import math
import os
import re
from pathlib import Path

import numpy as np

from .. import CONTRACT_VERSION
from ..contract import REPO_ROOT, WEB_DATA_DIR, load
from ..grid import cell_centre, cell_id, haversine_km
from ..grid.binary import read_grid, write_grid
from ..grid.columns import COLUMN_CODES, CONTINENT_CODES, EARTH_COLUMNS, PLANET_COLUMNS
from ..grid.area import weighted_pct_rank, weighted_quantile
from ..score.engine import (CORE, SECONDARY, aggregate, area_weights, clip_targets, dropped_factors, factor_scores,
                            hard_filter_mask)
from ..score.robust import top_frac_freq
from ..score.gates import candidate_gate
from ..score.variants import build_variants
from .reference import earth_reference, scoring_constants

OUT = Path(os.environ.get("AP_MOCK_OUT") or WEB_DATA_DIR / "mock")  # AP_MOCK_OUT: build elsewhere, then swap
INPUTS = REPO_ROOT / "pipeline" / "inputs"
VALIDATION_CSV = REPO_ROOT / "docs" / "validation.csv"
RNG = np.random.default_rng(20261114)

# Rough continental boxes (lat0, lat1, lon0, lon1) for a coarse synthetic land mask.
LAND_BOXES = [
    (25, 70, -165, -55), (8, 25, -110, -77), (-55, 12, -81, -35), (36, 71, -10, 40), (5, 37, -17, 51),
    (-35, 5, 10, 51), (10, 75, 40, 145), (-39, -11, 113, 154), (60, 83, -73, -12), (-85, -64, -180, 180),
    (-47, -34, 166, 179), (50, 72, -170, -140),
]

# Known analog cells with hand-set mock features (subset of research.md section 3.5).
ANALOGS = {
    "haughton-devon-island": ("Haughton impact structure, Devon Island", 75.38, -89.68,
        dict(ts_mean_k=256, dt_k=12, ti_class=3, slope_lt5_frac=0.7, relief_m=300, lith_class=10, aridity_index=0.08,
             barren_frac=0.95, ice_index=1.0, noon_sun_elev_deg=14, geomorph_flags=1 | 4, elevation_m=200)),
    "atacama-yungay": ("Atacama Desert (Yungay)", -24.1, -70.0,
        dict(ts_mean_k=291, dt_k=35, ti_class=3, slope_lt5_frac=0.6, relief_m=900, lith_class=12, aridity_index=0.002,
             barren_frac=1.0, ice_index=0.0, noon_sun_elev_deg=66, geomorph_flags=0, elevation_m=1000)),
    "mcmurdo-dry-valleys": ("McMurdo Dry Valleys", -77.5, 162.0,
        dict(ts_mean_k=253, dt_k=15, ti_class=4, slope_lt5_frac=0.4, relief_m=1500, lith_class=6, aridity_index=0.01,
             barren_frac=1.0, ice_index=1.0, noon_sun_elev_deg=12, geomorph_flags=4 | 8, elevation_m=800)),
    "svalbard-bockfjorden": ("Svalbard (Bockfjorden)", 79.4, 13.3,
        dict(ts_mean_k=262, dt_k=8, ti_class=3, slope_lt5_frac=0.4, relief_m=900, lith_class=1, aridity_index=0.3,
             barren_frac=0.8, ice_index=1.0, noon_sun_elev_deg=11, geomorph_flags=4 | 64, elevation_m=300)),
    "mauna-kea": ("Mauna Kea, Hawai'i", 19.8, -155.5,
        dict(ts_mean_k=278, dt_k=18, ti_class=4, slope_lt5_frac=0.3, relief_m=3000, lith_class=1, aridity_index=0.4,
             barren_frac=0.7, ice_index=0.05, noon_sun_elev_deg=70, geomorph_flags=64, elevation_m=3500)),
    "rio-tinto": ("Río Tinto", 37.7, -6.6,
        dict(ts_mean_k=291, dt_k=16, ti_class=3, slope_lt5_frac=0.5, relief_m=500, lith_class=9, aridity_index=0.45,
             barren_frac=0.3, ice_index=0.0, noon_sun_elev_deg=52, geomorph_flags=0, elevation_m=300)),
    "ries-crater": ("Nördlinger Ries", 48.9, 10.6,
        dict(ts_mean_k=283, dt_k=10, ti_class=3, slope_lt5_frac=0.8, relief_m=200, lith_class=17, aridity_index=0.9,
             barren_frac=0.05, ice_index=0.0, noon_sun_elev_deg=41, geomorph_flags=1, elevation_m=430)),
    "sudbury": ("Sudbury impact structure", 46.6, -81.2,
        dict(ts_mean_k=278, dt_k=11, ti_class=4, slope_lt5_frac=0.7, relief_m=300, lith_class=17, aridity_index=1.0,
             barren_frac=0.1, ice_index=0.1, noon_sun_elev_deg=43, geomorph_flags=1, elevation_m=300)),
    "lanzarote": ("Lanzarote (La Corona)", 29.0, -13.6,
        dict(ts_mean_k=295, dt_k=12, ti_class=4, slope_lt5_frac=0.5, relief_m=600, lith_class=1, aridity_index=0.1,
             barren_frac=0.7, ice_index=0.0, noon_sun_elev_deg=61, geomorph_flags=2 | 64, elevation_m=200)),
    "ladakh-tso-kar": ("Ladakh (Tso Kar)", 33.3, 78.0,
        dict(ts_mean_k=272, dt_k=30, ti_class=3, slope_lt5_frac=0.4, relief_m=1800, lith_class=11, aridity_index=0.08,
             barren_frac=0.85, ice_index=0.5, noon_sun_elev_deg=57, geomorph_flags=4, elevation_m=4500)),
}


def synth_cell(lat: float, lon: float) -> dict:
    alat = abs(lat)
    elev = float(max(0, RNG.gamma(1.5, 400) + (2500 if 27 < lat < 40 and 70 < lon < 100 else 0)
                     + (2000 if -70 < lon < -65 and -30 < lat < 0 else 0) + (2200 if lat < -70 else 0)))
    ts = 302 - 0.75 * alat - 0.0055 * elev + RNG.normal(0, 3)
    ai = float(np.clip(RNG.lognormal(math.log(0.6 if 15 < alat < 35 else 1.0), 0.9), 0.001, 6.5))
    if lat < -60:
        ai = float(RNG.uniform(0.005, 0.1))
    barren = float(np.clip(1.2 - ai * 1.3 + (0.6 if lat < -60 or lat > 72 else 0) + RNG.normal(0, 0.1), 0, 1))
    dt = float(np.clip(8 + 25 * (1 - min(ai, 1)) + RNG.normal(0, 3), 2, 60))
    albedo = float(np.clip(0.15 + 0.25 * barren + (0.4 if lat < -60 else 0), 0.05, 0.9))
    ati = (1 - albedo) / dt
    ice = float(np.clip((273.15 - ts) / 15, 0, 1))
    decl = np.deg2rad(23.44) * np.sin(2 * np.pi * (np.arange(365) - 80) / 365)
    noon = 90 - np.abs(lat - np.rad2deg(decl))
    lam_m = math.radians(lat)  # dipole approx (mock): geographic = geomagnetic
    return dict(
        ts_mean_k=ts, dt_k=dt, ati=ati, ti_class=0, slope_lt5_frac=float(np.clip(1 - elev / 4000 + RNG.normal(0, .1), 0, 1)),
        slope_lt8_frac=float(np.clip(1.1 - elev / 4500, 0, 1)), slope_mean_deg=float(np.clip(elev / 400, 0, 40)),
        relief_m=float(max(10, elev * 0.6 + RNG.gamma(2, 80))), lith_class=int(RNG.choice([1, 4, 6, 7, 8, 9, 10, 11, 12])),
        aridity_index=ai, barren_frac=barren, ice_index=ice, noon_sun_elev_deg=float(np.median(noon)),
        column_mass_gcm2=1033.0 * math.exp(-elev / 8400), cutoff_rigidity_gv=14.9 * math.cos(lam_m) ** 4,
        uv_index=float(np.clip(12 * math.cos(math.radians(alat)) ** 1.5 + elev / 1500, 0.2, 18)),
        geomorph_flags=int(RNG.choice([0, 0, 0, 0, 1, 4, 64])), elevation_m=elev, albedo=albedo,
        water_frac=float(np.clip(RNG.normal(0.05, 0.05), 0, 1)), builtup_frac=float(np.clip(RNG.normal(0.02, 0.05), 0, 1)),
        travel_time_min=float(np.clip(RNG.gamma(2, 300) * (3 if alat > 60 else 1), 10, 9000)),
        airport_km=float(np.clip(RNG.gamma(2, 80) * (3 if alat > 60 else 1), 2, 2500)),
        permafrost_frac=ice if ice > 0.1 else float("nan"),
        moss_lichen_frac=float(np.clip(0.4 * (1 - barren), 0, 1)) if alat > 60 else 0.0,
    )


def mock_continent(lat: float, lon: float) -> str:
    """Coarse continent boxes for MOCK data only (real data: Natural Earth admin-0 CONTINENT)."""
    if lat < -60:
        return "Antarctica"
    if lon < -30:
        return "South America" if lat < 12 else "North America"
    if lat > 60 and lon < -10:
        return "North America"  # Greenland
    if lon > 110 and lat < -10 or lon > 160:
        return "Oceania"
    if -20 <= lon <= 52 and lat < 36:
        return "Africa"
    if -25 <= lon <= 40 and lat >= 36:
        return "Europe"
    return "Asia"


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower().replace("negative control:", "neg")).strip("_")[:48]


def load_validation() -> list[dict]:
    """docs/validation.csv (Researcher): name,lat,lon,body_analog,mission_purposes,why,citation_url."""
    rows = []
    with open(VALIDATION_CSV, newline="") as fh:
        for r in csv.DictReader(fh):
            mp = [] if r["mission_purposes"].strip() == "none" else r["mission_purposes"].split(";")
            rows.append(dict(name=r["name"], lat=float(r["lat"]), lon=float(r["lon"]), body_analog=r["body_analog"],
                             mission_purposes=mp, why=r["why"], citation_url=r["citation_url"],
                             kind="negative" if r["body_analog"] == "none" else "positive"))
    return rows


def negative_features(name: str) -> dict:
    n = name.lower()
    f = dict(aridity_index=float(RNG.uniform(1.2, 3.0)), barren_frac=0.02, ice_index=0.0, geomorph_flags=0,
             dt_k=float(RNG.uniform(5, 10)), ti_class=2)
    if any(k in n for k in ("singapore", "kolkata")):
        f.update(builtup_frac=0.8)
    if "neemo" in n or "aquarius" in n:
        f.update(water_frac=1.0)
    if "cropland" in n:
        f.update(aridity_index=float(RNG.uniform(0.5, 1.0)), barren_frac=0.05)
    return f


def build_earth(validation: list[dict]) -> tuple[dict[str, np.ndarray], dict[int, dict]]:
    """Synthetic sparse Earth grid; every validation site's cell is included. Returns (columns, {cell_id: site})."""
    cells: dict[int, dict] = {}
    for la0, la1, lo0, lo1 in LAND_BOXES:
        for lat in np.arange(la0 + 0.25, la1, 2.0):
            for lon in np.arange(lo0 + 0.25, lo1, 2.0):
                cells.setdefault(cell_id(lat, lon), {})
    site_cells: dict[int, dict] = {}
    for v in validation:
        cid = cell_id(v["lat"], v["lon"])
        site_cells.setdefault(cid, v)  # first site wins if two share a 0.5 deg cell
        cells[cid] = {}
    ids = sorted(cells)
    rows = []
    for cid in ids:
        lat, lon = cell_centre(cid)
        c = synth_cell(lat, lon)
        v = site_cells.get(cid)
        if v is not None:
            c.update(water_frac=0.0, builtup_frac=0.0)
            if v["kind"] == "negative":
                c.update(negative_features(v["name"]))
            else:
                near = min(ANALOGS.values(), key=lambda a: haversine_km(a[1], a[2], v["lat"], v["lon"]))
                if haversine_km(near[1], near[2], v["lat"], v["lon"]) < 80:
                    c.update(near[3])
            c["column_mass_gcm2"] = 1033.0 * math.exp(-c["elevation_m"] / 8400)
            c["ati"] = (1 - c["albedo"]) / c["dt_k"]
        rows.append(c)
    data = {k: np.array([r.get(k, np.nan) for r in rows], dtype="float64") for k in rows[0]}
    edges = np.percentile(data["ati"], [20, 40, 60, 80])
    cls = 1 + np.searchsorted(edges, data["ati"])
    for i, _cid in enumerate(ids):
        data["ti_class"][i] = rows[i]["ti_class"] if rows[i]["ti_class"] else cls[i]
    data["cell_id"] = np.array(ids, dtype="float64")
    code = {v: k for k, v in CONTINENT_CODES.items()}
    data["continent"] = np.array([code[mock_continent(*cell_centre(c))] for c in ids], dtype="float64")
    return data, site_cells


MOCK_TARGET_VALUES = {
    # target_id: F1 K, F2 K, F3 class, F4 frac, F5 m, F9 ice, F10 deg (F6/F7/F8/F13 from seed priors)
    "moon_shackleton_connecting_ridge": dict(F1=180, F2=90, F3=2, F4=0.35, F5=1800, F9=0.6, F10=0.55, F11=0.0),
    "moon_malapert_massif": dict(F1=170, F2=110, F3=2, F4=0.25, F5=2500, F9=0.3, F10=4.0, F11=0.0),
    "moon_haworth": dict(F1=110, F2=60, F3=2, F4=0.3, F5=2000, F9=0.9, F10=2.5, F11=0.0),
    "mars_jezero": dict(F1=215, F2=85, F3=3, F4=0.85, F5=600, F9=0.0, F10=72, F11=17),
    "mars_gale": dict(F1=220, F2=80, F3=3, F4=0.6, F5=2500, F9=0.0, F10=85, F11=20),
    "mars_arcadia_ap1": dict(F1=200, F2=70, F3=3, F4=0.95, F5=150, F9=1.0, F10=50, F11=19),
}


def write(name: str, obj: dict) -> None:
    p = OUT / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, indent=1, ensure_ascii=False) + "\n")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    factors = load("factors")
    profiles = load("profiles")
    priors = load("target_priors")["targets"]
    rtargets = json.loads((INPUTS / "targets.json").read_text())
    rgaps = json.loads((INPUTS / "gaps.json").read_text())
    validation = load_validation()
    units = {f["id"]: f["units"] for f in factors["factors"]}

    # --- earth_features (sparse) ---
    data, site_cells = build_earth(validation)
    cols = [dict(name=n, factor=f, dtype=d, scale=s, add_offset=o, units=u, values=data[n], source="MOCK synthetic",
                 codes=COLUMN_CODES.get(n)) for n, f, d, s, o, u in EARTH_COLUMNS]
    write_grid(OUT / "earth_features", "earth", "sparse", cols, mock=True)
    earth = read_grid(OUT / "earth_features.json")  # score on the quantized values, like the browser
    known_cells = {cid: v["name"] for cid, v in site_cells.items() if v["kind"] == "positive"}

    # --- moon/mars grids (sparse mock: one cell per target anchor) ---
    for body in ("moon", "mars"):
        rows = []
        for t in (t for t in rtargets["targets"] if t["body"] == body):
            v = MOCK_TARGET_VALUES.get(t["id"], {})
            pr = priors[t["id"]]
            elev = t["values"].get("elevation", {}).get("value")
            rows.append(dict(cell_id=cell_id(t["anchor"]["lat"], t["anchor"]["lon"]), ts_mean_k=v.get("F1", 200),
                             dt_k=v.get("F2", 80), ti_class=v.get("F3", 3), slope_lt5_frac=v.get("F4", 0.5),
                             relief_m=v.get("F5", 1000), lith_class=pr["lith_class"], ice_index=v.get("F9", 0.2),
                             noon_sun_elev_deg=v.get("F10", 10), column_mass_gcm2=v.get("F11", 0.0),
                             geomorph_flags=pr["geomorph_flags"],
                             elevation_m=elev if isinstance(elev, (int, float)) else 0))
        uniq = {r["cell_id"]: r for r in rows}
        rows = [uniq[k] for k in sorted(uniq)]
        cols = [dict(name=n, factor=f, dtype=d, scale=s, add_offset=o, units=u,
                     values=np.array([r[n] for r in rows], dtype="float64"), source="MOCK synthetic")
                for n, f, d, s, o, u in PLANET_COLUMNS]
        write_grid(OUT / f"{body}_grid", body, "sparse", cols, mock=True)

    # --- targets.json: Researcher file + engine fields ---
    tvals: dict[str, dict] = {}
    out_targets = []
    for t in rtargets["targets"]:
        pr = priors[t["id"]]
        v = dict(MOCK_TARGET_VALUES.get(t["id"], {}))
        v.update(F6=pr["lith_class"], F7=0.0, F8=1.0, F13=pr["geomorph_flags"])
        clips = clip_targets(v, earth) if t["id"] in MOCK_TARGET_VALUES else {}
        feats = {}
        for fid in [f"F{i}" for i in range(1, 14)]:
            val = v.get(fid)
            ts, gap = clips.get(fid, (val, 0.0 if val is not None else None))
            feats[fid] = dict(value=val, t_star=ts, gap=None if gap is None else round(gap, 3), units=units[fid],
                              source="MOCK" if val is not None else "pending")
        tvals[t["id"]] = v
        card = {"gravity_ms2": 1.62 if t["body"] == "moon" else 3.73}
        ill = t["values"].get("illumination", {}).get("value")
        if ill is not None:
            card["illumination"] = ill
        out_targets.append(dict(t, short_name=pr["short_name"], description=pr["description"], status=pr["status"], window_offset=pr["window_offset"], citations=pr["citations"],
                                features=feats, card=card))
    eref = earth_reference(earth, "MOCK: synthetic grid (not real data)", "MOCK synthetic Earth grid")
    write("targets.json", dict(rtargets, contract_version=CONTRACT_VERSION, mock=True, targets=out_targets,
                               earth_reference=eref, scoring_constants=scoring_constants(earth, profiles)))
    write("profiles.json", profiles)
    write("factors.json", factors)
    write("gaps.json", dict(rgaps, contract_version=CONTRACT_VERSION, mock=False))

    # --- portfolios for targets with mock values ---
    prof_by_id = {p["id"]: p for p in profiles["profiles"]}
    lat_c = np.array([cell_centre(int(c))[0] for c in earth["cell_id"]])
    lon_c = np.array([cell_centre(int(c))[1] for c in earth["cell_id"]])
    idx_of = {int(c): i for i, c in enumerate(earth["cell_id"])}
    aw = area_weights(earth)
    mc = profiles["defaults"]["monte_carlo"]
    results: dict[str, list] = {slug(v["name"]): [] for v in validation}
    for tid in MOCK_TARGET_VALUES:
        body = tid.split("_")[0]
        for pid, prof in prof_by_id.items():
            if body not in prof["bodies"]:
                continue
            w = prof["weights"]
            s = factor_scores(earth, tvals[tid], body)
            core, total = aggregate(s, w)
            mask0 = hard_filter_mask(earth, prof)
            gate = candidate_gate(earth, body, profiles)  # Mars gate (contract v1.2, research.md §8): acts as a hard filter
            mask = mask0 & gate
            total_f = np.where(mask, total, 0.0)
            median = float(weighted_quantile(total_f[mask], aw[mask], 0.5)[0]) if mask.any() else 0.0
            tf_rank = np.where(gate, total_f, np.nan)  # gate-failing cells leave the ranking (Mars)
            pct = 100.0 * weighted_pct_rank(tf_rank, aw)  # area-weighted rank among land cells (filtered = 0)
            thr = weighted_quantile(tf_rank, aw, [0.5, 0.95, 0.99])
            freq = top_frac_freq(s, w, mask, aw, draws=mc["draws"], alpha_scale=mc["dirichlet_alpha_scale"],
                                 top_frac=mc["robust_top_frac"], seed=mc["seed"], valid=gate)
            # candidate pool: top-N per factor (w>0) with S >= median, then NMS
            cand_idx = set()
            for f, wf in w.items():
                if wf <= 0:
                    continue
                ok = np.where(mask & (total_f >= median))[0]
                # canonical tie-break (contract 3.2.7): stable sort s_f desc, then S desc, then cell index asc
                o = np.lexsort((ok, -total_f[ok], -s[f][ok]))
                cand_idx.update(ok[o][: profiles["defaults"]["candidates_top_n_per_factor"]].tolist())
            pool = sorted(cand_idx, key=lambda i: (-total_f[i], i))
            kept: list[int] = []
            for i in pool:
                if all(haversine_km(lat_c[i], lon_c[i], lat_c[j], lon_c[j]) > prof["nms_radius_km"] for j in kept):
                    kept.append(i)
            clips = clip_targets(tvals[tid], earth)

            def site(i: int) -> dict:
                cid = int(earth["cell_id"][i])
                name = known_cells.get(cid, f"Candidate cell {lat_c[i]:.2f}, {lon_c[i]:.2f}")
                sid = slug(name) if cid in known_cells else f"cell_{cid}"
                fs = {f: round(float(s[f][i]), 4) for f in CORE + SECONDARY}
                near_known = min((haversine_km(lat_c[i], lon_c[i], *cell_centre(k)) for k in known_cells), default=1e9)
                return dict(site_id=sid, name=name, lat=float(lat_c[i]), lon=float(lon_c[i]), cell_id=cid,
                            score=round(float(total_f[i]), 4), score_core=round(float(core[i]), 4),
                            earth_percentile=round(float(pct[i]), 2), factor_scores=fs,
                            covers=[f for f in CORE if w[f] > 0 and fs[f] >= prof["theta"]],
                            gaps={f: round(g, 3) for f, (_t, g) in clips.items() if g > 0},
                            robustness=dict(top5_freq=round(float(freq[i]), 3),
                                            robust=bool(freq[i] >= mc["robust_min_freq"])),
                            country=None, admin1=None,
                            logistics=dict(travel_time_min=round(float(earth["travel_time_min"][i]), 1),
                                           within_6h=bool(earth["travel_time_min"][i] <= 360),
                                           continent=CONTINENT_CODES.get(int(earth["continent"][i])),
                                           airport_km=round(float(earth["airport_km"][i]), 1)),
                            known_analog=known_cells.get(cid), candidate=cid not in known_cells and near_known > 300)

            pool_sites = [site(i) for i in kept[:200]]
            variants = build_variants(pool_sites, w, prof["theta"], profiles["defaults"]["portfolio_max_sites"])
            active = [f for f in CORE if w[f] > 0]
            universe = sorted({f for f in active if any(ps["factor_scores"][f] >= prof["theta"] for ps in pool_sites)},
                              key=lambda x: int(x[1:]))
            hist, bins = np.histogram(total_f[mask], bins=20, range=(0, 1))
            write(f"portfolios/{tid}_{pid}.json", dict(
                contract_version=CONTRACT_VERSION, mock=True, target_id=tid, profile_id=pid, weights=w,
                theta=prof["theta"], universe=universe, uncoverable=[f for f in active if f not in universe],
                dropped_factors=dropped_factors(s, w), variants=variants, top_cells=pool_sites[:25],
                score_histogram=dict(bins=[round(b, 3) for b in bins.tolist()], counts=hist.astype(int).tolist()),
                monte_carlo=dict(draws=mc["draws"], robust_top_frac=mc["robust_top_frac"],
                                 robust_min_freq=mc["robust_min_freq"], seed=mc["seed"], area_weighting="cos_lat"),
                earth_thresholds=dict(median=round(float(thr[0]), 4), top5=round(float(thr[1]), 4),
                                      top1=round(float(thr[2]), 4))))
            # validation: positives on matching body + purpose; negatives on every evaluated pair
            for v in validation:
                match = v["kind"] == "negative" or (v["body_analog"] in (body, "both") and pid in v["mission_purposes"])
                if not match:
                    continue
                i = idx_of[cell_id(v["lat"], v["lon"])]
                results[slug(v["name"])].append(dict(target_id=tid, profile_id=pid, percentile=round(float(pct[i]), 2),
                                                     in_top5=bool(pct[i] >= 95), in_top1=bool(pct[i] >= 99),
                                                     status="scored" if mask[i] else "gate_excluded" if mask0[i] else
                                                     "land_filter_excluded" if earth["water_frac"][i] >= 0.5 else
                                                     "hard_filter_excluded"))

    pos = [r for v in validation if v["kind"] == "positive" for r in results[slug(v["name"])]]
    aucs = []
    for key in sorted({(r["target_id"], r["profile_id"]) for r in pos}):
        pp = [r["percentile"] for r in pos if (r["target_id"], r["profile_id"]) == key]
        nn = [r["percentile"] for v in validation if v["kind"] == "negative" for r in results[slug(v["name"])]
              if (r["target_id"], r["profile_id"]) == key]
        if pp and nn:
            aucs.append(sum((a > b) + 0.5 * (a == b) for a in pp for b in nn) / (len(pp) * len(nn)))
    write("validation.json", dict(
        contract_version=CONTRACT_VERSION, mock=True, frozen_commit=None, source="docs/validation.csv",
        summary=dict(n_known=sum(v["kind"] == "positive" for v in validation),
                     n_negative=sum(v["kind"] == "negative" for v in validation), n_evaluations=len(pos),
                     pct_top5=round(sum(r["in_top5"] for r in pos) / max(len(pos), 1), 4),
                     pct_top1=round(sum(r["in_top1"] for r in pos) / max(len(pos), 1), 4),
                     rank_auc=round(float(np.mean(aucs)), 4) if aucs else None),
        sites=[dict(v, cell_id=cell_id(v["lat"], v["lon"]), results=results[slug(v["name"])]) for v in validation],
        new_candidates=[]))

    for v in validation:
        if v["kind"] != "positive":
            continue
        cid = cell_id(v["lat"], v["lon"])
        i = idx_of[cid]
        feats = {c[0]: (None if np.isnan(earth[c[0]][i]) else round(float(earth[c[0]][i]), 4))
                 for c in EARTH_COLUMNS if c[0] != "cell_id"}
        write(f"sites/{slug(v['name'])}.json", dict(
            contract_version=CONTRACT_VERSION, mock=True, site_id=slug(v["name"]), name=v["name"], lat=v["lat"],
            lon=v["lon"], cell_id=cid, country=None, admin1=None,
            continent=CONTINENT_CODES.get(int(earth["continent"][idx_of[cid]])), summary=v["why"], known_analog=v["name"],
            earth_features=feats, drilldown={}, best_for=[], citations=[v["citation_url"]], attribution=[]))

    write("provenance.json", dict(contract_version=CONTRACT_VERSION, mock=True, layers=[dict(
        id="mock-synthetic", body="earth", factors=CORE + SECONDARY, dataset="MOCK synthetic values",
        provider="Analog Portfolio team", agency_group="other", url="https://github.com/NetRunnerXD/analog-portfolio",
        version="0", accessed="2026-10-08", native_resolution="0.5 deg", license="Apache-2.0", citation="n/a",
        sha256=None, how_used="Front-end development only; replaced by real layers", slope_baseline_m=None)],
        pipeline=dict(git_sha=None, run_at="mock", python="3")))
    print(f"mock assets written to {OUT} ({len(earth['cell_id'])} Earth cells, {len(validation)} validation sites)")


if __name__ == "__main__":
    main()
