"""포트폴리오 계산 로직"""
from __future__ import annotations
import base64
import json
import logging
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# 1순위: PORTFOLIO_DATA_DIR (Render Persistent Disk 등), 2순위: 코드 디렉토리
_DATA_DIR = Path(os.environ.get("PORTFOLIO_DATA_DIR", str(Path(__file__).parent)))
_DATA_DIR.mkdir(parents=True, exist_ok=True)
PORTFOLIO_FILE = _DATA_DIR / "portfolio.json"


def _seed_from_env() -> bool:
    """환경변수 PORTFOLIO_JSON_B64 가 있으면 파일에 시드 (파일 없을 때만 — 편집 내용 보존)."""
    if PORTFOLIO_FILE.exists():
        return False  # 기존 파일 보존: 편집/저장된 내용을 env var로 덮어쓰지 않음
    encoded = os.environ.get("PORTFOLIO_JSON_B64")
    if not encoded:
        logger.warning("PORTFOLIO_JSON_B64 env var not found")
        return False
    try:
        raw = base64.b64decode(encoded).decode("utf-8")
        json.loads(raw)  # JSON 유효성 확인
        PORTFOLIO_FILE.write_text(raw)
        logger.info("_seed_from_env: portfolio.json 초기 시드 완료")
        return True
    except Exception as e:
        logger.error(f"_seed_from_env failed: {e}", exc_info=True)
        return False


def load_portfolio() -> dict:
    _seed_from_env()  # 항상 env var와 동기화 (내용이 같으면 내부에서 스킵)
    if not PORTFOLIO_FILE.exists():
        return {"accounts": []}
    return json.loads(PORTFOLIO_FILE.read_text())

def _get_price(ticker, prices: dict, usd_krw: float) -> dict:
    """티커에 대한 가격 정보 반환"""
    if not ticker or ticker not in prices:
        return {"price": None, "change_pct": None, "change_amt": None, "currency": "KRW", "label": "데이터 없음"}
    return prices[ticker]

def _to_krw(amount: float, currency: str, usd_krw: float) -> float:
    if currency == "USD":
        return amount * usd_krw
    return amount

def calc_auto_buy_summary(portfolio: dict, prices: dict, usd_krw: float) -> list[dict]:
    """자동매수 현황 계산"""
    items = []
    now = datetime.now(timezone(timedelta(hours=9)))

    for account in portfolio["accounts"]:
        for h in account["holdings"]:
            ab = h.get("auto_buy")
            # auto_buy 메타가 정의된 종목은 enabled 여부 무관하게 카드에 표시
            if not ab:
                continue

            enabled = bool(ab.get("enabled"))
            ticker = h.get("ticker")
            price_info = _get_price(ticker, prices, usd_krw)
            current_price = price_info.get("price")

            account_name = account["name"]
            holding_key = ticker or h["name"]

            if ab["frequency"] == "daily_weekday":
                next_day = now
                while next_day.weekday() >= 5 or (next_day.date() == now.date() and now.hour >= 22):
                    next_day = next_day + timedelta(days=1)
                if next_day.date() == now.date():
                    next_day_str = "오늘"
                else:
                    next_day_str = next_day.strftime("%-m/%-d")

                est_shares = None
                if current_price and ab.get("amount_usd"):
                    est_shares = round(ab["amount_usd"] / current_price, 6)

                items.append({
                    "name": h["name"],
                    "ticker": ticker,
                    "account_name": account_name,
                    "holding_key": holding_key,
                    "enabled": enabled,
                    "frequency": "매 미국 영업일",
                    "amount": f"${ab.get('amount_usd', 0)}",
                    "amount_krw": round(ab.get("amount_usd", 0) * usd_krw) if usd_krw else None,
                    "next_date": next_day_str if enabled else "정지됨",
                    "est_shares_per_buy": est_shares if enabled else None,
                    "est_shares_note": "현재가 기준 예상",
                    "currency": "USD",
                })

            elif ab["frequency"] == "weekly_monday":
                days_until_monday = (7 - now.weekday()) % 7 or 7
                next_monday = now + timedelta(days=days_until_monday)
                next_day_str = "다음 월요일" if days_until_monday == 7 else f"{next_monday.strftime('%-m/%-d')} (월)"
                if now.weekday() == 0:
                    next_day_str = "오늘 (월요일)"

                est_shares = None
                if current_price and ab.get("amount_krw"):
                    est_shares = round(ab["amount_krw"] / current_price, 2)

                items.append({
                    "name": h["name"],
                    "ticker": ticker,
                    "account_name": account_name,
                    "holding_key": holding_key,
                    "enabled": enabled,
                    "frequency": "매주 월요일",
                    "amount": f"₩{ab.get('amount_krw', 0):,}",
                    "amount_krw": ab.get("amount_krw"),
                    "next_date": next_day_str if enabled else "정지됨",
                    "est_shares_per_buy": est_shares if enabled else None,
                    "est_shares_note": "현재가 기준 예상",
                    "currency": "KRW",
                })

    return items

