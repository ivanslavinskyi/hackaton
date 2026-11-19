
import json
from pathlib import Path

from app.schemas import DataSource


SOURCES_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "sources.json"
)


def load_sources() -> list[DataSource]:
    with open(SOURCES_PATH, "r", encoding="utf-8") as file:
        raw_sources = json.load(file)

    return [
        DataSource.model_validate(source)
        for source in raw_sources
    ]


def get_source(source_id: str):
    sources = load_sources()

    for source in sources:
        if source.id == source_id:
            return source

    return None
