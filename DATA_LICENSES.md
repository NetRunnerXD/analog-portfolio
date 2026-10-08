# Data licences and attribution

*Skeleton (Phase A). Every row must be verified against the provider's licence page before submission; "verify" = not yet read in full. Our code is Apache-2.0; data keeps its own terms.*

**Hard rules**
- **No WorldClim** anywhere (non-commercial, no redistribution). Use NASA POWER or CHELSA (CC BY 4.0).
- **OpenStreetMap (ODbL)** only in offline drill-down text, never baked into shipped grids; credit "© OpenStreetMap contributors" wherever used.
- No NASA logos or mission insignia in the app, video or slides.
- Ship only coarse derived fields from the Mars Climate Database unless redistribution is confirmed.

| Dataset | Provider | Licence / terms | Attribution string | Shipped? | Status |
|---|---|---|---|---|---|
| LRO LOLA (LDEM/LDSM/LDRM, GDRVIS), PGDA products 69/78/81/90 | NASA GSFC / PDS | NASA open data (US Gov) | "NASA LRO LOLA / PGDA" | derived | verify |
| LRO Diviner (GCP, RA, ST) | NASA / UCLA / PDS | NASA open data | "NASA LRO Diviner" | derived | verify |
| Lunar Prospector GRS | NASA / PDS | NASA open data | | derived | verify |
| Moon Ice Favorability Index | USGS | US Gov public domain | | derived | verify |
| MGS MOLA MEGDR | NASA / PDS | NASA open data | "NASA MGS MOLA" | derived | verify |
| MGS TES thermal inertia (Putzig & Mellon 2007) | PSI / NASA | verify | | derived | verify |
| Mars Odyssey GRS | NASA / PDS | NASA open data | | derived | verify |
| SWIM v4 | PSI (NASA-funded) | verify | | derived | verify |
| USGS SIM 3292 Geologic Map of Mars | USGS | US Gov public domain | | derived | verify |
| Mars Climate Database v6.2 | LMD / OU / IAA / ESA / CNES | verify redistribution | "(c) LMD/OU/IAA/ESA/CNES" | coarse derived only | verify |
| NASA POWER | NASA LaRC | NASA open data | "NASA POWER Project" | derived | verify |
| NASA GIBS imagery | NASA ESDIS | NASA open data | "Imagery: NASA GIBS" | tiles at runtime | verify |
| NASA Solar System Treks tiles | NASA JPL | verify | | tiles at runtime | verify |
| Copernicus DEM GLO-90 | ESA / Airbus | Copernicus DEM licence | exact wording to verify | derived | verify |
| ESA WorldCover 2021 | ESA | CC BY 4.0 | "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021)" | derived | verify |
| ESA CCI Permafrost | ESA | verify | | derived | verify |
| NOAA ETOPO 2022 | NOAA NCEI | US Gov public domain | | derived | verify |
| GLiM | Hartmann & Moosdorf 2012 | CC BY 3.0 | "GLiM, Hartmann & Moosdorf (2012)" | derived | verify |
| Global Aridity Index v3.1 | Zomer et al. 2022 | CC BY 4.0 | | derived | verify |
| SoilGrids | ISRIC | CC BY 4.0 | | drill-down only | verify |
| MAP travel time to cities 2015 | Malaria Atlas Project | CC BY (per layer) | | derived | verify |
| Natural Earth | Natural Earth | Public domain | | yes | verify |
| Macrostrat | Macrostrat | CC BY 4.0 | | drill-down only | verify |
| IGRF | IAGA | open | | derived | verify |
| Researcher-curated validation set and gaps lookup | this project | Apache-2.0 (our compilation); each row cites its source URL | | yes | ok |
