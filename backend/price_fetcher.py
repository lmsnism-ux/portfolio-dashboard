"""주가 및 환율 조회 모듈"""
import json
import os
import time
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
import requests
import yfinance as yf  # noqa: F401
from bs4 import BeautifulSoup
from price_cache_store import load_cache, save_cache, record_price_error, migrate_from_json

logger = logging.getLogger(__name__)

_DATA_DIR = Path(os.environ.get("PORTFOLIO_DATA_DIR", str(Path(__file__).parent)))
_DATA_DIR.mkdir(parents=True, exist_ok=True)
PORTFOLIO_FILE = _DATA_DIR / "portfolio.json"

# 기존 JSON 캐시 파일 → SQLite 마이그레이션 (최초 1회)
_OLD_CACHE = _DATA_DIR / "price_cache.json"
migrate_from_json(_OLD_CACHE)
KST = timezone(timedelta(hours=9))

# 미국 동부 시간: 서머타임(EDT=-4) / 겨울(EST=-5) 자동 전환.
# 이전엔 -4 고정값이라 11월 첫째주~3월 둘째주에 미국장 개장/마감 판정이 1시간 어긋났다.
try:
    from zoneinfo import ZoneInfo
    ET = ZoneInfo("America/New_York")
except Exception as _zi_err:  # pragma: no cover - tzdata 미설치 환경 폴백
    logger.warning(f"zoneinfo 사용 불가, EDT(-4) 고정값으로 폴백: {_zi_err}")
    ET = timezone(timedelta(hours=-4))

# 폴백용 기본 티커. portfolio.json에서 더 많이 발견되면 자동 확장.
DEFAULT_KOREAN_TICKERS = ["381170", "0167A0", "379800", "396500", "0021E0", "418660"]
DEFAULT_US_TICKERS = ["QLD", "TQQQ"]


def _is_korean_ticker(ticker: str) -> bool:
    """한국 ETF/주식 티커 판별: 숫자만 또는 숫자+영문 1글자 (6자리)"""
    if not ticker:
        return False
    t = ticker.upper()
    return len(t) == 6 and all(c.isdigit() or c.isalpha() for c in t) and any(c.isdigit() for c in t)


def _collect_tickers_from_portfolio() -> tuple[list[str], list[str]]:
    """portfolio.json에서 모든 ticker를 수집해 한국/미국으로 분류."""
    kr: set[str] = set(DEFAULT_KOREAN_TICKERS)
    us: set[str] = set(DEFAULT_US_TICKERS)
    try:
        if not PORTFOLIO_FILE.exists():
            return list(kr), list(us)
        portfolio = json.loads(PORTFOLIO_FILE.read_text())
        for acc in portfolio.get("accounts", []):
            for h in acc.get("holdings", []):
                ticker = (h.get("ticker") or "").strip()
                if not ticker:
                    continue
                if _is_korean_ticker(ticker):
                    kr.add(ticker)
                else:
                    us.add(ticker.upper())
    except Exception as e:
        logger.warning(f"티커 수집 실패 (기본값 사용): {e}")
    return list(kr), list(us)


def fetch_usd_krw():
    """USD/KRW 환율 + 전일 환율 조회.

    1순위: Yahoo Finance KRW=X (prev_close 포함)
    2순위: open.er-api (현재가만)
    3순위: 네이버 금융 크롤링 (현재가만)
    """
    # 1순위: Yahoo (전일 종가까지 같이)
    try:
        url = "https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?range=5d&interval=1d"
        r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        data = r.json()
        result = data.get("chart", {}).get("result", [])
        if result:
            closes = [c for c in result[0]["indicators"]["quote"][0]["close"] if c is not None]
            if len(closes) >= 1:
                cur = round(float(closes[-1]), 2)
                prev = round(float(closes[-2]), 2) if len(closes) >= 2 else None
                return {"rate": cur, "prev_close": prev}
    except Exception as e:
        logger.warning(f"Yahoo 환율 조회 실패: {e}")

    # 2순위: open.er-api
    try:
        r = requests.get("https://open.er-api.com/v6/latest/USD", timeout=10)
        data = r.json()
        if data.get("result") == "success":
            return {"rate": round(data["rates"]["KRW"], 2), "prev_close": None}
    except Exception as e:
        logger.warning(f"open.er-api 환율 조회 실패: {e}")

    # 3순위: 네이버
    try:
        r = requests.get(
            "https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=10,
        )
        soup = BeautifulSoup(r.text, "html.parser")
        val = soup.select_one(".blind")
        if val:
            return {"rate": float(val.text.replace(",", "")), "prev_close": None}
    except Exception as e:
        logger.warning(f"네이버 환율 폴백 실패: {e}")

    return None

