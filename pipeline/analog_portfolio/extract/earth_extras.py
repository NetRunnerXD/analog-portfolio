"""P1-owned Earth layers (see data/OWNERSHIP.md):
  earth_permafrost.nc       F9: ESA CCI Permafrost v5.0 PFR (NH + Antarctica), mean 2019-2023, area fraction per cell
  earth_geomorph_flags.nc   F13: impact structures (PASSC EID via cjwinchester/earth-impact-data), Holocene volcanoes
                            (Smithsonian GVP), periglacial (PFR >= 10%), massif (relief >= area-weighted P90 of land)
Run: python -m analog_portfolio.extract.earth_extras [permafrost] [geomorph]
"""
from __future__ import annotations

import csv
import glob
import json
import sys

import numpy as np

from ..config import GRIDS, RAW
from ..grid import cell_id, lat_centres
from ..grid.area import cell_weights, great_circle_km, weighted_quantile
from ..grid.io import add_provenance, read_var, sha256, write_layer

PF = RAW / "earth" / "permafrost_cci"
GM = RAW / "earth" / "geomorph"
CCI = "https://dap.ceda.ac.uk/neodc/esacci/permafrost/data/permafrost_extent/L4/area4/pp/v05.0/"


def _pfr_block(path: str) -> tuple[np.ndarray, float]:
    """Mean PFR (fraction 0-1) per 0.5 deg cell for one annual file; returns (rows, lat_top)."""
    import netCDF4

    with netCDF4.Dataset(path) as d:
        lat = d["lat"][:]
        a = d["PFR"][0].astype("float32")
        a = a.filled(np.nan) if hasattr(a, "filled") else a
    if lat[0] < lat[-1]:
        a, lat = a[::-1], lat[::-1]
    top = float(lat[0]) + 0.005
    ny = a.shape[0] // 50
    b = a[: ny * 50].reshape(ny, 50, 720, 50).transpose(0, 2, 1, 3).reshape(ny, 720, 2500)
    # cells: fraction of 1 km px area with permafrost; NaN px (ocean/no-data) ignored, need >= 10% valid
    with np.errstate(all="ignore"):
        n = np.isfinite(b).sum(-1)
        m = np.where(n >= 250, np.nansum(b, -1) / np.maximum(n, 1) / 100.0, np.nan)
    return m, top


def permafrost() -> None:
    out = np.full((360, 720), np.nan)
    srcs = []
    for region in ("NH", "ANT"):
        files = sorted(glob.glob(str(PF / f"{region}_*.nc")))
        assert files, f"no {region} permafrost files"
        stack = []
        for f in files:
            m, top = _pfr_block(f)
            stack.append(m)
            yr = f[-7:-3]
            sub = "northern_hemisphere" if region == "NH" else "Antarctica"
            area = "AREA4" if region == "NH" else "AREA27"
            srcs.append(dict(url=f"{CCI}{sub}/{yr}/ESACCI-PERMAFROST-L4-PFR-MODISLST_CRYOGRID-{area}_PP-{yr}-fv05.0.nc",
                             file=f, sha256=sha256(f)))
        mean = np.nanmean(np.stack(stack), 0)
        r0 = int(round((90 - top) / 0.5))
        blk = out[r0:r0 + mean.shape[0]]
        out[r0:r0 + mean.shape[0]] = np.where(np.isfinite(mean), mean, blk)
    covered = np.zeros((360, 720), bool)
    lat = lat_centres()
    covered[(lat > 25)] = True
    covered[(lat < -60)] = True
    write_layer("earth_permafrost", "earth", {
        "permafrost_frac": (out, dict(units="1", factor="F9", long_name="Permafrost area fraction (ESA CCI PFR v5.0, mean 2019-2023)",
                                      resampling="mean of 1 km PFR over 50x50 px (>=10% valid)")),
        "pfr_coverage": (covered.astype(float), dict(units="1", long_name="1 where the CCI product covers the cell latitude (>25N or <60S)")),
    }, "Earth permafrost extent (ESA CCI Permafrost v5.0)")
    add_provenance("earth_permafrost", dict(
        body="earth", grid_file="grids/earth_permafrost.nc", title="Earth permafrost extent fraction (F9)",
        dataset="ESA Permafrost CCI permafrost extent (PFR) v5.0, northern hemisphere + Antarctica, 2019-2023",
        provider="ESA Climate Change Initiative / University of Oslo (CEDA archive)", agency_group="partner",
        licence="ESA CCI Data Policy: free and open access (cite Westermann et al.; CEDA catalogue)",
        native_resolution="0.01 deg (~1 km)", sources=srcs,
        processing=["PFR percent -> fraction", "mean over 50x50 px per 0.5 deg cell (>= 250 valid px)", "mean of 5 annual files 2019-2023"],
        caveat="No coverage between 25N and 60S (mountain permafrost of the Andes, Southern Alps etc. missing); assembly falls back to POWER TS < 273.15 K there"))
    print("permafrost: cells > 0:", int((out > 0).sum()))


