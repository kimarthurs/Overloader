"""
Overloader Authentication & Security Utilities (Step D)
- Username normalization and validation
- Display name validation
- Strict password complexity policy (8-128 chars, uppercase, lowercase, digit, ASCII punctuation)
- Argon2id non-blocking hashing and verification with dummy hash timing defense
- Fixed-algorithm JWT (HS256) with strict issuer, audience, and claims validation
- Secrets-based opaque OAuth exchange code generation and SHA-256 token hashing
- Re-auth Ticket creation and verification with session and token_version binding
"""

import os
import re
import uuid
import secrets
import hashlib
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional, Tuple

import argon2
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from jose import jwt, JWTError

# ── 1. Configuration Constants ──────────────────────────────────────────────────

JWT_SECRET = os.getenv("JWT_SECRET", "overloader-dev-secret-do-not-use-in-prod-1234567890")
JWT_ALGORITHM = "HS256"
JWT_ISSUER = "overloader"
JWT_AUDIENCE = "overloader-app"

# Token types for strict separation
TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REAUTH = "reauth"

# Allowed reauth purposes
REAUTH_PURPOSE_PASSWORD_ADD = "password_add"
REAUTH_PURPOSE_PASSWORD_CHANGE = "password_change"
REAUTH_PURPOSE_PASSWORD_RESET = "password_reset"
REAUTH_PURPOSE_PASSWORD_UNLINK = "password_unlink"
REAUTH_PURPOSE_SOCIAL_LINK = "social_link"
REAUTH_PURPOSE_SOCIAL_UNLINK = "social_unlink"
ALLOWED_REAUTH_PURPOSES = {
    REAUTH_PURPOSE_PASSWORD_ADD,
    REAUTH_PURPOSE_PASSWORD_CHANGE,
    REAUTH_PURPOSE_PASSWORD_RESET,
    REAUTH_PURPOSE_PASSWORD_UNLINK,
    REAUTH_PURPOSE_SOCIAL_LINK,
    REAUTH_PURPOSE_SOCIAL_UNLINK,
}

# ASCII punctuation characters (excluding whitespace)
ASCII_PUNCTUATION = set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")

# Argon2id configuration (OWASP standard baseline)
ARGON2_TIME_COST = 2          # t = 2 iterations
ARGON2_MEMORY_COST = 19456    # m = 19456 KiB (~19 MiB)
ARGON2_PARALLELISM = 1        # p = 1 thread
ARGON2_HASH_LEN = 32          # 32 bytes output

_hasher = argon2.PasswordHasher(
    time_cost=ARGON2_TIME_COST,
    memory_cost=ARGON2_MEMORY_COST,
    parallelism=ARGON2_PARALLELISM,
    hash_len=ARGON2_HASH_LEN,
    type=argon2.Type.ID,
)

# Precomputed dummy hash for timing attack mitigation when username does not exist
DUMMY_ARGON2_HASH = "$argon2id$v=19$m=19456,t=2,p=1$5Bd+hs9ES6kjUmhB+JmY8A$Otc7M/TuaRQDnmO9dyfcgcyK0jhR9JyJPSvZh4TEgYU"


# ── 2. Custom Exceptions ────────────────────────────────────────────────────────

class AuthValidationError(ValueError):
    """Raised when validation on username, display name, or password fails."""
    pass


class TokenValidationError(Exception):
    """Base exception for token decoding and claim validation failures."""
    pass


class TokenExpiredError(TokenValidationError):
    """Raised when a token's exp has passed."""
    pass


class TokenTypeMismatchError(TokenValidationError):
    """Raised when token type is incorrect or tokens are cross-used."""
    pass


class TokenVersionMismatchError(TokenValidationError):
    """Raised when a token's version does not match the active DB token_version."""
    pass


class TokenClaimMissingError(TokenValidationError):
    """Raised when a required claim is missing from the payload."""
    pass


class TokenAlgorithmMismatchError(TokenValidationError):
    """Raised when token algorithm header is not the fixed HS256."""
    pass


# ── 3. Username & Display Name Validation ───────────────────────────────────────

def normalize_and_validate_username(raw_username: str) -> str:
    """
    Normalizes and validates a login username.
    Rules:
    - Strips leading/trailing whitespace.
    - Normalizes to ASCII lowercase.
    - Length: 4 to 20 characters.
    - Allowed characters: ASCII lowercase letters (a-z), digits (0-9), underscore (_).
    - '@' symbol is explicitly forbidden.
    - Empty, None, or invalid character inputs raise AuthValidationError.
    """
    if raw_username is None:
        raise AuthValidationError("Username cannot be empty")
    
    username = raw_username.strip().lower()

    if "@" in username:
        raise AuthValidationError("Username cannot contain '@' symbol")

    if len(username) < 4 or len(username) > 20:
        raise AuthValidationError("Username must be between 4 and 20 characters")

    if not re.fullmatch(r"^[a-z0-9_]{4,20}$", username):
        raise AuthValidationError("Username must contain only ASCII letters, numbers, and underscores")

    return username


