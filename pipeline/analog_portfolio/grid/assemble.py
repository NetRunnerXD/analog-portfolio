"""Assemble the Earth feature cube (contract EARTH_COLUMNS) from data/grids/*.nc + raw NASA POWER boxes.

Land = WorldCover water_frac < 0.5 (fallback 1 - Natural Earth land_frac). Every statistic is cos(lat) area-weighted.
Run: python -m analog_portfolio.grid.assemble earth
Writes data/interim/earth_cube.npz (land cells only, cell_id order) + earth_cube.json (sources, gaps, stats).
"""
from __future__ import annotations

import json
import sys

import numpy as np

from ..config import GRIDS, INTERIM
from . import NCOLS
from .area import cell_weights, weighted_quantile
from .columns import EARTH_COLUMNS
from .io import read_var
from .power import MONTHS, diurnal_amplitude, n_boxes, power_grid

HOURS = ("TS_00", "TS_05", "TS_06", "TS_13", "TS_14")
LAND_BOXES = 459  # 10x10 deg POWER boxes containing any Natural Earth land (p1_download_power_hourly.py)
ANTARCTIC_AI_FILL = 0.03  # Global-AI v3.1 has no Antarctica; polar desert -> hyper-arid class (P1 assumption, documented)


def _nc(name, var):
    f = GRIDS / f"{name}.nc"
    return read_var(f, var) if f.exists() else None


def _land_boxes_complete(param: str, need: int) -> bool:
    return n_boxes(param) >= need


