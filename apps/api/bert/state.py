"""Local-first runtime state for the demo and offline development.

The application deliberately uses SQLite and a small on-disk source directory by
default.  This keeps a fresh checkout runnable without Docker, Postgres, Redis,
or model credentials while leaving the SQLAlchemy models available for a hosted
deployment.
"""

from __future__ import annotations

from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = API_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def stored_source_path(document_id: str, filename: str) -> Path:
    """Return a safe, stable path for an uploaded source file."""

    safe_name = Path(filename).name or "source.bin"
    return DATA_DIR / f"{document_id}_{safe_name}"
