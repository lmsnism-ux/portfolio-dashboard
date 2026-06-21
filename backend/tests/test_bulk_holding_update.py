from __future__ import annotations

import importlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


class BulkHoldingUpdateTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["PORTFOLIO_DATA_DIR"] = self.tmp.name
        self.path = Path(self.tmp.name) / "portfolio.json"
        self.path.write_text(json.dumps({
            "accounts": [{
                "name": "테스트 계좌",
                "type": "주식",
                "holdings": [{"name": "테스트 종목", "ticker": "TEST", "shares": 1, "avg_price_krw": 1000}],
            }],
        }, ensure_ascii=False), encoding="utf-8")

        for module in list(sys.modules):
            if module in ("main", "portfolio_calculator", "history_store", "history_backfill", "trade_store", "price_fetcher"):
                sys.modules.pop(module, None)
        main = importlib.import_module("main")
        from fastapi.testclient import TestClient
        self.client = TestClient(main.app)

    def tearDown(self) -> None:
        os.environ.pop("PORTFOLIO_DATA_DIR", None)
        self.tmp.cleanup()

    def _holding(self) -> dict:
        return json.loads(self.path.read_text(encoding="utf-8"))["accounts"][0]["holdings"][0]

    def test_updates_reviewed_values_at_once(self) -> None:
        response = self.client.patch("/api/portfolio/holdings/bulk", json={"updates": [{
            "account_name": "테스트 계좌",
            "holding_key": "TEST",
            "shares": 3.5,
            "avg_price_krw": 1200,
        }]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["updated"], 1)
        self.assertEqual(self._holding()["shares"], 3.5)
        self.assertEqual(self._holding()["avg_price_krw"], 1200)

    def test_invalid_batch_does_not_partially_save(self) -> None:
        response = self.client.patch("/api/portfolio/holdings/bulk", json={"updates": [
            {"account_name": "테스트 계좌", "holding_key": "TEST", "shares": 9},
            {"account_name": "테스트 계좌", "holding_key": "MISSING", "shares": 2},
        ]})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self._holding()["shares"], 1)


if __name__ == "__main__":
    unittest.main()
