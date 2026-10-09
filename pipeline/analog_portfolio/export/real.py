"""Real-data run: score every target x profile on the Earth cube, Monte Carlo robustness, NMS candidate pools,
three portfolio variants, blind-rediscovery validation, site cards, provenance -> web/public/data/.

Inputs (data/, not in git): interim/earth_cube.npz (grid.assemble), interim/target_vectors.json (extract.targets),
grids/earth_country.nc (extract.earth_admin), grids/provenance*.json.
Run:  python -m analog_portfolio.export.real [--draws 1000] [--jobs 6] [--out DIR]

Engine rules are the contract's (score/engine.py). Missing-data handling: a cell whose deterministic total S is
NaN is `insufficient_data` (engine rule, contract v1.1.1 §3.2.6) and is excluded from ranking, thresholds, pools
and robustness here.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import platform
import subprocess
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np

from .. import CONTRACT_VERSION
from ..config import GRIDS, INTERIM
from ..contract import REPO_ROOT, WEB_DATA_DIR, load
from ..grid import cell_centre, cell_id
from ..grid.area import great_circle_km, weighted_pct_rank, weighted_quantile
from ..grid.binary import read_grid, write_grid
from ..grid.columns import COLUMN_CODES, CONTINENT_CODES, EARTH_COLUMNS, PLANET_COLUMNS
from ..extract.earth_admin import Namer
from ..grid.io import read_var
from ..score.engine import CORE, SECONDARY, aggregate, area_weights, clip_targets, dropped_factors, factor_scores, hard_filter_mask
from ..score.robust import top_frac_freq
from ..score.variants import build_variants
from .mock import INPUTS, load_validation, slug
from .reference import REAL_LABEL, earth_reference, load_cube

FEATURE = {f"F{i}": c for i, c in enumerate(
    ["ts_mean_k", "dt_k", "ti_class", "slope_lt5_frac", "relief_m", "lith_class", "aridity_index", "barren_frac",
     "ice_index", "noon_sun_elev_deg", "column_mass_gcm2", "uv_index", "geomorph_flags"], start=1)}
NO_TARGET_NEEDED = {"F7": "directional: drier Earth cells score higher (no target value)",
                    "F11": "directional: thinner air column / lower cutoff rigidity score higher (capped)",
                    "F12": "directional: higher UV scores higher (capped)"}
_CTX: dict = {}


def r4(x):
    return None if x is None or not np.isfinite(x) else round(float(x), 4)


def target_values(rec: dict) -> dict:
    """Target F-values from target_vectors.json; null F3 (polar Moon) stays absent -> dropped by the engine."""
    v = {}
    for f, col in FEATURE.items():
        x = rec["features"].get(col)
        if x is not None and np.isfinite(x):
            v[f] = float(x)
    v.setdefault("F7", 0.0)  # airless / hyper-arid; F7 is directional (target value unused)
    v.setdefault("F8", 1.0)
    return v


def country_lookup(cell_ids: np.ndarray) -> tuple[list[str | None], np.ndarray]:
    """Per cell: Natural Earth admin-0 name and continent code (grids/earth_country.nc, modal country of the cell)."""
    a = read_var(GRIDS / "earth_country.nc", "country_idx").ravel()
    lk = {d["idx"]: d for d in json.loads((GRIDS / "earth_country_lookup.json").read_text())}
    code = {v: k for k, v in CONTINENT_CODES.items()}
    idx = a[np.asarray(cell_ids).astype(int)]
    names = [lk[int(i)]["name"] if np.isfinite(i) else None for i in idx]
    conts = np.array([code.get(lk[int(i)]["continent"], 0) if np.isfinite(i) else 0 for i in idx], dtype="float64")
    return names, conts


def place(lat: float, lon: float, cell_country: str | None) -> tuple[str | None, str | None]:
    """(country, admin1) for a point: Natural Earth polygons, falling back to the cell's modal country."""
    c, a1 = _CTX["namer"](lat, lon)
    c = c or cell_country
    return c, (a1 if a1 and a1 != c else None)


