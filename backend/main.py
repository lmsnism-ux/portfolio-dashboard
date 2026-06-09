"""FastAPI 포트폴리오 대시보드 백엔드"""
from __future__ import annotations
import asyncio
import logging
import os
import time
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import Any, Optional
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from apscheduler.schedulers.background import BackgroundScheduler

from price_fetcher import refresh_all_prices, get_cached_prices
from portfolio_calculator import load_portfolio, build_portfolio_summary, save_portfolio
from history_store import record_snapshot_from_summary, get_history
from history_backfill import backfill_history
from trade_store import (
    insert_trade,
    list_trades,
    delete_trade,
    aggregate_for_holding,
)

STALE_THRESHOLD_HOURS = 12

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 시작 시 즉시 한 번 갱신
    try:
        logger.info("초기 가격 데이터 로딩 중...")
        refresh_all_prices()
        logger.info("초기 가격 데이터 로딩 완료")
    except Exception as e:
        logger.error(f"초기 가격 로딩 실패: {e}")

    # 히스토리가 부족하면 30일 backfill
    try:
        existing = get_history(days=60)
        if len(existing) < 10:
            logger.info("히스토리 부족 — 30일 backfill 시작")
            backfill_history(days=30)
    except Exception as e:
        logger.warning(f"히스토리 backfill 실패: {e}")

    # 7분마다 자동 갱신
    scheduler.add_job(refresh_all_prices, "interval", minutes=7, id="price_refresh")
    # 매일 00:30 KST에 backfill 재실행 (당일 종가 반영)
    scheduler.add_job(lambda: backfill_history(days=7), "cron", hour=0, minute=30, id="daily_backfill")
    scheduler.start()
    logger.info("스케줄러 시작 (7분 갱신 + 매일 backfill)")

    yield

    scheduler.shutdown()
    logger.info("스케줄러 종료")

app = FastAPI(title="Portfolio Dashboard API", lifespan=lifespan)

_extra_origins = [
    o.strip() for o in (os.environ.get("ALLOWED_ORIGINS", "")).split(",") if o.strip()
]

# API 인증
# - PORTFOLIO_API_KEY: 설정되면 쓰기 엔드포인트에 X-API-Key 헤더 필수
# - LAN_REQUIRE_AUTH=1: PORTFOLIO_API_KEY 미설정 시에도 사설망 자동 통과를 차단
# - READ_REQUIRE_AUTH=1: /api/portfolio, /api/history 등 자산 정보를 노출하는
#   읽기 엔드포인트에도 X-API-Key 요구 (외부 도메인 호스팅 시 권장)
_API_KEY = os.environ.get("PORTFOLIO_API_KEY", "").strip()
_LAN_AUTH_REQUIRED = os.environ.get("LAN_REQUIRE_AUTH", "0") == "1"
_READ_REQUIRE_AUTH = os.environ.get("READ_REQUIRE_AUTH", "0") == "1"


def _check_api_key(
    request: Request,
    x_api_key: Optional[str],
) -> None:
    """공통 인증 로직."""
    if _API_KEY:
        if x_api_key != _API_KEY:
            raise HTTPException(status_code=401, detail="invalid api key")
        return

    # 키 미설정 → LAN_REQUIRE_AUTH=1이면 차단, 아니면 사설망만 통과
    client_host = (request.client.host if request.client else "") or ""
    is_lan = (
        client_host in ("127.0.0.1", "localhost", "::1")
        or client_host.startswith("192.168.")
        or client_host.startswith("10.")
        or any(client_host.startswith(f"172.{i}.") for i in range(16, 32))
    )
    if _LAN_AUTH_REQUIRED or not is_lan:
        raise HTTPException(
            status_code=401,
            detail="api key required (set PORTFOLIO_API_KEY and send X-API-Key header)",
        )


def require_api_key(
    request: Request,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
) -> None:
    """쓰기 엔드포인트 보호."""
    _check_api_key(request, x_api_key)


def require_read_auth(
    request: Request,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
) -> None:
    """자산 정보 노출 읽기 엔드포인트 보호.

    READ_REQUIRE_AUTH=1 일 때만 인증을 강제한다. 미설정이면 pass-through.
    외부 도메인에 호스팅하는 경우 켜는 것을 권장.
    """
    if not _READ_REQUIRE_AUTH:
        return
    _check_api_key(request, x_api_key)


