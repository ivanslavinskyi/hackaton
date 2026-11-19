
from app import database
from app.schemas import MarketSignal


def make_signal():
    return MarketSignal(
        id="fso_test_2026Q2",
        source_id="fso",
        source_url="https://statistik.admin.ch/en/asset/36832599",
        published_at=None,
        period_start="2026-04-01",
        period_end="2026-06-30",
        region="Switzerland",
        industry="IT and communications",
        industry_code="58-63",
        metric="job_vacancies",
        value=4684,
        unit="jobs",
        evidence="FSO test signal",
        limitations="Test data",
        reuse_status="open_by"
    )


def test_save_or_update_signal(monkeypatch, tmp_path):
    monkeypatch.setattr(
        database,
        "DB_PATH",
        tmp_path / "test.db"
    )

    database.init_db()

    signal = make_signal()

    database.save_or_update_signal(signal)
    database.save_or_update_signal(signal)

    saved = database.get_signal(signal.id)

    assert saved is not None
    assert saved["industry_code"] == "58-63"
    assert saved["value"] == 4684.0

    all_signals = database.get_all_signals()

    assert len(all_signals) == 1