def _pool(s, total, mask, valid, w, earth, lat, lon, top_n, radius_km, aw):
    ok = mask & valid & (total > 0)
    if not ok.any():
        return [], 0.0
    median = float(weighted_quantile(total[ok], aw[ok], 0.5)[0])
    elig = np.flatnonzero(ok & (total >= median))
    cand = set()
    for f in CORE:
        if w.get(f, 0) <= 0 or f not in s:
            continue
        # canonical tie-break (contract 3.2.7): stable sort s_f desc, then S desc, then cell index asc
        o = np.lexsort((elig, -total[elig], -np.nan_to_num(s[f][elig])))
        cand.update(elig[o[:top_n]].tolist())
    pool = sorted(cand, key=lambda i: (-total[i], i))  # S desc, cell index asc
    kept: list[int] = []
    for i in pool:
        if not kept or np.all(great_circle_km(lat[i], lon[i], lat[kept], lon[kept]) > radius_km):
            kept.append(i)
    return kept, median


def run_target(tid: str) -> dict:
    C = _CTX
    earth, aw, lat, lon = C["earth"], C["aw"], C["lat"], C["lon"]
    tv = C["tvals"][tid]
    body = tid.split("_")[0]
    s = factor_scores(earth, tv, body)  # per-target factor cache (review-01)
    clips = clip_targets(tv, earth)
    mc = C["profiles"]["defaults"]["monte_carlo"]
    dflt = C["profiles"]["defaults"]
    out = dict(portfolios={}, validation=[], appearances=[], timing={})
    for prof in C["profiles"]["profiles"]:
        if body not in prof["bodies"]:
            continue
        t0 = time.perf_counter()
        pid, w = prof["id"], prof["weights"]
        core, total = aggregate(s, w)
        valid = np.isfinite(total)
        mask = hard_filter_mask(earth, prof)
        total_f = np.where(mask & valid, total, 0.0)
        tf_rank = np.where(valid, total_f, np.nan)
        pct = 100.0 * weighted_pct_rank(tf_rank, aw)
        thr = weighted_quantile(tf_rank, aw, [0.5, 0.95, 0.99])
        freq = top_frac_freq(s, w, mask, aw, draws=C["draws"], alpha_scale=mc["dirichlet_alpha_scale"],
                             top_frac=mc["robust_top_frac"], seed=mc["seed"], valid=valid)
        kept, _median = _pool(s, total_f, mask, valid, w, earth, lat, lon, dflt["candidates_top_n_per_factor"],
                              prof["nms_radius_km"], aw)
        known = C["known_cells"]
        known_ll = np.array([cell_centre(k) for k in known]) if known else np.zeros((0, 2))

        def site(i: int, rank: int) -> dict:
            cid = int(earth["cell_id"][i])
            ctry, adm1 = place(float(lat[i]), float(lon[i]), C["country"][i])
            nm = known.get(cid) or f"Candidate cell {lat[i]:.2f}, {lon[i]:.2f}" + (f" ({ctry})" if ctry else "")
            fs = {f: (round(float(s[f][i]), 4) if f in s else 0.0) for f in CORE + SECONDARY}
            near = float(great_circle_km(lat[i], lon[i], known_ll[:, 0], known_ll[:, 1]).min()) if len(known_ll) else 1e9
            tt = earth["travel_time_min"][i]
            return dict(site_id=slug(known[cid]) if cid in known else f"cell_{cid}", name=nm, lat=float(lat[i]),
                        lon=float(lon[i]), cell_id=cid, score=round(float(total_f[i]), 4), score_core=round(float(core[i]), 4),
                        earth_percentile=round(float(pct[i]), 2), factor_scores=fs,
                        covers=[f for f in CORE if w[f] > 0 and f in s and fs[f] >= prof["theta"]],
                        gaps={f: round(g, 3) for f, (_t, g) in clips.items() if g > 0},
                        country=ctry, admin1=adm1,
                        robustness=dict(top5_freq=round(float(freq[i]), 3), robust=bool(freq[i] >= mc["robust_min_freq"])),
                        logistics=dict(travel_time_min=None if not np.isfinite(tt) else round(float(tt), 1),
                                       within_6h=bool(np.isfinite(tt) and tt <= 360),
                                       continent=CONTINENT_CODES.get(int(earth["continent"][i])),
                                       airport_km=r4(earth["airport_km"][i])),
                        known_analog=known.get(cid), candidate=cid not in known and near > 300)

        pool_sites = [site(i, r) for r, i in enumerate(kept[:200])]
        variants = build_variants(pool_sites, {f: (w[f] if f in s else 0) for f in w}, prof["theta"], dflt["portfolio_max_sites"])
        active = [f for f in CORE if w[f] > 0 and f in s]
        universe = sorted({f for f in active if any(ps["factor_scores"][f] >= prof["theta"] for ps in pool_sites)},
                          key=lambda x: int(x[1:]))
        hist, bins = np.histogram(total_f[mask & valid], bins=20, range=(0, 1))
        out["portfolios"][pid] = dict(
            contract_version=CONTRACT_VERSION, mock=False, target_id=tid, profile_id=pid, weights=w, theta=prof["theta"],
            universe=universe, uncoverable=[f for f in active if f not in universe], dropped_factors=dropped_factors(s, w),
            variants=variants, top_cells=pool_sites[:25],
            score_histogram=dict(bins=[round(b, 3) for b in bins.tolist()], counts=hist.astype(int).tolist()),
            monte_carlo=dict(draws=C["draws"], robust_top_frac=mc["robust_top_frac"], robust_min_freq=mc["robust_min_freq"],
                             seed=mc["seed"], area_weighting="cos_lat"),
            earth_thresholds=dict(median=r4(thr[0]), top5=r4(thr[1]), top1=r4(thr[2])))
        for v in variants:
            for k, st in enumerate(v["sites"]):
                out["appearances"].append(dict(site=st, target_id=tid, profile_id=pid, variant=v["id"], rank=k + 1))
        for vi, v in enumerate(C["validation"]):
            if not (v["kind"] == "negative" or (v["body_analog"] in (body, "both") and pid in v["mission_purposes"])):
                continue
            i = C["idx_of"].get(cell_id(v["lat"], v["lon"]))
            if i is None:  # not a land cell in the cube (e.g. underwater habitat)
                out["validation"].append(dict(vi=vi, target_id=tid, profile_id=pid, percentile=0.0, in_top5=False,
                                              in_top1=False, score=0.0, top5_freq=0.0, note="not a land cell"))
                continue
            out["validation"].append(dict(vi=vi, target_id=tid, profile_id=pid, percentile=round(float(pct[i]), 2),
                                          in_top5=bool(pct[i] >= 95), in_top1=bool(pct[i] >= 99),
                                          score=round(float(total_f[i]), 4), top5_freq=round(float(freq[i]), 3),
                                          passes_filters=bool(mask[i]), valid=bool(valid[i])))
        out["timing"][pid] = round(time.perf_counter() - t0, 2)
    return out


