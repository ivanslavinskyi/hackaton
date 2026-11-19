
import sqlite3
from pathlib import Path

from app.schemas import MarketSignal


DB_PATH = Path(__file__).resolve().parent.parent / "data" / "market_radar.db"


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row

    return connection


def init_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS market_signals (
                id TEXT PRIMARY KEY,
                source_id TEXT NOT NULL,
                source_url TEXT NOT NULL,
                published_at TEXT NOT NULL,
                period_start TEXT NOT NULL,
                period_end TEXT NOT NULL,
                region TEXT NOT NULL,
                occupation TEXT NOT NULL,
                skill_id TEXT,
                metric TEXT NOT NULL,
                value REAL NOT NULL,
                unit TEXT NOT NULL,
                comparison_period TEXT,
                evidence TEXT NOT NULL,
                limitations TEXT NOT NULL,
                reuse_status TEXT NOT NULL
            )
        """)

        conn.commit()


def save_signal(signal: MarketSignal):
    data = signal.model_dump(mode="json")

    with get_connection() as conn:
        conn.execute("""
            INSERT INTO market_signals (
                id, source_id, source_url, published_at,
                period_start, period_end, region, occupation,
                skill_id, metric, value, unit, comparison_period,
                evidence, limitations, reuse_status
            )
            VALUES (
                :id, :source_id, :source_url, :published_at,
                :period_start, :period_end, :region, :occupation,
                :skill_id, :metric, :value, :unit, :comparison_period,
                :evidence, :limitations, :reuse_status
            )
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
            "SELECT * FROM market_signals ORDER BY published_at DESC"
        ).fetchall()

    return [dict(row) for row in rows]
