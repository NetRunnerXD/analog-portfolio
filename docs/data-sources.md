# Data sources: Earth ↔ Moon/Mars analog similarity engine

*NASA Space Apps 2026 — "Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars".*
Compiled 2026-10-08 (IST) on the shared box. Every URL here was resolved from the box on that date unless marked otherwise. Test labels mean:
**Tested OK** = command run on the box and it returned real data · **Tested failed** = run and failed (reason given) · **Untested** = not run (reason given).
Scratch test scripts are in `/tmp/ds/` (not in this repo). Requirements: free sources only. Where a free login is needed, it's flagged 🔑.

## 0. What the challenge page lists

The challenge page (`/2026/challenges/identify-earth-locations-that-analog-the-permanent-moon-base-locations-and-mars/`) is a Next.js app. I decoded its embedded data. The **Resources tab is empty** (`"resourcesTabContent":""`, published 2026-09-17), so **the challenge currently lists no datasets**. Only the summary is published. It asks teams to *"use open Earth, Moon, and Mars data from NASA and other space agencies to identify and characterize new terrestrial analogs for future bases or landing sites, drawing on deserts, polar regions, volcanic and arid terrains, caves, and other environments"*. It names **Atacama Desert, Haughton Crater and Death Valley** as known analogs, which are useful as validation and calibration sites. The Space Apps participant FAQ (saved copy in `scratch/u_resources_participant-faqs_.html`) says **full challenge statements, including resources, come out on October 28**. Re-check the Resources tab on or after 2026-10-28 and merge anything new into this file.

## 1. Recommended top picks (one per factor × body)

Target: a common **0.5° lat/lon grid** (720×360) per body. "Grid-friendliness" says how hard it is to get each source onto that grid.

| Factor | Earth | Moon | Mars |
|---|---|---|---|
| **Terrain: elevation** | **ETOPO 2022 60″** (NOAA), 478 MB netCDF, *downsample* | **LOLA LDEM_16** (PDS), 33 MB, *already coarse* | **MOLA MEGDR meg016** (PDS), 33 MB, *already coarse* |
| **Terrain: slope/roughness** | **Copernicus GLO-90 COGs** (AWS/MPC STAC). Read the internal overviews per 1° tile and compute slope (~26k tiles, all reads are cheap range requests) | **LOLA LDSM_16 slope + LDRM_16 roughness** (PDS), 33 MB each, *already coarse* | Compute from **MOLA MEGDR meg064/128** (530 MB / 2 GB) or **MOLA 463 m GeoTIFF** strided reads (2.1 GB) |
| **Thermal: surface T range** | **NASA POWER** `TS_MAX`/`TS_MIN`/`T2M_MAX`/`T2M_MIN` (no login, ~0.5–1°). Upgrade: **MOD11C3** 0.05° 🔑 | **Diviner GCP** global cumulative Tbol, 0.5° × 0.25 h local time (18 × 156 MB ASCII), *native 0.5°* | **Mars Climate Database (MCD) web**: `tsurf` per Ls/local time, global GCM grid (~3.8° lat × 6° lon as returned), *already coarse* |
| **Thermal: thermal inertia** | No global TI product. Proxy: diurnal amplitude (POWER `TS_MAX−TS_MIN`, or MODIS day−night LST) | **Diviner rock abundance + regolith-temperature anomaly** (32 ppd, 88 MB each) | **TES TI, Putzig & Mellon 2007** (PDS, 20 ppd, 52 MB), *downsample* |
| **Regolith / geology / mineralogy** | **GLiM 0.5° gridded lithology** (39 KB!) + **SoilGrids 5 km aggregated** (≈9 MB/layer) | **Lunar Prospector GRS 2° elemental abundance** (10 MB) + **Kaguya MI 4 ppd mineral maps** (2 MB each) | **TES mineral/dust maps** (see §5.3: ASU numeric WMS failed from the box), **Odyssey GRS 5° elements incl. H₂O** (190 KB each), **TES albedo** (17 MB) |
| **Illumination** | **NASA POWER** `ALLSKY_SFC_SW_DWN`, `CLRSKY_SFC_SW_DWN` (no login) | **LOLA avg. solar visibility + PSR masks** (PGDA, 65°–90° N/S, 240 m: 60 MB / 0.6 MB). Non-polar: compute insolation analytically | **MCD** `fluxsurf_dn_sw` (incident surface solar flux, includes dust) |
| **Radiation proxies** | **Cutoff rigidity computed from IGRF** (`ppigrf`) + altitude (atmospheric depth from DEM) + **POWER UV index** | Effectively uniform GCR (no field or atmosphere). Use a literature constant + PSR/terrain shielding. CRaTER (PDS PPI) for reference | **MCD surface pressure `ps`** (column mass ∝ shielding) + MOLA elevation, calibrated to **MSL RAD** (PDS PPI) at Gale |
| **Logistics / accessibility** | **MAP travel time to cities 2015** (WCS, 30″) + **Natural Earth** airports/places/roads; Overpass for site drill-down only | No logistics layer. Use the safety/terrain layers. Candidate regions: PSR atlas, Ice Favorability Index | Human Exploration Zone list (USGS CTX EZ mosaics) for target-site context |

## 2. Planetary & Earth access hubs (verified)

| Hub | URL | What it gives you | Status |
|---|---|---|---|
| **PDS Geosciences Node** | https://pds-geosciences.wustl.edu/ | Raw directory listings for LOLA, Diviner, MOLA, TES, GRS, LP. PDS3 `.lbl` files open directly in GDAL via `/vsicurl/` | Tested OK |
| **ODE REST API** (Orbital Data Explorer) | https://oderest.rsl.wustl.edu/live2/ | Product search by instrument/bbox for Moon/Mars | Tested OK (see §8) |
| **USGS Astrogeology map mosaics** (S3, public) | `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/…` (same as `planetarymaps.usgs.gov/mosaic/…`) | Global GeoTIFF mosaics (LOLA, MOLA, HRSC-MOLA, THEMIS, TES albedo, Kaguya MI, Clementine, Ice Favorability). Listable with `?list-type=2&prefix=mosaic/` | Tested OK (18,844 keys listed) |
| **USGS Astropedia downloads** (S3) | `https://asc-astropedia.s3.us-west-2.amazonaws.com/…` | Geologic maps (Unified Geologic Map of the Moon), polar LOLA DEMs | Tested OK |
| **USGS Astrogeology STAC** | https://stac.astrogeology.usgs.gov/api/collections | 18 collections, mostly high-res DTMs and observations (HiRISE, CTX, Kaguya TC, THEMIS controlled mosaics), **not** global thematic maps | Tested OK |
| **NASA PGDA** (GSFC) | https://pgda.gsfc.nasa.gov/products/69 | Lunar polar illumination, PSR and sky-visibility maps (GeoTIFF/COG) | Tested OK |
| **NASA Solar System Treks** (Moon/Mars Trek) | `https://trek.nasa.gov/tiles/{Moon,Mars}/EQ/<layer>/1.0.0/WMTSCapabilities.xml` | WMTS image tiles (visual basemaps for the web demo, **not** quantitative) | Tested OK |
| **LROC QuickMap** / **LROC PSR atlas** | https://quickmap.lroc.asu.edu/ (→ quickmap.lroc.im-ldi.com), https://lroc.im-ldi.com/atlases/psr | Interactive maps; PSR atlas list/PDF | Pages resolve; no download tested |
| **Mars Climate Database web** | https://www-mars.lmd.jussieu.fr/mcd_python/ | Scriptable CGI returning ASCII (point series or global maps) | Tested OK |
| **ASU Mars global datasets** | https://www.mars.asu.edu/data/ | TES TI, albedo, mineral maps, dust, IRTM; "raw numeric" via `ms-mars.mars.asu.edu` WMS | Page OK; numeric WMS **failed** (host unreachable from box) |
| **PDS PPI node** | https://pds-ppi.igpp.ucla.edu/data/ | MSL RAD, LRO CRaTER | Tested OK (listing) |
| **Microsoft Planetary Computer STAC** (Earth) | https://planetarycomputer.microsoft.com/api/stac/v1 | 138 collections incl. `cop-dem-glo-30/90`, `nasadem`, `modis-11A1/11A2/21A2-061`, `terraclimate`, `esa-worldcover`. Free anonymous SAS token | Tested OK |
| **Element 84 Earth Search STAC** | https://earth-search.aws.element84.com/v1 | `cop-dem-glo-30/90` on AWS open data | Tested OK |
| **NASA CMR** (Earthdata search API) | https://cmr.earthdata.nasa.gov/search/ | Granule search without login. **Download** from DAACs needs free Earthdata login 🔑 | Tested OK (search) |

