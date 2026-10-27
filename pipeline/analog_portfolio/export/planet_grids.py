"""Moon / Mars feature grids for reverse search and the twin viewer (contract v1.2).

Columns are quantised to uint8 per column (scale and add_offset in the manifest, 255 = nodata), stored column-major
so identical/near-constant runs compress well. Size policy (Sounak 2026-10-08): ship full 0.5 deg grids if all of
web/public/data stays <= 10 MB; otherwise Moon = polar subset (|lat| >= 60 deg) at 0.5 deg + 1 deg global grid,
Mars = 1 deg global grid. GitHub Pages only gzips text MIME types, so .bin sizes are counted raw.

Derived per-cell F13 flags (documented rules, no hand-picking):
  Moon: 1 impact (lith code 17), 16 massif (relief >= area-weighted P90 of the body), 32 cold trap (PSR fraction > 0)
  Mars: 1 impact (lith 17), 2 cave candidate (MGC3 count > 0), 8 buried ice (ice_index >= 0.5), 16 massif (P90 relief),
        64 volcanic (lith codes 1-3: GLiM vb / vi / va)
"""
from __future__ import annotations

import numpy as np

from ..config import GRIDS
from ..grid.area import cell_weights, weighted_quantile
from ..grid.binary import GRID_05, GRID_1, write_grid
from ..grid.io import read_var

# name, factor, units, kind (cont | cat | frac | flags)
COLS = [("ts_mean_k", "F1", "K", "cont"), ("dt_k", "F2", "K", "cont"), ("ti_class", "F3", "class 1-5", "cat"),
        ("slope_lt5_frac", "F4", "fraction", "frac"), ("relief_m", "F5", "m", "cont"), ("lith_class", "F6", "lithology code", "cat"),
        ("ice_index", "F9", "index 0-1", "frac"), ("noon_sun_elev_deg", "F10", "deg", "cont"),
        ("column_mass_gcm2", "F11", "g/cm^2", "cont"), ("geomorph_flags", "F13", "bitmask", "flags"),
        ("elevation_m", None, "m", "cont")]
SRC = {"ts_mean_k": ("ts_mean_k", "ts_mean_k"), "dt_k": ("dt_k", "dt_k"), "ti_class": ("ti_class", "ti_class"),
       "slope_lt5_frac": ("slope_lt5_frac", "slope_lt5_frac"), "relief_m": ("relief_m", "relief_m"),
       "lith_class": ("lith_class", "lith_class"), "ice_index": ("ice_index", "ice_index"),
       "noon_sun_elev_deg": ("noon_sun_elev_deg", "noon_sun_elev_deg"), "column_mass_gcm2": ("column_mass_gcm2", "column_mass_gcm2"),
       "elevation_m": ("relief_m", "elev_mean_m")}


def body_layers(body: str) -> dict[str, np.ndarray]:
    G = {k: read_var(GRIDS / f"{body}_{f}.nc", v) for k, (f, v) in SRC.items()}
    G["lith_class"] = np.where(G["lith_class"] == 0, np.nan, G["lith_class"])  # code 0 = 'nd' (no data), not a rock class
    w = cell_weights()
    rel = G["relief_m"]
    ok = np.isfinite(rel)
    p90 = float(weighted_quantile(rel[ok], w[ok], 0.9)[0])
    lith = np.nan_to_num(G["lith_class"], nan=-1)
    flags = np.where(lith == 17, 1, 0) | np.where(np.nan_to_num(rel) >= p90, 16, 0)
    if body == "moon":
        psr = np.nan_to_num(read_var(GRIDS / "moon_ice_index.nc", "psr_frac"))
        flags |= np.where(psr > 0, 32, 0)
    else:
        caves = np.nan_to_num(read_var(GRIDS / "mars_caves.nc", "cave_count"))
        flags |= np.where(caves > 0, 2, 0) | np.where(np.nan_to_num(G["ice_index"]) >= 0.5, 8, 0)
        flags |= np.where((lith >= 1) & (lith <= 3), 64, 0)
    G["geomorph_flags"] = flags.astype(float)
    return G


