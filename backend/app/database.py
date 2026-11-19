
import sqlite3
from pathlib import Path

from app.schemas import MarketSignal


DB_PATH = Path(__file__).resolve().parent.parent / "data" / "market_radar.db"


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row

    return connection


def create_market_signals_table(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS market_signals (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            source_url TEXT NOT NULL,
            published_at TEXT,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            region TEXT NOT NULL,
            occupation TEXT,
            skill_id TEXT,
            industry TEXT,
            industry_code TEXT,
            metric TEXT NOT NULL,
            value REAL NOT NULL,
            unit TEXT NOT NULL,
            comparison_period TEXT,
            evidence TEXT NOT NULL,
            limitations TEXT NOT NULL,
            reuse_status TEXT NOT NULL
        )
    """)


def migrate_market_signals(conn):
    columns = {
        row["name"]: row
        for row in conn.execute(
            "PRAGMA table_info(market_signals)"
        ).fetchall()
    }

    needs_migration = (
        "industry" not in columns
        or "industry_code" not in columns
        or columns["occupation"]["notnull"] == 1
        or columns["published_at"]["notnull"] == 1
    )

    if not needs_migration:
        return

    conn.execute("""
        ALTER TABLE market_signals
        RENAME TO market_signals_old
    """)

    create_market_signals_table(conn)

    conn.execute("""
        INSERT INTO market_signals (
            id, source_id, source_url, published_at,
            period_start, period_end, region, occupation,
            skill_id, industry, industry_code,
            metric, value, unit, comparison_period,
            evidence, limitations, reuse_status
        )
        SELECT
            id, source_id, source_url, published_at,
            period_start, period_end, region, occupation,
            skill_id, NULL, NULL,
            metric, value, unit, comparison_period,
            evidence, limitations, reuse_status
        FROM market_signals_old
    """)

    conn.execute("DROP TABLE market_signals_old")


def init_db():
    with get_connection() as conn:
        create_market_signals_table(conn)
        migrate_market_signals(conn)


def save_signal(signal: MarketSignal):
    data = signal.model_dump(mode="json")

    with get_connection() as conn:
        conn.execute("""
            INSERT INTO market_signals (
                id, source_id, source_url, published_at,
                period_start, period_end, region, occupation,
                skill_id, industry, industry_code,
                metric, value, unit, comparison_period,
                evidence, limitations, reuse_status
            )
            VALUES (
                :id, :source_id, :source_url, :published_at,
                :period_start, :period_end, :region, :occupation,
                :skill_id, :industry, :industry_code,
                :metric, :value, :unit, :comparison_period,
                :evidence, :limitations, :reuse_status
            )
        """, data)



def save_or_update_signal(signal: MarketSignal):
    """
    Save a signal or update it if the same ID already exists.
    Used for importing data from external sources.
    """
    data = signal.model_dump(mode="json")

    with get_connection() as conn:
        conn.execute("""
            INSERT INTO market_signals (
                id, source_id, source_url, published_at,
                period_start, period_end, region, occupation,
                skill_id, industry, industry_code,
                metric, value, unit, comparison_period,
                evidence, limitations, reuse_status
            )
            VALUES (
                :id, :source_id, :source_url, :published_at,
                :period_start, :period_end, :region, :occupation,
                :skill_id, :industry, :industry_code,
                :metric, :value, :unit, :comparison_period,
                :evidence, :limitations, :reuse_status
            )
            ON CONFLICT(id) DO UPDATE SET
                source_id = excluded.source_id,
                source_url = excluded.source_url,
                published_at = excluded.published_at,
                period_start = excluded.period_start,
                period_end = excluded.period_end,
                region = excluded.region,
                occupation = excluded.occupation,
                skill_id = excluded.skill_id,
                industry = excluded.industry,
                industry_code = excluded.industry_code,
                metric = excluded.metric,
                value = excluded.value,
                unit = excluded.unit,
                comparison_period = excluded.comparison_period,
                evidence = excluded.evidence,
                limitations = excluded.limitations,
                reuse_status = excluded.reuse_status
        """, data)


def get_signal(signal_id: str):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM market_signals WHERE id = ?",
            (signal_id,)
        ).fetchone()

    return dict(row) if row else None


def get_all_signals():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM market_signals ORDER BY period_end DESC"
        ).fetchall()

    return [dict(row) for row in rows]


def save_or_update_signals(signals):
    """
    Save or update a batch of signals in one transaction.
    Either the entire batch is committed or none of it is.
    """

    with get_connection() as conn:
        for signal in signals:
            data = signal.model_dump(mode="json")

            conn.execute("""
                INSERT INTO market_signals (
                    id, source_id, source_url, published_at,
                    period_start, period_end, region, occupation,
                    skill_id, industry, industry_code,
                    metric, value, unit, comparison_period,
                    evidence, limitations, reuse_status
                )
                VALUES (
                    :id, :source_id, :source_url, :published_at,
                    :period_start, :period_end, :region, :occupation,
                    :skill_id, :industry, :industry_code,
                    :metric, :value, :unit, :comparison_period,
                    :evidence, :limitations, :reuse_status
                )
                ON CONFLICT(id) DO UPDATE SET
                    source_id = excluded.source_id,
                    source_url = excluded.source_url,
                    published_at = excluded.published_at,
                    period_start = excluded.period_start,
                    period_end = excluded.period_end,
                    region = excluded.region,
                    occupation = excluded.occupation,
                    skill_id = excluded.skill_id,
                    industry = excluded.industry,
                    industry_code = excluded.industry_code,
                    metric = excluded.metric,
                    value = excluded.value,
                    unit = excluded.unit,
                    comparison_period = excluded.comparison_period,
                    evidence = excluded.evidence,
                    limitations = excluded.limitations,
                    reuse_status = excluded.reuse_status
            """, data)

