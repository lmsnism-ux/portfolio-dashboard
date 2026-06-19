"""외부 현금흐름 장부와 현금흐름 보정 성과 계산."""
from __future__ import annotations

import math
import os
import sqlite3
from contextlib import closing
from datetime import date, datetime
from pathlib import Path

_DATA_DIR = Path(os.environ.get("PORTFOLIO_DATA_DIR", str(Path(__file__).parent)))
_DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = _DATA_DIR / "history.db"


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cash_flows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            flow_type TEXT NOT NULL CHECK (flow_type IN ('deposit','withdrawal')),
            amount_krw INTEGER NOT NULL CHECK (amount_krw > 0),
            occurred_on TEXT NOT NULL,
            account_name TEXT,
            note TEXT,
            recorded_at TEXT NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_cash_flows_date ON cash_flows(occurred_on)")
    return conn


def insert_cash_flow(*, flow_type: str, amount_krw: int, occurred_on: str, account_name: str | None = None, note: str | None = None) -> int:
    if flow_type not in ("deposit", "withdrawal"):
        raise ValueError("invalid flow_type")
    date.fromisoformat(occurred_on)
    if amount_krw <= 0:
        raise ValueError("amount_krw must be positive")
    with closing(_conn()) as conn:
        with conn:
            cur = conn.execute(
                "INSERT INTO cash_flows (flow_type, amount_krw, occurred_on, account_name, note, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
                (flow_type, int(amount_krw), occurred_on, account_name, note, datetime.now().isoformat()),
            )
            return int(cur.lastrowid or 0)


def list_cash_flows(*, days: int = 730) -> list[dict]:
    with closing(_conn()) as conn:
        rows = conn.execute(
            """
            SELECT id, flow_type, amount_krw, occurred_on, account_name, note, recorded_at
            FROM cash_flows
            WHERE occurred_on >= date('now', ?)
            ORDER BY occurred_on DESC, id DESC
            """,
            (f"-{max(1, days)} days",),
        ).fetchall()
    return [
        {"id": r[0], "flow_type": r[1], "amount_krw": r[2], "occurred_on": r[3], "account_name": r[4], "note": r[5], "recorded_at": r[6]}
        for r in rows
    ]


def delete_cash_flow(flow_id: int) -> bool:
    with closing(_conn()) as conn:
        with conn:
            cur = conn.execute("DELETE FROM cash_flows WHERE id = ?", (flow_id,))
            return cur.rowcount > 0


def _xirr(cash_flows: list[tuple[date, float]]) -> float | None:
    if len(cash_flows) < 2 or not any(v < 0 for _, v in cash_flows) or not any(v > 0 for _, v in cash_flows):
        return None
    start = min(d for d, _ in cash_flows)

    def npv(rate: float) -> float:
        return sum(value / ((1 + rate) ** ((day - start).days / 365)) for day, value in cash_flows)

    low, high = -0.9999, 10.0
    low_value, high_value = npv(low), npv(high)
    if not math.isfinite(low_value) or low_value * high_value > 0:
        return None
    for _ in range(100):
        mid = (low + high) / 2
        value = npv(mid)
        if abs(value) < 0.01:
            return mid
        if low_value * value <= 0:
            high = mid
        else:
            low, low_value = mid, value
    return (low + high) / 2


def calculate_performance(history: list[dict], flows: list[dict]) -> dict:
    if len(history) < 2:
        return {"available": False}
    ordered = sorted(history, key=lambda item: item["date"])
    flow_by_date: dict[str, float] = {}
    for flow in flows:
        signed = flow["amount_krw"] if flow["flow_type"] == "deposit" else -flow["amount_krw"]
        flow_by_date[flow["occurred_on"]] = flow_by_date.get(flow["occurred_on"], 0) + signed

    twr_factor = 1.0
    peak = float(ordered[0]["total_value_krw"])
    max_drawdown = 0.0
    daily_returns: list[float] = []
    for previous, current in zip(ordered, ordered[1:]):
        start_value = float(previous["total_value_krw"])
        end_value = float(current["total_value_krw"])
        external_flow = flow_by_date.get(current["date"], 0.0)
        if start_value > 0:
            daily_return = (end_value - external_flow) / start_value - 1
            twr_factor *= 1 + daily_return
            daily_returns.append(daily_return)
        peak = max(peak, end_value)
        if peak > 0:
            max_drawdown = min(max_drawdown, end_value / peak - 1)

    first_value = int(ordered[0]["total_value_krw"])
    last_value = int(ordered[-1]["total_value_krw"])
    net_flow = int(sum(flow_by_date.values()))
    xirr_flows: list[tuple[date, float]] = [(date.fromisoformat(ordered[0]["date"]), -first_value)]
    for flow in flows:
        value = -flow["amount_krw"] if flow["flow_type"] == "deposit" else flow["amount_krw"]
        xirr_flows.append((date.fromisoformat(flow["occurred_on"]), value))
    xirr_flows.append((date.fromisoformat(ordered[-1]["date"]), last_value))
    mwr = _xirr(xirr_flows)
    mean = sum(daily_returns) / len(daily_returns) if daily_returns else 0
    variance = sum((value - mean) ** 2 for value in daily_returns) / max(1, len(daily_returns) - 1)
    return {
        "available": True,
        "from_date": ordered[0]["date"],
        "to_date": ordered[-1]["date"],
        "start_value_krw": first_value,
        "end_value_krw": last_value,
        "net_external_flow_krw": net_flow,
        "investment_result_krw": last_value - first_value - net_flow,
        "twr_pct": round((twr_factor - 1) * 100, 2),
        "mwr_annual_pct": round(mwr * 100, 2) if mwr is not None else None,
        "max_drawdown_pct": round(max_drawdown * 100, 2),
        "annualized_volatility_pct": round(math.sqrt(variance) * math.sqrt(252) * 100, 2),
        "snapshot_count": len(ordered),
    }
