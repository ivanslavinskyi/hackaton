
from app.services.source_registry import load_sources, get_source


def test_load_sources():
    sources = load_sources()

    assert len(sources) == 3


def test_get_hslu_source():
    source = get_source("hslu")

    assert source is not None
    assert source.name == "Hochschule Luzern"


def test_get_unknown_source():
    source = get_source("unknown")

    assert source is None


def test_sources_have_pending_reuse_status():
    sources = load_sources()

    for source in sources:
        assert source.reuse_status == "pending"
