# Science grounding: Earth analogs for permanent Moon-base sites and Mars landing/base sites

*For: NASA Space Apps Challenge 2026, "Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars". Engine owner: Project 1. Compiled 8 Oct 2026 (IST).*

**Reading rules.** Every number has a citation in brackets (`[R#]`, see References). Values marked **(derived)** are my own arithmetic on cited numbers. Values marked **(approx.)** are approximate coordinates to locate a site; check them in GIS before you rely on them. "Not found" means I looked and could not find a citable value. Paywalled DOIs (Science, PNAS, Wiley) sometimes block bots, but each DOI was checked against doi.org/Crossref.

---

## 0. TL;DR for the engine

1. **The program changed in 2026.** Artemis III is now an Earth-orbit lander/EVA-suit test flight (2027). **Artemis IV (early 2028) is the first crewed landing**, near the lunar South Pole [R1][R2][R3]. The **nine candidate south-polar regions** (Oct 2024) are still the working set [R4][R5]. Separately, NASA's **Moon Base** initiative put its first robotic mission (**Moon Base I**, NET fall 2026) on the **Shackleton Connecting Ridge** [R6]. Use both the 9 regions and Connecting Ridge as Moon targets.
2. **Moon south-pole siting comes down to five measurable things:** (a) illumination fraction (best spots are about 89–96% of the time, depending on height above ground) [R9][R10][R13]; (b) distance to PSR cold traps (<110 K) that hold water ice, measured at about 5.6 ± 2.9 wt% at the LCROSS site [R12][R15][R19]; (c) slope ≤8° (lander threshold; goal ≤5°) [R16]; (d) Earth visibility for direct-to-Earth (DTE) comms [R5][R30]; (e) a thermal regime with low sun, cold, and long shadows [R8][R19].
3. **Mars human/base siting is driven by water ice plus landability.** The ice-rich northern mid-latitudes (Arcadia, Phlegra/Erebus Montes, Utopia) sit at latitude <40°, elevation <−2 km (MOLA), slopes <5° at 10 m, thermal inertia ≥100 SI units, and few rocks [R27]. NASA's 2015 workshop used ±50°, <+2 km, slopes <~10°, and no thick dust [R25].
4. **Earth cannot match gravity, vacuum, or radiation magnitude.** Lunar surface dose is about 1369 µSv/day [R20]. Mars (Gale) is about 0.64 mSv/day [R31]. Earth's average natural background is about 2.4 mSv/yr ≈ 6.6 µSv/day (derived) [R59]. That is a gap of roughly 100–200×. Treat these as **irreducible gaps**: report them, keep them out of the ranking (or apply them as a constant cap), and rank Earth sites only on factors Earth can actually vary.
5. **Recommended scoring:** physically bounded per-factor similarity, using an ESI-style ratio similarity for ratio-scale variables and log transforms for quantities that span orders of magnitude. Use an "Earth-achievable target" clip plus a within-Earth directional percentile for factors Earth can't reach. Use Gower distance for mixed numeric and categorical data (lithology, permafrost class, cave/crater flags). Use use-case weight profiles (ISRU-ice, EVA/thermal, geology/regolith, astrobiology, operations) with Monte-Carlo weight sensitivity. **Validate** by checking that established analogs (Haughton, Atacama, Dry Valleys, Río Tinto, Hawai'i, etc.) rank high.
6. **Minimum viable Earth data stack:** MODIS LST (day/night amplitude), ERA5 / ERA5-Land, WorldClim, the Global Aridity Index v3.1, ESA CCI Permafrost or NSIDC permafrost maps, TEMIS/OMI UV, cutoff-rigidity grids plus EXPACS (cosmic-ray dose vs altitude), Copernicus GLO-30 DEM (slope), GLiM lithology, SoilGrids, MODIS NDVI and albedo, and the ASTER GED emissivity/silica proxy. Matching Moon data: LOLA, PGDA illumination/Earth-visibility, Diviner, LEND. Matching Mars data: MOLA, TES/THEMIS TI, dust cover index, rock abundance, SWIM, Mars Climate Database (all linked in §4).

---

## 1. What the challenge page says

As fetched on 8 Oct 2026, only the **challenge summary** is published. The Details and Resources tabs show the same summary, and no resource links had been posted yet [R0]. According to the team's `docs/challenge-brief.md`, which cites the Space Apps FAQ, the full statements with resources come out **28 Oct 2026**. I have not re-verified that date. Key text:

> "Selecting future landing sites and lunar base locations depends on many factors, including **topography, geology, environment, and available resources** … Places on Earth that have analogous characteristics to the Moon or Mars – the **Atacama Desert, Haughton Crater, Death Valley** – … however, such terrestrial analog sites are **not entirely well characterized**. Your challenge is to **use open Earth, Moon, and Mars data from NASA and other space agencies** to identify and characterize new terrestrial analogs for future bases or landing sites, drawing on **deserts, polar regions, volcanic and arid terrains, caves**, and other environments that share conditions with the lunar or Martian surface." [R0]