---

## 3. Terrain (elevation, slope, roughness)

### 3.1 Earth

| Dataset | Provider | Access | Native res | Format | Licence | Size (full → coarse) | Grid-friendliness |
|---|---|---|---|---|---|---|---|
| **ETOPO 2022 60 arc-sec surface** | NOAA NCEI | Direct download (THREDDS fileServer) | 1′ (~1.85 km) | netCDF | US Gov / NOAA (public domain, *verify*) | **478,290,125 B** → 0.5° ≈ 1 MB | Downsample in minutes (xarray `coarsen`) |
| **GMTED2010 mean 30″** (`mn30_grd.zip`) | USGS | Direct download | 30″ | ESRI grid (zip) | USGS public domain | 277 MB zip | Downsample; superseded by ETOPO/Copernicus for most uses |
| **Copernicus DEM GLO-90 / GLO-30** | ESA / AWS Open Data (`copernicus-dem-90m`, `-30m`), also MPC | STAC (Earth Search / MPC) + COG over HTTPS/S3 | 3″ / 1″ | COG, 1°×1° tiles, internal overviews [2,4] | Copernicus DEM licence (free with attribution, *verify wording*) | GLO-90 tile ≈ 4.5 MB (S25 W070); global ~26k tiles | Too big to download whole. Read overviews per tile, or windowed reads around candidate sites |
| **NASADEM** (reprocessed SRTM) | NASA / MPC | STAC (MPC `nasadem`) | 1″ | COG | NASA open | Large | Use instead of raw SRTM. *Collection confirmed; no item read tested* |
| SRTM GL1/GL3 via OpenTopography | OpenTopography | REST (free API key 🔑) | 1″/3″ | GeoTIFF | NASA open | — | Untested (needs free API key) |

**Tested OK**: ETOPO, size via range request.
```bash
curl -s -r 0-0 -D - -o /dev/null https://www.ngdc.noaa.gov/thredds/fileServer/global/ETOPO2022/60s/60s_surface_elev_netcdf/ETOPO_2022_v1_60s_N90W180_surface.nc | grep -i content-range
# -> content-range: bytes 0-0/478290125
```
**Tested OK**: GMTED HEAD.
```bash
curl -sIL https://edcintl.cr.usgs.gov/downloads/sciweb1/shared/topo/downloads/GMTED/Grid_ZipFiles/mn30_grd.zip   # 200, 277,229,566 B
```
**Tested OK**: Copernicus GLO-90 COG window + overview read + STAC (Atacama, ~24.5°S 69.5°W).
```python
import rasterio
from rasterio.windows import from_bounds
u='/vsicurl/https://copernicus-dem-90m.s3.amazonaws.com/Copernicus_DSM_COG_30_S25_00_W070_00_DEM/Copernicus_DSM_COG_30_S25_00_W070_00_DEM.tif'
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'), rasterio.open(u) as r:
    a = r.read(1, window=from_bounds(-69.6,-24.6,-69.4,-24.4, r.transform))   # (240,240) 1593–2413 m
    o = r.read(1, out_shape=(1,120,120))                                       # decimated via overviews
# Tile naming: Copernicus_DSM_COG_30_{N|S}{lat:02d}_00_{E|W}{lon:03d}_00_DEM (30 = 3", 10 = 1" in copernicus-dem-30m)
```
```python
from pystac_client import Client
Client.open('https://earth-search.aws.element84.com/v1').search(collections=['cop-dem-glo-30'], bbox=[-69.6,-24.6,-69.4,-24.4]).items()
# -> Copernicus_DSM_COG_10_S25_00_W070_00_DEM  (asset 'data' = s3://copernicus-dem-30m/...)
import planetary_computer  # or: requests.get('https://planetarycomputer.microsoft.com/api/sas/v1/token/cop-dem-glo-90').json()['token']
Client.open('https://planetarycomputer.microsoft.com/api/stac/v1').search(collections=['cop-dem-glo-90'], bbox=[...]).items()   # Tested OK
```
Notes: compute slope and roughness at native or overview resolution (e.g. 360 m from overview 4), **then** aggregate to 0.5° using mean slope, P90 slope and the standard deviation of elevation (roughness). Don't compute slope on the 0.5° grid.

### 3.2 Moon

| Dataset | Provider | Access | Native res | Format | Licence | Size | Grid-friendliness |
|---|---|---|---|---|---|---|---|
| **LOLA LDEM_4 / 16 / 64 / 128** (gridded topography) | NASA PDS Geosciences (LRO-L-LOLA-4-GDR-V1.0) | Direct download; `.lbl` opens in GDAL | 4/16/64/128 ppd (7.6 km → 237 m) | PDS3 IMG int16 (DN×0.5 = height m) | NASA PDS (open) | LDEM_4 2.07 MB · LDEM_16 33 MB · LDEM_64 531 MB · LDEM_128 2.1 GB | LDEM_16 is already coarse. Use LDEM_64 only for slope stats |
| **LOLA LDSM_16** slope · **LDRM_16** roughness (also LDRM_32 at 25/50/75 baselines, LDRC_32) | same | same | 16 ppd (32 ppd) | int16. Slope = DN×0.0015+45 (deg); roughness in m | open | 33 MB each (133 MB at 32 ppd) | **Already coarse, precomputed slope/roughness** |
| **LOLA South Pole DEMs (PGDA product 90, Barker et al.)**: LDEM/LDSM/LDRM/LDEC/hillshade, 60°S–90°S, e.g. `https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_240MPP_ADJ.TIF` … `LDRM_80S_50MPP_ADJ_ROUGH_200M.TIF` | NASA PGDA | Direct (GeoTIFF/COG) | 240 m … 20 m | GeoTIFF | NASA open | ~93 MB (240 m) to multi-GB | Best south-pole terrain (page + file links verified; no file read tested) |
| LOLA polar DEMs `ldem_75s_240m`, `ldem_85s_40m`… plus `ldsm`/`ldrm` polar | same, `…/lola_gdr/polar/img/` | Direct | 240 m … 10 m | IMG (polar stereographic) | open | 29 MB (240 m) … 1.8 GB | Needed for the south-pole base region |
| LOLA global 118 m GeoTIFF | USGS (`Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif`) | HTTPS range reads | 118 m | GeoTIFF int16, strip layout, no overviews | USGS/NASA public | 8.49 GB | Too big to download. Strided row reads work |
| SLDEM2015 (LOLA+Kaguya) 512 ppd, ±60° | PDS `…/lola_rdr…/data/sldem2015/`, USGS `LolaKaguya_Topo/…512ppd.tif` (22.6 GB) | Direct | ~59 m | IMG/GeoTIFF | open | 22.6 GB | Too big. Only for site drill-down |

**Tested OK**: download + read LDEM_4.
```bash
B=https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img
curl -sO $B/ldem_4.img && curl -sO $B/ldem_4.lbl
python -c "import rasterio;r=rasterio.open('ldem_4.lbl');a=r.read(1);print(r.width,r.height,a.min()*0.5,a.max()*0.5)"   # 1440 720, -8878.5 .. 10504 m
```
⚠️ GDAL reports `offset=1737400` (radius) for LDEM. Height above the 1737.4 km sphere is **DN×0.5**. Don't apply the offset if you want heights.

**Tested OK**: slope grid read remotely without downloading the whole file.
```python
rasterio.open('/vsicurl/'+B+'/ldsm_16.lbl')   # 5760x2880 int16, scale 0.0015, offset 45 -> median slope ≈ 6.5° on a mid row
```

### 3.3 Mars

