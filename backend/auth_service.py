"""
Overloader Authentication & Account Management Service (Step D)
Shared business logic for account methods, password management, and unlinking.
Used by both auth_router.py and PostgreSQL integration tests to guarantee
that tests execute the exact production service logic.
"""

from typing import Dict, Any, List, Optional
import psycopg2
from psycopg2 import IntegrityError

try:
    from backend.auth_store import (
        consume_reauth_ticket_record,
        TokenAlreadyConsumedError,
        TokenExpiredInStoreError,
        TokenBindingMismatchError,
        TokenNotFoundError,
    )
    from backend.auth_utils import (
        REAUTH_PURPOSE_PASSWORD_ADD,
        REAUTH_PURPOSE_PASSWORD_CHANGE,
        REAUTH_PURPOSE_PASSWORD_RESET,
        REAUTH_PURPOSE_PASSWORD_UNLINK,
        REAUTH_PURPOSE_SOCIAL_UNLINK,
    )
except ImportError:
    from auth_store import (
        consume_reauth_ticket_record,
        TokenAlreadyConsumedError,
        TokenExpiredInStoreError,
        TokenBindingMismatchError,
        TokenNotFoundError,
    )
    from auth_utils import (
        REAUTH_PURPOSE_PASSWORD_ADD,
        REAUTH_PURPOSE_PASSWORD_CHANGE,
        REAUTH_PURPOSE_PASSWORD_RESET,
        REAUTH_PURPOSE_PASSWORD_UNLINK,
        REAUTH_PURPOSE_SOCIAL_UNLINK,
    )


# ── Domain Exceptions ───────────────────────────────────────────────────────────

class AccountServiceError(Exception):
    """Base exception for account service errors."""
    pass


class LastLoginMethodError(AccountServiceError):
    """Raised when an unlink operation would leave the account with 0 login methods."""
    pass


class CredentialAlreadyExistsError(AccountServiceError):
    """Raised when trying to add a password to an account that already has one."""
    pass


class CredentialNotFoundError(AccountServiceError):
    """Raised when trying to modify or unlink a password that does not exist."""
    pass


class SocialAccountNotFoundError(AccountServiceError):
    """Raised when trying to unlink a social account that is not registered."""
    pass


class UsernameConflictError(AccountServiceError):
    """Raised when username is already taken by another user."""
    pass


# ── Service Functions ───────────────────────────────────────────────────────────

def get_account_methods_summary(cur, user_id: int) -> Dict[str, Any]:
    """
    Retrieves all login methods, social accounts, and unlinking capability flags for a user.
    """
    # 1. Password credential
    cur.execute("SELECT username FROM password_credentials WHERE user_id = %s", (user_id,))
    pwd_row = cur.fetchone()
    has_password = pwd_row is not None
    username = pwd_row[0] if pwd_row else None

    # 2. Social accounts
    cur.execute("""
        SELECT provider, email, created_at
        FROM social_accounts
        WHERE user_id = %s
        ORDER BY created_at ASC
    """, (user_id,))
    social_rows = cur.fetchall()

    social_accounts = [
        {
            "provider": r[0],
            "email": r[1],
            "created_at": r[2].isoformat() if r[2] else None
        }
        for r in social_rows
    ]

    total_methods = (1 if has_password else 0) + len(social_accounts)

    return {
        "has_password": has_password,
        "username": username,
        "social_accounts": social_accounts,
        "total_methods": total_methods,
        "can_unlink_password": (has_password and total_methods > 1),
        "can_unlink_social": (total_methods > 1),
    }


def add_password_credential(
    cur,
    user_id: int,
    username: str,
    password_hash: str,
    ticket_jti: str,
    session_id: str,
    token_version: int,
) -> None:
    """
    Atomically adds password credentials to a social-only account.
    Consumes re-auth ticket and locks user row.
    """
    # 1. Lock user row
    cur.execute("SELECT 1 FROM users WHERE id = %s FOR UPDATE", (user_id,))
    cur.fetchone()

    # 2. Check if password already exists
    cur.execute("SELECT 1 FROM password_credentials WHERE user_id = %s", (user_id,))
    if cur.fetchone():
        raise CredentialAlreadyExistsError("이미 비밀번호가 등록되어 있는 계정입니다.")

    # 3. Check username collision
    cur.execute("SELECT 1 FROM password_credentials WHERE username = %s", (username,))
    if cur.fetchone():
        raise UsernameConflictError("이미 사용 중인 아이디입니다.")

    # 4. Consume reauth ticket
    consume_reauth_ticket_record(
        cur=cur,
        ticket_jti=ticket_jti,
        expected_user_id=user_id,
        expected_purpose=REAUTH_PURPOSE_PASSWORD_ADD,
        expected_session_id=session_id,
        current_token_version=token_version,
    )

    # 5. Insert credential
    try:
        cur.execute("""
            INSERT INTO password_credentials (user_id, username, password_hash)
            VALUES (%s, %s, %s)
        """, (user_id, username, password_hash))
    except IntegrityError:
        raise UsernameConflictError("이미 사용 중인 아이디입니다.")


