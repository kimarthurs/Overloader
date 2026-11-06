"""
PostgreSQL-backed Single-Use Auth Token Store (Step D)
Handles atomic storage, validation, and single-use consumption for:
- OAuth state parameters
- OAuth exchange codes (secrets-based opaque codes)
- Re-authentication tickets (by jti)
Guarantees transaction-level atomic consumption and rollback protection.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

try:
    from backend.auth_utils import hash_token_or_code, TOKEN_TYPE_ACCESS, TOKEN_TYPE_REAUTH
except ImportError:
    from auth_utils import hash_token_or_code, TOKEN_TYPE_ACCESS, TOKEN_TYPE_REAUTH


class AuthStoreError(Exception):
    """Base exception for auth store failures."""
    pass


class TokenNotFoundError(AuthStoreError):
    """Raised when the token hash is not found in the store."""
    pass


class TokenAlreadyConsumedError(AuthStoreError):
    """Raised when the token has already been marked as consumed."""
    pass


class TokenExpiredInStoreError(AuthStoreError):
    """Raised when the token expires_at has passed."""
    pass


class TokenBindingMismatchError(AuthStoreError):
    """Raised when session, user, purpose, provider, or token_version does not match."""
    pass


# ── 1. OAuth State Storage & Consumption ────────────────────────────────────────

def store_oauth_state(
    cur,
    state_secret: str,
    session_id: str,
    purpose: str,
    user_id: Optional[int] = None,
    target_provider: Optional[str] = None,
    ttl_seconds: int = 600,
) -> str:
    """
    Stores SHA-256 hash of an OAuth state string.
    Expires in 10 minutes by default.
    """
    token_hash = hash_token_or_code(state_secret)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expires_at = now + timedelta(seconds=ttl_seconds)

    cur.execute("""
        INSERT INTO auth_single_use_tokens 
            (token_hash, token_type, user_id, session_id, purpose, target_provider, expires_at)
        VALUES 
            (%s, 'oauth_state', %s, %s, %s, %s, %s)
    """, (token_hash, user_id, session_id.strip(), purpose, target_provider, expires_at))

    return token_hash


def consume_oauth_state(
    cur,
    state_secret: str,
    expected_session_id: str,
    expected_purpose: str,
    expected_user_id: Optional[int] = None,
    expected_target_provider: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Atomically verifies and consumes an OAuth state parameter using SELECT FOR UPDATE.
    Rejects expired, consumed, or mismatched states.
    """
    token_hash = hash_token_or_code(state_secret)
    cur.execute("""
        SELECT id, token_type, user_id, session_id, purpose, target_provider, consumed_at, expires_at
        FROM auth_single_use_tokens
        WHERE token_hash = %s AND token_type = 'oauth_state'
        FOR UPDATE
    """, (token_hash,))
    row = cur.fetchone()

    if not row:
        raise TokenNotFoundError("OAuth state not found or invalid")

    _id, _type, user_id, session_id, purpose, target_provider, consumed_at, expires_at = row

    if consumed_at is not None:
        raise TokenAlreadyConsumedError("OAuth state has already been consumed")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if expires_at is not None and getattr(expires_at, "tzinfo", None) is not None:
        expires_at = expires_at.astimezone(timezone.utc).replace(tzinfo=None)
    if expires_at < now:
        raise TokenExpiredInStoreError("OAuth state has expired")

    if session_id != expected_session_id.strip():
        raise TokenBindingMismatchError("OAuth state session binding mismatch")

    if purpose != expected_purpose:
        raise TokenBindingMismatchError(f"OAuth state purpose mismatch: expected {expected_purpose}, got {purpose}")

    if expected_user_id is not None and user_id != expected_user_id:
        raise TokenBindingMismatchError("OAuth state user mismatch")

    if expected_target_provider is not None and target_provider != expected_target_provider:
        raise TokenBindingMismatchError("OAuth state target provider mismatch")

    # Atomically mark as consumed
    cur.execute("UPDATE auth_single_use_tokens SET consumed_at = now() WHERE id = %s", (_id,))

    return {
        "user_id": user_id,
        "session_id": session_id,
        "purpose": purpose,
        "target_provider": target_provider,
    }


# ── 2. OAuth Exchange Code Storage & Consumption ────────────────────────────────

def store_oauth_exchange_code(
    cur,
    code_secret: str,
    user_id: int,
    session_id: str,
    ttl_seconds: int = 60,
) -> str:
    """
    Stores SHA-256 hash of an opaque OAuth exchange code.
    Expires in 60 seconds.
    """
    token_hash = hash_token_or_code(code_secret)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expires_at = now + timedelta(seconds=ttl_seconds)

    cur.execute("""
        INSERT INTO auth_single_use_tokens
            (token_hash, token_type, user_id, session_id, expires_at)
        VALUES
            (%s, 'oauth_exchange_code', %s, %s, %s)
    """, (token_hash, user_id, session_id.strip(), expires_at))

    return token_hash


