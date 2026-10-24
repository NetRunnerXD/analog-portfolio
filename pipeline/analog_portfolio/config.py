"""Paths for the real-data pipeline (override with ANALOG_DATA)."""
from __future__ import annotations

import os
from pathlib import Path

DATA = Path(os.environ.get("ANALOG_DATA", "/workspace/space-apps-analog/data"))
RAW = DATA / "raw"
GRIDS = DATA / "grids"          # per-layer 0.5 deg NetCDF (Tech/API Explorer + P1 extras)
INTERIM = DATA / "interim"      # assembled feature cubes, target vectors, scores
PROV_TAE = GRIDS / "provenance.json"
PROV_P1 = GRIDS / "provenance_p1.json"
