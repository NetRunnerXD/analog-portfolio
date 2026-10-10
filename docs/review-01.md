# Code review 01: scoring pipeline, TS port, numerics, tests, performance, bundle

*Reviewer: Code Optimizer and Evaluator (Grok Bot), first pass, Thu Oct 8, 2026 (IST). Requested by Project 1.*
*Reviewed: `origin/main` @ `d3c98bd` (line numbers below refer to that commit unless marked "after fix"). The owner's local `main` has one unpushed CI commit (`845610c`). This branch is based on `origin/main` on purpose, so it **does not** carry that commit. GitHub CI therefore won't run on this PR until the CI commit lands on `main`. `feat/web-ui` doesn't exist on the remote yet, so the TS port was reviewed on `main` only.*
*Spec: `docs/plan.md` §2, `docs/DATA_CONTRACT.md`, `contract/*.json`. No contract file was changed in the first pass. Proposed contract changes are listed in §7.*
*Update 2 (same day): Project 1 decided §7 C1/C2/C4/C5 and merged them as contract v1.1 + v1.1.1 (`origin/main` @ `90454a3`). This branch is now **rebased onto `origin/main` @ `038cde4`** (v1.1.1 plus the CI and deploy merges) and implements the decisions in code. CI (`.github/workflows/ci.yml`) is now on `main`, so it will run on this PR. See §0.1. Line numbers in §1 still refer to `d3c98bd`.*

Every number in this document comes from a real run on the shared box (8 vCPU, 15 GB RAM, numpy 2.5.3 + OpenBLAS, Node 20.19, Vite 8.3.3). The box is shared with other agents, so expect roughly ±20% timing noise. Numbers marked *extrapolated* are explicitly scaled from a measured run.

## 0. Summary

| Severity | Count | Fixed in this PR |
|---|---|---|
| Critical | 0 | – |
| High | 3 | partly (H1: tests + parity harness) |
| Medium | 6 | 1 (M1) |
| Low | 9 | 3 (L2, L3, L4) |
| Nit | 5 | 0 |

The scalar math matches the spec. All 9 normalization/aggregation rules, the Earth clip, the hard filters, the floor and the nudge follow `DATA_CONTRACT.md` §3.1–3.2, and the zero-weight / zero-score / 0^0 cases behave correctly. The risks are elsewhere:
1. The vectorised engine that produces every score had no tests.
2. The contract doesn't define what happens with missing data or how Monte Carlo α is scaled.
3. Several tie-handling rules make results depend on cell order or the numpy version.

These need settling before the real data lands.

## 0.1 Update 2: decisions implemented (rebased on contract v1.1.1)

The v1.1.1 merge already had the decisions in the contract text, plus α normalisation, chunked float32 MC, area-weighted mid-rank percentiles and the canonical tie-break in `mock.py`. The engine still mapped every NaN to 0, crashed on null target values other than F3 and on all-missing columns, and had no 70% rule. This commit closes those gaps.

| Decision | Status | Where |
|---|---|---|
| #2 Earth NaN: drop the factor, renormalise, score only if ≥ 70% of active weight present, else `insufficient_data` (excluded from ranking, percentiles, thresholds, pool, set cover, robustness) | **Done** | `score/engine.py` (`score_cells`, `score_profile`, `candidate_indices`), `export/mock.py`, `score/setcover.py` (null never covers) |
| #2 Coverage per cell | **Done**: `data_coverage` on every site; `insufficient_cells` per portfolio | `engine.score_cells`, schemas |
| #2 Target nulls after sampling: drop + renormalise + flag | **Done**: `targets.json → targets[].dropped_factors` (documented in DATA_CONTRACT §3.2 item 5 and §5); F7/F11/F12 never dropped (Earth-only) | `engine.target_dropped_factors`, `factor_scores` |
| #2 Never crash on null/NaN | **Done**: all-missing cells, columns, targets and empty grids are tested with `RuntimeWarning` promoted to error | `tests/test_missing_data.py` |
| #3 Dirichlet α = 50·w, w normalised over active factors, zero weights exactly zero | Already in v1.1.1 (`robust.draw_weights` samples active factors only); now tested | `tests/test_robust.py` |
| #3 Robust = area-weighted top 5% of land in ≥ 80% of draws, chunked float32 matmul, seeded | Already in v1.1.1. **Made ~7× faster per pair with bit-identical frequencies** (threshold from the top of each draw instead of a full stable sort; §2.1). `valid=` now passed so insufficient cells are excluded. `robust_flags` is the single 0.8 rule | `score/robust.py` |
| #4 Mid-rank | Already in v1.1.1 (area-weighted, Hazen-type). Engine percentiles now keep missing as NaN instead of 0 | `engine._pct_rank` |
| #5 Stable sort with cell-index tie-break | `mock.py` already had it inline (s_f → S → index). Moved into `engine.candidate_indices` (single source for the real exporter), missing s_f never ranks | `engine.candidate_indices` |
| Perf: per-target factor cache | **Done** (`engine.FactorCache`, used by `mock.py`) | |

