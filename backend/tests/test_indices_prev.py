"""지수 현재가/전일 종가 보정(_resolve_last_prev) 회귀 락.

Yahoo 시리즈가 당일 bar 없이 직전 거래일까지만 오는 경우(데이터 지연·
close=null 필터), 기존 로직은 전일 종가를 현재가로, 전전일 종가를
전일 종가로 잘못 사용했다.
"""
from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from main import _resolve_last_prev, _yahoo_bar_date  # noqa: E402

KST_OFFSET = 9 * 3600  # 한국거래소 gmtoffset


def _kst_ts(y: int, m: int, d: int, hh: int = 15, mm: int = 30) -> int:
    """KST 일시 → unix timestamp."""
    kst = timezone(timedelta(hours=9))
    return int(datetime(y, m, d, hh, mm, tzinfo=kst).timestamp())


class ResolveLastPrevTest(unittest.TestCase):
    def test_series_includes_today(self) -> None:
        """정상: 시리즈에 당일 bar 포함 → last=당일, prev=전일."""
        items = [
            {"date": "2026-06-08", "close": 2600.0},
            {"date": "2026-06-09", "close": 2620.0},
            {"date": "2026-06-10", "close": 2650.0},
        ]
        meta = {
            "regularMarketPrice": 2650.0,
            "regularMarketTime": _kst_ts(2026, 6, 10),
            "gmtoffset": KST_OFFSET,
        }
        last, prev = _resolve_last_prev(items, meta)
        self.assertEqual(last, 2650.0)
        self.assertEqual(prev, 2620.0)  # 전일 (전전일 2600 아님)

    def test_series_lags_one_day(self) -> None:
        """버그 케이스: 시리즈가 전일까지만 옴 → last=meta 체결가, prev=시리즈 마지막(전일)."""
        items = [
            {"date": "2026-06-08", "close": 2600.0},
            {"date": "2026-06-09", "close": 2620.0},
        ]
        meta = {
            "regularMarketPrice": 2655.0,  # 당일 체결가는 meta에만 존재
            "regularMarketTime": _kst_ts(2026, 6, 10),
            "gmtoffset": KST_OFFSET,
        }
        last, prev = _resolve_last_prev(items, meta)
        self.assertEqual(last, 2655.0)   # 기존 로직이면 2620 (전일 종가)
        self.assertEqual(prev, 2620.0)   # 기존 로직이면 2600 (전전일 종가)

    def test_no_meta_falls_back_to_items(self) -> None:
        items = [
            {"date": "2026-06-09", "close": 2620.0},
            {"date": "2026-06-10", "close": 2650.0},
        ]
        last, prev = _resolve_last_prev(items, {})
        self.assertEqual(last, 2650.0)
        self.assertEqual(prev, 2620.0)

    def test_empty_items(self) -> None:
        self.assertEqual(_resolve_last_prev([], {}), (None, None))

    def test_bar_date_uses_exchange_timezone(self) -> None:
        """gmtoffset 기준 날짜 변환 — 서버 timezone과 무관."""
        # 2026-06-10 09:00 KST 개장 bar = 2026-06-10 00:00 UTC
        ts = _kst_ts(2026, 6, 10, 9, 0)
        self.assertEqual(_yahoo_bar_date(ts, KST_OFFSET), "2026-06-10")
        # 같은 ts를 미국 동부(-4h)로 보면 6/9
        self.assertEqual(_yahoo_bar_date(ts, -4 * 3600), "2026-06-09")


if __name__ == "__main__":
    unittest.main()