def validate_display_name(raw_name: str) -> str:
    """
    Validates user nickname / display name (users.name).
    Rules:
    - Strips leading/trailing whitespace.
    - Must not be empty.
    - Maximum length: 50 characters.
    - Duplicates are permitted (display name / nickname only).
    """
    if raw_name is None:
        raise AuthValidationError("닉네임은 비어 있을 수 없습니다")
    
    name = raw_name.strip()
    if len(name) == 0:
        raise AuthValidationError("닉네임은 비어 있을 수 없습니다")
    
    if len(name) > 50:
        raise AuthValidationError("닉네임은 50자를 초과할 수 없습니다")

    return name


def validate_optional_email(raw_email: Optional[str]) -> Optional[str]:
    """
    Validates optional contact email (users.email).
    Rules:
    - If None or empty, returns None (optional).
    - If provided: strips whitespace, converts to lowercase.
    - Maximum length: 255 characters.
    - Validates email syntax.
    """
    if raw_email is None:
        return None
    email = raw_email.strip().lower()
    if not email:
        return None
    if len(email) > 255:
        raise AuthValidationError("이메일은 255자를 초과할 수 없습니다")
    if not re.fullmatch(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$", email):
        raise AuthValidationError("올바른 이메일 형식이 아닙니다")
    return email


# ── 4. Password Policy & Complexity Validation ──────────────────────────────────

def evaluate_password_complexity(password: str) -> Dict[str, bool]:
    """
    Evaluates password complexity against the strict policy without mutating or trimming the input.
    Returns:
    - length: 8 <= len(password) <= 128
    - has_upper: contains >= 1 ASCII uppercase [A-Z]
    - has_lower: contains >= 1 ASCII lowercase [a-z]
    - has_number: contains >= 1 digit [0-9]
    - has_special: contains >= 1 ASCII punctuation/symbol (excluding whitespace)
    - valid: True iff all 5 conditions are satisfied
    """
    if password is None:
        return {
            "valid": False,
            "length": False,
            "has_upper": False,
            "has_lower": False,
            "has_number": False,
            "has_special": False,
        }

    length_ok = 8 <= len(password) <= 128
    has_upper = bool(re.search(r"[A-Z]", password))
    has_lower = bool(re.search(r"[a-z]", password))
    has_number = bool(re.search(r"[0-9]", password))
    has_special = any(char in ASCII_PUNCTUATION for char in password)

    all_valid = length_ok and has_upper and has_lower and has_number and has_special

    return {
        "valid": all_valid,
        "length": length_ok,
        "has_upper": has_upper,
        "has_lower": has_lower,
        "has_number": has_number,
        "has_special": has_special,
    }


def validate_password_for_credential_change(password: str) -> None:
    """
    Validates a password for registration, password addition, change, or reset.
    Raises AuthValidationError with specific failure description if non-compliant.
    Never modifies (trim, lowercase, normalize) the password.
    """
    eval_result = evaluate_password_complexity(password)
    if eval_result["valid"]:
        return

    errors = []
    if not eval_result["length"]:
        errors.append("8자 이상 128자 이하이어야 합니다")
    if not eval_result["has_upper"]:
        errors.append("영문 대문자가 1개 이상 포함되어야 합니다")
    if not eval_result["has_lower"]:
        errors.append("영문 소문자가 1개 이상 포함되어야 합니다")
    if not eval_result["has_number"]:
        errors.append("숫자가 1개 이상 포함되어야 합니다")
    if not eval_result["has_special"]:
        errors.append("특수문자(ASCII 기호)가 1개 이상 포함되어야 합니다")

    raise AuthValidationError(f"비밀번호 조건 미충족: {', '.join(errors)}")


# ── 5. Argon2id Hashing & Verification (Async + Sync) ───────────────────────────

def hash_password(password: str) -> str:
    """Synchronously hashes a password using Argon2id."""
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    """Synchronously verifies a password against an Argon2id hash."""
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


async def hash_password_async(password: str) -> str:
    """
    Asynchronously hashes a password by delegating Argon2id computation
    to a worker thread, preventing event loop starvation.
    """
    return await asyncio.to_thread(_hasher.hash, password)


async def verify_password_async(password_hash: str, password: str) -> bool:
    """
    Asynchronously verifies a password against an Argon2id hash in a worker thread.
    """
    def _verify():
        try:
            return _hasher.verify(password_hash, password)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False

    return await asyncio.to_thread(_verify)


async def verify_dummy_password_async() -> None:
    """
    Performs an Argon2id verification against a dummy hash in a worker thread
    to mitigate timing attacks when a username does not exist.
    """
    await verify_password_async(DUMMY_ARGON2_HASH, "dummy_attempt_for_timing")


# ── 6. Opaque Secrets & Hash Helpers ────────────────────────────────────────────

def generate_session_id() -> str:
    """Generates an unguessable 256-bit cryptographically secure session ID."""
    return secrets.token_urlsafe(32)


def generate_oauth_exchange_code() -> str:
    """
    Generates a secure, opaque random exchange code string (not a JWT)
    to transmit through the browser after an OAuth callback.
    """
    return secrets.token_urlsafe(32)


def hash_token_or_code(raw_value: str) -> str:
    """
    Computes SHA-256 hex digest of an opaque token or exchange code
    so that plaintext is never stored in the database.
    """
    return hashlib.sha256(raw_value.encode("utf-8")).hexdigest()


# ── 7. JWT Access Token Creation & Claims Validation ────────────────────────────

def create_access_token(
    user_id: int,
    token_version: int = 1,
    session_id: Optional[str] = None,
    expires_in_days: int = 30,
) -> str:
    """
    Creates a standard login access JWT.
    Enforces fixed HS256 algorithm, iss, aud, and mandatory claims:
    - sub, user_id, type ('access'), ver, sid, iss, aud, iat, exp
    """
    now = datetime.now(timezone.utc)
    sid = session_id.strip() if session_id else generate_session_id()

    payload = {
        "sub": str(user_id),
        "user_id": int(user_id),
        "type": TOKEN_TYPE_ACCESS,
        "ver": int(token_version),
        "sid": sid,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=expires_in_days)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_and_validate_access_token(
    token: str,
    expected_token_version: Optional[int] = None,
    allow_legacy_no_version: bool = False,
) -> Dict[str, Any]:
    """
    Decodes and validates a standard access token.
    Enforces:
    - Algorithm must strictly be HS256.
    - Issuer must be 'overloader'.
    - Audience must be 'overloader-app'.
    - Mandatory claims presence (sub, user_id, type, ver, iat, exp).
    - type == 'access' (rejects reauth tickets).
    - If expected_token_version is provided: checks token's 'ver' against DB version.
      If allow_legacy_no_version is False, missing 'ver' is rejected.
    """
    # 1. Header validation (strict algorithm check)
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise TokenValidationError(f"Invalid token header: {e}")

    alg = header.get("alg")
    if alg != JWT_ALGORITHM:
        raise TokenAlgorithmMismatchError(
            f"Invalid token algorithm: expected '{JWT_ALGORITHM}', got '{alg}'"
        )

    # 2. Decode with signature, issuer, and audience verification
    try:
        unverified_claims = jwt.get_unverified_claims(token)
        has_aud = "aud" in unverified_claims
        has_iss = "iss" in unverified_claims

        if not has_aud and not allow_legacy_no_version:
            raise TokenClaimMissingError("Token payload missing required 'aud' claim")
        if not has_iss and not allow_legacy_no_version:
            raise TokenClaimMissingError("Token payload missing required 'iss' claim")

        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER if has_iss else None,
            audience=JWT_AUDIENCE if has_aud else None,
        )
    except TokenClaimMissingError:
        raise
    except JWTError as e:
        err_msg = str(e).lower()
        if "expired" in err_msg:
            raise TokenExpiredError("Token has expired")
        raise TokenValidationError(f"Invalid token signature or claims: {e}")

    # 3. Mandatory claims check
    token_type = payload.get("type")
    if token_type is None and allow_legacy_no_version:
        token_type = TOKEN_TYPE_ACCESS

    if token_type != TOKEN_TYPE_ACCESS:
        raise TokenTypeMismatchError(
            f"Expected token type '{TOKEN_TYPE_ACCESS}', but received '{token_type}'"
        )

    user_id = payload.get("user_id")
    if user_id is None:
        raise TokenClaimMissingError("Token payload missing required 'user_id' claim")

    if payload.get("sub") is None and not allow_legacy_no_version:
        raise TokenClaimMissingError("Token payload missing required 'sub' claim")

    # 4. Token version verification
    token_ver = payload.get("ver")
    if token_ver is None:
        if not allow_legacy_no_version:
            raise TokenVersionMismatchError("Legacy token lacking version is not permitted")
    elif expected_token_version is not None:
        if int(token_ver) != int(expected_token_version):
            raise TokenVersionMismatchError(
                f"Token version {token_ver} has been revoked (current active version: {expected_token_version})"
            )

    return payload


