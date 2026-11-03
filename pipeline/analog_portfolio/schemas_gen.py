"""Generate JSON Schemas (draft 2020-12) for every shipped asset in DATA_CONTRACT.md.

Run: python -m analog_portfolio.schemas_gen  (writes ../contract/schemas/*.schema.json)
The generated files are committed; tests check they are up to date.
"""
from __future__ import annotations

import json
from pathlib import Path

D = "https://json-schema.org/draft/2020-12/schema"
BASE = "https://github.com/NetRunnerXD/analog-portfolio/contract/schemas/"
FACTOR_ID = {"type": "string", "pattern": "^F([1-9]|1[0-3])$"}
BODY = {"enum": ["earth", "moon", "mars"]}
TARGET_BODY = {"enum": ["moon", "mars"]}
NUM01 = {"type": "number", "minimum": 0, "maximum": 1}
LAT = {"type": "number", "minimum": -90, "maximum": 90}
LON = {"type": "number", "minimum": -180, "maximum": 180}
ID = {"type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]*$"}
TARGET_ID = {"type": "string", "pattern": "^(moon|mars)_[a-z0-9_]+$"}
PROFILE_ID = {"type": "string", "pattern": "^P[1-9]_[a-z0-9_]+$"}
URL = {"type": "string", "pattern": "^https?://"}
LIT_VALUE = {"anyOf": [{"type": "number"}, {"type": "string"}, {"type": "null"}, {"type": "array", "items": {"type": ["number", "string"]}}]}
MOCK = {"type": "boolean", "description": "true for mock/demo data that is not derived from real layers"}
VERSION = {"type": "string", "pattern": r"^\d+\.\d+\.\d+$"}


def obj(props: dict, required: list[str] | None = None, extra: bool = False, **kw) -> dict:
    o = {"type": "object", "properties": props, "additionalProperties": extra}
    if required is None:
        required = list(props)
    if required:
        o["required"] = required
    o.update(kw)
    return o


def nullable(s: dict) -> dict:
    return {"anyOf": [s, {"type": "null"}]}


GRID = {"anyOf": [obj({
    "resolution_deg": {"const": 0.5},
    "ncols": {"const": 720},
    "nrows": {"const": 360},
    "lon_centre_first": {"const": -179.75},
    "lat_centre_first": {"const": 89.75},
    "row_order": {"const": "north-to-south"},
}), obj({
    "resolution_deg": {"const": 1.0},
    "ncols": {"const": 360},
    "nrows": {"const": 180},
    "lon_centre_first": {"const": -179.5},
    "lat_centre_first": {"const": 89.5},
    "row_order": {"const": "north-to-south"},
}, description="1 deg global grid for Moon/Mars (contract v1.2): cell index = row*360 + col")]}

ARRAY = obj({
    "name": {"type": "string", "pattern": "^[a-z0-9_]+$"},
    "factor": nullable(FACTOR_ID),
    "dtype": {"enum": ["uint8", "uint16", "uint32", "int16", "float32"]},
    "byte_offset": {"type": "integer", "minimum": 0},
    "length": {"type": "integer", "minimum": 0},
    "scale": {"type": "number"},
    "add_offset": {"type": "number"},
    "nodata": nullable({"type": "number"}),
    "units": {"type": "string"},
    "stats": nullable(obj({
        "p005": {"type": "number"}, "p50": {"type": "number"}, "p995": {"type": "number"},
        "min": {"type": "number"}, "max": {"type": "number"},
    })),
    "source": {"type": "string"},
    "codes": {"type": "object", "additionalProperties": {"type": "string"},
              "description": "Categorical code table (raw value -> label), e.g. continent"},
    "codes_note": {"type": "string", "description": "How the codes were assigned (e.g. Russia split at 60E)"},
}, required=["name", "factor", "dtype", "byte_offset", "length", "scale", "add_offset", "nodata", "units"])

SCHEMAS: dict[str, dict] = {}

