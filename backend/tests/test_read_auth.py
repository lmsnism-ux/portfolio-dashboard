"""인증 제거 후 모든 엔드포인트가 공개로 동작하는지 검증한다."""
from __future__ import annotations

import importlib
import os
import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


class ReadAuthTest(unittest.TestCase):
    def setUp(self) -> None:
        for k in ("PORTFOLIO_API_KEY", "LAN_REQUIRE_AUTH", "READ_REQUIRE_AUTH"):
            os.environ.pop(k, None)

    def _reload_app(self):
        for mod in list(sys.modules):
            if mod in ("main", "portfolio_calculator", "history_store",
                       "history_backfill", "trade_store", "price_fetcher"):
                sys.modules.pop(mod, None)
        main = importlib.import_module("main")
        from fastapi.testclient import TestClient
        return TestClient(main.app)

    def test_health_is_public(self) -> None:
        client = self._reload_app()
        res = client.get("/api/health")
        self.assertEqual(res.status_code, 200)

    def test_portfolio_read_is_public(self) -> None:
        """API 키 환경변수가 있어도 자산 조회는 인증 없이 허용한다."""
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        client = self._reload_app()
        res = client.get("/api/portfolio")
        self.assertNotEqual(res.status_code, 401)

    def test_legacy_env_does_not_lock_portfolio(self) -> None:
        """기존 READ_REQUIRE_AUTH 환경변수가 남아 있어도 조회를 막지 않는다."""
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        os.environ["READ_REQUIRE_AUTH"] = "1"
        client = self._reload_app()
        res = client.get("/api/portfolio")
        self.assertNotEqual(res.status_code, 401)

    def test_export_csv_is_public(self) -> None:
        """인증 제거 후 CSV 내보내기는 401 없이 접근 가능하다."""
        client = self._reload_app()
        res = client.get("/api/export/csv")
        self.assertNotEqual(res.status_code, 401)

    def test_import_is_public(self) -> None:
        """인증 제거 후 포트폴리오 임포트는 401 없이 접근 가능하다."""
        client = self._reload_app()
        res = client.post("/api/portfolio/import", json={"accounts": []})
        self.assertNotEqual(res.status_code, 401)

    def test_market_endpoints_are_public(self) -> None:
        """시장 데이터 엔드포인트는 인증 없이 접근 가능하다."""
        os.environ["READ_REQUIRE_AUTH"] = "1"
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        client = self._reload_app()
        res = client.get("/api/health")
        self.assertEqual(res.status_code, 200)

    def test_portfolio_response_has_cache_control(self) -> None:
        client = self._reload_app()
        res = client.get("/api/portfolio")
        self.assertEqual(res.headers.get("cache-control"), "no-store, private")


if __name__ == "__main__":
    unittest.main()
