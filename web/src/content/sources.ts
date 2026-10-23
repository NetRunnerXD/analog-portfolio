// Web-owned credits for the About & data page.
// PLANNED: the source list in the repo's DATA_LICENSES.md (Phase A skeleton), shown only while provenance.json is mock.
// The real release lists the exact layers, versions and licences from provenance.json instead. "verify" rows stay marked.
export interface Credit { dataset: string; provider: string; licence: string; attribution?: string; group: 'nasa' | 'partner' | 'other'; verified: boolean; url?: string }

export const PLANNED: Credit[] = [
  { dataset: 'LRO LOLA (LDEM/LDSM/LDRM, GDRVIS), PGDA products', provider: 'NASA GSFC / PDS', licence: 'NASA open data (US Gov)', attribution: 'NASA LRO LOLA / PGDA', group: 'nasa', verified: false },
  { dataset: 'LRO Diviner (GCP, RA, ST)', provider: 'NASA / UCLA / PDS', licence: 'NASA open data', attribution: 'NASA LRO Diviner', group: 'nasa', verified: false },
  { dataset: 'Lunar Prospector GRS', provider: 'NASA / PDS', licence: 'NASA open data', group: 'nasa', verified: false },
  { dataset: 'MGS MOLA MEGDR', provider: 'NASA / PDS', licence: 'NASA open data', attribution: 'NASA MGS MOLA', group: 'nasa', verified: false },
  { dataset: 'MGS TES thermal inertia (Putzig & Mellon 2007)', provider: 'PSI / NASA', licence: 'to be confirmed', group: 'nasa', verified: false },
  { dataset: 'Mars Odyssey GRS', provider: 'NASA / PDS', licence: 'NASA open data', group: 'nasa', verified: false },
  { dataset: 'SWIM v4', provider: 'PSI (NASA-funded)', licence: 'to be confirmed', group: 'nasa', verified: false },
  { dataset: 'NASA POWER', provider: 'NASA LaRC', licence: 'NASA open data', attribution: 'NASA POWER Project', group: 'nasa', verified: false },
  { dataset: 'Moon Ice Favorability Index', provider: 'USGS', licence: 'US Gov public domain', group: 'other', verified: false },
  { dataset: 'Geologic Map of Mars (SIM 3292)', provider: 'USGS', licence: 'US Gov public domain', group: 'other', verified: false },
  { dataset: 'Copernicus DEM GLO-90', provider: 'ESA / Airbus', licence: 'Copernicus DEM licence', group: 'partner', verified: false },
  { dataset: 'ESA WorldCover 2021', provider: 'ESA', licence: 'CC BY 4.0', attribution: '© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021)', group: 'partner', verified: false },
  { dataset: 'ESA CCI Permafrost', provider: 'ESA', licence: 'to be confirmed', group: 'partner', verified: false },
  { dataset: 'Mars Climate Database v6.2 (coarse derived fields only)', provider: 'LMD / OU / IAA / ESA / CNES', licence: 'redistribution to be confirmed', attribution: '(c) LMD/OU/IAA/ESA/CNES', group: 'partner', verified: false },
  { dataset: 'NOAA ETOPO 2022', provider: 'NOAA NCEI', licence: 'US Gov public domain', group: 'other', verified: false },
  { dataset: 'GLiM global lithological map', provider: 'Hartmann & Moosdorf 2012', licence: 'CC BY 3.0', attribution: 'GLiM, Hartmann & Moosdorf (2012)', group: 'other', verified: false },
  { dataset: 'Global Aridity Index v3.1', provider: 'Zomer et al. 2022', licence: 'CC BY 4.0', group: 'other', verified: false },
  { dataset: 'Travel time to cities 2015', provider: 'Malaria Atlas Project', licence: 'CC BY (per layer)', group: 'other', verified: false },
  { dataset: 'IGRF', provider: 'IAGA', licence: 'open', group: 'other', verified: false },
]