Mock assets were regenerated. **All existing scores, percentiles, pools and `top5_freq` values are byte-identical.** The mock grid has no NaN cells, so the only changes are the new fields (`dropped_factors` on 18 targets, `data_coverage` on every site, `insufficient_cells: 0`). That's a good check that the rewrite didn't change behaviour on complete data.

## 1. Findings

### High

**H1. The vectorised engine was untested, and "parity" only covers the scalar helpers. The JS side has no engine yet.**
- `pipeline/analog_portfolio/score/engine.py` (all of it) had **0% coverage**, but every shipped score comes from `factor_scores`, `aggregate`, `hard_filter_mask`, `clip_targets` and `_pct_rank`. The tests only hit `normalize.py`.
- `web/src/scoring/normalize.ts` ports only the scalar functions. There's no vectorised factor scorer, percentile, Earth clip or hard filter in JS. So `contract/test_vectors.json` ("Python/JS parity is enforced") can't catch an engine-level divergence, and the plan's < 100 ms Worker re-score has nothing to be checked against.
- **Why it matters:** a bug in `engine.py` (wrong column, wrong t*, a NaN path) would go straight into portfolios and validation numbers with CI still green.
- **Done in this PR:**
  - `pipeline/tests/test_engine.py` brings engine.py to 100% line and branch coverage. It checks per cell that each engine factor score equals the scalar reference, that `aggregate` equals `geometric_mean`/`total_score`, and covers the clip, filters, percentiles and edge cases.
  - `pipeline/tests/make_parity_fixture.py` generates `pipeline/tests/fixtures/parity_cases.json` (1,597 edge-case inputs with Python outputs) plus a tiny grid binary. `web/src/scoring/parity.test.ts` runs the same inputs through the JS port and through `loadGrid`. `test_parity_fixture.py` fails if the fixture goes stale.
  - A mutation check confirms it works: changing the JS tie-break (`>` to `>=`) is caught **only** by the new parity test, not by the existing vectors.
- **Still to do (Programmer):** when the Worker scorer lands, add an engine-level fixture (§7 C7) and compare at tolerance 1e-6, not 1e-9 (see M6).

**H2. There's no missing-data policy: a NaN cell is scored as "maximally unlike", and a missing target value crashes.**
- `engine.py:88` applies `np.nan_to_num(...)` to every factor score, so a missing Earth value becomes s = 0. `aggregate` then floors that to 0.01. For P2 (F9 weight 30) a single missing ice value multiplies S_core by 0.01^0.30 ≈ **0.25**. `_pct_rank` also maps NaN to 0 (F7/F11/F12), and the F6 lithology lookup sends NaN to class 0 (no data), which scores 0.
- On the target side, `engine.py:61/70/71/75/77/78/84` index `target_values[F]` directly. Researcher's `targets.json` deliberately has `null` values ("sample it in the pipeline"), so any target with a still-missing factor raises `KeyError`/`TypeError`.
- **Why it matters:** real Earth layers will have gaps (coastal cells, small islands, Antarctica in some products, GLiM no-data). Those cells get silently pushed down the ranking, which biases blind-rediscovery validation, because famous analogs are often on coasts and islands (Lanzarote, Svalbard, Devon Island).
- **Status (update 2): resolved.** Contract v1.1.1 §3.2 items 5–6 and this branch's engine/mock changes (§0.1). Threshold is 70% (not the 80% proposed here). `test_missing_earth_value_is_missing_not_zero` replaces the old pinning test.
- **Original fix proposal:** a contract decision is needed (§7 C1). Recommended: renormalize weights over the factors that have data in each cell, require at least 80% of profile weight to be present (otherwise S = NaN, excluded and shown as "insufficient data"), and treat target nulls as "factor dropped for this target", listed in `targets.json`. The current behaviour is pinned by `test_missing_earth_value_counts_as_zero_similarity`, so the change will be deliberate.

