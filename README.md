# Analog Portfolio

**No place on Earth is the Moon. So we find the smallest set of places that together are, and say exactly what Earth can't give you.**

NASA Space Apps Challenge 2026 · *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*

> 🚧 **Status: Phase A scaffold (Oct 8, 2026).** The pipeline, data contract and app shell exist; the app currently renders **mock data** in the contract shape. Real layers, scores and validation numbers land in Phase B. The project will be revised after the official challenge statement (Oct 28) and the 2026 submission guides (Nov 13).

- **Live demo:** _TBD (GitHub Pages)_
- **Demo video (≤ 30 s):** _TBD_
- **Screenshot:** _TBD_

## 1. The problem and our answer

The challenge asks teams to identify and characterize Earth locations that analog NASA's permanent Moon base sites (Artemis south-polar regions, Shackleton Connecting Ridge for Moon Base I) and Mars landing/base sites. Most tools rank "the most Moon-like place". That framing is wrong: fidelity is factor-specific, and no Earth site matches everything.

**Analog Portfolio** does three things:
1. **Portfolio optimizer.** Pick a target and a mission purpose; a greedy weighted set cover returns the 2–5 Earth sites that *together* cover every requirement Earth can meet (Best match, Easiest to reach: every site ≤ 6 h from a city of 50k+, and One continent).
2. **Fidelity Gap report.** States what no Earth site can give (1/6 g or 3/8 g, vacuum, radiation 100–200× Earth's, ~40 K PSR floors, the lunar ~300 K diurnal swing) and the facility type that fills each gap.
3. **Blind rediscovery validation.** Weights are pre-registered in git *before* scoring ([`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md)); we report how many of 21 famous analogs (Haughton, Atacama, Dry Valleys, Río Tinto, Mauna Kea, Ries, Sudbury, …) land in Earth's top 5% / 1%, versus 11 negative controls, and surface high-scoring unused regions as **new candidate analogs**.

## 2. How to use it (3 steps)

1. Choose a **target**: one of 10 Moon south-polar sites or 8 Mars sites.
2. Choose a **mission purpose**: P1 Landing & mobility · P2 ISRU / ice · P3 Habitat, EVA & power · P4 Geology & regolith · P5 Astrobiology (Mars).
3. Read the **portfolio** (sites, the factors each covers, logistics) and the **Fidelity Gap** panel; click any site for its factor-by-factor characterization.

## 3. Method

Full spec: [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md) (pre-registration) and [`docs/plan.md`](docs/plan.md) §2.

- **Grid:** 0.5° (720 × 360) for Earth, Moon and Mars, lon −180..180 E-positive, cell-centre registration.
- **Factors F1–F13:** mean surface temperature, diurnal ΔT, regolith thermophysics (thermal-inertia class), slope/landability, local relief, lithology, aridity, barrenness, ground ice / cold traps, illumination regime (core); atmospheric shielding, surface UV (capped tie-breakers); geomorphic flags.
- **Normalization:** range-normalised similarity for temperature and day–night swing (after clipping the target to Earth's range; the gap is always measured on the unclipped target), ESI-style ratio for relief, bounded fractions, Gaussian kernels, within-body ordinal classes, categorical similarity matrix.
- **Aggregation:** hard filters → weighted geometric mean of F1–F10 → small secondary nudge from F11–F13. Logistics is a separate cost axis.
- **Robustness:** 1,000-draw Dirichlet Monte Carlo on the weights; "robust" badge for sites whose cell stays in the top 5% of Earth land (cos(lat) area-weighted) in ≥ 80% of draws.
- **Portfolio:** greedy weighted set cover with θ = 0.7 coverage threshold and 300 km great-circle non-max suppression; three variants (best match, easiest to reach ≤ 6 h, one continent). For Mars targets a candidate must be arid (aridity index < 0.2) or at least half bare ground (provisional gate, awaiting Researcher's threshold).
- **Validation method:** blind rediscovery of 21 known analogs vs 11 negative controls; coastal sites are snapped to the nearest ≥ 50% land cell within one cell (snapped cell and distance recorded). **The factor weights were set (pre-registered in git) before the validation freeze**; the Mars gate (Researcher, research.md §8: a cell must be arid, mostly bare, a cold desert on permafrost, or a dry-enough impact/volcanic landscape) was designed after the first validation run using these same analogs and negative controls, before the freeze, so it is not a blind test for them (Rio Tinto fails it and is reported as gate-excluded, not whitelisted); the method was frozen at the commit recorded in `web/public/data/validation.json → frozen_commit`, before the final validation run, and nothing was tuned to the validation set.

## 4. Validation results

_TBD (Phase B)._ Reported: % of known analogs in the top 5% and top 1%, rank-AUC vs negative controls, per-site percentile table, new candidates.

## 5. Data sources

_Full table (dataset, provider, resolution, version, access date, licence, citation, how used) generated from `provenance.json` in Phase B._ Planned stack: [`docs/data-sources.md`](docs/data-sources.md). Licences: [`DATA_LICENSES.md`](DATA_LICENSES.md).

- **NASA:** LRO LOLA, LRO Diviner, PGDA polar illumination/PSR, Lunar Prospector GRS, MGS MOLA, MGS TES, Mars Odyssey GRS, MSL RAD (reference), SWIM, MGC³, NASA POWER, NASA GIBS, Solar System Treks.
- **Partner agencies:** ESA Copernicus DEM, ESA WorldCover, ESA CCI Permafrost, Mars Climate Database (LMD/ESA/CNES).
- **Other:** NOAA ETOPO 2022, GLiM, Global Aridity Index v3.1, SoilGrids, MAP travel time, Natural Earth, Macrostrat, IGRF.

## 6. Limitations

0.5° (~55 km) is regional screening; Haughton (23 km) is sub-cell. Earth thermal inertia is an apparent-TI proxy compared only as within-body classes. Radiation and UV are capped tie-breakers, never matches. MCD and GRS are much coarser than 0.5°. Artemis region anchors are IAU feature centres, not official polygons.

## 7. Reproduce

```bash
# pipeline (Python ≥ 3.11)
cd pipeline && python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"          # add ".[data]" for the geospatial stack
pytest -q
python -m analog_portfolio.export.mock   # regenerate mock assets

# web (Node ≥ 20.19)
cd web && npm ci && npm test && npm run dev
```

Raw data is never committed (`data/` is gitignored). An optional free NASA Earthdata login unlocks MODIS upgrades; nothing requires it.

## 8. Architecture

Offline Python pipeline (`pipeline/`: acquire → extract → grid → score → export) → small precomputed static assets (`web/public/data/`, < 10 MB) → static React + Vite + OpenLayers app (`web/`) with a client-side scorer (Python/JS parity enforced by shared test vectors) → GitHub Pages.

```
contract/        machine-readable contract (factors, profiles, target priors, JSON Schemas, test vectors)
pipeline/        Python package analog_portfolio + inputs/ (Researcher targets.json, gaps.json) + tests
web/             React + TypeScript + OpenLayers front end; public/data/ for shipped assets (mock/ for now)
docs/            plan, research, data sources, data contract, factor copy, validation set, AI-use log
data/            raw + interim data (gitignored)
```

## 9. AI use disclosure

AI agents were used for research, planning, code and text. Every use is logged in [`docs/ai-log.md`](docs/ai-log.md), including the research and planning notes prepared before the hackathon.

## 10. Licence

Code: [Apache-2.0](LICENSE). Data: each dataset keeps its own licence, see [`DATA_LICENSES.md`](DATA_LICENSES.md). No NASA logos or mission insignia are used.

## 11. References

See [`docs/research.md`](docs/research.md) (References, [R#] keys).