SCHEMAS["grid_manifest"] = obj({
    "contract_version": VERSION,
    "body": BODY,
    "mock": MOCK,
    "grid": GRID,
    "layout": {"enum": ["sparse", "dense"],
               "description": "sparse: a cell_id uint32 array lists the cells; dense: all 259200 cells in cell_id order"},
    "n_cells": {"type": "integer", "minimum": 1},
    "binary": {"type": "string", "pattern": r"^[a-z0-9_]+\.bin$"},
    "byte_order": {"const": "little"},
    "arrays": {"type": "array", "items": ARRAY, "minItems": 1},
    "generated_at": {"type": "string"},
    "subset": {"type": "string", "description": "Which cells a sparse grid holds, e.g. Moon polar |lat| >= 60 deg"},
    "companions": {"type": "array", "items": {"type": "string"}, "description": "Other manifests for the same body"},
}, required=["contract_version", "body", "mock", "grid", "layout", "n_cells", "binary", "byte_order", "arrays", "generated_at"],
   title="Grid manifest (earth_features.json, moon_grid.json, mars_grid.json)")

FEATURE_VAL = obj({
    "value": nullable({"type": "number"}),
    "t_star": nullable({"type": "number"}),
    "gap": nullable({"type": "number", "minimum": 0}),
    "units": {"type": "string"},
    "source": {"type": "string"},
}, required=["value", "t_star", "gap"])

LIT = obj({"value": LIT_VALUE, "unit": {"type": "string"}, "citation_url": nullable(URL), "note": {"type": "string"}},
          required=["value", "unit", "citation_url"])

EXTREME = obj({"value": {"type": "number"}, "cell_id": {"type": "integer", "minimum": 0, "maximum": 259199},
               "lat": LAT, "lon": LON}, required=["value", "cell_id", "lat", "lon"])
EARTH_STAT = obj({"units": {"type": "string"}, "min": EXTREME, "max": EXTREME,
                  "p0_5": {"type": "number"}, "p50": {"type": "number"}, "p99_5": {"type": "number"}},
                 required=["units", "min", "max", "p0_5", "p99_5"])
EARTH_REF = obj({
    "label": {"type": "string", "description": "UI source label, e.g. 'From our 0.5 deg Earth grid (NASA POWER ...)'"},
    "source": {"type": "string"}, "grid": {"type": "string"},
    "area_weighting": {"const": "cos_lat"},
    "n_land_cells": {"type": "integer", "minimum": 0},
    "land_area_km2": {"type": "number", "minimum": 0},
    "stats": {"type": "object", "properties": {"ts_mean_k": EARTH_STAT, "dt_k": EARTH_STAT},
              "additionalProperties": EARTH_STAT, "required": ["ts_mean_k", "dt_k"]},
}, required=["label", "source", "area_weighting", "n_land_cells", "stats"],
   description="Earth land extremes from our own grid for the gap panel (coldest 0.5 deg land-cell mean surface temperature, largest diurnal swing) and the clip quantiles")

SCHEMAS["targets"] = obj({
    "_schema": {"type": "string"},
    "version": {"type": "string"},
    "generated": {"type": "string"},
    "contract_version": VERSION,
    "mock": MOCK,
    "body_context": {"type": "object", "properties": {"moon": {"type": "object"}, "mars": {"type": "object"}},
                     "additionalProperties": {"type": "object", "additionalProperties": LIT}},
    "targets": {"type": "array", "minItems": 1, "items": obj({
        # --- Researcher fields (pipeline/inputs/targets.json) ---
        "id": TARGET_ID,
        "name": {"type": "string"},
        "short_name": {"type": "string", "description": "UI context-pill name (contract/target_priors.json)"},
        "description": {"type": "string", "description": "Fact-checked one-line UI meta (spec v0.3 TARGET_META)"},
        "body": TARGET_BODY,
        "role": {"type": "string"},
        "anchor": obj({"lat": LAT, "lon": LON, "lon_convention": {"const": "east-positive, -180..180"},
                       "source_url": URL, "note": {"type": "string"}}, required=["lat", "lon", "source_url"]),
        "sample_radius_km": {"type": "number", "exclusiveMinimum": 0},
        "values": {"type": "object", "additionalProperties": LIT,
                   "description": "Literature values (temperature_range, illumination, slope, thermal_inertia, ice, elevation, radiation). null = sample in pipeline."},
        "context_values": {"type": "object", "description": "Nearby or card-only facts; never scored as the target's value"},
        # --- Engine fields (added by the pipeline / mock exporter) ---
        "status": {"enum": ["artemis-9", "moon-base-i", "mission-site", "starship-candidate", "ground-truth", "optional"]},
        "window_offset": nullable(obj({"bearing_deg": {"type": "number"}, "distance_km": {"type": "number"}})),
        "citations": {"type": "array", "items": {"type": "string", "pattern": "^R[0-9]+[a-z]?$"}},
        "features": {"type": "object", "propertyNames": FACTOR_ID, "additionalProperties": FEATURE_VAL},
        "dropped_factors": {"type": "array", "items": FACTOR_ID,
                            "description": "Target-dependent factors still null after pipeline sampling: dropped for this target, weights renormalised (DATA_CONTRACT 3.2 item 5)"},
        "card": {"type": "object", "description": "Display-only attributes, never scored (illumination %, Earth visibility %, gravity, dose)"},
    }, required=["id", "name", "body", "role", "anchor", "sample_radius_km", "values"])},
    "earth_reference": nullable(EARTH_REF),
    "scoring_constants": {"type": "object", "description": "Full-precision Earth constants for the browser rescorer "
                          "(earth_clip P0.5/P99.5, F1/F2 range_norm P1/P99, gate inputs); contract v1.2",
                          "properties": {"earth_clip": {"type": "object"}, "range_norm": {"type": "object"},
                                         "gates": {"type": "object"}}},
}, required=["targets"], title="targets.json (Researcher input superset; shipped file adds features)")