/** Maps, imagery, place names and software the web app itself uses (all loaded or bundled by the front end). */
export const APP_CREDITS: Credit[] = [
  { dataset: 'NASA GIBS · Blue Marble true colour (Earth twin pane, story)', provider: 'NASA ESDIS', licence: 'NASA open data; acknowledgment requested', group: 'nasa', verified: true, url: 'https://nasa-gibs.github.io/gibs-api-docs/',
    attribution: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)." },
  { dataset: 'NASA Solar System Treks · Moon Trek (LRO LOLA hillshade, LROC NAC mosaic, south polar) and Mars Trek (MGS MOLA colour hillshade)', provider: 'NASA / JPL-Caltech (Treks); LRO and MGS science teams', licence: 'NASA imagery, no copyright; credit line requested', group: 'nasa', verified: false, url: 'https://trek.nasa.gov/tiles/apidoc/', attribution: 'Courtesy NASA/JPL-Caltech · NASA Solar System Treks' },
  { dataset: 'Natural Earth 50m land (coastlines) and 10m populated places (place search)', provider: 'Natural Earth', licence: 'Public domain', group: 'other', verified: true, url: 'https://www.naturalearthdata.com/about/terms-of-use/', attribution: 'Made with Natural Earth.' },
  { dataset: 'OpenLayers map library', provider: 'OpenLayers contributors', licence: 'BSD 2-Clause', group: 'other', verified: true, url: 'https://openlayers.org/' },
  { dataset: 'Inter, Space Grotesk and JetBrains Mono fonts (bundled)', provider: 'Fontsource / font authors', licence: 'SIL Open Font License 1.1', group: 'other', verified: true },
]

export const PHYSICAL_SOURCES: { text: string; url?: string }[] = [
  { text: 'Gravity, pressure, CO₂: NSSDC Moon fact sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html' },
  { text: 'NSSDC Mars fact sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
  { text: 'NSSDC Earth fact sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html' },
  { text: "Radiation: Chang'E-4 LND (Zhang et al. 2020, doi:10.1126/sciadv.aaz1334)", url: 'https://doi.org/10.1126/sciadv.aaz1334' },
  { text: 'MSL RAD (Hassler et al. 2014, doi:10.1126/science.1244797)', url: 'https://doi.org/10.1126/science.1244797' },
  { text: 'UNSCEAR 2008 (natural background, not "surface dose")', url: 'https://www.unscear.org/unscear/en/publications/2008_1.html' },
  { text: 'Shadows: Paige et al. 2010 (doi:10.1126/science.1187726)', url: 'https://doi.org/10.1126/science.1187726' },
  { text: "Earth's coldest surface: Scambos et al. 2018 (doi:10.1029/2018GL078133)", url: 'https://doi.org/10.1029/2018GL078133' },
  { text: 'UV: Cockell et al. 2000', url: 'https://ntrs.nasa.gov/citations/20040088828' },
  { text: 'Slopes: HLS requirement (≤ 8°, goal ≤ 5°)', url: 'https://ntrs.nasa.gov/api/citations/20200001606/downloads/20200001606.pdf' },
  { text: 'Cell size: USGS (a degree of longitude shrinks toward the poles)' },
]

export const CAMPAIGN_SOURCES: { text: string; url: string }[] = [
  { text: 'Desert RATS & Black Point Lava Flow (LPI)', url: 'https://www.lpi.usra.edu/lunar/analogs/blackpoint/' },
  { text: 'PISCES & RESOLVE on Mauna Kea, 2010 ILSO-ISRU field test (NTRS 20110008363)', url: 'https://ntrs.nasa.gov/citations/20110008363' },
  { text: 'HMP on Devon Island (Mars Institute)', url: 'https://www.marsinstitute.no/hmp' },
  { text: 'HI-SEAS on Mauna Loa', url: 'https://en.wikipedia.org/wiki/HI-SEAS' },
  { text: 'Apollo training at Ries (Apollo 14, 1970) and Sudbury (Apollos 16 and 17) (ALSJ)', url: 'https://apollojournals.org/alsj/ap-geotrips.pdf' },
  { text: 'Apollo 17 geologic training exercise, Sudbury (USGS)', url: 'https://www.usgs.gov/data/apollo-17-geologic-training-exercise-sudbury-ontario-basin-19720328' },
  { text: 'ASTEP in the Atacama (Life in the Atacama, doi:10.1029/2006JG000298)', url: 'https://doi.org/10.1029/2006JG000298' },
]

/** Spec §9 keyboard map, shown in the Shortcuts section. */
export const SHORTCUTS: [string, string][] = [
  ['Global', 'Esc closes the topmost popover, drawer, sheet or story. ? opens this list. / focuses Place search on Reverse search'],
  ['Map (focused)', 'Arrows pan, + / − zoom, Tab cycles pins (portfolio order, then known analogs), Enter opens the focused pin'],
  ['Lists, radio groups, tabs', 'Arrows move, Home / End, Enter / Space selects'],
  ['Coverage matrix', 'Standard table navigation for screen readers'],
  ['Sliders', 'Arrows ±5, Page Up / Page Down ±10, Home / End min / max'],
  ['Story', 'Space play / pause, ← / → previous / next step, C captions, Esc exit'],
]

export const REPO_URL = 'https://github.com/NetRunnerXD/analog-portfolio'
export const AI_LOG_URL = `${REPO_URL}/blob/main/docs/ai-log.md`