def build_earth() -> dict:
    src: dict[str, str] = {}
    missing: list[str] = []
    G: dict[str, np.ndarray] = {}
    water = _nc("earth_barren", "water_frac")
    lf = _nc("earth_land_frac", "land_frac")
    G["water_frac"] = np.where(np.isfinite(water), water, 1 - np.nan_to_num(lf)) if water is not None else 1 - lf
    src["water_frac"] = "ESA WorldCover 2021 (TAE earth_barren) water + ocean nodata; fallback 1 - Natural Earth land_frac"
    land = G["water_frac"] < 0.5
    # F1 mean skin temperature: POWER TS ANN (raw boxes) + 273.15
    if n_boxes("TS") >= 648:
        G["ts_mean_k"] = power_grid("TS")["ANN"] + 273.15
        src["ts_mean_k"] = "NASA POWER TS climatology 2001-2020 ANN (raw boxes, bilinear) + 273.15"
    elif (a := _nc("earth_ts_mean_k", "ts_mean_k")) is not None:
        G["ts_mean_k"] = a; src["ts_mean_k"] = "TAE earth_ts_mean_k"
    # F2 diurnal amplitude: hourly-LST POWER TS_hh climatology, mean over months of (max_h - min_h)
    if all(n_boxes(h) >= LAND_BOXES for h in HOURS):
        G["dt_k"] = diurnal_amplitude(HOURS)
        src["dt_k"] = f"NASA POWER hourly-LST TS climatology {', '.join(HOURS)} (community AG): mean over months of max_h - min_h"
    else:
        missing.append("dt_k (POWER TS_hh download in progress)")
    # albedo / ATI / ti_class (F3)
    if n_boxes("ALLSKY_SRF_ALB") >= 648:
        G["albedo"] = power_grid("ALLSKY_SRF_ALB")["ANN"]; src["albedo"] = "NASA POWER ALLSKY_SRF_ALB ANN"
    elif (a := _nc("earth_ti_class", "albedo")) is not None:
        G["albedo"] = a; src["albedo"] = "TAE earth_ti_class.albedo"
    else:
        missing.append("albedo (POWER ALLSKY_SRF_ALB pending)")
    w = cell_weights()
    if "albedo" in G and "dt_k" in G:
        with np.errstate(all="ignore"):
            G["ati"] = (1 - G["albedo"]) / np.maximum(G["dt_k"], 0.5)
        ok = land & np.isfinite(G["ati"])
        edges = weighted_quantile(G["ati"][ok], w[ok], [0.2, 0.4, 0.6, 0.8])
        G["ti_class"] = np.where(np.isfinite(G["ati"]), 1 + np.searchsorted(edges, G["ati"]), np.nan)
        src["ti_class"] = f"within-Earth area-weighted land quintiles of ATI=(1-albedo)/dT, edges {np.round(edges, 5).tolist()}"
    else:
        missing.append("ati/ti_class (needs albedo + dt_k)")
    # F4 slope (Copernicus GLO-90 pass, TAE)
    for v in ("slope_lt5_frac", "slope_lt8_frac", "slope_mean_deg"):
        a = _nc("earth_slope_lt5_frac", v)
        if a is not None:
            G[v] = a; src[v] = "Copernicus DEM GLO-90 overview pass (TAE earth_slope_lt5_frac)"
        else:
            missing.append(f"{v} (Copernicus slope pass in progress)")
    G["relief_m"] = _nc("earth_relief_m", "relief_m"); src["relief_m"] = "ETOPO 2022 60 arc-sec, mean P95-P5 of 0.25 deg sub-blocks (TAE)"
    G["elevation_m"] = _nc("earth_relief_m", "elev_land_mean_m"); src["elevation_m"] = "ETOPO 2022 land mean (TAE)"
    lith = _nc("earth_lith_class", "lith_class").astype("float64")
    G["lith_class"] = np.where(lith == 0, np.nan, lith)  # GLiM code 0 = 'nd' (no data) -> NaN, never a rock class
    src["lith_class"] = "GLiM dominant class (TAE); code 0 (nd, no data) mapped to NaN"
    ai = _nc("earth_aridity_land", "aridity_index")  # land pixels only (ET0 != 65535); v1.2 fix
    ai_src = "Global-AI v3.1 land-pixel mean (P1 earth_aridity_land; ET0 == 65535 ocean pixels masked)"
    if ai is None:
        ai = _nc("earth_aridity_index", "aridity_index"); ai_src = "Global-AI v3.1 (TAE, ocean zeros NOT masked)"
    antarctic = np.zeros_like(land); antarctic[300:, :] = True
    G["aridity_index"] = np.where(np.isfinite(ai), ai, np.where(antarctic & land, ANTARCTIC_AI_FILL, np.nan))
    src["aridity_index"] = f"{ai_src}; Antarctic land (no coverage) filled with {ANTARCTIC_AI_FILL} (hyper-arid polar desert, P1 assumption)"
    G["barren_frac"] = _nc("earth_barren", "barren_frac_of_land")
    src["barren_frac"] = "WorldCover bare/sparse + snow/ice fraction of land pixels (TAE barren_frac_of_land); Antarctica 1"
    G["builtup_frac"] = _nc("earth_barren", "builtup_frac"); src["builtup_frac"] = "WorldCover built-up fraction (TAE)"
    pf = _nc("earth_permafrost", "permafrost_frac")
    cold = (G["ts_mean_k"] < 273.15).astype(float) if "ts_mean_k" in G else np.full_like(pf, np.nan)
    G["ice_index"] = np.where(np.isfinite(pf), pf, cold)
    G["permafrost_frac"] = pf; src["permafrost_frac"] = "ESA CCI Permafrost v5.0 PFR fraction (P1); NaN = no CCI value (gate reads 0)"
    G["moss_lichen_frac"] = _nc("earth_moss_lichen", "moss_lichen_frac_of_land")
    src["moss_lichen_frac"] = "WorldCover 2021 moss & lichen (class 100) fraction of land pixels (P1); Antarctic fallback 0"
    src["ice_index"] = "ESA CCI Permafrost v5.0 PFR fraction (P1); where no CCI value (25N-60S band, ice sheets, gaps): 1 if POWER TS < 273.15 K else 0"
    for col, (f, v) in dict(noon_sun_elev_deg=("earth_noon_sun_elev_deg", "noon_sun_elev_deg"),
                            column_mass_gcm2=("earth_column_mass_gcm2", "column_mass_gcm2"),
                            cutoff_rigidity_gv=("earth_cutoff_rigidity_gv", "cutoff_rigidity_gv"),
                            geomorph_flags=("earth_geomorph_flags", "geomorph_flags"),
                            travel_time_min=("earth_travel_time", "travel_time_min"),
                            airport_km=("earth_airport_km", "airport_km")).items():
        G[col] = _nc(f, v); src[col] = f"{f}.{v}"
    if n_boxes("ALLSKY_SFC_UV_INDEX") >= 648:
        G["uv_index"] = power_grid("ALLSKY_SFC_UV_INDEX")["ANN"]; src["uv_index"] = "NASA POWER ALLSKY_SFC_UV_INDEX ANN"
    elif (a := _nc("earth_uv_index", "uv_index")) is not None:
        G["uv_index"] = a; src["uv_index"] = "TAE earth_uv_index"
    else:
        missing.append("uv_index (POWER pending)")
    # land cells -> sparse cube
    rows, cols = np.nonzero(land)
    cube = {"cell_id": (rows * NCOLS + cols).astype("int64")}
    for name, *_ in EARTH_COLUMNS:
        if name == "cell_id":
            continue
        a = G.get(name)
        cube[name] = a[rows, cols].astype("float64") if a is not None else np.full(rows.size, np.nan)
    aw = w[rows, cols]
    stats = {}
    for name in cube:
        if name == "cell_id":
            continue
        x = cube[name]; ok = np.isfinite(x)
        if ok.any():
            q = weighted_quantile(x[ok], aw[ok], [0.005, 0.5, 0.995])
            stats[name] = dict(n_valid=int(ok.sum()), valid_area_frac=round(float(aw[ok].sum() / aw.sum()), 4),
                               min=float(x[ok].min()), p0_5=float(q[0]), p50=float(q[1]), p99_5=float(q[2]), max=float(x[ok].max()))
        else:
            stats[name] = dict(n_valid=0)
    return dict(cube=cube, meta=dict(n_land_cells=int(rows.size), land_area_frac_of_globe=round(float(aw.sum() / w.sum()), 4),
                                     sources=src, missing=missing, stats=stats))


def main(which: str = "earth") -> None:
    INTERIM.mkdir(parents=True, exist_ok=True)
    r = build_earth()
    np.savez_compressed(INTERIM / "earth_cube.npz", **r["cube"])
    (INTERIM / "earth_cube.json").write_text(json.dumps(r["meta"], indent=1) + "\n")
    m = r["meta"]
    print("land cells", m["n_land_cells"], "land area frac", m["land_area_frac_of_globe"])
    print("missing:", m["missing"])
    for k, s in m["stats"].items():
        if s.get("n_valid"):
            print(f"  {k:20s} n={s['n_valid']:6d} area={s['valid_area_frac']:.3f} min={s['min']:.4g} p0.5={s['p0_5']:.4g} p50={s['p50']:.4g} p99.5={s['p99_5']:.4g} max={s['max']:.4g}")
        else:
            print(f"  {k:20s} MISSING")


if __name__ == "__main__":
    main(*sys.argv[1:])