def _write(out_dir, name, obj):
    p = out_dir / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False) + "\n")


def provenance_layers() -> list[dict]:
    """Shipped provenance: one entry per data/grids layer used (TAE + P1 provenance files)."""
    layers = []
    for fn in ("provenance.json", "provenance_p1.json"):
        p = GRIDS / fn
        if not p.exists():
            continue
        for lid, e in json.loads(p.read_text())["layers"].items():
            src = (e.get("sources") or [{}])[0]
            facs = sorted({v.get("factor") for v in (e.get("variables") or {}).values() if v.get("factor")} |
                          ({e["factor"]} if e.get("factor") else set()), key=lambda x: int(x[1:]) if x else 0)
            layers.append(dict(id=lid, body=e.get("body", "earth"), factors=[f for f in facs if f],
                               dataset=e.get("dataset") or e.get("title") or lid, provider=e.get("provider") or "see url",
                               agency_group=e.get("agency_group") if e.get("agency_group") in ("nasa", "partner", "other") else "other",
                               url=src.get("url") or "", version=str(src.get("version") or e.get("version") or ""),
                               accessed=e.get("access_date") or src.get("accessed") or "",
                               native_resolution=e.get("native_resolution") or "", license=e.get("licence") or src.get("licence") or e.get("license") or "",
                               citation=e.get("citation") or src.get("citation") or "", sha256=src.get("sha256"),
                               how_used="; ".join(e.get("processing", [])) or e.get("title") or "",
                               slope_baseline_m=e.get("slope_baseline_m")))
    return layers