def change_password_credential(
    cur,
    user_id: int,
    new_password_hash: str,
    ticket_jti: str,
    session_id: str,
    token_version: int,
) -> int:
    """
    Atomically changes password, consumes reauth ticket, and increments token_version.
    Returns the new token_version.
    Note: Bumping token_version invalidates all previous sessions for this user regardless
    of whether they originally logged in via social or password.
    """
    # 1. Lock user row
    cur.execute("SELECT 1 FROM users WHERE id = %s FOR UPDATE", (user_id,))
    cur.fetchone()

    # 2. Check password exists
    cur.execute("SELECT 1 FROM password_credentials WHERE user_id = %s", (user_id,))
    if not cur.fetchone():
        raise CredentialNotFoundError("비밀번호가 등록되어 있지 않은 계정입니다.")

    # 3. Consume reauth ticket
    consume_reauth_ticket_record(
        cur=cur,
        ticket_jti=ticket_jti,
        expected_user_id=user_id,
        expected_purpose=REAUTH_PURPOSE_PASSWORD_CHANGE,
        expected_session_id=session_id,
        current_token_version=token_version,
    )

    # 4. Update password
    cur.execute("""
        UPDATE password_credentials
        SET password_hash = %s, updated_at = now()
        WHERE user_id = %s
    """, (new_password_hash, user_id))

    # 5. Increment token_version (invalidates all previous JWT sessions for this user)
    cur.execute("""
        UPDATE users
        SET token_version = token_version + 1
        WHERE id = %s
        RETURNING token_version
    """, (user_id,))
    new_token_ver = cur.fetchone()[0]

    return new_token_ver


def unlink_social_account(
    cur,
    user_id: int,
    provider: str,
    ticket_jti: str,
    session_id: str,
    token_version: int,
) -> None:
    """
    Atomically unlinks a social provider account with strict Last Method Protection.
    If unlinking Google, also sets users.google_id = NULL to ensure the unlinked account
    cannot bypass unlinking through the legacy /auth/google login route.
    """
    # 1. Lock user row to serialize concurrent unlinks
    cur.execute("SELECT 1 FROM users WHERE id = %s FOR UPDATE", (user_id,))
    cur.fetchone()

    # 2. Check target social account exists
    cur.execute("SELECT 1 FROM social_accounts WHERE user_id = %s AND provider = %s", (user_id, provider))
    if not cur.fetchone():
        raise SocialAccountNotFoundError(f"연동된 {provider} 계정을 찾을 수 없습니다.")

    # 3. Last Method Protection check
    cur.execute("SELECT COUNT(*) FROM social_accounts WHERE user_id = %s", (user_id,))
    social_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM password_credentials WHERE user_id = %s", (user_id,))
    pwd_count = cur.fetchone()[0]

    if (social_count + pwd_count) <= 1:
        raise LastLoginMethodError("마지막 남은 로그인 수단은 연동을 해제할 수 없습니다. 최소 1개의 로그인 수단이 유지되어야 합니다.")

    # 4. Consume reauth ticket
    consume_reauth_ticket_record(
        cur=cur,
        ticket_jti=ticket_jti,
        expected_user_id=user_id,
        expected_purpose=REAUTH_PURPOSE_SOCIAL_UNLINK,
        expected_session_id=session_id,
        current_token_version=token_version,
        expected_target_provider=provider,
    )

    # 5. Delete social account
    cur.execute("DELETE FROM social_accounts WHERE user_id = %s AND provider = %s", (user_id, provider))

    # 6. Legacy compatibility alignment: if unlinking Google, clear users.google_id
    if provider == "google":
        cur.execute("UPDATE users SET google_id = NULL WHERE id = %s AND google_id IS NOT NULL", (user_id,))


