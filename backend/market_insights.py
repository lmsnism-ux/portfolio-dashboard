"""시장 인사이트 — 뉴스 헤드라인 + 기술적 지표 기반 종목 시그널.

시그널은 추세 추종을 기본으로 RSI(14)를 과열/과매도 오버레이로 쓰는
휴리스틱이며 투자 권유가 아닌 참고용이다.

  매수 검토: 5일선 > 20일선 + 20일 수익률 >= +3%  (단, RSI >= 75 과열이면 관망)
  매도 검토: 5일선 < 20일선 + 20일 수익률 <= -3%  (단, RSI <= 25 낙폭과대면 관망)
  관망:     그 외 (추세 불명확 / 과열 / 낙폭과대)

점수 합산 방식은 RSI 역추세 점수와 추세 점수가 상쇄돼 모든 케이스가
'관망'으로 수렴하는 문제가 있어 규칙 기반으로 설계했다.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import requests

from history_backfill import fetch_kr_etf_series, fetch_us_series
from portfolio_calculator import load_portfolio
from price_fetcher import _is_korean_ticker

logger = logging.getLogger(__name__)
KST = timezone(timedelta(hours=9))

SIGNAL_LABELS = {"buy": "매수 검토", "hold": "관망", "sell": "매도 검토"}


def _sma(closes: list[float], n: int) -> Optional[float]:
    if len(closes) < n:
        return None
    return sum(closes[-n:]) / n


def _rsi(closes: list[float], period: int = 14) -> Optional[float]:
    """Wilder 평활 RSI."""
    if len(closes) < period + 1:
        return None
    gains: list[float] = []
    losses: list[float] = []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0.0))
        losses.append(max(-diff, 0.0))
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - 100 / (1 + rs), 1)


def compute_signal(closes: list[float]) -> Optional[dict[str, Any]]:
    """종가 시계열(과거→최신)로 시그널 계산. 데이터 부족 시 None."""
    if len(closes) < 21:
        return None

    last = closes[-1]
    rsi = _rsi(closes)
    sma5 = _sma(closes, 5)
    sma20 = _sma(closes, 20)
    mom20 = (last / closes[-21] - 1) * 100

    uptrend = sma5 is not None and sma20 is not None and sma5 > sma20
    reasons: list[str] = []

    if uptrend:
        reasons.append("5일선이 20일선 위 — 단기 상승 추세")
    else:
        reasons.append("5일선이 20일선 아래 — 단기 하락 추세")
    reasons.append(f"최근 20일 {'+' if mom20 >= 0 else ''}{mom20:.1f}%")

    if uptrend and mom20 >= 3:
        if rsi is not None and rsi >= 75:
            signal = "hold"
            reasons.append(f"RSI {rsi} — 과열 구간, 신규 매수보다 관망")
        else:
            signal = "buy"
            if rsi is not None:
                reasons.append(f"RSI {rsi}")
    elif not uptrend and mom20 <= -3:
        if rsi is not None and rsi <= 25:
            signal = "hold"
            reasons.append(f"RSI {rsi} — 낙폭 과대, 반등 변동성 주의")
        else:
            signal = "sell"
            if rsi is not None:
                reasons.append(f"RSI {rsi}")
    else:
        signal = "hold"
        if rsi is not None:
            reasons.append(f"RSI {rsi} — 추세 불명확")

    return {
        "signal": signal,
        "signal_label": SIGNAL_LABELS[signal],
        "rsi": rsi,
        "mom20_pct": round(mom20, 2),
        "reasons": reasons,
    }


def fetch_news(query: str, count: int = 5) -> list[dict[str, Any]]:
    """Yahoo Finance 검색 API의 뉴스 헤드라인."""
    try:
        url = (
            "https://query1.finance.yahoo.com/v1/finance/search"
            f"?q={query}&newsCount={count}&quotesCount=0"
        )
        r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        news = r.json().get("news", [])[:count]
        items = []
        for n in news:
            pub_ts = n.get("providerPublishTime")
            items.append({
                "title": n.get("title"),
                "publisher": n.get("publisher"),
                "link": n.get("link"),
                "published_at": (
                    datetime.fromtimestamp(pub_ts, tz=timezone.utc).astimezone(KST).isoformat()
                    if pub_ts else None
                ),
            })
        return items
    except Exception as e:
        logger.warning(f"뉴스 조회 실패 ({query}): {e}")
        return []


def build_insights() -> dict[str, Any]:
    """포트폴리오 보유 종목별 시그널 + 시장 뉴스 헤드라인."""
    portfolio = load_portfolio()

    # 보유 종목 수집 (ticker 중복 제거)
    seen: dict[str, dict[str, str]] = {}
    for account in portfolio.get("accounts", []):
        for h in account.get("holdings", []):
            ticker = (h.get("ticker") or "").strip()
            if not ticker or ticker in seen:
                continue
            seen[ticker] = {"name": h.get("name") or ticker, "ticker": ticker}

    signals: list[dict[str, Any]] = []
    for ticker, info in seen.items():
        is_kr = _is_korean_ticker(ticker)
        try:
            if is_kr:
                series = fetch_kr_etf_series(ticker, pages=4)
            else:
                series = fetch_us_series(ticker, days=60)
        except Exception as e:
            logger.warning(f"시계열 조회 실패 ({ticker}): {e}")
            series = {}

        closes = [series[d] for d in sorted(series.keys())]
        sig = compute_signal(closes)
        if sig is None:
            continue
        signals.append({
            "name": info["name"],
            "ticker": ticker,
            "exchange": "KR" if is_kr else "US",
            **sig,
        })

    # 시그널 우선순위: 매수/매도 먼저, 관망 나중. 같은 그룹은 모멘텀 큰 순.
    order = {"buy": 0, "sell": 1, "hold": 2}
    signals.sort(key=lambda s: (order[s["signal"]], -abs(s["mom20_pct"] or 0)))

    return {
        "generated_at": datetime.now(KST).isoformat(),
        "news": {
            "kospi": fetch_news("KOSPI", count=5),
            "nasdaq": fetch_news("NASDAQ", count=5),
        },
        "signals": signals,
        "disclaimer": (
            "RSI·이동평균·모멘텀 기반 참고용 시그널입니다. "
            "투자 권유가 아니며 투자 손익의 책임은 투자자 본인에게 있습니다."
        ),
    }
