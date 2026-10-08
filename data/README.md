# data/ (gitignored)

Raw downloads and intermediate grids live here on the build box only; nothing except this README is committed.

```
data/raw/<body>/<layer>/...      # downloads, checksummed (sha256 recorded in provenance.json)
data/interim/<body>.nc           # per-body 0.5 deg grids, contract units (docs/DATA_CONTRACT.md)
```

Shipped, precomputed assets go to `web/public/data/` (see DATA_CONTRACT.md §5).
