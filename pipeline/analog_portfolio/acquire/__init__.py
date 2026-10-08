"""Stage 1: raw downloads into data/raw/<body>/<layer>/ (gitignored, checksummed).

Owner: Technology/API Explorer. One module per source (e.g. power.py, lola.py, mola.py).
Every downloader must append a provenance entry (see provenance.schema.json).
"""

def run(body: str, layer: str | None = None) -> None:  # pragma: no cover - stub
    raise NotImplementedError("acquire.run: implemented per layer in Phase B")
