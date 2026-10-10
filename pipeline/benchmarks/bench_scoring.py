"""Benchmark the reference scorer at production scale (review-01). Not part of the test suite.

    python benchmarks/bench_scoring.py --cells 85000 --draws 1000
    python benchmarks/bench_scoring.py --cells 259200 --draws 1000

Synthetic Earth columns quantized like earth_features.bin (so ties are realistic). Measures:
  1. engine.factor_scores + engine.aggregate per (target, profile)  -- current code
  2. naive Monte Carlo: engine.aggregate once per Dirichlet draw     -- what a direct port would do
  3. score.robust.top_frac_freq: log-space matmul MC, float32, draws chunked, area-weighted top-5% threshold
     per draw over all land cells (the shipped implementation, review-01 decision #3)
--missing F sets a fraction F of cells to NaN in two Earth columns to exercise the missing-data path.
Peak memory = tracemalloc peak of numpy allocations inside each stage.
"""
from __future__ import annotations

import argparse
import os
import time
from concurrent.futures import ProcessPoolExecutor
import tracemalloc

import numpy as np

from analog_portfolio.contract import load
from analog_portfolio.score.engine import CORE, aggregate, area_weights, factor_scores, hard_filter_mask, score_cells
from analog_portfolio.score import robust
from analog_portfolio.score.robust import top_frac_freq


def q(x, step, lo=None, hi=None):
    x = np.round(np.asarray(x) / step) * step
    return np.clip(x, lo, hi) if lo is not None or hi is not None else x


def synth_earth(n: int, seed: int = 0) -> dict[str, np.ndarray]:
    r = np.random.default_rng(seed)
    lat = r.uniform(-85, 83, n)
    elev = r.gamma(1.5, 400, n)
    ts = 302 - 0.75 * np.abs(lat) - 0.0055 * elev + r.normal(0, 3, n)
    ai = np.clip(r.lognormal(0, 0.9, n), 0.001, 6.5)
    return {
        "cell_id": np.sort(r.choice(259200, n, replace=False)).astype("int64"),
        "ts_mean_k": q(ts, 0.01), "dt_k": q(np.clip(8 + 25 * (1 - np.minimum(ai, 1)) + r.normal(0, 3, n), 2, 60), 0.01),
        "ti_class": r.integers(1, 6, n).astype(float), "slope_lt5_frac": q(r.uniform(0, 1, n), 0.004),
        "relief_m": q(np.maximum(10, elev * 0.6 + r.gamma(2, 80, n)), 1), "lith_class": r.integers(1, 15, n).astype(float),
        "aridity_index": q(ai, 0.0001), "barren_frac": q(r.uniform(0, 1, n), 0.004),
        "ice_index": q(np.clip((273.15 - ts) / 15, 0, 1), 0.004),
        "noon_sun_elev_deg": q(90 - np.abs(lat) - r.uniform(0, 10, n), 0.5),
        "column_mass_gcm2": q(1033 * np.exp(-elev / 8400), 0.1), "cutoff_rigidity_gv": q(14.9 * np.cos(np.radians(lat)) ** 4, 0.1),
        "uv_index": q(np.clip(12 * np.cos(np.radians(lat)) ** 1.5, 0.2, 18), 0.1),
        "geomorph_flags": r.choice([0, 0, 0, 0, 1, 4, 64, 5], n).astype(float),
        "water_frac": q(np.clip(r.normal(0.05, 0.05, n), 0, 1), 0.004),
        "builtup_frac": q(np.clip(r.normal(0.02, 0.05, n), 0, 1), 0.004),
    }


TARGETS = {  # 18 synthetic targets: 10 Moon-like, 8 Mars-like
    **{f"moon_{i}": dict(F1=110 + 8 * i, F2=60 + 5 * i, F3=2, F4=0.3, F5=1800, F6=16, F7=0.0, F8=1.0, F9=0.6, F10=1 + 0.5 * i,
                         F13=49) for i in range(10)},
    **{f"mars_{i}": dict(F1=200 + 3 * i, F2=70 + 2 * i, F3=3, F4=0.8, F5=600, F6=1, F7=0.0, F8=1.0, F9=0.3 * (i % 3),
                         F10=50 + 4 * i, F13=1) for i in range(8)},
}


def timed(fn, *a, **k):
    tracemalloc.start()
    t0 = time.perf_counter()
    out = fn(*a, **k)
    dt = time.perf_counter() - t0
    peak = tracemalloc.get_traced_memory()[1]
    tracemalloc.stop()
    return out, dt, peak


_CTX = None