app.add_middleware(
    CORSMiddleware,
    # 운영 도메인은 ALLOWED_ORIGINS env로 명시. LAN regex는 사설망만 허용.
    allow_origins=_extra_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    # X-API-Key 헤더 허용 명시
    allow_headers=["*", "X-API-Key"],
)

def _cache_stale_hours(updated_at: str | None) -> float | None:
    if not updated_at:
        return None
    try:
        ts = datetime.fromisoformat(updated_at)
        if ts.tzinfo is not None:
            return (datetime.now(timezone.utc) - ts.astimezone(timezone.utc)).total_seconds() / 3600
        return (datetime.now() - ts).total_seconds() / 3600
    except Exception:
        return None


@app.get("/api/portfolio", dependencies=[Depends(require_read_auth)])
async def get_portfolio():
    """전체 포트폴리오 현황 반환"""
    try:
        cache = get_cached_prices()
        prices = cache.get("prices", {})
        usd_krw_cached = cache.get("usd_krw")
        usd_krw_prev = cache.get("usd_krw_prev")

        portfolio = load_portfolio()
        usd_krw = usd_krw_cached or 1400

        summary = build_portfolio_summary(portfolio, prices, usd_krw, usd_krw_prev)
        summary["price_updated_at"] = cache.get("updated_at")

        stale_hours = _cache_stale_hours(cache.get("updated_at"))
        summary["cache_stale_hours"] = round(stale_hours, 1) if stale_hours is not None else None
        summary["cache_is_stale"] = (stale_hours or 0) > STALE_THRESHOLD_HOURS

        # 일별 스냅샷 적재 (당일 1회만)
        try:
            record_snapshot_from_summary(summary)
        except Exception as e:
            logger.warning(f"스냅샷 적재 실패: {e}")

        return JSONResponse(content=summary, headers={"Cache-Control": "no-store"})
    except Exception as e:
        logger.error(f"포트폴리오 계산 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history", dependencies=[Depends(require_read_auth)])
async def get_portfolio_history(days: int = 365):
    """일별 자산 추이"""
    try:
        return {"items": get_history(days=days)}
    except Exception as e:
        logger.error(f"히스토리 조회 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/history/backfill", dependencies=[Depends(require_api_key)])