def fetch_korean_etf_via_yahoo(ticker: str):
    """Yahoo Finance .KS / .KQ로 한국 ETF 가격 조회 (네이버 폴백용).

    한국 종목은 보통 Yahoo Finance에서 .KS (KOSPI) 또는 .KQ (KOSDAQ) 접미사를 사용한다.
    """
    for suffix in (".KS", ".KQ"):
        try:
            symbol = f"{ticker}{suffix}"
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=5d&interval=1d"
            r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
            data = r.json()
            result = data.get("chart", {}).get("result", [])
            if not result:
                continue
            closes = [c for c in result[0]["indicators"]["quote"][0]["close"] if c is not None]
            if not closes:
                continue
            current_price = closes[-1]
            prev_close = closes[-2] if len(closes) >= 2 else None
            change_pct = None
            change_amt = None
            if current_price and prev_close:
                change_amt = round(current_price - prev_close, 2)
                change_pct = round((change_amt / prev_close) * 100, 2)
            now_kst = datetime.now(KST)
            is_open = 9 <= now_kst.hour < 16 and now_kst.weekday() < 5
            return {
                "price": round(current_price, 2),
                "change_pct": change_pct,
                "change_amt": change_amt,
                "currency": "KRW",
                "is_realtime": is_open,
                "label": "실시간" if is_open else "종가 기준",
                "fetched_at": datetime.now(KST).isoformat(),
            }
        except Exception:
            continue
    return None


def fetch_korean_etf_price(ticker: str):
    """한국 ETF 가격 조회. 1순위 네이버 크롤링 → 실패 시 Yahoo .KS/.KQ 폴백."""
    result = _fetch_korean_etf_via_naver(ticker)
    if result is not None:
        return result
    logger.info(f"네이버 실패 → Yahoo 폴백: {ticker}")
    return fetch_korean_etf_via_yahoo(ticker)


def _fetch_korean_etf_via_naver(ticker: str):
    """네이버 금융에서 한국 ETF 현재가 + 전일 대비 변동 조회.

    네이버 마크업(2026-06 기준):
      div.today
        p.no_today em.no_up|no_down|X > span.blind  → 현재가
        p.no_exday em(첫번째) > span.blind          → 변동 금액
        p.no_exday em(두번째) > span.blind          → 변동률(%)
      em.no_down 클래스가 붙어있거나 span.ico.down/down_arrow 존재 → 하락
    """
    try:
        url = f"https://finance.naver.com/item/main.naver?code={ticker}"
        r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        soup = BeautifulSoup(r.text, "html.parser")

        today = soup.select_one("div.today")
        if not today:
            return None

        # 현재가
        cur_blind = today.select_one("p.no_today span.blind")
        if not cur_blind:
            return None
        try:
            current_price = float(cur_blind.get_text(strip=True).replace(",", ""))
        except ValueError:
            return None

        # 전일 대비
        change_pct = None
        change_amt = None
        exday = today.select_one("p.no_exday")
        if exday:
            # em 두 개: [0]=변동금액, [1]=변동률
            ems = exday.find_all("em", recursive=False) or exday.select("em")
            blinds = exday.select("span.blind")

            if len(blinds) >= 1:
                try:
                    change_amt = float(blinds[0].get_text(strip=True).replace(",", ""))
                except ValueError:
                    pass
            if len(blinds) >= 2:
                try:
                    change_pct = float(blinds[1].get_text(strip=True).replace(",", "").replace("%", ""))
                except ValueError:
                    pass

            # 방향(상승/하락) 판정
            is_down = (
                bool(exday.select_one("em.no_down"))
                or bool(exday.select_one("span.ico.down"))
                or bool(exday.select_one("span.ico.down_arrow"))
                or bool(exday.select_one("span.ico.minus"))
            )
            is_up = (
                bool(exday.select_one("em.no_up"))
                or bool(exday.select_one("span.ico.up"))
                or bool(exday.select_one("span.ico.up_arrow"))
                or bool(exday.select_one("span.ico.plus"))
            )
            if is_down and not is_up:
                if change_amt is not None:
                    change_amt = -abs(change_amt)
                if change_pct is not None:
                    change_pct = -abs(change_pct)

        now_kst = datetime.now(KST)
        market_open = now_kst.replace(hour=9, minute=0, second=0, microsecond=0)
        market_close = now_kst.replace(hour=15, minute=30, second=0, microsecond=0)
        is_market_hours = market_open <= now_kst <= market_close and now_kst.weekday() < 5

        return {
            "price": current_price,
            "change_pct": change_pct,
            "change_amt": change_amt,
            "currency": "KRW",
            "is_realtime": is_market_hours,
            "label": "실시간" if is_market_hours else "종가 기준",
            "fetched_at": datetime.now(KST).isoformat(),
        }
    except Exception as e:
        logger.warning(f"한국 ETF {ticker} 조회 실패: {e}")
        return None

