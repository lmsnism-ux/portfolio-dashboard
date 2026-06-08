"""FastAPI 포트폴리오 대시보드 백엔드"""
from __future__ import annotations
import json
import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from apscheduler.schedulers.background import BackgroundScheduler

from price_fetcher import refresh_all_prices, get_cached_prices
from portfolio_calculator import load_portfolio, build_portfolio_summary, PORTFOLIO_FILE
from history_store import record_snapshot_from_summary, get_history
from history_backfill import backfill_history

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

import os as _os

_extra_origins = [
    o.strip() for o in (_os.environ.get("ALLOWED_ORIGINS", "")).split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    # 환경변수로 운영 도메인 지정 + LAN regex로 같은 WiFi 모바일 접근 허용
    allow_origins=_extra_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


@app.get("/api/portfolio")
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


@app.get("/api/history")
async def get_portfolio_history(days: int = 365):
    """일별 자산 추이"""
    try:
        return {"items": get_history(days=days)}
    except Exception as e:
        logger.error(f"히스토리 조회 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/history/backfill")
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


def _save_portfolio(portfolio: dict[str, Any]) -> None:
    PORTFOLIO_FILE.write_text(json.dumps(portfolio, ensure_ascii=False, indent=2))


@app.patch("/api/portfolio/holding")
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

        _save_portfolio(portfolio)
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


@app.post("/api/portfolio/holding")
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
        _save_portfolio(portfolio)
        return {"status": "ok", "holding": new_holding}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"holding 추가 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/portfolio/holding")
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

        _save_portfolio(portfolio)
        return {"status": "ok", "removed": delete.holding_key}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"holding 삭제 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/portfolio/account")
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
        _save_portfolio(portfolio)
        return {"status": "ok", "account": new_account}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"account 추가 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/portfolio/account")
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
        _save_portfolio(portfolio)
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"account 삭제 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/portfolio/accounts/order")
async def reorder_accounts(body: AccountOrder):
    """계좌 순서 변경. body.names의 순서대로 정렬."""
    try:
        portfolio = load_portfolio()
        by_name = {a["name"]: a for a in portfolio["accounts"]}
        if set(by_name.keys()) != set(body.names):
            raise HTTPException(status_code=400, detail="계좌 목록이 일치하지 않습니다")
        portfolio["accounts"] = [by_name[n] for n in body.names]
        _save_portfolio(portfolio)
        return {"status": "ok", "order": body.names}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"순서 변경 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/portfolio/goal")
async def update_goal(update: GoalUpdate):
    """목표 자산 금액 설정"""
    try:
        portfolio = load_portfolio()
        portfolio["goal_krw"] = int(update.goal_krw)
        _save_portfolio(portfolio)
        return {"status": "ok", "goal_krw": portfolio["goal_krw"]}
    except Exception as e:
        logger.error(f"goal 수정 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/prices")
async def get_prices():
    """캐시된 가격 데이터 반환"""
    return get_cached_prices()

@app.post("/api/prices/refresh")
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

