"""Web-side cell -> (country, admin1) index for live-rescored sites (no pipeline or contract edits).

Same rules as the pipeline's site names (pipeline/analog_portfolio/export/real.py `place`): Natural Earth 1:50m admin-0
and 1:10m admin-1 point-in-polygon at the cell centre (first polygon in file order wins), falling back to the cell's
modal country (grids/earth_country.nc); admin1 is dropped when it equals the country. Imports those helpers read-only.

Run from the pipeline venv (needs the pipeline's local data/raw Natural Earth zips and data/grids):
  pipeline/.venv/bin/python web/scripts/build_cell_regions.py
Writes web/public/geo/cell_regions.{json,bin}: uint16 country index, then uint16 admin-1 index (0 = none), one per Earth
land cell in earth_features cell order.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

WEB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WEB.parent / "pipeline"))
from analog_portfolio.extract.earth_admin import ZIP, ZIP1, _reader, _rings  # noqa: E402
from analog_portfolio.export.real import country_lookup  # noqa: E402


def first_hit(zpath, field, lon, lat):
    r = _reader(zpath)
    k = [f[0] for f in r.fields[1:]].index(field)
    out = np.full(len(lon), None, dtype=object)
    todo = np.ones(len(lon), bool)
    for sr in r.iterShapeRecords():
        if not sr.shape.points:
            continue
        x0, y0, x1, y1 = sr.shape.bbox
        cand = np.flatnonzero(todo & (lon >= x0) & (lon <= x1) & (lat >= y0) & (lat <= y1))
        if not len(cand):
            continue
        px, py = lon[cand], lat[cand]
        inside = np.zeros(len(cand), bool)
        for ring in _rings(sr.shape):  # even-odd ray casting, as earth_admin._inside
            x, y = ring[:, 0], ring[:, 1]
            x2, y2 = np.roll(x, -1), np.roll(y, -1)
            for j in range(len(x)):
                m = (y[j] > py) != (y2[j] > py)
                if m.any():
                    xi = x[j] + (py[m] - y[j]) * (x2[j] - x[j]) / (y2[j] - y[j])
                    flip = np.zeros(len(cand), bool)
                    flip[np.flatnonzero(m)[xi > px[m]]] = True
                    inside ^= flip
        hit = cand[inside]
        out[hit] = sr.record[k] or None
        todo[hit] = False
    return out


def main() -> None:
    m = json.loads((WEB / "public/data/earth_features.json").read_text())
    a = next(x for x in m["arrays"] if x["name"] == "cell_id")
    buf = (WEB / "public/data" / m["binary"]).read_bytes()
    cid = np.frombuffer(buf, dtype="<u4", count=a["length"], offset=a["byte_offset"]).astype(int)
    lat = 89.75 - 0.5 * (cid // 720)
    lon = -179.75 + 0.5 * (cid % 720)
    cell_country, _ = country_lookup(cid)
    country = first_hit(ZIP, "NAME", lon, lat)
    admin1 = first_hit(ZIP1, "name", lon, lat)
    countries, admins = [], []
    ci = np.zeros(len(cid), "<u2")
    ai = np.zeros(len(cid), "<u2")
    for i in range(len(cid)):
        c = country[i] or cell_country[i]
        a1 = admin1[i] if admin1[i] and admin1[i] != c else None
        if c:
            if c not in countries:
                countries.append(c)
            ci[i] = countries.index(c) + 1
        if a1:
            if a1 not in admins:
                admins.append(a1)
            ai[i] = admins.index(a1) + 1
    out = WEB / "public/geo"
    out.mkdir(exist_ok=True)
    (out / "cell_regions.bin").write_bytes(ci.tobytes() + ai.tobytes())
    (out / "cell_regions.json").write_text(json.dumps(dict(
        note="Country and admin-1 region per Earth land cell, in earth_features cell order (web/scripts/build_cell_regions.py)",
        source="Natural Earth 1:50m admin-0 countries + 1:10m admin-1 states/provinces (public domain), same rules as the pipeline's site names",
        n_cells=int(len(cid)), first_cell_id=int(cid[0]), last_cell_id=int(cid[-1]), binary="cell_regions.bin",
        layout="uint16 little-endian: country index x n_cells, then admin-1 index x n_cells; 0 = none, else 1-based into the lists",
        countries=countries, admin1=admins), ensure_ascii=False, separators=(",", ":")) + "\n")
    print(len(cid), len(countries), len(admins), int((ci > 0).sum()), int((ai > 0).sum()))


if __name__ == "__main__":
    main()
