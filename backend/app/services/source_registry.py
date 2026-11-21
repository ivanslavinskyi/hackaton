"""JSON source catalog helpers; metadata only, no automatic execution of sources."""
from __future__ import annotations
import json
from pathlib import Path
from app.schemas import DataSource

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "data" / "sources.json"

def load_sources(path: str | Path = DEFAULT_PATH) -> list[DataSource]:
    path = Path(path)
    if not path.exists():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict):
        raw = raw.get("sources", [])
    if not isinstance(raw, list):
        raise ValueError("sources.json must be a list or an object containing 'sources'")
    return [DataSource.model_validate(item) for item in raw]

def get_source(source_id: str, path: str | Path = DEFAULT_PATH) -> DataSource | None:
    return next((s for s in load_sources(path) if s.id == source_id), None)

def source_status(path: str | Path = DEFAULT_PATH) -> list[dict]:
    return [s.model_dump(mode="json") for s in load_sources(path)]
