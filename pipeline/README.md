# analog_portfolio (offline pipeline)

Stages: `acquire` → `extract` → `grid` → `score` → `export`. Contract: [`../docs/DATA_CONTRACT.md`](../docs/DATA_CONTRACT.md).

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"            # ".[data]" adds rasterio/xarray/etc. for real acquisition
pytest -q
python -m analog_portfolio.schemas_gen    # regenerate contract/schemas
python -m analog_portfolio.export.mock    # regenerate web/public/data/mock
```

`inputs/` holds Researcher-curated inputs (`targets.json`, `gaps.json`); `docs/validation.csv` is the validation set.
