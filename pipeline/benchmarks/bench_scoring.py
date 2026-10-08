"""Benchmark the reference scorer at production scale (review-01). Not part of the test suite.

    python benchmarks/bench_scoring.py --cells 85000 --draws 1000
    python benchmarks/bench_scoring.py --cells 259200 --draws 1000

Synthetic Earth columns quantized like earth_features.bin (so ties are realistic). Measures:
  1. engine.factor_scores + engine.aggregate per (target, profile)  -- current code
  2. naive Monte Carlo: engine.aggregate once per Dirichlet draw     -- what a direct port would do
  3. log-space matmul Monte Carlo, draws chunked, float32            -- proposed
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
from analog_portfolio.score.engine import CORE, SECONDARY, aggregate, factor_scores, hard_filter_mask
from analog_portfolio.score.normalize import FLOOR


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


def mc_matmul(s, w, mask, draws, rng, chunk, top_k, cand):
    """Proposed MC: S_d = exp(w_d . L) * nudge, float32, draws in chunks of `chunk`, (draw x cell) layout so the
    per-draw top-k partition runs over contiguous memory. Returns top-k frequency and median rank (within the
    candidate pool) for each candidate index in `cand`."""
    act = [f for f in CORE if w.get(f, 0) > 0]  # Dirichlet over active factors only (alpha must be > 0)
    Lt = np.stack([np.log(np.maximum(s[f], FLOOR)) for f in act]).astype("float32")  # K x N
    nudge = (0.9 + 0.1 * np.mean([s[f] for f in SECONDARY], axis=0)).astype("float32") * mask  # filtered -> 0
    alpha = 50 * np.array([w[f] for f in act], dtype="float64") / sum(w[f] for f in act)  # alpha0 = 50
    W = rng.dirichlet(alpha, size=draws).astype("float32")  # D x K, rows sum to 1
    n = Lt.shape[1]
    topk_hits = np.zeros(len(cand), dtype="int32")
    ranks = np.empty((draws, len(cand)), dtype="int32")
    for d0 in range(0, draws, chunk):
        S = W[d0:d0 + chunk] @ Lt  # c x N log-scores
        np.exp(S, out=S)
        S *= nudge
        kth = np.partition(S, n - top_k, axis=1)[:, n - top_k]  # k-th largest per draw
        Sc = S[:, cand]  # c x C
        topk_hits += (Sc >= kth[:, None]).sum(axis=0)
        ranks[d0:d0 + chunk] = np.argsort(np.argsort(-Sc, axis=1, kind="stable"), axis=1) + 1
    return topk_hits / draws, np.median(ranks, axis=0)


_CTX = None


def _pair_job(tp):
    earth, cache, draws, chunk = _CTX
    t, pid = tp
    p = next(x for x in load("profiles")["profiles"] if x["id"] == pid)
    ss = cache[t]
    mk = hard_filter_mask(earth, p).astype("float32")
    _, tot = aggregate(ss, p["weights"])
    cd = np.argsort(-np.where(mk > 0, tot, 0), kind="stable")[:500]
    mc_matmul(ss, p["weights"], mk, draws, np.random.default_rng(20261114), chunk, 10, cd)
    return tp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", type=int, default=85000)
    ap.add_argument("--draws", type=int, default=1000)
    ap.add_argument("--chunk", type=int, default=100)
    ap.add_argument("--naive-draws", type=int, default=1000, help="draws to time for the naive per-draw aggregate")
    ap.add_argument("--jobs", type=int, default=os.cpu_count(), help="processes for the parallel all-pairs run")
    a = ap.parse_args()
    profiles = load("profiles")["profiles"]
    earth = synth_earth(a.cells)
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
    print(f"[1] all {len(pairs)} pairs, per-profile recompute (mock.py style): {t_all:.2f} s; factor_scores cached per target: {t_cached:.2f} s")

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

    # 3. proposed MC
    mask = hard_filter_mask(earth, profiles[1]).astype("float32")
    core, total = aggregate(s, w)
    cand = np.argsort(-np.where(mask > 0, total, 0), kind="stable")[:500]
    (freq, med), t_mm, m_mm = timed(mc_matmul, s, w, mask, a.draws, np.random.default_rng(20261114), a.chunk, 10, cand)
    print(f"[3] matmul MC, {a.draws} draws (chunk {a.chunk}), 500 candidates, one pair: {t_mm:.2f} s (peak {m_mm/2**20:.0f} MiB)")

    t0 = time.perf_counter()
    tracemalloc.start()
    for t, p in pairs:
        ss = cache[t]
        mk = hard_filter_mask(earth, p).astype("float32")
        _, tot = aggregate(ss, p["weights"])
        cd = np.argsort(-np.where(mk > 0, tot, 0), kind="stable")[:500]
        mc_matmul(ss, p["weights"], mk, a.draws, np.random.default_rng(20261114), a.chunk, 10, cd)
    peak = tracemalloc.get_traced_memory()[1]
    tracemalloc.stop()
    print(f"[3] matmul MC, all {len(pairs)} pairs x {a.draws} draws: {time.perf_counter()-t0:.1f} s (peak {peak/2**20:.0f} MiB)")
    if a.jobs > 1:
        global _CTX
        _CTX = (earth, cache, a.draws, a.chunk)
        t0 = time.perf_counter()
        with ProcessPoolExecutor(a.jobs) as ex:  # fork: workers inherit _CTX
            list(ex.map(_pair_job, [(t, p["id"]) for t, p in pairs]))
        print(f"[3] matmul MC, all {len(pairs)} pairs x {a.draws} draws, {a.jobs} processes: {time.perf_counter()-t0:.1f} s")
    full = 720 * 360 * len(TARGETS) * 5 * a.draws
    print(f"naive full broadcast would be {full:.3g} values = {full*8/1e9:.0f} GB float64 / {full*4/1e9:.0f} GB float32")


if __name__ == "__main__":
    main()
