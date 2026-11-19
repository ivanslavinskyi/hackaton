
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
    """
    Convert a quarter such as 2026Q2 into start and end dates.
    """
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
        monthrange(year, end_month)[1]
    )

    return start_date, end_date


def fetch_fso_signals(period: str) -> list[MarketSignal]:
    """
    Fetch job vacancy data from the FSO PxWeb API
    and convert it into MarketSignal objects.
    """

    period_start, period_end = get_quarter_dates(period)

    payload = {
        "query": [
            {
                "code": "Offene Stellen",
                "selection": {
                    "filter": "item",
                    "values": ["1"]
                }
            },
            {
                "code": "Wirtschaftsabteilung",
                "selection": {
                    "filter": "item",
                    "values": ["5-96", "58-63"]
                }
            },
            {
                "code": "Quartal",
                "selection": {
                    "filter": "item",
                    "values": [period]
                }
            }
        ],
        "response": {
            "format": "json-stat"
        }
    }

    response = httpx.post(
        FSO_API_URL,
        json=payload,
        timeout=30.0
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

    if period not in quarter_indexes:
        raise ValueError(f"Quarter {period} not found in FSO response")

    quarter_index = quarter_indexes[period]

    sizes = dimensions["size"]

    # Dimension order:
    # Job vacancies × Economic division × Quarter
    indicator_index = 0

    signals = []

    for industry_code, industry_name in INDUSTRIES.items():
        if industry_code not in industry_indexes:
            raise ValueError(
                f"Industry {industry_code} not found in FSO response"
            )

        industry_index = industry_indexes[industry_code]

        value_index = (
            indicator_index * sizes[1] * sizes[2]
            + industry_index * sizes[2]
            + quarter_index
        )

        if value_index >= len(values):
            raise ValueError("FSO response contains insufficient values")

        value = values[value_index]

        if value is None:
            continue

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
            reuse_status="open_by"
        )

        signals.append(signal)

    return signals
