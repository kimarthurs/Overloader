"""
Unit Tests for Step D Authentication Router (Isolated Blueprint)
Tests:
- /auth/v2/register: successful registration, validation errors, 409 conflict
- /auth/v2/login: successful login, wrong password, dummy hash timing defense for unknown user
- /auth/v2/me: authenticated user retrieval, version mismatch rejection, DB error 503 mapping
- /auth/v2/reauth/password: valid reauth ticket issuance, wrong password rejection
"""

import pytest
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from psycopg2 import IntegrityError, OperationalError

from backend.auth_router import create_auth_router
from backend.auth_utils import (
    hash_password,
    create_access_token,
    create_reauth_ticket,
    JWT_SECRET,
    JWT_ALGORITHM,
    REAUTH_PURPOSE_PASSWORD_ADD,
    REAUTH_PURPOSE_PASSWORD_CHANGE,
    REAUTH_PURPOSE_PASSWORD_UNLINK,
    REAUTH_PURPOSE_SOCIAL_UNLINK,
)


class FakeCursor:
    def __init__(self, fetchone_val=None, fetchall_val=None):
        self.fetchone_val = fetchone_val
        self.fetchall_val = fetchall_val or []
        self.executed_queries = []
        self.fetchone_sequence = None

    def execute(self, query, params=None):
        self.executed_queries.append((query, params))

    def fetchone(self):
        if self.fetchone_sequence is not None and len(self.fetchone_sequence) > 0:
            return self.fetchone_sequence.pop(0)
        return self.fetchone_val

    def fetchall(self):
        return self.fetchall_val

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass


class FakeConnection:
    def __init__(self, cursor_obj=None, raise_on_connect=False):
        self.cursor_obj = cursor_obj or FakeCursor()
        self.raise_on_connect = raise_on_connect
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def cursor(self):
        if self.raise_on_connect:
            raise OperationalError("Connection refused")
        return self.cursor_obj

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


# ── Test Cases ──────────────────────────────────────────────────────────────────