# ── 8. Re-auth Ticket Creation & Claims Validation ──────────────────────────────

def create_reauth_ticket(
    user_id: int,
    purpose: str,
    session_id: str,
    token_version: int = 1,
    target_provider: Optional[str] = None,
    expires_in_minutes: int = 5,
) -> Tuple[str, str]:
    """
    Creates a single-use, short-lived re-authentication ticket for sensitive operations.
    Returns a tuple of (ticket_token, jti).
    Claims:
    - sub: str(user_id)
    - user_id: int
    - type: 'reauth'
    - purpose: e.g. 'password_change', 'social_unlink'
    - sid: session_id bound to the browser flow
    - tver: token_version bound to user's current version
    - target_provider: optional (e.g. 'google', 'naver')
    - jti: unique ticket identifier for atomic 1-time consumption
    - iss, aud, iat, exp (default: 5 minutes)
    """
    if purpose not in ALLOWED_REAUTH_PURPOSES:
        raise ValueError(f"Invalid reauth purpose: {purpose}. Must be one of {ALLOWED_REAUTH_PURPOSES}")

    if not session_id or not session_id.strip():
        raise ValueError("session_id is required to bind reauth ticket to the browser flow")

    now = datetime.now(timezone.utc)
    jti = str(uuid.uuid4())
    payload = {
        "sub": str(user_id),
        "user_id": int(user_id),
        "type": TOKEN_TYPE_REAUTH,
        "purpose": purpose,
        "sid": session_id.strip(),
        "tver": int(token_version),
        "target_provider": target_provider,
        "jti": jti,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_in_minutes)).timestamp()),
    }
    ticket = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return ticket, jti


