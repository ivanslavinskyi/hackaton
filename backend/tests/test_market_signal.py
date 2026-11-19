
from datetime import date

from app.schemas import MarketSignal


def test_market_signal_creation():
    signal = MarketSignal(
        id="signal_001",
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
        comparison_period="previous_year",
        evidence="Source statement",
        limitations="Requires methodology verification",
        reuse_status="pending"
    )

    assert signal.id == "signal_001"
    assert signal.value == 32
    assert signal.region == "Switzerland"


def test_market_signal_rejects_extra_fields():
    data = {
        "id": "signal_001",
        "source_id": "hslu_2026",
        "source_url": "https://example.com",
        "published_at": "2026-10-08",
        "period_start": "2025-07-01",
        "period_end": "2026-06-30",
        "region": "Switzerland",
        "occupation": "AI Specialist",
        "metric": "job_growth",
        "value": 32,
        "unit": "percent",
        "evidence": "Source statement",
        "limitations": "Test",
        "unexpected_field": "not allowed"
    }

    try:
        MarketSignal(**data)
        assert False, "Extra fields should be rejected"
    except Exception:
        pass