class TestAuthRouterUnit:
    def test_register_success(self):
        cursor = FakeCursor()
        # First fetchone is check username (None -> not taken), second is RETURNING id (101,)
        cursor.fetchone_sequence = [None, (101,)]
        fake_conn = FakeConnection(cursor)
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        res = client.post("/auth/v2/register", json={
            "username": "new_athlete",
            "password": "SecurePassword123!",
            "name": "New Athlete"
        })

        assert res.status_code == 201
        data = res.json()
        assert "token" in data
        assert data["user"]["id"] == 101
        assert data["user"]["username"] == "new_athlete"
        assert fake_conn.committed is True
        assert fake_conn.closed is True  # connection released immediately

    def test_register_with_optional_email_success(self):
        cursor = FakeCursor()
        cursor.fetchone_sequence = [None, (102,)]
        fake_conn = FakeConnection(cursor)
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        res = client.post("/auth/v2/register", json={
            "username": "email_athlete",
            "password": "SecurePassword123!",
            "name": "Email Athlete",
            "email": "athlete@example.com"
        })

        assert res.status_code == 201
        data = res.json()
        assert data["user"]["id"] == 102
        assert fake_conn.committed is True
        # Verify executed query for users insert included the email parameter
        insert_user_query = [q for q in cursor.executed_queries if "INSERT INTO users" in q[0]]
        assert len(insert_user_query) == 1
        assert insert_user_query[0][1] == ("Email Athlete", "athlete@example.com")

    def test_register_with_invalid_email_format(self):
        fake_conn = FakeConnection()
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        res = client.post("/auth/v2/register", json={
            "username": "email_athlete",
            "password": "SecurePassword123!",
            "name": "Email Athlete",
            "email": "not-an-email"
        })

        assert res.status_code == 400
        assert "올바른 이메일 형식이 아닙니다" in res.json()["detail"]

    def test_register_validation_error(self):
        fake_conn = FakeConnection()
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        # Invalid username with '@'
        res = client.post("/auth/v2/register", json={
            "username": "bad@name",
            "password": "SecurePassword123!",
            "name": "Athlete"
        })
        assert res.status_code == 400
        assert "cannot contain '@'" in res.json()["detail"]

        # Weak password (missing special char)
        res_pwd = client.post("/auth/v2/register", json={
            "username": "valid_user",
            "password": "Password1234",
            "name": "Athlete"
        })
        assert res_pwd.status_code == 400
        assert "비밀번호 조건 미충족" in res_pwd.json()["detail"]

    def test_register_duplicate_username_conflict(self):
        # First query checks username existence -> returns row (already exists)
        fake_conn = FakeConnection(FakeCursor(fetchone_val=(1,)))
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        res = client.post("/auth/v2/register", json={
            "username": "existing_user",
            "password": "SecurePassword123!",
            "name": "Existing Athlete"
        })
        assert res.status_code == 409
        assert "이미 사용 중인 아이디입니다" in res.json()["detail"]

    def test_login_success(self):
        valid_pwd = "MySecret123!#"
        hashed = hash_password(valid_pwd)
        # SELECT p.user_id, p.password_hash, u.name, u.token_version
        fake_conn = FakeConnection(FakeCursor(fetchone_val=(50, hashed, "Arthur", 1)))
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        res = client.post("/auth/v2/login", json={
            "username": "arthur_k",
            "password": valid_pwd
        })
        assert res.status_code == 200
        data = res.json()
        assert "token" in data
        assert data["user"]["id"] == 50
        assert fake_conn.closed is True

    def test_login_unknown_user_triggers_dummy_verification_and_generic_401(self):
        fake_conn = FakeConnection(FakeCursor(fetchone_val=None))
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        with patch("backend.auth_router.verify_dummy_password_async") as mock_dummy:
            res = client.post("/auth/v2/login", json={
                "username": "non_existent_user",
                "password": "Password123!"
            })
            assert res.status_code == 401
            assert res.json()["detail"] == "아이디 또는 비밀번호가 올바르지 않습니다."
            assert mock_dummy.called is True

    def test_login_wrong_password_generic_401(self):
        correct_pwd = "CorrectPassword123!"
        hashed = hash_password(correct_pwd)
        fake_conn = FakeConnection(FakeCursor(fetchone_val=(50, hashed, "Arthur", 1)))
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        res = client.post("/auth/v2/login", json={
            "username": "arthur_k",
            "password": "WrongPassword123!"
        })
        assert res.status_code == 401
        assert res.json()["detail"] == "아이디 또는 비밀번호가 올바르지 않습니다."

    def test_get_me_success_and_immediate_connection_release(self):
        user_id = 77
        token = create_access_token(user_id=user_id, token_version=1, session_id="sess_123")
        # First query: SELECT id, name, token_version FROM users
        # Second query: SELECT username FROM password_credentials
        class DualQueryCursor(FakeCursor):
            def __init__(self):
                super().__init__()
                self.calls = 0
            def fetchone(self):
                self.calls += 1
                if self.calls == 1:
                    return (77, "Arthur Kim", 1)
                return ("arthur_kim",)

        fake_conn = FakeConnection(DualQueryCursor())
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        res = client.get("/auth/v2/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == 77
        assert data["name"] == "Arthur Kim"
        assert data["username"] == "arthur_kim"
        assert fake_conn.closed is True

    def test_get_me_token_version_revoked_401(self):
        user_id = 77
        # Token has version 1
        token = create_access_token(user_id=user_id, token_version=1)
        # But DB returns active version 2
        fake_conn = FakeConnection(FakeCursor(fetchone_val=(77, "Arthur Kim", 2)))
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        res = client.get("/auth/v2/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 401
        assert "세션이 만료되었습니다" in res.json()["detail"]

    def test_get_me_db_outage_returns_503(self):
        user_id = 77
        token = create_access_token(user_id=user_id, token_version=1)
        # Simulate DB connection failure
        fake_conn = FakeConnection(raise_on_connect=True)
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        res = client.get("/auth/v2/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 503
        assert "Database service temporarily unavailable" in res.json()["detail"]

    def test_reauth_password_success(self):
        user_id = 77
        token = create_access_token(user_id=user_id, token_version=1, session_id="sess_abc")
        current_pwd = "MyCurrentSecret123!"
        hashed = hash_password(current_pwd)

        class ReauthCursor(FakeCursor):
            def __init__(self):
                super().__init__()
                self.calls = 0
            def fetchone(self):
                self.calls += 1
                if self.calls == 1:
                    return (77, "Arthur Kim", 1)  # get_current_user
                return (hashed,)  # password_credentials query

        fake_conn = FakeConnection(ReauthCursor())
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        res = client.post(
            "/auth/v2/reauth/password",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "password": current_pwd,
                "purpose": REAUTH_PURPOSE_PASSWORD_CHANGE,
            }
        )
        assert res.status_code == 200
        data = res.json()
        assert "reauth_ticket" in data
        assert data["expires_in"] == 300
        assert fake_conn.committed is True

    def test_get_account_methods_multiple(self):
        user_id = 77
        token = create_access_token(user_id=user_id, token_version=1, session_id="sess_abc")

        class MethodsCursor(FakeCursor):
            def __init__(self):
                super().__init__()
                self.calls = 0
            def fetchone(self):
                self.calls += 1
                if self.calls == 1:
                    return (77, "Arthur Kim", 1)  # get_current_user
                return ("arthur_kim",)  # password_credentials
            def fetchall(self):
                # social_accounts: 1 google account
                from datetime import datetime
                return [("google", "arthur@example.com", datetime(2026, 11, 1))]

        fake_conn = FakeConnection(MethodsCursor())
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        res = client.get("/auth/v2/account/methods", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert data["has_password"] is True
        assert data["username"] == "arthur_kim"
        assert len(data["social_accounts"]) == 1
        assert data["total_methods"] == 2
        assert data["can_unlink_password"] is True
        assert data["can_unlink_social"] is True

    def test_change_password_success_bumps_token_version(self):
        user_id = 77
        session_id = "sess_abc"
        token = create_access_token(user_id=user_id, token_version=1, session_id=session_id)
        ticket, jti = create_reauth_ticket(
            user_id=user_id,
            purpose=REAUTH_PURPOSE_PASSWORD_CHANGE,
            session_id=session_id,
            token_version=1,
        )

        class PwdChangeCursor(FakeCursor):
            def __init__(self):
                super().__init__()
                self.calls = 0
            def fetchone(self):
                self.calls += 1
                if self.calls == 1:
                    return (77, "Arthur Kim", 1)  # get_current_user
                elif self.calls == 2:
                    return (1,)  # SELECT 1 FROM users FOR UPDATE
                elif self.calls == 3:
                    return (1,)  # SELECT 1 FROM password_credentials
                elif self.calls == 4:
                    # consume_reauth_ticket_record SELECT FOR UPDATE
                    return (1, user_id, session_id, REAUTH_PURPOSE_PASSWORD_CHANGE, None, 1, None, datetime(2030, 1, 1))
                elif self.calls == 5:
                    return (2,)  # UPDATE users ... RETURNING token_version
                return (1,)

        from datetime import datetime
        fake_conn = FakeConnection(PwdChangeCursor())
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        res = client.post(
            "/auth/v2/account/password/change",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "new_password": "BrandNewPassword123!",
                "reauth_ticket": ticket,
            }
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["new_token_version"] == 2
        assert "token" in data
        assert fake_conn.committed is True

    def test_unlink_social_last_method_protection_blocked(self):
        user_id = 77
        session_id = "sess_abc"
        token = create_access_token(user_id=user_id, token_version=1, session_id=session_id)
        ticket, _ = create_reauth_ticket(
            user_id=user_id,
            purpose=REAUTH_PURPOSE_SOCIAL_UNLINK,
            session_id=session_id,
            token_version=1,
            target_provider="google",
        )

        class LastMethodCursor(FakeCursor):
            def __init__(self):
                super().__init__()
                self.calls = 0
            def fetchone(self):
                self.calls += 1
                if self.calls == 1:
                    return (77, "Arthur Kim", 1)  # get_current_user
                elif self.calls == 2:
                    return (1,)  # lock user
                elif self.calls == 3:
                    return (1,)  # social_accounts exists
                elif self.calls == 4:
                    return (1,)  # social_count = 1
                elif self.calls == 5:
                    return (0,)  # pwd_count = 0 (total = 1 -> LAST METHOD!)
                return (1,)

        fake_conn = FakeConnection(LastMethodCursor())
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        res = client.post(
            "/auth/v2/account/social/unlink",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "provider": "google",
                "reauth_ticket": ticket,
            }
        )
        assert res.status_code == 400
        assert "마지막 남은 로그인 수단은 연동을 해제할 수 없습니다" in res.json()["detail"]

    def test_unlink_password_last_method_protection_blocked(self):
        user_id = 77
        session_id = "sess_abc"
        token = create_access_token(user_id=user_id, token_version=1, session_id=session_id)
        ticket, _ = create_reauth_ticket(
            user_id=user_id,
            purpose=REAUTH_PURPOSE_PASSWORD_UNLINK,
            session_id=session_id,
            token_version=1,
        )

        class NoSocialCursor(FakeCursor):
            def __init__(self):
                super().__init__()
                self.calls = 0
            def fetchone(self):
                self.calls += 1
                if self.calls == 1:
                    return (77, "Arthur Kim", 1)  # get_current_user
                elif self.calls == 2:
                    return (1,)  # lock user
                elif self.calls == 3:
                    return (1,)  # password exists
                elif self.calls == 4:
                    return (0,)  # social_count = 0 (LAST METHOD!)
                return (1,)

        fake_conn = FakeConnection(NoSocialCursor())
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        res = client.post(
            "/auth/v2/account/password/unlink",
            headers={"Authorization": f"Bearer {token}"},
            json={"reauth_ticket": ticket}
        )
        assert res.status_code == 400
        assert "마지막 남은 로그인 수단은 해제할 수 없습니다" in res.json()["detail"]

    def test_oauth_authorize_mock_blocked_without_env(self):
        fake_conn = FakeConnection()
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        with patch.dict("os.environ", {"USE_MOCK_OAUTH": "false", "ENV": "production"}, clear=False):
            res = client.get("/auth/v2/oauth/naver/authorize?mock=true", follow_redirects=False)
            assert res.status_code == 403
            assert "모의" in res.json()["detail"]

    def test_oauth_authorize_mock_redirect_when_enabled(self):
        fake_conn = FakeConnection()
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        with patch.dict("os.environ", {"USE_MOCK_OAUTH": "true", "ENV": "development"}, clear=False):
            res = client.get("/auth/v2/oauth/naver/authorize?mock=true", follow_redirects=False)
            assert res.status_code in (302, 307)
            assert "/mock-consent" in res.headers["location"]

    def test_naver_authorize_real_redirect_uri(self):
        fake_conn = FakeConnection()
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        with patch.dict("os.environ", {
            "USE_MOCK_OAUTH": "false",
            "ENV": "development",
            "NAVER_CLIENT_ID": "mock_client_id_123",
            "NAVER_CALLBACK_URL": "http://127.0.0.1:8000/auth/v2/oauth/naver/callback"
        }, clear=False):
            res = client.get("/auth/v2/oauth/naver/authorize", follow_redirects=False)
            assert res.status_code in (302, 307)
            loc = res.headers["location"]
            assert loc.startswith("https://nid.naver.com/oauth2.0/authorize?")
            assert "client_id=mock_client_id_123" in loc
            assert "redirect_uri=http%3A%2F%2F127.0.0.1%3A8000%2Fauth%2Fv2%2Foauth%2Fnaver%2Fcallback" in loc
            assert "response_type=code" in loc

    def test_naver_callback_real_exchange_success_without_email(self):
        from unittest.mock import AsyncMock
        from datetime import datetime, timedelta, timezone

        class NaverCallbackCursor(FakeCursor):
            def __init__(self):
                super().__init__()
                self.calls = 0

            def fetchone(self):
                self.calls += 1
                if self.calls == 1:
                    exp = datetime.now(timezone.utc) + timedelta(minutes=5)
                    return (1, None, "sess_naver", "login", "naver", None, exp)
                elif self.calls == 2:
                    return None  # First time user
                elif self.calls == 3:
                    return (555,)
                return None

        fake_conn = FakeConnection(NaverCallbackCursor())
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        mock_token_resp = MagicMock()
        mock_token_resp.status_code = 200
        mock_token_resp.json.return_value = {"access_token": "valid_naver_access_token"}

        mock_profile_resp = MagicMock()
        mock_profile_resp.status_code = 200
        mock_profile_resp.json.return_value = {
            "resultcode": "00",
            "message": "success",
            "response": {
                "id": "naver_uid_999",
                "nickname": "네이버러너",
                "email": None
            }
        }

        with patch.dict("os.environ", {
            "USE_MOCK_OAUTH": "false",
            "ENV": "development",
            "NAVER_CLIENT_ID": "mock_id",
            "NAVER_CLIENT_SECRET": "mock_secret",
        }, clear=False):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_token_resp):
                with patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_profile_resp):
                    res = client.get(
                        "/auth/v2/oauth/naver/callback?state=dummy_state_val&code=auth_code_xyz",
                        follow_redirects=False
                    )
                    assert res.status_code in (302, 307)
                    loc = res.headers["location"]
                    assert "http://127.0.0.1:3000?exchange_code=" in loc
                    assert "&session_id=sess_naver" in loc

    def test_naver_callback_mock_blocked_when_mock_disabled(self):
        fake_conn = FakeConnection()
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        with patch.dict("os.environ", {"USE_MOCK_OAUTH": "false", "ENV": "production"}, clear=False):
            res = client.get(
                "/auth/v2/oauth/naver/callback?state=dummy_state_val&mock_code=abc&mock_uid=hacker",
                follow_redirects=False
            )
            assert res.status_code == 403

    def test_oauth_exchange_code_success(self):
        class ExchangeCursor(FakeCursor):
            def __init__(self):
                super().__init__()
                self.calls = 0

            def fetchone(self):
                self.calls += 1
                if self.calls == 1:
                    # SELECT id, user_id, session_id, consumed_at, expires_at FROM auth_single_use_tokens
                    from datetime import datetime, timedelta, timezone
                    exp = datetime.now(timezone.utc) + timedelta(minutes=5)
                    return (1, 88, "sess_test", None, exp)
                elif self.calls == 2:
                    # SELECT id, name, token_version FROM users
                    return (88, "Exchange User", 1)
                return None

        fake_conn = FakeConnection(ExchangeCursor())
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        res = client.post("/auth/v2/oauth/exchange", json={
            "exchange_code": "secret_code_123",
            "session_id": "sess_test"
        })
        assert res.status_code == 200
        data = res.json()
        assert "token" in data
        assert data["user_id"] == 88
        assert data["name"] == "Exchange User"

    def test_password_reset_success(self):
        ticket, jti = create_reauth_ticket(
            user_id=99,
            purpose="password_reset",
            session_id="sess_rst",
            token_version=1
        )

        class ResetCursor(FakeCursor):
            def __init__(self):
                super().__init__()
                self.calls = 0

            def fetchone(self):
                self.calls += 1
                if self.calls == 1:
                    return (1,)  # lock user
                elif self.calls == 2:
                    return ("existing_uname",)  # check existing password
                elif self.calls == 3:
                    # SELECT id, user_id, session_id, purpose, target_provider, token_version, consumed_at, expires_at
                    from datetime import datetime, timedelta, timezone
                    exp = datetime.now(timezone.utc) + timedelta(minutes=5)
                    return (1, 99, "sess_rst", "password_reset", None, 1, None, exp)
                elif self.calls == 4:
                    return (2,)  # UPDATE users SET token_version = token_version + 1 RETURNING token_version
                return (1,)

        fake_conn = FakeConnection(ResetCursor())
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        res = client.post("/auth/v2/account/password/reset", json={
            "reauth_ticket": ticket,
            "new_password": "NewSecurePass!2026",
            "session_id": "sess_rst"
        })
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["new_token_version"] == 2
        assert "token" in data


