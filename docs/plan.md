# Build plan: NASA Space Apps 2026, Earth analogs for permanent Moon base sites and Mars

*Owner: Project 1 (integration, scoring method, final deliverables). Drafted Thu Oct 8, 2026 (IST). Status: **planning notes only.***

> **Update, Oct 8, 2026 (repo copy).** Sounak decided to start building now and accepted the early-work risk; the plan will be revised after the Oct 28 statement and the Nov 13 guides. The rule-guard paragraph below is kept for the record. Build status: Phase A scaffold + data contract (`docs/DATA_CONTRACT.md`).

> **Rule guard.** Space Apps says teams must not begin work before the hackathon opens on **Sat Nov 14, 2026, 9:00 AM local time**. This document is planning prose, tables and pseudocode only. It contains no code, scripts, notebooks, data downloads, repo or mockups, and none may be made from it before Nov 14 9:00 AM IST. Plan-only update checkpoints: **Oct 28** (full challenge statement and official resources) and **Nov 13** (2026 Project Submission Guide and Judging & Awards Guide).

Sources: `challenge-brief.md`, `research.md` ([R#] refs), `data-sources.md`, `innovation.md`, `submission.md`, `status.md`.

---

## 1. Concept and pitch

**Working name:** *Analog Portfolio* (the final name is Sounak's call; Graphics will propose options).

**Pitch.** *"No place on Earth is the Moon. So we find the smallest set of places that together are, and say exactly what Earth can't give you."* The user picks a target (one of the nine Artemis south-polar regions, Shackleton Connecting Ridge for Moon Base I, or a Mars landing or base site such as Jezero, Gale, Utopia, or the Arcadia, Erebus and Phlegra ice sites) and a **mission purpose** (landing and mobility, ISRU and ice, habitat and EVA thermal/power, geology and regolith, astrobiology). The engine scores every 0.5° Earth land cell on explainable, physically bounded per-factor similarities. These are ESI-style ratios on kelvin, relief and the like, with **regolith thermophysics (thermal inertia) as the physics-comparable regolith factor**: Mars TES TI and lunar Diviner rock abundance and regolith-temperature anomaly, against Earth apparent thermal inertia, compared as within-body classes. Instead of one "92% Moon-like" ranking, the **Analog Portfolio Optimizer** runs a greedy weighted set cover to return the 2–5 Earth sites that together cover every requirement Earth can meet, with cheapest, highest-fidelity and most-accessible variants. The **Fidelity Gap report** then states what no Earth site can give: 1/6 g or 3/8 g, vacuum, radiation 100–200× Earth's, the lunar ~298 K diurnal swing, ~40 K PSR floors. Each gap is paired with the facility type that fills it. Credibility comes from **blind rediscovery validation**: weights are frozen and committed *before* scoring, then we report what % of ~20 famous analogs (Haughton, Atacama, Dry Valleys, Río Tinto, Mauna Kea, Ries, Sudbury, etc.) land in the top 5% and top 1%, and surface high-scoring unused regions as **new candidate analogs**. That is the challenge's literal ask, "identify and characterize new terrestrial analogs". **Reverse search** ("your hometown's Mars twin") and a **side-by-side twin viewer** (Earth site next to the Moon or Mars site at the same scale, with per-factor bars) are presentation features built on the same scores.

Target awards: Best Use of Science, Best Use of Data, Best Mission Concept.

---

## 2. Scoring method

### 2.1 Targets (target-side feature vectors)

| Body | Targets | How the target vector is built |
|---|---|---|
| Moon (10) | Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2, Slater Plain, Shackleton Connecting Ridge (anchor coordinates in research.md §2.2) | Summaries over a ~15 km radius of the IAU anchor from **native-resolution polar products** (PGDA 240 m illumination and PSR, PGDA 90 / LOLA polar slope, Ice Favorability Index, the Diviner GCP 90S–80S band). The 0.5° lat/lon grid degenerates at the pole, so targets never come from it. Paired regions sharing one anchor (Mons Mouton ×2, Nobile ×2) get offset sample windows, documented. |
| Mars (8) | Jezero, Gale, Utopia/Zhurong, Arcadia AP-1, AP-9, Erebus EM-16, Phlegra PM-1, plus Phoenix as the ice ground truth | Summaries over a ~25 km radius from the Mars layers below. |
| Optional | Mars cave candidates (MGC³ points), 2022 dropped lunar regions | Stretch: a "caves" target class, since the challenge names caves. |

Earth visibility (GDRVIS) and illumination % are shown on the Moon **target card** only and never scored for Earth sites.

### 2.2 Factors and layers (0.5° grid, 720×360 per body, lon −180..180 E-positive)

Earth is the search space (land only, roughly 70–90k cells). Global Moon and Mars 0.5° grids exist for reverse search and the twin viewer; targets use §2.1. Derivatives such as slope, ΔT and PSR fraction are computed at native resolution, **then** aggregated (data-sources.md §9).

| # | Factor | Earth layer | Moon layer | Mars layer | Normalization (research.md §4.2) |
|---|---|---|---|---|---|
| F1 | Mean surface temperature (K) | NASA POWER `TS` climatology (no key) | Diviner GCP 0.5° Tbol, mean over local time; polar targets from GCP 90S–80S | MCD v6.2 `tsurf`, looped over Ls × local time | Ratio sim. `1−\|x−t\|/(x+t)` against the Earth-clipped target t* |
| F2 | Diurnal amplitude ΔT (K) | POWER `TS_MAX − TS_MIN` (upgrade: MOD11C3 day−night, needs Earthdata login) | Diviner GCP max−min over local time | MCD `tsurf` max−min | Ratio sim. vs t*, plus gap report |
| F3 | Regolith thermophysics (thermal inertia class) | Apparent TI = (1−albedo)/ΔT (Price 1977). Albedo from POWER surface albedo (verify the parameter on Nov 14) or MCD43 (login) | Diviner rock abundance + regolith-temperature anomaly (32 ppd) | TES TI 2007 (Putzig & Mellon, 20 ppd); exclude TI < 100 for landing | Within-body percentile → 5 ordinal classes (dusty, fine, sandy, blocky, rocky). Class similarity = 1 − \|Δclass\|/4. Never pooled raw units |
| F4 | Slope / landability | Copernicus GLO-90 COG overview reads (~360 m baseline) → mean slope and fraction < 5°/< 8°. Fallback: ETOPO 2022 1′ slope | LOLA LDSM_16 (global); PGDA 90 / polar 240 m for targets | MOLA MEGDR meg064 or 463 m strided | Bounded fraction `1−\|Δ\|` on the low-slope fraction; baseline recorded per body |
| F5 | Local relief (m) | ETOPO 2022 60″, range or std within the cell | LOLA LDEM_16 / LDRM_16 | MOLA MEGDR meg016 | Ratio sim. on relief (never absolute elevation) |
| F6 | Lithology | GLiM 0.5° (CC BY 3.0) | Unified Geologic Map 1:5M rasterized + LP GRS FeO (highland/anorthosite vs mare/basalt) | SIM 3292 rasterized + Odyssey GRS | Documented similarity matrix (basalt↔basalt 1, basalt↔andesite 0.5, anorthosite↔anorthosite 1…), Gower-style |
| F7 | Aridity | Global Aridity Index v3.1 (CC BY 4.0) | target = hyper-arid | target = hyper-arid | Directional within-Earth percentile (drier = better) |
| F8 | Barrenness | ESA WorldCover bare/sparse + snow/ice fraction (CC BY 4.0). MODIS NDVI optional | lifeless | lifeless | Bounded fraction vs 1.0 |
| F9 | Ground ice / cold trap | ESA CCI Permafrost or NSIDC GGD318. Fallback: POWER mean annual TS < 0 °C | PSR area fraction + Ice Favorability Index in the target window | SWIM v4 depth band (0–1, 1–5, >5 m); fallback Odyssey GRS H₂O | Bounded fraction or depth-band categorical match |
| F10 | Illumination regime | Analytic solar geometry: median noon sun elevation, polar day/night fraction. POWER SW↓ as a secondary input | PGDA AVGVISIB (low sun, ~89–96% lit ridges) | MCD `fluxsurf_dn_sw` / analytic | Gaussian on sun elevation, τ documented |
| F11 | Atmospheric shielding (radiation + pressure), **capped** | Cutoff rigidity from IGRF dipole (Störmer ≈14.9·cos⁴λ_m GV) + atmospheric depth from elevation | constant (no field, no atmosphere); 1369 µSv/d [R20] | MCD `ps` column mass, checked against RAD at Gale | log10 + directional percentile × cap c (§2.4) |
| F12 | Surface UV, **capped** | POWER `ALLSKY_SFC_UV_INDEX` | unshielded | ~10³ × Earth (inferred) | Directional percentile × cap |
| F13 | Geomorphic flags | Hand-curated cited lists: impact structures, lava tubes and caves, periglacial terrain | craters, PSRs, massifs | craters, caves (MGC³), debris-covered glaciers | Binary match, arithmetic |
| — | Logistics (**separate axis, not similarity**) | MAP travel time to cities 2015 (CC BY, verify) + Natural Earth airports (PD) | — | — | "Easiest to reach" hard filter (MAP travel time to a city of 50k+ ≤ 6 h) and the access time on site cards |
| — | Gravity, vacuum, Earth visibility | **not scored** | shown | shown | Fidelity Gap / target card |

### 2.3 Aggregation

1. **Earth-achievable clip.** For each factor, t* = clip(t, Earth P0.5, Earth P99.5). Score against t*, store `gap = |t − t*|` and show it next to the score.
2. **Hard filters (per profile).** All profiles: land, not open water, built-up fraction < 50%. ISRU-ice: permafrost present or mean annual TS < 0 °C. Mars targets (every profile, including Astrobiology; contract v1.2, research.md §8): the Mars gate, i.e. arid (AI ≤ 0.20), mostly bare ground (≥ 50%), a cold desert on permafrost, or an impact / young volcanic landscape that is not wet and green; it replaced the earlier Astrobiology-only aridity filter and was designed after the first validation run, before the freeze. Astrobiology is disabled for Moon targets and greyed out with a reason.
3. **Core score.** Weighted geometric mean over F1–F10: `S_core = Π s_i^(w_i/Σw)`, with s floored at 0.01 so a zero produces a strongly low score rather than NaN. One terrible factor can't be hidden (ESI-style [R80]).
4. **Secondary nudge.** `S = S_core × (0.9 + 0.1 × S_sec)`, where S_sec is the arithmetic mean of F11–F13. Capped factors can only break ties.
5. **Per-factor breakdown** (bars plus gap numbers) for every cell. This is the "characterization" the challenge asks for.

**Initial mission-purpose weights (core F1–F10, each profile sums to 100).** These get finalized by Project 1 and Researcher in the first hour of Nov 14, then committed before any scoring (the pre-registration in §2.6).

| Factor | P1 Landing & mobility | P2 ISRU / ice | P3 Habitat, EVA & power | P4 Geology & regolith | P5 Astrobiology (Mars) |
|---|---|---|---|---|---|
| F1 Mean T | 5 | 15 | 20 | 5 | 10 |
| F2 ΔT | 5 | 5 | 20 | 5 | 10 |
| F3 Thermal inertia class | 15 | 10 | 5 | 25 | 5 |
| F4 Slope | 25 | 10 | 10 | 5 | 5 |
| F5 Relief | 20 | 5 | 5 | 15 | 5 |
| F6 Lithology | 5 | 5 | 0 | 30 | 15 |
| F7 Aridity | 5 | 10 | 5 | 5 | 25 |
| F8 Barrenness | 15 | 5 | 5 | 10 | 15 |
| F9 Ice / cold trap | 0 | 30 | 10 | 0 | 10 |
| F10 Illumination | 5 | 5 | 20 | 0 | 0 |

Presets cite the campaigns they mirror: Desert RATS and Black Point (P1), PISCES/RESOLVE on Mauna Kea (P2/P4), HMP and HI-SEAS (P3), Apollo Ries and Sudbury (P4), ASTEP and Atacama (P5). A Custom mode exposes the sliders.

### 2.4 Fidelity gaps (three tiers)

| Tier | Factors | Handling |
|---|---|---|
| **Irreducible** (never scored) | Gravity (Moon 1.62, Mars 3.73 vs 9.82 m/s²); vacuum; radiation magnitude (~97× Mars, ~208× Moon); UV magnitude (~10³) | Constant panel with absolute numbers [R20][R31][R45][R47][R59]. F11/F12 enter only as capped tie-breakers. Cap c = ratio similarity of Earth's most extreme value to the target (e.g. a Mars-pressure cap of ≈0.025 even at 0.5 bar) |
| **Out of Earth range** (scored against t*, residual shown) | Lunar ΔT ~298 K; PSR ~40 K; polar-ridge cold; Mars mean pressure | The portfolio "covers" these only up to Earth's extreme. The panel shows "best Earth: X; target: Y; residual: Z" |
| **Coverable** | Everything else | Normal set cover |

Facility lookup (static JSON written by Researcher): gravity → parabolic flight, drop tower, ARGOS-type offload; vacuum and PSR cryogenics → thermal-vacuum or cryo-vac chamber; radiation → heavy-ion beam facility (NSRL-type); regolith mechanics → simulant labs (e.g. LHS-1/NU-LHT, MGS-1); dust electrostatics → dusty-plasma chamber.

### 2.5 Analog Portfolio Optimizer (greedy weighted set cover)

- **Candidate sites.** For each factor with w > 0, take the top 50 cells by s_f that pass the hard filters and have S ≥ the area-weighted Earth land median. Apply non-max suppression with a 300 km great-circle (haversine) radius, which gives a pool of roughly 500 sites or fewer.
- **Coverage.** Site j covers factor f if s_f(j) ≥ θ_f (default 0.7, set per profile). The universe U is the factors with w_f > 0 that some site can cover. Factors no site covers go to the gap panel.
- **Greedy step** (pseudocode, ≈50 lines when built):
  `while U not empty and |portfolio| < 5: pick j maximizing Σ_{f∈U∩cover(j)} w_f · s_f(j); add j; U ← U − cover(j)`
  (Contract v1.1: no cost term; accessibility is a hard filter on the pool, below.)
- **Variants (contract v1.1, three):** `best_match` (full candidate pool), `easiest_to_reach` (pool filtered to cells with MAP travel time to the nearest city of 50k+ ≤ 6 h before set cover; no cost weighting), `one_continent` (pool restricted to one continent; the continent with the best coverage wins). A variant with no feasible portfolio is exported as unavailable with a reason.
- **Output per site:** the factors covered (colour chips), per-factor bars vs target, gap residuals, Monte Carlo robustness, and logistics.

### 2.6 Robustness and validation

- **Monte Carlo weight sensitivity.** 1,000 Dirichlet draws centred on the profile weights (α = 50·w). For each (target, profile), report how often each candidate site's cell lands in the top 5% of Earth land (cos(lat) area-weighted threshold, recomputed per draw). "Robust" badge if that frequency is ≥ 80%; the frequency is exported per site. Precomputed for presets offline; a live 200-draw worker run for Custom is a stretch.
- **Blind rediscovery.** Researcher writes a cited CSV of about 20 known analogs (research.md §3.5), each with body, purpose and coordinates, plus about 10 negative controls (humid forest, cities, NEEMO as operations-only). Weights and thresholds are **committed before the first scoring run** (timestamped in git) and never tuned to the validation set. Bug fixes are allowed and logged.
- **Metrics:** % of known analogs in the top 5% and top 1% for their matching target and profile, rank-AUC against the negative controls, and a per-site percentile table. Percentiles and the top-5%/1% thresholds are cos(lat) area-weighted over land cells, because a 0.5° cell's area shrinks with latitude.
- **New candidates:** high-S sites more than 300 km from any known analog, labelled "candidate, needs field confirmation."
- **Resolution honesty.** A 0.5° cell is ~55 km north–south but only ~55.6·cos(lat) km east–west (about 56 × 12 km at 77.5°S, 55 × 33 km at 54°N), so it is regional screening, and all land fractions, percentiles and thresholds are area-weighted. Haughton (23 km) is sub-cell. The top ~20 sites per preset get offline drill-down enrichment from Copernicus 90 m window stats, Macrostrat units (CC BY 4.0), a SoilGrids point query and the nearest airport.

---

## 3. Architecture and stack

**Recommendation: offline Python preprocessing → small static precomputed assets → static web app with client-side scoring, on GitHub Pages.**

| Layer | Choice | Why |
|---|---|---|
| Preprocessing | Python 3 venv: rasterio (bundled GDAL 3.12 handles PDS3 labels, COG, `/vsicurl/`), xarray, numpy, pystac-client, ppigrf, geopandas, earthaccess (only if login) | Every access pattern was already exercised in data-sources.md (38 OK). Runs once on the box, a few hours at most. |
| Precomputed outputs | `earth_features` (land cells × ~16 features, quantized uint8/uint16 + manifest JSON with units, scale and offset), `moon_grid` / `mars_grid` (reverse search), `targets.json`, `profiles.json`, `portfolios/<target>_<profile>.json` (MC + set-cover variants), `validation.json`, `sites/*.json` (drill-down), `gaps.json`, `provenance.json` | Tiny, cacheable, no runtime dependence on fragile APIs (ASU, MCD and POWER rate limits). |
| Front end | Vite + TypeScript + React; **OpenLayers** for maps; SVG or Chart.js bars | OpenLayers natively handles EPSG:4326 and polar-stereographic WMTS, so **NASA GIBS** (Earth basemap) and **NASA Trek** EQ/south-polar tiles (Moon/Mars) work without reprojection hacks. MapLibre is Web-Mercator only. |
| Scoring in browser | The same formulas as the Python reference, run on typed arrays in a Web Worker; shared test vectors guarantee parity | Sliders re-score ~85k cells in < 100 ms; Custom profiles and reverse search are free. |
| Hosting | **GitHub Pages** via GitHub Actions (primary); Cloudflare Pages mirror (fallback) | Free, no secrets, no server to keep alive during judging, same public repo under NetRunnerXD that judges see. Vercel works too but adds nothing for a static site. |
| CI | Actions: lint → Python tests (pytest) → JS tests (vitest) → build → deploy; gitleaks; Dependabot | Cheap safety net with 36 hours on the clock. |

**Data volume estimates**

| Item | Size |
|---|---|
| Raw downloads (box only, gitignored, checksummed): Moon ≈ 3.3 GB (mostly Diviner GCP ASCII), Mars ≈ 0.4 GB + a few hundred MCD calls, Earth ≈ 1.5 GB + ~650 POWER regional calls + Copernicus overview reads (1–2 h) | ≈ 5–6 GB |
| Shipped site assets: earth_features ≈ 1.5–3 MB, moon/mars grids ≈ 2 MB each, portfolios (~18 targets × 5 profiles × ~20 KB) ≈ 2 MB, sites + validation < 1 MB, JS bundle < 0.5 MB | **< 10 MB total, < 3 MB gzipped first load** (Pages limits: 1 GB site, 100 MB per file) |

**Licence constraints (enforced in a `DATA_LICENSES.md`)**
- **No WorldClim** anywhere: non-commercial, no redistribution. Use POWER or CHELSA (CC BY 4.0). The climate-2050 stretch would need CHELSA CMIP6, not WorldClim.
- **OpenStreetMap (ODbL)** only for offline drill-down text. Never bake OSM into shipped grids, which would trigger share-alike. Credit "© OpenStreetMap contributors" wherever it's used. Natural Earth (public domain) is the shipped logistics source.
- Attribution strings: Copernicus DEM (exact wording to verify), ESA WorldCover, SoilGrids, Aridity Index, GLiM (CC BY 3.0), MAP (CC BY, verify per layer), Macrostrat (CC BY 4.0), MCD ("(c) LMD/OU/IAA/ESA/CNES"; ship only derived coarse fields and verify redistribution, otherwise ship target values only), TEMIS (terms unverified, so prefer POWER UV), Kaguya MI (verify JAXA terms).
- NASA, USGS and PDS data: cite each product (licence text ❓ on some pages, verify before the README is final). No NASA logos or mission insignia in the app, video or slides.
- Our code: **Apache-2.0** (the Space Apps default) unless Sounak prefers MIT.

---

## 4. Schedule: Sat Nov 14, 9:00 AM IST to Sun Nov 15, 11:59 PM IST

Submission target **Sun Nov 15, 8:00 PM IST**. All times IST, assuming an Indian Local Event.

**Pre-event (plan edits only, no build):** Oct 28: diff the official challenge statement and resources against this plan, swap datasets if official ones are named. Nov 13: read the 2026 guides, update §6 demo limits, AI and judging rules, and the final checklist. Make sure accounts exist (GitHub, a free Earthdata login if Sounak approves, a YouTube or Drive host).

| Time (IST) | Work | Gate |
|---|---|---|
| **Sat 09:00–09:30** | Kickoff. Project 1 posts plan v1.x deltas. DevSecOps creates the repo (name and visibility per Sounak), enables Pages and Actions. Coordinator opens the tracker (2-hour check-ins). | |
| 09:30–10:30 | Project 1 commits the **data contract** (factor IDs, units, grid spec, file formats, targets, profiles, weights, θ, NMS radius). This is the pre-registration commit. Tech Explorer starts all raw downloads in parallel, including the POWER loop and the Copernicus pass as background jobs. Programmer scaffolds the pipeline and front end. UI/UX wireframes. Graphics: name and logo concepts. | Contract committed 10:30 |
| 10:30–13:00 | Moon and Mars layers (small) → global grids and the 18 target vectors. Front end: OpenLayers shell, GIBS basemap, target and profile picker rendering **mock data in the contract shape**. Researcher: validation CSV, gaps.json, factor copy. Optimizer: known-answer test vectors (e.g. the 0.025 pressure cap). | **G1 13:00:** downloads done or ETA known; target vectors sanity-checked by Researcher against literature (ridge ~200 K, Gale 183–260 K, etc.); mock UI renders |
| 13:00–14:00 | Buffer / lunch; first Earth layers land | |
| 14:00–18:00 | Earth grid build: F1–F2 POWER, F3 ATI, F5 ETOPO, F6 GLiM, F7 aridity, F8 WorldCover, F9 permafrost, F10 analytic, F11 IGRF + elevation, F12 UV, F4 Copernicus slope (fallback ETOPO). Programmer: Python reference scorer + JS port with parity tests. UI/UX: hi-fi portfolio, gap panel, site card. | |
| | | **G2 18:00:** earth_features v1; end-to-end scores for Connecting Ridge/P3 and Jezero/P5 visible locally; first validation numbers. Go/no-go on fallbacks (ETOPO slope, POWER permafrost proxy, GRS ice instead of SWIM) |
| 18:00–22:00 | Set cover + variants, gap tiers, MC precompute, validation tab, provenance/About page. DevSecOps: CI and first Pages deploy. | **G3 22:00: public URL live** with the core flow: target + profile → heatmap → portfolio → gap panel |
| 22:00–02:00 | Drill-down site cards, twin viewer (GIBS ↔ Trek), reverse search, UI polish pass 1. Graphics: final logo, favicon, OG image, colour-blind-safe factor palette. | |
| **Sun 02:00–07:00** | Overnight bot shift (humans rest). Optimizer: full code review, payload and perf budget, accessibility audit. DevSecOps: CSP meta, cache headers, gitleaks, dependency audit. Researcher: fact-check every number in UI copy. Programmer: fixes. | Review findings filed as issues |
| 07:00–10:00 | Fix findings. Stretch features **only if G3 is green and no P1 bugs**: accessibility "within N h of city", live MC for Custom. Climate-2050 only if everything else is done (CHELSA CMIP6). | |
| | | **G4 10:00: FEATURE FREEZE** (bug fixes, copy and visuals only after this) |
| 10:00–13:00 | README, METHOD.md, DATA_LICENSES.md, ai-log finalized. Capture and edit the ≤ 30 s demo video with burned-in English subtitles. Build the 7-slide fallback. Screenshots. | |
| 13:00–15:00 | Project page field drafts (summary, description, NASA data, partner data, AI use, references). Hackathon bot checks them against the 2026 guide. Sounak reviews. | |
| | | **G5 15:00:** release candidate tagged v1.0 and deployed; demo uploaded to a public no-login link; checklist ≥ 95% green |
| 15:00–19:00 | Final QA on the deployed site (fresh browser, mobile, slow network), link checks, Sounak's approval of all text. Sounak fills the project page. | Sounak sign-off 19:00 |
| **20:00** | **Sounak clicks "Submit for Judging"** (a user-only action) | **SUBMITTED** |
| 20:00–23:59 | Buffer. Deployment frozen. Fix only if the submission or links fail. Verify the public view of the project page. | Hard deadline 23:59 |

---

## 5. Task split by bot

| Bot | Deliverables | Depends on | Due |
|---|---|---|---|
| **Project 1** (owner) | Data contract and pre-registration commit (targets, factors, weights, θ, profiles); scoring method spec (this doc §2) and sign-off on the Python/JS parity; integration and merges; gate calls and fallbacks; final README sections on method and validation; final links and report to Sounak; decisions escalated to Sounak | Sounak's decisions (§7) | Contract 10:30 Sat; gates G1–G5 |
| **Technology/API Explorer** | Raw acquisition and per-layer extraction to per-body 0.5° NetCDF in contract format (Earth, Moon, Mars); polar target-window extraction; provenance entry per layer (URL, version, date, licence, native resolution); checksums; fallback switch-over (MOD11C3, ASU TES, SWIM) | Contract; Earthdata login if used | Moon/Mars by G1; Earth by G2 |
| **Programmer** | Grid assembly; Python reference scorer (normalizations, clip, filters, geometric mean, secondary nudge); MC precompute; NMS candidate pool; greedy set cover + variants; asset export; front end (picker, heatmap, portfolio, gap panel, site card, validation tab, twin viewer, reverse search) with a JS Worker scorer | Contract, layers, UI/UX designs, Researcher JSON/CSV | Scores by G2; core UI by G3; features by G4 |
| **UI/UX Designer & Reviewer** | Wireframes (Sat 10:30), hi-fi flows (Sat 18:00) for: mission picker → map → portfolio → gap → site card → validation; demo-friendly "story mode" path; accessibility review (contrast, keyboard, colour-blind palette); review pass after G3 and G4 | Contract, Graphics palette | 10:30 / 18:00 Sat; reviews Sun AM |
| **Graphics Designer** | Name and logo options (Sat AM), final logo, favicon, OG/social image, factor icon set and palette, video title cards and lower thirds, 7-slide template; visible "AI-generated" watermark on any AI imagery; no NASA logos or insignia | Sounak's name choice | Logo by Sat 22:00; video assets by Sun 11:00 |
| **Code Optimizer And Evaluator** | Known-answer test vectors for every normalization; Python/JS parity tests; set-cover tests on toy cases; validation-metric regression test; perf budget (first load < 3 MB gz, re-score < 100 ms); overnight code review | Programmer PRs | Tests by G2; review report Sun 07:00 |
| **Deployment And DevSecOps** | Repo, branch rules, Actions CI (lint, tests, build, deploy to Pages); Cloudflare Pages mirror; gitleaks + Dependabot; `.netrc`/credentials never in the repo; CSP meta; v1.0 tag and release; deploy freeze after G5 | Sounak: repo name and visibility | Repo 09:30 Sat; live by G3 |
| **Researcher** | Validation CSV (~20 analogs + ~10 negatives, cited); gaps.json + facility lookup; profile and campaign citations; target-vector sanity check; fact-check all UI and README numbers; References section | Contract | CSV and JSON by G1; fact-check Sun 07:00 |
| **Hackathon Project Bot Coordinator** | Tracker in status.md, 2-hour check-ins, chase stalls, gate checklists, escalate blockers to Project 1 | All | Continuous |
| **Hackathon** (supporting) | Submission checklist against the 2026 guide; project page field copy review; judging-fit review of the demo | Nov 13 guide | Sun 13:00–15:00 |
| **Brainstorming** (supporting) | Demo narrative polish; stretch-feature triage at 07:00 Sun | G3 build | Sun AM |

---

## 6. Submission package

### 6.1 README outline
1. Name, tagline, **live demo link**, **demo video link**, screenshot.
2. The problem (challenge quote) and our answer (portfolio + gaps + validation).
3. How to use it in 3 steps.
4. Method: factor table, normalization, Earth-achievable clip, filters, geometric mean, profiles with weights, MC, set cover, fidelity-gap tiers.
5. Validation results: % in top 5% and 1%, AUC, table, new candidates.
6. **Data sources** table: dataset, provider/agency, resolution, version, access date, licence, citation, how used. Grouped as NASA / partner agencies / other.
7. Limitations (0.5° screening, ordinal ATI, capped factors, MCD/GRS coarseness, unofficial region polygons).
8. Reproduce: pipeline steps, runtime, optional Earthdata login, raw data not committed.
9. Architecture.
10. AI use disclosure (pointing to `docs/ai-log.md`).
11. Licence: code Apache-2.0; data licences in DATA_LICENSES.md.
12. References ([R#] from research.md).

### 6.2 Demo constraint
2025 rule: **a video ≤ 30 seconds OR ≤ 7 slides (including the title slide)**. Going over the limit makes the project **ineligible for Global Judging**. The link must be public with no login, in English or with English subtitles. **Re-check against the Nov 13, 2026 guide.** Primary: a 30 s video. Fallback: 7 slides (title, problem, how it works, portfolio demo, fidelity gap, validation, vision + links). A longer walkthrough may live only on the project site, and only if the 2026 rules allow it.

### 6.3 Draft 30-second storyboard (subtitles burned in, original or royalty-free music, no NASA logos, no minors)
| Time | Visual | On-screen text / VO |
|---|---|---|
| 0:00–0:02 | Moon south pole (Trek LROC imagery), long shadows | "NASA's Moon Base is headed here." |
| 0:02–0:05 | Earth globe (GIBS) | "Where on Earth can we rehearse it?" |
| 0:05–0:10 | Logo | "No place on Earth is the Moon. We find the smallest set of places that together are." |
| 0:10–0:20 | Screen capture: pick Connecting Ridge + Habitat/EVA → heatmap → 3-site portfolio with factor chips → Fidelity Gap panel (1/6 g, vacuum, 40 K) → "X/20 known analogs rediscovered in the top 5%" | Data credit strip: "NASA LOLA · Diviner · MOLA · TES · POWER · ESA Copernicus" |
| 0:20–0:27 | Switch to Mars (Jezero) → portfolio + a "new candidate" pin → reverse search "your city's Mars twin" | "New analogs, characterized factor by factor." |
| 0:27–0:30 | URL + logo | "Plan analog campaigns from anywhere. <URL>" |

### 6.4 AI-use disclosure log (`docs/ai-log.md`, started at kickoff)
Columns: timestamp (IST) · tool/agent (e.g. "Grok Bot agents: Programmer") · task · files/artifacts · human reviewer · notes. Rows cover code, text, data processing and images. AI images and video carry a visible "AI-generated" watermark. **Also disclose that research and planning notes (docs/*.md, including this plan) were prepared by AI agents before the event** (Sounak to confirm wording; see §7).

### 6.5 NASA data used (for the "NASA Data" field)
LRO LOLA (GDR LDEM/LDSM/LDRM; PGDA 69 illumination and PSR; PGDA 90 south-pole DEMs), LRO Diviner (GCP; GDR rock abundance and regolith temperature), Lunar Prospector GRS, MGS MOLA MEGDR, MGS TES thermal inertia and albedo, Mars Odyssey GRS, MSL RAD (reference), USGS/NASA MGC³ caves, Moon Ice Favorability Index (USGS), SWIM (NASA-funded), NASA POWER, NASA GIBS, NASA Solar System Treks, NSSDC fact sheets, CMR (plus MODIS MOD11C3/MCD43 if the login is used).
**Partner agencies:** ESA Copernicus DEM, ESA WorldCover, ESA CCI Permafrost, JAXA Kaguya MI, MCD (ESA/CNES co-funded).
**Other:** NOAA ETOPO 2022, GLiM, SoilGrids, Global Aridity Index v3.1, MAP travel time, Natural Earth, Macrostrat, IGRF.

---

## 7. Risks, fallbacks and open decisions

| Risk | Likelihood / impact | Fallback |
|---|---|---|
| Earthdata login unavailable (MOD11C3, MCD43, ASTER GED, OMI) | Med / Low | POWER-only Earth thermal, albedo and UV (no key). Login is an upgrade, not a dependency |
| ASU TES mineral server timeouts (Mars mineralogy) | High / Low | Not in the core: F6 uses SIM 3292 + Odyssey GRS. TES maps become future work |
| Oct 28 statement names different datasets, sites or deliverables | Med / Med | Plan diff on Oct 28; the contract is layer-agnostic, so swap rows in §2.2; official datasets get preference |
| Copernicus slope pass too slow | Med / Low | ETOPO 1′ slope (decided at G2) |
| SWIM / ESA CCI permafrost untested | Med / Med | Odyssey GRS H₂O; POWER mean annual TS < 0 °C as the permafrost proxy |
| POWER or MCD rate limits | Med / Med | Start at 09:30, cache everything, polite concurrency; MCD loops trimmed to 6 Ls × 4 local times |
| Polar geometry errors on Moon targets | Med / High | Targets from native polar products only; Researcher literature check at G1 |
| Validation scores weak | Med / Med | Report honestly. Fix bugs, not weights. Discuss per-factor fidelity (that's the point of the portfolio) |
| Trek / GIBS tiles down during judging | Low / Med | Bundled static low-res basemaps and twin-viewer stills |
| Over-claiming physics (ATI ≠ TI units) | Med / High (Validity) | "Within-body classes" language everywhere; Researcher fact-check |
| Demo over 30 s / 7 slides | Low / Fatal | Hackathon bot checks the runtime and slide count at G5 |
| Pre-event planning notes questioned | Low / High | Planning-only artefacts, no code before 9:00 Nov 14; disclose in the AI log; optionally confirm with the Local Lead |

**Open decisions for Sounak**
1. **Repo name and visibility.** It must be public under NetRunnerXD; a suggested name follows his project-name choice.
2. **Project name** (working name "Analog Portfolio").
3. **Local Event vs Universal Event.** This sets the deadline time zone (IST is assumed in §4).
4. **Team members (1–6 registered humans) and Team Owner.** Bots aren't team members; Sounak submits.
5. **Free NASA Earthdata login**: create it and allow its use on the box (optional upgrade).
6. **Code licence**: Apache-2.0 (default) or MIT.
7. **Whether to ask the Local Lead** that pre-event planning notes are acceptable, and how to word that disclosure.
8. **Demo format and voice**: 30 s video (recommended) vs 7 slides; voice-over or captions only.
9. **Paid services:** none needed (GitHub Pages, Cloudflare Pages and all data are free). Confirm nothing paid is wanted.
