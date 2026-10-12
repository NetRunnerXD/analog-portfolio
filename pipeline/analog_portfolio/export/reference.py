"""Earth reference values for the gap panel (contract v1.1 targets.json -> earth_reference) and per-target clips."""
from __future__ import annotations

import numpy as np

from ..grid import cell_centre
from ..grid.area import weighted_quantile
from ..score.engine import area_weights


def earth_reference(earth: dict, label: str, source: str) -> dict:
    """Area-weighted land extremes and clip quantiles of F1/F2 from the Earth grid (gap panel values)."""
    aw = area_weights(earth)
    land = np.nan_to_num(earth["water_frac"], nan=1.0) < 0.5
    out = dict(label=label, source=source, grid="0.5 deg land cells (water_frac < 0.5)", area_weighting="cos_lat",
               n_land_cells=int(land.sum()), stats={})
    for col in ("ts_mean_k", "dt_k"):
        x = np.where(land, earth[col], np.nan)
        ok = np.isfinite(x)
        i_min = int(np.nanargmin(x)); i_max = int(np.nanargmax(x))
        q = weighted_quantile(x[ok], aw[ok], [0.005, 0.5, 0.995])

        def ext(i):
            cid = int(earth["cell_id"][i]); la, lo = cell_centre(cid)
            return dict(value=round(float(x[i]), 2), cell_id=cid, lat=la, lon=lo)
        out["stats"][col] = dict(units="K", min=ext(i_min), max=ext(i_max), p0_5=round(float(q[0]), 2),
                                 p50=round(float(q[1]), 2), p99_5=round(float(q[2]), 2))
    return out


REAL_LABEL = "From our 0.5° Earth grid (NASA POWER 2001–2020 skin temperature; cell means, not point records)"


def load_cube(path) -> dict:
    with np.load(path) as z:
        return {k: z[k].astype("float64") for k in z.files}


def main() -> None:
    import json

    from ..config import INTERIM
    from ..score.engine import clip_targets

    earth = load_cube(INTERIM / "earth_cube.npz")
    have_dt = np.isfinite(earth["dt_k"]).any()
    ref = earth_reference(earth if have_dt else dict(earth, dt_k=np.zeros_like(earth["ts_mean_k"])), REAL_LABEL,
                          "NASA POWER TS (F1) and hourly-LST TS_hh (F2) climatology on the 0.5 deg land grid")
    if not have_dt:
        ref["stats"].pop("dt_k")
    tv = json.loads((INTERIM / "target_vectors.json").read_text())["targets"]
    fmap = {"F1": "ts_mean_k", "F2": "dt_k", "F5": "relief_m", "F10": "noon_sun_elev_deg"}
    clips = {}
    for tid, rec in tv.items():
        vals = {f: rec["features"][c] for f, c in fmap.items() if rec["features"][c] is not None and np.isfinite(earth[c]).any()}
        clips[tid] = {f: dict(t=round(vals[f], 2), t_star=round(ts, 2), gap=round(g, 2)) for f, (ts, g) in clip_targets(vals, earth).items()}
    out = dict(earth_reference=ref, clips=clips)
    (INTERIM / "earth_reference.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(json.dumps(ref, indent=1, ensure_ascii=False))
    for tid in ("moon_shackleton_connecting_ridge", "moon_haworth", "mars_jezero", "mars_gale"):
        print(tid, clips[tid])


if __name__ == "__main__":
    main()


def scoring_constants(earth: dict, profiles: dict, tvals: dict | None = None) -> dict:
    """Full-precision Earth constants the browser rescorer needs to mirror the pipeline exactly (targets.json ->
    scoring_constants). Computed from the SHIPPED (quantized, decoded) earth_features grid, as the pipeline scores it."""
    from ..contract import load
    from ..score.engine import earth_range

    aw = area_weights(earth)
    fac = load("factors")["factors"]
    clip = {}
    for f in fac:
        if f["earth_clip"]:
            lo, hi = weighted_quantile(earth[f["feature"]], aw, [0.005, 0.995])
            clip[f["id"]] = dict(feature=f["feature"], p0_5=float(lo), p99_5=float(hi))
    rng = {}
    for fid, col in (("F1", "ts_mean_k"), ("F2", "dt_k")):
        lo, hi = earth_range(dict(earth), col)
        rng[fid] = dict(feature=col, p01=float(lo), p99=float(hi), span=float(hi - lo))
    zero = {}
    if tvals:  # review M3: share of land (cos-lat area) where the F1/F2 similarity is exactly 0 (-> the 0.01 floor)
        from ..score.engine import factor_scores
        for tid, tv in tvals.items():
            sc = factor_scores(earth, tv, tid.split("_")[0])
            zero[tid] = {f: round(float(aw[np.isfinite(sc[f]) & (sc[f] == 0)].sum() / aw.sum()), 4) for f in ("F1", "F2") if f in sc}
    g = profiles["defaults"].get("candidate_gates", {})
    return dict(
        note=("Full float64 precision. All quantiles are cos(lat) area-weighted over the cells of earth_features.bin as "
              "decoded (raw * scale + add_offset), midpoint (Hazen) interpolation of the weighted CDF, NaN skipped. "
              "Target values in features.*.value / t_star are unrounded; t_star = min(max(value, p0_5), p99_5)."),
        earth_clip=clip,
        range_norm=dict(rule="s = max(0, 1 - |x - t_star| / (p99 - p01)); if p99 == p01: 1 on exact match else 0",
                        factors=rng, zero_share_of_land=zero,
                        design_note=("Intended (review M3): t* is clipped to Earth's P0.5/P99.5, so for targets beyond Earth's "
                                     "range every target rewards closeness to the same Earth extreme (F2 t* = P99.5 for all 18 "
                                     "targets). Cells farther than one P1-P99 span from t* get s = 0 and hit the 0.01 floor of the "
                                     "geometric mean; zero_share_of_land gives that share per target (cos(lat) area-weighted).")),
        gates={b: dict(params="profiles.json defaults.candidate_gates." + b,
                       inputs=["aridity_index", "barren_frac", "permafrost_frac", "moss_lichen_frac", "geomorph_flags"],
                       missing=v.get("missing")) for b, v in g.items()},
        f7_note="F7 has no target value (null on every target): it is scored Earth-only as the area-weighted aridity percentile.",
    )