def calc_irp_etf_ratio(account: dict, prices: dict, usd_krw: float) -> dict:
    """IRP 계좌의 ETF 비중 계산"""
    if account.get("etf_limit") is None:
        return None

    total_value = 0
    etf_value = 0

    for h in account["holdings"]:
        ticker = h.get("ticker")
        shares = h.get("shares")

        if h.get("snapshot_value_usd"):
            val = h["snapshot_value_usd"] * usd_krw
            total_value += val
            continue
        if h.get("snapshot_value_krw"):
            val = h["snapshot_value_krw"]
            total_value += val
            continue

        if not ticker or not shares:
            continue

        price_info = _get_price(ticker, prices, usd_krw)
        price = price_info.get("price")
        if price is None:
            avg = h.get("avg_price_krw", 0)
            price = avg

        value = shares * price
        total_value += value

        asset_type = h.get("asset_type", "ETF")
        if asset_type == "ETF":
            etf_value += value

    if total_value == 0:
        return None

    ratio = etf_value / total_value
    limit = account["etf_limit"]

    if ratio >= limit:
        status = "danger"
        status_label = "한도 초과"
    elif ratio >= limit - 0.05:
        status = "warning"
        status_label = "주의"
    else:
        status = "ok"
        status_label = "정상"

    # SOL 반도체 추가 가능 금액
    sol_ticker = "0167A0"
    sol_price_info = _get_price(sol_ticker, prices, usd_krw)
    sol_price = sol_price_info.get("price") or 23000

    max_etf_value = total_value * limit
    available_krw = max(0, max_etf_value - etf_value)
    available_shares = int(available_krw / sol_price) if sol_price else 0

    return {
        "account_name": account["name"],
        "etf_ratio": round(ratio, 4),
        "etf_value": round(etf_value),
        "total_value": round(total_value),
        "limit": limit,
        "status": status,
        "status_label": status_label,
        "available_krw": round(available_krw),
        "sol_available_shares": available_shares,
        "sol_price": sol_price,
    }

