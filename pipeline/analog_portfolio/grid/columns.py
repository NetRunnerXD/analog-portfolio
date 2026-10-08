"""Column specs (quantization) for shipped grid binaries. Mirrors DATA_CONTRACT.md section 5.1."""
from __future__ import annotations

# name, factor, dtype, scale, add_offset, units
EARTH_COLUMNS: list[tuple[str, str | None, str, float, float, str]] = [
    ("cell_id", None, "uint32", 1, 0, "cell id (row*720+col)"),
    ("ts_mean_k", "F1", "uint16", 0.01, 150, "K"),
    ("dt_k", "F2", "uint16", 0.01, 0, "K"),
    ("ati", "F3", "uint16", 0.00001, 0, "1/K (apparent thermal inertia, Price 1977)"),
    ("ti_class", "F3", "uint8", 1, 0, "class 1-5"),
    ("slope_lt5_frac", "F4", "uint8", 0.004, 0, "fraction"),
    ("slope_lt8_frac", None, "uint8", 0.004, 0, "fraction"),
    ("slope_mean_deg", None, "uint8", 0.25, 0, "deg"),
    ("relief_m", "F5", "uint16", 1, 0, "m"),
    ("lith_class", "F6", "uint8", 1, 0, "lithology code"),
    ("aridity_index", "F7", "uint16", 0.0001, 0, "P/PET"),
    ("barren_frac", "F8", "uint8", 0.004, 0, "fraction"),
    ("ice_index", "F9", "uint8", 0.004, 0, "index 0-1"),
    ("noon_sun_elev_deg", "F10", "uint8", 0.5, -30, "deg"),
    ("column_mass_gcm2", "F11", "uint16", 0.1, 0, "g/cm^2"),
    ("cutoff_rigidity_gv", "F11", "uint8", 0.1, 0, "GV"),
    ("uv_index", "F12", "uint8", 0.1, 0, "UV index"),
    ("geomorph_flags", "F13", "uint8", 1, 0, "bitmask"),
    ("elevation_m", None, "uint16", 1, -500, "m"),
    ("albedo", None, "uint8", 0.004, 0, "fraction"),
    ("water_frac", None, "uint8", 0.004, 0, "fraction"),
    ("builtup_frac", None, "uint8", 0.004, 0, "fraction"),
    ("travel_time_min", None, "uint16", 1, 0, "minutes to nearest city >50k"),
    ("airport_km", None, "uint16", 1, 0, "km to nearest airport"),
]

PLANET_COLUMNS: list[tuple[str, str | None, str, float, float, str]] = [
    ("cell_id", None, "uint32", 1, 0, "cell id (sparse layout only)"),
    ("ts_mean_k", "F1", "uint16", 0.01, 0, "K"),
    ("dt_k", "F2", "uint16", 0.01, 0, "K"),
    ("ti_class", "F3", "uint8", 1, 0, "class 1-5"),
    ("slope_lt5_frac", "F4", "uint8", 0.004, 0, "fraction"),
    ("relief_m", "F5", "uint16", 1, 0, "m"),
    ("lith_class", "F6", "uint8", 1, 0, "lithology code"),
    ("ice_index", "F9", "uint8", 0.004, 0, "index 0-1"),
    ("noon_sun_elev_deg", "F10", "uint8", 0.5, -30, "deg"),
    ("column_mass_gcm2", "F11", "uint16", 0.01, 0, "g/cm^2"),
    ("geomorph_flags", "F13", "uint8", 1, 0, "bitmask"),
    ("elevation_m", None, "uint16", 1, -10000, "m"),
]
