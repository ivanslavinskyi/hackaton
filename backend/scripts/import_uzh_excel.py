
"""Import UZH Job Market Index observations into the SQLite database."""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

# Project root: backend/
ROOT = Path(__file__).resolve().parents[1]

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import (  # noqa: E402
    DB_PATH,
    get_connection,
    init_db,
    save_or_update_signals,
)
from app.services.uzh_job_index_connector import (  # noqa: E402
    read_uzh_excel,
)


EXCEL_PATH = ROOT / "data" / "uzh_job_index.xlsx"
SOURCE_ID = "uzh_job_index"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import UZH Job Market Index into SQLite."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write observations to the database. Without this flag, "
        "the script performs a dry run.",
    )
    args = parser.parse_args()

    if not EXCEL_PATH.exists():
        raise FileNotFoundError(
            f"UZH Excel workbook not found: {EXCEL_PATH}"
        )

    signals = read_uzh_excel(EXCEL_PATH)

    # Validate source and identifiers before touching the database.
    if any(signal.source_id != SOURCE_ID for signal in signals):
        raise ValueError("Unexpected source_id in parsed UZH signals.")

    ids = [signal.id for signal in signals]

    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate signal IDs detected. Import cancelled.")

    metrics = Counter(signal.metric for signal in signals)

    print("UZH Excel import")
    print("-" * 40)
    print(f"Workbook: {EXCEL_PATH}")
    print(f"Database: {DB_PATH}")
    print(f"Parsed observations: {len(signals)}")
    print(f"Metrics: {dict(metrics)}")
    print(f"Duplicate IDs: {len(ids) - len(set(ids))}")

    if not args.apply:
        print("\nDRY RUN: database was not modified.")
        print("To import, run:")
        print("python scripts/import_uzh_excel.py --apply")
        return

    # Initialize/migrate the existing schema if necessary.
    init_db()

    # Batch upsert: existing IDs are updated, new IDs are inserted.
    save_or_update_signals(signals)

    with get_connection() as conn:
        total = conn.execute(
            "SELECT COUNT(*) FROM market_signals "
            "WHERE source_id = ?",
            (SOURCE_ID,),
        ).fetchone()[0]

        by_metric = conn.execute(
            """
            SELECT metric, COUNT(*) AS count
            FROM market_signals
            WHERE source_id = ?
            GROUP BY metric
            ORDER BY metric
            """,
            (SOURCE_ID,),
        ).fetchall()

    print("\nIMPORT COMPLETED")
    print(f"UZH observations in database: {total}")

    for row in by_metric:
        print(f"  {row['metric']}: {row['count']}")

    print("\nOther sources, including FSO, were not imported or deleted.")


if __name__ == "__main__":
    main()
