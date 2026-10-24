"""NetCDF read/write for 0.5 deg layer grids (same layout as data/scripts/gridlib.py) + P1 provenance."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
from pathlib import Path

import numpy as np

from ..config import GRIDS, PROV_P1
from . import lat_centres, lon_centres


def read_var(path: Path | str, var: str) -> np.ndarray:
    import netCDF4

    with netCDF4.Dataset(str(path)) as d:
        a = d[var][:]
        a = a.filled(np.nan) if hasattr(a, "filled") else np.asarray(a)
        lat = d["lat"][:]
    a = np.asarray(a, dtype="float64")
    if lat[0] < lat[-1]:  # enforce north-to-south
        a = a[::-1]
    assert a.shape == (360, 720), (path, var, a.shape)
    return a


def write_layer(name: str, body: str, variables: dict[str, tuple[np.ndarray, dict]], title: str) -> Path:
    import netCDF4

    path = GRIDS / f"{name}.nc"
    tmp = path.with_suffix(".nc.tmp")
    with netCDF4.Dataset(str(tmp), "w") as nc:
        nc.Conventions = "CF-1.8"
        nc.title = title
        nc.body = body
        nc.contract_version = "1.0.0"
        nc.history = f"{dt.datetime.now().isoformat(timespec='seconds')} created by analog_portfolio (Project 1)"
        nc.createDimension("lat", 360)
        nc.createDimension("lon", 720)
        la = nc.createVariable("lat", "f8", ("lat",)); la[:] = lat_centres(); la.units = "degrees_north"
        lo = nc.createVariable("lon", "f8", ("lon",)); lo[:] = lon_centres(); lo.units = "degrees_east"
        for k, (arr, attrs) in variables.items():
            v = nc.createVariable(k, "f4", ("lat", "lon"), zlib=True, fill_value=np.float32(np.nan))
            v[:] = arr.astype("float32")
            for a, val in attrs.items():
                if val is not None:
                    setattr(v, a, val)
    tmp.replace(path)
    return path


def sha256(path: Path | str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 22), b""):
            h.update(b)
    return h.hexdigest()


def add_provenance(layer_id: str, entry: dict) -> None:
    PROV_P1.parent.mkdir(parents=True, exist_ok=True)
    doc = json.loads(PROV_P1.read_text()) if PROV_P1.exists() else {"contract_version": "1.0.0", "layers": {}}
    entry = dict(entry, access_date=dt.date.today().isoformat(), producer="Project 1 (analog_portfolio)")
    doc["layers"][layer_id] = entry
    PROV_P1.write_text(json.dumps(doc, indent=1) + "\n")