def to_1deg(a: np.ndarray, kind: str) -> np.ndarray:
    b = a.reshape(180, 2, 360, 2).transpose(0, 2, 1, 3).reshape(180, 360, 4)
    if kind == "flags":
        return np.bitwise_or.reduce(np.nan_to_num(b).astype(np.int64), axis=2).astype(float)
    if kind == "cat":  # mode of the finite sub-cells (lowest code on ties)
        out = np.full((180, 360), np.nan)
        fin = np.isfinite(b)
        bb = np.where(fin, b, -1).astype(int)
        best = np.zeros((180, 360), int)
        for k in range(4):
            cnt = (bb == bb[..., k:k + 1]).sum(axis=2) * (bb[..., k] >= 0)
            better = (cnt > best) | ((cnt == best) & (cnt > 0) & (bb[..., k] < np.where(np.isfinite(out), out, 1e9)))
            out = np.where(better, bb[..., k], out); best = np.where(better, cnt, best)
        return out
    with np.errstate(all="ignore"):
        return np.nanmean(b, axis=2)  # cos(lat) is ~equal within a 1 deg block


def quant(values: np.ndarray, kind: str) -> tuple[float, float]:
    """uint8 scale/add_offset for a column (raw 0..254, 255 = nodata)."""
    if kind in ("cat", "flags"):
        return 1.0, 0.0
    if kind == "frac":
        return 0.004, 0.0
    v = values[np.isfinite(values)]
    lo, hi = float(np.floor(v.min())), float(np.ceil(v.max()))
    scale = float(f"{max((hi - lo) / 254.0, 1e-6):.3g}")
    while lo + 254 * scale < hi:
        scale = float(f"{scale * 1.01:.3g}")
    return scale, lo


def columns(G: dict, sel: np.ndarray | None, cell_ids: np.ndarray | None, src: str) -> list[dict]:
    cols = []
    if cell_ids is not None:
        cols.append(dict(name="cell_id", factor=None, dtype="uint32", scale=1, add_offset=0, units="cell id (row*720+col)",
                         values=cell_ids.astype("float64"), source=src))
    for n, f, u, kind in COLS:
        v = G[n] if sel is None else G[n][sel]
        v = v.ravel()
        sc, off = quant(v, kind)
        cols.append(dict(name=n, factor=f, dtype="uint8", scale=sc, add_offset=off, units=u, values=v, source=src))
    return cols


def write_planet_grids(out_dir, full: bool) -> dict[str, int]:
    """Writes moon_grid*, mars_grid* into out_dir; returns {file: bytes}."""
    sizes = {}
    src = "data/grids (Project 1 / TAE extractions; see provenance.json), quantised uint8"
    for body in ("moon", "mars"):
        G = body_layers(body)
        if full:
            write_grid(out_dir / f"{body}_grid", body, "dense", columns(G, None, None, src), grid=GRID_05,
                       extra={"subset": "global, 0.5 deg"})
            continue
        G1 = {n: to_1deg(G[n], kind) for n, _f, _u, kind in COLS}
        if body == "moon":
            rows = np.r_[0:60, 300:360]
            sel = np.zeros((360, 720), bool); sel[rows] = True
            cids = np.flatnonzero(sel.ravel())
            write_grid(out_dir / "moon_grid", "moon", "sparse", columns(G, sel, cids, src), grid=GRID_05,
                       extra={"subset": "polar |lat| >= 60 deg at 0.5 deg (rows 0-59 and 300-359)",
                              "companions": ["moon_grid_1deg.json"]})
            write_grid(out_dir / "moon_grid_1deg", "moon", "dense", columns(G1, None, None, src + "; 2x2 block mean / mode / OR"),
                       grid=GRID_1, extra={"subset": "global, 1 deg (cell index = row*360 + col)", "companions": ["moon_grid.json"]})
        else:
            write_grid(out_dir / "mars_grid", "mars", "dense", columns(G1, None, None, src + "; 2x2 block mean / mode / OR"),
                       grid=GRID_1, extra={"subset": "global, 1 deg (cell index = row*360 + col)"})
    for p in out_dir.glob("m*_grid*.bin"):
        sizes[p.name] = p.stat().st_size
    return sizes
