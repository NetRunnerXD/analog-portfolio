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


GRID = obj({
    "resolution_deg": {"const": 0.5},
    "ncols": {"const": 720},
    "nrows": {"const": 360},
    "lon_centre_first": {"const": -179.75},
    "lat_centre_first": {"const": 89.75},
    "row_order": {"const": "north-to-south"},
})

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
}, title="Grid manifest (earth_features.json, moon_grid.json, mars_grid.json)")

FEATURE_VAL = obj({
    "value": nullable({"type": "number"}),
    "t_star": nullable({"type": "number"}),
    "gap": nullable({"type": "number", "minimum": 0}),
    "units": {"type": "string"},
    "source": {"type": "string"},
}, required=["value", "t_star", "gap"])

LIT = obj({"value": LIT_VALUE, "unit": {"type": "string"}, "citation_url": nullable(URL), "note": {"type": "string"}},
          required=["value", "unit", "citation_url"])

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
        "card": {"type": "object", "description": "Display-only attributes, never scored (illumination %, Earth visibility %, gravity, dose)"},
    }, required=["id", "name", "body", "role", "anchor", "sample_radius_km", "values"])},
}, required=["targets"], title="targets.json (Researcher input superset; shipped file adds features)")

SCHEMAS["profiles"] = obj({
    "contract_version": VERSION,
    "status": {"type": "string"},
    "defaults": {"type": "object"},
    "global_hard_filters": {"type": "array", "items": obj({"id": ID, "rule": {"type": "string"}, "reason": {"type": "string"}})},
    "profiles": {"type": "array", "minItems": 1, "items": obj({
        "id": PROFILE_ID, "code": {"type": "string", "pattern": "^P[0-9]+$"}, "name": {"type": "string"},
        "bodies": {"type": "array", "items": TARGET_BODY, "minItems": 1},
        "disabled_for": {"type": "object"},
        "weights": {"type": "object", "propertyNames": {"pattern": "^F([1-9]|10)$"},
                    "additionalProperties": {"type": "number", "minimum": 0}, "minProperties": 10, "maxProperties": 10},
        "theta": NUM01, "nms_radius_km": {"type": "number", "exclusiveMinimum": 0},
        "hard_filters": {"type": "array", "items": obj({"id": ID, "rule": {"type": "string"}, "reason": {"type": "string"}})},
        "campaigns": {"type": "array", "items": {"type": "string"}},
    }, required=["id", "code", "name", "bodies", "weights", "theta", "nms_radius_km", "hard_filters"])},
}, required=["contract_version", "defaults", "global_hard_filters", "profiles"], title="profiles.json")

SCORES = {"type": "object", "propertyNames": FACTOR_ID, "additionalProperties": nullable(NUM01)}
SITE_REF = obj({
    "site_id": ID, "name": {"type": "string"}, "lat": LAT, "lon": LON,
    "cell_id": {"type": "integer", "minimum": 0, "maximum": 259199},
    "score": NUM01, "score_core": NUM01, "earth_percentile": {"type": "number", "minimum": 0, "maximum": 100},
    "factor_scores": SCORES,
    "covers": {"type": "array", "items": FACTOR_ID},
    "gaps": {"type": "object", "propertyNames": FACTOR_ID, "additionalProperties": {"type": "number", "minimum": 0}},
    "robustness": obj({"median_rank": {"type": "number"}, "topk_freq": NUM01, "robust": {"type": "boolean"}}),
    "logistics": obj({"travel_time_min": nullable({"type": "number"}), "airport_km": nullable({"type": "number"}),
                      "nearest_airport": nullable({"type": "string"}), "cost": NUM01}),
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
    "variants": {"type": "array", "minItems": 1, "items": obj({
        "id": {"enum": ["fidelity", "balanced", "accessible", "single-continent"]},
        "lambda": {"type": "number", "minimum": 0},
        "sites": {"type": "array", "items": SITE_REF, "maxItems": 5},
        "coverage": NUM01,
    }, required=["id", "lambda", "sites", "coverage"])},
    "top_cells": {"type": "array", "items": SITE_REF, "description": "Top-ranked candidate pool after NMS (for map pins)"},
    "score_histogram": obj({"bins": {"type": "array", "items": {"type": "number"}},
                            "counts": {"type": "array", "items": {"type": "integer"}}}),
    "monte_carlo": obj({"draws": {"type": "integer"}, "top_k": {"type": "integer"}, "seed": {"type": "integer"}}),
}, required=["contract_version", "target_id", "profile_id", "weights", "theta", "universe", "uncoverable", "variants"],
   title="portfolios/<target_id>_<profile_id>.json")

SCHEMAS["validation"] = obj({
    "contract_version": VERSION, "mock": MOCK,
    "frozen_commit": nullable({"type": "string", "description": "git SHA of the pre-registration commit"}),
    "source": {"type": "string", "description": "Input CSV (docs/validation.csv)"},
    "summary": obj({"n_known": {"type": "integer"}, "n_negative": {"type": "integer"},
                    "n_evaluations": {"type": "integer"},
                    "pct_top5": NUM01, "pct_top1": NUM01, "rank_auc": nullable(NUM01)}),
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
        "results": {"type": "array", "items": obj({
            "target_id": TARGET_ID, "profile_id": PROFILE_ID,
            "percentile": {"type": "number", "minimum": 0, "maximum": 100},
            "in_top5": {"type": "boolean"}, "in_top1": {"type": "boolean"},
        })},
    }, required=["name", "lat", "lon", "body_analog", "mission_purposes", "why", "citation_url", "kind", "results"])},
    "new_candidates": {"type": "array", "items": SITE_REF},
}, required=["contract_version", "summary", "sites"], title="validation.json")

SCHEMAS["site"] = obj({
    "contract_version": VERSION, "mock": MOCK,
    "site_id": ID, "name": {"type": "string"}, "lat": LAT, "lon": LON,
    "cell_id": {"type": "integer", "minimum": 0, "maximum": 259199},
    "country": nullable({"type": "string"}),
    "summary": {"type": "string"},
    "known_analog": nullable({"type": "string"}),
    "earth_features": {"type": "object", "additionalProperties": nullable({"type": "number"})},
    "drilldown": {"type": "object", "description": "Copernicus 90 m window stats, Macrostrat units, SoilGrids, airport"},
    "best_for": {"type": "array", "items": obj({"target_id": TARGET_ID, "profile_id": PROFILE_ID, "score": NUM01, "rank": {"type": "integer"}})},
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