FILTER = obj({"id": ID, "rule": {"type": "string"}, "reason": {"type": "string"},
              "ui_short": {"type": "string", "description": "Legend fragment, e.g. 'mostly water'"},
              "ui_tooltip": {"type": "string", "description": "Tooltip text after 'Filtered out: '"}},
             required=["id", "rule", "reason"])
VARIANT_ID = {"enum": ["best_match", "easiest_to_reach", "one_continent"]}

SCHEMAS["profiles"] = obj({
    "contract_version": VERSION,
    "status": {"type": "string"},
    "defaults": obj({
        "theta": NUM01, "nms_radius_km": {"type": "number"}, "candidates_top_n_per_factor": {"type": "integer"},
        "candidate_min_score": {"type": "string"}, "portfolio_max_sites": {"type": "integer"},
        "variants": {"type": "array", "minItems": 3, "maxItems": 3, "items": obj({
            "id": VARIANT_ID, "display_name": {"type": "string"}, "pool_filter": nullable({"type": "string"}),
            "help": {"type": "string"}, "unavailable_reason": {"type": "string"}, "source": {"type": "string"}},
            required=["id", "display_name", "pool_filter"])},
        "monte_carlo": obj({"draws": {"type": "integer", "minimum": 1}, "dirichlet_alpha_scale": {"type": "number"},
                            "robust_top_frac": NUM01, "robust_min_freq": NUM01, "area_weighting": {"const": "cos_lat"},
                            "rule": {"type": "string"}, "seed": {"type": "integer"},
                            "alpha_rule": {"type": "string"}},
                           required=["draws", "dirichlet_alpha_scale", "robust_top_frac", "robust_min_freq", "seed"]),
        "secondary_factors": {"type": "array", "items": FACTOR_ID},
        "percentiles": {"type": "string"}, "nms_distance": {"type": "string"},
        "missing_data": obj({"earth_nan": {"type": "string"}, "min_active_weight_frac": NUM01,
                             "below_min": {"type": "string"}, "target_null": {"type": "string"}},
                            required=["min_active_weight_frac"]),
        "ties": {"type": "object"},
        "candidate_gates": {"type": "object", "description": "Body-level portfolio-candidate gates (contract v1.2)"},
    }, required=["theta", "nms_radius_km", "portfolio_max_sites", "variants", "monte_carlo"]),
    "global_hard_filters": {"type": "array", "items": FILTER},
    "profiles": {"type": "array", "minItems": 1, "items": obj({
        "id": PROFILE_ID, "code": {"type": "string", "pattern": "^P[0-9]+$"}, "name": {"type": "string"},
        "display_name": {"type": "string", "description": "UI purpose name (spec v0.3 PURPOSE_UI)"},
        "display_short": {"type": "string"},
        "bodies": {"type": "array", "items": TARGET_BODY, "minItems": 1},
        "disabled_for": {"type": "object"},
        "weights": {"type": "object", "propertyNames": {"pattern": "^F([1-9]|10)$"},
                    "additionalProperties": {"type": "number", "minimum": 0}, "minProperties": 10, "maxProperties": 10},
        "theta": NUM01, "nms_radius_km": {"type": "number", "exclusiveMinimum": 0},
        "hard_filters": {"type": "array", "items": FILTER},
        "campaigns": {"type": "array", "items": {"type": "string"}},
    }, required=["id", "code", "name", "display_name", "bodies", "weights", "theta", "nms_radius_km", "hard_filters"])},
}, required=["contract_version", "defaults", "global_hard_filters", "profiles"], title="profiles.json")

