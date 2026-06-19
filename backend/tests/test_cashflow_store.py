from __future__ import annotations

import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


class CashFlowStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["PORTFOLIO_DATA_DIR"] = self.tmp.name
        sys.modules.pop("cashflow_store", None)
        self.store = importlib.import_module("cashflow_store")

    def tearDown(self) -> None:
        self.tmp.cleanup()
        os.environ.pop("PORTFOLIO_DATA_DIR", None)

    def test_crud(self) -> None:
        flow_id = self.store.insert_cash_flow(flow_type="deposit", amount_krw=100_000, occurred_on="2026-01-02", note="seed")
        items = self.store.list_cash_flows(days=5000)
        self.assertEqual(items[0]["id"], flow_id)
        self.assertEqual(items[0]["amount_krw"], 100_000)
        self.assertTrue(self.store.delete_cash_flow(flow_id))

    def test_twr_removes_deposit(self) -> None:
        history = [
            {"date": "2026-01-01", "total_value_krw": 1_000_000},
            {"date": "2026-01-02", "total_value_krw": 1_600_000},
            {"date": "2026-01-03", "total_value_krw": 1_760_000},
        ]
        flows = [{"flow_type": "deposit", "amount_krw": 500_000, "occurred_on": "2026-01-02"}]
        result = self.store.calculate_performance(history, flows)
        self.assertTrue(result["available"])
        self.assertAlmostEqual(result["twr_pct"], 21.0, places=2)
        self.assertEqual(result["investment_result_krw"], 260_000)


if __name__ == "__main__":
    unittest.main()
