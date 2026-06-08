"""체결(매수/매도) 내역 SQLite 저장소.

매수/매도 시 trade를 기록해두면:
  - 평단가 가중평균 계산을 검증할 수 있고
  - 종목별 거래 히스토리를 보여줄 수 있고
  - 양도세 계산의 기반 데이터가 된다.
"""
from __future__ import annotations
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

_DATA_DIR = Path(os.environ.get("PORTFOLIO_DATA_DIR", str(Path(__file__).parent)))
_DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = _DATA_DIR / "history.db"
KST = timezone(timedelta(hours=9))


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH)
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_name TEXT NOT NULL,
            holding_key TEXT NOT NULL,
            name TEXT NOT NULL,
            ticker TEXT,
            side TEXT NOT NULL CHECK (side IN ('buy','sell')),
            shares REAL NOT NULL,
            price REAL,
            currency TEXT NOT NULL DEFAULT 'KRW',
            traded_at TEXT NOT NULL,
            recorded_at TEXT NOT NULL,
            note TEXT
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_trades_account_holding ON trades(account_name, holding_key, traded_at)"
    )
    return c


def insert_trade(
    *,
    account_name: str,
    holding_key: str,
    name: str,
    ticker: str | None,
    side: str,
    shares: float,
    price: float | None,
    currency: str,
    traded_at: str | None = None,
    note: str | None = None,
) -> int:
    """체결 기록. traded_at은 ISO 문자열 (KST). 미지정 시 지금."""
    if side not in ("buy", "sell"):
        raise ValueError(f"invalid side: {side}")
    now_iso = datetime.now(KST).isoformat()
    if not traded_at:
        traded_at = now_iso
    with _conn() as c:
        cur = c.execute(
            """
            INSERT INTO trades
                (account_name, holding_key, name, ticker, side, shares, price, currency, traded_at, recorded_at, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                account_name,
                holding_key,
                name,
                ticker,
                side,
                float(shares),
                float(price) if price is not None else None,
                currency,
                traded_at,
                now_iso,
                note,
            ),
        )
        return cur.lastrowid or 0


def list_trades(
    *,
    account_name: str | None = None,
    holding_key: str | None = None,
    limit: int = 200,
) -> list[dict]:
    where = []
    params: list = []
    if account_name:
        where.append("account_name = ?")
        params.append(account_name)
    if holding_key:
        where.append("holding_key = ?")
        params.append(holding_key)
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    params.append(limit)
    with _conn() as c:
        rows = c.execute(
            f"""
            SELECT id, account_name, holding_key, name, ticker, side,
                   shares, price, currency, traded_at, recorded_at, note
            FROM trades
            {where_sql}
            ORDER BY traded_at DESC, id DESC
            LIMIT ?
            """,
            params,
        ).fetchall()
    return [
        {
            "id": r[0],
            "account_name": r[1],
            "holding_key": r[2],
            "name": r[3],
            "ticker": r[4],
            "side": r[5],
            "shares": r[6],
            "price": r[7],
            "currency": r[8],
            "traded_at": r[9],
            "recorded_at": r[10],
            "note": r[11],
        }
        for r in rows
    ]


def delete_trade(trade_id: int) -> bool:
    with _conn() as c:
        cur = c.execute("DELETE FROM trades WHERE id = ?", (trade_id,))
        return cur.rowcount > 0


def aggregate_for_holding(account_name: str, holding_key: str) -> dict:
    """종목의 모든 매수/매도를 합산해 보유수량·총원가·평단가를 재계산.

    매수: 총 매수금 / 총 매수 수량 = 평단
    매도: 보유수량만 감소, 평단은 유지 (선입선출 아닌 가중평균 모델)
    """
    trades = list_trades(account_name=account_name, holding_key=holding_key, limit=10_000)
    total_buy_shares = 0.0
    total_buy_amount = 0.0
    total_sell_shares = 0.0
    for t in trades:
        if t["side"] == "buy" and t["price"] is not None:
            total_buy_shares += t["shares"]
            total_buy_amount += t["shares"] * t["price"]
        elif t["side"] == "sell":
            total_sell_shares += t["shares"]
    net_shares = total_buy_shares - total_sell_shares
    avg_price = (total_buy_amount / total_buy_shares) if total_buy_shares > 0 else None
    return {
        "trade_count": len(trades),
        "total_buy_shares": total_buy_shares,
        "total_buy_amount": total_buy_amount,
        "total_sell_shares": total_sell_shares,
        "net_shares": net_shares,
        "avg_price_from_trades": avg_price,
    }
