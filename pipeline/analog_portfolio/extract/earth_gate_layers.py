"""P1 layers for the Mars candidate gate (contract v1.2, Researcher research.md §8):

  earth_aridity_land.nc   Global-AI v3.1 annual AI averaged over LAND pixels only. The AI GeoTIFF has no nodata value
                          and stores 0 over the ocean, so a plain block mean drags coastal cells toward "hyper-arid"
                          (and reads AI = 0 over open water, e.g. NEEMO). Pixels where the ET0 raster is 65535 (its
                          ocean/nodata value) or <= 0 are masked before averaging (Researcher's ai_land.py rule).
  earth_moss_lichen.nc    WorldCover 2021 moss & lichen (class 100) fraction of land pixels per 0.5 deg cell, from the
                          TAE per-cell class counts (raw/earth/worldcover/cells/*.csv); Antarctic fallback cells = 0.
Run: python -m analog_portfolio.extract.earth_gate_layers [aridity] [moss]
"""
from __future__ import annotations

import csv
import glob
import sys

import numpy as np

from ..config import GRIDS, RAW
from ..grid.io import add_provenance, read_var, sha256, write_layer

AI_ZIP = RAW / "earth" / "aridity" / "Global-AI_ET0__annual_v3_1.zip"
WC_CELLS = RAW / "earth" / "worldcover" / "cells"
WC_CLASSES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100]


def aridity_land() -> np.ndarray:
    import rasterio

    z = f"/vsizip/{AI_ZIP}/Global-AI_ET0__annual_v3_1/"
    out = np.full((360, 720), np.nan)
    with rasterio.open(z + "ai_v31_yr.tif") as a, rasterio.open(z + "et0_v31_yr.tif") as e:
        k = int(round(0.5 / a.res[0]))
        H, W = a.height, a.width
        top = int(round((90 - a.transform.f) / 0.5))
        for r in range(H // k):
            win = ((r * k, (r + 1) * k), (0, W))
            A = a.read(1, window=win).astype("float64")
            E = e.read(1, window=win).astype("float64")
            m = (E != 65535) & (E > 0) & (A < 65535)
            if e.nodata is not None:
                m &= E != e.nodata
            blk = np.where(m, A, np.nan).reshape(k, W // k, k)
            n = np.isfinite(blk).sum(axis=(0, 2))
            s = np.nansum(blk, axis=(0, 2))
            out[top + r] = np.where(n > 0, s / np.maximum(n, 1), np.nan) * 1e-4
    return out


def moss_lichen() -> np.ndarray:
    tot = {}
    for f in glob.glob(str(WC_CELLS / "*.csv")):
        with open(f) as fh:
            for row in csv.reader(fh):
                key = (round(float(row[0]), 2), round(float(row[1]), 2))
                v = np.array([float(x) for x in row[2:]])
                tot[key] = tot.get(key, 0) + v
    out = np.full((360, 720), np.nan)
    land_idx = [WC_CLASSES.index(c) for c in WC_CLASSES if c not in (0, 80)]
    for (lo, la), v in tot.items():
        land = v[land_idx].sum()
        if land > 0:
            out[int(round((89.75 - la) / 0.5)), int(round((lo + 179.75) / 0.5))] = v[WC_CLASSES.index(100)] / land
    src = read_var(GRIDS / "earth_barren.nc", "source_flag")
    return np.where(np.isnan(out) & (src == 3), 0.0, out)  # Antarctic fallback cells (source_flag 3), as earth_barren


def main(*which: str) -> None:
    which = which or ("aridity", "moss")
    if "aridity" in which:
        a = aridity_land()
        write_layer("earth_aridity_land", "earth", {"aridity_index": (a, dict(units="1", long_name="Global-AI v3.1 annual AI, land pixels only (ET0 != 65535)"))},
                    "Earth aridity index, land-only mean (F7, Mars gate)")
        add_provenance("earth_aridity_land", dict(
            body="earth", grid_file="grids/earth_aridity_land.nc", title="Earth aridity index, land pixels only (F7, Mars gate)",
            dataset="Global Aridity Index and ET0 Database v3.1 (Zomer, Xu & Trabucco 2022)", provider="CGIAR-CSI / Zomer et al. (figshare)",
            agency_group="other", licence="CC BY 4.0", native_resolution="30 arc-sec",
            sources=[dict(url="https://figshare.com/articles/dataset/Global_Aridity_Index_and_Potential_Evapotranspiration_ET0_Climate_Database_v2/7504448",
                          file=str(AI_ZIP), sha256=sha256(AI_ZIP))],
            processing=["mask pixels where et0_v31_yr == 65535 or <= 0 (ocean; the AI raster has no nodata value and reads 0 there)",
                        "mean of the remaining AI pixels per 0.5 deg cell, x 1e-4"],
            caveat="No Antarctic coverage: the assembly fills Antarctic land with AI = 0.03"))
        print("aridity land cells:", int(np.isfinite(a).sum()))
    if "moss" in which:
        m = moss_lichen()
        write_layer("earth_moss_lichen", "earth", {"moss_lichen_frac_of_land": (m, dict(units="1", long_name="WorldCover moss & lichen fraction of land pixels"))},
                    "Earth moss & lichen fraction of land (Mars gate clause C)")
        add_provenance("earth_moss_lichen", dict(
            body="earth", grid_file="grids/earth_moss_lichen.nc", title="Moss & lichen fraction of land (Mars gate clause C)",
            dataset="ESA WorldCover 10 m 2021 v200, class 100", provider="ESA", agency_group="partner",
            licence="CC BY 4.0 (© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021))",
            native_resolution="10 m", sources=[dict(url="https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/",
                                                   file=str(WC_CELLS), sha256=None)],
            processing=["per-cell class counts from the TAE WorldCover pass", "class 100 / all non-water, non-nodata pixels"],
            caveat="Antarctic fallback cells (no WorldCover read) set to 0"))
        print("moss cells:", int(np.isfinite(m).sum()))


if __name__ == "__main__":
    main(*sys.argv[1:])