SCORES = {"type": "object", "propertyNames": FACTOR_ID, "additionalProperties": nullable(NUM01)}
SITE_REF = obj({
    "site_id": ID, "name": {"type": "string"}, "lat": LAT, "lon": LON,
    "cell_id": {"type": "integer", "minimum": 0, "maximum": 259199},
    "score": NUM01, "score_core": NUM01, "earth_percentile": {"type": "number", "minimum": 0, "maximum": 100},
    "factor_scores": SCORES,
    "covers": {"type": "array", "items": FACTOR_ID},
    "gaps": {"type": "object", "propertyNames": FACTOR_ID, "additionalProperties": {"type": "number", "minimum": 0}},
    "data_coverage": {**NUM01, "description": "Share of the active profile weight with Earth data in this cell (scored only if >= 0.7, DATA_CONTRACT 3.2 item 6)"},
    "robustness": nullable(obj({"top5_freq": NUM01, "robust": {"type": "boolean"},
                                "median_percentile": {"type": "number", "minimum": 0, "maximum": 100}},
                               required=["top5_freq", "robust"],
                               description="Share of MC draws in which the cell is in the top 5% of land (area-weighted); robust = top5_freq >= 0.8")),
    "logistics": obj({"travel_time_min": nullable({"type": "number"}), "within_6h": nullable({"type": "boolean"}),
                      "continent": nullable({"type": "string"}), "airport_km": nullable({"type": "number"})}),
    "country": nullable({"type": "string", "description": "Natural Earth admin-0 NAME"}),
    "admin1": nullable({"type": "string", "description": "Natural Earth admin-1 (state/province) name"}),
    "known_analog": nullable({"type": "string"}),
    "candidate": {"type": "boolean", "description": "true = new candidate (>300 km from any known analog), needs field confirmation"},
}, required=["site_id", "name", "lat", "lon", "cell_id", "score", "factor_scores", "covers"])

SCHEMAS["portfolio"] = obj({
    "contract_version": VERSION, "mock": MOCK,
    "target_id": TARGET_ID, "profile_id": PROFILE_ID,
    "weights": {"type": "object", "additionalProperties": {"type": "number"}},
    "theta": NUM01,
    "universe": {"type": "array", "items": FACTOR_ID},
    "uncoverable": {"type": "array", "items": FACTOR_ID},
    "dropped_factors": {"type": "array", "items": FACTOR_ID,
                        "description": "Weighted core factors with no target value (e.g. F3 for polar Moon targets); weights renormalised"},
    "insufficient_cells": {"type": "integer", "minimum": 0,
                           "description": "Earth cells flagged insufficient_data (< 70% of the active weight present): excluded from ranking, thresholds, pool and robustness"},
    "variants": {"type": "array", "minItems": 1, "items": obj({
        "id": VARIANT_ID,
        "available": {"type": "boolean"},
        "unavailable_reason": nullable({"type": "string"}),
        "continent": nullable({"type": "string"}),
        "pool_size": {"type": "integer", "minimum": 0},
        "sites": {"type": "array", "items": SITE_REF, "maxItems": 5},
        "covers": {"type": "array", "items": FACTOR_ID},
        "coverage": NUM01,
    }, required=["id", "available", "sites", "coverage"])},
    "top_cells": {"type": "array", "items": SITE_REF, "description": "Top-ranked candidate pool after NMS (for map pins)"},
    "score_histogram": obj({"bins": {"type": "array", "items": {"type": "number"}},
                            "counts": {"type": "array", "items": {"type": "integer"}}}),
    "monte_carlo": obj({"draws": {"type": "integer"}, "robust_top_frac": NUM01, "robust_min_freq": NUM01,
                        "seed": {"type": "integer"}, "area_weighting": {"const": "cos_lat"}},
                       required=["draws", "robust_top_frac", "robust_min_freq", "seed"]),
    "earth_thresholds": obj({"top5": NUM01, "top1": NUM01, "median": NUM01},
                            description="Area-weighted land quantiles of S (default weights): P95, P99, P50"),
}, required=["contract_version", "target_id", "profile_id", "weights", "theta", "universe", "uncoverable", "variants"],
   title="portfolios/<target_id>_<profile_id>.json")

