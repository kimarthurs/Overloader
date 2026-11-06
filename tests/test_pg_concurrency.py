"""
PostgreSQL Real Concurrency & Atomicity Integration Tests (Step D)
Targets: Dedicated new local test DB ONLY (127.0.0.1:5433 / overloaderdb_stepd_test)
Strictly guards against connecting to production DB.

Tests (Total: 8):
1. Concurrent consumption of identical reauth ticket by 2 threads -> exactly 1 succeeds, 1 fails.
2. Concurrent consumption of identical OAuth exchange code by 2 threads -> exactly 1 succeeds, 1 fails.
3. Transaction rollback on credential change failure -> ticket consumption rolls back (remains unconsumed).
4. Password change atomically updates password & token_version, revoking previous JWTs and reauth tickets.
5. Concurrent unlinking of last remaining methods via shared auth_service -> exactly 1 succeeds, Last Method Protection blocks other.
6. Cross-user, cross-session, cross-purpose reauth ticket validation failure.
7. Username UNIQUE collision rejection and identity preservation.
8. Expired token cleanup while preserving active tokens.
"""

import os
import sys
import threading
from datetime import datetime, timedelta, timezone

import psycopg2
from psycopg2 import IntegrityError
import pytest

from backend.auth_utils import (
    generate_session_id,
    generate_oauth_exchange_code,
    create_access_token,
    decode_and_validate_access_token,
    create_reauth_ticket,
    TokenVersionMismatchError,
    REAUTH_PURPOSE_PASSWORD_CHANGE,
    REAUTH_PURPOSE_PASSWORD_UNLINK,
    REAUTH_PURPOSE_SOCIAL_UNLINK,
)
from backend.auth_store import (
    store_reauth_ticket_record,
    consume_reauth_ticket_record,
    store_oauth_exchange_code,
    consume_oauth_exchange_code,
    cleanup_expired_auth_tokens,
    TokenAlreadyConsumedError,
    TokenBindingMismatchError,
)
from backend.auth_service import (
    unlink_social_account,
    unlink_password_credential,
    change_password_credential,
    LastLoginMethodError,
)

# ── Strict Target Environment Safeguards ────────────────────────────────────────

LOCAL_TEST_HOST = os.getenv("STEPD_TEST_HOST", "127.0.0.1")
LOCAL_TEST_PORT = int(os.getenv("STEPD_TEST_PORT", "5433"))
LOCAL_TEST_DB = os.getenv("STEPD_TEST_DB", "overloaderdb_stepd_test")
LOCAL_TEST_USER = os.getenv("STEPD_TEST_USER", "postgres")
LOCAL_TEST_PASSWORD = os.getenv("STEPD_TEST_PASSWORD") or os.getenv("PGPASSWORD") or ""


def get_test_conn():
    """Returns a connection to the dedicated local test database with strict safeguard."""
    if LOCAL_TEST_HOST not in ("127.0.0.1", "localhost") or LOCAL_TEST_PORT == 5432:
        raise RuntimeError(
            f"SECURITY ABORT: Attempted to run integration tests against non-local or default port ({LOCAL_TEST_HOST}:{LOCAL_TEST_PORT})"
        )
    return psycopg2.connect(
        host=LOCAL_TEST_HOST,
        port=LOCAL_TEST_PORT,
        dbname=LOCAL_TEST_DB,
        user=LOCAL_TEST_USER,
        password=LOCAL_TEST_PASSWORD,
    )


def is_test_db_ready() -> bool:
    """Checks if the dedicated local test database is accessible."""
    try:
        conn = get_test_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM information_schema.tables WHERE table_name = 'auth_single_use_tokens'")
            has_table = cur.fetchone() is not None
        conn.close()
        return has_table
    except Exception:
        return False


