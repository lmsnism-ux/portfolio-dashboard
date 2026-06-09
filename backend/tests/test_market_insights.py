"""market_insights 시그널 로직 회귀 락 (네트워크 없는 순수 함수만).

규칙: 추세(5/20일선) + 모멘텀(20일) 추종, RSI는 과열/과매도 오버레이.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from market_insights import _rsi, _sma, compute_signal  # noqa: E402


class SmaRsiTest(unittest.TestCase):
    def test_sma_basic(self) -> None:
        self.assertEqual(_sma([1, 2, 3, 4, 5], 5), 3)
        self.assertEqual(_sma([1, 2, 3, 4, 5], 2), 4.5)

    def test_sma_insufficient_data(self) -> None:
        self.assertIsNone(_sma([1, 2], 5))

    def test_rsi_bounds(self) -> None:
        # 연속 상승 → RSI 100, 연속 하락 → RSI 0
        rising = [float(i) for i in range(1, 31)]
        falling = [float(i) for i in range(30, 0, -1)]
        self.assertEqual(_rsi(rising), 100.0)
        self.assertEqual(_rsi(falling), 0.0)

    def test_rsi_insufficient_data(self) -> None:
        self.assertIsNone(_rsi([1.0] * 10))


def _noisy_up(n: int = 30) -> list[float]:
    """노이즈 섞인 상승 추세 — RSI가 과열(75) 미만에 머무는 현실적 상승."""
    closes = [100.0]
    for i in range(1, n):
        closes.append(closes[-1] + (2.0 if i % 2 else -1.2))
    return closes


def _noisy_down(n: int = 30) -> list[float]:
    closes = [100.0]
    for i in range(1, n):
        closes.append(closes[-1] - (2.0 if i % 2 else -1.2))
    return closes


class ComputeSignalTest(unittest.TestCase):
    def test_insufficient_data_returns_none(self) -> None:
        self.assertIsNone(compute_signal([100.0] * 20))

    def test_noisy_uptrend_is_buy(self) -> None:
        sig = compute_signal(_noisy_up())
        self.assertIsNotNone(sig)
        self.assertEqual(sig["signal"], "buy")
        self.assertLess(sig["rsi"], 75)

    def test_noisy_downtrend_is_sell(self) -> None:
        sig = compute_signal(_noisy_down())
        self.assertIsNotNone(sig)
        self.assertEqual(sig["signal"], "sell")
        self.assertGreater(sig["rsi"], 25)

    def test_parabolic_rise_is_hold_overheated(self) -> None:
        """일직선 급등: 추세 상승이지만 RSI 100 과열 → 관망."""
        closes = [100.0 + i * 2 for i in range(30)]
        sig = compute_signal(closes)
        self.assertEqual(sig["signal"], "hold")
        self.assertGreaterEqual(sig["rsi"], 75)

    def test_crash_is_hold_oversold(self) -> None:
        """일직선 급락: 추세 하락이지만 RSI 0 낙폭과대 → 관망 (바닥 추격 매도 방지)."""
        closes = [100.0 - i * 1.5 for i in range(30)]
        sig = compute_signal(closes)
        self.assertEqual(sig["signal"], "hold")
        self.assertLessEqual(sig["rsi"], 25)

    def test_flat_series_is_hold(self) -> None:
        closes = [100.0 + (0.3 if i % 2 else -0.3) for i in range(30)]
        sig = compute_signal(closes)
        self.assertEqual(sig["signal"], "hold")

    def test_rollover_top_is_sell(self) -> None:
        """상승 후 고점 이탈(분배 구간) → 매도 검토."""
        closes = [100 + 2.0 * i for i in range(1, 16)] + [130 - 1.0 * i for i in range(1, 16)]
        sig = compute_signal([float(c) for c in closes])
        self.assertEqual(sig["signal"], "sell")

    def test_base_recovery_is_buy(self) -> None:
        """바닥 다지기 후 회복 → 매수 검토."""
        closes = [100.0] * 5 + [100 - 1.5 * i for i in range(1, 11)] + [85 + 1.2 * i for i in range(1, 16)]
        sig = compute_signal([float(c) for c in closes])
        self.assertEqual(sig["signal"], "buy")

    def test_payload_shape(self) -> None:
        sig = compute_signal(_noisy_up())
        for key in ("signal", "signal_label", "rsi", "mom20_pct", "reasons"):
            self.assertIn(key, sig)
        self.assertIn(sig["signal_label"], ("매수 검토", "관망", "매도 검토"))
        self.assertGreater(len(sig["reasons"]), 0)


if __name__ == "__main__":
    unittest.main()