SCHEMAS["validation"] = obj({
    "contract_version": VERSION, "mock": MOCK,
    "frozen_commit": nullable({"type": "string", "description": "git SHA of the pre-registration commit"}),
    "source": {"type": "string", "description": "Input CSV (docs/validation.csv)"},
    "summary": obj({"n_known": {"type": "integer"}, "n_negative": {"type": "integer"},
                    "n_evaluations": {"type": "integer"},
                    "pct_top5": NUM01, "pct_top1": NUM01, "rank_auc": nullable(NUM01),
                    "n_scored": {"type": "integer", "description": "Positive evaluations that passed every filter and the gate"},
                    **{k: obj({"sites": {"type": "array", "items": {"type": "string"}}, "n_evaluations": {"type": "integer"}},
                              required=["sites", "n_evaluations"])
                       for k in ("gate_excluded", "land_filter_excluded", "hard_filter_excluded")},
                    "denominators_note": {"type": "string"},
                    "headline_caveat": {"type": "string", "description": "Pooled headline mixes blind (Moon) and post-hoc (Mars) evaluations"},
                    "by_body": obj({b: obj({"n_evaluations": {"type": "integer"}, "n_scored": {"type": "integer"},
                                            "pct_top5": NUM01, "pct_top1": NUM01, "rank_auc": nullable(NUM01),
                                            "blind": {"type": "boolean"}, "note": {"type": "string"}})
                                    for b in ("moon", "mars")}, required=[])},
                   required=["n_known", "n_negative", "n_evaluations", "pct_top5", "pct_top1", "rank_auc"]),
    "sites": {"type": "array", "items": obj({
        # --- columns of docs/validation.csv (Researcher) ---
        "name": {"type": "string"}, "lat": LAT, "lon": LON,
        "body_analog": {"enum": ["moon", "mars", "both", "none"]},
        "mission_purposes": {"type": "array", "items": PROFILE_ID,
                             "description": "CSV column split on ';' ('none' -> [])"},
        "why": {"type": "string"}, "citation_url": URL,
        # --- engine results ---
        "kind": {"enum": ["positive", "negative"], "description": "negative iff body_analog == 'none'"},
        "cell_id": {"type": "integer", "minimum": 0, "maximum": 259199},
        "eval_cell_id": {"type": "integer", "minimum": 0, "maximum": 259199,
                         "description": "Cell actually scored: the site's own cell, or the nearest >= 50% land cell within 1 cell"},
        "snapped": {"type": "boolean"},
        "snap_km": nullable({"type": "number", "minimum": 0, "description": "Great-circle km from the site to the snapped cell centre"}),
        "results": {"type": "array", "items": obj({
            "target_id": TARGET_ID, "profile_id": PROFILE_ID,
            "percentile": {"type": "number", "minimum": 0, "maximum": 100},
            "in_top5": {"type": "boolean"}, "in_top1": {"type": "boolean"},
            "status": {"enum": ["scored", "gate_excluded", "land_filter_excluded", "hard_filter_excluded", "insufficient_data"],
                       "description": "scored = passed land/built-up, profile hard filters and the body gate; excluded "
                                      "evaluations stay in the denominators as misses"},
        }, required=["target_id", "profile_id", "percentile", "in_top5", "in_top1"])},
    }, required=["name", "lat", "lon", "body_analog", "mission_purposes", "why", "citation_url", "kind", "results"])},
    "new_candidates": {"type": "array", "items": SITE_REF},
    "method": {"type": "string", "description": "Validation method notes (snapping, percentiles, gates)"},
}, required=["contract_version", "summary", "sites"], title="validation.json")

SCHEMAS["site"] = obj({
    "contract_version": VERSION, "mock": MOCK,
    "site_id": ID, "name": {"type": "string"}, "lat": LAT, "lon": LON,
    "cell_id": {"type": "integer", "minimum": 0, "maximum": 259199},
    "country": nullable({"type": "string"}),
    "admin1": nullable({"type": "string", "description": "Natural Earth admin-1 (state/province) name"}),
    "continent": nullable({"type": "string"}),
    "summary": {"type": "string"},
    "known_analog": nullable({"type": "string"}),
    "earth_features": {"type": "object", "additionalProperties": nullable({"type": "number"})},
    "drilldown": {"type": "object", "description": "Copernicus 90 m window stats, Macrostrat units, SoilGrids, airport"},
    "best_for": {"type": "array", "items": obj({"target_id": TARGET_ID, "profile_id": PROFILE_ID, "variant": VARIANT_ID, "score": NUM01, "rank": {"type": "integer"},
                                                "percentile": {"type": "number", "minimum": 0, "maximum": 100},
                                                "top5_freq": nullable(NUM01), "robust": {"type": "boolean"}})},
    "citations": {"type": "array", "items": {"type": "string"}},
    "attribution": {"type": "array", "items": {"type": "string"}},
}, required=["contract_version", "site_id", "name", "lat", "lon", "cell_id", "summary"], title="sites/<site_id>.json")