**H3. The Monte Carlo spec is ambiguous enough to make the "robust" badge meaningless.** MC isn't implemented yet: mock writes `draws: 0`, and `median_rank` is the NMS index (`mock.py:294, 320`).
- **α scale.** `profiles.json → monte_carlo.dirichlet_alpha_scale = 50` with "α = 50·w". If w is the integer percent weights (Σ = 100), α0 = 5,000 and the F9 weight in P2 moves by only **0.64 pp** (SD, measured over 20k draws), so nearly every site would be "robust". If w is normalized (Σ = 1), α0 = 50 and the SD is **6.39 pp**, which matches what the plan means.
- **Zero weights.** Every profile has at least one w = 0. `numpy.random.default_rng().dirichlet` returns 0 for α = 0, but legacy `np.random.dirichlet` raises `alpha <= 0`, and gamma-based JS samplers return NaN.
- **Rank definitions.** "Median rank" and "top-k frequency" don't say whether ranks are among all Earth cells, cells passing the hard filters, or the candidate pool.
- **Status (update 2): resolved.** v1.1 replaced top-k with "area-weighted top 5% of land in ≥ 80% of draws", and v1.1.1 normalised α over active factors. MC is implemented in `score/robust.py` and is now tested: α scale/variance, exact-zero weights, seeding, chunk invariance, float64 reference, threshold, 0.8 boundary.
- **Original fix proposal:** see §7 C4. The benchmark's proposed implementation (`pipeline/benchmarks/bench_scoring.py`) uses normalized α over active factors only.

### Medium

**M1. Percentiles of tied values depended on cell order. Fixed.**
- `engine.py:13-25` ranked ties with `argsort(kind="stable")`, so tied cells got different percentiles in `cell_id` order, which runs north to south.
- Measured on the mock Earth grid (8,252 cells):
  - `cutoff_rigidity_gv`: largest tie group is 1,026 cells (12%), with a within-group percentile spread of **0.124** that follows cell order (r = −0.61).
  - `uv_index`: spread 0.021.
  - `aridity_index`: spread 0.011.
- Real uint8 columns (rigidity, UV: ≤ 254 distinct values over ~85k cells) will have much larger tie groups. This would also break JS parity, since any port that orders ties differently gives different scores.
- **Status (update 2):** superseded by v1.1.1's area-weighted mid-rank (`grid.area.weighted_pct_rank`, P = (weight below + ½ tie weight) / total). The engine keeps missing values as NaN.
- **Fix (applied in the first pass):** midrank, P = midrank / (n_finite − 1), NaN → 0 as before. Tests check order independence under permutation. **Mock assets will change slightly when regenerated.**

**M2. The Earth clip has two possible sources that disagree.** `engine.clip_targets` (`engine.py:48`) runs `np.nanpercentile` (linear) on decoded, quantized values. The manifest's `stats.p005/p995` come from **pre-quantization** values (`grid/binary.py:48-54`). A JS port will naturally read the manifest, so t* can differ by up to one quantization step.
- Neither source applies the cos(lat) area weighting that `DATA_CONTRACT.md` §1 mentions for "global statistics".
- **Fix:** pick one (§7 C3). Also compute these target-independent bounds and the F7/F11/F12 percentile arrays **once per Earth grid**, not once per target (4 `_pct_rank` calls ≈ 8 ms each at 85k cells).

**M3. Candidate-pool selection isn't reproducible when scores tie.** `export/mock.py:274` uses `np.argsort(-s[f][ok])` with the default unstable quicksort. Several factors have discrete scores: F3 ∈ {0, .25, .5, .75, 1}, F6 takes matrix values, F8 = 1 for every fully barren cell, F13 is a fraction of bits. So which 50 cells enter the pool for those factors depends on the numpy version and platform, and a JS port can't match it.
- **Fix:** `np.lexsort((cell_id, -S, -s_f))`: s_f descending, then S descending, then cell_id ascending. Write the rule into the contract (§7 C5).
- **Status (update 2): resolved.** Contract v1.1.1 §3.2 item 7; `engine.candidate_indices` implements it, with tests for exact ties at the top-N cut.

**M4. Performance at production scale.** Full numbers are in §2.
- The naive Monte Carlo (one `aggregate` call per draw) costs 3.2 s per (target, profile) at 85k cells. That's about **4.3 min** for 80 pairs (*extrapolated*), with 652 MiB for a 1000 × N float64 block.
- A full broadcast (720·360·18·5·1000 = 2.33e10 values) would be **187 GB** in float64. Nothing in the repo does this, but nothing chunks either, because MC doesn't exist yet.
- `mock.py:262` recomputes `factor_scores` for each profile. Caching per target cuts the 80-pair deterministic pass from 4.56 s to 1.11 s.
- Recommended design: measured 8.3 s for all 80 pairs × 1000 draws on 8 processes, peak 105 MiB per process.
- **Status (update 2):** factor cache adopted (`engine.FactorCache`). The merged area-weighted MC was 6.8–7.0× slower per pair than needed because it fully sorted every draw. Fixed, see §2.1.

