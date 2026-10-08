"""Stage 2: per-layer extraction to per-body 0.5 deg NetCDF in contract units.

Derivatives (slope, dT, PSR fraction) are computed at native resolution, then aggregated.
Moon/Mars target vectors come from native-resolution windows around anchors (targets.seed.json).
"""

def run(body: str, layer: str | None = None) -> None:  # pragma: no cover - stub
    raise NotImplementedError("extract.run: implemented per layer in Phase B")
