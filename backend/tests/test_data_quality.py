
from datetime import date

from app.schemas import MarketSignal
from app.services.data_quality import (
    validate_signal,
    validate_signals,
)
from app.services.source_registry import load_sources


def make_fso_signal():
    return MarketSignal(
        id="fso_test_2026Q2_58-63",
        source_id="fso",
        source_url="https://statistik.admin.ch/en/asset/36832599",
        published_at=None,
        period_start=date(2026, 4, 1),
        period_end=date(2026, 6, 30),
        region="Switzerland",
        industry="IT and communications",
        industry_code="58-63",
        metric="job_vacancies",
        value=4684,
        unit="jobs",
        evidence="FSO test evidence",
        limitations="Quarterly statistics",
        reuse_status="open_by"
    )


def get_sources():
    return {
        source.id: source
        for source in load_sources()
    }


def test_valid_fso_signal():
    signal = make_fso_signal()

    result = validate_signal(signal, get_sources())

    assert result["valid"] is True
    assert result["errors"] == []


def test_missing_publication_date_is_warning():
    signal = make_fso_signal()

    result = validate_signal(signal, get_sources())

    warning_codes = [
        warning["code"]
        for warning in result["warnings"]
    ]

    assert "missing_publication_date" in warning_codes
    assert result["valid"] is True


def test_negative_value_is_invalid():
    signal = make_fso_signal().model_copy(
        update={"value": -100}
    )

    result = validate_signal(signal, get_sources())

    error_codes = [
        error["code"]
        for error in result["errors"]
    ]

    assert "negative_value" in error_codes
    assert result["valid"] is False


def test_fractional_job_count_is_invalid():
    signal = make_fso_signal().model_copy(
        update={"value": 4684.5}
    )

    result = validate_signal(signal, get_sources())

    error_codes = [
        error["code"]
        for error in result["errors"]
    ]

    assert "non_integer_job_count" in error_codes


def test_invalid_period_is_detected():
    signal = make_fso_signal().model_copy(
        update={
            "period_start": date(2026, 7, 1),
            "period_end": date(2026, 6, 30)
        }
    )

    result = validate_signal(signal, get_sources())

    error_codes = [
        error["code"]
        for error in result["errors"]
    ]

    assert "invalid_period" in error_codes


def test_source_url_mismatch_is_detected():
    signal = make_fso_signal().model_copy(
        update={"source_url": "https://example.com/data"}
    )

    result = validate_signal(signal, get_sources())

    error_codes = [
        error["code"]
        for error in result["errors"]
    ]

    assert "source_url_mismatch" in error_codes


def test_reuse_status_mismatch_is_detected():
    signal = make_fso_signal().model_copy(
        update={"reuse_status": "pending"}
    )

    result = validate_signal(signal, get_sources())

    error_codes = [
        error["code"]
        for error in result["errors"]
    ]

    assert "reuse_status_mismatch" in error_codes


def test_wrong_fso_quarter_is_detected():
    signal = make_fso_signal().model_copy(
        update={
            "period_start": date(2026, 4, 1),
            "period_end": date(2026, 5, 31)
        }
    )

    result = validate_signal(signal, get_sources())

    error_codes = [
        error["code"]
        for error in result["errors"]
    ]

    assert "invalid_fso_quarter" in error_codes


def test_duplicate_ids_in_batch_are_detected():
    signal = make_fso_signal()

    result = validate_signals([
        signal,
        signal
    ])

    assert result["valid"] is False
    assert result["failed"] == 1

    error_codes = [
        error["code"]
        for item in result["results"]
        for error in item["errors"]
    ]

    assert "duplicate_batch_id" in error_codes
