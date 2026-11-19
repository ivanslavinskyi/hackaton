
from datetime import date

import app.database as database
from app.schemas import MarketSignal


def test_save_and_get_signal(tmp_path, monkeypatch):
    monkeypatch.setattr(
        database,
        "DB_PATH",
        tmp_path / "test.db"
    )

    database.init_db()

    signal = MarketSignal(
        id="signal_test_001",
        source_id="hslu_2026",
        source_url="https://example.com/report",
        published_at=date(2026, 10, 8),
        period_start=date(2025, 7, 1),
        period_end=date(2026, 6, 30),
        region="Switzerland",
        occupation="AI Specialist",
        metric="job_growth",
        value=32,
        unit="percent",
        evidence="Source statement",
        limitations="Test limitation"
    )

    database.save_signal(signal)

    result = database.get_signal("signal_test_001")

    assert result is not None
    assert result["occupation"] == "AI Specialist"
    assert result["value"] == 32.0


def test_get_all_signals(tmp_path, monkeypatch):
    monkeypatch.setattr(
        database,
        "DB_PATH",
        tmp_path / "test.db"
    )

    database.init_db()

    assert database.get_all_signals() == []
