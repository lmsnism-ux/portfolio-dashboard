"""자산 조회는 공개하고 변경 작업만 인증하는 정책을 검증한다."""
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

    def test_api_key_does_not_block_portfolio_read(self) -> None:
        """운영 API 키가 있어도 자산 조회는 로그인 없이 허용한다."""
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        client = self._reload_app()
        res = client.get("/api/portfolio")
        self.assertNotEqual(res.status_code, 401)

    def test_legacy_read_auth_flag_is_ignored(self) -> None:
        """기존 Render 환경변수가 남아 있어도 조회를 다시 잠그지 않는다."""
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        os.environ["READ_REQUIRE_AUTH"] = "1"
        client = self._reload_app()
        res = client.get("/api/portfolio")
        self.assertNotEqual(res.status_code, 401)

    def test_session_replaces_stored_master_key(self) -> None:
        """마스터 키로 만료 세션을 발급받고 Bearer 인증을 사용할 수 있다."""
        os.environ["READ_REQUIRE_AUTH"] = "1"
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        client = self._reload_app()
        login = client.post("/api/auth/session", json={"api_key": "secret-xyz"})
        self.assertEqual(login.status_code, 200)
        token = login.json()["token"]
        res = client.delete("/api/trades/999999", headers={"Authorization": f"Bearer {token}"})
        self.assertNotEqual(res.status_code, 401)

    def test_session_rejects_wrong_master_key(self) -> None:
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        client = self._reload_app()
        res = client.post("/api/auth/session", json={"api_key": "wrong"})
        self.assertEqual(res.status_code, 401)

    def test_deleted_session_cannot_write(self) -> None:
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        client = self._reload_app()
        token = client.post("/api/auth/session", json={"api_key": "secret-xyz"}).json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        self.assertEqual(client.delete("/api/auth/session", headers=headers).status_code, 200)
        self.assertEqual(client.delete("/api/trades/999999", headers=headers).status_code, 401)

    def test_market_endpoints_remain_public(self) -> None:
        """공개 시장 데이터(/api/market/*)는 READ_REQUIRE_AUTH 영향 없음."""
        os.environ["READ_REQUIRE_AUTH"] = "1"
        os.environ["PORTFOLIO_API_KEY"] = "secret-xyz"
        client = self._reload_app()
        # 외부 네트워크 호출이 들어가니 503/500/200 어느 쪽이든 OK, 401만 아니면 됨.
        res = client.get("/api/health")
        self.assertEqual(res.status_code, 200)

    def test_export_requires_write_auth(self) -> None:
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
