"""Contract tests: schemas validate the mock assets, profiles are sane, targets complete."""
import csv
import json

import jsonschema
import pytest

from analog_portfolio import schemas_gen
from analog_portfolio.contract import CONTRACT_DIR, REPO_ROOT, WEB_DATA_DIR, load, schema
from analog_portfolio.grid.binary import read_grid

MOCK = WEB_DATA_DIR / "mock"
INPUTS = REPO_ROOT / "pipeline" / "inputs"


def validate(name: str, path):
    jsonschema.validate(json.loads(path.read_text()), schema(name))


def test_schemas_up_to_date():
    for name, s in schemas_gen.SCHEMAS.items():
        on_disk = json.loads((CONTRACT_DIR / "schemas" / f"{name}.schema.json").read_text())
        assert on_disk["properties"] == s["properties"], f"regenerate schemas: {name}"


def test_profiles():
    p = load("profiles")
    jsonschema.validate(p, schema("profiles"))
    assert [x["code"] for x in p["profiles"]] == ["P1", "P2", "P3", "P4", "P5"]
    for prof in p["profiles"]:
        assert sum(prof["weights"].values()) == 100, prof["id"]
    assert [x["id"] for x in p["profiles"]] == ["P1_landing_mobility", "P2_isru_ice", "P3_habitat_eva_power",
                                              "P4_geology_regolith", "P5_astrobiology"]
    astro = next(x for x in p["profiles"] if x["id"] == "P5_astrobiology")
    assert astro["bodies"] == ["mars"]


def test_researcher_targets_and_priors():
    rt = json.loads((INPUTS / "targets.json").read_text())
    jsonschema.validate(rt, schema("targets"))
    t = rt["targets"]
    assert len(t) == 18
    assert sum(x["body"] == "moon" for x in t) == 10
    assert sum(x["body"] == "mars" for x in t) == 8
    ids = [x["id"] for x in t]
    assert len(set(ids)) == 18
    assert set(load("target_priors")["targets"]) == set(ids)
    for x in t:
        assert -180 <= x["anchor"]["lon"] < 180


def test_researcher_gaps():
    g = json.loads((INPUTS / "gaps.json").read_text())
    jsonschema.validate(g, schema("gaps"))
    for tier in g["tiers"].values():
        for gap in tier["gaps"]:
            assert set(gap["example_facilities"]) <= set(g["facilities"]), gap["id"]


def test_validation_csv():
    with open(REPO_ROOT / "docs" / "validation.csv", newline="") as fh:
        rows = list(csv.DictReader(fh))
    assert list(rows[0]) == ["name", "lat", "lon", "body_analog", "mission_purposes", "why", "citation_url"]
    pids = {p["id"] for p in load("profiles")["profiles"]}
    for r in rows:
        assert r["body_analog"] in {"moon", "mars", "both", "none"}
        mp = r["mission_purposes"].split(";")
        assert mp == ["none"] if r["body_analog"] == "none" else set(mp) <= pids, r["name"]
        assert -90 <= float(r["lat"]) <= 90 and -180 <= float(r["lon"]) <= 180
    assert sum(r["body_analog"] == "none" for r in rows) >= 10


def test_factors():
    f = load("factors")["factors"]
    assert [x["id"] for x in f] == [f"F{i}" for i in range(1, 14)]
    assert {x["tier"] for x in f[:10]} == {"core"}
    assert {x["tier"] for x in f[10:]} == {"secondary"}


@pytest.mark.parametrize("name,file", [
    ("targets", "targets.json"), ("profiles", "profiles.json"), ("validation", "validation.json"),
    ("gaps", "gaps.json"),
    ("provenance", "provenance.json"), ("grid_manifest", "earth_features.json"),
    ("grid_manifest", "moon_grid.json"), ("grid_manifest", "mars_grid.json"),
])
def test_mock_assets_match_schema(name, file):
    validate(name, MOCK / file)


def test_mock_portfolios_and_sites():
    ps = sorted((MOCK / "portfolios").glob("*.json"))
    assert ps
    for p in ps:
        validate("portfolio", p)
    for s in sorted((MOCK / "sites").glob("*.json")):
        validate("site", s)


def test_earth_binary_roundtrip():
    g = read_grid(MOCK / "earth_features.json")
    m = json.loads((MOCK / "earth_features.json").read_text())
    assert len(g["cell_id"]) == m["n_cells"]
    assert (g["cell_id"] >= 0).all() and (g["cell_id"] < 259200).all()
    assert 150 < g["ts_mean_k"].min() and g["ts_mean_k"].max() < 340
