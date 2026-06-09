"""한국거래소(KRX) 휴장일.

frontend/src/utils.ts의 KR_MARKET_HOLIDAYS와 동일 데이터를 유지해야 한다.
임시공휴일이 추가될 수 있으므로 매년 연초 갱신 권장.

출처: https://open.krx.co.kr/contents/MKD/01/0110/01100305/MKD01100305.jsp
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))

KR_MARKET_HOLIDAYS: frozenset[str] = frozenset({
    # 2025
    "2025-01-01",  # 신정
    "2025-01-28", "2025-01-29", "2025-01-30",  # 설날 연휴 + 임시
    "2025-03-03",  # 삼일절 대체
    "2025-05-01",  # 근로자의 날
    "2025-05-05",  # 어린이날
    "2025-05-06",  # 대체공휴일
    "2025-06-03",  # 대선 임시공휴일
    "2025-06-06",  # 현충일
    "2025-08-15",  # 광복절
    "2025-10-03",  # 개천절
    "2025-10-06", "2025-10-07", "2025-10-08",  # 추석 연휴
    "2025-10-09",  # 한글날
    "2025-12-25",  # 크리스마스
    "2025-12-31",  # 연말 폐장
    # 2026
    "2026-01-01",  # 신정
    "2026-02-16", "2026-02-17", "2026-02-18",  # 설날 연휴
    "2026-03-02",  # 삼일절 대체
    "2026-05-01",  # 근로자의 날
    "2026-05-05",  # 어린이날
    "2026-05-25",  # 부처님오신날
    "2026-06-03",  # 지방선거
    "2026-09-24", "2026-09-25", "2026-09-26",  # 추석 연휴
    "2026-10-09",  # 한글날
    "2026-12-25",  # 크리스마스
    "2026-12-31",  # 연말 폐장
})


def is_kr_market_holiday(d: date | None = None) -> bool:
    """KST 기준 주어진 날짜가 KRX 휴장일인지."""
    if d is None:
        d = datetime.now(KST).date()
    return d.isoformat() in KR_MARKET_HOLIDAYS


def is_kr_market_closed_today(now: datetime | None = None) -> bool:
    """오늘이 주말 또는 공휴일이면 True."""
    if now is None:
        now = datetime.now(KST)
    if now.weekday() >= 5:  # 토/일
        return True
    return is_kr_market_holiday(now.date())
