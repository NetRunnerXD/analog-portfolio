"""Target feature vectors for the 18 Researcher targets (pipeline/inputs/targets.json).

Moon (all targets poleward of 82 S): native 240 m polar products inside the target window
  (LOLA LDEM/LDSM 75S 240 m, PGDA LPSR + AVGVISIB 65S 240 m, USGS Ice Favorability Index),
  Diviner GCP 0.5 deg grids (ts_mean_k, dt_k, tmax/tmin) sampled over the window disc.
Mars: 0.5 deg grids sampled over the window disc, relief from MOLA MEGDR meg016 within 15 km,
  surface temperature / pressure from the MCD grids (or raw MCD files while the grids are pending).
Every value carries its source and any fallback, plus literature sanity checks.
Run: python -m analog_portfolio.extract.targets
"""
from __future__ import annotations

import glob
import json
import math
import re

import numpy as np

from .. import CONTRACT_VERSION
from ..config import GRIDS, INTERIM, RAW
from ..contract import REPO_ROOT, load
from ..grid import BODY_RADIUS_M, cell_id
from ..grid.io import read_var

RELIEF_RADIUS_KM = 15.0  # contract F5: P95-P5 within a 15 km radius (~30 km window, like Earth's 0.25 deg blocks)


def destination(lat, lon, bearing_deg, d_km, r_km):
    p1, l1, b, dd = math.radians(lat), math.radians(lon), math.radians(bearing_deg), d_km / r_km
    p2 = math.asin(math.sin(p1) * math.cos(dd) + math.cos(p1) * math.sin(dd) * math.cos(b))
    l2 = l1 + math.atan2(math.sin(b) * math.sin(dd) * math.cos(p1), math.cos(dd) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), ((math.degrees(l2) + 180) % 360) - 180


def disc_points(lat, lon, r_km, r_body_km, n=600):
    """Equal-area (sunflower) sample points inside a spherical cap of radius r_km."""
    k = np.arange(n) + 0.5
    rho = r_km * np.sqrt(k / n)
    th = np.degrees(k * math.pi * (3 - math.sqrt(5)))
    pts = [destination(lat, lon, t % 360, r, r_body_km) for r, t in zip(rho, th)]
    return np.array([p[0] for p in pts]), np.array([p[1] for p in pts])


def sample_grid(arr, lats, lons, how="mean"):
    v = np.array([arr.flat[cell_id(a, o)] for a, o in zip(lats, lons)], float)
    v = v[np.isfinite(v)]
    if v.size == 0:
        return None
    if how == "mode":
        vals, cnt = np.unique(np.round(v), return_counts=True)
        return int(vals[np.argmax(cnt)])
    if how == "max":
        return float(v.max())
    if how == "min":
        return float(v.min())
    return float(v.mean())


def _gc_km(lat1, lon1, lat2, lon2, r_km):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return 2 * r_km * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def polar_window(path, lat, lon, r_km, scale=1.0, offset=0.0):
    """Pixels of a polar-stereographic raster whose centres lie within r_km (great circle) of lat/lon."""
    import rasterio
    from pyproj import CRS, Transformer

    with rasterio.open(path) as d:
        crs = CRS.from_user_input(d.crs)
        fwd = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
        inv = Transformer.from_crs(crs, crs.geodetic_crs, always_xy=True)
        x, y = fwd.transform(lon, lat)
        row, col = d.index(x, y)
        h = int(math.ceil(r_km * 1000 * 1.1 / abs(d.transform.a))) + 2
        r0, c0 = max(row - h, 0), max(col - h, 0)
        a = d.read(1, window=((r0, min(row + h + 1, d.height)), (c0, min(col + h + 1, d.width)))).astype("float64")
        nod = d.nodata
        rr, cc = np.mgrid[r0:r0 + a.shape[0], c0:c0 + a.shape[1]]
        xs, ys = rasterio.transform.xy(d.transform, rr.ravel(), cc.ravel())
    lo, la = inv.transform(np.asarray(xs), np.asarray(ys))
    dist = _gc_km(lat, lon, la, lo, BODY_RADIUS_M["moon"] / 1000).reshape(a.shape)
    bad = ~np.isfinite(a) | ((a == nod) if nod is not None else False) | (a < -1e30)
    v = a * scale + offset
    v[bad] = np.nan
    return v, dist <= r_km, dist


_PRP = None


