from datetime import date
from typing import Any, Optional


TOTAL_INDUSTRY_CODE = "5-96"
ICT_INDUSTRY_CODE = "58-63"


def _as_date(value: Any) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _quarter_key(value: Any) -> tuple[int, int]:
    period_date = _as_date(value)
    quarter = ((period_date.month - 1) // 3) + 1
    return period_date.year, quarter


def _quarter_label(key: tuple[int, int]) -> str:
    return f"{key[0]}Q{key[1]}"


def _quarter_index(key: tuple[int, int]) -> int:
    return key[0] * 4 + key[1] - 1


def _percentage_change(current: float, previous: Optional[float]) -> Optional[float]:
    if previous is None or previous == 0:
        return None
    return round(((current - previous) / previous) * 100, 2)


def build_market_pulse(signals: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Build quarterly market indicators from FSO job-vacancy signals.

    FSO industry code 5-96 represents all economic divisions.
    FSO industry code 58-63 represents information and communication.
    The latter is an industry classification, not an occupation classification.
    """
    quarterly: dict[tuple[int, int], dict[str, Any]] = {}

    for signal in signals:
        if signal.get("source_id") != "fso":
            continue
        if signal.get("metric") != "job_vacancies":
            continue

        industry_code = signal.get("industry_code")
        if industry_code not in {TOTAL_INDUSTRY_CODE, ICT_INDUSTRY_CODE}:
            continue

        key = _quarter_key(signal["period_start"])
        bucket = quarterly.setdefault(
            key,
            {
                "period_start": str(signal["period_start"]),
                "period_end": str(signal["period_end"]),
            },
        )
        bucket[industry_code] = float(signal["value"])

    ordered_keys = sorted(quarterly, key=_quarter_index)
    rows: list[dict[str, Any]] = []

    for key in ordered_keys:
        bucket = quarterly[key]
        total = bucket.get(TOTAL_INDUSTRY_CODE)
        ict = bucket.get(ICT_INDUSTRY_CODE)

        # A quarter is analytically usable only when both series are present.
        if total is None or ict is None:
            continue

        rows.append(
            {
                "period": _quarter_label(key),
                "period_start": bucket["period_start"],
                "period_end": bucket["period_end"],
                "total_vacancies": total,
                "ict_vacancies": ict,
                "ict_share_pct": round((ict / total) * 100, 2) if total else None,
                "qoq_change_total_pct": None,
                "yoy_change_total_pct": None,
                "qoq_change_ict_pct": None,
                "yoy_change_ict_pct": None,
            }
        )

    by_period = {row["period"]: row for row in rows}

    for row in rows:
        year, quarter = map(int, row["period"].replace("Q", " ").split())
        previous_quarter = (year, quarter - 1) if quarter > 1 else (year - 1, 4)
        previous_year = (year - 1, quarter)

        qoq = by_period.get(_quarter_label(previous_quarter))
        yoy = by_period.get(_quarter_label(previous_year))

        if qoq:
            row["qoq_change_total_pct"] = _percentage_change(
                row["total_vacancies"], qoq["total_vacancies"]
            )
            row["qoq_change_ict_pct"] = _percentage_change(
                row["ict_vacancies"], qoq["ict_vacancies"]
            )

        if yoy:
            row["yoy_change_total_pct"] = _percentage_change(
                row["total_vacancies"], yoy["total_vacancies"]
            )
            row["yoy_change_ict_pct"] = _percentage_change(
                row["ict_vacancies"], yoy["ict_vacancies"]
            )

    latest = rows[-1] if rows else None

    return {
        "source": "fso",
        "metric": "job_vacancies",
        "unit": "jobs",
        "periods_available": len(rows),
        "latest": latest,
        "series": rows,
        "methodology": {
            "total_industry_code": TOTAL_INDUSTRY_CODE,
            "ict_industry_code": ICT_INDUSTRY_CODE,
            "ict_classification_note": (
                "Code 58-63 represents the Information and Communication industry, "
                "not specifically IT occupations such as software developers or AI engineers."
            ),
            "change_formula": "((current_period - comparison_period) / comparison_period) * 100",
            "ict_share_formula": "(ICT vacancies / total vacancies) * 100",
            "missing_comparison": "Percentage change is null when the comparison period is unavailable.",
        },
    }



def build_uzh_market_index(
    signals: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build separate UZH index series from stored market signals."""

    metrics = {
        "job_market_index": "raw",
        "job_market_index_seasonally_adjusted": "seasonally_adjusted",
    }

    series: dict[str, list[dict[str, Any]]] = {
        key: [] for key in metrics
    }

    for signal in signals:
        if signal.get("source_id") != "uzh_job_index":
            continue

        metric = signal.get("metric")
        if metric not in metrics:
            continue

        period_start = signal.get("period_start")
        if not period_start:
            continue

        year, quarter = _quarter_key(period_start)
        period = _quarter_label((year, quarter))

        series[metric].append({
            "period": period,
            "period_start": str(period_start),
            "period_end": str(signal.get("period_end")),
            "value": float(signal["value"]),
            "unit": signal.get("unit", "index"),
        })

    # Sort chronologically and calculate changes.
    for metric, observations in series.items():
        observations.sort(key=lambda item: item["period"])

        by_period = {
            item["period"]: item for item in observations
        }

        for item in observations:
            year, quarter = map(
                int, item["period"].replace("Q", " ").split()
            )

            previous_quarter = (
                (year, quarter - 1)
                if quarter > 1
                else (year - 1, 4)
            )
            previous_year = (year - 1, quarter)

            previous_q = by_period.get(
                _quarter_label(previous_quarter)
            )
            previous_y = by_period.get(
                _quarter_label(previous_year)
            )

            item["qoq_change_pct"] = (
                _percentage_change(
                    item["value"], previous_q["value"]
                )
                if previous_q else None
            )

            item["yoy_change_pct"] = (
                _percentage_change(
                    item["value"], previous_y["value"]
                )
                if previous_y else None
            )

    return {
        "source": "uzh_job_index",
        "unit": "index",
        "baseline": "2008Q1 = 100",
        "series": {
            "raw": {
                "metric": "job_market_index",
                "observations": len(series["job_market_index"]),
                "latest": (
                    series["job_market_index"][-1]
                    if series["job_market_index"] else None
                ),
                "data": series["job_market_index"],
            },
            "seasonally_adjusted": {
                "metric": "job_market_index_seasonally_adjusted",
                "observations": len(
                    series["job_market_index_seasonally_adjusted"]
                ),
                "latest": (
                    series[
                        "job_market_index_seasonally_adjusted"
                    ][-1]
                    if series[
                        "job_market_index_seasonally_adjusted"
                    ] else None
                ),
                "data": series[
                    "job_market_index_seasonally_adjusted"
                ],
            },
        },
        "methodology": {
            "qoq_formula": (
                "((current_index - previous_quarter_index) "
                "/ previous_quarter_index) * 100"
            ),
            "yoy_formula": (
                "((current_index - previous_year_index) "
                "/ previous_year_index) * 100"
            ),
            "note": (
                "UZH is a relative job-market index, "
                "not an absolute vacancy count."
            ),
        },
    }


def get_market_pulse() -> dict[str, Any]:
    from app import database

    signals = database.get_all_signals()

    # Preserve the existing FSO response structure.
    result = build_market_pulse(signals)

    # Add UZH as a separate indicator.
    result["additional_indicators"] = {
        "uzh_job_market_index": build_uzh_market_index(signals)
    }

    return result