def fetch_us_stock_price(ticker: str):
    """Yahoo Finance API로 미국 주식 현재가 조회"""
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=5d&interval=1d"
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "application/json",
        }
        r = requests.get(url, headers=headers, timeout=10)
        data = r.json()
        result = data.get("chart", {}).get("result", [])
        if not result:
            return None

        closes = result[0]["indicators"]["quote"][0]["close"]
        closes = [c for c in closes if c is not None]
        if not closes:
            return None

        current_price = closes[-1]
        prev_close = closes[-2] if len(closes) >= 2 else None

        change_pct = None
        change_amt = None
        if current_price and prev_close:
            change_amt = round(current_price - prev_close, 4)
            change_pct = round((change_amt / prev_close) * 100, 2)

        now_et = datetime.now(ET)
        market_open_et = now_et.replace(hour=9, minute=30, second=0, microsecond=0)
        market_close_et = now_et.replace(hour=16, minute=0, second=0, microsecond=0)
        is_market_hours = market_open_et <= now_et <= market_close_et and now_et.weekday() < 5

        return {
            "price": round(current_price, 4),
            "change_pct": change_pct,
            "change_amt": change_amt,
            "currency": "USD",
            "is_realtime": is_market_hours,
            "label": "실시간" if is_market_hours else "종가 기준",
            "fetched_at": datetime.now(KST).isoformat(),
        }
    except Exception as e:
        logger.warning(f"미국 주식 {ticker} 조회 실패: {e}")
        return None

def refresh_all_prices() -> dict:
    """모든 가격 갱신 후 SQLite 캐시 저장. portfolio.json에서 티커를 동적으로 수집."""
    cache = load_cache()
    prices = cache.get("prices", {})

    # 환율
    fx = fetch_usd_krw()
    if fx:
        cache["usd_krw"] = fx["rate"]
        if fx.get("prev_close"):
            cache["usd_krw_prev"] = fx["prev_close"]
        logger.info(f"환율 갱신: {fx['rate']} (prev={fx.get('prev_close')})")

    # portfolio.json에서 현재 보유 중인 티커를 자동 수집
    kr_tickers, us_tickers = _collect_tickers_from_portfolio()
    logger.info(f"가격 갱신 대상: KR {len(kr_tickers)}개, US {len(us_tickers)}개")

    # 한국 ETF
    for ticker in kr_tickers:
        result = fetch_korean_etf_price(ticker)
        if result:
            prices[ticker] = result
            logger.info(f"KR ETF {ticker}: {result['price']}")
        else:
            record_price_error(ticker, "한국 ETF 가격 조회 실패 (네이버/Yahoo 모두 실패)")
        time.sleep(0.5)

    # 미국 ETF / 주식
    for ticker in us_tickers:
        result = fetch_us_stock_price(ticker)
        if result:
            prices[ticker] = result
            logger.info(f"US {ticker}: {result['price']}")
        else:
            record_price_error(ticker, "미국 주식 가격 조회 실패")
        time.sleep(0.3)

    cache["prices"] = prices
    cache["updated_at"] = datetime.now(KST).isoformat()
    save_cache(cache)
    return cache

def get_cached_prices() -> dict:
    return load_cache()
