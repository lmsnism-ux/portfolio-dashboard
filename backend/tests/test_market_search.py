from __future__ import annotations

import importlib
import os
import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


class MarketSearchTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        os.environ.pop("PORTFOLIO_API_KEY", None)
        cls.main = importlib.import_module("main")
        cls.items = [
            {"itemcode": "133690", "itemname": "TIGER 미국나스닥100"},
            {"itemcode": "486290", "itemname": "TIGER 미국나스닥100타겟데일리커버드콜"},
            {"itemcode": "379810", "itemname": "KODEX 미국나스닥100"},
            {"itemcode": "069500", "itemname": "KODEX 200"},
        ]

    def test_tiger_returns_all_matching_korean_names(self) -> None:
        results = self.main._filter_kr_etfs(self.items, "tiger")
        self.assertEqual([item["ticker"] for item in results], ["133690", "486290"])
        self.assertTrue(all("나스닥" in item["name"] for item in results))

    def test_korean_brand_alias_matches_english_brand(self) -> None:
        results = self.main._filter_kr_etfs(self.items, "타이거")
        self.assertEqual(len(results), 2)

    def test_one_character_autocompletes_nasdaq(self) -> None:
        results = self.main._filter_kr_etfs(self.items, "나")
        self.assertEqual(len(results), 3)
        self.assertTrue(all("나스닥" in item["name"] for item in results))


if __name__ == "__main__":
    unittest.main()