# Skip all tests if local test DB is not running or schema not applied
pytestmark = pytest.mark.skipif(
    not is_test_db_ready(),
    reason=f"Dedicated local test DB ({LOCAL_TEST_HOST}:{LOCAL_TEST_PORT}/{LOCAL_TEST_DB}) not running or schema not applied"
)


# ── Concurrency & Atomicity Tests (8 Items) ────────────────────────────────────

class TestPostgreSQLConcurrency:
    @pytest.fixture(autouse=True)
    def setup_user(self):
        conn = get_test_conn()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO users (id, name, token_version)
                VALUES (99999, 'Concurrency Test User', 1)
                ON CONFLICT (id) DO UPDATE SET token_version = 1
            """)
            cur.execute("""
                INSERT INTO password_credentials (user_id, username, password_hash)
                VALUES (99999, 'concurrency_user_99999', 'init_hash_val')
                ON CONFLICT (user_id) DO UPDATE SET username = 'concurrency_user_99999', password_hash = 'init_hash_val'
            """)
            conn.commit()
        yield
        conn = get_test_conn()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM auth_single_use_tokens WHERE user_id = 99999")
            cur.execute("DELETE FROM password_credentials WHERE user_id = 99999")
            cur.execute("DELETE FROM users WHERE id = 99999")
            conn.commit()
        conn.close()

    def test_concurrent_reauth_ticket_consumption_exactly_one_succeeds(self):
        """1. Two concurrent threads attempt to consume the exact same ticket jti simultaneously."""
        jti = "test_ticket_jti_" + generate_session_id()
        session_id = "sess_concurrent_123"
        user_id = 99999
        purpose = "password_change"

        # Store ticket
        conn = get_test_conn()
        with conn.cursor() as cur:
            store_reauth_ticket_record(
                cur=cur,
                ticket_jti=jti,
                user_id=user_id,
                session_id=session_id,
                purpose=purpose,
                token_version=1,
                ttl_minutes=5,
            )
            conn.commit()
        conn.close()

        results = []
        errors = []

        def worker():
            t_conn = get_test_conn()
            try:
                with t_conn.cursor() as cur:
                    res = consume_reauth_ticket_record(
                        cur=cur,
                        ticket_jti=jti,
                        expected_user_id=user_id,
                        expected_purpose=purpose,
                        expected_session_id=session_id,
                        current_token_version=1,
                    )
                    t_conn.commit()
                    results.append(res)
            except TokenAlreadyConsumedError as e:
                t_conn.rollback()
                errors.append(e)
            finally:
                t_conn.close()

        # Run 2 threads concurrently
        t1 = threading.Thread(target=worker)
        t2 = threading.Thread(target=worker)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Exactly 1 thread must succeed and 1 must get TokenAlreadyConsumedError
        assert len(results) == 1, f"Expected 1 success, got {len(results)}"
        assert len(errors) == 1, f"Expected 1 TokenAlreadyConsumedError, got {len(errors)}"

    def test_concurrent_oauth_exchange_code_consumption_exactly_one_succeeds(self):
        """2. Two concurrent threads attempt to consume the exact same OAuth exchange code."""
        code = generate_oauth_exchange_code()
        session_id = "sess_oauth_xyz"
        user_id = 99999

        conn = get_test_conn()
        with conn.cursor() as cur:
            store_oauth_exchange_code(
                cur=cur,
                code_secret=code,
                user_id=user_id,
                session_id=session_id,
                ttl_seconds=60,
            )
            conn.commit()
        conn.close()

        results = []
        errors = []

        def worker():
            t_conn = get_test_conn()
            try:
                with t_conn.cursor() as cur:
                    res = consume_oauth_exchange_code(
                        cur=cur,
                        code_secret=code,
                        expected_session_id=session_id,
                    )
                    t_conn.commit()
                    results.append(res)
            except TokenAlreadyConsumedError as e:
                t_conn.rollback()
                errors.append(e)
            finally:
                t_conn.close()

        t1 = threading.Thread(target=worker)
        t2 = threading.Thread(target=worker)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        assert len(results) == 1
        assert len(errors) == 1

    def test_transaction_rollback_preserves_unconsumed_ticket(self):
        """3. If an operation fails after ticket consumption, rollback preserves the ticket."""
        jti = "test_ticket_rollback_" + generate_session_id()
        session_id = "sess_rb"
        user_id = 99999
        purpose = "password_change"

        conn = get_test_conn()
        with conn.cursor() as cur:
            store_reauth_ticket_record(
                cur=cur,
                ticket_jti=jti,
                user_id=user_id,
                session_id=session_id,
                purpose=purpose,
                token_version=1,
            )
            conn.commit()

        # Simulate transaction that consumes ticket then fails
        with conn.cursor() as cur:
            consume_reauth_ticket_record(
                cur=cur,
                ticket_jti=jti,
                expected_user_id=user_id,
                expected_purpose=purpose,
                expected_session_id=session_id,
                current_token_version=1,
            )
            # Intentionally rollback
            conn.rollback()

        # In a new transaction, verify consumed_at is still NULL and ticket can be consumed
        with conn.cursor() as cur:
            res = consume_reauth_ticket_record(
                cur=cur,
                ticket_jti=jti,
                expected_user_id=user_id,
                expected_purpose=purpose,
                expected_session_id=session_id,
                current_token_version=1,
            )
            conn.commit()
            assert res["user_id"] == user_id
        conn.close()

    def test_password_change_revokes_previous_jwt_and_reauth_tickets(self):
        """
        4. Validates that password change increments token_version inside the transaction,
        and immediately revokes all prior access JWTs and pending reauth tickets for that user.
        """
        user_id = 99999
        session_id = "sess_pwd_change_test"

        # Issue access JWT at token_version=1
        jwt_v1 = create_access_token(user_id=user_id, token_version=1, session_id=session_id)

        # Issue reauth ticket A (for password change)
        ticket_a, jti_a = create_reauth_ticket(
            user_id=user_id,
            purpose=REAUTH_PURPOSE_PASSWORD_CHANGE,
            session_id=session_id,
            token_version=1,
        )
        # Issue reauth ticket B (pending for another purpose, issued before password change)
        ticket_b, jti_b = create_reauth_ticket(
            user_id=user_id,
            purpose=REAUTH_PURPOSE_SOCIAL_UNLINK,
            session_id=session_id,
            token_version=1,
            target_provider="google",
        )

        conn = get_test_conn()
        with conn.cursor() as cur:
            store_reauth_ticket_record(
                cur=cur,
                ticket_jti=jti_a,
                user_id=user_id,
                session_id=session_id,
                purpose=REAUTH_PURPOSE_PASSWORD_CHANGE,
                token_version=1,
            )
            store_reauth_ticket_record(
                cur=cur,
                ticket_jti=jti_b,
                user_id=user_id,
                session_id=session_id,
                purpose=REAUTH_PURPOSE_SOCIAL_UNLINK,
                token_version=1,
                target_provider="google",
            )
            conn.commit()

        # Verify initial access JWT is valid when current token_version is 1
        payload_v1 = decode_and_validate_access_token(jwt_v1, expected_token_version=1)
        assert payload_v1["ver"] == 1

        # Execute password change via shared auth_service
        with conn.cursor() as cur:
            new_version = change_password_credential(
                cur=cur,
                user_id=user_id,
                new_password_hash="updated_secure_hash_v2",
                ticket_jti=jti_a,
                session_id=session_id,
                token_version=1,
            )
            conn.commit()

        assert new_version == 2, f"Expected new token_version to be 2, got {new_version}"

        # 1. Previous access JWT must be rejected with TokenVersionMismatchError against new token_version (2)
        with pytest.raises(TokenVersionMismatchError, match="revoked"):
            decode_and_validate_access_token(jwt_v1, expected_token_version=new_version)

        # 2. Pending reauth ticket B (bound to token_version 1) must be rejected with TokenBindingMismatchError
        with conn.cursor() as cur:
            with pytest.raises(TokenBindingMismatchError, match="token_version 1, but user is now at version 2"):
                consume_reauth_ticket_record(
                    cur=cur,
                    ticket_jti=jti_b,
                    expected_user_id=user_id,
                    expected_purpose=REAUTH_PURPOSE_SOCIAL_UNLINK,
                    expected_session_id=session_id,
                    current_token_version=new_version,
                )

        # 3. New access JWT issued at token_version=2 must succeed
        jwt_v2 = create_access_token(user_id=user_id, token_version=new_version, session_id=session_id)
        payload_v2 = decode_and_validate_access_token(jwt_v2, expected_token_version=new_version)
        assert payload_v2["ver"] == 2

        conn.close()

    def test_concurrent_unlink_last_method_protection(self):
        """
        5. Two concurrent threads attempt to unlink the last remaining methods simultaneously.
        User has exactly 1 password and 1 social account (total 2 methods).
        Thread 1 calls auth_service.unlink_password_credential.
        Thread 2 calls auth_service.unlink_social_account.
        Because both lock `SELECT 1 FROM users WHERE id = %s FOR UPDATE`,
        exactly 1 succeeds and the other is blocked by Last Method Protection (LastLoginMethodError).
        The user's remaining methods count is strictly 1 (never drops to 0).
        """
        test_uid = 99998
        session_pwd = "sess_unlink_pwd_worker"
        session_soc = "sess_unlink_soc_worker"

        conn = get_test_conn()
        with conn.cursor() as cur:
            # Clean and set up user 99998 with 1 password and 1 google account
            cur.execute("DELETE FROM auth_single_use_tokens WHERE user_id = %s", (test_uid,))
            cur.execute("DELETE FROM social_accounts WHERE user_id = %s", (test_uid,))
            cur.execute("DELETE FROM password_credentials WHERE user_id = %s", (test_uid,))
            cur.execute("DELETE FROM users WHERE id = %s", (test_uid,))

            cur.execute("INSERT INTO users (id, name, token_version) VALUES (%s, 'Unlink Test User', 1)", (test_uid,))
            cur.execute("""
                INSERT INTO password_credentials (user_id, username, password_hash)
                VALUES (%s, 'unlink_user_998', 'dummy_hash')
            """, (test_uid,))
            cur.execute("""
                INSERT INTO social_accounts (user_id, provider, provider_user_id, email)
                VALUES (%s, 'google', 'google_uid_998', 'unlink998@example.com')
            """, (test_uid,))

            # Issue and store valid reauth tickets for each worker
            ticket_pwd, jti_pwd = create_reauth_ticket(
                user_id=test_uid,
                purpose=REAUTH_PURPOSE_PASSWORD_UNLINK,
                session_id=session_pwd,
                token_version=1,
            )
            ticket_soc, jti_soc = create_reauth_ticket(
                user_id=test_uid,
                purpose=REAUTH_PURPOSE_SOCIAL_UNLINK,
                session_id=session_soc,
                token_version=1,
                target_provider="google",
            )
            store_reauth_ticket_record(
                cur=cur,
                ticket_jti=jti_pwd,
                user_id=test_uid,
                session_id=session_pwd,
                purpose=REAUTH_PURPOSE_PASSWORD_UNLINK,
                token_version=1,
            )
            store_reauth_ticket_record(
                cur=cur,
                ticket_jti=jti_soc,
                user_id=test_uid,
                session_id=session_soc,
                purpose=REAUTH_PURPOSE_SOCIAL_UNLINK,
                token_version=1,
                target_provider="google",
            )
            conn.commit()
        conn.close()

        successes = []
        blocked = []
        errors = []

        def worker_unlink_password():
            t_conn = get_test_conn()
            try:
                with t_conn.cursor() as cur:
                    unlink_password_credential(
                        cur=cur,
                        user_id=test_uid,
                        ticket_jti=jti_pwd,
                        session_id=session_pwd,
                        token_version=1,
                    )
                    t_conn.commit()
                    successes.append("password_unlinked")
            except LastLoginMethodError as e:
                t_conn.rollback()
                blocked.append(("password", str(e)))
            except Exception as e:
                t_conn.rollback()
                errors.append(("password_unexpected", e))
            finally:
                t_conn.close()

        def worker_unlink_social():
            t_conn = get_test_conn()
            try:
                with t_conn.cursor() as cur:
                    unlink_social_account(
                        cur=cur,
                        user_id=test_uid,
                        provider="google",
                        ticket_jti=jti_soc,
                        session_id=session_soc,
                        token_version=1,
                    )
                    t_conn.commit()
                    successes.append("social_unlinked")
            except LastLoginMethodError as e:
                t_conn.rollback()
                blocked.append(("social", str(e)))
            except Exception as e:
                t_conn.rollback()
                errors.append(("social_unexpected", e))
            finally:
                t_conn.close()

        t1 = threading.Thread(target=worker_unlink_password)
        t2 = threading.Thread(target=worker_unlink_social)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Assert no unexpected exceptions occurred
        assert len(errors) == 0, f"Unexpected errors during concurrent unlink: {errors}"

        # Exactly 1 success, 1 blocked by LastLoginMethodError
        assert len(successes) == 1, f"Expected 1 success, got {successes}"
        assert len(blocked) == 1, f"Expected 1 blocked, got {blocked}"
        assert isinstance(blocked[0][1], str) and "마지막 남은 로그인 수단" in blocked[0][1]

        # Verify that exactly 1 method remains in DB (never drops to 0)
        chk_conn = get_test_conn()
        with chk_conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM social_accounts WHERE user_id = %s", (test_uid,))
            rem_social = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM password_credentials WHERE user_id = %s", (test_uid,))
            rem_pwd = cur.fetchone()[0]
            assert (rem_social + rem_pwd) == 1, "Remaining login methods must be strictly 1"

            # Verify that the rolled-back worker's ticket was preserved unconsumed
            if successes[0] == "password_unlinked":
                cur.execute("SELECT consumed_at FROM auth_single_use_tokens WHERE token_hash = %s",
                            (jti_soc,))  # check by session_id query
                cur.execute("SELECT consumed_at FROM auth_single_use_tokens WHERE session_id = %s", (session_soc,))
                assert cur.fetchone()[0] is None, "Failed operation's ticket must remain unconsumed after rollback"
            else:
                cur.execute("SELECT consumed_at FROM auth_single_use_tokens WHERE session_id = %s", (session_pwd,))
                assert cur.fetchone()[0] is None, "Failed operation's ticket must remain unconsumed after rollback"

            # Cleanup user 99998
            cur.execute("DELETE FROM auth_single_use_tokens WHERE user_id = %s", (test_uid,))
            cur.execute("DELETE FROM social_accounts WHERE user_id = %s", (test_uid,))
            cur.execute("DELETE FROM password_credentials WHERE user_id = %s", (test_uid,))
            cur.execute("DELETE FROM users WHERE id = %s", (test_uid,))
            chk_conn.commit()
        chk_conn.close()

    def test_reauth_ticket_cross_user_session_purpose_rejected(self):
        """6. Validates that tickets bound to user A, session A, purpose A are rejected for user B, session B, or purpose B."""
        jti = "test_ticket_cross_" + generate_session_id()
        session_id = "sess_original"
        user_id = 99999
        purpose = "password_change"

        conn = get_test_conn()
        with conn.cursor() as cur:
            store_reauth_ticket_record(
                cur=cur,
                ticket_jti=jti,
                user_id=user_id,
                session_id=session_id,
                purpose=purpose,
                token_version=1,
            )
            conn.commit()

        with conn.cursor() as cur:
            # 1. Wrong user
            with pytest.raises(TokenBindingMismatchError, match="user mismatch"):
                consume_reauth_ticket_record(
                    cur, jti, expected_user_id=12345, expected_purpose=purpose,
                    expected_session_id=session_id, current_token_version=1
                )

            # 2. Wrong session
            with pytest.raises(TokenBindingMismatchError, match="session mismatch"):
                consume_reauth_ticket_record(
                    cur, jti, expected_user_id=user_id, expected_purpose=purpose,
                    expected_session_id="sess_hijacker", current_token_version=1
                )

            # 3. Wrong purpose
            with pytest.raises(TokenBindingMismatchError, match="purpose mismatch"):
                consume_reauth_ticket_record(
                    cur, jti, expected_user_id=user_id, expected_purpose="social_unlink",
                    expected_session_id=session_id, current_token_version=1
                )
        conn.close()

    def test_username_unique_collision_and_id_preservation(self):
        """7. Verifies that duplicate username insertion is rejected by UNIQUE constraint and original user remains unchanged."""
        conn = get_test_conn()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO password_credentials (user_id, username, password_hash)
                VALUES (99999, 'existing_unique_uname', 'hash1')
                ON CONFLICT (user_id) DO UPDATE SET username = 'existing_unique_uname', password_hash = 'hash1'
            """)
            conn.commit()

        # Attempt to insert same username for another user 99997
        with conn.cursor() as cur:
            cur.execute("INSERT INTO users (id, name, token_version) VALUES (99997, 'Other User', 1) ON CONFLICT (id) DO NOTHING")
            with pytest.raises(IntegrityError):
                cur.execute("""
                    INSERT INTO password_credentials (user_id, username, password_hash)
                    VALUES (99997, 'existing_unique_uname', 'hash2')
                """)
            conn.rollback()

        # Verify original user 99999 remains intact
        with conn.cursor() as cur:
            cur.execute("SELECT user_id, password_hash FROM password_credentials WHERE username = 'existing_unique_uname'")
            row = cur.fetchone()
            assert row[0] == 99999
            assert row[1] == 'hash1'
            cur.execute("DELETE FROM users WHERE id = 99997")
            conn.commit()
        conn.close()

    def test_cleanup_expired_tokens(self):
        """8. Tests that expired and 1h+ old consumed tokens are cleaned up while active tokens remain."""
        conn = get_test_conn()
        with conn.cursor() as cur:
            # Active token
            cur.execute("""
                INSERT INTO auth_single_use_tokens (token_hash, token_type, session_id, expires_at)
                VALUES ('active_hash_1', 'oauth_exchange_code', 'sess_act', now() + interval '5 minutes')
                ON CONFLICT (token_hash) DO NOTHING
            """)
            # Expired token
            cur.execute("""
                INSERT INTO auth_single_use_tokens (token_hash, token_type, session_id, expires_at)
                VALUES ('expired_hash_1', 'oauth_exchange_code', 'sess_exp', now() - interval '1 minute')
                ON CONFLICT (token_hash) DO NOTHING
            """)
            # Consumed > 1 hour ago
            cur.execute("""
                INSERT INTO auth_single_use_tokens (token_hash, token_type, session_id, consumed_at, expires_at)
                VALUES ('consumed_old_hash_1', 'oauth_exchange_code', 'sess_con', now() - interval '2 hours', now() + interval '1 hour')
                ON CONFLICT (token_hash) DO NOTHING
            """)
            conn.commit()

            deleted = cleanup_expired_auth_tokens(cur)
            conn.commit()
            assert deleted >= 2

            # Verify active token still exists
            cur.execute("SELECT 1 FROM auth_single_use_tokens WHERE token_hash = 'active_hash_1'")
            assert cur.fetchone() is not None

            # Cleanup
            cur.execute("DELETE FROM auth_single_use_tokens WHERE token_hash = 'active_hash_1'")
            conn.commit()
        conn.close()
