# Innovation angles: Earth analogs for Moon and Mars sites

Challenge: [Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars](https://www.spaceappschallenge.org/2026/challenges/identify-earth-locations-that-analog-the-permanent-moon-base-locations-and-mars/)

Baseline: a multi-factor similarity engine that scores every Earth grid cell against a chosen Moon or Mars site (terrain, thermal, regolith/geology, illumination, radiation proxies, logistics), with explainable per-factor scores and an interactive map.

The problem with the baseline is that most teams will build some version of it. The angles below are meant to change the *question the tool answers*, not just add layers. They are ordered by how strongly I'd recommend them.

---

## TL;DR recommendation

Build **Angle 1 (Analog Portfolio + Fidelity Gap)** as the headline, powered by **Angle 2 (physics-comparable features, led by thermal inertia)** under the hood, and prove it works with **Angle 3 (rediscovery validation)**. Mission-purpose weighting is the input that drives all of it. Angles 4 and 5 are stretch features if time allows.

One-line pitch: *"No place on Earth is the Moon. So we tell you the smallest set of places that together are, and exactly what Earth can't give you."*

---

## Angle 1: Analog Portfolio Optimizer + Fidelity Gap report (headline)

**Hook.** Instead of ranking "the best analog," the tool answers the question mission planners actually face: *which minimal combination of Earth sites covers every requirement of my mission, and what's left over that no Earth site can simulate?* For a Shackleton-rim habitat test it might return: "Haughton crater for impact-terrain traverse, Dry Valleys for thermal/permafrost ops, Mauna Kea for basaltic regolith handling — and here is what remains uncovered: 1/6 g, hard vacuum, permanently shadowed cryogenic temperatures → use a thermal-vacuum chamber, a regolith simulant lab, and parabolic flights."

**Why it's scientifically defensible.**
- The analog literature is explicit that analog fidelity is factor-specific: a site is a good analog *for some property*, never for everything. Ranking by one blended score hides that; a portfolio respects it.
- The "fidelity gap" is honest science. Judges with domain knowledge will distrust any tool claiming an Earth site is "92% Moon-like." Showing what's physically impossible on Earth (gravity, vacuum, unshielded radiation, PSR temperatures ~40 K) earns credibility instantly.
- The underlying math is a weighted set-cover / multi-objective selection problem, which is standard and easy to explain.

**How it works.**
1. Mission-purpose presets set which factors matter and minimum fidelity thresholds per factor (rover mobility testing, ISRU / resource prospecting, habitat construction, astronaut EVA training, instrument calibration, astrobiology). Base the presets on the documented focus of well-known campaigns (e.g., Haughton-Mars Project, NASA Desert RATS, ESA PANGAEA, MDRS in Utah, PISCES in Hawaii) and say so in the UI.
2. For each factor, the engine already produces a per-cell score. A cell "covers" a factor if it clears the threshold.
3. Greedy weighted set cover picks the fewest sites (optionally penalized by logistics cost) that cover all coverable factors. Show 2–3 alternative portfolios (cheapest, highest-fidelity, single-continent).
4. Any factor no Earth cell can clear goes into the Fidelity Gap panel, paired with a short static lookup of complementary facility types (thermal vacuum chamber, regolith simulant, neutral buoyancy, parabolic flight, radiation beam facility).

**Hackathon build (~48 h).** Low risk because it sits on top of the baseline scores you're already computing. Greedy set cover is ~50 lines of Python. The gap panel is a small hand-written JSON lookup. The UI is a portfolio card list plus the existing map with the chosen sites highlighted and color-coded by which factor each one covers.

---

## Angle 2: Physics-comparable features, not look-alike features

**Hook.** Most analog maps compare things that *look* similar (dry, rocky, cold). We compare quantities that behave the same way across planets, starting with **thermal inertia**, the one surface property that is directly measured on Earth, the Moon, and Mars in the same physical units.

**Why it's scientifically defensible.**
- Thermal inertia (how fast a surface heats and cools) is controlled by grain size, rock abundance, cementation, and ice content. It's the standard way planetary scientists characterize regolith from orbit, so "same thermal inertia" really does mean "similar material at the surface," independent of color or vegetation.
- Global maps exist for all three bodies: Mars nighttime thermal inertia from TES/THEMIS (e.g., Putzig & Mellon), lunar regolith thermophysical properties from LRO Diviner (e.g., Hayne et al. 2017), and Earth *apparent* thermal inertia derivable from MODIS day/night land surface temperature plus albedo.
- Gravity correction where it matters: for slope stability and trafficability, compare slopes and soil strength in gravity-scaled terms rather than raw values, and say clearly that this is a first-order correction. Even one gravity-aware factor makes the tool stand out.

**Hackathon build.** Moderate. Earth apparent thermal inertia from MODIS LST day/night difference and MODIS albedo is a known formula and runs fine in Google Earth Engine. Moon and Mars thermal inertia come as published global rasters (verify exact product names and resolution on PDS / USGS Astrogeology before committing). Normalize all three to the same units and use it as the regolith factor. If time is tight, ship thermal inertia only and leave the gravity scaling as a documented "next step."

---

## Angle 3: Prove it works with blind rediscovery of known analogs

**Hook.** "We hid the famous analog sites from our engine, and it found them on its own." Then: "here are the top-ranked sites nobody is using yet." This turns the "discover new analogs" idea from a claim into evidence.

**Why it's scientifically defensible.**
- It's a validation set. Well-established analog sites (Atacama, Haughton crater on Devon Island, Svalbard, Rio Tinto, McMurdo Dry Valleys, Mauna Kea / Hawaiian lava fields, Craters of the Moon in Idaho, Lanzarote, Iceland's highlands, Utah's San Rafael Swell near MDRS, Meteor Crater) were chosen by experts for specific reasons. If the engine ranks them highly for the matching Moon/Mars target and mission type, the weighting is credible.
- Report a simple metric: what fraction of known analogs land in the top 1% or top 5% of cells for the matching target and purpose. A number beats a pretty map in front of science judges.
- High-scoring cells that are far from any known analog become the "under-explored analogs" list, with the honest caveat that they're candidates needing field confirmation.

**Hackathon build.** Easy and high-impact. Hand-build a CSV of ~15–25 known sites with coordinates and what they're used for (sourced from campaign websites and papers). Compute the percentile rank of each, show a small results table and a "new candidates" layer on the map.

---

## Angle 4: Analog within reach (accessibility-weighted, global equity)

**Hook.** "What's the best Moon analog I can get to from Kolkata in under 12 hours, for under a student budget?" Analog research is concentrated in a few rich-country sites. This mode finds the best reachable analog for any university, space agency, or country, which is a strong story for a global challenge.

**Why it's scientifically defensible.** It doesn't change the fidelity science; it adds a transparent cost layer. Fidelity per unit of access cost is a real planning trade-off for field campaigns.

**Data (free).** Travel time to cities raster (Malaria Atlas Project accessibility maps), protected areas (WDPA via Protected Planet) for permit flags, OpenStreetMap for roads and airports, and seasonal access windows from climate data (e.g., months above freezing from WorldClim).

**Hackathon build.** Easy if the baseline already has a logistics factor. Add a "from location" picker and a travel-time slider that filters the portfolio.

---

## Angle 5: Analogs at risk (time-varying analogs under climate change)

**Hook.** Some of the best Mars and Moon analogs are cold, icy, permafrost places, and they're changing. Show which analog sites lose fidelity by 2050 under climate projections, and which new places become analogs.

**Why it's scientifically defensible.** Permafrost and ice-bearing analogs (Arctic, Antarctic margins, high mountains) are exactly where warming is fastest. Running the thermal and moisture factors on downscaled future climate makes the trend quantitative instead of anecdotal.

**Data (free).** WorldClim 2.1 historical and CMIP6 future bioclimatic layers; ESA Climate Change Initiative permafrost products for present-day ground state.

**Hackathon build.** Moderate. Re-run only the climate-driven factors on a future scenario raster and show a "now vs 2050" toggle plus a ranked list of the biggest losers. Good stretch goal; skip if the core isn't solid.

---

## Ideas I'd fold in rather than headline

- **Mission-purpose weighting.** Essential, but it's an input, not the hook. Make it the first thing the user picks; it drives Angles 1, 3, and 4.
- **Reverse search (Earth place → best Moon/Mars twin).** Nearly free once features are normalized across bodies: it's just nearest-neighbor in the other direction. Great for public engagement ("find your hometown's Mars twin"). Add it if there's an hour spare.
- **Side-by-side twin viewer.** A strong demo moment: split screen with the Moon/Mars site and the Earth site at the same scale, with per-factor bars between them. Use it to present the portfolio results rather than as a separate feature.
- **Spectral/mineral twins.** Compare mineral indicators (e.g., ASTER on Earth vs CRISM on Mars, M3 on the Moon). Scientifically lovely but too heavy for a hackathon; mention as future work.

---

## Free data checklist (verify exact products before building)

Moon: LRO LOLA DEMs and south-pole illumination maps (PDS), LRO Diviner temperature and thermophysical maps, Moon Mineralogy Mapper (M3), LRO LEND / Lunar Prospector hydrogen.

Mars: MOLA / HRSC blended DEM (USGS Astrogeology), TES/THEMIS thermal inertia, TES dust cover index, SWIM subsurface ice maps, USGS global geologic map of Mars, Mars Climate Database (free with registration).

Earth: Copernicus GLO-30 DEM, MODIS land surface temperature (day/night) and albedo, WorldClim 2.1 (historical + CMIP6), ERA5, SoilGrids, GLiM global lithological map, ESA CCI permafrost, Global Aridity Index, Malaria Atlas Project travel-time rasters, WDPA protected areas, OpenStreetMap. Google Earth Engine hosts many of these and avoids big downloads.

Radiation proxies: on Earth, elevation plus geomagnetic latitude (cutoff rigidity) and UV climatology; on Mars, elevation as a column-shielding proxy. Be upfront that no Earth surface approaches Moon or Mars radiation levels — that belongs in the Fidelity Gap panel, not hidden in a score.

---

## Suggested demo flow (3 minutes)

1. Pick target: Moon, Shackleton crater rim. Pick purpose: habitat construction.
2. Map lights up; open the portfolio: three Earth sites, each tagged with what it covers.
3. Fidelity Gap panel: "Earth can't give you 1/6 g, vacuum, or 40 K shadows. Here's where to test those."
4. Validation slide: "We hid 20 famous analog sites; our engine put X% of them in the top 5%." Then the "new candidates" layer.
5. Toggle "within 12 h of Kolkata" to show the equity angle; optional 2050 toggle.
