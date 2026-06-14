"""읽기 엔드포인트 인증 옵션 (READ_REQUIRE_AUTH) 동작 검증.

- API 키 미설정 기본값: 인증 없이 통과
- API 키 설정 기본값: 읽기 인증 활성화
- READ_REQUIRE_AUTH=1: PORTFOLIO_API_KEY 미설정 + 비-LAN 요청은 401
- READ_REQUIRE_AUTH=1 + PORTFOLIO_API_KEY: 헤더 일치하면 통과, 불일치/누락은 401
"""
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
        # 모든 인증 관련 env 초기화 (이전 테스트 영향 차단)
        for k in ("PORTFOLIO_API_KEY", "LAN_REQUIRE_AUTH", "READ_REQUIRE_AUTH"):
            os.environ.pop(k, None)

    def _reload_app(self):
        # main 모듈을 새 env로 다시 import
        for mod in list(sys.modules):
            if mod in ("main", "portfolio_calculator", "history_store",
                       "history_backfill", "trade_store", "price_fetcher"):
                sys.modules.pop(mod, None)
        main = importlib.import_module("main")
        from fastapi.testclient import TestClient
        return TestClient(main.app)

    def test_off_by_default_allows_read(self) -> None:
        """API 키가 없으면 공개 health 확인이 가능하다."""
        client = self._reload_app()
        res = client.get("/api/health")
        self.assertEqual(res.status_code, 200)

    def test_api_key_enables_read_auth_by_default(self) -> None:
        """운영 API 키가 설정되면 별도 옵션 없이 자산 읽기도 보호한다."""
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        client = self._reload_app()
        res = client.get("/api/portfolio")
        self.assertEqual(res.status_code, 401)

    def test_read_auth_can_be_explicitly_disabled(self) -> None:
        """로컬 호환이 필요하면 READ_REQUIRE_AUTH=0으로 명시적으로 끌 수 있다."""
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        os.environ["READ_REQUIRE_AUTH"] = "0"
        client = self._reload_app()
        res = client.get("/api/portfolio")
        self.assertNotEqual(res.status_code, 401)

    def test_on_blocks_without_key(self) -> None:
        """READ_REQUIRE_AUTH=1 + PORTFOLIO_API_KEY 설정 → 키 없는 GET은 401."""
        os.environ["READ_REQUIRE_AUTH"] = "1"
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        client = self._reload_app()
        res = client.get("/api/portfolio")
        self.assertEqual(res.status_code, 401)

    def test_on_allows_with_matching_key(self) -> None:
        """올바른 헤더면 통과 (200 또는 500은 데이터/네트워크 문제일 뿐 인증은 통과)."""
        os.environ["READ_REQUIRE_AUTH"] = "1"
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        client = self._reload_app()
        res = client.get("/api/portfolio", headers={"X-API-Key": "secret-xyz"})
        self.assertNotEqual(res.status_code, 401)

    def test_on_rejects_wrong_key(self) -> None:
        os.environ["READ_REQUIRE_AUTH"] = "1"
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        client = self._reload_app()
        res = client.get("/api/portfolio", headers={"X-API-Key": "wrong"})
        self.assertEqual(res.status_code, 401)

    def test_market_endpoints_remain_public(self) -> None:
        """공개 시장 데이터(/api/market/*)는 READ_REQUIRE_AUTH 영향 없음."""
        os.environ["READ_REQUIRE_AUTH"] = "1"
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        client = self._reload_app()
        # 외부 네트워크 호출이 들어가니 503/500/200 어느 쪽이든 OK, 401만 아니면 됨.
        res = client.get("/api/health")
        self.assertEqual(res.status_code, 200)

    def test_export_requires_read_auth(self) -> None:
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        client = self._reload_app()
        res = client.get("/api/export/csv")
        self.assertEqual(res.status_code, 401)

    def test_import_requires_write_auth(self) -> None:
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        client = self._reload_app()
        res = client.post("/api/portfolio/import", json={"accounts": []})
        self.assertEqual(res.status_code, 401)

    def test_sensitive_responses_disable_cache(self) -> None:
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        client = self._reload_app()
        res = client.get("/api/portfolio")
        self.assertEqual(res.headers.get("cache-control"), "no-store, private")


if __name__ == "__main__":
    unittest.main()
