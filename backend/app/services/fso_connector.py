
import re
from calendar import monthrange
from datetime import date

import httpx

from app.schemas import MarketSignal


FSO_API_URL = (
    "https://www.pxweb.bfs.admin.ch/api/v1/en/"
    "px-x-0602000000_103/px-x-0602000000_103.px"
)

FSO_SOURCE_URL = "https://statistik.admin.ch/en/asset/36832599"

INDUSTRIES = {
    "5-96": "All economic divisions",
    "58-63": "IT and communications",
}


def get_quarter_dates(period: str) -> tuple[date, date]:
    """Convert a quarter such as 2026Q2 into start and end dates."""
    match = re.fullmatch(r"(\d{4})Q([1-4])", period)

    if not match:
        raise ValueError(f"Invalid quarter format: {period}")

    year = int(match.group(1))
    quarter = int(match.group(2))

    start_month = (quarter - 1) * 3 + 1
    end_month = start_month + 2

    start_date = date(year, start_month, 1)
    end_date = date(
        year,
        end_month,
        monthrange(year, end_month)[1],
    )

    return start_date, end_date


def generate_quarters(
    start_period: str,
    end_period: str,
) -> list[str]:
    """Generate all quarters between two inclusive periods."""

    start_year, start_quarter = map(
        int,
        re.fullmatch(r"(\d{4})Q([1-4])", start_period).groups()
        if re.fullmatch(r"(\d{4})Q([1-4])", start_period)
        else (None, None),
    )

    end_match = re.fullmatch(r"(\d{4})Q([1-4])", end_period)

    if not end_match:
        raise ValueError(f"Invalid quarter format: {end_period}")

    end_year, end_quarter = map(int, end_match.groups())

    start_index = start_year * 4 + start_quarter - 1
    end_index = end_year * 4 + end_quarter - 1

    if start_index > end_index:
        raise ValueError("Start period must not be after end period")

    periods = []

    for index in range(start_index, end_index + 1):
        year = index // 4
        quarter = index % 4 + 1
        periods.append(f"{year}Q{quarter}")

    return periods


def fetch_fso_signals_for_periods(
    periods: list[str],
) -> list[MarketSignal]:
    """
    Fetch multiple quarters in one FSO PxWeb API request.
    Convert the response into MarketSignal objects.
    """

    if not periods:
        raise ValueError("At least one quarter must be provided")

    if len(periods) != len(set(periods)):
        raise ValueError("Quarter list contains duplicates")

    for period in periods:
        get_quarter_dates(period)

    payload = {
        "query": [
            {
                "code": "Offene Stellen",
                "selection": {
                    "filter": "item",
                    "values": ["1"],
                },
            },
            {
                "code": "Wirtschaftsabteilung",
                "selection": {
                    "filter": "item",
                    "values": list(INDUSTRIES.keys()),
                },
            },
            {
                "code": "Quartal",
                "selection": {
                    "filter": "item",
                    "values": periods,
                },
            },
        ],
        "response": {
            "format": "json-stat",
        },
    }

    response = httpx.post(
        FSO_API_URL,
        json=payload,
        timeout=60.0,
    )
    response.raise_for_status()

    result = response.json()

    if "dataset" not in result:
        raise ValueError("FSO response does not contain dataset")

    dataset = result["dataset"]
    dimensions = dataset["dimension"]
    values = dataset["value"]

    industry_dimension = dimensions["Wirtschaftsabteilung"]
    quarter_dimension = dimensions["Quartal"]

    industry_indexes = industry_dimension["category"]["index"]
    quarter_indexes = quarter_dimension["category"]["index"]

    sizes = dimensions["size"]

    if len(sizes) != 3:
        raise ValueError("Unexpected FSO dataset dimensions")

    for period in periods:
        if period not in quarter_indexes:
            raise ValueError(
                f"Quarter {period} not found in FSO response"
            )

    signals = []

    for industry_code, industry_name in INDUSTRIES.items():
        if industry_code not in industry_indexes:
            raise ValueError(
                f"Industry {industry_code} not found in FSO response"
            )

        industry_index = industry_indexes[industry_code]

        for period in periods:
            quarter_index = quarter_indexes[period]

            value_index = (
                industry_index * sizes[2]
                + quarter_index
            )

            if value_index >= len(values):
                raise ValueError(
                    "FSO response contains insufficient values"
                )

            value = values[value_index]

            if value is None:
                continue

            period_start, period_end = get_quarter_dates(period)

            signal = MarketSignal(
                id=f"fso_job_vacancies_{period}_{industry_code}",
                source_id="fso",
                source_url=FSO_SOURCE_URL,
                published_at=None,
                period_start=period_start,
                period_end=period_end,
                region="Switzerland",
                occupation=None,
                industry=industry_name,
                industry_code=industry_code,
                metric="job_vacancies",
                value=float(value),
                unit="jobs",
                comparison_period=None,
                evidence=(
                    f"FSO Job vacancies by economic divisions, "
                    f"{period}. Indicator: Job vacancies - total."
                ),
                limitations=(
                    "Quarterly official statistics. "
                    "Economic divisions describe industries, not occupations. "
                    "The publication date is not provided by this API response."
                ),
                reuse_status="open_by",
            )

            signals.append(signal)

    return signals


def fetch_fso_history(
    start_period: str,
    end_period: str,
) -> list[MarketSignal]:
    """Fetch all available signals within an inclusive quarter range."""

    periods = generate_quarters(start_period, end_period)

    return fetch_fso_signals_for_periods(periods)


def fetch_fso_signals(period: str) -> list[MarketSignal]:
    """Backward-compatible single-quarter import."""

    return fetch_fso_signals_for_periods([period])