async def force_backfill(days: int = 30):
    """과거 N일 자산 추이를 다시 계산해서 채움 (수동 트리거)"""
    try:
        n = backfill_history(days=days)
        return {"status": "ok", "filled_days": n}
    except Exception as e:
        logger.error(f"backfill 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class AutoBuyUpdate(BaseModel):
    enabled: bool
    amount_usd: Optional[float] = None
    amount_krw: Optional[float] = None
    frequency: Optional[str] = None  # 'daily_weekday' | 'weekly_monday'


class HoldingUpdate(BaseModel):
    account_name: str
    holding_key: str  # ticker 우선, 없으면 name
    shares: Optional[float] = None
    avg_price_krw: Optional[float] = None
    avg_price_usd: Optional[float] = None
    snapshot_value_krw: Optional[float] = None   # 예수금/스냅샷 잔액
    snapshot_value_usd: Optional[float] = None
    auto_buy: Optional[AutoBuyUpdate] = None
    remove_auto_buy: bool = False  # True → auto_buy 키 완전 제거


@app.patch("/api/portfolio/holding", dependencies=[Depends(require_api_key)])
async def update_holding(update: HoldingUpdate):
    """종목 보유수량/평단가/자동매수 수정"""
    try:
        portfolio = load_portfolio()
        account = next((a for a in portfolio["accounts"] if a["name"] == update.account_name), None)
        if not account:
            raise HTTPException(status_code=404, detail="계좌를 찾을 수 없습니다")

        def matches(h: dict) -> bool:
            return (h.get("ticker") and h["ticker"] == update.holding_key) or (
                not h.get("ticker") and h.get("name") == update.holding_key
            )

        holding = next((h for h in account["holdings"] if matches(h)), None)
        if not holding:
            raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다")

        if update.shares is not None:
            holding["shares"] = update.shares
        if update.avg_price_krw is not None:
            holding["avg_price_krw"] = update.avg_price_krw
        if update.avg_price_usd is not None:
            holding["avg_price_usd"] = update.avg_price_usd
        if update.snapshot_value_krw is not None:
            holding["snapshot_value_krw"] = update.snapshot_value_krw
        if update.snapshot_value_usd is not None:
            holding["snapshot_value_usd"] = update.snapshot_value_usd
        if update.remove_auto_buy:
            holding.pop("auto_buy", None)
        elif update.auto_buy is not None:
            ab = holding.get("auto_buy") or {}
            ab["enabled"] = update.auto_buy.enabled
            if update.auto_buy.amount_usd is not None:
                ab["amount_usd"] = update.auto_buy.amount_usd
            if update.auto_buy.amount_krw is not None:
                ab["amount_krw"] = update.auto_buy.amount_krw
            if update.auto_buy.frequency:
                ab["frequency"] = update.auto_buy.frequency
            holding["auto_buy"] = ab

        save_portfolio(portfolio)
        return {"status": "ok", "holding": holding}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"holding 수정 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class GoalUpdate(BaseModel):
    goal_krw: int


class HoldingCreate(BaseModel):
    account_name: str
    name: str
    ticker: Optional[str] = None
    shares: Optional[float] = None
    avg_price_krw: Optional[float] = None
    avg_price_usd: Optional[float] = None
    asset_class: Optional[str] = None
    region: Optional[str] = None
    asset_type: Optional[str] = None
    auto_buy: Optional[AutoBuyUpdate] = None


class HoldingDelete(BaseModel):
    account_name: str
    holding_key: str  # ticker 우선, 없으면 name


class AccountCreate(BaseModel):
    name: str
    type: str
    currency: Optional[str] = "KRW"
    etf_limit: Optional[float] = None


class AccountOrder(BaseModel):
    names: list[str]  # 새 순서대로의 계좌명


@app.post("/api/portfolio/holding", dependencies=[Depends(require_api_key)])
async def add_holding(create: HoldingCreate):
    """계좌에 종목 추가"""
    try:
        portfolio = load_portfolio()
        account = next((a for a in portfolio["accounts"] if a["name"] == create.account_name), None)
        if not account:
            raise HTTPException(status_code=404, detail="계좌를 찾을 수 없습니다")

        new_holding: dict[str, Any] = {"name": create.name}
        if create.ticker is not None:
            new_holding["ticker"] = create.ticker
        if create.shares is not None:
            new_holding["shares"] = create.shares
        if create.avg_price_krw is not None:
            new_holding["avg_price_krw"] = create.avg_price_krw
        if create.avg_price_usd is not None:
            new_holding["avg_price_usd"] = create.avg_price_usd
        if create.asset_class:
            new_holding["asset_class"] = create.asset_class
        if create.region:
            new_holding["region"] = create.region
        if create.asset_type:
            new_holding["asset_type"] = create.asset_type
        if create.auto_buy:
            ab: dict[str, Any] = {"enabled": create.auto_buy.enabled}
            if create.auto_buy.amount_usd is not None:
                ab["amount_usd"] = create.auto_buy.amount_usd
            if create.auto_buy.amount_krw is not None:
                ab["amount_krw"] = create.auto_buy.amount_krw
            if create.auto_buy.frequency:
                ab["frequency"] = create.auto_buy.frequency
            new_holding["auto_buy"] = ab

        # 중복 체크 (같은 ticker 같은 계좌 금지)
        if create.ticker:
            for h in account["holdings"]:
                if h.get("ticker") == create.ticker:
                    raise HTTPException(status_code=409, detail="이미 동일 종목이 있는 계좌입니다")

        account["holdings"].append(new_holding)
        save_portfolio(portfolio)
        return {"status": "ok", "holding": new_holding}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"holding 추가 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/portfolio/holding", dependencies=[Depends(require_api_key)])
async def delete_holding(delete: HoldingDelete):
    """종목 제거"""
    try:
        portfolio = load_portfolio()
        account = next((a for a in portfolio["accounts"] if a["name"] == delete.account_name), None)
        if not account:
            raise HTTPException(status_code=404, detail="계좌를 찾을 수 없습니다")

        before = len(account["holdings"])
        account["holdings"] = [
            h for h in account["holdings"]
            if not (
                (h.get("ticker") and h["ticker"] == delete.holding_key)
                or (not h.get("ticker") and h.get("name") == delete.holding_key)
            )
        ]
        if len(account["holdings"]) == before:
            raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다")

        save_portfolio(portfolio)
        return {"status": "ok", "removed": delete.holding_key}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"holding 삭제 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/portfolio/account", dependencies=[Depends(require_api_key)])