def unlink_password_credential(
    cur,
    user_id: int,
    ticket_jti: str,
    session_id: str,
    token_version: int,
) -> int:
    """
    Atomically unlinks username/password with strict Last Method Protection.
    Increments token_version to invalidate all previous sessions.
    Returns new token_version.
    """
    # 1. Lock user row
    cur.execute("SELECT 1 FROM users WHERE id = %s FOR UPDATE", (user_id,))
    cur.fetchone()

    # 2. Check password exists
    cur.execute("SELECT 1 FROM password_credentials WHERE user_id = %s", (user_id,))
    if not cur.fetchone():
        raise CredentialNotFoundError("해제할 비밀번호가 등록되어 있지 않습니다.")

    # 3. Last Method Protection check
    cur.execute("SELECT COUNT(*) FROM social_accounts WHERE user_id = %s", (user_id,))
    social_count = cur.fetchone()[0]

    if social_count == 0:
        raise LastLoginMethodError("마지막 남은 로그인 수단은 해제할 수 없습니다. 소셜 계정을 먼저 연동해 주세요.")

    # 4. Consume reauth ticket
    consume_reauth_ticket_record(
        cur=cur,
        ticket_jti=ticket_jti,
        expected_user_id=user_id,
        expected_purpose=REAUTH_PURPOSE_PASSWORD_UNLINK,
        expected_session_id=session_id,
        current_token_version=token_version,
    )

    # 5. Delete credential & bump token_version (invalidates all prior sessions)
    cur.execute("DELETE FROM password_credentials WHERE user_id = %s", (user_id,))
    cur.execute("""
        UPDATE users
        SET token_version = token_version + 1
        WHERE id = %s
        RETURNING token_version
    """, (user_id,))
    new_token_ver = cur.fetchone()[0]

    return new_token_ver


def reset_password_credential(
    cur,
    user_id: int,
    new_password_hash: str,
    ticket_jti: str,
    session_id: str,
    token_version: int,
    username: Optional[str] = None,
) -> int:
    """
    Atomically resets (or initialises) password credentials using a valid reauth ticket (purpose=password_reset).
    Increments token_version to revoke all previous sessions.
    Returns new token_version.
    """
    # 1. Lock user row
    cur.execute("SELECT 1 FROM users WHERE id = %s FOR UPDATE", (user_id,))
    cur.fetchone()

    # 2. Check if user already has password credential
    cur.execute("SELECT username FROM password_credentials WHERE user_id = %s", (user_id,))
    existing_row = cur.fetchone()

    if existing_row:
        # Existing password credential: update password
        if username and username != existing_row[0]:
            cur.execute("SELECT 1 FROM password_credentials WHERE username = %s AND user_id != %s", (username, user_id))
            if cur.fetchone():
                raise UsernameConflictError("이미 사용 중인 아이디입니다.")
            cur.execute("""
                UPDATE password_credentials
                SET username = %s, password_hash = %s, updated_at = now()
                WHERE user_id = %s
            """, (username, new_password_hash, user_id))
        else:
            cur.execute("""
                UPDATE password_credentials
                SET password_hash = %s, updated_at = now()
                WHERE user_id = %s
            """, (new_password_hash, user_id))
    else:
        # Social-only user initialising password via reset: username is required
        if not username:
            raise AccountServiceError("아이디를 함께 입력해 주세요.")
        cur.execute("SELECT 1 FROM password_credentials WHERE username = %s", (username,))
        if cur.fetchone():
            raise UsernameConflictError("이미 사용 중인 아이디입니다.")
        try:
            cur.execute("""
                INSERT INTO password_credentials (user_id, username, password_hash)
                VALUES (%s, %s, %s)
            """, (user_id, username, new_password_hash))
        except IntegrityError:
            raise UsernameConflictError("이미 사용 중인 아이디입니다.")

    # 3. Consume reauth ticket
    consume_reauth_ticket_record(
        cur=cur,
        ticket_jti=ticket_jti,
        expected_user_id=user_id,
        expected_purpose=REAUTH_PURPOSE_PASSWORD_RESET,
        expected_session_id=session_id,
        current_token_version=token_version,
    )

    # 4. Increment token_version (invalidates all previous JWT sessions for this user)
    cur.execute("""
        UPDATE users
        SET token_version = token_version + 1
        WHERE id = %s
        RETURNING token_version
    """, (user_id,))
    new_token_ver = cur.fetchone()[0]

    return new_token_ver