def _prp():
    """Diviner Polar Resource Product (south): annual temp_avg / temp_max / ice_depth on ~470 m triangles."""
    global _PRP
    if _PRP is None:
        f = INTERIM / "moon_prp_south.npz"
        if not f.exists():
            a = np.loadtxt(RAW / "moon/diviner_prp/dlre_prp_south.tab", delimiter=",", skiprows=1,
                           usecols=(9, 10, 11, 12, 13, 14), dtype="float32")
            np.savez_compressed(f, clon=a[:, 0], clat=a[:, 1], calt=a[:, 2], temp_avg=a[:, 3], temp_max=a[:, 4], ice_depth=a[:, 5])
        _PRP = dict(np.load(f))
    return _PRP


def moon_target(t, prior):
    R = BODY_RADIUS_M["moon"] / 1000
    lat, lon = t["anchor"]["lat"], t["anchor"]["lon"]
    off = prior.get("window_offset")
    if off:
        lat, lon = destination(lat, lon, off["bearing_deg"], off["distance_km"], R)
    r = float(t["sample_radius_km"])
    m = RAW / "moon"
    dem, inside, dist = polar_window(m / "lola_polar/ldem_75s_240m.lbl", lat, lon, r, 0.5, 0.0)
    slope, ins_s, _ = polar_window(m / "lola_polar/ldsm_75s_240m.lbl", lat, lon, r, 0.0015, 45.0)
    psr, ins_p, _ = polar_window(m / "pgda_illum/LPSR_65S_240M_201608.TIF", lat, lon, r, 2.5e-5, 0.5)
    vis, ins_v, _ = polar_window(m / "pgda_illum/AVGVISIB_65S_240M_201608.TIF", lat, lon, r, 4e-5, 0.0)
    ifi, ins_i, _ = polar_window(m / "ice_favorability/Moon_IceFavorabilityIndex_90S000E_591mp.tif", lat, lon, r)
    rel_win = dem[(dist <= RELIEF_RADIUS_KM) & np.isfinite(dem)]
    z = dem[inside & np.isfinite(dem)]
    s = slope[ins_s & np.isfinite(slope)]
    p = psr[ins_p & np.isfinite(psr)]
    v = vis[ins_v & np.isfinite(vis)]
    fi = ifi[ins_i & np.isfinite(ifi)]
    psr_frac = float((p > 0.5).mean())
    ifi_mean = float(fi.mean()) if fi.size else 0.0
    lats, lons = disc_points(lat, lon, r, R)
    G = lambda f, k: read_var(GRIDS / f, k)
    ts_gcp = sample_grid(G("moon_ts_mean_k.nc", "ts_mean_k"), lats, lons)
    P = _prp()
    sel = _gc_km(lat, lon, P["clat"].astype(float), P["clon"].astype(float), R) <= r
    tavg, tmx, idep = P["temp_avg"][sel], P["temp_max"][sel], P["ice_depth"][sel]
    ts = float(tavg.mean()) if tavg.size else ts_gcp
    dt = sample_grid(G("moon_dt_k.nc", "dt_k"), lats, lons)
    tmax = sample_grid(G("moon_dt_k.nc", "tmax_k"), lats, lons, "max")
    tmin = sample_grid(G("moon_dt_k.nc", "tmin_k"), lats, lons, "min")
    tmax_mean = sample_grid(G("moon_dt_k.nc", "tmax_k"), lats, lons)
    noon = sample_grid(G("moon_noon_sun_elev_deg.nc", "noon_sun_elev_deg"), lats, lons)
    flags = int(prior.get("geomorph_flags") or 0) | (32 if psr_frac >= 0.05 else 0)
    feats = {
        "ts_mean_k": ts, "dt_k": dt, "ti_class": None,
        "slope_lt5_frac": float((s < 5).mean()), "relief_m": float(np.percentile(rel_win, 95) - np.percentile(rel_win, 5)),
        "lith_class": int(prior["lith_class"]), "aridity_index": 0.0, "barren_frac": 1.0,
        "ice_index": float(max(min(1.0, psr_frac / 0.10), ifi_mean)), "noon_sun_elev_deg": noon,
        "column_mass_gcm2": 0.0, "cutoff_rigidity_gv": 0.0, "uv_index": None, "geomorph_flags": flags,
    }
    extras = {
        "illum_mean_pct": round(100 * float(v.mean()), 2), "illum_max_pct": round(100 * float(v.max()), 2),
        "illum_p95_pct": round(100 * float(np.percentile(v, 95)), 2),
        "psr_frac": round(psr_frac, 4), "ice_favorability_mean": round(ifi_mean, 4),
        "slope_lt8_frac": round(float((s < 8).mean()), 4), "slope_median_deg": round(float(np.median(s)), 2),
        "elev_mean_m": round(float(z.mean()), 1), "elev_min_m": round(float(z.min()), 1), "elev_max_m": round(float(z.max()), 1),
        "tmax_k_max": tmax, "tmax_k_mean": tmax_mean, "tmin_k_min": tmin, "n_px_240m": int(z.size),
        "ts_mean_k_gcp": ts_gcp, "prp_n": int(tavg.size),
        "prp_temp_avg_min_k": float(tavg.min()), "prp_temp_avg_max_k": float(tavg.max()),
        "prp_temp_max_mean_k": float(tmx.mean()), "prp_temp_max_p95_k": float(np.percentile(tmx, 95)),
        "prp_frac_cold_trap_lt110k_max": float((tmx < 110).mean()),
        "prp_frac_ice_stable_lt1m": float(((idep >= 0) & (idep < 1)).mean()),
        "prp_frac_ice_stable_surface": float(((idep >= 0) & (idep < 0.01)).mean()),
    }
    src = {
        "F1": "Diviner Polar Resource Product (south) annual temp_avg, mean of ~470 m triangles in window (GCP 0.5 deg value in extras)", "F2": "Diviner GCP 0.5 deg (moon_dt_k) over window disc",
        "F3": "NO DATA: Diviner rock-abundance/regolith-temperature products stop at 60 deg; F3 dropped for polar Moon targets (weights renormalised)",
        "F4": "LOLA LDSM 75S 240 m (240 m baseline), fraction < 5 deg in window", "F5": "LOLA LDEM 75S 240 m, P95-P5 within 15 km",
        "F6": "prior (contract/target_priors.json): highland anorthosite", "F7": "constant 0 (airless)", "F8": "constant 1 (no vegetation)",
        "F9": "max(min(1, LPSR PSR fraction/0.10), mean USGS IFI) in window", "F10": "analytic noon sun elevation (obliquity 1.54 deg)",
        "F11": "constant 0 (no atmosphere, no global field)", "F12": "not scored on the target side (capped)",
        "F13": "prior flags | cold_trap if PSR fraction >= 0.05",
    }
    return dict(centre=dict(lat=round(lat, 4), lon=round(lon, 4)), radius_km=r, features=feats, extras=extras, sources=src)