async def add_account(create: AccountCreate):
    """계좌 추가 (빈 상태)"""
    try:
        portfolio = load_portfolio()
        if any(a["name"] == create.name for a in portfolio["accounts"]):
            raise HTTPException(status_code=409, detail="같은 이름의 계좌가 이미 있습니다")
        new_account: dict[str, Any] = {
            "name": create.name,
            "type": create.type,
            "holdings": [],
        }
        if create.currency and create.currency != "KRW":
            new_account["currency"] = create.currency
        if create.etf_limit is not None:
            new_account["etf_limit"] = create.etf_limit
        portfolio["accounts"].append(new_account)
        save_portfolio(portfolio)
        return {"status": "ok", "account": new_account}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"account 추가 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/portfolio/account", dependencies=[Depends(require_api_key)])
async def delete_account(name: str):
    """계좌 제거 (빈 계좌만 허용)"""
    try:
        portfolio = load_portfolio()
        account = next((a for a in portfolio["accounts"] if a["name"] == name), None)
        if not account:
            raise HTTPException(status_code=404, detail="계좌를 찾을 수 없습니다")
        if account["holdings"]:
            raise HTTPException(status_code=400, detail="종목이 남아있어 삭제할 수 없습니다")
        portfolio["accounts"] = [a for a in portfolio["accounts"] if a["name"] != name]
        save_portfolio(portfolio)
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"account 삭제 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/portfolio/accounts/order", dependencies=[Depends(require_api_key)])
async def reorder_accounts(body: AccountOrder):
    """계좌 순서 변경. body.names의 순서대로 정렬."""
    try:
        portfolio = load_portfolio()
        by_name = {a["name"]: a for a in portfolio["accounts"]}
        if set(by_name.keys()) != set(body.names):
            raise HTTPException(status_code=400, detail="계좌 목록이 일치하지 않습니다")
        portfolio["accounts"] = [by_name[n] for n in body.names]
        save_portfolio(portfolio)
        return {"status": "ok", "order": body.names}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"순서 변경 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/portfolio/goal", dependencies=[Depends(require_api_key)])
