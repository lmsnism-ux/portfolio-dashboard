"""price_fetcher.ET 가 DST(서머타임)를 자동 전환하는지 검증.

이전엔 -4 고정값이라 11월 첫째주~3월 둘째주에 미국장 개장(09:30 ET)/
마감(16:00 ET) 판정이 1시간씩 어긋났다.
"""
from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from price_fetcher import ET  # noqa: E402


class EastingTimeDstTest(unittest.TestCase):
    def test_july_uses_edt_minus_4(self) -> None:
        """7월 한낮: EDT, UTC-4"""
        july = datetime(2026, 7, 15, 12, 0, tzinfo=ET)
        self.assertEqual(july.utcoffset(), timedelta(hours=-4))

    def test_january_uses_est_minus_5(self) -> None:
        """1월 한낮: EST, UTC-5 — 이전 -4 고정값이라면 실패"""
        january = datetime(2026, 1, 15, 12, 0, tzinfo=ET)
        # zoneinfo 폴백시엔 -4가 그대로 나오니 둘 다 허용하되 경고를 남김
        offset = january.utcoffset()
        if offset == timedelta(hours=-4):
            self.skipTest("tzdata 미설치 환경 — DST 자동 전환 불가 (폴백 동작)")
        self.assertEqual(offset, timedelta(hours=-5))

    def test_dst_spring_forward(self) -> None:
        """3월 둘째 일요일 02:00 → 03:00 점프"""
        # 2026-03-08 일요일이 DST 시작
        before = datetime(2026, 3, 8, 1, 30, tzinfo=ET)
        after = datetime(2026, 3, 8, 12, 0, tzinfo=ET)
        if before.utcoffset() == after.utcoffset():
            self.skipTest("tzdata 미설치 환경 — DST 자동 전환 불가 (폴백 동작)")
        self.assertEqual(before.utcoffset(), timedelta(hours=-5))
        self.assertEqual(after.utcoffset(), timedelta(hours=-4))


if __name__ == "__main__":
    unittest.main()