def validate_outputs(out_dir) -> None:
    """Every shipped JSON must validate against contract/schemas (fail loudly)."""
    import jsonschema

    from ..contract import CONTRACT_DIR

    sch = {n: json.loads((CONTRACT_DIR / "schemas" / f"{n}.schema.json").read_text()) for n in
           ("targets", "profiles", "portfolio", "validation", "site", "provenance", "grid_manifest", "gaps")}
    files = [("targets", out_dir / "targets.json"), ("profiles", out_dir / "profiles.json"),
             ("validation", out_dir / "validation.json"), ("provenance", out_dir / "provenance.json"),
             ("gaps", out_dir / "gaps.json")]
    files += [("grid_manifest", out_dir / f"{b}.json") for b in ("earth_features", "moon_grid", "mars_grid")]
    files += [("portfolio", p) for p in sorted((out_dir / "portfolios").glob("*.json"))]
    files += [("site", p) for p in sorted((out_dir / "sites").glob("*.json"))]
    for n, p in files:
        jsonschema.validate(json.loads(p.read_text()), sch[n])
    print(f"schema-valid: {len(files)} files")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--draws", type=int, default=None)
    ap.add_argument("--jobs", type=int, default=min(6, os.cpu_count() or 1))
    ap.add_argument("--out", default=str(WEB_DATA_DIR))
    ap.add_argument("--targets", default="")
    a = ap.parse_args()
    from pathlib import Path
    out_dir = Path(a.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    t_start = time.time()
    factors, profiles = load("factors"), load("profiles")
    priors = load("target_priors")["targets"]
    rtargets = json.loads((INPUTS / "targets.json").read_text())
    rgaps = json.loads((INPUTS / "gaps.json").read_text())
    tvec = json.loads((INTERIM / "target_vectors.json").read_text())["targets"]
    validation = load_validation()
    units = {f["id"]: f["units"] for f in factors["factors"]}

    # Earth features: quantize exactly like the shipped binary, then score the decoded values (browser parity)
    cube = load_cube(INTERIM / "earth_cube.npz")
    meta = json.loads((INTERIM / "earth_cube.json").read_text())
    country, cube["continent"] = country_lookup(cube["cell_id"])
    meta["sources"]["continent"] = "Natural Earth 1:50m admin-0 CONTINENT of the cell's modal country (extract.earth_admin)"
    cols = [dict(name=n, factor=f, dtype=d, scale=sc, add_offset=o, units=u, values=cube[n], codes=COLUMN_CODES.get(n),
                 source=meta["sources"].get(n, "derived")) for n, f, d, sc, o, u in EARTH_COLUMNS]
    write_grid(out_dir / "earth_features", "earth", "sparse", cols, mock=False)
    earth = read_grid(out_dir / "earth_features.json")
    earth["cell_id"] = np.asarray(earth["cell_id"]).astype("int64")
    aw = area_weights(earth)
    ll = np.array([cell_centre(int(c)) for c in earth["cell_id"]])
    idx_of = {int(c): i for i, c in enumerate(earth["cell_id"])}
    known_cells = {}
    for v in validation:
        if v["kind"] == "positive":
            known_cells.setdefault(cell_id(v["lat"], v["lon"]), v["name"])

    # targets.json
    tvals, out_targets = {}, []
    for t in rtargets["targets"]:
        rec = tvec[t["id"]]
        v = target_values(rec)
        tvals[t["id"]] = v
        cl = clip_targets(v, earth)
        feats = {}
        for f in [f"F{i}" for i in range(1, 14)]:
            val = None if f in NO_TARGET_NEEDED else v.get(f)
            ts, gap = cl.get(f, (val, 0.0 if val is not None else None))
            src = NO_TARGET_NEEDED.get(f) or rec["sources"].get(f, "")
            feats[f] = dict(value=r4(val), t_star=r4(ts), gap=None if gap is None else round(gap, 3), units=units[f], source=src)
        card = {"gravity_ms2": 1.62 if t["body"] == "moon" else 3.73}
        ill = t["values"].get("illumination", {}).get("value")
        if ill is not None:
            card["illumination"] = ill
        card.update({k: (round(x, 4) if isinstance(x, float) else x) for k, x in rec.get("extras", {}).items()})
        pr = priors[t["id"]]
        out_targets.append(dict(t, short_name=pr["short_name"], description=pr["description"], status=pr["status"],
                                window_offset=pr["window_offset"], citations=pr["citations"], features=feats, card=card))
    eref = earth_reference(earth, REAL_LABEL, "NASA POWER TS (F1) and hourly-LST TS_hh (F2) climatology on the 0.5 deg land grid")
    _write(out_dir, "targets.json", dict(rtargets, contract_version=CONTRACT_VERSION, mock=False, targets=out_targets, earth_reference=eref))
    _write(out_dir, "profiles.json", profiles)
    _write(out_dir, "factors.json", factors)
    _write(out_dir, "gaps.json", dict(rgaps, contract_version=CONTRACT_VERSION, mock=False))

    # Moon / Mars: sparse anchor-window cells (one per target; dense grids are a follow-up, see report)
    for body in ("moon", "mars"):
        rows = {}
        for t in (t for t in rtargets["targets"] if t["body"] == body):
            f = tvec[t["id"]]["features"]
            c = tvec[t["id"]]["centre"]
            rows.setdefault(cell_id(c["lat"], c["lon"]), dict(f, elevation_m=tvec[t["id"]].get("extras", {}).get("elev_mean_m")))
        ids = sorted(rows)
        pc = [dict(name=n, factor=fa, dtype=d, scale=sc, add_offset=o, units=u, source="target window (extract.targets)",
                   values=np.array([ids[k] if n == "cell_id" else (np.nan if rows[ids[k]].get(n) is None else rows[ids[k]][n])
                                    for k in range(len(ids))], dtype="float64"))
              for n, fa, d, sc, o, u in PLANET_COLUMNS]
        write_grid(out_dir / f"{body}_grid", body, "sparse", pc, mock=False)

    # scoring (parallel over targets; fork shares the Earth arrays)
    _CTX.update(earth=earth, aw=aw, lat=ll[:, 0], lon=ll[:, 1], tvals=tvals, profiles=profiles, validation=validation,
                idx_of=idx_of, known_cells=known_cells, country=country, namer=Namer(),
                draws=a.draws or profiles["defaults"]["monte_carlo"]["draws"])
    tids = [t["id"] for t in rtargets["targets"]]
    if a.targets:
        tids = [t for t in tids if t in a.targets.split(",")]
    if a.jobs > 1:
        with ProcessPoolExecutor(a.jobs) as ex:
            results = dict(zip(tids, ex.map(run_target, tids)))
    else:
        results = {t: run_target(t) for t in tids}
    for tid, r in results.items():
        for pid, port in r["portfolios"].items():
            _write(out_dir, f"portfolios/{tid}_{pid}.json", port)

    # validation
    per_site = {i: [] for i in range(len(validation))}
    for r in results.values():
        for e in r["validation"]:
            per_site[e.pop("vi")].append(e)
    pos = [e for i, v in enumerate(validation) if v["kind"] == "positive" for e in per_site[i]]
    aucs = []
    for key in sorted({(e["target_id"], e["profile_id"]) for e in pos}):
        pp = [e["percentile"] for e in pos if (e["target_id"], e["profile_id"]) == key]
        nn = [e["percentile"] for i, v in enumerate(validation) if v["kind"] == "negative" for e in per_site[i]
              if (e["target_id"], e["profile_id"]) == key]
        if pp and nn:
            aucs.append(sum((x > y) + 0.5 * (x == y) for x in pp for y in nn) / (len(pp) * len(nn)))
    git_sha = subprocess.run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip() or None
    keep = {"percentile", "in_top5", "in_top1", "target_id", "profile_id"}
    _write(out_dir, "validation.json", dict(
        contract_version=CONTRACT_VERSION, mock=False, frozen_commit=None, source="docs/validation.csv",
        summary=dict(n_known=sum(v["kind"] == "positive" for v in validation), n_negative=sum(v["kind"] == "negative" for v in validation),
                     n_evaluations=len(pos), pct_top5=round(sum(e["in_top5"] for e in pos) / max(len(pos), 1), 4),
                     pct_top1=round(sum(e["in_top1"] for e in pos) / max(len(pos), 1), 4),
                     rank_auc=round(float(np.mean(aucs)), 4) if aucs else None),
        sites=[dict(v, cell_id=cell_id(v["lat"], v["lon"]), results=[{k: e[k] for k in keep} for e in per_site[i]])
               for i, v in enumerate(validation)],
        new_candidates=[]))
    (INTERIM / "validation_detail.json").write_text(json.dumps(dict(per_site={validation[i]["name"]: e for i, e in per_site.items()},
                                                                   aucs=aucs), indent=1, ensure_ascii=False) + "\n")

    # site cards: validation positives + every site in any portfolio
    cards: dict[str, dict] = {}
    feat_cols = [c[0] for c in EARTH_COLUMNS if c[0] not in ("cell_id", "continent")]

    def card_for(sid, name, la, lo, cid, summary, known, cites):
        i = idx_of.get(cid)
        ctry, adm1 = place(la, lo, None if i is None else country[i])
        ef = {c: (None if i is None or not np.isfinite(earth[c][i]) else round(float(earth[c][i]), 4)) for c in feat_cols}
        return dict(contract_version=CONTRACT_VERSION, mock=False, site_id=sid, name=name, lat=la, lon=lo, cell_id=cid,
                    country=ctry, admin1=adm1,
                    continent=None if i is None else CONTINENT_CODES.get(int(earth["continent"][i])), summary=summary, known_analog=known, earth_features=ef,
                    drilldown={}, best_for=[], citations=cites, attribution=[])
    for v in validation:
        if v["kind"] == "positive":
            cid = cell_id(v["lat"], v["lon"])
            cards.setdefault(slug(v["name"]), card_for(slug(v["name"]), v["name"], v["lat"], v["lon"], cid, v["why"], v["name"], [v["citation_url"]]))
    for r in results.values():
        for ap_ in r["appearances"]:
            st = ap_["site"]
            c = cards.setdefault(st["site_id"], card_for(st["site_id"], st["name"], st["lat"], st["lon"], st["cell_id"],
                                                         "Pipeline candidate (0.5 deg cell)", st["known_analog"], []))
            c["best_for"].append(dict(target_id=ap_["target_id"], profile_id=ap_["profile_id"], variant=ap_["variant"],
                                      score=st["score"], rank=ap_["rank"], percentile=st["earth_percentile"],
                                      top5_freq=st["robustness"]["top5_freq"], robust=st["robustness"]["robust"]))
    import shutil
    shutil.rmtree(out_dir / "sites", ignore_errors=True)
    for sid, c in cards.items():
        _write(out_dir, f"sites/{sid}.json", c)

    _write(out_dir, "provenance.json", dict(contract_version=CONTRACT_VERSION, mock=False, layers=provenance_layers(),
                                            pipeline=dict(git_sha=git_sha, run_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                                                          python=platform.python_version())))
    validate_outputs(out_dir)
    timing = {t: r["timing"] for t, r in results.items()}
    (INTERIM / "run_timing.json").write_text(json.dumps(timing, indent=1) + "\n")
    size = sum(p.stat().st_size for p in out_dir.rglob("*") if p.is_file() and "mock" not in p.parts)
    print(f"real assets -> {out_dir}: {len(results)} targets, {sum(len(r['portfolios']) for r in results.values())} portfolios, "
          f"{len(cards)} site cards, {size/1e6:.2f} MB, {time.time()-t_start:.0f} s")


if __name__ == "__main__":
    main()
