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

logger = logging.getLogger(__name__)

_DATA_DIR = Path(os.environ.get("PORTFOLIO_DATA_DIR", str(Path(__file__).parent)))
_DATA_DIR.mkdir(parents=True, exist_ok=True)
CACHE_FILE = _DATA_DIR / "price_cache.json"
KST = timezone(timedelta(hours=9))
ET = timezone(timedelta(hours=-4))  # EDT (summer)

KOREAN_TICKERS = ["381170", "0167A0", "379800", "396500", "0021E0"]
US_TICKERS = ["QLD", "TQQQ"]

def _load_cache() -> dict:
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text())
        except Exception:
            pass
    return {"prices": {}, "usd_krw": None, "updated_at": None}

def _save_cache(data: dict):
    CACHE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))

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

def fetch_korean_etf_price(ticker: str):
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
    """모든 가격 갱신 후 캐시 저장"""
    cache = _load_cache()
    prices = cache.get("prices", {})

    # 환율
    fx = fetch_usd_krw()
    if fx:
        cache["usd_krw"] = fx["rate"]
        if fx.get("prev_close"):
            cache["usd_krw_prev"] = fx["prev_close"]
        logger.info(f"환율 갱신: {fx['rate']} (prev={fx.get('prev_close')})")

    # 한국 ETF
    for ticker in KOREAN_TICKERS:
        result = fetch_korean_etf_price(ticker)
        if result:
            prices[ticker] = result
            logger.info(f"KR ETF {ticker}: {result['price']}")
        time.sleep(0.5)

    # 미국 ETF
    for ticker in US_TICKERS:
        result = fetch_us_stock_price(ticker)
        if result:
            prices[ticker] = result
            logger.info(f"US {ticker}: {result['price']}")
        time.sleep(0.3)

    cache["prices"] = prices
    cache["updated_at"] = datetime.now(KST).isoformat()
    _save_cache(cache)
    return cache

def get_cached_prices() -> dict:
    return _load_cache()
