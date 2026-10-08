# NASA Space Apps 2026: Challenge Brief (ground truth)
**Challenge:** *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*
**URL:** https://www.spaceappschallenge.org/2026/challenges/identify-earth-locations-that-analog-the-permanent-moon-base-locations-and-mars/
**Compiled:** 2026-10-08 (IST) from live pages. Legend: ✅ verified on a live page · ⚠️ prior-year (2025) rule, 2026 version not yet published · ❓ not verified / inferred.

---

## 0. Read this first: three facts that change the plan

1. **The full challenge statement and its Resources list are not published yet.** The live page's server data has `resourcesTabContent: ""` (empty). Only the summary is up (first published 2026-09-17 14:21 UTC). The Space Apps FAQ says: *"A summary of each challenge will be released on September 17, followed by challenge statements on **October 28**, which include the full details, resources, and requirements."* ✅ So **no resources or datasets are officially listed yet.** Section 2 below is a **candidate** list I verified myself. It is not the official list. Redo this brief on or after **2026-10-28**.
2. **There is a rule against starting early.** The Team Formation Guide says: *"participants should NOT begin working on their project until the hackathon begins on November 14, 2026 (9:00 a.m. local time) to ensure a fair and equitable process."* ✅ The FAQ adds: *"Teams are not allowed to begin working on the challenges prior to the hackathon."* ✅ At submission, teams must also tick *"Confirm All Work is Original"* ⚠️. **Building the app, repo, or deployment before Nov 14 could put Global Judging eligibility at risk. Only Sounak can make this call.**
3. **The 2026 hackathon runs Nov 14–15, 2026.** Submission closes **Sun Nov 15, 11:59 PM local time** of the team's Local Event. For the Universal Event, it closes at the Team Owner's local time. ✅

---

## 1. Objectives (exact text)

Full summary text. It is the only official challenge content published so far ✅:

> "Selecting future landing sites and lunar base locations depends on many factors, including topography, geology, environment, and available resources, to name a few. Places on Earth that have analogous characteristics to the Moon or Mars – the Atacama Desert, Haughton Crater, Death Valley – allow mission teams to test equipment and methods before they fly; however, such terrestrial analog sites are not entirely well characterized. Your challenge is to use open Earth, Moon, and Mars data from NASA and other space agencies to **identify and characterize new terrestrial analogs for future bases or landing sites**, drawing on deserts, polar regions, volcanic and arid terrains, caves, and other environments that share conditions with the lunar or Martian surface."

Page metadata ✅: difficulty tags **Advanced, Intermediate, Beginner/Youth**. Skills: **Earth Science, Planets & Moons, Software, Space Exploration**. The 2026 theme is "The Next Frontier".

What the summary asks for:
- **Identify *new* terrestrial analogs.** Known sites (Atacama, Haughton, Death Valley) are given only as examples.
- **Characterize** those analogs. The summary says existing ones are "not entirely well characterized".
- Use **open Earth + Moon + Mars data** from NASA and other space agencies. Data from more than one body is expected.
- Explicit factors: **topography, geology, environment, available resources**.
- Explicit environment types: **deserts, polar regions, volcanic and arid terrains, caves**.
- Targets are **"future bases or landing sites"** on the Moon and on Mars.
- **"Considerations" / "Potential approaches": none published yet.** These usually appear in the full statement, which is due Oct 28. ❓

