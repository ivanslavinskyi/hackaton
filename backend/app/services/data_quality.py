
from calendar import monthrange
from datetime import date
from math import isfinite

from app.services.source_registry import load_sources


ALLOWED_REUSE_STATUSES = {
    "pending",
    "permission_required",
    "open_by",
}


def validate_signal(signal, sources_by_id):
    errors = []
    warnings = []

    def add_error(code, message):
        errors.append({"code": code, "message": message})

    def add_warning(code, message):
        warnings.append({"code": code, "message": message})

    # 1. Source validation
    source = sources_by_id.get(signal.source_id)

    if source is None:
        add_error("unknown_source", f"Source '{signal.source_id}' is not registered.")
    else:
        if signal.source_url != source.source_url:
            add_error("source_url_mismatch", "Signal URL does not match the registered source URL.")

        if signal.reuse_status != source.reuse_status:
            add_error("reuse_status_mismatch", "Signal reuse status does not match the source registry.")

    # 2. URL validation
    if not signal.source_url.startswith("https://"):
        add_error("invalid_source_url", "Source URL must use HTTPS.")

    # 3. Date validation
    if signal.period_start > signal.period_end:
        add_error("invalid_period", "Period start must not be later than period end.")

    if signal.period_end > date.today():
        add_error("future_period", "Observation period must not end in the future.")

    if signal.published_at is None:
        add_warning("missing_publication_date", "Publication date is not available.")
    elif signal.published_at < signal.period_end:
        add_warning(
            "publication_before_period_end",
            "Publication date is earlier than the observation period end."
        )

    # 4. Numeric validation
    if not isfinite(signal.value):
        add_error("invalid_value", "Signal value must be a finite number.")
    elif signal.value < 0:
        add_error("negative_value", "Signal value cannot be negative.")
    elif signal.unit == "jobs" and not signal.value.is_integer():
        add_error("non_integer_job_count", "Job vacancy counts must be whole numbers.")

    # 5. Classification validation
    if not any([signal.occupation, signal.industry, signal.skill_id]):
        add_error(
            "missing_classification",
            "Signal must have an occupation, industry or skill classification."
        )

    if bool(signal.industry) != bool(signal.industry_code):
        add_error(
            "incomplete_industry",
            "Industry name and industry code must be provided together."
        )

    # 6. Evidence and limitations
    if not signal.evidence.strip():
        add_error("missing_evidence", "Evidence description cannot be empty.")

    if not signal.limitations.strip():
        add_error("missing_limitations", "Limitations description cannot be empty.")

    # 7. Reuse status
    if signal.reuse_status not in ALLOWED_REUSE_STATUSES:
        add_error("invalid_reuse_status", f"Unsupported reuse status: {signal.reuse_status}")

    # 8. FSO-specific validation
    if signal.source_id == "fso":
        if signal.metric != "job_vacancies":
            add_error("invalid_fso_metric", "FSO connector currently supports job_vacancies only.")

        if not signal.industry_code:
            add_error("missing_fso_industry_code", "FSO signals must include an industry code.")

        quarter_months = {
            1: (1, 3),
            4: (4, 6),
            7: (7, 9),
            10: (10, 12),
        }

        start_month = signal.period_start.month
        quarter = quarter_months.get(start_month)

        if signal.period_start.day != 1 or quarter is None:
            add_error(
                "invalid_fso_quarter",
                "FSO period must start on the first day of January, April, July or October."
            )
        else:
            expected_end_month = quarter[1]
            expected_end_day = monthrange(
                signal.period_start.year,
                expected_end_month
            )[1]

            if (
                signal.period_end.year != signal.period_start.year
                or signal.period_end.month != expected_end_month
                or signal.period_end.day != expected_end_day
            ):
                add_error(
                    "invalid_fso_quarter",
                    "FSO period must cover exactly one complete calendar quarter."
                )

    return {
        "signal_id": signal.id,
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings
    }


def validate_signals(signals):
    registered_sources = load_sources()

    sources_by_id = {
        source.id: source
        for source in registered_sources
    }

    results = [
        validate_signal(signal, sources_by_id)
        for signal in signals
    ]

    seen_ids = set()

    for result in results:
        signal_id = result["signal_id"]

        if signal_id in seen_ids:
            result["valid"] = False
            result["errors"].append({
                "code": "duplicate_batch_id",
                "message": "Duplicate signal ID in the import batch."
            })

        seen_ids.add(signal_id)

    error_count = sum(len(result["errors"]) for result in results)
    warning_count = sum(len(result["warnings"]) for result in results)

    return {
        "valid": error_count == 0,
        "checked": len(results),
        "passed": sum(1 for result in results if result["valid"]),
        "failed": sum(1 for result in results if not result["valid"]),
        "error_count": error_count,
        "warning_count": warning_count,
        "results": results
    }