def _mcd_raw_at(lat, lon):
    """Provisional MCD values at a point from the raw web-interface dumps (used until TAE's mcd() grids exist)."""
    from scipy.interpolate import RegularGridInterpolator

    files = sorted(glob.glob(str(RAW / "mars/mcd/mcd_ls*_lt*.txt")))
    keys = {"ts": "Surface temperature (K)", "ps": "Surface pressure (Pa)"}
    per = {}
    for f in files:
        ls = int(re.search(r"ls(\d+)_", f).group(1))
        lt = int(re.search(r"lt(\d+)\.", f).group(1))
        blocks, cur, lats = {}, None, None
        for line in open(f):
            if line.startswith("### Columns 2+ are"):
                cur = line.split("are", 1)[1].strip(); blocks[cur] = []
            elif line.startswith("---- ||"):
                lats = np.array(line.split("||")[1].split(), float)
            elif "||" in line and cur:
                blocks[cur].append([float(line.split("||")[0])] + [float(x) for x in line.split("||")[1].split()])
        try:
            vals = {}
            for k, nm in keys.items():
                b = np.array(blocks[nm])
                vals[k] = float(RegularGridInterpolator((b[:, 0], lats), b[:, 1:])((lon, lat)))
        except (KeyError, ValueError, IndexError, TypeError):
            continue  # file still being written by the downloader
        per.setdefault(ls, {})[lt] = vals
    full = [ls for ls in per if len(per[ls]) == 24]
    w = {ls: (1 + 0.0934 * math.cos(math.radians(ls - 251.0))) ** -2 for ls in full}
    W = sum(w.values())
    ts_mean = sum(w[ls] * np.mean([per[ls][h]["ts"] for h in per[ls]]) for ls in full) / W
    amp = sum(w[ls] * (max(per[ls][h]["ts"] for h in per[ls]) - min(per[ls][h]["ts"] for h in per[ls])) for ls in full) / W
    ps = sum(w[ls] * np.mean([per[ls][h]["ps"] for h in per[ls]]) for ls in full) / W
    allts = [per[ls][h]["ts"] for ls in full for h in per[ls]]
    return dict(ts_mean_k=float(ts_mean), dt_k=float(amp), ps_pa=float(ps), tmax_k=float(max(allts)), tmin_k=float(min(allts)),
                ls_used=sorted(full), complete=len(full) == 12)


