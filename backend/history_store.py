"""포트폴리오 일별 스냅샷 저장 (SQLite).

매일 1회만 적재되며 같은 날 다시 호출되면 최신값으로 덮어쓴다.
"""
from __future__ import annotations
import os
import sqlite3
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

_DATA_DIR = Path(os.environ.get("PORTFOLIO_DATA_DIR", str(Path(__file__).parent)))
_DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = _DATA_DIR / "history.db"
KST = timezone(timedelta(hours=9))


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH)
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS portfolio_snapshots (
            snapshot_date TEXT PRIMARY KEY,
            total_value_krw INTEGER NOT NULL,
            total_cost_krw INTEGER NOT NULL,
            total_profit_krw INTEGER NOT NULL,
            total_profit_pct REAL,
            usd_krw REAL,
            recorded_at TEXT NOT NULL
        )
        """
    )
    return c


def record_snapshot_from_summary(summary: dict) -> None:
    """오늘 날짜(KST) 기준으로 1행만 유지. 히스토리는 투자 계좌만 반영 (부동산 제외)."""
    today = datetime.now(KST).date().isoformat()
    re_equity = int(summary.get("real_estate_equity_krw") or 0)
    re_cost   = int(summary.get("real_estate_cost_krw") or 0)
    invest_value  = int(summary.get("total_value_krw") or 0) - re_equity
    invest_cost   = int(summary.get("total_cost_krw") or 0) - re_cost
    invest_profit = invest_value - invest_cost
    invest_profit_pct = (
        round(invest_profit / invest_cost * 100, 2) if invest_cost > 0 else None
    )
    with closing(_conn()) as c:
        with c:
            c.execute(
                """
                INSERT INTO portfolio_snapshots
                    (snapshot_date, total_value_krw, total_cost_krw, total_profit_krw, total_profit_pct, usd_krw, recorded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(snapshot_date) DO UPDATE SET
                    total_value_krw = excluded.total_value_krw,
                    total_cost_krw = excluded.total_cost_krw,
                    total_profit_krw = excluded.total_profit_krw,
                    total_profit_pct = excluded.total_profit_pct,
                    usd_krw = excluded.usd_krw,
                    recorded_at = excluded.recorded_at
                """,
                (
                    today,
                    invest_value,
                    invest_cost,
                    invest_profit,
                    invest_profit_pct,
                    summary.get("usd_krw"),
                    datetime.now(KST).isoformat(),
                ),
            )


def get_history(days: int = 365) -> list[dict]:
    cutoff = (datetime.now(KST).date() - timedelta(days=days)).isoformat()
    with closing(_conn()) as c:
        rows = c.execute(
            """
            SELECT snapshot_date, total_value_krw, total_cost_krw,
                   total_profit_krw, total_profit_pct, usd_krw
            FROM portfolio_snapshots
            WHERE snapshot_date >= ?
            ORDER BY snapshot_date ASC
            """,
            (cutoff,),
        ).fetchall()
    return [
        {
            "date": r[0],
            "total_value_krw": r[1],
            "total_cost_krw": r[2],
            "total_profit_krw": r[3],
            "total_profit_pct": r[4],
            "usd_krw": r[5],
        }
        for r in rows
    ]
