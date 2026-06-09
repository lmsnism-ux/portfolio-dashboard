from __future__ import annotations

import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


def load_trade_store(data_dir: str):
    os.environ["PORTFOLIO_DATA_DIR"] = data_dir
    sys.modules.pop("trade_store", None)
    return importlib.import_module("trade_store")


class TradeStoreTest(unittest.TestCase):
    def tearDown(self) -> None:
        os.environ.pop("PORTFOLIO_DATA_DIR", None)
        sys.modules.pop("trade_store", None)

    def test_aggregate_uses_weighted_average_and_net_shares(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = load_trade_store(tmp)

            first_id = store.insert_trade(
                account_name="토스증권",
                holding_key="QLD",
                name="QLD",
                ticker="QLD",
                side="buy",
                shares=2,
                price=10,
                currency="USD",
            )
            store.insert_trade(
                account_name="토스증권",
                holding_key="QLD",
                name="QLD",
                ticker="QLD",
                side="buy",
                shares=1,
                price=16,
                currency="USD",
            )
            store.insert_trade(
                account_name="토스증권",
                holding_key="QLD",
                name="QLD",
                ticker="QLD",
                side="sell",
                shares=0.5,
                price=20,
                currency="USD",
            )

            agg = store.aggregate_for_holding("토스증권", "QLD")

            self.assertEqual(first_id, 1)
            self.assertEqual(agg["trade_count"], 3)
            self.assertEqual(agg["net_shares"], 2.5)
            self.assertAlmostEqual(agg["avg_price_from_trades"], 12)

    def test_delete_trade_removes_record(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = load_trade_store(tmp)
            trade_id = store.insert_trade(
                account_name="ISA",
                holding_key="123456",
                name="국내ETF",
                ticker="123456",
                side="buy",
                shares=3,
                price=1000,
                currency="KRW",
            )

            self.assertTrue(store.delete_trade(trade_id))
            self.assertEqual(store.list_trades(limit=10), [])


if __name__ == "__main__":
    unittest.main()