def mars_target(t, prior):
    R = BODY_RADIUS_M["mars"] / 1000
    lat, lon = t["anchor"]["lat"], t["anchor"]["lon"]
    off = prior.get("window_offset")
    if off:
        lat, lon = destination(lat, lon, off["bearing_deg"], off["distance_km"], R)
    r = float(t["sample_radius_km"])
    lats, lons = disc_points(lat, lon, r, R)
    G = lambda f, k: read_var(GRIDS / f, k)
    # relief + elevation from MOLA MEGDR meg016 (areoid topography, int16 MSB, rows from 90N, cols from 0E)
    topo = np.memmap(RAW / "mars/mola_megdr016/megt90n000eb.img", dtype=">i2", mode="r", shape=(2880, 5760))
    rr = int((90 - lat) * 16); cc = int((lon % 360) * 16); h = int(RELIEF_RADIUS_KM / (R * math.pi / 180 / 16)) + 3
    rows = np.arange(rr - h, rr + h + 1).clip(0, 2879)
    cols = np.arange(cc - 4 * h, cc + 4 * h + 1) % 5760
    sub = np.asarray(topo[np.ix_(rows, cols)], float)
    plat = 90 - (rows + 0.5) / 16
    plon = (cols + 0.5) / 16
    PL, PO = np.meshgrid(plat, plon, indexing="ij")
    d = _gc_km(lat, lon % 360, PL, PO, R)
    zr = sub[d <= RELIEF_RADIUS_KM]
    zw = sub[d <= r]
    zc = float(sub[np.unravel_index(np.argmin(d), d.shape)])
    have_mcd = (GRIDS / "mars_ts_mean_k.nc").exists() and (GRIDS / "mars_dt_k.nc").exists() and (GRIDS / "mars_column_mass_gcm2.nc").exists()
    if have_mcd:
        ts = sample_grid(G("mars_ts_mean_k.nc", "ts_mean_k"), lats, lons)
        dt = sample_grid(G("mars_dt_k.nc", "dt_k"), lats, lons)
        colm = sample_grid(G("mars_column_mass_gcm2.nc", "column_mass_gcm2"), lats, lons)
        tmax = sample_grid(G("mars_dt_k.nc", "tmax_k"), lats, lons, "max"); tmin = sample_grid(G("mars_dt_k.nc", "tmin_k"), lats, lons, "min")
        mcd_note = "MCD v6.2 grids (TAE mars_ts_mean_k / mars_dt_k / mars_column_mass_gcm2) over window disc"
        mcd_complete = True
    else:
        m = _mcd_raw_at(lat, lon)
        ts, dt, tmax, tmin, colm = m["ts_mean_k"], m["dt_k"], m["tmax_k"], m["tmin_k"], m["ps_pa"] / 3.721 / 10.0
        mcd_complete = m["complete"]
        mcd_note = f"PROVISIONAL: raw MCD v6.2 dumps, Ls {m['ls_used']} only (download {'complete' if m['complete'] else 'incomplete'}); recompute when grids exist"
    # F11: the MCD GCM grid (~3.75 x 6 deg) smooths topography (Gale: 619 Pa vs REMS ~750-900 Pa), so the column
    # uses the hydrostatic MOLA estimate p = 610 Pa * exp(-z / 11.1 km) over the window; MCD value kept in extras.
    ps_mcd = None if colm is None else colm * 37.21
    colm = 610.0 * math.exp(-float(zw.mean()) / 11100.0) / 3.721 / 10.0
    caves = sample_grid(G("mars_caves.nc", "cave_count"), lats, lons, "max") or 0
    lith_grid = sample_grid(G("mars_lith_class.nc", "lith_class"), lats, lons, "mode")
    flags = int(prior.get("geomorph_flags") or 0) | (2 if caves > 0 else 0)
    ice_src = sample_grid(G("mars_ice_index.nc", "ice_index_source"), lats, lons, "max")
    feats = {
        "ts_mean_k": ts, "dt_k": dt, "ti_class": sample_grid(G("mars_ti_class.nc", "ti_class"), lats, lons, "mode"),
        "slope_lt5_frac": sample_grid(G("mars_slope_lt5_frac.nc", "slope_lt5_frac"), lats, lons),
        "relief_m": float(np.percentile(zr, 95) - np.percentile(zr, 5)),
        "lith_class": int(prior["lith_class"]), "aridity_index": 0.0, "barren_frac": 1.0,
        "ice_index": sample_grid(G("mars_ice_index.nc", "ice_index"), lats, lons),
        "noon_sun_elev_deg": sample_grid(G("mars_noon_sun_elev_deg.nc", "noon_sun_elev_deg"), lats, lons),
        "column_mass_gcm2": colm, "cutoff_rigidity_gv": 0.0, "uv_index": None, "geomorph_flags": flags,
    }
    extras = {
        "elev_mean_m": round(float(zw.mean()), 1), "elev_min_m": float(zw.min()), "elev_max_m": float(zw.max()), "elev_centre_m": zc,
        "ps_baro_mola_pa": round(610.0 * math.exp(-float(zw.mean()) / 11100.0), 1),
        "tmax_k": tmax, "tmin_k": tmin, "ps_mcd_pa": None if ps_mcd is None else round(ps_mcd, 1),
        "ti_night_mean": sample_grid(G("mars_ti_class.nc", "ti_night"), lats, lons), "lith_class_grid_mode": lith_grid,
        "cave_count_max_cell": caves, "ice_index_source_max": ice_src, "mcd_complete": mcd_complete,
        "slope_lt8_frac": sample_grid(G("mars_slope_lt5_frac.nc", "slope_lt8_frac"), lats, lons),
        "albedo": sample_grid(G("mars_albedo.nc", "albedo"), lats, lons) if (GRIDS / "mars_albedo.nc").exists() else None,
    }
    src = {
        "F1": mcd_note, "F2": mcd_note, "F3": "TES nightside TI 2007 within-Mars quintile class (mode over window)",
        "F4": "MOLA MEGDR 64 ppd slope (~926 m baseline) fraction < 5 deg, window mean", "F5": "MOLA MEGDR meg016 P95-P5 within 15 km",
        "F6": "prior (contract/target_priors.json); grid mode in extras", "F7": "constant 0 (hyper-arid)", "F8": "constant 1 (lifeless)",
        "F9": "SWIM4MIM banded ice index, window mean (poleward of 60 deg assumed 1.0 per TAE)", "F10": "analytic noon sun elevation (obliquity 25.19 deg)",
        "F11": "hydrostatic column from MOLA window-mean elevation: 610 Pa * exp(-z/11.1 km) / g_Mars (MCD ps in extras; GCM topography too coarse)", "F12": "not scored on the target side (capped)",
        "F13": "prior flags | cave if MGC3 cave in window",
    }
    return dict(centre=dict(lat=round(lat, 4), lon=round(lon, 4)), radius_km=r, features=feats, extras=extras, sources=src)