| Dataset | Provider | Access | Native res | Format | Licence | Size | Grid-friendliness |
|---|---|---|---|---|---|---|---|
| **MOLA MEGDR** meg004/016/032/064/128 (topography `megt`, radius `megr`, areoid `mega`, counts `megc`) | NASA PDS Geosciences | Direct; `.lbl` → GDAL | 4–128 ppd (15 km → 463 m) | PDS3 IMG int16 (m) | open | meg004 2.07 MB · meg016 33 MB · meg032 133 MB · meg064 ≈530 MB · meg128 ≈2 GB | meg016 is already coarse; meg064/128 for slope |
| **MOLA DEM 463 m GeoTIFF** | USGS (`Mars_MGS_MOLA_DEM_mosaic_global_463m.tif`) | HTTPS range reads | 463 m | GeoTIFF int16, 1-row strips | public | 2.13 GB | Windowed and strided row reads are cheap (tested) |
| **MOLA–HRSC blended DEM v2** | USGS (`mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif`) | HTTPS range reads | 200 m | GeoTIFF int16 | public | 11.4 GB | Too big. Use for site drill-down |
| **CTX global mosaic (Murray Lab V01)** | Caltech Murray Lab | Per-tile zip download (4°×4°), streaming via JMARS/Esri | 5 m | GeoTIFF (uncompressed) + seam shapefiles | "free use for all purposes", credit NASA/JPL/MSSS/The Murray Lab | 5.6 TB compressed | Imagery only. Too big. Use for visual site context. *Page verified via WebFetch; `curl` from the box timed out* |
| CTX equirect mosaics (Robbins) 100/232 m per MC quad | USGS S3 `mosaic/Mars/Mars_MRO_CTX_Equi_Mosaics_Robbins/232mpp/MC08_232mpp.16bit.tif` … | HTTPS | 232 m | GeoTIFF 16-bit | public | ~170 MB/quad | Visual only |

**Tested OK**: MEGDR 4 ppd download + read (the label refers to an uppercase filename, so rename the `.img` to match).
```bash
B=https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg004
curl -s $B/megt90n000cb.img -o MEGT90N000CB.IMG && curl -s $B/megt90n000cb.lbl -o megt.lbl
python -c "import rasterio;a=rasterio.open('megt.lbl').read(1);print(a.shape,a.min(),a.max())"   # (720,1440) -8068 21134 m
```
**Tested OK**: MOLA 463 m windowed read (Gale) and strided rows.
```python
import numpy as np, rasterio
from rasterio.windows import from_bounds, Window
u='/vsicurl/https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif'
k=np.pi/180*3396190.0            # metres per degree (equirectangular, Mars sphere)
with rasterio.open(u) as r:
    a=r.read(1,window=from_bounds(137.0*k,-5.8*k,137.8*k,-5.0*k,r.transform))   # (102,102) -4534..424 m
    row=r.read(1,window=Window(0,0,r.width,1))                                  # one 92 KB row → strided global sampling
```

---

## 4. Thermal (surface temperature range, thermal inertia)

### 4.1 Earth

| Dataset | Provider | Access | Native res | Format | Licence | Size | Grid-friendliness |
|---|---|---|---|---|---|---|---|
| **NASA POWER climatology**: `TS` (skin T), `TS_MAX`, `TS_MIN`, `T2M_MAX`, `T2M_MIN` | NASA LaRC | REST API (point; regional ≤ ~10° boxes) — no key | ~0.5°×0.625° (met.) / 1° (solar) | JSON/CSV/netCDF | NASA open | tiny per call; global ≈ 650 regional calls | Already coarse (script the regional endpoint) |
| **MODIS MOD11C3 v061** monthly LST day/night, 0.05° CMG | NASA LP DAAC | CMR search (open) + download 🔑 **Earthdata login** | 0.05° | HDF4 | NASA open | ~70 MB/month granule; 12-month climatology ≈ 0.85 GB/yr | Downsample (mean of day/night, diurnal range) |
| MODIS MOD11A2/MYD11A2 (8-day, 1 km) | MPC (`modis-11A2-061`) | STAC + anonymous SAS | 1 km | HDF/COG assets (`LST_Day_1km`, `LST_Night_1km`) | NASA open | very large | Point/region queries only (tested search) |

**Tested OK**: POWER point (Atacama; annual values).
```bash
curl -s "https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,T2M_MAX,T2M_MIN,ALLSKY_SFC_UV_INDEX,PRECTOTCORR&community=RE&longitude=-69.25&latitude=-24.5&format=JSON"
# ANN: SW_DWN 7.21 kWh/m²/d, T2M_MAX 32.75, T2M_MIN -4.33 °C, UV index 2.64, precip 0.03 mm/d
curl -s "https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=TS,TS_MAX,TS_MIN,CLRSKY_SFC_SW_DWN,ALLSKY_SFC_UVA,ALLSKY_SFC_UVB&community=RE&longitude=-116.87&latitude=36.46&format=JSON"
# Death Valley ANN: TS 19.6, TS_MAX 59.2, TS_MIN -8.4 °C   (check POWER docs for exactly how MAX/MIN climatologies are aggregated)
```
**Tested OK**: POWER regional (returns a GeoJSON FeatureCollection of grid points).
```bash
curl -s "https://power.larc.nasa.gov/api/temporal/climatology/regional?parameters=ALLSKY_SFC_SW_DWN&community=RE&latitude-min=-26&latitude-max=-22&longitude-min=-71&longitude-max=-67&format=JSON"   # 16 features at 1° spacing
```
**Tested OK** (search) / **Tested failed** (download without login, expected): MOD11C3.
```bash
curl -s "https://cmr.earthdata.nasa.gov/search/granules.json?short_name=MOD11C3&version=061&sort_key=-start_date&page_size=1"
# -> MOD11C3.A2026244.061...hdf (70.5 MB) at https://data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/MOD11C3.061/...
curl -L -r 0-15 <that url>   # -> 401 redirect to urs.earthdata.nasa.gov (needs free Earthdata login: ~/.netrc or `earthaccess.login()`)
```
Note: the old `e4ftl01.cr.usgs.gov/MOLT/MOD11C3.061/` path now returns **404**. Use the cloud URLs from CMR.

**Earth thermal inertia**: there is no free global TI map. Practical proxies are (a) diurnal skin-temperature amplitude (`TS_MAX−TS_MIN` from POWER, or MODIS day−night LST) and (b) apparent TI ≈ (1−albedo)/ΔT using MODIS albedo (MCD43, 🔑). Flag this as a known gap.

### 4.2 Moon

| Dataset | Provider | Access | Native res | Format | Licence | Size | Grid-friendliness |
|---|---|---|---|---|---|---|---|
| **Diviner GCP global cumulative temperatures** (Williams et al. 2017), `global_cumul_avg_cyl_<band>_002.tab` | PDS Geosciences `urn-nasa-pds-lro_diviner_derived1/data_derived_gcp/` | Direct | **0.5° lat/lon × 0.25 h local time**, channels t3–t9 + `tbol` | ASCII CSV-like (`clon, clat, ltim, t3…t9, tbol`; −9999 = no data) | open | 18 × 156 MB = **2.8 GB** | **Native 0.5°**: Tmax/Tmin/mean per cell = max/min over `ltim`. Stream-parse, no resampling needed |
| **Diviner rock abundance** `dgdr_ra_avg_cyl_032_img` (Bandfield 2011) | same, `data_derived_gdr_l3/cylindrical/img/` | Direct | 32 ppd, ±60° | IMG int16 (RA = DN×0.001) | open | 88 MB (128 ppd version 1.9 GB) | Downsample |
| **Diviner regolith temperature anomaly** `dgdr_st_avg_cyl_032_img` / `dgdr_stn_…` (rock-free regolith T deviation, K; a TI/thermophysical proxy) | same | Direct | 32 ppd | IMG int16 (DN×0.02 K) | open | 88 MB | Downsample |
| Diviner polar resource products `dlre_prp_north/south.tab` | same, `data_derived_prp/` | Direct | polar | ASCII | open | 605 MB each | Polar base sites only |
| Diviner GHRM (global high-res mosaics, e.g. `dghrm_ra_sam_70s70n_tif.tif`, `dghrm_tbol_m_…`) | same, `data_derived_ghrm/geotiff/` | HTTPS range reads | 128 ppd, ±70° | GeoTIFF float32, strips | open | 3.3 GB each | Too big. Use the 32 ppd GDR instead |
| Lunar H-parameter / TI (Hayne et al. 2017) | — | — | — | — | — | — | **Not located** in the PDS directories I checked. Unverified |