Implications for the engine:
- The factor families map directly to the four named categories: topography, geology, environment, and resources.
- Death Valley and caves are named explicitly, so the engine should include a cave/lava-tube flag (§3.5, §4.1 #16).
- "Characterize" means the output should be an explainable per-factor breakdown, not just a single score.
- Data should come from NASA and partner agencies (ESA/Copernicus, JAXA, ISRO, etc.).
- Re-check the Resources tab after it is published.

---

## 2. Permanent Moon base: south-polar targets and siting criteria

### 2.1 Program status (as of Oct 2026)
- **Feb 2026 Artemis restructuring.** Artemis III (2027) becomes a low-Earth-orbit mission to test rendezvous and docking with one or both commercial landers and the xEVA suits. **Artemis IV, early 2028**, becomes the first landing: two crew spend about a week near the South Pole. Artemis V follows in late 2028 [R1][R2][R3].
- **Candidate regions.** In Aug 2022 NASA named 13 regions, each about 15 × 15 km and within 6° of latitude of the South Pole. A "landing site" is about a 100 m radius inside a region [R7]. In Oct 2024 this was cut to **nine regions** (no priority order): Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2, and Slater Plain [R4]. A 2026 LPSC abstract by the NASA site-selection team confirms the nine and explains the cut [R5]. NASA's Artemis IV page now presents the nine as the candidate regions for the first crewed landing [R2].
  - Dropped from the 2022 list: Faustini Rim A, Peak Near Shackleton, Connecting Ridge, Connecting Ridge Extension, de Gerlache Rim 1, de Gerlache-Kocher Massif, Leibnitz Beta Plateau, Amundsen Rim [R7][R4]. NASA says removal "does not imply that removed regions are unsuitable for future exploration" [R5].
- **Moon Base (May 2026).** NASA's "Moon Base" initiative is aimed at sustained presence at the lunar South Pole. **Moon Base I** (Blue Origin Blue Moon Mk1, NET fall 2026) "will land on the **Shackleton Connecting Ridge**" [R6]. The Moon Base User's Guide stresses low sun, long shadows, extreme cold, mobility into PSRs, and regolith/dust/radiation knowledge gaps. It lists "Securing Sites" (regolith properties, imagery, mapping, resource locations) as a data gap [R8].
- **Practical upshot:** the **permanent base** is going to the south-polar ridges and massifs. The engine's Moon target set should be: the **9 regions plus Connecting Ridge (Moon Base I)**, with optional comparison to the dropped 2022 regions.

### 2.2 Moon target table (reference coordinates)
NASA has published the region outlines only as map images, not as coordinates. The table below gives the **IAU-named feature each region is named after**, using center coordinates from the USGS/IAU Gazetteer of Planetary Nomenclature [R29]. These are anchor points for sampling rasters within about 15 km. They are **not** the official polygons. (Longitude is east-positive, −180..180.)

| Target | Status | Reference feature (IAU) | Lat (°) | Lon (°E) | Notes |
|---|---|---|---|---|---|
| Peak near Cabeus B | Artemis 9 | Cabeus B crater | −82.26 | −54.58 | Cabeus crater (−85.33, −42.13) is the LCROSS ice site [R12] |
| Haworth | Artemis 9 | Haworth crater | −87.45 | −5.17 | Large PSR crater |
| Malapert Massif | Artemis 9 | Mons Malapert | −85.98 | −1.67 | Summit area has 100% Earth visibility near −85.95°, ±5° lon [R30] |
| Mons Mouton Plateau / Mons Mouton | Artemis 9 (2 regions) | Mons Mouton | −84.60 | 31.00 | Large massif |
| Nobile Rim 1 / Rim 2 | Artemis 9 (2 regions) | Nobile crater | −85.28 | 53.27 | |
| de Gerlache Rim 2 | Artemis 9 | de Gerlache crater | −88.48 | −88.34 | |
| Slater Plain | Artemis 9 | Slater crater | −88.08 | 111.29 | |
| Shackleton Connecting Ridge | Moon Base I target [R6] | Ridge between Shackleton (−89.67, 129.78) and de Gerlache | ≈ −89.45 | ≈ −137.2 | Best-illuminated spot at 10 m height: 89.4516°S, 222.7581°E [R10] (= −137.24°E) |

### 2.3 Siting criteria with numbers

**(a) Illumination (power and thermal).**
- LOLA 240 m modeling over multiple 18.6-yr precession cycles: a spot near the **Shackleton rim is sunlit continuously for ~240 days/yr**, and its longest total darkness is about **1.5 days**. A height gain of about 10 m can sharply improve illumination [R9].
- 20 m/px LOLA DTM over a 19-yr run, **Connecting Ridge**: sunlit **92.27% of the time at 2 m** and **95.65% at 10 m** above ground. Longest darkness at these spots is 3–5 days [R10][R11]. Best *average* (partial-disk) illumination: 92.55% at 10 m [R10][R11].
- LPSC 2011 (LOLA): **"Malapert Mountain" ~89.6%** and a Shackleton-area point ~89.3% [R13]. **Caveat:** the abstract places its "Malapert Mountain" point at 85°18′22″S, 36°59′09″E. That is about 38° of longitude from the IAU Mons Malapert anchor (−85.98, −1.67) and nearer Mons Mouton, so don't assign this value to the Malapert Massif region without checking. The same table gives a Connecting Ridge point (89°26′04″S, 136°42′05″W) at 86.5% lit, with a longest shadow of 10 days.
- Seasonality: south-polar illumination "shifts approximately 2–3 weeks per year". Robustness across mission windows was a selection factor [R5]. The Sun stays low on the horizon, casting long shadows [R8].
- PSR area (LOLA): **16,055 km² in the south** and 12,866 km² in the north [R9].

**(b) PSR proximity and water ice.**
- **LCROSS (Cabeus, 2009):** 155 ± 12 kg of water vapor/ice in view; regolith water ice **5.6 ± 2.9 wt%** [R12]. An independent ground-based plume analysis gives 6.3 ± 1.6 wt% [R12b].
- **LRO LEND:** epithermal-neutron suppression (hydrogen) mapped at the south pole; Cabeus has the strongest signal [R14]. Later LEND work found significant suppression mainly in Cabeus and Shoemaker [R14b].
- **LRO Diviner:** found extensive cryogenic cold traps. The LCROSS site was among the coldest, with estimated subsurface temperature about 38 K [R15]. Surfaces below **~110 K** can keep water ice stable over geologic time. Nearly all of the PSRs within the Artemis regions stay below 110 K, and ridge crests spend the least time below it [R19].
- **Chandrayaan-1 M3 (+ LOLA, LAMP, Diviner):** direct NIR detection of surface-exposed water ice in polar cold traps. Ice is patchy and present in only a small fraction of cold traps [R17].
- **LAMP** (far-UV) constrains water ice only within the topmost ~100–200 nm. Treat it as a surface-frost indicator, not a bulk-ice measure [R14c].
- *Engine factor:* distance from the target to the nearest PSR or <110 K pixel, plus a hydrogen (LEND) value.

**(c) Slope and terrain.**
- HLS requirement HLS-R-0071: vertical orientation **0–8° threshold, 0–5° goal** [R16].
- The 2026 site-selection update says terrain safety focuses on keeping slope variability low within the landing ellipse, avoiding crater and block hazards, and keeping enough low-slope area [R5].
- Mons Malapert analyses map areas with slopes <15° and 100% Earth visibility [R30]. That 15° is a trafficability view, not the lander limit.

**(d) Thermal range (Diviner).**
- Global/equatorial: average max **392.3 K**, average min **94.3 K**, mean 215.5 K [R18]. Diurnal amplitude ≈ **298 K** (derived).
- Polar ridges: Connecting Ridge summer temperatures are "systematically high, **~200 K**" with short cast-shadow dips [R19b]. Ridge-crest summer temperatures generally stay above ~120 K; shadowed periods go below ~120 K [R19]. Winter is a mix of sun and shadow [R19][R19c].
- PSR floors stay below 110 K. Faustini floor varies only ~30–40 K in winter and up to ~70 K in summer [R19b]. The LCROSS site is about 38 K [R15].
- *Engine factor:* mean temperature, diurnal amplitude, and fraction of time below a threshold. Use **polar** values for Moon-base targets, not equatorial ones.

**(e) Regolith.**
- Lunar Sourcebook Ch. 9: bulk density **1.50 ± 0.05 g/cm³** (top 15 cm), increasing with depth. Median particle size 40–130 µm, average ~70 µm [R21][R21b]. Cohesion and friction-angle ranges exist in the same chapter. I did not transcribe them from the original table, so check Ch. 9 before you hard-code them.
- The south pole is highland terrain, so the anorthositic highlands are the composition analog. NASA's NU-LHT highland simulants used **Stillwater Complex (Montana) anorthosite** [R22]. Lunar dust is "extremely abrasive and electrostatic" [R8].

**(f) Earth visibility / DTE comms.**
- If Artemis uses DTE comms, regions with more Earth visibility are preferred [R5]. Operations staged from NRHO give favorable Earth visibility but constrain surface access timing. Surface stays are about 5.75–6.25 days [R5].
- PGDA and LOLA publish **Earth-visibility maps averaged over the 18.6-yr cycle** (GDRVIS) [R23][R24].
- *Earth proxy:* none physically (on Earth the Earth is always "visible"). Treat this as a Moon-side site attribute, not an Earth-similarity factor.

**(g) Radiation.**
- Chang'E-4 LND (far side, Von Kármán crater, 2019): average dose equivalent **1369 µSv/day**, about **2.6× the ISS** [R20].
- No atmosphere and no global magnetic field, so this applies at all candidate sites to first order. In practice it does not separate Moon targets from each other.

### 2.4 Moon datasets (for the engine)
| Use | Dataset | Link |
|---|---|---|
| Topography/slope (5 m south pole) | PGDA high-res LOLA DEMs and slopes; 87–90°S mosaic; Barker 2023 large-area DEM with PSR layer | [R23b] https://pgda.gsfc.nasa.gov/products/78 · /81 · /90 |
| Illumination and Earth visibility | PGDA Lunar Polar Illumination (avg. over 18.6 yr); LOLA GDRVIS | [R23] https://pgda.gsfc.nasa.gov/products/69 · [R24] |
| Temperatures | Diviner RDR / Polar Cumulative Products (PDS) | https://pds-geosciences.wustl.edu/missions/lro/diviner.htm · https://www.diviner.ucla.edu/ |
| Hydrogen | LRO LEND (PDS) | https://pds-geosciences.wustl.edu/missions/lro/lend.htm |
| General LOLA | PDS LOLA | https://pds-geosciences.wustl.edu/missions/lro/lola.htm |
| Browse/QA | NASA Moon Trek; LROC QuickMap | https://trek.nasa.gov/moon/ · https://quickmap.lroc.asu.edu/ |

---

## 3. Mars: landing and base sites

### 3.1 Target table
| Site | Role | Lat (°N) | Lon (°E) | Elevation (MOLA) | Source |
|---|---|---|---|---|---|
| Jezero crater (Perseverance, Octavia E. Butler landing) | Mars 2020 science site; delta and lake deposits | 18.4447 | 77.4508 | Crater floor ≈ −2.6 km. 2016 ellipse center 18.389°N 77.541°E at −2.62 km | [R34][R35] |
| Gale crater (Curiosity, Bradbury Landing) | MSL; Mt Sharp layered sediments, RAD measurements | −4.5895 | 137.4417 | −4501 m | [R36][R37] |
| Utopia Planitia (Zhurong) | Tianwen-1; ice-rich lowland plains | 25.066 | 109.925 | −4099.4 m | [R38] |
| Arcadia Planitia: AP-1 / AP-9 / AP-8 | Starship human-landing candidates (primary AP-1, AP-9; secondary AP-8) | 39.8 / 40.02 / 40.75 | 202.1 / 203.35 / 201.3 (= −157.9 / −156.65 / −158.7) | ≈ −3.9 km | [R27] |
| Erebus Montes: EM-16 / EM-15 | Primary EM-16, secondary EM-15 | 39.89 / 39.75 | 192.03 / 195.62 | ≈ −3.9 km | [R27] |
| Phlegra Montes: PM-1 / PM-7 | Primary PM-1, secondary PM-7 | 35.23 / 36.43 | 163.95 / 162.16 | −3.2 / −2.3 km | [R27] |
| Phoenix (Vastitas Borealis) | Ground-truth ice table | ~68 | ~234 (−126) | — | Ice table at **4.6 cm** mean depth (1.3–11.2 cm range) [R40] |

The NASA 2015 "First Landing Site/Exploration Zone" workshop collected **47 candidate Exploration Zones (EZs)**. Each EZ is a 100 km radius around a landing site, with regions of interest (ROIs) inside it [R25][R26]. The list is long and some EZ coordinates sit only in individual abstracts, so I did not reproduce all 47. See [R25] and the workshop page [R26b].

### 3.2 Siting criteria with numbers
- **NASA Human Landing Sites workshop (2015) [R25]:**
  - Latitude within ±50°.
  - Elevation below +2 km MOLA.
  - A ~25 km² landing area with slopes below ~10°.
  - Avoid thick fine dust (low thermal inertia / high albedo).
  - EZ is a 100 km radius.
  - An approximate map of the regions that satisfy these constraints is given (Fig. 2).
  - Supplemental criteria (NTRS 20160001040) note that latitudes **below ~40°N** are preferred for climate and solar power [R26].
- **SpaceX Starship / JPL site study (LPSC 2021) [R27]:**
  - Elevation **< −2 km** (< −3 km preferred).
  - Latitude **< 40°**.
  - Landing circle radius < 200 m.
  - Slopes **< 5° at 10 m scale**.
  - **< 5% chance of a 1 m rock** in the footprint (cumulative fractional area < 10%).
  - Radar-reflective, load-bearing surface.
  - Avoid **thermal inertia < 100 SI units** (very low TI suggests a dust mantle).
  - Must have accessible near-surface ice.
  - Short-listed sites in Phlegra, Erebus, and Arcadia (see table).
- **MSL engineering constraints (Golombek 2012) [R37]:**
  - Latitude within ±30°.
  - Elevation < −1 km.
  - Relief < 100–130 m over 1–1000 m baselines.
  - Slopes < 30° at 2–5 m.
  - Moderate rock abundance.
  - Radar-reflective surface, and not dominated by dust.
- **Mars 2020:** eight finalist sites; Jezero was chosen after four workshops [R34][R35]. I did not verify Mars 2020's numeric limits. The TRN system relaxed hazard constraints.

### 3.3 Mars environment factors
- **Ground ice.**
  - HiRISE scarps expose clean ice from **1–2 m** below the surface down to more than **100 m** depth at mid-latitudes [R41].
  - SWIM (Subsurface Water Ice Mapping) integrates neutron, thermal, geomorphic, and radar data. It finds Arcadia and Deuteronilus Mensae among the best candidates [R42]. The 2025 SWIM v4 products give ~3 km/px "ice consistency" maps for depth bands **0–1 m, 1–5 m, >5 m**, and extend ice evidence equatorward of 30°N/S in places [R43]. Products are downloadable as GeoTIFFs [R44].
  - Phlegra Montes: SHARAD radar mapping of debris-covered glaciers reports 2–8 m of debris over ice averaging ~182 ± 91 m thick, with a maximum apparent thickness of 440 ± 14 m (Andres & Smith 2025) [R39].
- **Atmosphere** (NSSDC Mars fact sheet [R45]):
  - Mean surface pressure **6.36 mb**, varying 4.0–8.7 mb with season. Viking 1 measured 6.9–9 mb.
  - Mean surface temperature ~**214 K (−59 °C)**. Viking 1 air temperatures ranged **184–242 K**, a diurnal range of about 58 K (derived).
- **Radiation (RAD, Gale):** surface absorbed dose **0.210 ± 0.040 mGy/day** and dose equivalent **0.64 ± 0.12 mSv/day** [R31]. Dose is **anti-correlated with atmospheric column depth** (surface pressure), so low-elevation sites are better shielded [R32][R32b].
- **UV:** Cockell et al. (2000) modeled the present-day Mars surface UV environment as roughly comparable to early (Archean) Earth. They report present Earth DNA-weighted irradiance as **almost three orders of magnitude lower** than the Archean [R46]. It follows that Mars ≈ 10³ × present Earth for DNA damage. This is my inference from those two statements, not a single quoted ratio.
- **Gravity, for the gap analysis** (NSSDC fact sheets [R45][R47][R48]):
  - Mars 3.73 m/s², Moon 1.62 m/s², Earth 9.82 m/s².
  - Bond albedo: Mars 0.250, Moon 0.11.
  - Moon nighttime surface pressure ~3 × 10⁻¹⁵ bar.
  - Earth reference values: 1014 mb, 288 K mean, diurnal range 283–293 K (NSSDC).
- **Surface physics (TES):** global thermal inertia [R49]. Dust Cover Index (DCI), where low DCI means dusty [R50]. Rock abundance [R51].

### 3.4 Mars datasets (for the engine)
| Use | Dataset | Link |
|---|---|---|
| Elevation/slope | MOLA MEGDR (PDS); MOLA–HRSC blended 200 m (USGS) | https://pds-geosciences.wustl.edu/missions/mgs/megdr.html · https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m |
| Thermal inertia | TES TI (Putzig & Mellon), 20 ppd; THEMIS-derived global TI mosaic (100 m, ±60°) | https://www.se.psi.edu/inertia/2007/ (TES) · https://astrogeology.usgs.gov/search/map/mars-themis-derived-global-thermal-inertia-mosaic |
| Dust cover / rocks | TES DCI (Ruff & Christensen); TES rock abundance (Nowicki & Christensen) | http://www.mars.asu.edu/data/ |
| Ground ice | SWIM v4 products | https://swim.psi.edu/products/ |
| Hydrogen | Mars Odyssey GRS/NS (PDS) | https://pds-geosciences.wustl.edu/missions/odyssey/grs.html |
| Climate (T, P, UV, dose proxy) | Mars Climate Database (LMD) | https://www-mars.lmd.jussieu.fr/ |
| Geology | USGS Geologic Map of Mars SIM 3292 | https://pubs.usgs.gov/sim/3292/ |
| Caves | Mars Global Cave Candidate Catalog (Cushing) | https://astrogeology.usgs.gov/search/map/mars_global_cave_candidate_catalog_v1_cushing |
| Browse | NASA Mars Trek | https://trek.nasa.gov/mars/ |

---

### 3.5 Earth analog sites (training set for validating the engine)
Coordinates marked (approx.) are representative points, not boundaries. "Users" lists published or official uses I could verify.

| Site | Coordinates | Analog for | Why it matches (matching factors) | Limitations | Used by |
|---|---|---|---|---|---|
| **Haughton impact structure, Devon Island, Nunavut** | 75.38°N, 89.68°W [R52] | Mars (and Moon) | ~23 km diameter impact structure in a polar desert. Permafrost, ground ice, impact breccias, cold and dry [R52][R53]. Age ~39 Ma (39.1 ± 1.7 Ma Ar-Ar) [R54]; older literature says ~23 Ma | Has an atmosphere, liquid water seasonally, and life. Gravity and radiation are Earth's | NASA Haughton-Mars Project (HMP) since 1997; Flashline Mars Arctic Research Station (Mars Society) [R53][R55] |
| **Atacama Desert, Chile (Yungay / María Elena South)** | Yungay ≈ 24.1°S, 70.0°W, ~1 km elevation (approx.) | Mars | Hyper-arid: rain as rare as once every ~20 years, ~0.15 mm/yr at some sites. Among the highest surface UV on Earth. Oxidizing soils and nitrate/perchlorate [R56]. At María Elena South, soil RH at 80 cm is 14.2%, matching Gale REMS lows [R56]. Viking-style experiments produced Mars-like null results [R57] | Has fog and episodic rain (2015, 2017, 2019 events) [R56]. Pressure is about 150× Mars | NASA ASTEP/ARADS and LITA/Zoë rover campaigns; many astrobiology studies [R56] |
| **McMurdo Dry Valleys, Antarctica** (University Valley, Beacon Valley) | ≈ 77.5°S, 162°E (approx.) | Mars (northern plains, Phoenix) | Cold, hyper-arid polar desert. University Valley ice table from 0 to >70 cm deep, and the valley never exceeds 0 °C [R58]. Treated as an analog of the Phoenix site | Higher humidity; Earth pressure and gravity | NASA ASTEP, Phoenix science team studies [R58] |
| **Río Tinto, Spain** | ≈ 37.7°N, 6.6°W (approx.) | Mars (acid-sulfate, Meridiani) | pH ~2.3 acidic river. Jarosite, goethite, and hematite iron-sulfate mineralogy like Meridiani [R60] | Dense biosphere; warm | NASA/CAB MARTE drilling experiment [R60] |
| **Mauna Kea / Mauna Loa, Hawai'i** (incl. HI-SEAS) | Mauna Kea ≈ 19.8°N, 155.5°W; HI-SEAS ≈ 19.6°N, 155.5°W at ~8,200 ft (approx.) | Moon and Mars | Basaltic volcanic regolith and tephra. NASA used Mauna Kea for lunar ISRU field tests (PISCES/RESOLVE 2010, 2012) [R61]. HI-SEAS is a long-duration habitat on Mauna Loa basalt [R62] | Vegetation in places, atmosphere, weathering | NASA ISRU and Analog Field Tests; HI-SEAS (NASA-funded missions 2013–2017) [R61][R62] |
| **Svalbard (Bockfjorden, AMASE)** | ≈ 79.4°N, 13.3°E (approx.) | Mars | Volcanic centers (Sverrefjell) with carbonate globules analogous to ALH84001. Permafrost, glacial terrain [R63] | Wet and vegetated in summer | AMASE: NASA GSFC/Ames/JSC and ESA instrument teams [R63] |
| **Iceland (Askja, Holuhraun, Vikrahraun)** | Askja ≈ 65.0°N, 16.8°W (approx.) | Moon and Mars | Basaltic lava fields, tephra, glacio-volcanic terrain. Vikrahraun (1961 lava) studied as a Mars analog [R64]. Apollo astronaut geology training 1965 and 1967 (secondary sources only; not verified at a primary NASA source) | Wet climate | ESA/NASA field tests; Apollo training (unverified) |
| **Mars Desert Research Station, Utah** | 38.4063°N, 110.7918°W (approx.; analog site box 38.40–38.44°N, 110.78–110.90°W) [R65] | Mars | Jurassic Morrison Formation; red sedimentary rocks, clays, inverted channels [R65] | Mainly an operations/habitat analog | Mars Society; NASA research campaigns [R65] |
| **Death Valley, California** (named in the challenge) | Badwater ≈ 36.2°N, 116.8°W (approx.) | Mars | Hyper-arid playa, evaporites, alluvial fans, extreme heat. Rover tests (Scarecrow) and Mars 2020 terrain-relative navigation (TRN) tests [R66] | Very hot, not cold | NASA JPL [R66] |
| **Lanzarote, Canary Islands** | ≈ 29.0°N, 13.6°W (approx.) | Moon and Mars | Young basaltic fields and lava tubes (La Corona) [R67] | Oceanic, vegetated in places | ESA PANGAEA astronaut geology training [R67] |
| **Pilbara (Dresser Fm), Australia** | ≈ 21°S, 119.5°E (approx.) | Mars (astrobiology, Jezero) | 3.48 Ga stromatolites and hydrothermal sediments, the oldest biosignature analogs [R68] | Ancient Earth biology, not a surface-environment analog | Mars 2020 and ExoMars science team training (2019) [R68] |
| **Erfoud / Tafilalt, Morocco** | ≈ 31.4°N, 4.2°W (approx.) | Mars | Desert hammada, dunes, Paleozoic sediments. MARS2013 site chosen from 17 candidates [R69]. Ibn Battuta Centre runs ESA/ExoMars testing [R70] | Warm, has an atmosphere | OeWF MARS2013; ESA/ExoMars field tests [R69][R70] |
| **Lonar crater, India** | 19.976°N, 76.508°E [R71] | Mars and Moon | ~1.8 km crater, 15–67 ka; the only well-preserved crater formed entirely in **basalt** (Deccan) [R71] | Lake, vegetation, monsoon | Studied by ISRO-linked and international groups [R71] |
| **Ladakh, India (Tso Kar, Puga)** | Tso Kar ≈ 33.3°N, 78.0°E (approx.) | Mars | High (~4.5 km), cold, arid plateau with high UV, hydrothermal springs, and evaporites [R72] | Atmosphere ~0.6 bar; vegetation | HABIT (ESA ExoMars instrument) tests; Indian Mars-analog studies [R72] |
| **NEEMO, Aquarius Reef Base, Florida** | ≈ 24.95°N, 80.45°W, 62 ft (19 m) deep [R73] | Moon and Mars (operations only) | Isolation, EVA operations, communication latency; missions up to 3 weeks [R73] | No surface-environment similarity at all | NASA NEEMO [R73] |
| **Nördlinger Ries, Germany** | ≈ 48.9°N, 10.6°E (approx.) | Moon | Complex impact crater with suevite and impact breccias. **Apollo 14 crew geology training, 11–13 Aug 1970** [R74] | Vegetated, inhabited | Apollo program (NASA) [R74] |
| **Sudbury, Ontario** | ≈ 46.6°N, 81.2°W (approx.) | Moon | 1.85 Ga impact structure with breccias and shatter cones. **Apollo 16 (Jul 1971) and Apollo 17 (23–25 May 1972)** crew training [R74][R75] | Vegetated, mined | Apollo program (NASA) [R74][R75] |
| **Black Point Lava Flow and Cinder Lake, Arizona** | Near Flagstaff (approx. 35.7°N, 111.4°W; 35.3°N, 111.5°W) | Moon | Basaltic lava flow used for Desert RATS (2008–2010) [R76]. Cinder Lake crater field: 143 + 354 blasted craters to replicate Apollo 11 terrain [R77] | Semi-arid, vegetated | NASA Desert RATS; Apollo training (USGS) [R76][R77] |
| **Lava Beds National Monument, California** | ≈ 41.7°N, 121.5°W (approx.) | Mars and Moon (caves) | Extensive basaltic lava tubes with ice and mineral deposits [R78] | Biosphere | NASA BRAILLE project [R78] |

**Validation idea:** treat these sites as positive controls. With a sensible use-case weighting they should land in the top few percentiles for their target body (e.g., Dry Valleys and Haughton for ice-rich Mars, Atacama for arid/UV Mars, Hawai'i/Lanzarote/Sudbury/Ries/Stillwater for lunar regolith/geology). NEEMO should **not** score high on environment, since it is an operations-only analog. Foucher et al. (2021) give a framework for "functional" analog classes (for example, by instrument test purpose) [R79].

---

## 4. Factor catalogue: Earth proxy, matching Moon/Mars dataset, and normalization

### 4.1 Factors

"Earth can span?" asks whether Earth's natural range actually reaches the Moon/Mars value. If it doesn't, the factor needs the gap handling in §5.

| # | Factor (challenge family) | Moon value / dataset | Mars value / dataset | Earth proxy and public dataset | Earth can span? | Normalization (see §4.2) |
|---|---|---|---|---|---|---|
| 1 | Mean surface temperature (environment) | Polar ridge summer ~200 K; PSR <110 K; equator mean 215.5 K [R18][R19][R19b]. Diviner | ~214 K global mean [R45]. MCD; TES/THEMIS surface temperature | MODIS LST MOD11A1/MYD11A1 (1 km, day/night) [R95]; ERA5-Land/WorldClim air temperature [R93][R94] | Partly. Mars mean yes (polar Earth). PSR <110 K no | Ratio similarity in kelvin, after clipping to the Earth-achievable range |
| 2 | Diurnal ΔT / thermal cycling (environment) | Equator 95–390 K (NSSDC) [R47]; Diviner ΔT ≈ 298 K (derived) [R18]. Polar ridges smaller and seasonal [R19b] | Viking 1: 184–242 K, ΔT ≈ 58 K (derived) [R45] | MODIS day − night LST (Terra + Aqua) [R95] | Mars-like ΔT plausibly yes in deserts. Lunar no. Max Earth LST amplitude: **not found** as a citable number | Ratio similarity on ΔT, plus achievable-clip and gap report |
| 3 | Cold-trap / ice-stability fraction (resources) | Fraction of area <110 K; PSR mask [R19][R23b]. PGDA LPSR, Diviner | Ice-stability depth (SWIM) [R43] | Permafrost probability/extent: ESA CCI Permafrost [R83]; NSIDC GGD318 [R84]; Obu 2019 [R83] | Yes, as a functional analog (frozen ground) | Bounded-fraction similarity 1 − abs(x − t) |
| 4 | Illumination regime / solar elevation (environment, ops) | 86–96% sunlit at best ridge points [R9][R10][R13]; low sun. PGDA 69 [R23] | Latitude-driven insolation (MCD) | Latitude/solar geometry; NASA POWER insolation [R102]; persistent cloud: EarthEnv cloud [R103] | Partly. High-latitude summer sun is "low-sun, long-shadow" | Use solar-elevation statistics (e.g., median noon elevation) with a Gaussian kernel. Illumination fraction is a Moon *site* attribute |
| 5 | Atmospheric pressure (environment) | ~3 × 10⁻¹⁵ bar (night) [R47] | 6.36 mb (4.0–8.7) [R45]; sites at −2 to −4 km are higher. MCD | ERA5 surface pressure [R93] or DEM-derived | **No** (vacuum, ~160× gap for Mars, derived) | log10(P); directional rank on Earth (lower = better), capped (§5) |
| 6 | Aridity / water availability (environment) | Dry (ice only in cold traps) | Hyper-arid surface; RH low [R56] | Global Aridity Index v3.1 (Zomer 2022) [R82]; ERA5 precipitation | Yes (directionally): Atacama, Dry Valleys | Use AI directly (lower = better), percentile within Earth |
| 7 | Ground ice depth / abundance (resources) | LCROSS 5.6 ± 2.9 wt% [R12]; LEND H [R14] | SWIM 0–1, 1–5, >5 m bands [R43]; Phoenix 4.6 cm [R40]; scarps 1–2 m [R41]; GRS | Permafrost extent and active-layer depth: ESA CCI [R83], GGD318 [R84] | Yes (Dry Valleys, Arctic) | Depth-band categorical match (Gower) or Gaussian on depth with physical τ |
| 8 | Ionizing radiation (environment) | 1369 µSv/d [R20] | 0.64 mSv/d (Gale) [R31]; lower dose at higher column depth [R32] | Cosmic-ray dose vs altitude and cutoff rigidity: EXPACS model [R89]; OTSO cutoff-rigidity tool [R88]; UNSCEAR average 2.4 mSv/yr [R59] | **No** (~100–200× gap, derived) | log10(dose); directional percentile on Earth (higher altitude/latitude = closer), capped (§5) |
| 9 | Surface UV (environment) | Unshielded solar UV (no atmosphere); dose number not used here | ~10³ × present Earth for DNA-weighted UV (inferred from [R46]) | TEMIS UV index/dose [R90]; OMI OMUVBd [R91]; NASA POWER UV index [R102]. Peak reports: Cabrol UVI 43.3 [R92] is disputed; realistic ~25 ± 5 [R92b][R92c] | **No** (magnitude) | log10 or directional percentile, capped |
| 10 | Slope / roughness (topography) | Lander ≤8° (goal ≤5°) [R16]. LOLA 5–20 m [R23b] | <5° at 10 m (Starship) [R27]; <~10° (HLS 2015) [R25]. MOLA/HRSC; HiRISE DTMs locally | Copernicus GLO-30 DEM [R99]; SRTMGL1 [R100] | Yes | Fraction of area under the threshold at a **matched baseline**: bounded-fraction similarity. Report baseline used |
| 11 | Elevation / relief (topography) | Relative relief (ridges, massifs) [R5] | MOLA < −2 km preferred [R27]; < +2 km [R25] | DEM local relief | Relief yes; absolute elevation not meaningful across bodies | Compare **local relief** (e.g., range within 1–10 km) with ratio similarity, not absolute elevation |
| 12 | Lithology / bulk composition (geology) | Anorthositic highlands at the south pole; NU-LHT used Stillwater anorthosite [R22] | Basaltic plains; local sulfates/clays (Jezero, Gale) [R34][R36]. USGS SIM 3292 | GLiM lithology map [R85]; ASTER GED AG100 emissivity (silica proxy) [R98] | Yes (basalt, anorthosite, evaporite exist) | Categorical match (Gower 0/1, or a similarity matrix, e.g., basalt↔basalt = 1, basalt↔andesite = 0.5, set and documented by the team) |
| 13 | Regolith physics / thermal inertia (geology, ops) | Bulk density 1.50 ± 0.05 g/cm³; grains ~70 µm [R21] | TES/THEMIS TI; exclude TI < 100 [R27][R49] | Apparent thermal inertia ATI = (1 − albedo)/ΔT (Price 1977) [R87] from MODIS albedo + LST [R95][R97]; SoilGrids texture/bulk density [R86] | Ordinal only (ATI ≠ true TI units) | Within-body percentile classes (dusty ↔ sandy ↔ rocky), then match classes |
| 14 | Albedo (environment) | Bond 0.11 [R47] | Bond 0.25 [R45]; TES albedo | MODIS MCD43A3 [R97] | Yes | Absolute difference (bounded fraction) |
| 15 | Lifelessness / vegetation (environment) | Lifeless | Lifeless (no confirmed life) | MODIS NDVI MOD13A3 [R96]; ESA WorldCover [R101] | Yes (directionally) | Lower NDVI = better; bounded |
| 16 | Geomorphic flags (geology) | Impact craters, PSRs, massifs | Impact craters, lava tubes/caves (MGC³), periglacial, debris-covered glaciers | Earth Impact Database / literature; lava-tube catalogs; challenge names caves [R0] | Yes | Binary flags in Gower; bonus weight per use-case |
| 17 | Earth visibility / DTE (ops) | Earth-visibility % (GDRVIS) [R24]; Malapert 100% summit [R30] | Not applicable (relay/DTE varies) | None | n/a | **Moon-side attribute only.** Do not score Earth sites on it |
| 18 | Gravity / vacuum | 1.62 m/s² [R47] | 3.73 m/s² [R45] | Earth 9.82 m/s² [R48] | **No** | **Not scored.** Report as an irreducible gap (§5) |
| 19 | Operational accessibility (ops) | — | — | Road/airport distance, permits, protected status (e.g., OSM, WDPA) | n/a | Separate axis (feasibility), not part of similarity |

### 4.2 Recommended normalization and aggregation (defensible and explainable)

1. **Per-factor similarity in [0, 1] using physically meaningful transforms**, never raw z-scores pooled across bodies:
   - **Ratio-scale variables** (temperature in K, pressure, dose, ΔT, relief): ESI-style ratio similarity `s = 1 − |x − t| / (x + t)` (Schulze-Makuch et al. 2011) [R80]. It is scale-free, bounded, and has precedent in planetary similarity work.
   - **Variables spanning orders of magnitude** (pressure, dose, UV): take log10 first, then apply min–max over **physical bounds** spanning all bodies (e.g., log10 P from vacuum to 1014 mb), not data-driven Earth-only bounds.
   - **Bounded fractions** (cold-trap fraction, low-slope fraction, albedo, NDVI): `s = 1 − |x − t|`.
   - **Threshold-type engineering criteria** (slope ≤5–8°, latitude <40°): Gaussian kernel `s = exp(−½((x − t)/τ)²)`, with τ set from the documented threshold (e.g., τ = 3° for slope, the gap between the 5° goal and the 8° limit [R16]). Write τ down.
   - **Categorical** (lithology, depth band, geomorphic flags): Gower distance (Gower 1971) [R81] with numeric terms scaled by physical range R_k: `d_k = |x − y| / R_k`.
2. **Earth-achievable target clip.** For each factor compute `t* = clip(t, Earth_min, Earth_max)` and score against t*. Keep `gap = |t − t*|` and **show it next to the score**. Earth sites are then ranked on what Earth can provide, without claiming Earth matches the impossible part.
3. **Directional percentile for unreachable factors** (radiation, UV, pressure, lunar ΔT): `s = c · P_dir(x)`, where P_dir is the within-Earth percentile in the direction of the target (e.g., higher altitude/lower pressure ranks higher). The cap `c` is the ratio similarity between Earth's most extreme value and the target, so even the best Earth site can't look like a true match. (Example: Mars pressure. Even a 0.5 bar mountaintop gives `1 − (500 − 6.36)/(500 + 6.36)` ≈ 0.025, derived.) In effect these factors become tie-breakers.
4. **Aggregation:**
   - Apply **hard filters first** for must-haves defined by the use case (e.g., permafrost present for ISRU-ice).
   - Then take a **weighted geometric mean** `S = Π s_i^(w_i/Σw)` (ESI-style [R80]) for core factors, so one terrible factor can't be hidden by others.
   - Use an arithmetic mean for secondary factors.
   - Report the per-factor breakdown (radar/bar chart) as the "characterization" the challenge asks for.
5. **Use-case weight profiles**, because the right analog depends on the purpose (Foucher et al. 2021 "functional analogues") [R79]:
   - *ISRU-ice*: ice, cold-trap/permafrost, temperature, slope.
   - *EVA/thermal & power*: ΔT, low sun, illumination, slope.
   - *Geology/regolith*: lithology, TI/ATI, crater/lava flags.
   - *Astrobiology*: aridity, UV, NDVI, mineralogy.
   - *Operations*: slope, relief, accessibility as the second axis.
   - Set weights with pairwise comparison (AHP-style) and publish them.
6. **Sensitivity analysis.** Draw weights from a Dirichlet distribution centered on the chosen profile (Monte Carlo, e.g., 1,000 draws). Report each site's **median rank and top-k frequency**. Robust sites are better recommendations.
7. **Validation.**
   - Positive controls: established analogs from §3.5 should rank in the top percentiles for their target body (e.g., Dry Valleys/Haughton for ice-rich Mars, Atacama for arid/UV Mars, Hawai'i/Lanzarote/Ries/Sudbury/Stillwater for lunar geology).
   - Negative controls (humid forests, cities) should rank low.
   - Report precision@k or a rank-based AUC.
8. **Common grid and resolution honesty.**
   - Resample to a common grid (e.g., 1 km for Earth MODIS-based factors) and record each dataset's native resolution. Examples: SWIM ~3 km/px [R43]; TES TI 20 ppd ≈ 3 km at the equator (derived from Mars radius); LOLA polar 5–20 m [R23b].
   - Match **slope baselines** across bodies. A 30 m Earth slope is not a 5 m lunar slope.
9. **Within-body z-scores only for within-body ranking** (e.g., ranking the nine lunar regions against each other), never for cross-body similarity.

---

## 5. Irreducible gaps (what Earth can't provide) and how to handle them

| Gap | Moon | Mars | Earth | Ratio (derived) | Handling |
|---|---|---|---|---|---|
| Gravity | 1.62 m/s² [R47] | 3.73 m/s² [R45] | 9.82 m/s² [R48] | Earth/Moon ≈ 6.1×; Earth/Mars ≈ 2.6× | Exclude from scoring; state it in the UI. Gravity-dependent tests (dust lofting, regolith mechanics) need reduced-gravity facilities, not field analogs |
| Pressure / vacuum | ~3 × 10⁻¹⁵ bar [R47] | 6.36 mb [R45] | 1014 mb [R48] | Earth/Mars ≈ 160× | Directional percentile plus cap (§4.2-3), or exclude. Vacuum: not scored |
| Ionizing radiation | 1369 µSv/d [R20] | 640 µSv/d [R31] | ≈ 6.6 µSv/d (2.4 mSv/yr) [R59] | ~97× (Mars), ~208× (Moon) | log10 plus directional percentile (EXPACS, cutoff rigidity), capped. Report absolute doses next to relative scores |
| UV | Unshielded | ~10³ × present Earth (inferred) [R46] | Peak UVI ~25 ± 5 realistic [R92b] | ~10³ (inferred) | Directional percentile, capped |
| Diurnal ΔT (Moon) | ~298 K equatorial (derived) [R18] | 58 K (Viking 1) [R45] | NSSDC mean 10 K diurnal range [R48]; desert max: not found | Moon: large | Achievable-clip plus gap report. For Mars, deserts may approach the range |

**Recommended stance:** follow analog practice and treat Earth sites as *partial* or *functional* analogs [R79]. Score only the factors Earth can plausibly vary. Show irreducible gaps as a constant "not reproducible on Earth" panel, so judges see them handled honestly instead of quietly dropped.

---

## 6. Compact summary table (factor × Moon × Mars × Earth proxy × dataset × normalization)

| Factor | Moon value | Mars value | Earth proxy | Earth dataset | Moon / Mars dataset | Normalization |
|---|---|---|---|---|---|---|
| Mean T | ~200 K ridge summer; <110 K PSR | ~214 K | LST / air T | MODIS MOD11A1/MYD11A1; ERA5-Land; WorldClim | Diviner / MCD, TES | Ratio sim. (K), achievable clip |
| Diurnal ΔT | 95–390 K equator; smaller at poles | 184–242 K (Viking 1) | Day − night LST | MODIS Terra + Aqua | Diviner / MCD | Ratio sim. + gap report |
| Cold trap / ice stability | <110 K area | SWIM depth bands | Permafrost probability | ESA CCI Permafrost; NSIDC GGD318 | PGDA LPSR, Diviner / SWIM | 1 − abs(Δfraction) |
| Ground ice | 5.6 ± 2.9 wt% (LCROSS) | 4.6 cm table (Phoenix); 1–2 m (scarps) | Permafrost / active layer | ESA CCI; GGD318 | LEND / SWIM, GRS | Gower depth band or Gaussian |
| Illumination / sun elevation | 86–96% best ridges; low sun | Latitude-driven | Solar geometry, cloud | NASA POWER; EarthEnv cloud | PGDA 69 / MCD | Gaussian on solar elevation |
| Pressure | ~3 × 10⁻¹⁵ bar | 6.36 mb | Surface P | ERA5 | — / MCD | log10, directional percentile, capped |
| Aridity | Dry | Hyper-arid | Aridity index | Global AI v3.1 | — | Percentile (lower = better) |
| Radiation | 1369 µSv/d | 0.64 mSv/d | Cosmic dose vs altitude/rigidity | EXPACS; OTSO; UNSCEAR | LND / RAD, MCD column | log10, directional percentile, capped |
| UV | Unshielded | ~10³ × Earth (inferred) | UV index / dose | TEMIS; OMI OMUVBd; NASA POWER | — / MCD | Directional percentile, capped |
| Slope | ≤8° (goal ≤5°) | <5° @10 m; <~10° | DEM slope | Copernicus GLO-30; SRTMGL1 | LOLA PGDA / MOLA, HRSC | Fraction below threshold, matched baseline |
| Local relief | Ridges/massifs | Plains, < −2 km | DEM relief | GLO-30 | LOLA / MOLA | Ratio sim. on relief |
| Lithology | Anorthosite highland | Basalt; sulfates/clays | Rock type, silica | GLiM; ASTER GED | (LROC/M3) / SIM 3292 | Gower categorical / similarity matrix |
| Regolith / TI | 1.50 g/cm³; ~70 µm | TI ≥100 required | ATI; soil texture | MODIS albedo + LST; SoilGrids | Diviner / TES, THEMIS TI | Within-body percentile classes |
| Albedo | 0.11 | 0.25 | Surface albedo | MODIS MCD43A3 | NSSDC / TES | 1 − abs(Δ) |
| Lifelessness | None | None | NDVI, land cover | MOD13A3; ESA WorldCover | — | Lower = better |
| Geomorphic flags | Craters, PSRs | Craters, caves, glaciers | Craters, lava tubes | Literature / catalogs | LOLA / MGC³ | Binary Gower |
| Earth visibility | % visible (GDRVIS) | n/a | n/a | n/a | GDRVIS | Moon attribute only |
| Gravity / vacuum | 1.62 m/s² / vacuum | 3.73 m/s² | 9.82 m/s² | NSSDC | NSSDC | Not scored (gap) |

---

## 7. Gaps and "not found"

- **Official region polygons/coordinates for the nine Artemis regions:** not published as data (map images only) [R4][R5]. §2.2 uses IAU feature centers; digitize polygons from the NASA map/SVS for precise work.
- **Per-region illumination and Earth-visibility percentages for the nine regions:** not found in public text. Compute them from PGDA 69 and GDRVIS [R23][R24].
- **Citable maximum diurnal LST amplitude on Earth:** not found. Compute it from MODIS.
- **Moon Base II/III landing sites:** not stated in the NASA release [R6]. A media claim of Nobile was not verifiable from NASA and is not used.
- **Mars 2020 numeric engineering limits:** not verified. MSL limits [R37] and Starship limits [R27] are given instead.
- **Lunar regolith cohesion/friction-angle values:** in Lunar Sourcebook Ch. 9 [R21], but not transcribed and verified here.
- **Full list of 47 Mars EZ coordinates:** see [R25][R26b]. Not reproduced.

---

## References

**Challenge and programs**
- [R0] NASA Space Apps Challenge 2026, "Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars." https://www.spaceappschallenge.org/2026/challenges/identify-earth-locations-that-analog-the-permanent-moon-base-locations-and-mars/
- [R1] NASA (Feb 2026), "NASA Adds Mission to Artemis Lunar Program, Updates Architecture." https://www.nasa.gov/news-release/nasa-adds-mission-to-artemis-lunar-program-updates-architecture/
- [R2] NASA, Artemis IV mission page. https://www.nasa.gov/mission/artemis-iv/
- [R3] NASA (Mar 2026), "NASA Charts More Reliable Course for America's Return to Lunar Surface" (PDF). https://www.nasa.gov/wp-content/uploads/2026/03/going-back-to-the-moon.pdf
- [R4] NASA (Oct 2024), "NASA Provides Update on Artemis III Moon Landing Regions." https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
- [R5] George, T., Rubio, M. A., Lawrence, S. J., Curell, P. (2026), "Artemis III Site Selection Update: Down-selection from 13 to 9 Candidate Regions," 57th LPSC, #1901. https://www.hou.usra.edu/meetings/lpsc2026/pdf/1901.pdf
- [R6] NASA Release 26-046 (26 May 2026), "NASA Provides Update on Moon Base Rovers, Landers, Missions." https://www.nasa.gov/news-release/nasa-provides-update-on-moon-base-rovers-landers-missions/ (see also https://www.nasa.gov/moonbase/)
- [R7] NASA (Aug 2022), "NASA Identifies Candidate Regions for Landing Next Americans on Moon." https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/
- [R8] NASA (Apr 2026), Moon Base User's Guide. https://www.nasa.gov/wp-content/uploads/2026/04/moon-base-architecture-users-guide.pdf

**Moon science**
- [R9] Mazarico, E., et al. (2011), Illumination conditions of the lunar polar regions using LOLA topography, *Icarus* 211, 1066–1081. doi:10.1016/j.icarus.2010.10.030 · NTRS: https://ntrs.nasa.gov/citations/20120010094
- [R10] Gläser, P., et al. (2014), Illumination conditions at the lunar south pole using high resolution DTMs from LOLA, *Icarus* 243, 78–90. doi:10.1016/j.icarus.2014.08.013
- [R11] Gläser et al. (2014), DLR eLib record. https://elib.dlr.de/94240/
- [R12] Colaprete, A., et al. (2010), Detection of water in the LCROSS ejecta plume, *Science* 330, 463–468. doi:10.1126/science.1186986
- [R12b] Strycker, P. D., et al. (2013), Characterization of the LCROSS impact plume from a ground-based imaging detection, *Nature Communications* 4, 2620. doi:10.1038/ncomms3620
- [R13] Quinn, D. P., et al. (2011), Exploration potential for highly illuminated points at the lunar poles using Kaguya, LOLA, and LROC data sets, 42nd LPSC, #2518. https://www.lpi.usra.edu/meetings/lpsc2011/pdf/2518.pdf
- [R14] Mitrofanov, I. G., et al. (2010), Hydrogen mapping of the lunar south pole using the LRO neutron detector experiment LEND, *Science* 330, 483–486. doi:10.1126/science.1185696
- [R14b] Sanin, A. B., et al. (2012), Testing lunar permanently shadowed regions for water ice: LEND results from LRO, *JGR Planets* 117, E00H26. doi:10.1029/2011JE003971
- [R14c] Magaña, L. O., et al. (2020), Lunar surface ice identifications by LRO LAMP far-ultraviolet spectroscopy, Lunar Surface Science Workshop, #5162. https://www.hou.usra.edu/meetings/lunarsurface2020/pdf/5162.pdf
- [R15] Paige, D. A., et al. (2010), Diviner Lunar Radiometer observations of cold traps in the Moon's south polar region, *Science* 330, 479–482. doi:10.1126/science.1187726
- [R16] Chavers, G., et al. (2020), NASA's Human Landing System: The Strategy for the 2024 Mission and Future Sustainability (incl. HLS-R-0071). https://ntrs.nasa.gov/api/citations/20200001606/downloads/20200001606.pdf
- [R17] Li, S., et al. (2018), Direct evidence of surface exposed water ice in the lunar polar regions, *PNAS* 115, 8907–8912. doi:10.1073/pnas.1802345115
- [R18] Williams, J.-P., et al. (2017), The global surface temperatures of the Moon as measured by the Diviner Lunar Radiometer Experiment, *Icarus* 283, 300–325. doi:10.1016/j.icarus.2016.08.012 · https://ui.adsabs.harvard.edu/abs/2017Icar..283..300W/abstract
- [R19] Williams, J.-P., et al. (2023), Temperatures of the candidate Artemis III landing sites observed by LRO Diviner, Artemis III Candidate Landing Regions Workshop, #2040. https://www.hou.usra.edu/meetings/Artemis_III_2023/pdf/2040.pdf
- [R19b] Williams, J.-P., et al. (2020), Mapping seasonal and diurnal temperatures in the polar regions with LRO Diviner, Lunar Surface Science Workshop, #5105. https://www.hou.usra.edu/meetings/lunarsurface2020/pdf/5105.pdf
- [R19c] Williams, J.-P., et al. (2019), Seasonal variations in south polar temperatures on the Moon, 50th LPSC, #2852. https://www.hou.usra.edu/meetings/lpsc2019/pdf/2852.pdf (journal version: doi:10.1029/2019JE006028)
- [R20] Zhang, S., et al. (2020), First measurements of the radiation dose on the lunar surface, *Science Advances* 6, eaaz1334. doi:10.1126/sciadv.aaz1334
- [R21] Carrier, W. D., Olhoeft, G. R., Mendell, W. (1991), Physical properties of the lunar surface, *Lunar Sourcebook*, Ch. 9. https://www.lpi.usra.edu/publications/books/lunar_sourcebook/pdf/Chapter09.pdf
- [R21b] Carrier, W. D., Lunar soil grain size distribution / properties (LPI). https://www.lpi.usra.edu/lunar/surface/carrier_lunar_soils.pdf
- [R22] NASA ARES, NU-LHT lunar highland simulant. https://ares.jsc.nasa.gov/projects/simulants/nu-lht.html
- [R23] NASA GSFC PGDA, Lunar Polar Illumination (product 69). https://pgda.gsfc.nasa.gov/products/69
- [R23b] NASA GSFC PGDA, high-resolution LOLA polar DEMs/slopes/PSR (products 78, 81, 90). https://pgda.gsfc.nasa.gov/products/78 · https://pgda.gsfc.nasa.gov/products/81 · https://pgda.gsfc.nasa.gov/products/90
- [R24] PDS ODE, LOLA GDR Earth-visibility (GDRVIS) help. https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/LRO/LOLA/GDR/GDRVIS.htm
- [R29] USGS/IAU Gazetteer of Planetary Nomenclature. https://planetarynames.wr.usgs.gov/
- [R30] Petro, N. E., Moriarty, D. P. (2021), Mons Malapert: A site in support of exploration of the lunar south pole and Earth observations, Lunar Surface Science Workshop, #8015. https://www.hou.usra.edu/meetings/lunarsurface12/pdf/8015.pdf

**Mars science and site selection**
- [R25] Hoffman, S. J., Bussey, B. (2016), Human Mars Landing Site and Impacts on Mars Surface Operations, IEEE Aerospace Conf. https://ntrs.nasa.gov/citations/20160001040
- [R26] NASA (2015), First Landing Site/EZ Workshop, Supplemental Background Information. https://www.hou.usra.edu/meetings/explorationzone2015/program_presenter_info/Supplemental%20_Paper.pdf
- [R26b] First Landing Site/Exploration Zone Workshop for Human Missions to the Surface of Mars (2015). https://www.hou.usra.edu/meetings/explorationzone2015/
- [R27] Golombek, M., et al. (2021), SpaceX Starship landing sites on Mars, 52nd LPSC, #2420. https://www.hou.usra.edu/meetings/lpsc2021/pdf/2420.pdf
- [R31] Hassler, D. M., et al. (2014), Mars' surface radiation environment measured with the MSL Curiosity rover, *Science* 343, 1244797. doi:10.1126/science.1244797
- [R32] Guo, J., et al. (2017), Dependence of the Martian radiation environment on atmospheric depth, *JGR Planets* 122. doi:10.1002/2016JE005206
- [R32b] Guo, J., et al. (2021), Radiation environment for future human exploration on the surface of Mars, *JGR Planets*. doi:10.1029/2021JE007157 · https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2021JE007157
- [R34] Grant, J. A., et al. (2018), The science process for selecting the landing site for the 2020 Mars rover, *Planet. Space Sci.* 164, 106–126. doi:10.1016/j.pss.2018.07.001
- [R35] Golombek, M. P., et al. (2016), Downselection of landing sites proposed for the Mars 2020 rover mission, 47th LPSC, #2324. https://www.hou.usra.edu/meetings/lpsc2016/pdf/2324.pdf
- [R36] Vasavada, A. R., et al. (2014), Overview of the MSL mission: Bradbury Landing to Yellowknife Bay and beyond, *JGR Planets* 119. doi:10.1002/2014JE004622
- [R37] Golombek, M., et al. (2012), Selection of the Mars Science Laboratory landing site, *Space Sci. Rev.* 170, 641–737. doi:10.1007/s11214-012-9916-y
- [R38] Zhurong landing-site paper, *Nature Astronomy* (2021). doi:10.1038/s41550-021-01519-5 · https://www.nature.com/articles/s41550-021-01519-5
- [R39] Andres, C. N., Smith, I. B. (2025), Regional ice-depth and thickness in Phlegra Montes, Mars from radar characterization of glacial landsystems using SHARAD, *JGR Planets*. doi:10.1029/2024JE008830 · https://ui.adsabs.harvard.edu/abs/2025JGRE..13008830A/abstract
- [R40] Mellon, M. T., et al. (2009), Ground ice at the Phoenix landing site, *JGR* 114, E00E07. doi:10.1029/2009JE003417
- [R41] Dundas, C. M., et al. (2018), Exposed subsurface ice sheets in the Martian mid-latitudes, *Science* 359, 199–201. doi:10.1126/science.aao1619
- [R42] Morgan, G. A., et al. (2021), Availability of subsurface water-ice resources in the northern mid-latitudes of Mars, *Nature Astronomy* 5, 230–236. doi:10.1038/s41550-020-01290-z
- [R43] Morgan, G. A., Putzig, N. E., et al. (2025), SWIM, *Planetary Science Journal*. doi:10.3847/PSJ/ad9b24 · https://iopscience.iop.org/article/10.3847/PSJ/ad9b24
- [R44] SWIM project data products. https://swim.psi.edu/
- [R45] NASA NSSDC, Mars Fact Sheet. https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html
- [R46] Cockell, C. S., et al. (2000), The ultraviolet environment of Mars: biological implications past, present, and future, *Icarus* 146, 343–359. doi:10.1006/icar.2000.6393 · https://ntrs.nasa.gov/citations/20040088828
- [R47] NASA NSSDC, Moon Fact Sheet. https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html
- [R48] NASA NSSDC, Earth Fact Sheet. https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html
- [R49] Putzig, N. E., Mellon, M. T. (2007), Apparent thermal inertia and the surface heterogeneity of Mars, *Icarus* 191, 68–94. doi:10.1016/j.icarus.2007.05.013 · data: https://se.psi.edu/inertia/2007/
- [R50] Ruff, S. W., Christensen, P. R. (2002), Bright and dark regions on Mars: particle size and mineralogical characteristics based on TES data, *JGR* 107. doi:10.1029/2001JE001580 · data: https://mars.asu.edu/data/
- [R51] Nowicki, S. A., Christensen, P. R. (2007), Rock abundance on Mars from TES, *JGR* 112. doi:10.1029/2006JE002798

**Earth analogs**
- [R52] LPI, Haughton impact structure. https://www.lpi.usra.edu/science/kring/epo_web/impact_cratering/World_Craters_web/northamericacraters/Haughton.html
- [R53] Osinski, G. R., et al. (2005), Geological overview and cratering model for the Haughton impact structure, *Meteoritics & Planet. Sci.* 40. doi:10.1111/j.1945-5100.2005.tb00145.x
- [R54] Sherlock, S. C., et al. (2005), Re-evaluating the age of the Haughton impact event, *Meteoritics & Planet. Sci.* 40. doi:10.1111/j.1945-5100.2005.tb00146.x
- [R55] Mars Institute, Haughton-Mars Project. https://www.marsinstitute.no/hmp
- [R56] Azua-Bustos, A., et al. (2022), The Atacama Desert in northern Chile as an analog model of Mars, *Front. Astron. Space Sci.* 8, 810426. doi:10.3389/fspas.2021.810426
- [R57] Navarro-González, R., et al. (2003), Mars-like soils in the Atacama Desert and the dry limit of microbial life, *Science* 302, 1018–1021. doi:10.1126/science.1089143
- [R58] Marinova, M. M., et al. (2011), The high-elevation Dry Valleys of Antarctica as a Mars polar analogue, 5th Mars Polar Sci. Conf., #6051. https://www.lpi.usra.edu/meetings/polar2011/pdf/6051.pdf · Tamppari, L. K., et al., McMurdo Dry Valleys, Antarctica: a Mars Phoenix mission analog. https://ntrs.nasa.gov/api/citations/20100003844/downloads/20100003844.pdf
- [R59] UNSCEAR (2008), Sources and Effects of Ionizing Radiation, Vol. I (worldwide average natural background 2.4 mSv/yr). https://www.unscear.org/unscear/en/publications/2008_1.html
- [R60] Amils, R., et al. (2014), Río Tinto: a geochemical and mineralogical terrestrial analogue of Mars, *Life* 4, 511–534. doi:10.3390/life4030511
- [R61] ten Kate, I. L., et al. (2010/2011), Mauna Kea, Hawaii as an analogue site for future planetary resource exploration: results from the 2010 ILSO-ISRU field-testing campaign. https://ntrs.nasa.gov/citations/20110008363 · ASCE J. Aerosp. Eng. doi:10.1061/(ASCE)AS.1943-5525.0000200
- [R62] HI-SEAS, missions I–VI. https://www.hi-seas.org/missions-i-vi (site may block automated fetches)
- [R63] NASA GSFC, AMASE project. https://science.gsfc.nasa.gov/699/projects/247
- [R64] Vikrahraun (Iceland) Mars-analog lava study, *Earth, Planets and Space* (2022). doi:10.1186/s40623-022-01711-5
- [R65] Clarke, J. D. A., Stoker, C. R. (2011), Concretions in exhumed channels near Hanksville, Utah: implications for Mars. https://ntrs.nasa.gov/api/citations/20110023235/downloads/20110023235.pdf · Utah desert analogue sites (2011), #6029. https://www.lpi.usra.edu/meetings/analogues2011/pdf/6029.pdf
- [R66] NPS, Death Valley: NASA testing. https://www.nps.gov/deva/nasa.htm
- [R67] ESA, PANGAEA. https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/CAVES_and_Pangaea/What_is_PANGAEA
- [R68] NASA, "Mars Scientists Investigate Ancient Life in Australia." https://www.nasa.gov/solar-system/mars-scientists-investigate-ancient-life-in-australia/
- [R69] Austrian Space Forum (OeWF), MARS2013 Morocco. https://oewf.org/en/portfolio/morocco-mars-2013/
- [R70] Ibn Battuta Centre, experiments. https://www.ibnbattutacentre.org/experiments.html
- [R71] Maloof, A. C., et al. (2007), Lonar Crater, India: an analog for Martian impact craters, 38th LPSC, #2316. https://www.lpi.usra.edu/meetings/lpsc2007/pdf/2316.pdf
- [R72] Pandey, S., et al. (2020), Ladakh: diverse, high-altitude extreme environments for off-Earth analogue and astrobiology research, *Int. J. Astrobiology*. doi:10.1017/S1473550419000119
- [R73] NASA, About NEEMO. https://www.nasa.gov/missions/analog-field-testing/neemo/about-neemo-nasa-extreme-environment-mission-operations/
- [R74] Apollo Lunar Surface Journal, Apollo geology field trips (compiled list). https://apollojournals.org/alsj/ap-geotrips.pdf
- [R75] USGS, Apollo 17 geologic training exercise, Sudbury, Ontario (data release). https://www.usgs.gov/data/apollo-17-geologic-training-exercise-sudbury-ontario-basin-19720328
- [R76] LPI, Black Point Lava Flow analog. https://www.lpi.usra.edu/lunar/analogs/blackpoint/
- [R77] USDA Forest Service, Cinder Lakes Apollo training area history. https://www.fs.usda.gov/r03/coconino/recreation/discover-history/cinder-lakes-apollo-training-area-history
- [R78] NASA BRAILLE, Lava Beds field site. https://www.nasa-braille.org/about-braille/the-field-site/lava-tubes
- [R79] Foucher, F., et al. (2021), Definition and use of functional analogues in planetary exploration, *Planet. Space Sci.* 197, 105162. doi:10.1016/j.pss.2021.105162 · https://hal.science/hal-03130725v1/document

**Methods and Earth datasets**
- [R80] Schulze-Makuch, D., et al. (2011), A two-tiered approach to assessing the habitability of exoplanets (ESI), *Astrobiology* 11, 1041–1052. doi:10.1089/ast.2010.0592
- [R81] Gower, J. C. (1971), A general coefficient of similarity and some of its properties, *Biometrics* 27, 857–871. doi:10.2307/2528823
- [R82] Zomer, R. J., Xu, J., Trabucco, A. (2022), Version 3 of the Global Aridity Index and PET database, *Scientific Data* 9, 409. doi:10.1038/s41597-022-01493-1 · data: https://doi.org/10.6084/m9.figshare.7504448
- [R83] ESA Climate Change Initiative, Permafrost. https://climate.esa.int/en/projects/permafrost/ · Obu, J., et al. (2019), Northern Hemisphere permafrost map, *Earth-Sci. Rev.* 193, 299–316. doi:10.1016/j.earscirev.2019.04.023
- [R84] NSIDC, Circum-Arctic Map of Permafrost and Ground-Ice Conditions (GGD318), v2. https://nsidc.org/data/ggd318/versions/2
- [R85] Hartmann, J., Moosdorf, N. (2012), The new global lithological map database GLiM, *G³* 13. doi:10.1029/2012GC004370 · data: https://doi.pangaea.de/10.1594/PANGAEA.788537
- [R86] Poggio, L., et al. (2021), SoilGrids 2.0, *SOIL* 7, 217–240. doi:10.5194/soil-7-217-2021 · https://soilgrids.org/
- [R87] Price, J. C. (1977), Thermal inertia mapping: a new view of the Earth, *JGR* 82(18), 2582–2590. doi:10.1029/JC082i018p02582
- [R88] OTSO: open-source tool for geomagnetic cutoff rigidity (Zenodo). doi:10.5281/zenodo.11580448
- [R89] JAEA, EXPACS (cosmic-ray spectra and dose model). https://phits.jaea.go.jp/expacs/top-eng.htm
- [R90] TEMIS, UV radiation products. https://www.temis.nl/uvradiation/
- [R91] NASA GES DISC, OMI OMUVBd v003. https://disc.gsfc.nasa.gov/datasets/OMUVBd_003/summary
- [R92] Cabrol, N. A., et al. (2014), Record solar UV irradiance in the tropical Andes, *Front. Environ. Sci.* 2, 19. doi:10.3389/fenvs.2014.00019
- [R92b] McKenzie, R., et al. (2015), Comment on "Record solar UV irradiance in the tropical Andes, by Cabrol et al.", *Front. Environ. Sci.* doi:10.3389/fenvs.2015.00026
- [R92c] NCAR/UCAR DASH, "Critical appraisal of data used to infer record UVI in the tropical Andes" (dataset). https://ckanprod.data-commons.k8s.ucar.edu/dataset/critical-appraisal-of-data-used-to-infer-record-uvi-in-the-tropical-andes
- [R93] Hersbach, H., et al. (2020), The ERA5 global reanalysis, *QJRMS* 146. doi:10.1002/qj.3803 · https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels · https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land
- [R94] Fick, S. E., Hijmans, R. J. (2017), WorldClim 2, *Int. J. Climatol.* 37. doi:10.1002/joc.5086 · https://www.worldclim.org/data/worldclim21.html
- [R95] NASA LP DAAC, MODIS LST MOD11A1 / MYD11A1 v061. https://lpdaac.usgs.gov/products/mod11a1v061/ · https://lpdaac.usgs.gov/products/myd11a1v061/
- [R96] NASA LP DAAC, MOD13A3 v061 (monthly NDVI). https://lpdaac.usgs.gov/products/mod13a3v061/
- [R97] NASA LP DAAC, MCD43A3 v061 (albedo). https://lpdaac.usgs.gov/products/mcd43a3v061/
- [R98] NASA LP DAAC, ASTER GED AG100 v003. https://lpdaac.usgs.gov/products/ag100v003/
- [R99] Copernicus DEM (GLO-30/GLO-90). https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM · AWS: https://registry.opendata.aws/copernicus-dem/
- [R100] NASA LP DAAC, SRTMGL1 v003. https://lpdaac.usgs.gov/products/srtmgl1v003/
- [R101] ESA WorldCover. https://esa-worldcover.org/
- [R102] NASA POWER API. https://power.larc.nasa.gov/docs/services/api/
- [R103] EarthEnv global cloud cover. https://www.earthenv.org/cloud