def decode_and_validate_reauth_ticket(
    ticket: str,
    expected_user_id: Optional[int] = None,
    expected_purpose: str = REAUTH_PURPOSE_PASSWORD_CHANGE,
    expected_session_id: Optional[str] = None,
    expected_token_version: Optional[int] = None,
    expected_target_provider: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Decodes and validates a re-authentication ticket.
    Strictly enforces:
    - Algorithm HS256, iss, aud, expiration.
    - type == 'reauth' (access tokens explicitly rejected).
    - user_id == expected_user_id.
    - purpose == expected_purpose.
    - session_id match (sid claim).
    - token_version match (tver claim: invalidates tickets if password was reset in the interim).
    - target_provider match (if expected_target_provider is provided).
    """
    try:
        header = jwt.get_unverified_header(ticket)
    except JWTError as e:
        raise TokenValidationError(f"Invalid ticket header: {e}")

    if header.get("alg") != JWT_ALGORITHM:
        raise TokenAlgorithmMismatchError(
            f"Invalid ticket algorithm: expected '{JWT_ALGORITHM}', got '{header.get('alg')}'"
        )

    try:
        payload = jwt.decode(
            ticket,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
        )
    except JWTError as e:
        err_msg = str(e).lower()
        if "expired" in err_msg:
            raise TokenExpiredError("Reauth ticket has expired")
        raise TokenValidationError(f"Invalid reauth ticket: {e}")

    # 3. Check token type first
    if payload.get("type") != TOKEN_TYPE_REAUTH:
        raise TokenTypeMismatchError(
            f"Expected token type '{TOKEN_TYPE_REAUTH}', but received '{payload.get('type')}'"
        )

    # 4. Mandatory claims check
    required_claims = ["sub", "user_id", "type", "purpose", "sid", "tver", "jti", "iat", "exp"]
    for claim in required_claims:
        if claim not in payload:
            raise TokenClaimMissingError(f"Reauth ticket missing required claim: {claim}")

    if expected_user_id is not None and int(payload.get("user_id")) != int(expected_user_id):
        raise TokenValidationError(
            f"Reauth ticket user mismatch: ticket belongs to {payload.get('user_id')}, expected {expected_user_id}"
        )

    if payload.get("purpose") != expected_purpose:
        raise TokenValidationError(
            f"Reauth ticket purpose mismatch: ticket is for '{payload.get('purpose')}', expected '{expected_purpose}'"
        )

    if expected_session_id is not None:
        ticket_sid = payload.get("sid")
        if ticket_sid != expected_session_id.strip():
            raise TokenValidationError("Reauth ticket session binding mismatch")

    if expected_token_version is not None:
        ticket_tver = payload.get("tver")
        if int(ticket_tver) != int(expected_token_version):
            raise TokenVersionMismatchError(
                f"Reauth ticket token_version {ticket_tver} does not match active version {expected_token_version}"
            )

    if expected_target_provider is not None:
        ticket_provider = payload.get("target_provider")
        if ticket_provider != expected_target_provider:
            raise TokenValidationError(
                f"Reauth ticket target provider mismatch: ticket is for '{ticket_provider}', expected '{expected_target_provider}'"
            )

    return payload
