"""SQLite 기반 가격 캐시 스토어 — price_cache.json 대체.

기존 _load_cache() / _save_cache() 인터페이스를 유지하므로
price_fetcher.py에서 drop-in 교체 가능.
추가: 티커별 에러 횟수·마지막 에러 메시지 추적.
"""
from __future__ import annotations
import json
import logging
import os
import sqlite3
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

_DATA_DIR = Path(os.environ.get("PORTFOLIO_DATA_DIR", str(Path(__file__).parent)))
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_DB_PATH = _DATA_DIR / "price_cache.db"

_lock = threading.Lock()


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _lock, _get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS price_cache (
                ticker      TEXT PRIMARY KEY,
                data_json   TEXT NOT NULL,
                updated_at  TEXT NOT NULL,
                error_count INTEGER NOT NULL DEFAULT 0,
                last_error  TEXT
            );
            CREATE TABLE IF NOT EXISTS meta (
                key   TEXT PRIMARY KEY,
                value TEXT
            );
        """)


_init_db()


# ── 레거시 호환 인터페이스 ────────────────────────────────────────────────

def load_cache() -> dict:
    """price_fetcher.py의 _load_cache() 대체."""
    with _lock, _get_conn() as conn:
        prices: dict = {}
        for row in conn.execute("SELECT ticker, data_json FROM price_cache"):
            try:
                prices[row["ticker"]] = json.loads(row["data_json"])
            except Exception:
                pass

        meta: dict = {}
        for row in conn.execute("SELECT key, value FROM meta"):
            try:
                meta[row["key"]] = json.loads(row["value"])
            except Exception:
                meta[row["key"]] = row["value"]

    return {
        "prices": prices,
        "usd_krw": meta.get("usd_krw"),
        "usd_krw_prev": meta.get("usd_krw_prev"),
        "updated_at": meta.get("updated_at"),
    }


def save_cache(data: dict) -> None:
    """price_fetcher.py의 _save_cache() 대체."""
    prices: dict = data.get("prices", {})
    now = datetime.now(timezone(timedelta(hours=9))).isoformat()

    with _lock, _get_conn() as conn:
        for ticker, info in prices.items():
            conn.execute(
                """
                INSERT INTO price_cache (ticker, data_json, updated_at, error_count)
                VALUES (?, ?, ?, 0)
                ON CONFLICT(ticker) DO UPDATE SET
                    data_json  = excluded.data_json,
                    updated_at = excluded.updated_at,
                    error_count = 0,
                    last_error  = NULL
                """,
                (ticker, json.dumps(info, ensure_ascii=False), now),
            )
        # meta 갱신
        meta_items = {
            "usd_krw":      data.get("usd_krw"),
            "usd_krw_prev": data.get("usd_krw_prev"),
            "updated_at":   data.get("updated_at") or now,
        }
        for k, v in meta_items.items():
            if v is not None:
                conn.execute(
                    "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                    (k, json.dumps(v)),
                )


# ── 에러 추적 (추가 기능) ────────────────────────────────────────────────

def record_price_error(ticker: str, error_msg: str) -> None:
    """가격 조회 실패 시 에러 카운트·메시지 기록."""
    with _lock, _get_conn() as conn:
        conn.execute(
            """
            INSERT INTO price_cache (ticker, data_json, updated_at, error_count, last_error)
            VALUES (?, '{}', datetime('now'), 1, ?)
            ON CONFLICT(ticker) DO UPDATE SET
                error_count = error_count + 1,
                last_error  = excluded.last_error
            """,
            (ticker, error_msg[:500]),
        )


def get_price_errors() -> list[dict]:
    """에러가 있는 티커 목록 반환 (프론트 헬스 표시용)."""
    with _lock, _get_conn() as conn:
        rows = conn.execute(
            "SELECT ticker, error_count, last_error, updated_at FROM price_cache WHERE error_count > 0"
        ).fetchall()
    return [dict(r) for r in rows]


def migrate_from_json(json_path: Path) -> bool:
    """기존 price_cache.json → SQLite 마이그레이션 (최초 1회)."""
    if not json_path.exists():
        return False
    try:
        data = json.loads(json_path.read_text())
        save_cache(data)
        json_path.rename(json_path.with_suffix(".json.bak"))
        logger.info("price_cache.json → SQLite 마이그레이션 완료")
        return True
    except Exception as e:
        logger.warning(f"마이그레이션 실패 (기존 파일 유지): {e}")
        return False
