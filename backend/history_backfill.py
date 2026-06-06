"""자산 추이 backfill.

현재 보유 수량을 그대로 두고, 각 종목의 과거 N일 종가 × 그날 환율로
일별 자산 가치를 재계산해 history.db에 채워준다.

가정/단순화:
- 현재 보유수량이 모든 날짜에 동일했다고 가정 (실제 매수 시점 무시)
- 스냅샷 종목(삼성 디폴트옵션)은 매일 동일한 평가가치로 가정
- 평단가 정보가 있으면 cost는 그대로 보존, 없으면 0
- 시장 휴장일(시계열에 데이터 없는 날)은 직전 영업일 종가 사용
"""
from __future__ import annotations

import logging
import time
from datetime import date, datetime, timedelta, timezone

import requests
from bs4 import BeautifulSoup

from history_store import _conn  # noqa: F401  (테이블 초기화 보장)
from portfolio_calculator import load_portfolio

logger = logging.getLogger(__name__)
KST = timezone(timedelta(hours=9))


def fetch_us_series(ticker: str, days: int = 60) -> dict[str, float]:
    """Yahoo chart API로 일자별 종가 시계열 반환 (date -> close)."""
    rng = "3mo" if days <= 90 else "6mo"
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range={rng}&interval=1d"
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    try:
        r = requests.get(url, headers=headers, timeout=15)
        data = r.json()
        result = data.get("chart", {}).get("result", [])
        if not result:
            return {}
        ts = result[0].get("timestamp", []) or []
        closes = result[0]["indicators"]["quote"][0].get("close", []) or []
        out: dict[str, float] = {}
        for t, c in zip(ts, closes):
            if c is None:
                continue
            d = datetime.fromtimestamp(t, tz=timezone.utc).astimezone(KST).date().isoformat()
            out[d] = float(c)
        return out
    except Exception as e:
        logger.warning(f"Yahoo {ticker} 시계열 실패: {e}")
        return {}


def fetch_krw_fx_series(days: int = 60) -> dict[str, float]:
    """USD/KRW 환율 일자별 시계열."""
    return fetch_us_series("KRW=X", days=days)


def fetch_kr_etf_series(ticker: str, pages: int = 4) -> dict[str, float]:
    """네이버 sise_day로 한국 ETF 일자별 종가 시계열."""
    out: dict[str, float] = {}
    for page in range(1, pages + 1):
        try:
            url = f"https://finance.naver.com/item/sise_day.naver?code={ticker}&page={page}"
            r = requests.get(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Referer": f"https://finance.naver.com/item/main.naver?code={ticker}",
                },
                timeout=10,
            )
            r.encoding = "euc-kr"
            soup = BeautifulSoup(r.text, "html.parser")
            table = soup.select_one("table.type2")
            if not table:
                continue
            for tr in table.select("tr"):
                tds = tr.select("td")
                if len(tds) < 2:
                    continue
                date_text = tds[0].get_text(strip=True)
                close_text = tds[1].get_text(strip=True).replace(",", "")
                if not date_text or not close_text:
                    continue
                try:
                    d = datetime.strptime(date_text, "%Y.%m.%d").date().isoformat()
                    out[d] = float(close_text)
                except ValueError:
                    continue
        except Exception as e:
            logger.warning(f"네이버 sise_day {ticker} p{page} 실패: {e}")
        time.sleep(0.3)
    return out


def _nearest_value(series: dict[str, float], target: str) -> float | None:
    """target 날짜 이하 중 가장 가까운 값."""
    if not series:
        return None
    keys = sorted(k for k in series.keys() if k <= target)
    if not keys:
        # target 이전 데이터 없으면 가장 이른 데이터 사용
        first = min(series.keys())
        return series[first]
    return series[keys[-1]]


def backfill_history(days: int = 30) -> int:
    """과거 N일 자산 가치를 계산해 history.db에 upsert. 반환: 적재 행 수."""
    portfolio = load_portfolio()

    # 종목별 시계열 수집
    series_by_ticker: dict[str, dict[str, float]] = {}
    us_tickers: set[str] = set()
    kr_tickers: set[str] = set()
    for account in portfolio["accounts"]:
        currency = account.get("currency", "KRW")
        for h in account["holdings"]:
            t = h.get("ticker")
            if not t:
                continue
            if currency == "USD":
                us_tickers.add(t)
            else:
                kr_tickers.add(t)

    for t in us_tickers:
        series_by_ticker[t] = fetch_us_series(t, days=days + 10)
        logger.info(f"backfill US {t}: {len(series_by_ticker[t])}d")
        time.sleep(0.3)
    for t in kr_tickers:
        series_by_ticker[t] = fetch_kr_etf_series(t, pages=max(2, days // 10 + 1))
        logger.info(f"backfill KR {t}: {len(series_by_ticker[t])}d")
        time.sleep(0.3)

    fx_series = fetch_krw_fx_series(days=days + 10)
    logger.info(f"backfill FX: {len(fx_series)}d")

    # 날짜별 자산 가치 계산
    today = datetime.now(KST).date()
    rows: list[tuple] = []
    for offset in range(days, -1, -1):
        d = today - timedelta(days=offset)
        d_iso = d.isoformat()

        # 주말은 건너뜀 (한국·미국 모두 휴장)
        if d.weekday() >= 5:
            continue

        fx = _nearest_value(fx_series, d_iso) or 1400.0
        total_value = 0.0
        total_cost = 0.0

        for account in portfolio["accounts"]:
            currency = account.get("currency", "KRW")
            for h in account["holdings"]:
                shares = h.get("shares")
                ticker = h.get("ticker")
                snap = h.get("snapshot_value_krw")

                # 스냅샷 종목은 매일 동일 가치로
                if snap and not ticker:
                    total_value += snap
                    total_cost += h.get("buy_amount_krw", snap)
                    continue

                if not ticker or not shares:
                    continue

                close = _nearest_value(series_by_ticker.get(ticker, {}), d_iso)
                if close is None:
                    continue

                if currency == "USD":
                    value_krw = shares * close * fx
                    avg = h.get("avg_price_usd")
                    cost_krw = (shares * avg * fx) if avg else 0
                else:
                    value_krw = shares * close
                    avg = h.get("avg_price_krw")
                    cost_krw = (shares * avg) if avg else 0

                total_value += value_krw
                total_cost += cost_krw

        if total_value == 0:
            continue

        profit = total_value - total_cost
        profit_pct = (profit / total_cost * 100) if total_cost > 0 else None
        rows.append(
            (
                d_iso,
                int(total_value),
                int(total_cost),
                int(profit),
                profit_pct,
                fx,
                datetime.now(KST).isoformat(),
            )
        )

    # 일괄 upsert
    with _conn() as c:
        c.executemany(
            """
            INSERT INTO portfolio_snapshots
                (snapshot_date, total_value_krw, total_cost_krw, total_profit_krw,
                 total_profit_pct, usd_krw, recorded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(snapshot_date) DO UPDATE SET
                total_value_krw = excluded.total_value_krw,
                total_cost_krw = excluded.total_cost_krw,
                total_profit_krw = excluded.total_profit_krw,
                total_profit_pct = excluded.total_profit_pct,
                usd_krw = excluded.usd_krw,
                recorded_at = excluded.recorded_at
            """,
            rows,
        )

    logger.info(f"backfill 완료: {len(rows)}일치 적재")
    return len(rows)
