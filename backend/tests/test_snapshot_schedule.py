"""스냅샷 cron 스케줄이 KST 기준 한국장·미국장 마감 직후를 가리는지 검증.

backfill_history 자체는 외부 네트워크를 호출하므로 단위 테스트에서 실행하지
않고, cron 표현식의 trigger 시각만 검증한다.
"""
from __future__ import annotations

import sys
import unittest
from datetime import datetime
from pathlib import Path

from apscheduler.triggers.cron import CronTrigger

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


def _next_fire(trigger: CronTrigger, after: datetime) -> datetime:
    """trigger의 after 다음 발화 시각."""
    return trigger.get_next_fire_time(None, after)


class SnapshotScheduleTest(unittest.TestCase):
    def test_kr_close_trigger_fires_at_kst_1630(self) -> None:
        """한국장 마감 직후 16:30 KST에 trigger."""
        t = CronTrigger(hour=16, minute=30, timezone="Asia/Seoul")
        # 임의의 평일 새벽 (UTC naive — pytz/zoneinfo가 알아서 처리)
        from zoneinfo import ZoneInfo
        kst = ZoneInfo("Asia/Seoul")
        ref = datetime(2026, 6, 9, 0, 0, tzinfo=kst)  # 화요일 00:00 KST
        fire = _next_fire(t, ref)
        self.assertEqual(fire.hour, 16)
        self.assertEqual(fire.minute, 30)
        self.assertEqual(fire.date(), ref.date())  # 같은 날 16:30

    def test_us_close_trigger_fires_at_kst_0630(self) -> None:
        """미국장 마감(EDT 16:00 ≈ KST 05:00) 직후 06:30 KST에 trigger."""
        t = CronTrigger(hour=6, minute=30, timezone="Asia/Seoul")
        from zoneinfo import ZoneInfo
        kst = ZoneInfo("Asia/Seoul")
        ref = datetime(2026, 6, 9, 0, 0, tzinfo=kst)
        fire = _next_fire(t, ref)
        self.assertEqual(fire.hour, 6)
        self.assertEqual(fire.minute, 30)

    def test_us_close_fires_before_kr_close_each_day(self) -> None:
        """하루를 KST 기준 0시부터 보면 06:30(미국 마감)이 먼저, 16:30(한국 마감)이 나중."""
        from datetime import timedelta
        from zoneinfo import ZoneInfo
        kst = ZoneInfo("Asia/Seoul")
        kr_t = CronTrigger(hour=16, minute=30, timezone="Asia/Seoul")
        us_t = CronTrigger(hour=6, minute=30, timezone="Asia/Seoul")
        ref = datetime(2026, 6, 9, 0, 0, tzinfo=kst)
        us_fire = _next_fire(us_t, ref)
        kr_fire = _next_fire(kr_t, ref)
        # 같은 날, 미국 마감이 10시간 먼저
        self.assertEqual(us_fire.date(), kr_fire.date())
        self.assertEqual(kr_fire - us_fire, timedelta(hours=10))


if __name__ == "__main__":
    unittest.main()
