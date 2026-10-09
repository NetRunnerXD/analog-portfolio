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
