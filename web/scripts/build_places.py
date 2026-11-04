"""Natural Earth 1:10m populated places (public domain) -> web/public/geo/places.json for reverse search.

Bundled with the app as a static file and fetched only on the Reverse search screen; searches run on the device.
Run: pipeline/.venv/bin/python web/scripts/build_places.py  (needs pyshp and data/raw/earth/natural_earth/)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WEB.parent / "pipeline"))
from analog_portfolio.config import RAW  # noqa: E402
from analog_portfolio.extract.earth_admin import _reader  # noqa: E402

ZIP = RAW / "earth" / "natural_earth" / "ne_10m_populated_places.zip"


def main() -> None:
    r = _reader(ZIP)
    f = [x[0] for x in r.fields[1:]]
    k = {n: f.index(n) for n in ("NE_ID", "NAME", "NAMEASCII", "ADM1NAME", "ADM0NAME", "LATITUDE", "LONGITUDE", "POP_MAX")}
    rows = []
    for rec in r.iterRecords():
        name, ascii_ = rec[k["NAME"]], rec[k["NAMEASCII"]]
        rows.append([int(rec[k["NE_ID"]]), name, ascii_ if ascii_ != name else "", rec[k["ADM1NAME"]] or "", rec[k["ADM0NAME"]] or "",
                     round(float(rec[k["LATITUDE"]]), 4), round(float(rec[k["LONGITUDE"]]), 4), int(rec[k["POP_MAX"]] or 0)])
    rows.sort(key=lambda x: (-x[7], x[1]))
    out = WEB / "public/geo/places.json"
    out.write_text(json.dumps(dict(
        source="Natural Earth 1:10m Cultural Vectors, Populated Places (v5.1.x)", licence="Public domain (Natural Earth terms of use)",
        fields=["ne_id", "name", "name_ascii", "admin1", "country", "lat", "lon", "pop_max"], rows=rows),
        ensure_ascii=False, separators=(",", ":")) + "\n")
    print(len(rows), out.stat().st_size)


if __name__ == "__main__":
    main()
