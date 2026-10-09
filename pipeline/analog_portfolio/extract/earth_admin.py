"""Earth country + continent per 0.5 deg cell (site cards, `one_continent` variant).

Natural Earth 1:50m admin-0 countries (public domain) rasterized at 0.1 deg, modal country per 0.5 deg cell over
the 25 sub-pixels; land cells with no polygon hit (coast slivers, tiny islands) take the nearest country.
Writes grids/earth_country.nc (country_idx) + grids/earth_country_lookup.json.
Run: python -m analog_portfolio.extract.earth_admin
"""
from __future__ import annotations

import json
import zipfile

import numpy as np

from ..config import GRIDS, RAW
from ..grid.io import add_provenance, read_var, sha256, write_layer
from ..grid.power import fill_nearest

ZIP = RAW / "earth" / "natural_earth" / "ne_50m_admin_0_countries.zip"
URL = "https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip"
SUB = 5  # 0.1 deg sub-pixels per 0.5 deg cell


def _continent(rec: dict) -> str:
    c = rec.get("CONTINENT") or ""
    if c.startswith("Seven seas"):
        c = {"Africa": "Africa", "Asia": "Asia", "Americas": "South America", "Oceania": "Oceania",
             "Europe": "Europe", "Antarctica": "Antarctica"}.get(rec.get("REGION_UN") or "", "Oceania")
    return c


def build() -> tuple[np.ndarray, list[dict]]:
    import io

    import shapefile
    from rasterio.features import rasterize
    from rasterio.transform import from_origin

    z = zipfile.ZipFile(ZIP)
    base = [n[:-4] for n in z.namelist() if n.endswith(".shp")][0]
    r = shapefile.Reader(shp=io.BytesIO(z.read(base + ".shp")), dbf=io.BytesIO(z.read(base + ".dbf")),
                         shx=io.BytesIO(z.read(base + ".shx")), encoding="utf-8")
    fields = [f[0] for f in r.fields[1:]]
    lookup, shapes = [], []
    for i, sr in enumerate(r.iterShapeRecords()):
        rec = dict(zip(fields, sr.record))
        lookup.append(dict(idx=i + 1, adm0_a3=rec.get("ADM0_A3"), iso_a3=rec.get("ISO_A3"), name=rec.get("NAME"),
                           continent=_continent(rec)))
        shapes.append((sr.shape.__geo_interface__, i + 1))
    fine = rasterize(shapes, out_shape=(360 * SUB, 720 * SUB), transform=from_origin(-180, 90, 0.5 / SUB, 0.5 / SUB),
                     fill=0, dtype="int32")
    blk = fine.reshape(360, SUB, 720, SUB).transpose(0, 2, 1, 3).reshape(360, 720, SUB * SUB)
    srt = np.sort(blk, axis=2)
    # modal non-zero id: scan runs of the sorted sub-pixel ids
    best = np.zeros((360, 720), int); bestn = np.zeros((360, 720), int)
    run_v = srt[..., 0]; run_n = np.ones((360, 720), int)
    for k in range(1, SUB * SUB + 1):
        same = (srt[..., k] == run_v) if k < SUB * SUB else np.zeros((360, 720), bool)
        end = ~same
        upd = end & (run_v > 0) & (run_n > bestn)
        best[upd] = run_v[upd]; bestn[upd] = run_n[upd]
        if k < SUB * SUB:
            run_n = np.where(same, run_n + 1, 1); run_v = srt[..., k]
    out = best.astype(float)
    land = np.nan_to_num(read_var(GRIDS / "earth_land_frac.nc", "land_frac")) > 0
    out[out == 0] = np.nan
    filled = fill_nearest(out)
    filled[~land & np.isnan(out)] = np.nan
    return filled, lookup


def main() -> None:
    a, lookup = build()
    write_layer("earth_country", "earth", {"country_idx": (a, dict(long_name="Natural Earth admin-0 index (see earth_country_lookup.json)"))},
                "Earth country index per 0.5 deg cell (Natural Earth 1:50m)")
    (GRIDS / "earth_country_lookup.json").write_text(json.dumps(lookup, indent=0, ensure_ascii=False) + "\n")
    add_provenance("earth_country", dict(
        body="earth", grid_file="grids/earth_country.nc", title="Earth country / continent per cell (site cards, one_continent)",
        dataset="Natural Earth 1:50m Cultural Vectors, Admin 0 - Countries (v5.1.x)", provider="Natural Earth (NACIS)",
        agency_group="other", licence="Public domain (Natural Earth terms of use)", native_resolution="1:50m vectors",
        sources=[dict(url=URL, file=str(ZIP), sha256=sha256(ZIP))],
        processing=["rasterized at 0.1 deg", "modal country of 25 sub-pixels per 0.5 deg cell", "land cells without a hit: nearest country"],
        caveat="Natural Earth shows de facto boundaries; country names are for orientation only"))
    n = np.isfinite(a).sum()
    print("country cells:", int(n), "countries:", len(lookup))


if __name__ == "__main__":
    main()


# ---------------------------------------------------------------- point names (country + admin-1) for site cards
ZIP1 = RAW / "earth" / "natural_earth" / "ne_10m_admin_1_states_provinces.zip"
URL1 = "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip"


def _reader(zpath):
    import io

    import shapefile

    z = zipfile.ZipFile(zpath)
    base = [n[:-4] for n in z.namelist() if n.endswith(".shp")][0]
    return shapefile.Reader(shp=io.BytesIO(z.read(base + ".shp")), dbf=io.BytesIO(z.read(base + ".dbf")),
                            shx=io.BytesIO(z.read(base + ".shx")), encoding="utf-8")


def _rings(shape) -> list[np.ndarray]:
    pts = np.asarray(shape.points, float)
    parts = list(shape.parts) + [len(pts)]
    return [pts[parts[i]:parts[i + 1]] for i in range(len(parts) - 1)]


def _inside(lon: float, lat: float, rings: list[np.ndarray]) -> bool:
    """Even-odd ray casting over all rings (holes handled by parity)."""
    c = False
    for r in rings:
        x, y = r[:, 0], r[:, 1]
        x2, y2 = np.roll(x, -1), np.roll(y, -1)
        m = (y > lat) != (y2 > lat)
        if m.any():
            xi = x[m] + (lat - y[m]) * (x2[m] - x[m]) / (y2[m] - y[m])
            c ^= bool((np.count_nonzero(xi > lon) % 2) == 1)
    return c


class Namer:
    """Point -> (country, admin1) with Natural Earth 1:50m admin-0 and 1:10m admin-1 (public domain)."""

    def __init__(self):
        self._layers = {}
        for key, zp, fld in (("country", ZIP, "NAME"), ("admin1", ZIP1, "name")):
            r = _reader(zp)
            fields = [f[0] for f in r.fields[1:]]
            k = fields.index(fld)
            items = []
            for sr in r.iterShapeRecords():
                if not sr.shape.points:
                    continue
                items.append((np.asarray(sr.shape.bbox, float), sr.record[k], _rings(sr.shape)))
            self._layers[key] = items
        self._cache: dict[tuple, tuple] = {}

    def _find(self, key, lon, lat):
        for bb, name, rings in self._layers[key]:
            if bb[0] <= lon <= bb[2] and bb[1] <= lat <= bb[3] and _inside(lon, lat, rings):
                return name or None
        return None

    def __call__(self, lat: float, lon: float) -> tuple[str | None, str | None]:
        k = (round(lat, 5), round(lon, 5))
        if k not in self._cache:
            self._cache[k] = (self._find("country", lon, lat), self._find("admin1", lon, lat))
        return self._cache[k]