def _pair_job(tp):
    earth, cache, draws, chunk = _CTX
    t, pid = tp
    p = next(x for x in load("profiles")["profiles"] if x["id"] == pid)
    top_frac_freq(cache[t], p["weights"], hard_filter_mask(earth, p), area_weights(earth), draws=draws, chunk=chunk,
                  valid=score_cells(cache[t], p["weights"])["sufficient"])
    return tp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", type=int, default=85000)
    ap.add_argument("--draws", type=int, default=1000)
    ap.add_argument("--chunk", type=int, default=100)
    ap.add_argument("--naive-draws", type=int, default=1000, help="draws to time for the naive per-draw aggregate")
    ap.add_argument("--jobs", type=int, default=os.cpu_count(), help="processes for the parallel all-pairs run")
    ap.add_argument("--missing", type=float, default=0.0, help="fraction of NaN cells in ts_mean_k and lith_class")
    ap.add_argument("--full-sort-pair", action="store_true", help="also time one pair with the full-sort threshold")
    a = ap.parse_args()
    profiles = load("profiles")["profiles"]
    earth = synth_earth(a.cells)
    if a.missing:
        r = np.random.default_rng(1)
        for k in ("ts_mean_k", "lith_class"):
            earth[k][r.uniform(size=a.cells) < a.missing] = np.nan
    aw = area_weights(earth)
    pairs = [(t, p) for t in TARGETS for p in profiles if t.split("_")[0] in p["bodies"]]
    print(f"cells={a.cells} targets={len(TARGETS)} pairs={len(pairs)} draws={a.draws}")

    # 1. current code, one pair
    s, t_fs, m_fs = timed(factor_scores, earth, TARGETS["mars_0"], "mars")
    _, t_ag, m_ag = timed(aggregate, s, profiles[0]["weights"])
    print(f"[1] factor_scores: {t_fs*1e3:.1f} ms (peak {m_fs/2**20:.0f} MiB); aggregate: {t_ag*1e3:.1f} ms (peak {m_ag/2**20:.0f} MiB)")

    # full deterministic precompute as mock.py does it (factor_scores recomputed per profile)
    t0 = time.perf_counter()
    for t, p in pairs:
        ss = factor_scores(earth, TARGETS[t], t.split("_")[0])
        aggregate(ss, p["weights"])
    t_all = time.perf_counter() - t0
    t0 = time.perf_counter()
    cache = {t: factor_scores(earth, TARGETS[t], t.split("_")[0]) for t in TARGETS}
    for t, p in pairs:
        aggregate(cache[t], p["weights"])
    t_cached = time.perf_counter() - t0
    print(f"[1] all {len(pairs)} pairs, per-profile recompute (pre-review mock.py): {t_all:.2f} s; factor_scores cached per target: {t_cached:.2f} s")

    # 2. naive MC: aggregate per draw for one pair
    rng = np.random.default_rng(20261114)
    w = profiles[1]["weights"]
    act = [f for f in CORE if w[f] > 0]
    alpha = 50 * np.array([w[f] for f in act], dtype=float) / sum(w[f] for f in act)
    W = rng.dirichlet(alpha, size=a.naive_draws)

    def naive():
        out = np.empty((a.naive_draws, a.cells), dtype="float64")
        for d in range(a.naive_draws):
            out[d] = aggregate(s, dict(zip(act, W[d])))[1]
        return out
    _, t_nv, m_nv = timed(naive)
    print(f"[2] naive MC, {a.naive_draws} draws, one pair: {t_nv:.2f} s (peak {m_nv/2**20:.0f} MiB, float64 D x N kept)")

    # 3. shipped MC (score.robust.top_frac_freq)
    mask = hard_filter_mask(earth, profiles[1])
    print(f"    insufficient_data cells for this pair: {int((~score_cells(s, w)['sufficient']).sum())}")
    _, t_mm, m_mm = timed(top_frac_freq, s, w, mask, aw, draws=a.draws, chunk=a.chunk)
    print(f"[3] top_frac_freq, {a.draws} draws (chunk {a.chunk}), one pair: {t_mm:.2f} s (peak {m_mm/2**20:.0f} MiB)")
    if a.full_sort_pair:
        fast = robust._wq_rows
        robust._wq_rows = robust._wq_rows_full  # merged v1.1.1 threshold: full stable sort of every draw
        try:
            ref, t_fs1, _ = timed(top_frac_freq, s, w, mask, aw, draws=a.draws, chunk=a.chunk)
        finally:
            robust._wq_rows = fast
        same = np.array_equal(ref, top_frac_freq(s, w, mask, aw, draws=a.draws, chunk=a.chunk))
        print(f"[3] same pair with the full-sort threshold (_wq_rows_full): {t_fs1:.2f} s; identical frequencies: {same}")

    t0 = time.perf_counter()
    tracemalloc.start()
    for t, p in pairs:
        top_frac_freq(cache[t], p["weights"], hard_filter_mask(earth, p), aw, draws=a.draws, chunk=a.chunk,
                      valid=score_cells(cache[t], p["weights"])["sufficient"])
    peak = tracemalloc.get_traced_memory()[1]
    tracemalloc.stop()
    print(f"[3] top_frac_freq, all {len(pairs)} pairs x {a.draws} draws: {time.perf_counter()-t0:.1f} s (peak {peak/2**20:.0f} MiB)")
    if a.jobs > 1:
        global _CTX
        _CTX = (earth, cache, a.draws, a.chunk)
        t0 = time.perf_counter()
        with ProcessPoolExecutor(a.jobs) as ex:  # fork: workers inherit _CTX
            list(ex.map(_pair_job, [(t, p["id"]) for t, p in pairs]))
        print(f"[3] top_frac_freq, all {len(pairs)} pairs x {a.draws} draws, {a.jobs} processes: {time.perf_counter()-t0:.1f} s")
    full = 720 * 360 * len(TARGETS) * 5 * a.draws
    print(f"naive full broadcast would be {full:.3g} values = {full*8/1e9:.0f} GB float64 / {full*4/1e9:.0f} GB float32")


if __name__ == "__main__":
    main()