**M5. Quantization clips out-of-range values silently and turns ±inf into valid numbers.** `grid/binary.py:22-31`.
- The fixture shows it: in the Earth `ts_mean_k` column (offset 150 K), 100 K decodes as **150 K** and 1000 K as **805.34 K**. `+inf` becomes 65534 (a valid value), not nodata.
- Clipped values can't be told apart from real ones at max − 1.
- The `uint32` branch (`:22`) casts NaN or negative values without checks.
- `aridity_index` can encode at most 6.5534, so anything wetter is clipped to that value.
- **Fix:** treat non-finite values as nodata, count out-of-range values per column, and raise above a threshold or record `n_clipped` in the manifest (§7 C6).

**M6. JS grid decoding: precision is fine, robustness isn't.** `web/src/data.ts:25-31`.
- Decoding into `Float32Array` changes S by at most **9.2e-8** versus Python float64 on the mock grid, and the top 25 cells are identical for all 5 profiles (measured). That's fine for the UI, but **engine-level parity tests must use a tolerance around 1e-6**.
- The binary fetch has no `r.ok` check, so a 404 HTML page would decode as garbage.
- `manifest.byte_order` is ignored, and typed-array views assume a little-endian host. That's true for every mainstream browser, but asserting it or using `DataView` costs nothing.
- The new parity test checks alignment, nodata → NaN and float32 precision on a fixture with odd-length uint8 columns.

### Low

- **L1. NaN in the scalar geometric mean depends on argument order.** `normalize.py:58`: `max(nan, 0.01)` is `nan`, but `max(0.01, nan)` is `0.01`. JS `Math.max(NaN, …)` is NaN (`normalize.ts:31`), while the engine floors NaN. That's three different behaviours. A missing score key raises `KeyError` in Python but gives NaN in JS. Align these with the H2 decision. **Python resolved (update 2):** `geometric_mean` drops absent/None/NaN scores, renormalises, and takes an optional `min_coverage`; `total_score` averages the secondaries that are present. **JS `normalize.ts` still needs the same change** (Programmer).
- **L2. Set cover depended on the hash seed. Fixed.** `setcover.py` summed gains over a Python `set` of factor IDs, so the order (and so the last float bits) depended on `PYTHONHASHSEED`, which could flip exact ties. `s in chosen` was an O(n) deep dict comparison. Now it uses ordered lists, tracks sites by index, and has a hash-seed regression test.
  - Remaining: JS `greedyPortfolio` returns only the chosen sites, while Python also returns covered and uncoverable. The tie rule (first site in pool order wins) should go in the contract (§7 C5).
- **L3. All-zero weights crashed `aggregate()`. Fixed.** It raised `ZeroDivisionError` (`engine.py:97`), for example when a Custom profile has every slider at 0, while scalar `geometric_mean` returns 0. It now returns zeros.
- **L4. F13 used a per-cell Python loop. Fixed.** `engine.py:84-87` took 12.4 ms of ~60 ms per `factor_scores` call at 85k cells. A popcount lookup table takes 0.2 ms, with identical results (tested for all 256 flag values).
- **L5. Hard filters aren't applied inside the engine.** Callers have to remember `np.where(mask, total, 0)` (`mock.py:265`), and "P5 disabled for Moon" isn't enforced in the engine. Add a single `score(earth, target, profile) -> (S_core, S, mask)` entry point. **Resolved (update 2):** `engine.score_profile` returns core, total, S (filtered 0, insufficient NaN), mask, coverage and sufficient.
- **L6. `cell_id` has no lower clamp.** `grid/__init__.py:32` and `normalize.ts:42`: lat > 90 gives a negative ID. A NaN latitude raises in Python and gives NaN in JS. Validate inputs.
- **L7. Mock robustness fields are placeholders.** `median_rank` is the NMS index, `topk_freq` is 0 and `draws` is 0 (`mock.py:294, 320`), and the pool is cut to 200 sites (`mock.py:301`; the spec says ~500). The UI shouldn't show "robust" badges from mock data. **Update 2:** v1.1.1 mock now runs the real MC. The 200-site pool cut remains.
- **L8. Two MapView bugs (Programmer).** `onSelect` is captured once at mount, so it goes stale (`MapView.tsx:56-62`). In StrictMode dev, the double mount creates two `Map` instances, and cleanup only calls `setTarget(undefined)` (`:63`). Call `map.dispose()` and keep the callback in a ref.
- **L9. Tests aren't type-checked.** `web/tsconfig.app.json` excludes `src/**/*.test.ts`, and vitest doesn't type-check. Add a `tsconfig.test.json` or run `vitest --typecheck`.

