"""한국거래소 휴장일 헬퍼 회귀 락."""
from __future__ import annotations

import sys
import unittest
from datetime import date, datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from holidays import (  # noqa: E402
    KR_MARKET_HOLIDAYS,
    KST,
    is_kr_market_closed_today,
    is_kr_market_holiday,
)


class KrHolidayTest(unittest.TestCase):
    def test_new_year_is_holiday(self) -> None:
        self.assertTrue(is_kr_market_holiday(date(2026, 1, 1)))
        self.assertTrue(is_kr_market_holiday(date(2025, 1, 1)))

    def test_chuseok_2026_three_days(self) -> None:
        # 2026 추석 9/24~26
        for day in (24, 25, 26):
            self.assertTrue(is_kr_market_holiday(date(2026, 9, day)))

    def test_regular_weekday_is_not_holiday(self) -> None:
        # 2026-06-09 화요일, 비공휴일
        self.assertFalse(is_kr_market_holiday(date(2026, 6, 9)))

    def test_saturday_is_market_closed(self) -> None:
        # 2026-06-13 토요일
        sat = datetime(2026, 6, 13, 10, 0, tzinfo=KST)
        self.assertTrue(is_kr_market_closed_today(sat))

    def test_weekday_holiday_is_market_closed(self) -> None:
        new_year = datetime(2026, 1, 1, 10, 0, tzinfo=KST)
        self.assertTrue(is_kr_market_closed_today(new_year))

    def test_regular_weekday_market_is_open(self) -> None:
        tue = datetime(2026, 6, 9, 10, 0, tzinfo=KST)
        self.assertFalse(is_kr_market_closed_today(tue))

    def test_all_holiday_entries_are_iso_format(self) -> None:
        for s in KR_MARKET_HOLIDAYS:
            date.fromisoformat(s)  # raises if malformed


if __name__ == "__main__":
    unittest.main()
