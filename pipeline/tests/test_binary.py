"""Binary column store (grid/binary.py): byte order, alignment, nodata, quantization (review-01)."""
import json
import math

import numpy as np
import pytest

from analog_portfolio.grid.binary import NODATA, quantize, read_grid, write_grid
from analog_portfolio.grid.columns import EARTH_COLUMNS, PLANET_COLUMNS


def test_roundtrip_alignment_endianness_nodata(tmp_path):
    n = 7  # odd length: uint8 columns need padding before the next array
    cols = [
        dict(name="cell_id", dtype="uint32", scale=1, add_offset=0, values=np.arange(n) * 1000),
        dict(name="u8", dtype="uint8", scale=0.004, add_offset=0, values=[0, 0.1, 0.5, 1.0, np.nan, 0.004, 0.996]),
        dict(name="u16", dtype="uint16", scale=0.01, add_offset=150, values=[150, 200.5, np.nan, 300, 655.0, 805.3, 151]),
        dict(name="u8b", dtype="uint8", scale=0.5, add_offset=-30, values=[-30, 0, 0.5, np.nan, 96.5, 10, 45]),
    ]
    m = write_grid(tmp_path / "g", "earth", "sparse", cols)
    blob = (tmp_path / "g.bin").read_bytes()
    assert [a["byte_offset"] % 4 for a in m["arrays"]] == [0, 0, 0, 0]
    assert m["arrays"][2]["byte_offset"] == 28 + 8  # 7*4 bytes of uint32, then 7 bytes of uint8 padded to 8
    # little-endian on disk regardless of host order
    a = m["arrays"][2]
    assert np.frombuffer(blob, dtype="<u2", count=n, offset=a["byte_offset"])[0] == 0
    assert np.frombuffer(blob, dtype="<u2", count=n, offset=a["byte_offset"])[2] == 65535  # NaN -> nodata
    g = read_grid(tmp_path / "g.json")
    assert g["cell_id"].dtype == np.int64 and g["cell_id"].tolist() == list(range(0, 7000, 1000))
    for c in cols[1:]:
        v = np.asarray(c["values"], dtype=float)
        nan = np.isnan(v)
        assert np.array_equal(np.isnan(g[c["name"]]), nan), c["name"]
        assert np.all(np.abs(g[c["name"]][~nan] - v[~nan]) <= c["scale"] / 2 + 1e-9), c["name"]


def test_quantize_reserves_nodata_and_clips():
    q = quantize(np.array([-1.0, 0.0, 2.0, np.nan]), "uint8", 0.004, 0)
    assert q.tolist() == [0, 0, 254, 255]  # out-of-range values are clipped (silently: see review H/M finding)


def test_quantize_infinite_is_clipped_not_nodata():
    """Documents current behaviour: +inf becomes the largest valid value, not nodata (review-01 L finding)."""
    assert quantize(np.array([np.inf]), "uint16", 1, 0).tolist() == [65534]


def test_manifest_records_little_endian_and_stats(tmp_path):
    m = write_grid(tmp_path / "g", "earth", "sparse",
                   [dict(name="x", dtype="uint16", scale=1, add_offset=0, values=np.arange(201.0))])
    assert m["byte_order"] == "little"
    st = m["arrays"][0]["stats"]
    assert st["p50"] == 100 and st["min"] == 0 and st["max"] == 200
    assert json.loads((tmp_path / "g.json").read_text())["arrays"][0]["nodata"] == 65535


@pytest.mark.parametrize("cols", [EARTH_COLUMNS, PLANET_COLUMNS])
def test_column_specs_are_encodable(cols):
    for name, _f, dtype, scale, off, _u in cols:
        assert dtype in NODATA
        if dtype.startswith("uint") and name != "cell_id":
            top = (np.iinfo(dtype).max - 1) * scale + off
            assert top > off and math.isfinite(top), name
