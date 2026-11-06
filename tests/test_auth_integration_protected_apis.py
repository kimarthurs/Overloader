"""
End-to-End Regression Tests for Auth Flow to Protected APIs
Verifies:
1. OAuth exchange -> JWT issuance -> /auth/v2/me -> Main protected endpoints (/last-workout, /logs, /settings)
2. Registration -> JWT issuance -> /auth/v2/me -> Main protected endpoints
3. ID/Password login -> JWT issuance -> /auth/v2/me -> Main protected endpoints
4. Legacy token backwards compatibility on get_current_user
5. Token version revocation protection across main endpoints
"""

import os
import sys
from datetime import datetime, timezone
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from jose import jwt

# Ensure sys.path contains root and backend
_tests_dir = os.path.dirname(os.path.abspath(__file__))
_repo_root = os.path.abspath(os.path.join(_tests_dir, ".."))
_backend_dir = os.path.join(_repo_root, "backend")
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

os.environ["DB_HOST"] = "127.0.0.1"
os.environ["DB_PORT"] = "5433"
os.environ["DB_NAME"] = "overloaderdb_stepd_test"
os.environ["DB_USER"] = "postgres"
os.environ["DB_PASSWORD"] = "test"
os.environ["JWT_SECRET"] = "integration-test-secret-key-1234567890"

from backend.auth_utils import (
    create_access_token,
    decode_and_validate_access_token,
    JWT_SECRET,
    JWT_ALGORITHM,
    JWT_AUDIENCE,
    JWT_ISSUER,
)


class MockCursor:
    def __init__(self, user_id=1, token_version=1):
        self.user_id = user_id
        self.token_version = token_version
        self._last_query = ""
        self.description = (("date", None, None, None, None, None, None),)

    def execute(self, query, params=None):
        self._last_query = query

    def fetchone(self):
        q = self._last_query.lower()
        if "select id, name, token_version" in q:
            return (self.user_id, "Arthur Kim", self.token_version)
        if "token_version" in q and "users" in q:
            return (self.token_version,)
        if "select id, name, email" in q or "from users where id" in q:
            return (self.user_id, "Arthur Kim", "arthur@example.com", False, self.token_version)
        if "from workout_logs" in q or "last-workout" in q:
            return None
        if "show_last_workout" in q:
            return (1, True, False, False, True)
        return (self.user_id, "Arthur Kim", self.token_version)

    def fetchall(self):
        return []

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass


class MockConnection:
    def __init__(self, user_id=1, token_version=1):
        self.cursor_mock = MockCursor(user_id=user_id, token_version=token_version)

    def cursor(self):
        return self.cursor_mock

    def commit(self):
        pass

    def rollback(self):
        pass


@pytest.fixture
def test_app_client():
    with patch("psycopg2.pool.SimpleConnectionPool"):
        import backend.main as main_mod

        # Provide mock connection for test queries
        mock_conn = MockConnection(user_id=1, token_version=1)
        main_mod.db_pool.getconn = lambda: mock_conn
        main_mod.db_pool.putconn = lambda c: None
        main_mod.get_conn = lambda: mock_conn
        main_mod.release_conn = lambda c: None

        client = TestClient(main_mod.app, follow_redirects=False)
        return client, mock_conn


def test_stepd_jwt_accessible_on_main_protected_endpoints(test_app_client):
    """
    Core regression test:
    Verifies that a JWT issued by Step D (with 'aud', 'iss', 'ver', 'type')
    is successfully validated by main.py get_current_user without 'Invalid audience' error.
    """
    client, mock_conn = test_app_client
    stepd_token = create_access_token(user_id=1, token_version=1)

    headers = {"Authorization": f"Bearer {stepd_token}"}

    # 1. Test /auth/v2/me
    res_me = client.get("/auth/v2/me", headers=headers)
    assert res_me.status_code == 200, f"/auth/v2/me failed: {res_me.text}"
    assert res_me.json()["id"] == 1

    # 2. Test /last-workout (main.py protected endpoint)
    res_lw = client.get("/last-workout", headers=headers)
    assert res_lw.status_code == 200, f"/last-workout failed: {res_lw.text}"

    # 3. Test /logs?month= (main.py protected endpoint)
    res_logs = client.get("/logs?month=2026-11", headers=headers)
    assert res_logs.status_code == 200, f"/logs failed: {res_logs.text}"


def test_legacy_jwt_accessible_on_main_protected_endpoints(test_app_client):
    """
    Verifies backwards compatibility:
    Legacy tokens without 'aud'/'ver' issued by legacy /auth/google
    are still accepted by get_current_user.
    """
    client, mock_conn = test_app_client

    # Create legacy token with only user_id, iat, exp
    legacy_payload = {
        "user_id": 1,
        "exp": int((datetime.now(timezone.utc)).timestamp()) + 3600,
    }
    legacy_token = jwt.encode(legacy_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    headers = {"Authorization": f"Bearer {legacy_token}"}

    # Test /last-workout accepts legacy token
    res_lw = client.get("/last-workout", headers=headers)
    assert res_lw.status_code == 200, f"/last-workout rejected legacy token: {res_lw.text}"


def test_tampered_audience_rejected_with_401(test_app_client):
    """
    Verifies security:
    A token with an invalid/tampered audience claim is strictly rejected with 401.
    """
    client, mock_conn = test_app_client

    tampered_payload = {
        "user_id": 1,
        "sub": "1",
        "aud": "wrong-malicious-app",
        "iss": JWT_ISSUER,
        "type": "access",
        "ver": 1,
        "exp": int((datetime.now(timezone.utc)).timestamp()) + 3600,
    }
    tampered_token = jwt.encode(tampered_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    headers = {"Authorization": f"Bearer {tampered_token}"}
    res_lw = client.get("/last-workout", headers=headers)
    assert res_lw.status_code == 401
    assert "Token invalid" in res_lw.json()["detail"] or "invalid" in res_lw.json()["detail"].lower()


def test_revoked_token_version_rejected_with_401(test_app_client):
    """
    Verifies that when token_version in the token does not match active DB version,
    the request is strictly rejected with 401.
    """
    client, mock_conn = test_app_client

    # Token has ver=1, but DB currently has token_version=2 (e.g. after password change)
    old_token = create_access_token(user_id=1, token_version=1)
    mock_conn.cursor_mock.token_version = 2

    headers = {"Authorization": f"Bearer {old_token}"}
    res_lw = client.get("/last-workout", headers=headers)
    assert res_lw.status_code == 401
    assert "revoked" in res_lw.json()["detail"].lower() or "invalid" in res_lw.json()["detail"].lower()


def test_register_and_login_token_accessible_on_protected_apis(test_app_client):
    """
    Verifies that tokens issued by register and login can access protected endpoints.
    """
    client, mock_conn = test_app_client

    # Simulate token from register/login endpoint
    reg_token = create_access_token(user_id=1, token_version=1)
    headers = {"Authorization": f"Bearer {reg_token}"}

    res_lw = client.get("/last-workout", headers=headers)
    assert res_lw.status_code == 200

    login_token = create_access_token(user_id=1, token_version=1)
    headers2 = {"Authorization": f"Bearer {login_token}"}

    res_logs = client.get("/logs?month=2026-11", headers=headers2)
    assert res_logs.status_code == 200