GAP = obj({
    "id": {"type": "string", "pattern": "^[a-z0-9_]+$"},
    "label": {"type": "string"},
    "factors": {"type": "array", "minItems": 1,
                "items": {"anyOf": [FACTOR_ID, {"const": "not_scored"}]}},
    "values": obj({"moon": LIT_VALUE, "mars": LIT_VALUE, "earth": LIT_VALUE, "unit": {"type": "string"},
                   "source_urls": {"type": "array", "items": URL}, "derived": {"type": "string"}},
                  required=["unit", "source_urls"]),
    "facility_types": {"type": "array", "items": {"type": "string", "pattern": "^[a-z0-9_]+$"}},
    "example_facilities": {"type": "array", "items": {"type": "string", "pattern": "^[a-z0-9_]+$"}},
    "handling": {"type": "string"},
    "citation_urls": {"type": "array", "items": URL},
    "note": {"type": "string"},
}, required=["id", "label", "factors", "values", "facility_types", "example_facilities", "handling", "citation_urls"])
TIER = obj({"description": {"type": "string"}, "gaps": {"type": "array", "items": GAP}})

SCHEMAS["gaps"] = obj({
    "_schema": {"type": "string"},
    "version": {"type": "string"},
    "generated": {"type": "string"},
    "contract_version": VERSION, "mock": MOCK,
    "tiers": obj({"never_on_earth": TIER, "beyond_earth_range": TIER, "coverable": TIER}),
    "caveats": {"type": "array", "items": obj({"id": {"type": "string", "pattern": "^[a-z0-9_]+$"},
                                                 "factors": {"type": "array", "items": FACTOR_ID},
                                                 "text": {"type": "string"}}),
                "description": "Pipeline caveats shown with the Fidelity Gap panel (known limitations)"},
    "facilities": {"type": "object", "propertyNames": {"pattern": "^[a-z0-9_]+$"}, "additionalProperties": obj({
        "name": {"type": "string"}, "type": {"type": "string"}, "operator": {"type": "string"},
        "location": {"type": "string"}, "provides": {"type": "string"}, "url": URL, "url_alt": URL,
    }, required=["name", "type", "operator", "location", "provides", "url"])},
}, required=["tiers", "facilities"], title="gaps.json (Researcher file, shipped verbatim)")

SCHEMAS["provenance"] = obj({
    "contract_version": VERSION, "mock": MOCK,
    "layers": {"type": "array", "items": obj({
        "id": ID, "body": BODY, "factors": {"type": "array", "items": FACTOR_ID},
        "dataset": {"type": "string"}, "provider": {"type": "string"},
        "agency_group": {"enum": ["nasa", "partner", "other"]},
        "url": {"type": "string"}, "version": {"type": "string"}, "accessed": {"type": "string"},
        "native_resolution": {"type": "string"}, "license": {"type": "string"},
        "citation": {"type": "string"}, "sha256": nullable({"type": "string"}), "how_used": {"type": "string"},
        "slope_baseline_m": nullable({"type": "number"}),
    }, required=["id", "body", "factors", "dataset", "provider", "agency_group", "url", "license", "how_used"])},
    "pipeline": obj({"git_sha": nullable({"type": "string"}), "run_at": {"type": "string"},
                     "git_dirty": nullable({"type": "boolean", "description": "Uncommitted tracked changes outside web/public/data at run start"}),
                     "python": {"type": "string"}}, required=[]),
}, required=["contract_version", "layers"], title="provenance.json")


def main() -> None:
    out = Path(__file__).resolve().parents[2] / "contract" / "schemas"
    out.mkdir(parents=True, exist_ok=True)
    for name, schema in SCHEMAS.items():
        s = {"$schema": D, "$id": BASE + f"{name}.schema.json", **schema}
        (out / f"{name}.schema.json").write_text(json.dumps(s, indent=2) + "\n")
    print(f"wrote {len(SCHEMAS)} schemas to {out}")


if __name__ == "__main__":
    main()
