"""Quantized little-endian column store used by earth_features.bin / moon_grid.bin / mars_grid.bin.

Layout: arrays are concatenated in manifest order, each starting at a 4-byte aligned byte_offset.
physical = raw * scale + add_offset; raw == nodata means missing.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from .. import CONTRACT_VERSION

NODATA = {"uint8": 255, "uint16": 65535, "uint32": None, "int16": -32768, "float32": None}


def quantize(values: np.ndarray, dtype: str, scale: float, add_offset: float) -> np.ndarray:
    nd = NODATA[dtype]
    if dtype == "float32" or (scale == 1 and add_offset == 0 and dtype == "uint32"):
        return np.asarray(values, dtype=dtype)
    v = np.asarray(values, dtype="float64")
    raw = np.round((v - add_offset) / scale)
    info = np.iinfo(dtype)
    hi = info.max - 1 if nd == info.max else info.max
    lo = info.min + 1 if nd == info.min else info.min
    raw = np.clip(raw, lo, hi)
    if nd is not None:
        raw = np.where(np.isnan(v), nd, raw)
    return raw.astype(dtype)


GRID_05 = {"resolution_deg": 0.5, "ncols": 720, "nrows": 360, "lon_centre_first": -179.75, "lat_centre_first": 89.75,
           "row_order": "north-to-south"}
GRID_1 = {"resolution_deg": 1.0, "ncols": 360, "nrows": 180, "lon_centre_first": -179.5, "lat_centre_first": 89.5,
          "row_order": "north-to-south"}


def write_grid(path_stem: Path, body: str, layout: str, columns: list[dict], mock: bool = False,
               grid: dict | None = None, extra: dict | None = None) -> dict:
    """columns: [{name, factor, dtype, scale, add_offset, units, values, source?}] -> writes .bin + .json."""
    buf = bytearray()
    arrays = []
    n = None
    for c in columns:
        raw = quantize(np.asarray(c["values"]), c["dtype"], c.get("scale", 1.0), c.get("add_offset", 0.0))
        n = len(raw) if n is None else n
        if len(raw) != n:
            raise ValueError(f"column {c['name']} length {len(raw)} != {n}")
        while len(buf) % 4:
            buf.append(0)
        off = len(buf)
        buf += raw.astype(raw.dtype.newbyteorder("<")).tobytes()
        phys = np.asarray(c["values"], dtype="float64")
        finite = phys[np.isfinite(phys)]
        stats = None
        if c["name"] != "cell_id" and finite.size:
            stats = {k: float(v) for k, v in zip(
                ["p005", "p50", "p995", "min", "max"],
                [*np.percentile(finite, [0.5, 50, 99.5]), finite.min(), finite.max()])}
        arrays.append({
            "name": c["name"], "factor": c.get("factor"), "dtype": c["dtype"], "byte_offset": off,
            "length": int(n), "scale": c.get("scale", 1.0), "add_offset": c.get("add_offset", 0.0),
            "nodata": NODATA[c["dtype"]], "units": c.get("units", ""), "stats": stats,
            "source": c.get("source", ""),
        })
        if c.get("codes"):
            arrays[-1]["codes"] = {str(k): v for k, v in c["codes"].items()}
        if c.get("codes_note"):
            arrays[-1]["codes_note"] = c["codes_note"]
    manifest = {
        "contract_version": CONTRACT_VERSION, "body": body, "mock": mock,
        "grid": dict(grid or GRID_05),
        "layout": layout, "n_cells": int(n), "binary": path_stem.name + ".bin", "byte_order": "little",
        "arrays": arrays, "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    if extra:
        manifest.update(extra)
    path_stem.parent.mkdir(parents=True, exist_ok=True)
    path_stem.with_suffix(".bin").write_bytes(bytes(buf))
    path_stem.with_suffix(".json").write_text(json.dumps(manifest, indent=1) + "\n")
    return manifest


def read_grid(manifest_path: Path) -> dict[str, np.ndarray]:
    m = json.loads(Path(manifest_path).read_text())
    blob = (Path(manifest_path).parent / m["binary"]).read_bytes()
    out = {}
    for a in m["arrays"]:
        dt = np.dtype(a["dtype"]).newbyteorder("<")
        raw = np.frombuffer(blob, dtype=dt, count=a["length"], offset=a["byte_offset"])
        if a["name"] == "cell_id":
            out[a["name"]] = raw.astype("int64")
            continue
        phys = raw.astype("float64") * a["scale"] + a["add_offset"]
        if a["nodata"] is not None:
            phys[raw == a["nodata"]] = np.nan
        out[a["name"]] = phys
    return out
