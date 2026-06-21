"""FastAPI 포트폴리오 대시보드 백엔드"""
from __future__ import annotations
import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from contextlib import asynccontextmanager
from typing import Any, Optional
import csv
import io
import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from apscheduler.schedulers.background import BackgroundScheduler

from price_fetcher import refresh_all_prices, get_cached_prices
from price_cache_store import get_price_errors
from portfolio_calculator import load_portfolio, build_portfolio_summary, save_portfolio
from history_store import record_snapshot_from_summary, get_history
from history_backfill import backfill_history
from holidays import is_kr_market_closed_today
from trade_store import (
    insert_trade,
    list_trades,
    delete_trade,
    aggregate_for_holding,
)
from cashflow_store import (
    calculate_performance,
    delete_cash_flow,
    insert_cash_flow,
    list_cash_flows,
)
from decision_store import create_decision, list_decisions, update_decision

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

    # 스냅샷 시점 정규화 (KST):
    # 기존 00:30 단일 backfill은 어느 시장 마감과도 무관한 시각이라, 사용자
    # 호출 시각에 따라 스냅샷 시점이 비균질했다. 시장 마감 직후 두 번 적재해
    # '한국장 마감 종가' / '미국장 마감 종가'를 모두 반영하도록 변경.
    def _kr_close_snapshot() -> None:
        # 한국 공휴일/주말은 외부 API 호출만 늘어나고 새 종가가 없으므로 skip
        if is_kr_market_closed_today():
            logger.info("한국장 휴장 — kr_close_snapshot skip")
            return
        backfill_history(days=2)

    # KST 16:30 — 한국장 마감(15:30) 직후. 그날 한국 종가 확정.
    scheduler.add_job(
        _kr_close_snapshot,
        "cron", hour=16, minute=30, timezone="Asia/Seoul", id="kr_close_snapshot",
    )
    # KST 06:30 — 미국장 마감(EST/EDT 16:00 ≈ KST 05:00~06:00) 직후. 미국 종가 반영.
    # 미국 공휴일은 별도 캘린더 필요(향후) — 일단 항상 실행.
    scheduler.add_job(
        lambda: backfill_history(days=2),
        "cron", hour=6, minute=30, timezone="Asia/Seoul", id="us_close_snapshot",
    )
    scheduler.start()
    logger.info("스케줄러 시작 (7분 갱신 + 한국·미국 마감 backfill 2회, 한국 휴장일 가드)")

    yield

    scheduler.shutdown()
    logger.info("스케줄러 종료")

app = FastAPI(title="Portfolio Dashboard API", lifespan=lifespan)

_GITHUB_PAGES_ORIGIN = "https://lmsnism-ux.github.io"
_extra_origins = list({_GITHUB_PAGES_ORIGIN} | {
    o.strip() for o in (os.environ.get("ALLOWED_ORIGINS", "")).split(",") if o.strip()
})

# 인증 없음 — CORS가 https://lmsnism-ux.github.io 만 허용하므로 개인 도구에 충분한 보호.
def require_api_key() -> None:  # type: ignore[override]
    return


def require_read_auth() -> None:  # type: ignore[override]
    return


app.add_middleware(
    CORSMiddleware,
    # 운영 도메인은 ALLOWED_ORIGINS env로 명시. LAN regex는 사설망만 허용.
    allow_origins=_extra_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    # X-API-Key 헤더 허용 명시
    allow_headers=["*", "X-API-Key", "Authorization"],
)

_SENSITIVE_API_PREFIXES = (
    "/api/portfolio",
    "/api/history",
    "/api/trades",
    "/api/prices",
    "/api/export",
    "/api/market/insights",
    "/api/auth",
    "/api/cash-flows",
    "/api/performance",
    "/api/decisions",
)


