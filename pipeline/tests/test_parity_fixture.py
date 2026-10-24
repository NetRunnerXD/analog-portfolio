"""The Python/JS parity fixture must match the current Python reference (vitest runs the same file)."""
import json
import math

import pytest

import make_parity_fixture as mpf

STORED = json.loads((mpf.FIXTURES / "parity_cases.json").read_text())


def _same(a, b):
    if isinstance(a, float) or isinstance(b, float):
        return math.isclose(a, b, rel_tol=0, abs_tol=1e-12)
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(_same(a[k], b[k]) for k in a)
    if isinstance(a, list):
        return len(a) == len(b) and all(_same(x, y) for x, y in zip(a, b))
    return a == b


@pytest.mark.parametrize("key", [k for k in STORED if k not in ("note", "tolerance", "grid")])
def test_fixture_is_current(key):
    """Fails if the scalar scorer changed without `python tests/make_parity_fixture.py`."""
    fresh = json.loads(json.dumps(mpf.build_cases()[key]))
    assert _same(fresh, STORED[key]), f"regenerate: python tests/make_parity_fixture.py ({key})"


def test_grid_fixture_decodes_as_recorded():
    assert mpf.decoded_grid() == STORED["grid"]["expected"]
