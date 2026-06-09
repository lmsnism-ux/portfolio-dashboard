from __future__ import annotations

import base64
import importlib
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


def load_calculator(data_dir: str, seed: dict | None = None):
    os.environ["PORTFOLIO_DATA_DIR"] = data_dir
    if seed is None:
        os.environ.pop("PORTFOLIO_JSON_B64", None)
    else:
        raw = json.dumps(seed, ensure_ascii=False).encode("utf-8")
        os.environ["PORTFOLIO_JSON_B64"] = base64.b64encode(raw).decode("ascii")
    sys.modules.pop("portfolio_calculator", None)
    return importlib.import_module("portfolio_calculator")


class PortfolioCalculatorTest(unittest.TestCase):
    def tearDown(self) -> None:
        os.environ.pop("PORTFOLIO_DATA_DIR", None)
        os.environ.pop("PORTFOLIO_JSON_B64", None)
        sys.modules.pop("portfolio_calculator", None)

    def test_env_seed_and_save_are_cross_platform(self):
        with tempfile.TemporaryDirectory() as tmp:
            pc = load_calculator(tmp, {"goal_krw": 1000, "accounts": []})

            self.assertEqual(pc.load_portfolio()["goal_krw"], 1000)

            next_portfolio = {
                "goal_krw": 2000,
                "accounts": [{"name": "테스트", "type": "ISA", "holdings": []}],
            }
            pc.save_portfolio(next_portfolio)

            self.assertEqual(pc.load_portfolio()["goal_krw"], 2000)
            self.assertTrue((Path(tmp) / "portfolio.json").exists())

    def test_summary_calculates_fx_real_estate_and_weights(self):
        with tempfile.TemporaryDirectory() as tmp:
            pc = load_calculator(tmp)

            portfolio = {
                "goal_krw": 100_000,
                "accounts": [
                    {
                        "name": "US",
                        "type": "기본계좌",
                        "currency": "USD",
                        "holdings": [
                            {
                                "name": "QLD",
                                "ticker": "QLD",
                                "shares": 2,
                                "avg_price_usd": 10,
                                "asset_class": "주식",
                                "region": "미국",
                            }
                        ],
                    },
                    {
                        "name": "KR",
                        "type": "ISA",
                        "holdings": [
                            {
                                "name": "국내ETF",
                                "ticker": "123456",
                                "shares": 3,
                                "avg_price_krw": 1000,
                                "asset_class": "주식",
                                "region": "국내",
                            }
                        ],
                    },
                ],
                "real_estate": {
                    "properties": [
                        {
                            "name": "집",
                            "purchase_price_krw": 60,
                            "current_value_krw": 100,
                            "loan": {"balance_krw": 20},
                        }
                    ]
                },
                "cash_assets": {"items": [{"name": "예금", "balance_krw": 500}]},
            }
            prices = {
                "QLD": {
                    "price": 15,
                    "change_pct": 10,
                    "change_amt": 1,
                    "currency": "USD",
                    "label": "종가 기준",
                },
                "123456": {
                    "price": 1100,
                    "change_pct": 10,
                    "change_amt": 100,
                    "currency": "KRW",
                    "label": "종가 기준",
                },
            }

            summary = pc.build_portfolio_summary(portfolio, prices, usd_krw=1300, usd_krw_prev=1200)

            self.assertEqual(summary["total_value_krw"], 42_380)
            self.assertEqual(summary["total_cost_krw"], 29_040)
            self.assertEqual(summary["fx_day_change_krw"], 3_000)
            self.assertEqual(summary["total_day_change_krw"], 5_900)
            self.assertEqual(summary["real_estate_equity_krw"], 80)
            self.assertEqual(summary["cash_total_krw"], 500)
            self.assertEqual(summary["top_holdings"][0]["ticker"], "QLD")

    def test_date_labels_do_not_depend_on_unix_strftime_flags(self):
        with tempfile.TemporaryDirectory() as tmp:
            pc = load_calculator(tmp)
            now = datetime(2026, 6, 9, 9, tzinfo=timezone(timedelta(hours=9)))

            label, _ = pc._next_buy_date("weekly_friday", now)

            self.assertEqual(label, "6/12 (금)")


if __name__ == "__main__":
    unittest.main()