### Nit

- **N1.** The `normalize.py:1` docstring cites DATA_CONTRACT "section 4", but the normalization rules are in §3.1.
- **N2.** `test_normalize.py:162` checks only the latitude of the round-tripped cell centre, not the longitude.
- **N3.** `quantize` uses `np.round` (half-to-even). If JS ever quantizes (for example user uploads), `Math.round` is half-up.
- **N4.** CI runs Python 3.12 but the box venv is 3.13. Fine, but worth noting in the README.
- **N5.** Scalar `ordinal_class` doesn't clamp at 0 for out-of-range classes, while the engine does.

## 2. Performance (measured)

Script: `pipeline/benchmarks/bench_scoring.py`. It uses synthetic Earth columns quantized like `earth_features.bin`, so ties are realistic, and 18 synthetic targets (10 Moon, 8 Mars). That gives 80 (target, profile) pairs, since P5 is Mars-only. Peak memory is the tracemalloc peak of numpy allocations in each stage.

| Stage | 85,000 land cells | 259,200 cells (full 720×360) |
|---|---|---|
| `factor_scores`, one target (old → this PR, best of 5) | 60.5 → 56.5 ms | 196.1 → 170.7 ms |
| `aggregate`, one profile | 3.3–4.7 ms | 13.6 ms |
| Deterministic pass, 80 pairs, `factor_scores` recomputed per profile (mock.py style) | 4.56 s | 13.47 s |
| Same, `factor_scores` cached per target | **1.11 s** | **3.66 s** |
| Naive MC (`aggregate` per draw), one pair | 3.22 s / 1000 draws, peak 652 MiB | 4.16 s / 300 draws, peak 605 MiB |
| Naive MC, 80 pairs × 1000 draws | ≈ 258 s (*extrapolated* 3.22 × 80) | ≈ 1,110 s (*extrapolated* 4.16 / 300 × 1000 × 80), ~2 GB/pair if D×N is kept |
| **Proposed MC**, one pair, 1000 draws, chunks of 100 | 0.46 s (1 BLAS thread) / 0.72 s (8 threads), peak 103 MiB | 1.88 s, peak 310 MiB |
| **Proposed MC**, 80 pairs, serial | 48.4 s, peak 105 MiB | 141.5 s, peak 317 MiB |
| **Proposed MC**, 80 pairs, 8 processes | **8.3 s** (`OPENBLAS_NUM_THREADS=1`) / 34.2 s (default threads, oversubscribed) | 59.5 s (default threads) |
| Naive full broadcast 720·360·18·5·1000 | 2.33e10 values = 187 GB f64 / 93 GB f32 | |

**Proposed MC design** (`mc_matmul` in the benchmark):
1. Per target, compute `L = log(max(s_f, 0.01))` once as a K × N float32 array (active factors only) and `nudge = (0.9 + 0.1·S_sec)·mask`.
2. Per profile, draw `W` (D × K, Dirichlet with α = 50·w/Σw over w > 0).
3. Per chunk of c draws: `S = exp(W_c @ L) * nudge`, a c × N float32 block. Because aggregation is a weighted log-sum, the whole MC reduces to one small GEMM per chunk.
4. Top-k uses `np.partition` along the contiguous axis. Ranks are computed only for the ≤ 500 candidates.

**Layout matters.** Partitioning an N × c block along axis 0 took 91 ms per 100 draws at 85k, versus 18 ms for c × N along axis 1 (329 vs 54 ms at 259k). The first version of this design was 3× slower for that reason alone.

**More options, not measured:**
- Restrict N to cells passing the hard filters (the P2 and P5 filters remove a large share of land; not measured on real data).
- Precompute target-independent percentile arrays once.
- numba isn't needed: after the GEMM, the remaining cost is `exp` plus `partition`.

Per-chunk breakdown at 85k cells, 100 draws: GEMM 2.9 ms, `exp` 8.1 ms, partition 18.0 ms, candidate argsort 0.9 ms.

### 2.1 Update 2: shipped MC (`score/robust.top_frac_freq`, contract v1.1.1 rule)