def geomorph() -> None:
    flags = np.zeros((360, 720), dtype=np.int64)
    w = cell_weights()
    # impact structures: flag every cell within max(radius, 10 km) of the centre
    n_imp = 0
    with open(GM / "earth-impact-craters.csv", newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                la, lo = float(r["latitude"]), float(r["longitude"])
                d_km = float(r["diameter_km"] or 0)
            except ValueError:
                continue
            n_imp += 1
            flags.flat[cell_id(la, lo)] |= 1
            rad = max(d_km / 2, 0)
            if rad > 28:  # larger than half a cell: flag cells whose centre is inside the rim
                LA, LO = np.meshgrid(lat_centres(), np.arange(720) * 0.5 - 179.75, indexing="ij")
                inside = great_circle_km(la, lo, LA, LO) <= rad
                flags[inside] |= 1
    gvp = json.loads((GM / "gvp_holocene.json").read_text())
    for ft in gvp["features"]:
        lo, la = ft["geometry"]["coordinates"][:2]
        flags.flat[cell_id(la, lo)] |= 64
    pf = read_var(GRIDS / "earth_permafrost.nc", "permafrost_frac")
    flags[np.nan_to_num(pf) >= 0.10] |= 4
    try:
        relief = read_var(GRIDS / "earth_relief_m.nc", "relief_m")
        land = read_var(GRIDS / "earth_land_frac.nc", "land_frac") >= 0.5
        p90 = float(weighted_quantile(relief[land], w[land], 0.90)[0])
        flags[land & (np.nan_to_num(relief) >= p90)] |= 16
    except (FileNotFoundError, OSError):
        p90 = None
    write_layer("earth_geomorph_flags", "earth", {
        "geomorph_flags": (flags.astype(float), dict(units="bitmask", factor="F13",
                           long_name="1 impact, 4 periglacial, 16 massif/ridge, 64 volcanic (2 cave, 8 debris-covered glacier, 32 cold trap: no Earth source)")),
    }, "Earth geomorphic flags (F13)")
    add_provenance("earth_geomorph_flags", dict(
        body="earth", grid_file="grids/earth_geomorph_flags.nc", title="Earth geomorphic flags (F13)", agency_group="other",
        dataset="Earth Impact Database (PASSC, via cjwinchester/earth-impact-data CSV) + Smithsonian GVP Holocene volcanoes + derived",
        provider="PASSC / University of New Brunswick; Smithsonian Institution Global Volcanism Program",
        licence="Impact CSV: The Unlicense (scraped facts from PASSC EID; cite PASSC). GVP: cite Global Volcanism Program (2024) Volcanoes of the World v5.x, Smithsonian",
        native_resolution="points", sources=[
            dict(url="https://raw.githubusercontent.com/cjwinchester/earth-impact-data/main/earth-impact-craters.csv", file=str(GM / "earth-impact-craters.csv"), sha256=sha256(GM / "earth-impact-craters.csv"), n=n_imp),
            dict(url="https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&outputFormat=application/json", file=str(GM / "gvp_holocene.json"), sha256=sha256(GM / "gvp_holocene.json"), n=len(gvp["features"]))],
        processing=["impact: centre cell, plus all cells within the crater radius when radius > 28 km", "volcanic: cell containing each Holocene volcano",
                    "periglacial: permafrost_frac >= 0.10", f"massif: land relief_m >= area-weighted land P90 ({p90})"],
        caveat="No Earth source for caves/lava tubes, debris-covered glaciers or cold traps; flags are unbiased w.r.t. the validation set (complete catalogues, no hand-picking)"))
    print("geomorph: impact cells", int(((flags & 1) > 0).sum()), "volcanic", int(((flags & 64) > 0).sum()), "massif p90", p90)


if __name__ == "__main__":
    steps = sys.argv[1:] or ["permafrost", "geomorph"]
    for s in steps:
        globals()[s]()
