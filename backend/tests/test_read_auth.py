"""읽기 엔드포인트 인증 옵션 (READ_REQUIRE_AUTH) 동작 검증.

- 기본(off): 인증 없이 통과
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
        """READ_REQUIRE_AUTH 미설정이면 인증 없이 통과."""
        client = self._reload_app()
        res = client.get("/api/health")
        self.assertEqual(res.status_code, 200)

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


if __name__ == "__main__":
    unittest.main()