Same script, on contract v1.1.1 (`90454a3`) plus this branch, `OPENBLAS_NUM_THREADS=1`, 1000 draws, chunks of 100. The box load average was 4–11 during these runs because other agents were working, so treat timings as ±30%.

| Stage | 85,000 land cells | 259,200 cells (full 720×360) |
|---|---|---|
| One pair, merged v1.1.1 threshold (`_wq_rows_full`: full stable sort of every draw) | 12.30 s | 27.13 s |
| One pair, this branch (`_wq_rows`: top slice) | **1.82 s** (6.8×), peak 80 MiB | **3.88 s** (7.0×), peak 243 MiB |
| Frequencies identical to the full-sort version | yes (`np.array_equal`) | yes |
| All 80 pairs, serial | 152.5 s | 353.5 s |
| **All 80 pairs, 8 processes** | **17.1 s** | **61.9 s** |
| Deterministic pass, 80 pairs, per-profile recompute → `FactorCache` | 10.76 s → 3.16 s | 21.24 s → 6.41 s |

**Why it was slow.** The v1.1 rule needs an area-weighted P95 per draw, not just the k-th largest value. `_wq_rows_full` did a stable `argsort` of every c × N chunk, which took ~700 ms per 50 draws at 85k. P95 only depends on the top ~5% of cells. So `_wq_rows` does one batched `np.partition` per chunk to get each draw's m-th largest value (m ≈ 1.3 × 5% × N). Then, per draw, it stable-sorts only the cells ≥ that value (whole tie groups, same index order as the full sort) and rebuilds the weighted CDF of that suffix from the total area. If the first suffix cell is already above q (the top cells hold little area), it widens m 4× and repeats. It then applies the same Hazen interpolation, so the result equals `grid.area.weighted_quantile`. Thresholds agree to ≤ 1e-12 relative (float summation order). Tests: `test_fast_rows_match_full_sort` (ties, S = 0 cells, random weights) and `test_widening_when_top_cells_have_little_area`. The deterministic pass is slower than in §2 (3.16 s vs 1.11 s at 85k) because v1.1 made every percentile and clip area-weighted.

A full-grid run (80 pairs × 1000 draws) now fits in about a minute on 8 cores. Peak memory is ~340 MiB per process at 259k cells with chunk 100. Lower `chunk` if memory matters.

## 3. Web bundle (measured with `vite build`, Vite 8.3.3)

| Variant | Initial JS (min / gzip) | Lazy JS (gzip) | Total JS gzip | Vite warning |
|---|---|---|---|---|
| Baseline (`origin/main`) | 539.78 kB / **162.56 kB** | – | 162.56 kB | yes (> 500 kB chunk) |
| A: `codeSplitting` groups (vendor-ol, vendor-react) | 7.93 + 218.73 + 312.87 kB / 3.31 + 68.24 + 91.67 kB (all modulepreloaded) | – | 163.2 kB | no |
| C: `React.lazy(() => import('./components/MapView'))` + `<Suspense>` | 226.45 kB / **71.18 kB** | 92.50 kB | 163.7 kB | no |
| D: C + `preact/compat` alias (build-only check, **not runtime-tested**) | 26.22 kB / **10.56 kB** | 92.47 kB | 103.0 kB | no |

Composition of the baseline chunk (source-map-explorer):

| Share | Package |
|---|---|
| 57% (307 kB) | `ol` (render 67 kB, renderer 29 kB, style 24 kB, geom 19 kB, source 18 kB, Map 17 kB, View 16 kB, expr 16 kB, …) |
| 38% (207 kB) | `react-dom` |
| ~1% each | `react`, `rbush` |
| ~7 kB | App code |

Takeaways:
1. **The plan's budget is already met.** The JS bundle is under 0.5 MB and first load is under 3 MB gz. The warning is only Vite's 500 kB-minified-chunk heuristic.
2. **`ol` is already imported per module** (`ol/Map`, `ol/source/WMTS`, …), so there's nothing left to tree-shake. Most of `ol/render` and `ol/expr` comes in through `VectorLayer` and the style system.
3. **Recommended (Programmer, `web/` only): variant C.** It's a 3-line change in `App.tsx`. It cuts initial JS by **56%** (162.6 → 71.2 kB gz), lets the controls and gap panel render before OpenLayers loads, and removes the warning. Add variant A on top if long-term caching of vendor chunks matters. Consider D only after testing React 19 features under preact.

These trials ran in a scratch copy. **No `web/` source change is in this PR** apart from the new test file.

## 4. Test coverage

