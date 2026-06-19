"""투자 판단과 사후 검토 기록."""
from __future__ import annotations

import os
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path

_DATA_DIR = Path(os.environ.get("PORTFOLIO_DATA_DIR", str(Path(__file__).parent)))
_DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = _DATA_DIR / "history.db"


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS investment_decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            thesis TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','dismissed')),
            review_on TEXT,
            outcome_note TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    return conn


def create_decision(*, title: str, thesis: str, review_on: str | None = None) -> int:
    if not title.strip() or not thesis.strip():
        raise ValueError("title and thesis are required")
    now = datetime.now().isoformat()
    with closing(_conn()) as conn:
        with conn:
            cur = conn.execute(
                "INSERT INTO investment_decisions (title, thesis, review_on, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (title.strip(), thesis.strip(), review_on or None, now, now),
            )
            return int(cur.lastrowid or 0)


def list_decisions(limit: int = 100) -> list[dict]:
    with closing(_conn()) as conn:
        rows = conn.execute(
            "SELECT id, title, thesis, status, review_on, outcome_note, created_at, updated_at FROM investment_decisions ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    keys = ("id", "title", "thesis", "status", "review_on", "outcome_note", "created_at", "updated_at")
    return [dict(zip(keys, row)) for row in rows]


def update_decision(decision_id: int, *, status: str, outcome_note: str | None = None) -> bool:
    if status not in ("planned", "done", "dismissed"):
        raise ValueError("invalid status")
    with closing(_conn()) as conn:
        with conn:
            cur = conn.execute(
                "UPDATE investment_decisions SET status = ?, outcome_note = ?, updated_at = ? WHERE id = ?",
                (status, outcome_note or None, datetime.now().isoformat(), decision_id),
            )
            return cur.rowcount > 0