class TestGoogleOAuthFlows:
    def test_google_authorize_url_generation(self):
        fake_conn = FakeConnection()
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        with patch.dict("os.environ", {
            "USE_MOCK_OAUTH": "false",
            "ENV": "development",
            "GOOGLE_CLIENT_ID": "mock_google_id_xyz",
            "GOOGLE_CALLBACK_URL": "http://127.0.0.1:8000/auth/v2/oauth/google/callback"
        }, clear=False):
            res = client.get("/auth/v2/oauth/google/authorize", follow_redirects=False)
            assert res.status_code in (302, 307)
            loc = res.headers["location"]
            assert loc.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
            assert "client_id=mock_google_id_xyz" in loc
            assert "redirect_uri=http%3A%2F%2F127.0.0.1%3A8000%2Fauth%2Fv2%2Foauth%2Fgoogle%2Fcallback" in loc
            assert "response_type=code" in loc
            assert "scope=openid+email+profile" in loc
            assert "prompt=select_account" in loc
            assert "state=" in loc
            assert "nonce=" in loc
            assert "access_type=offline" not in loc

    def test_google_callback_existing_user_mapping_retention(self):
        from unittest.mock import AsyncMock
        from datetime import datetime, timedelta, timezone

        class GoogleExistingUserCursor(FakeCursor):
            def __init__(self):
                super().__init__()
                self.calls = 0

            def fetchone(self):
                self.calls += 1
                if self.calls == 1:
                    # state lookup
                    exp = datetime.now(timezone.utc) + timedelta(minutes=5)
                    return (1, None, "sess_goog_exist", "login", "google", None, exp)
                elif self.calls == 2:
                    # SELECT user_id FROM social_accounts WHERE provider = 'google' AND provider_user_id = %s
                    return (101,)  # Existing user with user_id 101
                return None

        fake_conn = FakeConnection(GoogleExistingUserCursor())
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        mock_token_resp = MagicMock()
        mock_token_resp.status_code = 200
        mock_token_resp.json.return_value = {
            "id_token": "valid_mock_id_token",
            "access_token": "valid_mock_access_token"
        }

        mock_idinfo = {
            "sub": "google_sub_101",
            "email": "user101@example.com",
            "name": "Arthur",
            "iss": "https://accounts.google.com"
        }

        mock_userinfo_resp = MagicMock()
        mock_userinfo_resp.status_code = 200
        mock_userinfo_resp.json.return_value = {
            "sub": "google_sub_101",
            "email": "user101@example.com"
        }

        with patch.dict("os.environ", {
            "USE_MOCK_OAUTH": "false",
            "ENV": "development",
            "GOOGLE_CLIENT_ID": "mock_google_id",
            "GOOGLE_CLIENT_SECRET": "mock_google_secret",
        }, clear=False):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_token_resp):
                with patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_userinfo_resp):
                    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_idinfo):
                        res = client.get(
                            "/auth/v2/oauth/google/callback?state=dummy_state&code=goog_code_123",
                            follow_redirects=False
                        )
                        assert res.status_code in (302, 307)
                        loc = res.headers["location"]
                        assert "http://127.0.0.1:3000?exchange_code=" in loc
                        assert "&session_id=sess_goog_exist" in loc

                        # Verify existing user mapping: no new INSERT INTO users
                        executed_sql = [q[0] for q in fake_conn.cursor_obj.executed_queries]
                        assert not any("INSERT INTO users" in sql for sql in executed_sql)

    def test_google_callback_new_user_distinct_from_same_email(self):
        from unittest.mock import AsyncMock
        from datetime import datetime, timedelta, timezone

        class GoogleNewUserCursor(FakeCursor):
            def __init__(self):
                super().__init__()
                self.calls = 0

            def fetchone(self):
                self.calls += 1
                if self.calls == 1:
                    exp = datetime.now(timezone.utc) + timedelta(minutes=5)
                    return (1, None, "sess_goog_new", "login", "google", None, exp)
                elif self.calls == 2:
                    # SELECT user_id FROM social_accounts WHERE provider = 'google' AND provider_user_id = %s
                    return None  # No matching Google account
                elif self.calls == 3:
                    # INSERT INTO users (name, token_version) VALUES (%s, 1) RETURNING id
                    return (202,)  # Newly generated user_id
                return None

        fake_conn = FakeConnection(GoogleNewUserCursor())
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        mock_token_resp = MagicMock()
        mock_token_resp.status_code = 200
        mock_token_resp.json.return_value = {
            "id_token": "valid_mock_id_token",
            "access_token": "valid_mock_access_token"
        }

        mock_idinfo = {
            "sub": "google_sub_202",
            "email": "shared_email@example.com",
            "name": "New Google User",
            "iss": "https://accounts.google.com"
        }

        mock_userinfo_resp = MagicMock()
        mock_userinfo_resp.status_code = 200
        mock_userinfo_resp.json.return_value = {
            "sub": "google_sub_202",
            "email": "shared_email@example.com"
        }

        with patch.dict("os.environ", {
            "USE_MOCK_OAUTH": "false",
            "ENV": "development",
            "GOOGLE_CLIENT_ID": "mock_google_id",
            "GOOGLE_CLIENT_SECRET": "mock_google_secret",
        }, clear=False):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_token_resp):
                with patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_userinfo_resp):
                    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_idinfo):
                        res = client.get(
                            "/auth/v2/oauth/google/callback?state=dummy_state&code=goog_code_456",
                            follow_redirects=False
                        )
                        assert res.status_code in (302, 307)
                        loc = res.headers["location"]
                        assert "http://127.0.0.1:3000?exchange_code=" in loc

                        # Verify separate user was created via INSERT INTO users and INSERT INTO social_accounts
                        executed = fake_conn.cursor_obj.executed_queries
                        user_inserts = [p for q, p in executed if "INSERT INTO users" in q]
                        soc_inserts = [p for q, p in executed if "INSERT INTO social_accounts" in q]
                        assert len(user_inserts) == 1
                        assert len(soc_inserts) == 1
                        assert soc_inserts[0] == (202, "google", "google_sub_202", "shared_email@example.com")

    def test_google_callback_state_rejection_scenarios(self):
        fake_conn = FakeConnection()
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        with patch.dict("os.environ", {"USE_MOCK_OAUTH": "false", "ENV": "development"}, clear=False):
            # 1. Missing state
            res = client.get("/auth/v2/oauth/google/callback?code=abc", follow_redirects=False)
            assert res.status_code == 422

            # 2. State not found in DB
            fake_conn.cursor_obj.fetchone_val = None
            res = client.get("/auth/v2/oauth/google/callback?state=unknown_state&code=abc", follow_redirects=False)
            assert res.status_code in (302, 307)
            assert "error=state_not_found" in res.headers["location"]

            # 3. State already consumed
            from datetime import datetime, timedelta, timezone
            exp = datetime.now(timezone.utc) + timedelta(minutes=5)
            consumed = datetime.now(timezone.utc)
            fake_conn.cursor_obj.fetchone_val = (1, None, "sess_x", "login", "google", consumed, exp)
            res = client.get("/auth/v2/oauth/google/callback?state=consumed_state&code=abc", follow_redirects=False)
            assert res.status_code in (302, 307)
            assert "error=state_already_consumed" in res.headers["location"]

            # 4. State expired
            past = datetime.now(timezone.utc) - timedelta(minutes=1)
            fake_conn.cursor_obj.fetchone_val = (1, None, "sess_x", "login", "google", None, past)
            res = client.get("/auth/v2/oauth/google/callback?state=expired_state&code=abc", follow_redirects=False)
            assert res.status_code in (302, 307)
            assert "error=state_expired" in res.headers["location"]

            # 5. Provider mismatch (Naver state passed to Google callback)
            fake_conn.cursor_obj.fetchone_val = (1, None, "sess_x", "login", "naver", None, exp)
            res = client.get("/auth/v2/oauth/google/callback?state=cross_provider_state&code=abc", follow_redirects=False)
            assert res.status_code in (302, 307)
            assert "error=provider_mismatch" in res.headers["location"]

    def test_google_callback_invalid_id_token_rejection(self):
        from unittest.mock import AsyncMock
        from datetime import datetime, timedelta, timezone

        class IdTokenFailCursor(FakeCursor):
            def fetchone(self):
                exp = datetime.now(timezone.utc) + timedelta(minutes=5)
                return (1, None, "sess_goog_err", "login", "google", None, exp)

        fake_conn = FakeConnection(IdTokenFailCursor())
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        mock_token_resp = MagicMock()
        mock_token_resp.status_code = 200
        mock_token_resp.json.return_value = {
            "id_token": "tampered_id_token",
            "access_token": "token"
        }

        with patch.dict("os.environ", {
            "USE_MOCK_OAUTH": "false",
            "ENV": "development",
            "GOOGLE_CLIENT_ID": "mock_google_id",
            "GOOGLE_CLIENT_SECRET": "mock_google_secret",
        }, clear=False):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_token_resp):
                # 1. Invalid signature
                with patch("google.oauth2.id_token.verify_oauth2_token", side_effect=Exception("Invalid signature")):
                    res = client.get("/auth/v2/oauth/google/callback?state=dummy_state&code=abc", follow_redirects=False)
                    assert res.status_code in (302, 307)
                    assert "error=invalid_id_token" in res.headers["location"]

                # 2. Invalid issuer
                with patch("google.oauth2.id_token.verify_oauth2_token", return_value={"sub": "123", "iss": "https://attacker.com"}):
                    res = client.get("/auth/v2/oauth/google/callback?state=dummy_state&code=abc", follow_redirects=False)
                    assert res.status_code in (302, 307)
                    assert "error=invalid_id_token_issuer" in res.headers["location"]

    def test_google_callback_userinfo_sub_mismatch_rejection(self):
        from unittest.mock import AsyncMock
        from datetime import datetime, timedelta, timezone

        class SubMismatchCursor(FakeCursor):
            def fetchone(self):
                exp = datetime.now(timezone.utc) + timedelta(minutes=5)
                return (1, None, "sess_mismatch", "login", "google", None, exp)

        fake_conn = FakeConnection(SubMismatchCursor())
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        mock_token_resp = MagicMock()
        mock_token_resp.status_code = 200
        mock_token_resp.json.return_value = {
            "id_token": "id_token_sub_A",
            "access_token": "acc_token"
        }

        mock_userinfo_resp = MagicMock()
        mock_userinfo_resp.status_code = 200
        mock_userinfo_resp.json.return_value = {
            "sub": "sub_DIFFERENT_B",
            "email": "attacker@example.com"
        }

        with patch.dict("os.environ", {
            "USE_MOCK_OAUTH": "false",
            "ENV": "development",
            "GOOGLE_CLIENT_ID": "mock_google_id",
            "GOOGLE_CLIENT_SECRET": "mock_google_secret",
        }, clear=False):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_token_resp):
                with patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_userinfo_resp):
                    with patch("google.oauth2.id_token.verify_oauth2_token", return_value={"sub": "sub_A", "iss": "accounts.google.com"}):
                        res = client.get("/auth/v2/oauth/google/callback?state=dummy_state&code=abc", follow_redirects=False)
                        assert res.status_code in (302, 307)
                        assert "error=sub_mismatch" in res.headers["location"]

    def test_google_callback_consent_denial_and_external_errors(self):
        import httpx
        from unittest.mock import AsyncMock
        fake_conn = FakeConnection()
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        with patch.dict("os.environ", {
            "USE_MOCK_OAUTH": "false",
            "ENV": "development",
            "GOOGLE_CLIENT_ID": "mock_google_id",
            "GOOGLE_CLIENT_SECRET": "mock_google_secret",
        }, clear=False):
            # 1. User denied consent
            res = client.get("/auth/v2/oauth/google/callback?state=dummy_state&error=access_denied", follow_redirects=False)
            assert res.status_code in (302, 307)
            assert "error=access_denied" in res.headers["location"]
            # No state lookup or updates made
            assert len(fake_conn.cursor_obj.executed_queries) == 0

            # 2. Token request failed (HTTP 400 from Google)
            from datetime import datetime, timedelta, timezone
            exp = datetime.now(timezone.utc) + timedelta(minutes=5)
            fake_conn.cursor_obj.fetchone_val = (1, None, "sess_x", "login", "google", None, exp)
            mock_fail = MagicMock()
            mock_fail.status_code = 400

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_fail):
                res = client.get("/auth/v2/oauth/google/callback?state=dummy_state&code=bad_code", follow_redirects=False)
                assert res.status_code in (302, 307)
                assert "error=google_token_request_failed" in res.headers["location"]

            # 3. Timeout error
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock, side_effect=httpx.TimeoutException("Timeout")):
                res = client.get("/auth/v2/oauth/google/callback?state=dummy_state&code=timeout_code", follow_redirects=False)
                assert res.status_code in (302, 307)
                assert "error=google_timeout" in res.headers["location"]

    def test_google_callback_link_collision_and_reauth_mismatch(self):
        from unittest.mock import AsyncMock
        from datetime import datetime, timedelta, timezone

        # 1. Link Collision (target Google account already linked to another user)
        class LinkCollisionCursor(FakeCursor):
            def __init__(self):
                super().__init__()
                self.calls = 0

            def fetchone(self):
                self.calls += 1
                if self.calls == 1:
                    exp = datetime.now(timezone.utc) + timedelta(minutes=5)
                    # purpose="link", bound to user 77
                    return (1, 77, "sess_link", "link", "google", None, exp)
                elif self.calls == 2:
                    # SELECT user_id FROM social_accounts WHERE provider = 'google' AND provider_user_id = %s
                    return (999,)  # Already linked to user 999!
                return None

        fake_conn = FakeConnection(LinkCollisionCursor())
        router = create_auth_router(lambda: fake_conn)
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)

        mock_token_resp = MagicMock()
        mock_token_resp.status_code = 200
        mock_token_resp.json.return_value = {"id_token": "tok", "access_token": "acc"}
        mock_userinfo = MagicMock()
        mock_userinfo.status_code = 200
        mock_userinfo.json.return_value = {"sub": "google_sub_x"}

        with patch.dict("os.environ", {
            "USE_MOCK_OAUTH": "false",
            "ENV": "development",
            "GOOGLE_CLIENT_ID": "mock_google_id",
            "GOOGLE_CLIENT_SECRET": "mock_google_secret",
        }, clear=False):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_token_resp):
                with patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_userinfo):
                    with patch("google.oauth2.id_token.verify_oauth2_token", return_value={"sub": "google_sub_x", "iss": "accounts.google.com"}):
                        res = client.get("/auth/v2/oauth/google/callback?state=dummy_state&code=code", follow_redirects=False)
                        assert res.status_code in (302, 307)
                        assert "error=already_linked_to_other_user" in res.headers["location"]

        # 2. Reauth mismatch (user tries to re-authenticate with a different Google account)
        class ReauthMismatchCursor(FakeCursor):
            def __init__(self):
                super().__init__()
                self.calls = 0

            def fetchone(self):
                self.calls += 1
                if self.calls == 1:
                    exp = datetime.now(timezone.utc) + timedelta(minutes=5)
                    # purpose="reauth", bound to user 88
                    return (1, 88, "sess_reauth", "reauth", "google", None, exp)
                elif self.calls == 2:
                    # SELECT 1 FROM social_accounts WHERE user_id = 88 AND provider = 'google' AND provider_user_id = %s
                    return None  # No matching Google account for user 88
                return None

        fake_conn2 = FakeConnection(ReauthMismatchCursor())
        router2 = create_auth_router(lambda: fake_conn2)
        app2 = FastAPI()
        app2.include_router(router2)
        client2 = TestClient(app2)

        mock_userinfo2 = MagicMock()
        mock_userinfo2.status_code = 200
        mock_userinfo2.json.return_value = {"sub": "google_sub_other"}

        with patch.dict("os.environ", {
            "USE_MOCK_OAUTH": "false",
            "ENV": "development",
            "GOOGLE_CLIENT_ID": "mock_google_id",
            "GOOGLE_CLIENT_SECRET": "mock_google_secret",
        }, clear=False):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_token_resp):
                with patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_userinfo2):
                    with patch("google.oauth2.id_token.verify_oauth2_token", return_value={"sub": "google_sub_other", "iss": "accounts.google.com"}):
                        res = client2.get("/auth/v2/oauth/google/callback?state=dummy_state&code=code", follow_redirects=False)
                        assert res.status_code in (302, 307)
                        assert "error=reauth_user_mismatch" in res.headers["location"]