**Tested OK**: GCP header via range request (no full download).
```bash
curl -s -r 0-1500 https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gcp/global_cumul_avg_cyl_00n10n_002.tab | head -3
#   clon,   clat,   ltim,        t3, ... ,      tbol
# -179.75,   0.25,   0.38, -134.4756, ... , 101.2984
```
Files: `global_cumul_avg_cyl_{90s80s,80s70s,…,80n90n}_002.tab` (18 latitude bands of 10°).

**Tested OK**: rock abundance window via label.
```python
u='/vsicurl/https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gdr_l3/cylindrical/img/dgdr_ra_avg_cyl_032_img.lbl'
rasterio.open(u)   # 11520x3840, scale 0.001, nodata -32768
```

### 4.3 Mars

| Dataset | Provider | Access | Native res | Format | Licence | Size | Grid-friendliness |
|---|---|---|---|---|---|---|---|
| **TES thermal inertia maps 2007** (Putzig & Mellon), `global_ti_night_2007.img`, `global_ti_day_2007.img` + masks | PDS Geosciences `mgs-m-tes-5-timap-v1/mgst_9001/data/` | Direct (or one 69.6 MB zip) | 20 ppd (~3 km), −180..180 | IMG MSB int16, TI in J m⁻² K⁻¹ s⁻½ | open | 52 MB each | Downsample |
| **Mars Climate Database v6.2 web** — `tsurf`, `rmstsurf`, `thermal_inertia` (GCM map), `ps`, `fluxsurf_dn_sw`, `co2ice`, `dod`/`tauref` (dust), `col_h2ovapor`… | LMD/OU/IAA/ESA/CNES | CGI GET → ASCII (point time series or global lat/lon map) | GCM grid (~3.8° lat × 6° lon in the output tested) | ASCII | Web use free; output header "(c) LMD/OU/IAA/ESA/CNES" — cite. The full offline database is distributed on request | Tiny | Already coarse. Bilinear-interpolate to 0.5°. Loop over Ls and local times for range/extremes |
| THEMIS Day/Night IR 100 m mosaics | USGS (`Mars_MO_THEMIS-IR-Night_mosaic_60N60S_100m_v14.tif`, 15 GB) | HTTPS | 100 m | GeoTIFF uint8 (qualitative brightness) | public | 15–23 GB | Too big, and not calibrated TI. Visual only |
| **THEMIS-derived Global Thermal Inertia Mosaic** (quantitative 32-bit; also qualitative 8-bit), 24 tiles of 30°×60°, ±60° | USGS Astropedia (`asc-astropedia…/Mars/Odyssey/THEMIS-Global-Thermal-Inertia-Mosaic/Quantitative-32-Bit/THEMIS_TI_Mosaic_Quant_<LAT><LON>_100mpp.cub`) | HTTPS range reads (ISIS3 cube, 128×128 tiles) | 100 m | ISIS3 .cub float32 (TI units) | public (USGS) | **2.53 GB per quantitative tile** (~61 GB total) | Too big for a full download. **Windowed reads are cheap** (tested). Use for site drill-down. Use TES TI for the global grid |
| TES TI (Christensen) 8 ppd; Putzig numeric via ASU WMS | ASU (`ms-mars.mars.asu.edu`) | WMS GetMap `FORMAT=image/vicar` | 8/20 ppd | VICAR | ASU (terms unverified) | small | **Tested failed**: host timed out on 80/443 from the box. Use the PDS TES TI above instead |

