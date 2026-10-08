"""Load the language-neutral contract files in /contract (single source of truth)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACT_DIR = REPO_ROOT / "contract"
WEB_DATA_DIR = REPO_ROOT / "web" / "public" / "data"
RAW_DATA_DIR = REPO_ROOT / "data"


@lru_cache(maxsize=None)
def load(name: str) -> dict:
    """Load contract/<name>.json (e.g. 'factors', 'profiles', 'targets.seed', 'test_vectors')."""
    return json.loads((CONTRACT_DIR / f"{name}.json").read_text())


def schema(name: str) -> dict:
    return json.loads((CONTRACT_DIR / "schemas" / f"{name}.schema.json").read_text())


def factor_ids(tier: str | None = None) -> list[str]:
    return [f["id"] for f in load("factors")["factors"] if tier is None or f["tier"] == tier]