def consume_oauth_exchange_code(
    cur,
    code_secret: str,
    expected_session_id: str,
) -> int:
    """
    Atomically verifies and consumes an opaque OAuth exchange code.
    Returns user_id on success.
    """
    token_hash = hash_token_or_code(code_secret)
    cur.execute("""
        SELECT id, user_id, session_id, consumed_at, expires_at
        FROM auth_single_use_tokens
        WHERE token_hash = %s AND token_type = 'oauth_exchange_code'
        FOR UPDATE
    """, (token_hash,))
    row = cur.fetchone()

    if not row:
        raise TokenNotFoundError("OAuth exchange code not found or invalid")

    _id, user_id, session_id, consumed_at, expires_at = row

    if consumed_at is not None:
        raise TokenAlreadyConsumedError("OAuth exchange code has already been consumed")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if expires_at is not None and getattr(expires_at, "tzinfo", None) is not None:
        expires_at = expires_at.astimezone(timezone.utc).replace(tzinfo=None)
    if expires_at < now:
        raise TokenExpiredInStoreError("OAuth exchange code has expired")

    if session_id != expected_session_id.strip():
        raise TokenBindingMismatchError("OAuth exchange code session binding mismatch")

    cur.execute("UPDATE auth_single_use_tokens SET consumed_at = now() WHERE id = %s", (_id,))
    return user_id


# ── 3. Re-auth Ticket Storage & Consumption ─────────────────────────────────────

def store_reauth_ticket_record(
    cur,
    ticket_jti: str,
    user_id: int,
    session_id: str,
    purpose: str,
    token_version: int,
    target_provider: Optional[str] = None,
    ttl_minutes: int = 5,
) -> str:
    """
    Stores SHA-256 hash of the re-auth ticket jti to track single-use consumption.
    Binds user_id, session_id, purpose, target_provider, and token_version.
    """
    token_hash = hash_token_or_code(ticket_jti)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expires_at = now + timedelta(minutes=ttl_minutes)

    cur.execute("""
        INSERT INTO auth_single_use_tokens
            (token_hash, token_type, user_id, session_id, purpose, target_provider, token_version, expires_at)
        VALUES
            (%s, 'reauth_ticket', %s, %s, %s, %s, %s, %s)
    """, (token_hash, user_id, session_id.strip(), purpose, target_provider, token_version, expires_at))

    return token_hash


def consume_reauth_ticket_record(
    cur,
    ticket_jti: str,
    expected_user_id: int,
    expected_purpose: str,
    expected_session_id: str,
    current_token_version: int,
    expected_target_provider: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Atomically consumes a re-authentication ticket record using SELECT FOR UPDATE.
    Verifies that the ticket has not been consumed, has not expired,
    and matches user, session, purpose, provider, and active token_version.
    """
    token_hash = hash_token_or_code(ticket_jti)
    cur.execute("""
        SELECT id, user_id, session_id, purpose, target_provider, token_version, consumed_at, expires_at
        FROM auth_single_use_tokens
        WHERE token_hash = %s AND token_type = 'reauth_ticket'
        FOR UPDATE
    """, (token_hash,))
    row = cur.fetchone()

    if not row:
        raise TokenNotFoundError("Reauth ticket record not found or invalid")

    _id, user_id, session_id, purpose, target_provider, token_version, consumed_at, expires_at = row

    if consumed_at is not None:
        raise TokenAlreadyConsumedError("Reauth ticket has already been consumed")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if expires_at is not None and getattr(expires_at, "tzinfo", None) is not None:
        expires_at = expires_at.astimezone(timezone.utc).replace(tzinfo=None)
    if expires_at < now:
        raise TokenExpiredInStoreError("Reauth ticket has expired")

    if user_id != expected_user_id:
        raise TokenBindingMismatchError("Reauth ticket user mismatch")

    if session_id != expected_session_id.strip():
        raise TokenBindingMismatchError("Reauth ticket session mismatch")

    if purpose != expected_purpose:
        raise TokenBindingMismatchError(f"Reauth ticket purpose mismatch: expected {expected_purpose}, got {purpose}")

    if int(token_version) != int(current_token_version):
        raise TokenBindingMismatchError(
            f"Reauth ticket was issued under token_version {token_version}, but user is now at version {current_token_version}"
        )

    if expected_target_provider is not None and target_provider != expected_target_provider:
        raise TokenBindingMismatchError("Reauth ticket target provider mismatch")

    cur.execute("UPDATE auth_single_use_tokens SET consumed_at = now() WHERE id = %s", (_id,))

    return {
        "user_id": user_id,
        "purpose": purpose,
        "token_version": token_version,
    }


# ── 4. Expired Tokens Cleanup ───────────────────────────────────────────────────

def cleanup_expired_auth_tokens(cur) -> int:
    """
    Deletes tokens that have expired or were consumed over 1 hour ago.
    Returns the count of deleted rows.
    """
    cur.execute("""
        DELETE FROM auth_single_use_tokens
        WHERE expires_at < now() 
           OR (consumed_at IS NOT NULL AND consumed_at < now() - interval '1 hour')
    """)
    return cur.rowcount