async def update_goal(update: GoalUpdate):
    """목표 자산 금액 설정"""
    try:
        portfolio = load_portfolio()
        portfolio["goal_krw"] = int(update.goal_krw)
        save_portfolio(portfolio)
        return {"status": "ok", "goal_krw": portfolio["goal_krw"]}
    except Exception as e:
        logger.error(f"goal 수정 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

_sparkline_cache: dict = {}
_sparkline_ts: float = 0.0
_indices_cache: dict = {}
_indices_ts: float = 0.0


def _fetch_yahoo_chart(symbol: str, range: str = "30d", interval: str = "1d") -> dict | None:
    """Yahoo Finance HTTP API 호출 (yfinance 의존 없이).

    응답에 closes(list), last, prev, change_pct 등을 반환.
    """
    import requests
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={range}&interval={interval}"
        r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        data = r.json()
        result = data.get("chart", {}).get("result", [])
        if not result:
            return None
        node = result[0]
        timestamps = node.get("timestamp", []) or []
        closes_raw = node["indicators"]["quote"][0].get("close", []) or []
        meta = node.get("meta", {}) or {}
        items = []
        for ts, close in zip(timestamps, closes_raw):
            if close is None:
                continue
            from datetime import datetime as _dt
            items.append({
                "date": _dt.fromtimestamp(ts).strftime("%Y-%m-%d"),
                "close": round(float(close), 4),
            })
        if not items:
            return None
        last = items[-1]["close"]
        prev = items[-2]["close"] if len(items) >= 2 else (meta.get("chartPreviousClose") or meta.get("previousClose"))
        change = (last - prev) if prev else None
        change_pct = (change / prev * 100) if (prev and change is not None) else None
        return {
            "symbol": symbol,
            "items": items,
            "last": last,
            "prev": prev,
            "change": change,
            "change_pct": change_pct,
            "currency": meta.get("currency"),
            "exchange": meta.get("exchangeName"),
        }
    except Exception as e:
        logger.warning(f"yahoo chart fetch 실패 ({symbol}): {e}")
        return None


@app.get("/api/market/sparkline")
async def get_sparkline():
    """지수별 최근 20 영업일 종가 (스파크라인용). 1시간 캐시."""
    global _sparkline_cache, _sparkline_ts
    if _sparkline_cache and time.time() - _sparkline_ts < 3600:
        return _sparkline_cache

    def _fetch():
        result = {}
        for key, sym in [("nasdaq", "^IXIC"), ("sp500", "^GSPC"), ("korea", "^KS11")]:
            chart = _fetch_yahoo_chart(sym, range="30d", interval="1d")
            result[key] = [it["close"] for it in (chart or {}).get("items", [])[-20:]]
        return result

    data = await asyncio.to_thread(_fetch)
    _sparkline_cache = data
    _sparkline_ts = time.time()
    return data


@app.get("/api/market/indices")
async def get_indices():
    """주요 지수 현재가 + 전일 대비 변동. 5분 캐시."""
    global _indices_cache, _indices_ts
    if _indices_cache and time.time() - _indices_ts < 300:
        return _indices_cache

    def _fetch():
        result = {}
        for key, sym, label in [
            ("nasdaq", "^IXIC", "나스닥"),
            ("sp500",  "^GSPC", "S&P 500"),
            ("korea",  "^KS11", "코스피"),
        ]:
            chart = _fetch_yahoo_chart(sym, range="5d", interval="1d")
            if chart and chart.get("last") is not None:
                result[key] = {
                    "label": label,
                    "symbol": sym,
                    "value": round(chart["last"], 2),
                    "prev": round(chart["prev"], 2) if chart.get("prev") else None,
                    "change": round(chart["change"], 2) if chart.get("change") is not None else None,
                    "change_pct": round(chart["change_pct"], 2) if chart.get("change_pct") is not None else None,
                }
            else:
                result[key] = {"label": label, "symbol": sym, "value": None, "change": None, "change_pct": None}
        return result

    data = await asyncio.to_thread(_fetch)
    _indices_cache = data
    _indices_ts = time.time()
    return data


# 종목별 가격 히스토리 캐시 (티커 → {ts, items})
_ticker_hist_cache: dict[str, dict] = {}
_TICKER_HIST_TTL = 1800  # 30분

# range 별 추가 기간(yahoo가 가끔 짧게 잘리는 경우 보정)
_RANGE_MAP = {
    "1mo": "1mo",
    "3mo": "3mo",
    "6mo": "6mo",
    "1y": "1y",
    "5y": "5y",
}


@app.get("/api/market/history/{ticker}")
async def get_ticker_history(ticker: str, range: str = "1mo"):
    """단일 종목의 일봉 히스토리. 종목 카드 클릭 시 미니 차트용.

    range: 1mo, 3mo, 6mo, 1y, 5y
    yfinance에 의존하지 않고 yahoo HTTP API를 직접 호출 (Render 안정성).
    """
    range_val = _RANGE_MAP.get(range, "1mo")
    cache_key = f"{ticker}:{range_val}"
    now_ts = time.time()
    cached = _ticker_hist_cache.get(cache_key)
    if cached and (now_ts - cached["ts"]) < _TICKER_HIST_TTL:
        return cached["data"]

    def _fetch():
        # 한국 ETF: 6자리 코드 → .KS/.KQ 시도. 사용자 입력에 그대로 6자리(영문 포함) 가능.
        is_korean = len(ticker) == 6 and any(c.isdigit() for c in ticker)
        symbols = [f"{ticker}.KS", f"{ticker}.KQ"] if is_korean else [ticker]
        for symbol in symbols:
            chart = _fetch_yahoo_chart(symbol, range=range_val, interval="1d")
            if not chart or not chart.get("items"):
                continue
            return {
                "ticker": ticker,
                "symbol": symbol,
                "range": range_val,
                "currency": chart.get("currency") or ("KRW" if is_korean else "USD"),
                "items": chart["items"],
                "last": chart.get("last"),
                "prev": chart.get("prev"),
                "change": chart.get("change"),
                "change_pct": chart.get("change_pct"),
            }
        return {"ticker": ticker, "items": []}

    data = await asyncio.to_thread(_fetch)
    _ticker_hist_cache[cache_key] = {"ts": now_ts, "data": data}
    return data


@app.get("/api/prices", dependencies=[Depends(require_read_auth)])
async def get_prices():
    """캐시된 가격 데이터 반환"""
    return get_cached_prices()

@app.post("/api/prices/refresh", dependencies=[Depends(require_api_key)])
async def force_refresh():
    """수동으로 가격 갱신 트리거"""
    try:
        cache = refresh_all_prices()
        return {"status": "ok", "updated_at": cache.get("updated_at")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ─────────────────────────────────────────────────────
# 체결(매수/매도) 내역 엔드포인트 — Phase 6
# ─────────────────────────────────────────────────────
class TradeCreate(BaseModel):
    account_name: str
    holding_key: str
    name: str
    ticker: Optional[str] = None
    side: str  # 'buy' | 'sell'
    shares: float
    price: Optional[float] = None
    currency: str = "KRW"
    traded_at: Optional[str] = None
    note: Optional[str] = None
    # apply_to_holding=True → 체결 기록과 함께 portfolio.json의 shares/avg_price도 자동 갱신
    apply_to_holding: bool = True


def _recalc_and_apply(account_name: str, holding_key: str) -> dict | None:
    """체결 누적값을 portfolio.json holding에 반영. 갱신된 holding 반환."""
    agg = aggregate_for_holding(account_name, holding_key)
    portfolio = load_portfolio()
    account = next((a for a in portfolio["accounts"] if a["name"] == account_name), None)
    if not account:
        return None

    def matches(h: dict) -> bool:
        return (h.get("ticker") and h["ticker"] == holding_key) or (
            not h.get("ticker") and h.get("name") == holding_key
        )

    holding = next((h for h in account["holdings"] if matches(h)), None)
    if not holding:
        return None

    holding["shares"] = round(agg["net_shares"], 8) if agg["net_shares"] > 0 else 0
    avg = agg["avg_price_from_trades"]
    is_usd = (account.get("currency") == "USD")
    if avg is not None and agg["net_shares"] > 0:
        if is_usd:
            holding["avg_price_usd"] = round(avg, 4)
        else:
            holding["avg_price_krw"] = round(avg, 2)
    elif agg["net_shares"] <= 0:
        # 전량 매도: 평단 의미 없음
        holding.pop("avg_price_usd", None)
        holding.pop("avg_price_krw", None)
    save_portfolio(portfolio)
    return holding


@app.post("/api/trades", dependencies=[Depends(require_api_key)])
async def create_trade(trade: TradeCreate):
    """체결 기록. apply_to_holding=True면 portfolio.json의 보유수량/평단도 자동 갱신."""
    try:
        if trade.side not in ("buy", "sell"):
            raise HTTPException(status_code=400, detail="side는 buy 또는 sell")
        if trade.shares <= 0:
            raise HTTPException(status_code=400, detail="shares > 0 이어야 함")

        trade_id = insert_trade(
            account_name=trade.account_name,
            holding_key=trade.holding_key,
            name=trade.name,
            ticker=trade.ticker,
            side=trade.side,
            shares=trade.shares,
            price=trade.price,
            currency=trade.currency,
            traded_at=trade.traded_at,
            note=trade.note,
        )

        applied_holding = None
        if trade.apply_to_holding:
            applied_holding = _recalc_and_apply(trade.account_name, trade.holding_key)

        return {"status": "ok", "id": trade_id, "holding": applied_holding}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"trade 생성 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/trades", dependencies=[Depends(require_read_auth)])
async def get_trades(
    account_name: Optional[str] = None,
    holding_key: Optional[str] = None,
    limit: int = 200,
):
    """체결 내역 조회. 필터 없으면 최근 200건."""
    try:
        items = list_trades(account_name=account_name, holding_key=holding_key, limit=limit)
        agg = None
        if account_name and holding_key:
            agg = aggregate_for_holding(account_name, holding_key)
        return {"items": items, "aggregate": agg}
    except Exception as e:
        logger.error(f"trades 조회 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/trades/{trade_id}", dependencies=[Depends(require_api_key)])
async def remove_trade(trade_id: int, apply_to_holding: bool = True):
    """체결 삭제. 삭제 후 누적값 재계산해서 holding에 반영."""
    try:
        # 삭제 전 종목 정보를 알아야 재반영 가능 → 먼저 조회
        related = list_trades(limit=10_000)
        target = next((t for t in related if t["id"] == trade_id), None)
        if not target:
            raise HTTPException(status_code=404, detail="체결 기록을 찾을 수 없습니다")

        if not delete_trade(trade_id):
            raise HTTPException(status_code=404, detail="삭제 실패")

        applied_holding = None
        if apply_to_holding:
            applied_holding = _recalc_and_apply(target["account_name"], target["holding_key"])

        return {"status": "ok", "holding": applied_holding}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"trade 삭제 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