def sanity_checks(tid: str, rec: dict) -> list[dict]:
    """Compare sampled values with Researcher literature values (pipeline/inputs/targets.json)."""
    f, x = rec["features"], rec["extras"]
    out = []

    def chk(name, ours, lit, ok, note=""):
        out.append(dict(check=name, ours=ours, literature=lit, status="ok" if ok else "warn", note=note))

    if tid == "moon_shackleton_connecting_ridge":
        chk("illumination max % (240 m px) vs Glaser 2014 best spots 92.27-95.65% at 2-10 m", x["illum_max_pct"], [92.27, 95.65],
            80 <= x["illum_max_pct"] <= 98, "ground-level 240 m pixels should sit a bit below the 2-10 m mast values")
        chk("Diviner PRP annual max T (window mean) vs ~200 K summer on the ridge (Williams 2020)", x["prp_temp_max_mean_k"], 200,
            150 <= x["prp_temp_max_mean_k"] <= 250, "window mixes sunlit crest and shadowed flanks")
        chk("Diviner PRP annual max T (window P95) vs ~200 K", x["prp_temp_max_p95_k"], 200, 170 <= x["prp_temp_max_p95_k"] <= 260)
    if f["ice_index"] is not None and tid == "moon_haworth":
        chk("Haworth PSR crater: ice_index high", f["ice_index"], ">0.5", f["ice_index"] > 0.5)
        chk("Haworth: PSR area mostly < 110 K max (Williams 2023: nearly all Artemis PSRs < 110 K)", x["prp_frac_cold_trap_lt110k_max"], "~PSR frac",
            x["prp_frac_cold_trap_lt110k_max"] > 0.5)
    if rec["body"] == "moon":
        chk("polar mean T well below equatorial ~250 K", f["ts_mean_k"], "<160 K", f["ts_mean_k"] is not None and f["ts_mean_k"] < 160)
    lit_elev = {"mars_jezero": -2620, "mars_gale": -4501, "mars_utopia_zhurong": -4099.4, "mars_arcadia_ap1": -3900,
                "mars_arcadia_ap9": -3900, "mars_erebus_em16": -3900, "mars_phlegra_pm1": -3200}
    if tid in lit_elev:
        d = x["elev_centre_m"] - lit_elev[tid]
        chk("MOLA meg016 elevation at the anchor pixel vs literature", x["elev_centre_m"], lit_elev[tid], abs(d) <= 300,
            f"diff {d:+.0f} m; window mean {x['elev_mean_m']:.0f} m")
    if tid == "mars_gale":
        chk("MCD Tmin/Tmax vs REMS ground temperature 173-289 K", [x["tmin_k"], x["tmax_k"]], [173, 289],
            x["tmin_k"] is not None and 150 <= x["tmin_k"] <= 200 and 260 <= x["tmax_k"] <= 310)
        chk("MCD diurnal amplitude vs REMS ~55-100 K", f["dt_k"], [55, 100], f["dt_k"] is not None and 45 <= f["dt_k"] <= 110)
        chk("column mass at Gale vs REMS mean pressure ~850 Pa (=22.8 g/cm2)", f["column_mass_gcm2"], 22.8,
            f["column_mass_gcm2"] is not None and 19 <= f["column_mass_gcm2"] <= 26, f"MCD ps {x['ps_mcd_pa']} Pa")
    if tid == "mars_phoenix":
        chk("Phoenix ice table 4.6 cm -> ice_index ~1", f["ice_index"], 1.0, f["ice_index"] is not None and f["ice_index"] >= 0.9)
    if tid in ("mars_arcadia_ap1", "mars_arcadia_ap9", "mars_erebus_em16", "mars_phlegra_pm1"):
        chk("SWIM ice-rich Starship candidate -> ice_index > 0", f["ice_index"], ">0", f["ice_index"] is not None and f["ice_index"] > 0)
    if rec["body"] == "mars":
        chk("annual mean Ts within Mars range 150-260 K", f["ts_mean_k"], [150, 260], f["ts_mean_k"] is not None and 150 <= f["ts_mean_k"] <= 260)
    return out