| Suite | Before | After this PR |
|---|---|---|
| pytest | 48 passed. Total 30% statements+branches; `score/engine.py` 0%, `grid/binary.py` 38%, `grid/columns.py` 0%, `export/mock.py` 0% | **86 passed**. Total 54%; `engine.py` **100%**, `binary.py` 95%, `columns.py` 100%, `setcover.py` 95%, `normalize.py` 90% |
| vitest | 9 passed. `normalize.ts` 90.8% statements / 78.4% branches; `data.ts` 0% | **19 passed**. `normalize.ts` 92.3% / 83.8%; `data.ts` 79.3% / 90% (`loadGrid` now tested) |
| `npm run build` | passes (warning) | passes (warning unchanged, see §3) |

**After update 2** (rebased on v1.1.1): pytest **136 passed**, total 66% statements+branches; `engine.py` 99%, `robust.py` 98%, `setcover.py` 96%, `normalize.py` 91%. `mock.py` is still 0% (exercised only by regenerating the assets, whose schemas the suite validates). vitest 19 passed; build passes with the same warning.

Still untested:
- `export/mock.py` (candidate pool, NMS, validation metrics, AUC). It's generator code, but the real exporter will copy it, so test pool, NMS and AUC on toy inputs.
- `grid.haversine_km`, `lon_centres` and `lat_centres`.
- `normalize.capped_directional` and `clip_target` (exported but unused by the engine).
- All of `App.tsx` and `MapView.tsx`. Component tests would need jsdom and an `ol` stub.

## 5. Changes in this PR (small, behaviour-preserving except M1)

| File | Change |
|---|---|
| `pipeline/analog_portfolio/score/engine.py` | Midrank percentile for ties (M1); popcount LUT for F13 (L4, identical output); all-zero weights return 0 (L3) |
| `pipeline/analog_portfolio/score/setcover.py` | Ordered iteration and index-based tracking (L2). Same results on all existing vectors and 80 random fixture cases |
| `pipeline/tests/test_engine.py`, `test_binary.py`, `test_setcover_edges.py` | New: engine vs scalar reference, clip, filters, percentiles, NaN and 0^0 edges, binary round trip (alignment, endianness, nodata, clipping), set-cover ties, hash seed |
| `pipeline/tests/make_parity_fixture.py`, `fixtures/parity_*`, `test_parity_fixture.py` | New shared Python/JS parity fixture and freshness check |
| `web/src/scoring/parity.test.ts` | New: runs the fixture through the JS port and `loadGrid`. Test-only, no app code touched |
| `pipeline/benchmarks/bench_scoring.py` | New benchmark used for §2. Not part of the test suite |
| `.gitignore` | Coverage artefacts |

**Regenerating mock assets** (first pass): not done then, to keep the PR small.

**Update 2 commit** (on top of contract v1.1.1):

| File | Change |
|---|---|
| `pipeline/analog_portfolio/score/engine.py` | Missing-data rule (NaN = missing, per-cell renormalisation, 70% coverage, `insufficient_data`); null/non-finite target values drop target-dependent factors; never raises on null/NaN/absent columns/empty grids; `score_cells`, `score_profile`, `candidate_indices` (canonical tie-break), `target_dropped_factors`, `FactorCache` |
| `pipeline/analog_portfolio/score/robust.py` | `_wq_rows` top-slice threshold (7×, identical output), guard for nothing-scorable, `robust_flags` |
| `pipeline/analog_portfolio/score/setcover.py` | A null/NaN factor score never covers |
| `pipeline/analog_portfolio/score/normalize.py` | Scalar `geometric_mean`/`total_score` skip missing scores (L1, Python side) |
| `pipeline/analog_portfolio/export/mock.py` | Factor cache, `score_profile`/`candidate_indices`, `valid=` to MC, `data_coverage`, `insufficient_cells`, `targets[].dropped_factors`, insufficient cells skipped in validation |
| `pipeline/analog_portfolio/schemas_gen.py` + `contract/schemas/{targets,portfolio,validation}.schema.json` | Minimal additive fields: `targets[].dropped_factors`, site `data_coverage`, portfolio `insufficient_cells` (regenerated; drift check clean) |
| `docs/DATA_CONTRACT.md` | Documents those fields and the active-weight / null-export details; changelog row. No rule or value changed |
| `web/public/data/mock/*` | Regenerated: only the new fields are added; existing values byte-identical |
| `pipeline/tests/test_missing_data.py`, `test_robust.py`, `test_engine.py` | 70% boundary (exact, just above, just below, 10 equal weights), all-NaN cell / grid / columns, empty grid, target null, invalid F6 code, zero weights in MC, MC determinism and chunk invariance, float64 MC reference, threshold vs full sort and widening, area weighting, 0.8 boundary, dominant/filtered/insufficient cells, tie-break and pool exclusion |
| `pipeline/benchmarks/bench_scoring.py` | Times the shipped `top_frac_freq`; `--full-sort-pair`, `--missing` |