**Tested OK**: THEMIS TI quantitative tile, remote window.
```python
u='/vsicurl/https://asc-astropedia.s3.us-west-2.amazonaws.com/Mars/Odyssey/THEMIS-Global-Thermal-Inertia-Mosaic/Quantitative-32-Bit/THEMIS_TI_Mosaic_Quant_00N060E_100mpp.cub'
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'): rasterio.open(u)   # ISIS3 35566x17783 float32, 128x128 blocks; centre window median TI ≈ 289
```
(Tile names in the S3 listing: 48 `.cub` objects under `Quantitative-32-Bit/`, including labels/aux files. The Astropedia landing page is https://astrogeology.usgs.gov/search/map/mars-themis-derived-global-thermal-inertia-mosaic.)

**Tested OK**: TES TI 2007 window via label.
```python
u='/vsicurl/https://pds-geosciences.wustl.edu/mgs/mgs-m-tes-5-timap-v1/mgst_9001/data/global_ti_night_2007.lbl'
rasterio.open(u)   # 7200x3600 int16, nodata -32768; sample window median ≈ 231 tiu
```
**Tested OK**: MCD point time series and global map (exact parameter set that worked).
```bash
Q='datekeyhtml=1&ls=90&localtime=12&year=&month=&day=&hours=&minutes=&seconds=&julian=&martianyear=&sol=&latitude=all&longitude=all&altitude=10&zkey=3&isfixedlt=off&dust=1&hrkey=1&zonmean=off&diumean=off&averaging=off&dpi=80&islog=off&colorm=jet&minval=&maxval=&proj=cyl&palt=&plon=&plat=&trans=&iswind=off&latpoint=&lonpoint=&var1=tsurf&var2=none&var3=none&var4=none'
curl -s "https://www-mars.lmd.jussieu.fr/mcd_python/cgi-bin/mcdcgi.py?$Q" | grep -oE "txt/[0-9a-f]+\.txt"   # HTML links to the ASCII result
curl -s https://www-mars.lmd.jussieu.fr/mcd_python/txt/<hash>.txt                                       # rows = lon (-180..180 step 6), cols = lat
# Point series: latitude=-4.6&longitude=137.4&localtime=all  -> tsurf by hour (Gale, Ls 90: 183.1–260.3 K)
# dust=1 = "climatology ave solar". Other scenarios: 2 min solar, 3 max solar, 4–6 dust storm, 7 warm, 8 cold.
```
Variable names come from https://www-mars.lmd.jussieu.fr/mcd_python/listvar.js (verified list includes `tsurf`, `ps`, `fluxsurf_dn_sw`, `thermal_inertia`, `ground_albedo`, `co2ice`, `surf_h2o_ice`, `tauref`, `dod`). Be polite: cache results. A full year (12 Ls × 6 local times × a few variables) is a few hundred calls.

---

## 5. Regolith / geology / mineralogy

### 5.1 Earth

| Dataset | Provider | Access | Native res | Format | Licence | Size | Grid-friendliness |
|---|---|---|---|---|---|---|---|
| **GLiM gridded to 0.5°** (Hartmann & Moosdorf 2012) | PANGAEA (doi:10.1594/PANGAEA.788537) | Direct download | **0.5°** | ESRI ASCII grid + class names | **CC BY 3.0** | **38.7 KB zip** | **Already on the target grid.** Classes incl. basic volcanics (basalt → lunar mare / Mars analog), unconsolidated sediments, evaporites |
| **SoilGrids 2.0 aggregated 5 km** (sand, clay, silt, cfvo coarse fragments, bdod bulk density, soc…) | ISRIC | Direct WebDAV/HTTPS | 5 km (also 1 km, 250 m) | COG, Interrupted Goode Homolosine (ESRI:54052), overviews [2,4,8,16] | CC BY 4.0 | ≈9.4 MB per layer/depth | Reproject to EPSG:4326 then average |
| SoilGrids REST point query | ISRIC | REST | 250 m | JSON | CC BY 4.0 | — | Point queries for site drill-down (tested) |
| SoilGrids WCS | ISRIC (`maps.isric.org/mapserv?map=/map/<prop>.map`) | WCS 2.0.1 | 250 m | GeoTIFF | CC BY 4.0 | — | **Tested partial**: HTTP 200 GeoTIFF but all zeros/no CRS for my Homolosine bbox. Needs correct CRS subsetting. Prefer the 5 km files |
| **Macrostrat geologic units** | Macrostrat (UW–Madison) | REST `api/v2/geologic_units/map?lat=&lng=` | multi-scale maps | JSON | **CC-BY 4.0** (in response) | — | Point queries only (good for describing candidate sites) |
| ASTER GED (emissivity / silica proxy), EMIT minerals | NASA LP DAAC 🔑 | Earthdata | 100 m / 60 m | HDF/netCDF | NASA open | large | Untested (login; heavy) |

**Tested OK**:
```bash
curl -sL -o glim05.zip https://epic.awi.de/31092/1/hartmann-moosdorf_2012.zip   # (= https://hdl.handle.net/10013/epic.39939.d001) 38,670 B
unzip -l glim05.zip   # Classnames.txt, glim_wgs84_0point5deg.txt.asc
curl -s "https://rest.isric.org/soilgrids/v2.0/properties/query?lon=-69.25&lat=-24.5&property=sand&property=clay&property=soc&depth=0-5cm&value=mean"
# sand 661, clay 102 (g/kg ×10 → 66.1 % / 10.2 %), soc 136
curl -s "https://macrostrat.org/api/v2/geologic_units/map?lat=36.46&lng=-116.87"   # Death Valley: 4 units (Holocene alluvium, Quaternary sedimentary…)
```
```python
rasterio.open('/vsicurl/https://files.isric.org/soilgrids/latest/data_aggregated/5000m/sand/sand_0-5cm_mean_5000.tif')  # 7962x2902, ESRI:54052 — Tested OK
```

### 5.2 Moon

| Dataset | Provider | Access | Native res | Format | Licence | Size | Grid-friendliness |
|---|---|---|---|---|---|---|---|
| **Lunar Prospector GRS elemental abundances** (`lpgrs_high1_elem_abundance_{2deg,5deg,20deg}.tab`): MgO, Al₂O₃, SiO₂, CaO, TiO₂, FeO, K, Th, U (+ neutron density, atomic mass) | PDS Geosciences `lunar/lp-l-grs-5-elem-abundance-v1/lp_9001/data/` | Direct | 2° equal-area pixels (also 5°, 20°) | ASCII table (fmt: `lpgrs_elem_abundance.fmt`) | open | 2deg: 9.9 MB · 5deg: 1.6 MB | Already coarse. Rasterize pixel boxes (MIN/MAX_LAT/LON) to 0.5° |
| **Kaguya MI mineral maps, 4 ppd** (FeO wt%, olivine, cpx, opx, plagioclase %, optical maturity, SMFe) | USGS S3 `mosaic/Lunar_MI_mineral_maps/4ppd/…_50N50S.tif` | HTTPS | 0.25°, ±50° | GeoTIFF float32 | USGS/JAXA-derived (public, *verify JAXA terms*) | ~2 MB each | **Already coarse.** Mask fill/outliers (FeO max read was 106.8, which is not physical) |
| Clementine UVVIS FeO colour-binned 1 km | USGS `Lunar_Clementine_UVVIS_FeO_ClrBinned_70S70N_1km.tif` | HTTPS | 1 km | **RGB uint8 (colourized, not numeric)** | public | 139 MB | Not suitable as a quantitative layer. Use MI/LP FeO |
| Clementine UVVIS 750 nm / 5-band mosaics | USGS | HTTPS | 118–200 m | GeoTIFF | public | 4.2–14.9 GB | Too big. Optional albedo |
| LOLA 1064 nm normal albedo 10 ppd | USGS `Lunar_LRO_LOLA_Albedo_Global_10ppd.tif` | HTTPS | 10 ppd | GeoTIFF int16 | public | 12 MB | Already coarse |
| M3 (Chandrayaan-1 Moon Mineralogy Mapper) | PDS Imaging (`planetarydata.jpl.nasa.gov/img/data/m3/`); ODE product types `CALIMG`, `REFIMG`… | Direct / ODE | 140–280 m strips | PDS3 IMG cubes | open | many TB | Too big for a global grid. Site drill-down only (directory resolves; no product tested) |
| **Unified Geologic Map of the Moon 1:5M (2020)** | USGS Astropedia | Direct | vector | Esri GDB/shapefile zip | public | 224 MB zip (raster version 37 MB) | Rasterize unit classes to 0.5° |
| LRO LROC WAC global mosaic 100 m / 303 ppd | USGS `Lunar_LRO_LROC-WAC_Mosaic_global_100m_June2013.tif` | HTTPS | 100 m | GeoTIFF uint8 | public | 5.96 GB | Visual basemap only. Use Trek WMTS for the demo |

**Tested OK**:
```bash
curl -s -r 0-2000 https://pds-geosciences.wustl.edu/lunar/lp-l-grs-5-elem-abundance-v1/lp_9001/data/lpgrs_high1_elem_abundance_2deg.tab | head -2
# 0  -90.0 -89.0 -180.0 180.0  2.1594e+01 ... (PIXEL_INDEX, MIN_LAT, MAX_LAT, MIN_LON, MAX_LON, AM, NEUTRON_DEN, W_MGO, W_AL2O3, W_SIO2, W_CAO, TIO2, W_FEO, W_K, W_TH, W_U, …)
```
```python
rasterio.open('/vsicurl/https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Lunar_MI_mineral_maps/4ppd/Lunar_Kaguya_MIMap_MineralDeconv_FeOWeightPercent_50N50S.tif').read(1)  # (400,1440) — Tested OK
```
```bash
curl -sI https://asc-astropedia.s3.us-west-2.amazonaws.com/Moon/Geology/Unified_Geologic_Map_of_the_Moon_GIS_v2.zip   # 200, 224,413,040 B — Tested OK (HEAD)
```

### 5.3 Mars

| Dataset | Provider | Access | Native res | Format | Licence | Size | Grid-friendliness |
|---|---|---|---|---|---|---|---|
| **Odyssey GRS element maps, 5°×5° smoothed** (`h2o_sr_5x5`, `fe_`, `si_`, `cl_`, `k_`, `th_`, `kvsth_`) | PDS Geosciences `ody/ody-m-grs-5-elements-v1/odgm_xxxx/data/smoothed/` | Direct | 5° | ASCII (lat, lon, conc wt%, sigma…; 9999.999 = no data) | open | 171–187 KB each | Already coarse. H₂O = water-equivalent hydrogen proxy |
| **TES albedo** (bolometric) | USGS `Mars_MGS_TES_Albedo_mosaic_global_7410m.tif` | HTTPS | 7.4 km (8 ppd) | GeoTIFF float32 | public | 16.6 MB | Already coarse |
| TES mineral maps (Bandfield 2002): hematite, plagioclase, pyroxenes, olivine, sheet silicates/glass, quartz, amphibole, **surface dust**; TES Dust Cover Index | ASU `www.mars.asu.edu/data/tes_*` | WMS numeric VICAR (`ms-mars…`) / colourized PNG | 4 ppd (DCI 16 ppd) | VICAR / PNG | ASU (terms unverified) | small | **Tested failed** (numeric WMS host unreachable from the box). PNG download pages resolve. Alternatives: JMARS desktop (free account), or the original TES PDS products (not checked) |
| CRISM (MTRDR, MRDR4, TRDR…) | PDS / ODE | ODE REST + direct | 18–200 m | PDS3 cubes | open | huge | Too big for a global grid. Site drill-down (ODE counts tested) |
| OMEGA (MEx) `DDRGM`/`EDR` | ESA PSA / ODE | ODE | ~km | cubes | ESA open | large | Untested |
| **Geologic Map of Mars (SIM 3292, Tanaka et al. 2014)** | USGS Pubs | Direct | vector 1:20M | GIS database zip | public | 809 MB | Rasterize units to 0.5° |
| Viking IRTM rock abundance 1 ppd | ASU | PNG (colourized) only | 1° | PNG | — | small | Not numeric. Skip |
| **Mars Global Cave Candidate Catalog (MGC³) v1** (Cushing) | USGS Astropedia | Direct (`https://astrogeology.usgs.gov/ckan/dataset/c2960f77-ee20-4cc6-ac85-abbecc0fc7f6/resource/ccd54fb2-9a50-46bf-8971-80c241bb2f40/download/mars_cave_catalog.zip`) | points | zip | public | **1.77 MB** (HEAD Tested OK) | Point layer. The challenge explicitly names caves: match to Earth lava-tube/karst sites |

**Tested OK**:
```bash
curl -sO https://pds-geosciences.wustl.edu/ody/ody-m-grs-5-elements-v1/odgm_xxxx/data/smoothed/h2o_sr_5x5.tab   # 186,624 B; 2592 rows
curl -sI https://pubs.usgs.gov/sim/3292/downloads/sim3292_database.zip    # 200, 808,910,442 B
```
**Tested failed** (host unreachable from the box, `curl` exit = timeout):
```bash
curl "http://ms-mars.mars.asu.edu/TES_Olivine_numeric?SERVICE=WMS&REQUEST=GetMap&FORMAT=image/vicar&WIDTH=720&HEIGHT=360&SRS=JMARS:4&BBOX=0,-90,360,90&STYLES=&VERSION=1.1.1&LAYERS=TES_Olivine_numeric"
```
(These URLs are published on the ASU pages. It may work from another network. If it does, `WIDTH=720&HEIGHT=360` returns a 0.5° grid directly.)

---

## 6. Illumination (solar irradiance, PSRs, illumination fraction)

### 6.1 Earth

| Dataset | Provider | Access | Res | Format | Licence | Notes |
|---|---|---|---|---|---|---|
| **NASA POWER** `ALLSKY_SFC_SW_DWN`, `CLRSKY_SFC_SW_DWN` (kWh m⁻² d⁻¹), monthly + annual climatology | NASA LaRC | REST (no key) | 1° (solar, CERES/SRB-based) | JSON | NASA open | **Tested OK** (§4.1). Already coarse |
| WorldClim 2.1 `srad` (monthly solar radiation) | WorldClim | Direct | 10′ (~0.17°) | GeoTIFF zip | **non-commercial only, no redistribution** (verified on site) | 16.2 MB zip. HEAD Tested OK. ⚠️ licence is risky for a public demo |
| Day length / polar night (PSR analog) | computed | — | any | — | — | Compute from latitude analytically (polar night fraction ≈ lunar PSR analog) |
| Global Solar Atlas GHI | World Bank/Solargis | — | 250 m | GeoTIFF | (CC BY 4.0 per site, *unverified*) | **Tested failed**: guessed API URL returned 404. Site https://globalsolaratlas.info/download/world resolves. Not needed given POWER |

### 6.2 Moon

| Dataset | Provider | Access | Res | Format | Licence | Size | Grid-friendliness |
|---|---|---|---|---|---|---|---|
| **LOLA average solar visibility** `AVGVISIB_{65,75,85}{N,S}_{240,120,060}M_201608` (+ `_EARTH` variants = Earth visibility, for comms) | NASA PGDA product 69 (Mazarico et al. 2011, updated) | Direct HTTPS (TIF and `_COG.TIF`) | 240/120/60 m, polar stereographic | GeoTIFF int16 (fraction = DN×4e-5) | NASA open | 65S 240 m: 60.4 MB | Downsample into the polar 0.5° cells (reproject polar stereo → lat/lon) |
| **LOLA PSR masks** `LPSR_{65,75,85}{N,S}_…` | PGDA | Direct | 240/120/60 m | GeoTIFF int16 (DN×2.5e-5+0.5 → 0/1) | open | 65S 240 m: 0.58 MB | Compute PSR area fraction per 0.5° cell |
| Sky visibility `SKYV_65{N,S}_240M` | PGDA | Direct | 240 m | GeoTIFF | open | small | Horizon openness / thermal proxy |
| **Moon Ice Favorability Index** (N & S pole) | USGS `mosaic/Lunar_Research/IceFavorabilityIndex/Moon_IceFavorabilityIndex_90{N,S}000E_591mp.tif` | HTTPS | 591 m | GeoTIFF float32 (0–1) | public | 4 MB each | Already small. Ideal "base-site desirability" layer |
| LROC PSR atlas | LROC (ASU / im-ldi) | Web list + PDF | — | — | — | — | Page resolves (`/atlases/psr/list`, `/atlases/psr/psr.pdf`). No shapefile URL located. Untested |
| Non-polar insolation | computed | — | — | — | — | — | Lunar obliquity is ~1.5°, so mean insolation ≈ S₀·cos(lat)/π (analytic). Fine for equatorial cells |

**Tested OK**:
```python
P='https://pgda.gsfc.nasa.gov/data/MoonIllumination'
rasterio.open('/vsicurl/'+P+'/LPSR_65S_240M_201608.TIF')       # 6420x6420, scale 2.5e-05 offset 0.5 → {0,1}
rasterio.open('/vsicurl/'+P+'/AVGVISIB_65S_240M_201608.TIF')   # tiled 256x256, scale 4e-05
rasterio.open('/vsicurl/https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Lunar_Research/IceFavorabilityIndex/Moon_IceFavorabilityIndex_90S000E_591mp.tif')  # 1000x1000, 0–1
```
**Tested failed**: `AVGVISIB_85S_060M_201608_COG.TIF` gave "not recognized as a supported file format" (rasterio wheel GDAL 3.12, likely an unsupported codec). Use the non-COG `.TIF` or 240/120 m versions.

### 6.3 Mars

| Dataset | Provider | Access | Res | Format | Notes |
|---|---|---|---|---|---|
| **MCD `fluxsurf_dn_sw`** (incident solar flux on horizontal surface), `fluxsurf_dn_sw_hr` (on local slope), `solzenang`, `tauref`/`dod` (dust) | LMD MCD web | CGI → ASCII | GCM grid | ASCII | Same call pattern as §4.3 with `var1=fluxsurf_dn_sw`. Same CGI tested OK with `tsurf` |
| Analytic insolation | computed | — | any | — | Mars obliquity 25.2°, e = 0.093. Simple orbital model, or `localtime=all` MCD loops |

---

## 7. Radiation proxies (cutoff rigidity, UV, Mars RAD)

### 7.1 Earth

| Dataset | Provider | Access | Res | Format | Licence | Notes |
|---|---|---|---|---|---|---|
| **IGRF-14 + vertical cutoff rigidity (computed)** | IAGA / NOAA NCEI; Python `ppigrf` | pip package, offline | any (compute on the 0.5° grid) | — | open | **Tested OK** (`ppigrf.igrf` at Atacama). Rc(vertical) via Störmer ≈ 14.9·cos⁴(λ_m) GV, with λ_m = geomagnetic latitude from the IGRF dipole terms. Textbook approximation, good enough for ranking; *verify the constant* |
| OTSO (open-source cutoff rigidity / trajectory code) | N. Larsen et al., GitHub `NLarsen15/OTSO` | Python/Fortran | — | — | (repo licence, *verify*) | Repo resolves. Untested. Use if you need effective (trajectory-traced) Rc |
| World grid of vertical cutoff rigidity 2010/2015/2020 (5°×15°, 20 km alt.), Table 3 of Gerontidou et al. 2021 (ASR) | Athens NM station (`cosray.phys.uoa.gr/publications/D135.pdf`) | PDF table | 5°×15° | PDF | journal | **Tested failed**: host timed out from the box. Usable as a validation table |
| NMDB (neutron monitor database) | nmdb.eu NEST | Web/HTTP | station points | ASCII | free for research | Page resolves. Temporal variation only, not spatial. Untested |
| Altitude / atmospheric depth | from DEM (§3.1) | — | — | — | — | Dose rises roughly exponentially with altitude. Use x = 1033·exp(−z/8.4 km) g cm⁻² (standard-atmosphere approximation) |
| **UV: NASA POWER** `ALLSKY_SFC_UV_INDEX`, `ALLSKY_SFC_UVA`, `ALLSKY_SFC_UVB` | NASA LaRC | REST | 1° | JSON | NASA open | **Tested OK** (Atacama UVI 2.64 annual mean; Death Valley UVA 0.32 / UVB 0.007 W m⁻²) |
| TEMIS UV index / UV dose (OMI/GOME-2 based, v2.0), yearly world files `uvief<YYYY>_world.nc`, `uvdec…`, `uvdvc…`, `uvddc…` | KNMI / ESA TEMIS | Direct (CloudFront) | 0.25°, daily | netCDF | free (terms *unverified*; cite TEMIS) | **Tested OK** (HEAD: `uvief2025_world.nc` = 1.06 GB). Downsample a yearly file to a climatology |
| OMI OMUVBd (daily surface UV) | NASA GES DISC 🔑 | Earthdata | 1° | HDF5 | NASA open | Collection found in CMR (Tested OK). Download untested (login) |

```python
import ppigrf, datetime
Be,Bn,Bu = ppigrf.igrf(-69.25, -24.5, 0, datetime.datetime(2025,1,1))   # Tested OK (nT components)
```

### 7.2 Moon

* No global magnetic field and no atmosphere, so the GCR flux at the surface is effectively **uniform**. Spatial differences come from **topographic shielding** (sky visibility, `SKYV_*` above; PSR/crater walls), not from latitude.
* Reference value: Chang'E-4 LND measured ≈ **1369 µSv/day** dose equivalent on the far-side surface (Zhang et al. 2020, *Science Advances*). Literature value. Cite it, don't grid it.
* **LRO CRaTER** archives on PDS PPI: `LRO-L-CRAT-2-EDR-RAWDATA-V1.0`, `LRO-L-CRAT-3-CDR-CALIBRATED-V1.0`, `LRO-L-CRAT-3_4-DDR-PROCESSED-V1.0` (listing **Tested OK**). These are orbital time series, not maps.

### 7.3 Mars

| Dataset | Provider | Access | Format | Notes |
|---|---|---|---|---|
| **MSL RAD RDR** `MSL-M-RAD-3-RDR-V1.0` (also `-2-EDR`) | PDS PPI | Direct (`/data/MSL-M-RAD-3-RDR-V1.0/DATA/SOL_xxxxx_xxxxx/`) | PDS3 tables | Listing **Tested OK**. A single site (Gale), so use it to *calibrate* a dose-vs-column-mass model. Reference: ≈0.21 mGy/day absorbed, ≈0.64 mSv/day dose equivalent at Gale (Hassler et al. 2014, *Science*), a literature value |
| **MCD `ps`** (surface pressure, Pa) → column mass ps/g | LMD MCD web | CGI → ASCII | **Best spatial proxy**: shielding ∝ atmospheric column. Low basins (Hellas) are best shielded, Tharsis worst. Same call pattern as §4.3 |
| MOLA elevation | §3.3 | — | Alternative proxy where MCD isn't available: column ∝ exp(−z/H), H ≈ 11 km |

---

## 8. Logistics / accessibility (Earth only) + target-site context (Moon/Mars)

### 8.1 Earth

| Dataset | Provider | Access | Res | Format | Licence | Size | Grid-friendliness |
|---|---|---|---|---|---|---|---|
| **Travel time to cities 2015** (Weiss et al. 2018) — coverage `Accessibility__201501_Global_Travel_Time_to_Cities`; also `Explorer__2015_accessibility_to_cities_v1.0`, 2020 friction surfaces, `Explorer__2020_motorized_travel_time_to_healthcare` | Malaria Atlas Project | **WCS 2.0.1** (`data.malariaatlas.org/geoserver/ows`) | 30″ (~1 km) | GeoTIFF int32 (minutes; nodata −9999) | CC BY (3.0 per portal page, *verify per layer*) | global ~GB; a WCS bbox is small | Request in 10–30° bboxes and average to 0.5° (or request the global extent with a coarse size) |
| **Natural Earth 10 m**: airports, populated places, roads, ports | Natural Earth | Direct (naciscdn) | 1:10M | Shapefile zip | Public domain | 0.29 MB / 2.8 MB / 9.1 MB | Distance-to-nearest rasters at 0.5° (fast) |
| **OpenStreetMap Overpass API** | OSM / overpass-api.de | REST (Overpass QL), **fair-use limits** | feature-level | JSON | **ODbL** (attribution + share-alike) | — | **Too heavy for global grids.** Use for candidate-site drill-down (nearest road, airstrip, settlement). Use Geofabrik extracts for regional bulk |

**Tested OK**:
```bash
curl -s -o tt.tif "https://data.malariaatlas.org/geoserver/ows?service=WCS&version=2.0.1&request=GetCoverage&coverageId=Accessibility__201501_Global_Travel_Time_to_Cities&subset=Long(-70,-69)&subset=Lat(-25,-24)&format=image/tiff"
# 120x120 int32 @ 0.00833°, 180–1179 minutes
curl -sO https://naciscdn.org/naturalearth/10m/cultural/ne_10m_airports.zip      # 290,778 B (ne_10m_airports.shp)
curl -s -A "space-apps-analog/0.1" -X POST https://overpass-api.de/api/interpreter \
  --data-urlencode 'data=[out:json][timeout:25];nwr["aeroway"="aerodrome"](-23.0,-69.5,-22.0,-68.5);out center 5;'
# 1 element: "Aeropuerto Internacional El Loa" (Calama). Note: send a User-Agent; use nwr (airports are often ways)
```

### 8.2 Moon / Mars (no logistics data exists — use site-context layers)

* **Moon**: PSR masks + avg solar visibility + Earth visibility (`AVGVISIB_*_EARTH`, direct-to-Earth comms) + Ice Favorability Index + slope (LDSM). Together these define "base-worthy" cells (illuminated ridges next to PSRs). Artemis III candidate regions are published by NASA, but I did not verify a machine-readable source. Unverified.
* **Mars**: USGS hosts CTX mosaics of the **human Exploration Zones** (e.g. `mosaic/Mars/CTX_EZs/Jezero_CTX_BlockAdj_dd.tif`, `…/Arcadia_Planitia_…`, `…/Deuteronilus1_2_…`, ~1.2–4.4 GB each, plus `CTX_Human_EZ_sites.vrt`). The **file names** give a free list of ~45 EZ candidate sites to use as Mars "base" targets. Listed from S3; files not downloaded.
* **Visual basemaps for the web demo** (Tested OK; WMTS tile 0/0/0 returned a JPEG):
  `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0//default/default028mm/{z}/{row}/{col}.jpg`
  `https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0//default/default028mm/{z}/{row}/{col}.jpg`
  (Template from each layer's `WMTSCapabilities.xml`. Note: `Mars_MGS_MOLA_DEM_mosaic_global_463m` has **no** Trek WMTS (404). Use the ClrShade layer.)

### 8.3 Aridity / precipitation (supporting Earth "dryness" analog factor)

| Dataset | Provider | Access | Res | Licence | Size | Status |
|---|---|---|---|---|---|---|
| **Global Aridity Index & PET v3.1** (`Global-AI_ET0__annual_v3_1.zip`) | CGIAR-CSI / Zomer et al., figshare 7504448 | Direct (`https://ndownloader.figshare.com/files/56300327`) | 30″ | **CC BY 4.0** (figshare API) | 646 MB | Metadata Tested OK (figshare API). Downsample |
| **CHELSA v2.1** bioclim (e.g. `CHELSA_bio1_1981-2010_V.2.1.tif`, bio12 precip) | WSL | Direct (Switch S3) | 30″ | CC BY 4.0 (per site) | 115 MB/layer | Tested OK (remote metadata: 43200×20880 uint16, no overviews) |
| WorldClim 2.1 10′ bioclim (`wc2.1_10m_bio.zip`) | WorldClim | Direct | 10′ | **Non-commercial, no redistribution** | 49.9 MB | HEAD Tested OK. ⚠️ prefer CHELSA/POWER for a public demo |
| NASA POWER `PRECTOTCORR` | NASA | REST | ~0.5° | open | tiny | Tested OK |
| TerraClimate | MPC (`terraclimate`) | STAC/Zarr | 1/24° | (*verify*) | — | Collection confirmed. Untested |

---

## 9. Pipeline notes

**Common grid.** Use a 0.5° global lat/lon grid per body: 720×360 cells, cell centres at −179.75…179.75 and −89.75…89.75, longitudes in **−180..180 east-positive** for all three bodies. Store one `xarray.Dataset` per body (`earth.nc`, `moon.nc`, `mars.nc`, or Zarr) with the same dims `(lat, lon)` and named factor variables. Similarity is computed between feature vectors, so the bodies never need to share a CRS. Each body only needs its own regular lat/lon grid.

**Reprojection / georeferencing gotchas**
* Planetary GeoTIFFs from USGS are "SimpleCylindrical/Equirectangular" in **metres** on a sphere. Convert degrees → metres with k = π/180·R. Moon R = 1,737,400 m. Mars R = 3,396,190 m. Then `rasterio.warp.reproject` to an `EPSG:4326`-like lat/lon grid (or just build the target transform in the source CRS's degree-equivalent and use `Resampling.average`).
* PDS3 `.lbl` products open in GDAL. Always check `SCALING_FACTOR`/`OFFSET`:
  LOLA LDEM height = DN×0.5 (GDAL's offset gives *radius*) · LDSM slope = DN×0.0015+45 ° · Diviner RA = DN×0.001 · Diviner ST = DN×0.02 K · PGDA PSR = DN×2.5e-5+0.5 · AVGVISIB = DN×4e-5.
* Many PDS global grids use **0–360°E** longitudes, centred at 180°. Roll the array by half the width to get −180..180. (MEGDR opened via GDAL showed an x-origin of −10,683,778 m, i.e. GDAL re-centres it. Check each file's transform against a known feature.) TES TI 2007 is already −180..180.
* MEGDR labels reference **uppercase** `.IMG` names. Rename the downloaded file or edit `^IMAGE` in the label.
* Polar products (PGDA illumination, LOLA polar DEMs, Ice Favorability) are **polar stereographic**. Warp into the 0.5° cells poleward of ±60–65°. The 0.5° grid is very anisotropic near the poles, so consider an extra polar-stereo sub-grid for the south-pole base region.
* SoilGrids 5 km is **Interrupted Goode Homolosine** (ESRI:54052). Warp to EPSG:4326.
* Aggregation: use `Resampling.average` for continuous fields, mode/class-fraction for categorical layers (GLiM, geologic units), and **area-weight by cos(lat)** in any global statistics.
* Compute derivatives (slope, roughness, PSR fraction, Tmax−Tmin) at **native resolution first**, then aggregate (mean, P90, fraction).

**Reading big files without downloading them.** Most USGS planetary GeoTIFFs are **strip-organised with no overviews** (1-row strips). `/vsicurl/` windowed reads and **every-Nth-row reads** are still cheap (tested on MOLA 463 m: one row ≈ 92 KB). Earth COGs (Copernicus, SoilGrids) have internal overviews, so `out_shape=` decimated reads are fast. Set `GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR`.

**Tools.** `pip install rasterio numpy xarray rioxarray netCDF4 pystac-client planetary-computer requests ppigrf earthaccess geopandas`. On this box the `rasterio` 1.5.2 wheel bundles **GDAL 3.12.2** and handled PDS3 labels, GeoTIFF/COG and `/vsicurl/` (tested in `/tmp/ds/venv`). PEP 668 blocks system-wide pip, so use a venv. Optional: GDAL CLI (`gdalwarp -r average -te -180 -90 180 90 -ts 720 360`), `pyproj`, `scipy`.

**Auth requirements (all free)**
* 🔑 **NASA Earthdata login** for LP DAAC (MOD11C3, MCD43, ASTER GED) and GES DISC (OMI UV). Register at urs.earthdata.nasa.gov, then use `~/.netrc` or `earthaccess.login()`. CMR *search* needs no login.
* **Microsoft Planetary Computer**: no account. Sign asset URLs with the anonymous SAS token (`planetary_computer.sign` or `GET /api/sas/v1/token/<collection>`). Tested OK.
* 🔑 OpenTopography API key, only if you choose SRTM from OpenTopography (NASADEM/Copernicus avoid this).
* JMARS (ASU) needs a free account, only if you go that route for TES mineral maps.
* Everything else (PDS, USGS, PGDA, MCD web, POWER, SoilGrids, Macrostrat, GLiM, MAP, Natural Earth, CHELSA, ETOPO, Overpass) needs no login. Overpass and MCD expect polite request rates.

**Budget for one Linux box (rough).** Moon core layers ≈ 3.3 GB (mostly Diviner GCP ASCII; everything else < 400 MB). Mars core ≈ 0.4 GB + a few hundred MCD calls. Earth core ≈ 1.5 GB (ETOPO 0.48, aridity 0.65, SoilGrids 5 km ~0.1, GLiM, NE, MOD11C3 optional ~0.85) + ~650 POWER regional calls + Copernicus overview reads if you want Earth slope. All of it fits a few-hour preprocessing run. The Copernicus slope pass is the slowest step: budget ~1–2 h with concurrency, or use ETOPO-derived slope at 1′ as a fallback.

## 10. Gaps / risks

1. **The challenge Resources tab is empty** right now, so the "official" dataset list may appear later and could favour specific products (e.g. NASA Trek, Artemis regions). Re-check before submission.
2. **Earth thermal inertia has no free global product.** It must be a proxy (diurnal amplitude / apparent TI), which makes it less comparable to Diviner/TES TI. Normalise per body (z-scores/ranks), not in absolute TI units.
3. **Mars mineral maps (TES/Bandfield)**: the numeric WMS was unreachable from this box. Fallbacks: GRS elements + TES albedo + dust (MCD `dod`), or try the ASU URLs from another network, or JMARS.
4. **Lunar H-parameter/TI and THEMIS quantitative TI** global files were not located. Diviner regolith-temperature anomaly and rock abundance stand in for lunar TI.
5. **Licences**: WorldClim is non-commercial and forbids redistribution (avoid it in a public demo). OSM is ODbL (attribution + share-alike on derived databases). MAP is CC BY (verify per layer). Copernicus DEM needs its attribution string. "verify" marks in the tables mean I didn't read the full licence text.
6. **Resolution mismatch**: MCD (~4–6°) and Odyssey GRS (5°) are much coarser than 0.5°. Interpolated values imply false precision. Weight those factors lower or carry an uncertainty layer.
7. **Radiation cross-body comparability**: Earth's dose is dominated by the atmosphere (~1000 g cm⁻²) and geomagnetic shielding, while the Moon has neither. No Earth surface location is radiation-analogous to the Moon or Mars. Treat radiation as a *relative* ranking within Earth (high altitude + high latitude = least shielded) and document that limitation.
8. **Polar geometry**: lunar base candidates are at the south pole, where a 0.5° lat/lon grid degenerates. Use a polar-stereo sub-grid for the Moon south-pole case.
9. **Service reliability**: from this box, `ms-mars.mars.asu.edu`, `murray-lab.caltech.edu` (curl), `cosray.phys.uoa.gr` and `tools.izmiran.ru` timed out. `e4ftl01.cr.usgs.gov` paths are retired (use CMR cloud URLs). The PGDA 85S COG wasn't readable by GDAL 3.12. **Cache every downloaded layer locally** and don't hit APIs live from the web demo.
10. **Kaguya MI 4 ppd** values include non-physical outliers (FeO up to ~107 wt%). Mask with the companion `WeightedCriteriaValue` or clip to a physical range.

## 11. Test log (box, 2026-10-08)

**Tested OK (38)**: THEMIS TI quantitative tile window · MGC³ cave catalog HEAD · challenge-page decode · LOLA LDEM_4 download+read · LOLA LDSM_16 remote read · MOLA MEGDR 4 ppd download+read · MOLA 463 m window + strided rows · Diviner GCP range read · Diviner RA 32 ppd window · PGDA LPSR & AVGVISIB 65S · Moon Ice Favorability · Kaguya MI FeO 4 ppd · TES albedo decimated read · TES TI 2007 window · Odyssey GRS H₂O 5° download · LP GRS 2° range read · MCD point + global map · ODE REST (CTX EDR 189 hits; CRISM MTRDR 35, MRDR4 4 near Gale) · Trek WMTS tiles (Moon, Mars) · USGS STAC collections · USGS S3 listings (2 buckets) · Unified Geologic Map HEAD · SIM 3292 HEAD · MSL RAD + CRaTER PPI listings · Copernicus COG window/overview · Earth Search STAC · MPC STAC + SAS token + MODIS LST search · ETOPO size · GMTED HEAD · POWER point (2) + regional · SoilGrids REST · SoilGrids 5 km overview read · Macrostrat · GLiM 0.5° download · Overpass · Natural Earth download · MAP WCS GetCoverage · CHELSA metadata · aridity figshare API · WorldClim HEAD · TEMIS HEAD · CMR MOD11C3/OMUVBd search · ppigrf IGRF.

**Tested failed**: ASU `ms-mars` numeric WMS (timeout) · MOD11C3 download w/o login (401, expected) · `e4ftl01` MOD11C3 path (404, retired) · PGDA 85S 60 m COG (GDAL format error) · `cosray.phys.uoa.gr` cutoff table PDF (timeout) · `tools.izmiran.ru` (timeout) · Murray Lab via curl (timeout; WebFetch OK) · Global Solar Atlas guessed URL (404) · Trek WMTS for `Mars_MGS_MOLA_DEM_mosaic_global_463m` (404) · SoilGrids WCS (200 but empty/no-CRS tile; CRS subsetting issue) · ODE with `pt=MRDR` (invalid combo; valid types are `MRDR4`, `MTRDR`, `TRDR`…).

**Untested**: OpenTopography SRTM (needs key) · NASADEM item read · M3 product download · LROC PSR shapefile · OMI OMUVBd download (login) · ASTER GED / EMIT (login) · OTSO · NMDB · TerraClimate · OMEGA · LP neutron spectrometer H maps · Artemis III region polygons.