### What "Permanent Moon Base Locations" refers to (context, not from the challenge page)
- NASA announced a **Moon Base in the lunar South Pole region** on 2026-03-24 ✅ (Moon Base Architecture User's Guide PDF, nasa.gov, April 2026). The guide stresses the South Pole's **low-sun lighting, long cold and dark periods, extreme topography (high mountains, deep craters), PSR volatiles, and regolith/dust**. It lists "Securing Sites" as a data gap: *"regolith properties, high-resolution imagery, mapping, and resource locations."* ✅
- **Moon Base I** (Blue Origin Blue Moon Mk1, NET fall 2026) will land on the **Shackleton Connecting Ridge** ✅ (NASA release, 2026-05-26).
- The **nine Artemis III candidate regions** (NASA release 24-136, 2024-10-28) ✅ are: Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2, Slater Plain. NASA's selection factors were *"science potential, launch window availability, terrain suitability, communication capabilities with Earth, and lighting conditions."*
- **Mars:** the summary names no target sites. ❓ The challenge statement may define them. Until then, candidates are past and present landing sites and the cave-candidate catalogue below.

---

## 2. Resources table

**Officially listed resources: none yet** (the Resources tab is empty as of 2026-10-08) ✅.
The table below is our **candidate** stack. Each row was checked against the live page linked. Fields I could not confirm on the page are marked ❓.

Roles in the similarity engine: **T**errain, **Th**ermal, **G**eology/regolith, **I**llumination, **R**adiation proxy, **L**ogistics, **Ref** = reference/ground-truth sites.

### 2a. Moon (target side)
| Dataset | Contents (verified) | Format | Resolution | Access | Licence | Size | Engine use |
|---|---|---|---|---|---|---|---|
| **LOLA South Pole DEMs** (PGDA product 90, Barker) https://pgda.gsfc.nasa.gov/products/90 | Polar DEM (LDEM), slope (LDSM), error, effective resolution, hillshade, PSR (LPSR) layers, 60°S–90°S | Cloud-optimised GeoTIFF (COG), polar stereographic | 10–240 m/px depending on extent (e.g. 20 m for 80–90°S) | Direct HTTP download (COGs allow range reads) | ❓ NASA/PDS, public in practice; not stated on page | Per file: ~93 MB (240 m hillshade) to ~4 GB (60 m) | **T** (slope, roughness, relief) for Moon Base / Artemis regions; PSR mask |
| **Lunar Polar Illumination** (PGDA product 69, Mazarico) https://pgda.gsfc.nasa.gov/products/69 | Long-term average illumination and PSR maps of both poles, computed from LOLA over ~18.6 yr | PDS IMG (int16), GeoJPEG2000; polar stereographic | 240 m and 60 m/px (85–90°) | Direct download via PDS | ❓ | ❓ | **I** (fraction of time sunlit, low-sun regime); the key Moon-Base factor |
| **SLDEM2015** (LOLA + SELENE TC, PGDA 54) https://pgda.gsfc.nasa.gov/products/54 | Global lunar DEM, 60°S–60°N | FLOAT IMG, JPEG2000; tiles available | 512/256/128 px per degree (~59 m at 512 ppd) | Direct HTTP http://imbrium.mit.edu/DATA/SLDEM2015/ | ❓ (cite Barker et al. 2016) | ❓ | **T** for non-polar lunar sites |
| **LRO Diviner** (PDS Geosciences) https://pds-geosciences.wustl.edu/missions/lro/diviner.htm | Radiometer EDR/RDR, GDR L2/L3, Polar Cumulative Products (to 2020), Polar Resource Products, Global High-Res Mosaics; Release 67 on 2026-09-15 | PDS3/PDS4 | ❓ varies by product | Direct download / PDS | NASA PDS (public) ❓ | Large ❓ | **Th** (surface temperature range, cold traps) |
| **LROC WAC Global Morphology Mosaic 100 m** https://astrogeology.usgs.gov/search/map/moon_lro_lroc_wac_global_morphology_mosaic_100m | Global 643 nm mosaic, v3 | GeoTIFF/ISIS ❓ | 100 m/px | Direct download (USGS Astropedia) | ❓ | 5.5 GB | Visual basemap; texture features |
| **Artemis III candidate regions** https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ | Names of the 9 regions plus a map image (no shapefile on page) | Web page/image | n/a | Web | NASA media | n/a | **Ref** target polygons (we must digitise them) |
| **NASA Moon Base guide and release** https://www.nasa.gov/moonbase/ · guide PDF (Apr 2026) | Phases, South Pole lighting and terrain constraints, data gaps; Moon Base I at Shackleton Connecting Ridge | PDF / web | n/a | Web | NASA | 11.2 MB PDF | **Ref** target site plus the criteria list that justifies our factor weights |
| **Moon Trek / Mars Trek** https://trek.nasa.gov/ (WMTS: https://trek.nasa.gov/tiles/apidoc/) | NASA Solar System Treks portals; layers served through OGC RESTful WMTS | WMTS tiles | Varies by layer | **WMTS API** | ❓ | Streaming | Live planetary basemaps for the side-by-side demo |
| **JAXA DARTS SELENE (Kaguya)** https://darts.isas.jaxa.jp/planet/pdap/selene/ | Partner-agency archive (page is JS; contents not verified) ❓ | ❓ | ❓ | Web archive | ❓ | ❓ | Shows use of partner-agency data (JAXA is a 2026 partner) |
| **ISRO PRADAN** https://pradan.issdc.gov.in/ | Hosts Chandrayaan-2, Chandrayaan-3, Aditya-L1, AstroSat and other datasets; single sign-on | ❓ | ❓ | Web portal, **login required** | ❓ | ❓ | Partner-agency data (ISRO is a 2026 partner) |

### 2b. Mars (target side)
| Dataset | Contents (verified) | Format | Resolution | Access | Licence | Size | Engine use |
|---|---|---|---|---|---|---|---|
| **MOLA–HRSC Blended DEM Global 200 m v2** https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m | NASA MOLA + ESA HRSC blended DEM (2018) | GeoTIFF ❓ | 200 m/px | Direct download (USGS Astropedia) | ❓ (USGS products are usually public domain) | **11 GB** | **T**; also uses ESA data |
| **MOLA MEGDRs** https://pds-geosciences.wustl.edu/missions/mgs/megdr.html | Gridded MOLA topography; final version 2003; now archived in PDS4 (Aug 2026) | PDS IMG/PDS4 | 4/16/32/64/128 ppd (polar up to 512 ppd) | Direct download (PDS) | NASA PDS | ❓ | **T** at coarse scale (128 ppd ≈ 463 m) |
| **THEMIS-derived Global Thermal Inertia Mosaic** https://astrogeology.usgs.gov/search/map/mars-themis-derived-global-thermal-inertia-mosaic | Thermal inertia I=(kρc)^½; ±60° lat, 24 tiles of 30°×60°, qualitative 8-bit and quantitative 32-bit, ~20 % absolute accuracy | ISIS3 .cub | 100 m/px | Direct download per tile | ❓ | ~2.36 GB per quantitative tile ❓ (from search snippet) | **Th + G**: a grain-size/rockiness proxy (dust < ~400 < rocky regolith < ~1800 bedrock). This is the strongest bridge to Earth thermal data |
| **THEMIS-IR Day Global Mosaic 100 m v12** https://astrogeology.usgs.gov/search/map/mars_odyssey_themis_ir_day_global_mosaic_100m_v12 | Day IR (stretched/visual only) | GeoTIFF | 100 m | Direct download | Public domain (per Astropedia metadata in search result) ❓ | 21 GB | Visual only; values are not physical |
| **Geologic Map of Mars, SIM 3292** https://pubs.usgs.gov/sim/3292/ | Global geologic units (Tanaka et al. 2014) | PDF + GIS ❓ | 1:20,000,000 | Direct download | USGS (public domain ❓) | ❓ | **G**: unit type (volcanic, sedimentary, impact) mapped to Earth lithology |
| **Mars Global Cave Candidate Catalog (MGC³)** https://astrogeology.usgs.gov/search/map/mars_global_cave_candidate_catalog_v1_cushing | Over 1,000 cave-entrance candidates (lava-tube skylights, atypical pit craters, fractures) with lat/lon, type and confidence | ZIP (PDS bundle) | Point data | Direct download | Public domain (data.nasa.gov listing) | ~1.77 MB ❓ | **Ref + G**: "caves" are named in the challenge; match against Earth lava tubes |
| **Mars Climate Database v6.2** https://www-mars.lmd.jussieu.fr/mcd_python/ | Modelled climate fields (temperature and more) for dust/solar scenarios and Martian Years 24+ | Web interface + download ❓ | ❓ (GCM grid) | Web form / download | ❓ (citation requested) | n/a | **Th + R** (surface temperature range, pressure, UV) Mars-side reference values |

### 2c. Earth (search side)
| Dataset | Contents (verified) | Format | Resolution | Access | Licence | Size | Engine use |
|---|---|---|---|---|---|---|---|
| **Copernicus DEM GLO-30/GLO-90** https://registry.opendata.aws/copernicus-dem/ | Global DSM; GLO-30 Public is missing a few countries; GLO-90 is worldwide | COG ❓ (see readme) | 30 m / 90 m | **AWS S3, no account** (`s3://copernicus-dem-30m`, eu-central-1) + **STAC v1.0.0** | Free Copernicus DEM licence | ❓ (global, TB-scale) | **T** (slope, roughness, relief) to match LOLA/MOLA statistics; ESA partner data |
| **NASADEM** https://lpdaac.usgs.gov/products/nasadem_hgtv001/ | Reprocessed SRTM DEM, 60°N–56°S, acquired Feb 2000 | HGT | 30 m | LP DAAC (Earthdata Login ❓) / CMR-STAC | NASA open data ❓ | 7.1 MB per tile; ~103.6 GB total | **T** (NASA-native alternative) |
| **MODIS LST/Emissivity 8-Day MOD11A2 v6.1** https://lpdaac.usgs.gov/products/mod11a2v061/ | Day/night land surface temperature, global, 2000-02-18 to present | HDF-EOS2 | 1 km, 8-day | LP DAAC / AppEEARS ❓ / CMR-STAC | NASA open data ❓ | 3.6 MB per granule | **Th**: diurnal range and cold extremes as a thermal-cycling analog |
| **ASTER GED AG100 v3** https://lpdaac.usgs.gov/products/ag100v003/ | Mean emissivity/LST, 2000–2008 | HDF5 | 100 m | LP DAAC | NASA open data ❓ | 42 MB per tile; ~1.04 TB total | **G**: emissivity as a silicate/mineralogy proxy; **Th** |
| **EMIT L2B Mineral (EMITL2BMIN)** https://lpdaac.usgs.gov/products/emitl2bminv001/ | ISS imaging spectrometer surface mineralogy over arid dust-source regions, 52°N–52°S, 2022-08-09 to 2026-08-31 | netCDF-4 | 60 m | LP DAAC / CMR-STAC | NASA open data ❓ | 92.4 MB per granule | **G**: mineral identification (e.g. clays, sulfates, iron oxides) to compare with Mars mineralogy; well-suited to deserts |
| **NASA POWER API** https://power.larc.nasa.gov/docs/services/api/ | Solar radiation, temperature, UV and more; hourly/daily/monthly/climatology. **I tested it live:** a point climatology request returned JSON, no key needed | JSON/CSV (+ others ❓) | 1.0° × 1.0° (radiation), ½° × ⅝° (meteorology) | **REST API, no key** | NASA open data ❓ | On-demand | **I + Th + R**: insolation seasonality, T2M min/max, `ALLSKY_SFC_UV_INDEX` (confirmed parameter) as a UV radiation proxy |
| **VIIRS Black Marble VNP46A4** https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VNP46A4/ | Yearly nighttime lights, from 2012 | HDF-EOS5 | 15 arc-second (~500 m) | LAADS DAAC | NASA open data ❓ | ~92 MB per tile | **L**: remoteness/isolation index (darkness means isolation) |
| **ESA WorldCover** https://esa-worldcover.org/en | Global land cover 2020 and 2021 (Sentinel-1/2) | GeoTIFF ❓ | 10 m | Download/AWS ❓ | **CC-BY 4.0** ✅ | ❓ | Masks: bare/sparse vegetation, snow/ice (filters for Moon/Mars-like surfaces); ESA data |
| **SoilGrids (ISRIC)** https://www.isric.org/explore/soilgrids | 14 soil properties (sand/silt/clay, coarse fragments, bulk density, SOC, …) at 6 depths, with uncertainty | GeoTIFF/WCS ❓ | 250 m | WebDAV/WCS ❓; **REST API currently paused** ✅ | **CC-BY 4.0** ✅ | ❓ | **G**: regolith analog (grain size, bulk density, low organic carbon) |
| **GLiM global lithology** https://doi.pangaea.de/10.1594/PANGAEA.788537 | Lithology classes (gridded version) | ❓ | 0.5° (this DOI) | Direct download | **CC-BY 3.0** ✅ | 37.8 kB | **G**: basalt/volcanic/evaporite classes to match Mars and Moon units |
| **NASA CMR-STAC** https://cmr.earthdata.nasa.gov/stac | STAC v1.0.0 catalog over NASA Earthdata collections (verified JSON) | STAC API | n/a | **STAC** | n/a | n/a | Single programmatic search entry point for LP DAAC/LAADS data |
| **NASA Analog Missions** https://www.nasa.gov/analog-missions/ | Lists of NASA analogs (HERA, CHAPEA, Antarctic stations, ARGOS, ISRU, NBL, NSRL, …) | Web | n/a | Web | NASA | n/a | **Ref**: known analogs used for validation and "what's new vs known" |

**Pick for the MVP stack (5–8 datasets):** LOLA South Pole DEM + PGDA Polar Illumination (Moon target); MOLA–HRSC 200 m DEM + THEMIS Thermal Inertia + MGC³ caves (Mars target); Copernicus DEM (Earth terrain, STAC/S3, no login); MODIS MOD11A2 or NASA POWER (Earth thermal, illumination and UV; POWER needs no key); EMIT L2B Mineral + SoilGrids/GLiM (Earth geology/regolith). Add Black Marble for logistics/isolation. Swap in any datasets the official Oct 28 list names.

---

## 3. Submission requirements and dates

### 2026 dates ✅ (Participant FAQ, updated 2026-09-23)
| Date | Event |
|---|---|
| Aug 26 | Registration opens (open until Nov 15) |
| Sep 17 | Challenge summaries; team formation opens; Team Formation Guide |
| **Oct 28** | **Challenge statements (full details, resources, requirements)** |
| Nov 2 / Nov 3 | Space Apps Connect opens (FAQ gives both dates) |
| **Nov 13** | Global Offers; **Project Submission Guide** and **Judging & Awards Guide** published |
| **Nov 14, 9:00 AM local** | Hackathon starts; Project tab opens; **work may begin** |
| **Nov 15, 11:59 PM local** | **Submission deadline** (Local Event time zone; Universal Event uses the Team Owner's local time). For an India-based Local Event this is **Sun 15 Nov 2026, 23:59 IST** |
| Dec 2026 | Global Nominees, Finalists and Honorable Mentions announced |
| Jan 2027 | Global Winners announced |

### Team and eligibility ✅
- Teams have 1–6 members, all registered for the **same Local Event** (or all in the Universal Event). One team per person; one challenge per team.
- Projects must respond to an official challenge to be eligible for Global Judging.
- The Universal Event is judged only against other Universal Event projects.
- Terms ✅: original content must be open-source under an OSI licence (**Apache-2.0 by default** if none is given). Every non-NASA material must be freely available or OSI-licensed and its licence must be documented. **Every source must be cited.** No export-controlled information. U.S. federal civil servants are not eligible. Terms also include a China bilateral-activity restriction.

### Project page fields ⚠️ (2025 Project Submission Guide; the 2026 guide is due Nov 13)
Project Name · High-Level Project Summary · **Link to Project Demo** · **Link to Final Project** · Detailed Project Description · **NASA Data** · Space Agency Partner & Other Data · **Use of Artificial Intelligence** · checkboxes for Terms and "Confirm All Work is Original".
- **Demo: a video of at most 30 seconds, OR a deck of at most 7 slides including the title slide.** Projects that exceed these limits are **not eligible for Global Judging**. Host the demo externally with a public link (no login). Video needs English subtitles; slides must be in English. The page accepts images up to 10 MB but not video or documents.
- The 2025 guide suggested this 30-second video structure: 0:00 intro, 0:02 challenge, 0:05 title/tagline, 0:10 how it works and the NASA/partner data, 0:20–0:30 future vision.
- **Global Awards require NASA data.** Data from partner agencies is encouraged.
- **AI use is allowed but must be disclosed.** AI images and video need a visible "AI-generated" watermark. AI-generated code and data must be acknowledged in text and metadata. Generated content must not use or modify NASA branding (logos, flags, mission identifiers).
- 2026 Space Agency Partners ✅: Angola (GGPEN), Argentina (CONAE), Bahrain, Brazil (AEB), Canada (CSA), ESA, India (ISRO), Italy (ASI), JAXA, South Korea (KASA), Nigeria (NASRDA), Paraguay, Senegal, Spain (AEE), Türkiye (TUA), UAE (MBRSC), UK Space Agency.

### Judging criteria ⚠️ (2025 Judging & Awards Guide)
Each criterion is scored 1–5: **Impact, Creativity, Validity, Relevance** (*"meaningfully integrates NASA data … as a core component"*), and **Presentation** (demo plus full project). There are 10 Global Awards, including Best Use of Science, Best Use of Data, Best Use of Technology, Galactic Impact, Best Mission Concept, Most Inspirational, Best Storytelling, Global Connection, Art & Technology, and Local Impact. Judging runs in three phases: Local/Universal judges, then Global (Finalists and Honorable Mentions), then the Executive committee (Winners).

---

## 4. Ambiguities and open items
1. **The resources list does not exist yet.** All of Section 2 is our own selection. Re-check on **Oct 28**. The full statement may add requirements such as specific sites, deliverables or "Considerations".
2. **The pre-hackathon work rule** (see §0.2) conflicts with "build a full project now". Possible options: (a) prepare only general skills, tooling and research that are not specific to this project before Nov 14; (b) ask the Local Lead or GO Team what pre-event preparation is allowed; (c) accept the eligibility risk. **This is Sounak's decision.**
3. **"Permanent Moon Base Locations"** is not defined on the challenge page. The best evidence points to NASA's South Pole Moon Base (Shackleton Connecting Ridge, Moon Base I) plus the nine Artemis III regions. No official polygons have been found yet ❓.
4. **The Mars targets are undefined** (bases or landing sites) ❓.
5. **The 2026 demo limits and project form are not published** (the 2026 guide is due Nov 13). 2025 rules are assumed: 30 s video or 7 slides. A long demo video would break eligibility. Keep a long version only on the project site, if the 2026 rules allow it.
6. **AI-built project.** The submission requires disclosing AI use, and judges *"will consider originality, intent, and execution in the context of AI-assisted work."* Our bot-driven workflow must be declared.
7. **Team composition.** Teams need 1–6 registered humans at the same Local Event. The Local Event choice (or Universal Event) is Sounak's, and it fixes the deadline time zone.
8. **Stale text on the site.** The Find-a-Team page "Tips" still says *"closes on Sunday, October 5"* (2025 text). The authoritative 2026 date is Nov 15 (FAQ and Team Formation Guide). The FAQ also gives both **Nov 2** and **Nov 3** for Space Apps Connect.
9. **Licences marked ❓:** LP DAAC, PDS and USGS products are generally public NASA/USGS data, but I did not see licence text on those specific pages. Confirm before the README goes final. LP DAAC downloads normally need a free Earthdata Login ❓. SoilGrids REST API is currently paused, so use WebDAV/WCS ❓.
10. **Unverified pages:** JAXA DARTS SELENE and LROC pits atlas pages are JS-rendered, so I could not read their contents. ISRO PRADAN requires login.

## Sources consulted (all fetched 2026-10-08)
Challenge page (RSC payload) · /resources/participant-faqs/ · /resources/team-formation-guide/ · /2026/ · /2026/find-a-team/ · /legal/ · /2026/space-agency-partners/ · web.archive.org copies of the 2025 Project Submission Guide and Judging & Awards Guide (both "Last Updated 3 October 2025") · NASA Moon Base page, release and User's Guide PDF · NASA release 24-136 · all dataset URLs in §2. spaceappsvalencia.es also states that full descriptions and data resources come later.