## 6. Not done / follow-ups

- No JS engine-level parity yet: the JS engine doesn't exist. See H1 and §7 C7.
- `feat/web-ui` wasn't on the remote at review time, so the TS scorer on that branch wasn't reviewed.
- Bundle variants A, C and D were measured in a scratch copy, not applied, because `web/` belongs to Programmer.
- ~~MC isn't implemented.~~ Implemented in v1.1.1, sped up and tested in update 2.
- **Update 2 follow-ups (not done here):**
  - JS: `normalize.ts` `geometricMean`/`totalScore` and the `feat/web-ui` engine (`nan0`/`clip01` map NaN → 0) need the same missing-data rule. JS `greedyPortfolio` must treat null as "doesn't cover". `web/src/types/contract.ts` still types `robustness{median_rank, topk_freq}` and `monte_carlo{top_k}` (type-only, unused). Left to Programmer (`web/`).
  - GLiM code 0 (`nd`) is still class 0 with similarity 0, not missing (literal reading of the contract). If GLiM `nd` really means "no data", map it to NaN in the extractor.
  - `uncoverable` still lists dropped factors (unchanged v1.1.1 behaviour). The UI may want to show them as "no target data" instead.
  - Real data with NaNs will change S for affected cells. The mock grid has no NaN cells, so the mock can't show this.

## 7. Proposed contract changes (NOT applied; Project 1 to decide)

- **C1. Missing-data policy (H2).**
  - Earth NaN in factor f: drop f for that cell and renormalize weights. If the present weight is below 80% of the profile total, S = NaN (excluded from ranking, shown as "insufficient data").
  - Target `null`: drop the factor for that target, renormalize, and list it in `targets.json → features[F].source = "missing"`.
  - Scalar functions (Python and JS): NaN in means "missing", never floored.
- **C2. Percentile definition (M1).** P = midrank / (n − 1) over finite values of the shipped Earth file (land cells, `water_frac < 0.5`), unweighted; NaN → 0 (or excluded under C1). Say explicitly whether the cos(lat) area weights apply to percentiles and P0.5/P99.5. Today the contract says "global statistics" and the code doesn't apply them.
- **C3. Earth clip source (M2).** t* bounds = manifest `stats.p005/p995`, computed by `write_grid` on the **quantized** values using numpy's `linear` method. Both runtimes read them from the manifest.
- **C4. Monte Carlo (H3).**
  - α_i = 50 · w_i / Σw over w_i > 0 only (α0 = 50); zero-weight factors stay at 0.
  - Top-k frequency and median rank are computed among cells passing the hard filters (or "among the candidate pool"; pick one and name it).
  - Draws are generated once offline (numpy PCG64, seed 20261114) and shipped. A live JS MC for Custom profiles uses its own RNG and is labelled approximate.
- **C5. Tie-breaks (M3, L2).**
  - Candidate selection sorts by s_f desc, then S desc, then `cell_id` asc.
  - The pool for set cover is ordered by S desc, then `cell_id` asc.
  - Greedy ties go to the earliest site in pool order.
- **C6. Binary encoding (M5).** Non-finite → nodata. Add `n_clipped_low` and `n_clipped_high` per array to the manifest, and make the writer fail when they exceed 0.1% of cells.
- **C7. Engine-level test vectors.** Add to `test_vectors.json`: about 20 Earth cells × all columns (including NaNs and ties), one Moon and one Mars target, and the expected per-factor s, S_core and S for every profile. Tolerance 1e-6, to absorb the float32 decode (M6). This is what holds the Worker scorer to the Python reference.
- **C8. "Earth median"** for `candidate_min_score`: over hard-filter-passing cells (what mock does) or over all land cells. State which.

## 8. How to reproduce

```bash
# Python (from pipeline/)
pip install -e ".[dev]" pytest-cov
pytest -q --cov=analog_portfolio --cov-branch --cov-report=term-missing
python tests/make_parity_fixture.py            # regenerate the parity fixture after changing normalize/setcover
OPENBLAS_NUM_THREADS=1 python benchmarks/bench_scoring.py --cells 85000 --jobs 8
python benchmarks/bench_scoring.py --cells 259200 --naive-draws 300

# Web (from web/)
npm ci && npm test && npm run build
```