@app.middleware("http")
async def prevent_sensitive_response_cache(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith(_SENSITIVE_API_PREFIXES):
        response.headers["Cache-Control"] = "no-store, private"
        response.headers["Pragma"] = "no-cache"
    return response


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




@app.get("/api/health")
async def health_check():
    """스케줄러 상태 + 가격 갱신 시각 + 에러 티커 목록."""
    cache = get_cached_prices()
    stale_hours = _cache_stale_hours(cache.get("updated_at"))
    errors = get_price_errors()
    return {
        "status": "ok",
        "scheduler_running": scheduler.running,
        "price_updated_at": cache.get("updated_at"),
        "cache_stale_hours": round(stale_hours, 2) if stale_hours is not None else None,
        "price_errors": errors,
    }


@app.get("/api/export/csv", dependencies=[Depends(require_api_key)])
async def export_csv():
    """보유 종목 + 거래내역 CSV 다운로드."""
    portfolio = load_portfolio()
    cache = get_cached_prices()
    prices = cache.get("prices", {})
    usd_krw = cache.get("usd_krw") or 1400
    summary = build_portfolio_summary(portfolio, prices, usd_krw, cache.get("usd_krw_prev"))

    output = io.StringIO()
    writer = csv.writer(output)

    # ── 보유 종목 섹션 ──
    writer.writerow(["## 보유 종목"])
    writer.writerow(["계좌", "종목명", "티커", "수량", "평균단가", "현재가", "평가금액(KRW)", "매입금액(KRW)", "수익률(%)"])
    for acc in summary.get("accounts", []):
        for h in acc.get("holdings", []):
            writer.writerow([
                acc.get("name", ""),
                h.get("name", ""),
                h.get("ticker", "") or "",
                h.get("shares", "") if h.get("shares") is not None else "",
                h.get("avg_price", "") if h.get("avg_price") is not None else "",
                h.get("current_price", "") if h.get("current_price") is not None else "",
                h.get("value_krw", ""),
                h.get("cost_krw", "") if h.get("cost_krw") is not None else "",
                f"{h['profit_pct']:.2f}" if h.get("profit_pct") is not None else "",
            ])

    writer.writerow([])

    # ── 거래내역 섹션 ──
    writer.writerow(["## 거래내역"])
    writer.writerow(["날짜", "계좌", "종목명", "티커", "구분", "수량", "가격", "통화", "메모"])
    trades = list_trades()
    for t in trades:
        writer.writerow([
            t.get("traded_at", "")[:10],
            t.get("account_name", ""),
            t.get("name", ""),
            t.get("ticker", "") or "",
            "매수" if t.get("side") == "buy" else "매도",
            t.get("shares", ""),
            t.get("price", "") if t.get("price") is not None else "",
            t.get("currency", ""),
            t.get("note", "") or "",
        ])

    today = datetime.now().strftime("%Y%m%d")
    output.seek(0)
    # UTF-8 BOM: Excel에서 한글 깨짐 방지
    content = "﻿" + output.getvalue()

    return StreamingResponse(
        iter([content.encode("utf-8")]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=portfolio_{today}.csv"},
    )


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


class CashFlowCreate(BaseModel):
    flow_type: str
    amount_krw: int
    occurred_on: str
    account_name: Optional[str] = None
    note: Optional[str] = None


@app.get("/api/cash-flows", dependencies=[Depends(require_read_auth)])
async def get_cash_flows(days: int = 730):
    return {"items": list_cash_flows(days=days)}


@app.post("/api/cash-flows", dependencies=[Depends(require_api_key)])
async def create_cash_flow(body: CashFlowCreate):
    try:
        flow_id = insert_cash_flow(**body.model_dump())
        return {"id": flow_id}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/cash-flows/{flow_id}", dependencies=[Depends(require_api_key)])
async def remove_cash_flow(flow_id: int):
    if not delete_cash_flow(flow_id):
        raise HTTPException(status_code=404, detail="cash flow not found")
    return {"status": "ok"}


@app.get("/api/performance", dependencies=[Depends(require_read_auth)])
async def get_performance(days: int = 730):
    history = get_history(days=days)
    flows = list_cash_flows(days=days)
    return calculate_performance(history, flows)


class DecisionCreate(BaseModel):
    title: str
    thesis: str
    review_on: Optional[str] = None


class DecisionUpdate(BaseModel):
    status: str
    outcome_note: Optional[str] = None


@app.get("/api/decisions", dependencies=[Depends(require_read_auth)])
async def get_decisions(limit: int = 100):
    return {"items": list_decisions(limit=min(max(1, limit), 200))}


@app.post("/api/decisions", dependencies=[Depends(require_api_key)])
async def add_decision(body: DecisionCreate):
    try:
        return {"id": create_decision(**body.model_dump())}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/api/decisions/{decision_id}", dependencies=[Depends(require_api_key)])
async def patch_decision(decision_id: int, body: DecisionUpdate):
    try:
        if not update_decision(decision_id, **body.model_dump()):
            raise HTTPException(status_code=404, detail="decision not found")
        return {"status": "ok"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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


class BulkHoldingUpdate(BaseModel):
    updates: list[HoldingUpdate]


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


@app.patch("/api/portfolio/holdings/bulk", dependencies=[Depends(require_api_key)])
async def update_holdings_bulk(request: BulkHoldingUpdate):
    """캡처 검토 결과를 모두 검증한 뒤 한 번에 저장한다."""
    try:
        if not request.updates or len(request.updates) > 100:
            raise HTTPException(status_code=400, detail="수정할 종목은 1~100개여야 합니다")
        portfolio = load_portfolio()
        resolved: list[tuple[dict, HoldingUpdate]] = []

        for update in request.updates:
            if update.shares is None or update.shares < 0:
                raise HTTPException(status_code=400, detail="보유 수량은 0 이상이어야 합니다")
            if update.avg_price_krw is not None and update.avg_price_krw <= 0:
                raise HTTPException(status_code=400, detail="원화 평단은 0보다 커야 합니다")
            if update.avg_price_usd is not None and update.avg_price_usd <= 0:
                raise HTTPException(status_code=400, detail="달러 평단은 0보다 커야 합니다")

            account = next((item for item in portfolio["accounts"] if item["name"] == update.account_name), None)
            if not account:
                raise HTTPException(status_code=404, detail=f"계좌를 찾을 수 없습니다: {update.account_name}")
            holding = next((item for item in account["holdings"] if (
                (item.get("ticker") and item["ticker"] == update.holding_key)
                or (not item.get("ticker") and item.get("name") == update.holding_key)
            )), None)
            if not holding:
                raise HTTPException(status_code=404, detail=f"종목을 찾을 수 없습니다: {update.holding_key}")
            resolved.append((holding, update))

        for holding, update in resolved:
            holding["shares"] = update.shares
            if update.avg_price_krw is not None:
                holding["avg_price_krw"] = update.avg_price_krw
            if update.avg_price_usd is not None:
                holding["avg_price_usd"] = update.avg_price_usd

        save_portfolio(portfolio)
        return {"status": "ok", "updated": len(resolved)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"holding 일괄 수정 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class GoalUpdate(BaseModel):
    goal_krw: Optional[int] = None
    long_goal_krw: Optional[int] = None


class HoldingCreate(BaseModel):
    account_name: str
    name: str
    ticker: Optional[str] = None
    shares: Optional[float] = None
    avg_price_krw: Optional[float] = None
    avg_price_usd: Optional[float] = None
    snapshot_value_krw: Optional[float] = None   # 예적금/현금 잔액 직접 입력
    snapshot_value_usd: Optional[float] = None
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
        if create.snapshot_value_krw is not None:
            new_holding["snapshot_value_krw"] = create.snapshot_value_krw
        if create.snapshot_value_usd is not None:
            new_holding["snapshot_value_usd"] = create.snapshot_value_usd
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


@app.post("/api/portfolio/import", dependencies=[Depends(require_api_key)])
async def import_portfolio(request: Request):
    """포트폴리오 전체 교체 (마이그레이션 1회용)."""
    data = await request.json()
    save_portfolio(data)
    return {"status": "ok", "accounts": len(data.get("accounts", []))}


@app.patch("/api/portfolio/goal", dependencies=[Depends(require_api_key)])
async def update_goal(update: GoalUpdate):
    """단기/장기 목표 자산 금액 설정"""
    try:
        portfolio = load_portfolio()
        if update.goal_krw is not None:
            portfolio["goal_krw"] = int(update.goal_krw)
        if update.long_goal_krw is not None:
            portfolio["long_goal_krw"] = int(update.long_goal_krw)
        elif update.long_goal_krw == 0:
            portfolio.pop("long_goal_krw", None)
        save_portfolio(portfolio)
        return {
            "status": "ok",
            "goal_krw": portfolio.get("goal_krw"),
            "long_goal_krw": portfolio.get("long_goal_krw"),
        }
    except Exception as e:
        logger.error(f"goal 수정 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

_sparkline_cache: dict = {}
_sparkline_ts: float = 0.0
_indices_cache: dict = {}
_indices_ts: float = 0.0


def _yahoo_bar_date(ts: int, gmtoffset: int | None) -> str:
    """Yahoo bar timestamp → 거래소 현지 기준 YYYY-MM-DD.

    서버 timezone에 의존하지 않도록 meta.gmtoffset(거래소 UTC 오프셋, 초)을 사용.
    """
    if gmtoffset is not None:
        return (datetime.fromtimestamp(ts, tz=timezone.utc) + timedelta(seconds=gmtoffset)).strftime("%Y-%m-%d")
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d")


def _resolve_last_prev(items: list[dict], meta: dict) -> tuple[float | None, float | None]:
    """현재가와 직전 거래일 종가 결정.

    Yahoo의 일봉 시리즈는 비거래시간이나 데이터 지연으로 당일 bar가 빠진 채
    (close=null 포함) 직전 거래일까지만 오는 경우가 있다. 그때 items[-1]/[-2]만
    쓰면 '전일 종가가 현재가로, 전전일 대비가 전일 대비로' 잘못 표시된다.

    보정: meta.regularMarketPrice(가장 최근 체결가)를 현재가로 쓰고,
    regularMarketTime의 거래일이 시리즈 마지막 bar와 다르면(시리즈 지연)
    마지막 bar 자체가 직전 거래일 종가다.
    """
    if not items:
        return None, None
    last_bar = items[-1]
    market_price = meta.get("regularMarketPrice")
    last = float(market_price) if market_price is not None else last_bar["close"]

    market_time = meta.get("regularMarketTime")
    gmtoffset = meta.get("gmtoffset")
    market_date = None
    if market_time is not None:
        market_date = _yahoo_bar_date(market_time, gmtoffset)

    if market_date is not None and last_bar["date"] != market_date:
        # 시리즈가 직전 거래일까지만 옴 → 마지막 bar가 곧 전일 종가
        prev = last_bar["close"]
    elif len(items) >= 2:
        prev = items[-2]["close"]
    else:
        prev = meta.get("chartPreviousClose") or meta.get("previousClose")
    return last, prev


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
        gmtoffset = meta.get("gmtoffset")
        items = []
        for ts, close in zip(timestamps, closes_raw):
            if close is None:
                continue
            items.append({
                "date": _yahoo_bar_date(ts, gmtoffset),
                "close": round(float(close), 4),
            })
        if not items:
            return None
        last, prev = _resolve_last_prev(items, meta)
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


_KR_SUFFIXES = (".KS", ".KQ")
_US_EXCHANGES = {"NYQ", "NMS", "NGM", "PCX", "ASE", "BTS", "NCM", "CCS", "ARC", "NIM"}
_SKIP_TYPES   = {"MUTUALFUND", "FUTURE", "OPTION", "INDEX", "CURRENCY", "CRYPTOCURRENCY"}

# 한국어 → Yahoo Finance 검색어 변환표 (지수명·브랜드명·테마명)
# 주의: Yahoo Finance는 단순 지수명(예: "nasdaq")을 검색하면 INDEX 타입을 반환해 필터됨.
#       ETF가 나오게 하려면 브랜드명(tiger/kodex)이나 "etf" 접미어가 필요함.
_KR_BRAND_MAP: dict[str, str] = {
    # 지수 → 브랜드 접두어 붙여 ETF 결과 유도
    "나스닥": "tiger nasdaq", "나스닥100": "tiger nasdaq",
    "에스앤피": "tiger s&p", "s&p": "tiger s&p",
    "코스피": "kodex kospi", "코스닥": "kodex kosdaq",
    "다우": "tiger dow jones",
    "미국": "tiger us",
    # ETF 운용사·브랜드 (브랜드명으로 직접 검색 가능)
    "코덱스": "kodex", "코덱": "kodex",
    "타이거": "tiger",
    "케이비스타": "kbstar", "케이비스": "kbstar",
    "에이스": "ace etf",
    "아리랑": "arirang",
    "키움": "kium",
    "솔": "shinhan sol", "신한솔": "shinhan sol", "신한": "shinhan sol",
    "미래에셋": "mirae asset tiger",
    "삼성자산": "samsung kodex",
    "한국투자": "ace etf",
    "파워": "power etf",
    "흥국": "heungkuk",
    "하나로": "hanaro",
    # 테마·섹터
    "반도체": "semiconductor etf",
    "2차전지": "battery etf", "이차전지": "battery etf",
    "전기차": "electric vehicle etf",
    "인공지능": "ai etf",
    "미국채": "us treasury etf",
    "배당": "dividend etf",
    "인버스": "inverse etf",
    "레버리지": "leverage etf",
}


def _translate_kr_query(q: str) -> str:
    """한국어가 포함된 검색어를 영어 대응어로 변환. 못 찾으면 원본 반환."""
    lower = q.lower().replace(" ", "")
    for kr, en in _KR_BRAND_MAP.items():
        if kr in lower:
            # 나머지 토큰(숫자 등) 보존
            rest = q.replace(kr, "").strip()
            return (en + " " + rest).strip() if rest else en
    return q


@app.get("/api/market/search")
async def search_tickers(q: str = ""):
    """Yahoo Finance 종목 검색. KR(KRX 6자리)·US 심볼만 반환."""
    q = q.strip()
    if not q:
        return {"items": []}
    # 한국어 포함 시 영어 브랜드명으로 변환
    q = _translate_kr_query(q)
    url = "https://query2.finance.yahoo.com/v1/finance/search"
    params = {"q": q, "quotesCount": 15, "newsCount": 0,
              "enableFuzzyQuery": "false", "sectionList": "Quotes"}
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, params=params, headers=headers)
        if not resp.is_success:
            return {"items": [], "debug": f"yahoo_status={resp.status_code}"}
        quotes = resp.json().get("quotes", [])
        items: list[dict] = []
        seen: set[str] = set()
        for quote in quotes:
            symbol: str = quote.get("symbol", "")
            if not symbol or symbol in seen:
                continue
            qtype = quote.get("quoteType", "")
            if qtype in _SKIP_TYPES:
                continue
            exchange = quote.get("exchange", "")
            if any(symbol.endswith(s) for s in _KR_SUFFIXES):
                market = "KR"
                ticker = symbol.rsplit(".", 1)[0]
                if not ticker.isdigit() or len(ticker) != 6:
                    continue
            elif exchange in _US_EXCHANGES:
                market = "US"
                ticker = symbol
            else:
                continue
            if market == "KR":
                name = (quote.get("shortname") or quote.get("longname") or symbol).strip()
            else:
                name = (quote.get("longname") or quote.get("shortname") or symbol).strip()
            seen.add(symbol)
            items.append({"name": name, "ticker": ticker,
                          "symbol": symbol, "type": qtype, "market": market})
        return {"items": items}
    except Exception as exc:
        return {"items": [], "debug": f"exception={type(exc).__name__}: {exc}"}


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


# 시장 인사이트 캐시 (뉴스 + 종목 시그널). 30분.
_insights_cache: dict = {}
_insights_ts: float = 0.0
_INSIGHTS_TTL = 1800


@app.get("/api/market/insights", dependencies=[Depends(require_read_auth)])
async def get_market_insights():
    """시장 뉴스 헤드라인 + 보유 종목 기술적 시그널. 30분 캐시.

    보유 종목 정보가 노출되므로 read-auth 보호 대상.
    """
    global _insights_cache, _insights_ts
    if _insights_cache and time.time() - _insights_ts < _INSIGHTS_TTL:
        return _insights_cache

    from market_insights import build_insights
    try:
        data = await asyncio.to_thread(build_insights)
        _insights_cache = data
        _insights_ts = time.time()
        return data
    except Exception as e:
        logger.error(f"인사이트 생성 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
