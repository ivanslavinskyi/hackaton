
"""Import the UZH/Adecco Swiss Job Market Index Excel workbook."""

from __future__ import annotations

import calendar
import hashlib
import re
from datetime import date
from pathlib import Path

import pandas as pd

from app.schemas import MarketSignal


SOURCE_ID = "uzh_job_index"
SOURCE_PAGE = (
    "https://www.stellenmarktmonitor.uzh.ch/en/indices/asjmi.html"
)
SOURCE_LABEL = "Adecco Group Swiss Job Market Index (UZH)"

LIMITATIONS = (
    "Quarterly relative index, not a raw count of vacancies. "
    "Do not compare index values directly with FSO vacancy counts."
)

_ROMAN_QUARTERS = {
    "I": 1,
    "II": 2,
    "III": 3,
    "IV": 4,
}


def _quarter_dates(year: int, quarter: int) -> tuple[date, date]:
    """Return the start and end dates of a calendar quarter."""
    start_month = 1 + (quarter - 1) * 3
    end_month = start_month + 2

    return (
        date(year, start_month, 1),
        date(
            year,
            end_month,
            calendar.monthrange(year, end_month)[1],
        ),
    )


def _observation_dates(
    year: int,
    quarter: int,
    metric: str,
) -> tuple[date, date]:
    """
    Return dates for an observation.

    The original index was published annually in March from 2003 to 2007.
    From 2008 onward, observations are quarterly.

    The seasonally adjusted series starts in 2008 and remains quarterly.
    """
    if metric == "job_market_index" and year < 2008:
        return (
            date(year, 3, 1),
            date(year, 3, 31),
        )

    return _quarter_dates(year, quarter)


def _as_year(value) -> int | None:
    """Convert a cell value into a plausible year."""
    if pd.isna(value):
        return None

    try:
        year = int(float(str(value).strip()))
        return year if 1990 <= year <= 2100 else None

    except (ValueError, TypeError):
        match = re.search(
            r"\b(19\d{2}|20\d{2}|2100)\b",
            str(value),
        )
        return int(match.group(1)) if match else None


def _find_row(
    frame: pd.DataFrame,
    predicate,
) -> int | None:
    """Find a row by checking its first cell."""
    for idx in range(len(frame)):
        value = frame.iat[idx, 0]

        if pd.notna(value) and predicate(str(value).strip().lower()):
            return idx

    return None


def read_uzh_excel(
    path: str | Path,
    sheet_name: str = "Daten",
    include_seasonally_adjusted: bool = True,
) -> list[MarketSignal]:
    """
    Parse the UZH workbook's overall Swiss index series.

    The workbook stores years in one header row, Roman quarter labels
    in another, and index observations across columns.

    This parser imports only the two overall Swiss series, not the
    channel sub-indices.
    """
    path = Path(path)

    if not path.exists():
        raise FileNotFoundError(path)

    frame = pd.read_excel(
        path,
        sheet_name=sheet_name,
        header=None,
    )

    frame = frame.dropna(how="all").reset_index(drop=True)

    if frame.empty or frame.shape[1] < 2:
        raise ValueError(
            f"UZH sheet {sheet_name!r} is empty or malformed"
        )

    # Locate the year and quarter header rows.
    # The workbook may contain merged or blank year cells.
    year_row = None
    quarter_row = None

    for idx in range(min(12, len(frame))):
        years = [
            _as_year(value)
            for value in frame.iloc[idx].tolist()
        ]

        if (
            sum(year is not None for year in years) >= 2
            and year_row is None
        ):
            year_row = idx

        quarters = [
            str(value).strip().upper()
            if pd.notna(value)
            else ""
            for value in frame.iloc[idx].tolist()
        ]

        if (
            sum(q in _ROMAN_QUARTERS for q in quarters) >= 2
            and quarter_row is None
        ):
            quarter_row = idx

    if year_row is None or quarter_row is None:
        raise ValueError(
            "UZH workbook: could not identify year and "
            "Roman-quarter header rows on the 'Daten' sheet."
        )

    # Forward-fill year cells because some years are merged
    # across multiple quarterly columns.
    years = (
        pd.Series(
            [
                _as_year(value)
                for value in frame.iloc[year_row].tolist()
            ],
            dtype="object",
        )
        .ffill()
        .tolist()
    )

    quarters = [
        str(value).strip().upper()
        if pd.notna(value)
        else ""
        for value in frame.iloc[quarter_row].tolist()
    ]

    # Locate the overall Swiss index row.
    raw_row = _find_row(
        frame,
        lambda text: (
            "schweiz" in text
            and "2008" in text
            and "100" in text
        ),
    )

    # Locate the seasonally adjusted overall index row.
    adjusted_row = _find_row(
        frame,
        lambda text: "saisonbereinigte indexwerte" in text,
    )

    if raw_row is None:
        raise ValueError(
            "UZH workbook: could not find the overall "
            "'Schweiz (2008-I = 100)' row."
        )

    series_rows = [
        (
            raw_row,
            "job_market_index",
            "Swiss overall index",
        )
    ]

    if include_seasonally_adjusted and adjusted_row is not None:
        series_rows.append(
            (
                adjusted_row,
                "job_market_index_seasonally_adjusted",
                "Swiss seasonally adjusted overall index",
            )
        )

    signals: list[MarketSignal] = []

    for row_idx, metric, series_label in series_rows:
        for col in range(1, frame.shape[1]):
            year = years[col] if col < len(years) else None

            quarter_label = (
                quarters[col]
                if col < len(quarters)
                else ""
            )

            quarter = _ROMAN_QUARTERS.get(quarter_label)

            # Ignore columns without a valid year/quarter.
            # This also excludes the right-side change columns.
            if year is None or quarter is None:
                continue

            raw_value = frame.iat[row_idx, col]

            if pd.isna(raw_value):
                continue

            try:
                value = float(raw_value)
            except (ValueError, TypeError):
                continue

            if not pd.notna(value) or value <= 0:
                continue

            year = int(year)

            period = f"{year}Q{quarter}"

            start, end = _observation_dates(
                year=year,
                quarter=quarter,
                metric=metric,
            )

            if metric == "job_market_index" and year < 2008:
                period_description = (
                    f"{year}, annual March observation"
                )
            else:
                period_description = period

            signals.append(
                MarketSignal(
                    id=(
                        f"uzh-asjmi-{year}-"
                        f"q{quarter}-{metric}"
                    ),
                    source_id=SOURCE_ID,
                    source_url=SOURCE_PAGE,
                    published_at=None,
                    period_start=start,
                    period_end=end,
                    region="Switzerland",
                    occupation=None,
                    metric=metric,
                    value=value,
                    unit="index",
                    comparison_period=None,
                    evidence=(
                        f"{SOURCE_LABEL}; "
                        f"sheet '{sheet_name}', "
                        f"row {row_idx + 1}, "
                        f"series '{series_label}', "
                        f"period {period_description}."
                    ),
                    limitations=LIMITATIONS,
                    reuse_status="pending",
                )
            )

    if not signals:
        raise ValueError(
            "No UZH observations were parsed. Check the year/"
            "quarter headers and the overall index row."
        )

    # Preserve order and remove duplicate records by ID.
    unique = {
        signal.id: signal
        for signal in signals
    }

    return list(unique.values())


def workbook_sha256(path: str | Path) -> str:
    """Calculate SHA-256 hash of the source workbook."""
    digest = hashlib.sha256()

    with open(path, "rb") as file:
        for chunk in iter(
            lambda: file.read(1024 * 1024),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()