def main() -> None:
    INTERIM.mkdir(parents=True, exist_ok=True)
    targets = json.loads((REPO_ROOT / "pipeline/inputs/targets.json").read_text())["targets"]
    priors = load("target_priors")["targets"]
    out = {}
    for t in targets:
        fn = moon_target if t["body"] == "moon" else mars_target
        rec = fn(t, priors[t["id"]])
        rec = dict(id=t["id"], body=t["body"], **rec)
        rec["sanity"] = sanity_checks(t["id"], rec)
        out[t["id"]] = rec
        f = rec["features"]
        print(f"{t['id']:34s} Ts={f['ts_mean_k'] and round(f['ts_mean_k'],1)} dT={f['dt_k'] and round(f['dt_k'],1)} "
              f"TI={f['ti_class']} sl5={f['slope_lt5_frac']:.2f} rel={f['relief_m']:.0f} ice={f['ice_index'] and round(f['ice_index'],2)} "
              f"noon={f['noon_sun_elev_deg'] and round(f['noon_sun_elev_deg'],1)} colm={f['column_mass_gcm2'] and round(f['column_mass_gcm2'],1)} "
              f"flags={f['geomorph_flags']} warn={[c['check'][:40] for c in rec['sanity'] if c['status']=='warn']}")
    (INTERIM / "target_vectors.json").write_text(json.dumps(dict(contract_version=CONTRACT_VERSION, targets=out), indent=1) + "\n")
    print("wrote", INTERIM / "target_vectors.json")


if __name__ == "__main__":
    main()