def build_portfolio_summary(portfolio: dict, prices: dict, usd_krw: float, usd_krw_prev: float | None = None) -> dict:
    """전체 포트폴리오 요약 계산.

    usd_krw_prev: 전일 환율. 주어지면 USD 보유분에 대한 환율 변동분을 day_change에 반영.
    """
    accounts_data = []
    total_value_krw = 0
    total_cost_krw = 0
    total_day_change_krw = 0
    total_usd_value = 0.0  # 환율 변동 계산용 USD 익스포저

    # 종목별 합산
    holdings_merged: dict[str, dict] = {}

    for account in portfolio["accounts"]:
        account_value_krw = 0
        account_cost_krw = 0
        account_day_change_krw = 0
        holdings_data = []

        for h in account["holdings"]:
            ticker = h.get("ticker")
            shares = h.get("shares")
            currency = account.get("currency", "KRW")

            # USD 스냅샷 (달러 예수금 등) — 환율 기준 KRW 환산
            if h.get("snapshot_value_usd") and not ticker:
                snap_val_usd = h["snapshot_value_usd"]
                snap_val = snap_val_usd * usd_krw
                account_value_krw += snap_val
                total_value_krw += snap_val
                total_usd_value += snap_val_usd

                holdings_data.append({
                    "name": h["name"],
                    "ticker": None,
                    "shares": None,
                    "avg_price": None,
                    "current_price": None,
                    "current_price_display": f"${snap_val_usd:,.2f}",
                    "value_krw": round(snap_val),
                    "cost_krw": round(snap_val),
                    "profit_krw": 0,
                    "profit_pct": 0.0,
                    "day_change_pct": None,
                    "day_change_krw": None,
                    "currency": "USD",
                    "price_label": "달러 예수금",
                    "is_snapshot": True,
                    "auto_buy": h.get("auto_buy"),
                })
                continue

            # 스냅샷 값만 있는 종목 (삼성 디폴트옵션 등)
            if h.get("snapshot_value_krw") and not ticker:
                snap_val = h["snapshot_value_krw"]
                buy_amt = h.get("buy_amount_krw", snap_val)
                profit = snap_val - buy_amt
                profit_pct = (profit / buy_amt * 100) if buy_amt else 0

                account_value_krw += snap_val
                account_cost_krw += buy_amt
                total_value_krw += snap_val
                total_cost_krw += buy_amt

                holdings_data.append({
                    "name": h["name"],
                    "ticker": None,
                    "shares": None,
                    "avg_price": None,
                    "current_price": None,
                    "current_price_display": None,
                    "value_krw": snap_val,
                    "cost_krw": buy_amt,
                    "profit_krw": round(profit),
                    "profit_pct": round(profit_pct, 2),
                    "day_change_pct": None,
                    "day_change_krw": None,
                    "currency": "KRW",
                    "price_label": "스냅샷",
                    "is_snapshot": True,
                    "auto_buy": h.get("auto_buy"),
                })
                continue

            if not ticker or not shares:
                continue

            price_info = _get_price(ticker, prices, usd_krw)
            current_price = price_info.get("price")
            change_pct = price_info.get("change_pct")
            change_amt = price_info.get("change_amt")
            price_currency = price_info.get("currency", currency)
            price_label = price_info.get("label", "")

            # 평단가
            if price_currency == "USD":
                avg_price = h.get("avg_price_usd")
            else:
                avg_price = h.get("avg_price_krw")

            # 평가금액 계산
            if current_price is not None:
                value_native = shares * current_price
            elif avg_price:
                value_native = shares * avg_price
            else:
                value_native = 0

            value_krw = _to_krw(value_native, price_currency, usd_krw)

            # 원가 계산
            if avg_price:
                cost_native = shares * avg_price
                cost_krw = _to_krw(cost_native, price_currency, usd_krw)
                profit_native = value_native - cost_native if current_price else 0
                profit_krw = _to_krw(profit_native, price_currency, usd_krw)
                profit_pct = (profit_native / cost_native * 100) if cost_native else None
            else:
                cost_krw = 0
                profit_krw = 0
                profit_pct = None

            # 당일 변동
            day_change_krw = None
            if change_pct is not None and current_price:
                prev_price = current_price / (1 + change_pct / 100)
                day_change_per_share = change_amt if change_amt else (current_price - prev_price)
                day_change_native = shares * day_change_per_share
                day_change_krw = _to_krw(day_change_native, price_currency, usd_krw)
                account_day_change_krw += day_change_krw

            account_value_krw += value_krw
            account_cost_krw += cost_krw
            total_value_krw += value_krw
            total_cost_krw += cost_krw
            if price_currency == "USD":
                total_usd_value += value_native
            if day_change_krw:
                total_day_change_krw += day_change_krw

            # 종목별 합산
            merged_key = ticker
            if merged_key not in holdings_merged:
                holdings_merged[merged_key] = {
                    "name": h["name"],
                    "ticker": ticker,
                    "value_krw": 0,
                    "change_pct": change_pct,
                }
            holdings_merged[merged_key]["value_krw"] += value_krw

            holdings_data.append({
                "name": h["name"],
                "ticker": ticker,
                "shares": shares,
                "avg_price": avg_price,
                "current_price": current_price,
                "current_price_display": (f"${current_price:,.2f}" if price_currency == 'USD' else f"₩{round(current_price):,}") if current_price else None,
                "value_krw": round(value_krw),
                "cost_krw": round(cost_krw) if avg_price else None,
                "profit_krw": round(profit_krw) if avg_price else None,
                "profit_pct": round(profit_pct, 2) if profit_pct is not None else None,
                "day_change_pct": change_pct,
                "day_change_krw": round(day_change_krw) if day_change_krw is not None else None,
                "currency": price_currency,
                "price_label": price_label,
                "is_snapshot": False,
                "auto_buy": h.get("auto_buy"),
            })

        account_profit_krw = account_value_krw - account_cost_krw
        account_profit_pct = (account_profit_krw / account_cost_krw * 100) if account_cost_krw > 0 else None

        # IRP ETF 비중
        irp_info = None
        if account.get("etf_limit") is not None:
            irp_info = calc_irp_etf_ratio(account, prices, usd_krw)

        accounts_data.append({
            "name": account["name"],
            "type": account.get("type"),
            "value_krw": round(account_value_krw),
            "cost_krw": round(account_cost_krw),
            "profit_krw": round(account_profit_krw),
            "profit_pct": round(account_profit_pct, 2) if account_profit_pct is not None else None,
            "day_change_krw": round(account_day_change_krw),
            "holdings": holdings_data,
            "irp_info": irp_info,
        })

    # 환율 변동분 (USD 보유분 × (오늘 환율 - 전일 환율))
    fx_day_change_krw = 0
    if usd_krw_prev and usd_krw_prev > 0 and total_usd_value > 0:
        fx_day_change_krw = total_usd_value * (usd_krw - usd_krw_prev)
        total_day_change_krw += fx_day_change_krw

    # 부동산 순자산 (현재가 - 대출잔액) 계산 후 총계에 합산
    real_estate = portfolio.get("real_estate")
    re_equity_krw       = 0
    re_cost_krw         = 0
    re_gross_value_krw  = 0  # 부동산 매매가 합계 (대출 미차감)
    re_loan_krw         = 0  # 대출잔액 합계
    if real_estate:
        for prop in real_estate.get("properties", []):
            cur      = prop.get("current_value_krw", 0)
            purchase = prop.get("purchase_price_krw", 0)
            loan_bal = (prop.get("loan") or {}).get("balance_krw", 0)
            re_equity_krw      += cur - loan_bal
            re_cost_krw        += purchase - loan_bal
            re_gross_value_krw += cur
            re_loan_krw        += loan_bal
    total_value_krw += re_equity_krw
    total_cost_krw  += re_cost_krw

    total_profit_krw = total_value_krw - total_cost_krw
    total_profit_pct = (total_profit_krw / total_cost_krw * 100) if total_cost_krw > 0 else None

    # 비중 계산은 투자 자산만 (부동산 제외) — 도넛 차트 합계가 100%가 되도록
    invest_value_krw = total_value_krw - re_equity_krw

    # 종목별 비중 (상위 10)
    sorted_holdings = sorted(holdings_merged.values(), key=lambda x: x["value_krw"], reverse=True)[:10]
    for item in sorted_holdings:
        item["weight"] = round(item["value_krw"] / invest_value_krw * 100, 2) if invest_value_krw else 0

    # 계좌별 비중
    account_weights = [
        {
            "name": a["name"],
            "type": a["type"],
            "value_krw": a["value_krw"],
            "weight": round(a["value_krw"] / invest_value_krw * 100, 2) if invest_value_krw else 0,
        }
        for a in accounts_data
    ]

    # 자동매수 항목 (한 번만 계산해서 응답에 포함)
    auto_buy_items = calc_auto_buy_summary(portfolio, prices, usd_krw)

    total_day_change_pct = (total_day_change_krw / total_value_krw * 100) if total_value_krw else None

    # 자산군 / 지역 비중 (메타가 있는 종목만 합산, 미입력은 '미분류')
    class_totals: dict[str, float] = {}
    region_totals: dict[str, float] = {}
    for account in portfolio["accounts"]:
        currency = account.get("currency", "KRW")
        for h in account["holdings"]:
            # 평가금액 산출 (위 루프에서 못 받아오니 별도)
            ticker = h.get("ticker")
            shares = h.get("shares")
            snap_usd = h.get("snapshot_value_usd")
            snap = h.get("snapshot_value_krw")
            if snap_usd and not ticker:
                value_krw = snap_usd * usd_krw
            elif snap and not ticker:
                value_krw = snap
            elif ticker and shares:
                p = prices.get(ticker, {})
                price = p.get("price")
                if price is None:
                    price = h.get("avg_price_usd" if currency == "USD" else "avg_price_krw") or 0
                value_native = shares * price
                value_krw = value_native * (usd_krw if currency == "USD" else 1)
            else:
                continue
            cls = h.get("asset_class") or "미분류"
            reg = h.get("region") or ("미국" if currency == "USD" else "국내")
            class_totals[cls] = class_totals.get(cls, 0) + value_krw
            region_totals[reg] = region_totals.get(reg, 0) + value_krw

    def _to_weights(d: dict[str, float]) -> list[dict]:
        if not d or invest_value_krw == 0:
            return []
        return sorted(
            [
                {"name": k, "value_krw": round(v), "weight": round(v / invest_value_krw * 100, 2)}
                for k, v in d.items()
            ],
            key=lambda x: x["value_krw"],
            reverse=True,
        )

    # 현금/예금 자산 합산 (투자 총계에는 포함하지 않음, 별도 표시)
    cash_assets = portfolio.get("cash_assets")
    cash_total_krw = 0
    if cash_assets:
        for item in cash_assets.get("items", []):
            cash_total_krw += item.get("balance_krw", 0)

    goal_krw = portfolio.get("goal_krw")
    goal_progress = None
    if goal_krw and goal_krw > 0:
        goal_progress = round(total_value_krw / goal_krw * 100, 2)

    # 시장 상태 (실시간 가격이 하나라도 있으면 'live', 아니면 'closed')
    market_status = "closed"
    last_trade_date = None
    for p in prices.values():
        if p.get("is_realtime"):
            market_status = "live"
        fa = p.get("fetched_at")
        if fa and (last_trade_date is None or fa > last_trade_date):
            last_trade_date = fa

    # day_change 라벨용 직전 거래일 추정: KR 휴장이면 가장 최근 평일
    now_kst = datetime.now(timezone(timedelta(hours=9)))
    if now_kst.weekday() >= 5 or market_status == "closed":
        d = now_kst
        while d.weekday() >= 5:
            d = d - timedelta(days=1)
        day_change_label_date = d.strftime("%-m/%-d")
        day_change_label = f"{day_change_label_date} 등락"
    else:
        day_change_label = "오늘 등락"

    return {
        "total_value_krw": round(total_value_krw),
        "total_cost_krw": round(total_cost_krw),
        "total_profit_krw": round(total_profit_krw),
        "real_estate_equity_krw": round(re_equity_krw),
        "real_estate_cost_krw": round(re_cost_krw),
        "real_estate_gross_value_krw": round(re_gross_value_krw),
        "real_estate_loan_krw": round(re_loan_krw),
        "cash_assets": portfolio.get("cash_assets"),
        "cash_total_krw": round(cash_total_krw),
        "total_profit_pct": round(total_profit_pct, 2) if total_profit_pct is not None else None,
        "total_day_change_krw": round(total_day_change_krw),
        "total_day_change_pct": round(total_day_change_pct, 2) if total_day_change_pct is not None else None,
        "fx_day_change_krw": round(fx_day_change_krw),
        "usd_krw": usd_krw,
        "usd_krw_prev": usd_krw_prev,
        "accounts": accounts_data,
        "account_weights": account_weights,
        "top_holdings": sorted_holdings,
        "asset_class_weights": _to_weights(class_totals),
        "region_weights": _to_weights(region_totals),
        "auto_buy_items": auto_buy_items,
        "goal_krw": goal_krw,
        "goal_progress_pct": goal_progress,
        "market_status": market_status,
        "day_change_label": day_change_label,
        "real_estate": portfolio.get("real_estate"),
        "calculated_at": datetime.now().isoformat(),
    }
