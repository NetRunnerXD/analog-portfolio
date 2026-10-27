"""Body-level candidate gates (contract v1.2, profiles.json defaults.candidate_gates).

Mars gate (Researcher, docs/research.md §8): after the land and built-up filters a cell passes if ANY of
  A  aridity_index <= ai_max                                   (arid / hyper-arid)
  B  barren_frac >= f8_min                                     (bare ground + snow/ice, fraction of land)
  C  permafrost_frac >= pf_min AND barren_frac + moss_lichen_frac >= f8_moss_min   (polar / cold desert)
  D  (geomorph_flags & d_flag_mask) AND (aridity_index <= d_ai_max OR barren_frac >= d_f8_min)
     (impact = bit 1 or Holocene volcanic = bit 64; NOT massif)
Missing values: AI NaN fails A/D-AI, other NaN read as 0.
"""
from __future__ import annotations

import numpy as np


def _col(earth: dict, k: str, fill: float) -> np.ndarray:
    a = earth.get(k)
    if a is None:
        return np.full(len(earth["cell_id"]), fill)
    return np.nan_to_num(np.asarray(a, dtype="float64"), nan=fill)


def gate_clauses(earth: dict, g: dict) -> dict[str, np.ndarray]:
    ai = _col(earth, "aridity_index", 9.0)
    f8 = _col(earth, "barren_frac", 0.0)
    pf = _col(earth, "permafrost_frac", 0.0)
    mo = _col(earth, "moss_lichen_frac", 0.0)
    fl = _col(earth, "geomorph_flags", 0.0).astype("int64")
    return dict(
        A=ai <= g["ai_max"],
        B=f8 >= g["f8_min"],
        C=(pf >= g["pf_min"]) & (f8 + mo >= g["f8_moss_min"]),
        D=((fl & g["d_flag_mask"]) != 0) & ((ai <= g["d_ai_max"]) | (f8 >= g["d_f8_min"])),
    )


def candidate_gate(earth: dict, body: str, profiles: dict) -> np.ndarray:
    """True = the cell passes the body's gate (always True for bodies without a gate)."""
    g = profiles["defaults"].get("candidate_gates", {}).get(body)
    if not g:
        return np.ones(len(earth["cell_id"]), bool)
    c = gate_clauses(earth, g)
    return c["A"] | c["B"] | c["C"] | c["D"]
