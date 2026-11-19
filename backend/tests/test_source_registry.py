
from app.services.source_registry import load_sources, get_source


def test_load_sources():
    sources = load_sources()

    assert len(sources) == 4


def test_get_hslu_source():
    source = get_source("hslu")

    assert source is not None
    assert source.name == "Hochschule Luzern"


def test_get_unknown_source():
    source = get_source("unknown")

    assert source is None


def test_sources_have_valid_reuse_status():
    sources = load_sources()

    valid_statuses = {
        "pending",
        "permission_required",
        "open_by"
    }

    for source in sources:
        assert source.reuse_status in valid_statuses

def test_get_fso_source():
    source = get_source("fso")

    assert source is not None
    assert source.name == "Federal Statistical Office"
    assert source.data_format == "pxweb_api"
    assert source.reuse_status == "open_by"


def test_kof_requires_permission():
    source = get_source("kof")

    assert source.reuse_status == "permission_required"