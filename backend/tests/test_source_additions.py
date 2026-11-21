from datetime import date
from app.schemas import MarketSignal
from app.services.data_quality_additions import validate_uzh_signals

def sample():
    return MarketSignal(
        id="uzh-asjmi-2025q1-total",
        source_id="uzh_job_index",
        source_url="https://www.stellenmarktmonitor.uzh.ch/en/indices/asjmi.html",
        published_at=None,
        period_start=date(2025, 1, 1),
        period_end=date(2025, 3, 31),
        region="Switzerland",
        occupation=None,
        metric="job_market_index",
        value=105.2,
        unit="index",
        evidence="Test workbook observation",
        limitations="Index, not absolute vacancy count",
        reuse_status="pending",
    )

def test_uzh_validation_accepts_index_not_count():
    result = validate_uzh_signals([sample()])
    assert result["valid"]
    assert result["checked"] == 1

def test_uzh_validation_rejects_wrong_metric():
    signal = sample()
    signal.metric = "job_vacancies"
    assert not validate_uzh_signals([signal])["valid"]
