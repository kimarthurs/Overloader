"""
Overloader Step D Authentication Router (Isolated Blueprint)
Endpoints:
- POST /auth/v2/register
- POST /auth/v2/login
- GET  /auth/v2/me
- POST /auth/v2/reauth/password

Features:
- Timing-attack mitigated login (dummy hash verification on non-existent users)
- Single-transaction user & credential creation with UNIQUE conflict handling
- Immediate connection release via contextmanager
- Fail-closed DB version verification (503 on DB outage, 401 on token version mismatch)
- Reauth ticket issuance with DB single-use tracking
"""

import time
import os
import re
import secrets
from urllib.parse import urlparse, urlencode, quote_plus
from contextlib import contextmanager
from typing import Optional, Dict, Any, List

import httpx
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from fastapi import APIRouter, Depends, HTTPException, Request, Header, status, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field
import psycopg2
from psycopg2 import IntegrityError, OperationalError

try:
    from backend.auth_utils import (
        normalize_and_validate_username,
        validate_display_name,
        validate_optional_email,
        validate_password_for_credential_change,
        hash_password_async,
        verify_password_async,
        verify_dummy_password_async,
        generate_session_id,
        generate_oauth_exchange_code,
        hash_token_or_code,
        create_access_token,
        decode_and_validate_access_token,
        create_reauth_ticket,
        decode_and_validate_reauth_ticket,
        AuthValidationError,
        TokenExpiredError,
        TokenTypeMismatchError,
        TokenVersionMismatchError,
        TokenValidationError,
        ALLOWED_REAUTH_PURPOSES,
        REAUTH_PURPOSE_PASSWORD_ADD,
        REAUTH_PURPOSE_PASSWORD_CHANGE,
        REAUTH_PURPOSE_PASSWORD_RESET,
        REAUTH_PURPOSE_PASSWORD_UNLINK,
        REAUTH_PURPOSE_SOCIAL_UNLINK,
    )
    from backend.auth_store import (
        store_oauth_state,
        consume_oauth_state,
        store_oauth_exchange_code,
        consume_oauth_exchange_code,
        store_reauth_ticket_record,
        consume_reauth_ticket_record,
        TokenAlreadyConsumedError,
        TokenExpiredInStoreError,
        TokenBindingMismatchError,
        TokenNotFoundError,
    )
    from backend.auth_service import (
        get_account_methods_summary,
        add_password_credential,
        change_password_credential,
        reset_password_credential,
        unlink_social_account,
        unlink_password_credential,
        AccountServiceError,
        LastLoginMethodError,
        CredentialAlreadyExistsError,
        CredentialNotFoundError,
        SocialAccountNotFoundError,
        UsernameConflictError,
    )
except ImportError:
    from auth_utils import (
        normalize_and_validate_username,
        validate_display_name,
        validate_optional_email,
        validate_password_for_credential_change,
        hash_password_async,
        verify_password_async,
        verify_dummy_password_async,
        generate_session_id,
        generate_oauth_exchange_code,
        hash_token_or_code,
        create_access_token,
        decode_and_validate_access_token,
        create_reauth_ticket,
        decode_and_validate_reauth_ticket,
        AuthValidationError,
        TokenExpiredError,
        TokenTypeMismatchError,
        TokenVersionMismatchError,
        TokenValidationError,
        ALLOWED_REAUTH_PURPOSES,
        REAUTH_PURPOSE_PASSWORD_ADD,
        REAUTH_PURPOSE_PASSWORD_CHANGE,
        REAUTH_PURPOSE_PASSWORD_RESET,
        REAUTH_PURPOSE_PASSWORD_UNLINK,
        REAUTH_PURPOSE_SOCIAL_UNLINK,
    )
    from auth_store import (
        store_oauth_state,
        consume_oauth_state,
        store_oauth_exchange_code,
        consume_oauth_exchange_code,
        store_reauth_ticket_record,
        consume_reauth_ticket_record,
        TokenAlreadyConsumedError,
        TokenExpiredInStoreError,
        TokenBindingMismatchError,
        TokenNotFoundError,
    )
    from auth_service import (
        get_account_methods_summary,
        add_password_credential,
        change_password_credential,
        reset_password_credential,
        unlink_social_account,
        unlink_password_credential,
        AccountServiceError,
        LastLoginMethodError,
        CredentialAlreadyExistsError,
        CredentialNotFoundError,
        SocialAccountNotFoundError,
        UsernameConflictError,
    )

# ── 1. In-Memory Request Rate Limiter (No Redis Dependency) ──────────────────────

class SimpleRateLimiter:
    """Sliding-window request rate limiter per key (e.g. IP or user_id)."""
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.records: Dict[str, list] = {}

    def check(self, key: str) -> bool:
        now = time.time()
        cutoff = now - self.window_seconds
        timestamps = self.records.get(key, [])
        # Filter timestamps within current window
        valid_timestamps = [t for t in timestamps if t > cutoff]
        if len(valid_timestamps) >= self.max_requests:
            self.records[key] = valid_timestamps
            return False
        valid_timestamps.append(now)
        self.records[key] = valid_timestamps
        return True


register_limiter = SimpleRateLimiter(max_requests=10, window_seconds=60)
login_limiter = SimpleRateLimiter(max_requests=15, window_seconds=60)
reauth_limiter = SimpleRateLimiter(max_requests=10, window_seconds=60)
account_limiter = SimpleRateLimiter(max_requests=10, window_seconds=60)


# ── 2. Request / Response Pydantic Schemas ───────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    password: str
    name: str
    email: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class ReauthPasswordRequest(BaseModel):
    password: str
    purpose: str
    target_provider: Optional[str] = None


class PasswordAddRequest(BaseModel):
    username: str
    password: str
    reauth_ticket: str


class PasswordChangeRequest(BaseModel):
    new_password: str
    reauth_ticket: str


class SocialUnlinkRequest(BaseModel):
    provider: str
    reauth_ticket: str


class PasswordUnlinkRequest(BaseModel):
    reauth_ticket: str


class OAuthExchangeRequest(BaseModel):
    exchange_code: str
    session_id: Optional[str] = None


class OAuthAuthorizeUrlRequest(BaseModel):
    purpose: str = Field(default="link")
    target_purpose: Optional[str] = None
    redirect_uri: Optional[str] = None
    session_id: Optional[str] = None


class PasswordResetRequest(BaseModel):
    reauth_ticket: str
    new_password: str
    username: Optional[str] = None
    session_id: Optional[str] = None


ALLOWED_REDIRECT_ORIGINS = {
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "http://localhost:3001",
    "https://app.overloader.cloud",
    "https://overloader.vercel.app",
}


def is_safe_redirect_uri(uri: str) -> bool:
    """Verifies that redirect_uri belongs to an allowed origin (preventing open redirect vulnerabilities)."""
    try:
        parsed = urlparse(uri)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        allowed = set(ALLOWED_REDIRECT_ORIGINS)
        env_frontend = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
        if env_frontend:
            try:
                env_parsed = urlparse(env_frontend)
                if env_parsed.scheme in ("http", "https") and env_parsed.netloc:
                    allowed.add(f"{env_parsed.scheme}://{env_parsed.netloc}")
            except Exception:
                pass
        return origin in allowed
    except Exception:
        return False


def get_default_frontend_url(purpose: str = "login") -> str:
    """
    Returns the safe default frontend URL.
    Prefers FRONTEND_URL environment variable if set and safe.
    Defaults to http://127.0.0.1:3000 for local development.
    Appends query parameters (?tab=settings) for link or reauth purposes.
    """
    env_frontend = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    base = env_frontend if (env_frontend and is_safe_redirect_uri(env_frontend)) else "http://127.0.0.1:3000"
    norm_purpose = (purpose or "login").strip().lower().split(":")[0]
    if norm_purpose in ("link", "reauth"):
        sep = "&" if "?" in base else "?"
        return f"{base}{sep}tab=settings"
    return base


def resolve_target_redirect(redirect_uri: Optional[str], purpose: str = "login") -> str:
    """
    Resolves a safe target redirect URL:
    1. If redirect_uri is provided and belongs to ALLOWED_REDIRECT_ORIGINS, uses it.
    2. Otherwise, securely falls back to get_default_frontend_url(purpose), preventing open redirects.
    """
    if redirect_uri:
        stripped = redirect_uri.strip()
        if is_safe_redirect_uri(stripped):
            return stripped
    return get_default_frontend_url(purpose)


# ── 3. Router Factory & Dependency Injection ─────────────────────────────────────

def create_auth_router(get_connection_func, release_connection_func=None) -> APIRouter:
    """
    Factory creating the Step D auth router.
    Accepts get_connection_func and optional release_connection_func (e.g. for connection pool putconn).
    """
    router = APIRouter(prefix="/auth/v2", tags=["auth_v2"])

    @contextmanager
    def db_session():
        """Contextmanager guaranteeing immediate connection release."""
        conn = None
        try:
            conn = get_connection_func()
            yield conn
        except (OperationalError, psycopg2.Error) as e:
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass
            # Distinguish DB operational errors as 503 Service Unavailable
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database service temporarily unavailable"
            )
        finally:
            if conn:
                try:
                    if release_connection_func is not None:
                        release_connection_func(conn)
                    elif hasattr(conn, "close"):
                        conn.close()
                except Exception:
                    pass

    async def get_current_user_v2(
        authorization: Optional[str] = Header(None)
    ) -> Dict[str, Any]:
        """
        Dependency validating access token and active token_version in DB.
        Fail-closed: Returns 503 on DB error, 401 on invalid/revoked session.
        """
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or malformed Authorization header"
            )

        token = authorization[7:].strip()
        try:
            # Step 1: Decode token claims
            claims = decode_and_validate_access_token(token, allow_legacy_no_version=False)
        except TokenExpiredError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="로그인이 만료되었어요. 다시 로그인해 주세요."
            )
        except TokenVersionMismatchError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="비밀번호가 변경되어 세션이 만료되었습니다. 다시 로그인해 주세요."
            )
        except TokenValidationError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"인증 토큰이 유효하지 않습니다: {e}"
            )

        user_id = claims["user_id"]
        token_ver = claims.get("ver")

        # Step 2: Immediate DB version verification
        with db_session() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, name, token_version FROM users WHERE id = %s", (user_id,))
                user_row = cur.fetchone()
                if not user_row:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="사용자 계정을 찾을 수 없습니다."
                    )
                _id, name, db_ver = user_row
                if db_ver is None:
                    db_ver = 1
                if int(token_ver) != int(db_ver):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="세션이 만료되었습니다. 다시 로그인해 주세요."
                    )

        return {
            "user_id": user_id,
            "name": name,
            "token_version": db_ver,
            "session_id": claims.get("sid", ""),
        }

    # ── Endpoints ───────────────────────────────────────────────────────────────

    @router.post("/register", status_code=status.HTTP_201_CREATED)
    async def register(req: RegisterRequest, request: Request):
        client_ip = request.client.host if request.client else "unknown"
        if not register_limiter.check(client_ip):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="회원가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
            )

        # 1. Validation
        try:
            valid_username = normalize_and_validate_username(req.username)
            valid_name = validate_display_name(req.name)
            valid_email = validate_optional_email(req.email)
            validate_password_for_credential_change(req.password)
        except AuthValidationError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        # 2. Argon2id async hashing (non-blocking)
        hashed_password = await hash_password_async(req.password)

        # 3. Atomic single-transaction insert
        with db_session() as conn:
            with conn.cursor() as cur:
                # Early check for username collision
                cur.execute("SELECT 1 FROM password_credentials WHERE username = %s", (valid_username,))
                if cur.fetchone():
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="이미 사용 중인 아이디입니다."
                    )

                try:
                    # Insert user with initial token_version = 1 and optional contact email
                    cur.execute("""
                        INSERT INTO users (name, email, email_verified, token_version)
                        VALUES (%s, %s, false, 1)
                        RETURNING id
                    """, (valid_name, valid_email))
                    user_id = cur.fetchone()[0]

                    # Insert credential
                    cur.execute("""
                        INSERT INTO password_credentials (user_id, username, password_hash)
                        VALUES (%s, %s, %s)
                    """, (user_id, valid_username, hashed_password))

                    conn.commit()
                except IntegrityError:
                    conn.rollback()
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="이미 사용 중인 아이디입니다."
                    )

        # 4. Issue access token
        session_id = generate_session_id()
        token = create_access_token(user_id=user_id, token_version=1, session_id=session_id)

        user_dict = {
            "id": user_id,
            "user_id": user_id,
            "name": valid_name,
            "username": valid_username,
            "token_version": 1,
        }
        return {
            "token": token,
            "user": user_dict,
            **user_dict,
        }

    @router.post("/login")
    async def login(req: LoginRequest, request: Request):
        client_ip = request.client.host if request.client else "unknown"
        if not login_limiter.check(client_ip):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="로그인 시도 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요."
            )

        try:
            normalized_username = normalize_and_validate_username(req.username)
        except AuthValidationError:
            # Mitigate timing discrepancy even on malformed username input
            await verify_dummy_password_async()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="아이디 또는 비밀번호가 올바르지 않습니다."
            )

        user_record = None
        with db_session() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT p.user_id, p.password_hash, u.name, COALESCE(u.token_version, 1)
                    FROM password_credentials p
                    JOIN users u ON p.user_id = u.id
                    WHERE p.username = %s
                """, (normalized_username,))
                user_record = cur.fetchone()

        # Constant-time failure response if user does not exist
        if not user_record:
            await verify_dummy_password_async()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="아이디 또는 비밀번호가 올바르지 않습니다."
            )

        user_id, stored_hash, display_name, token_ver = user_record

        # Async Argon2id password verification
        is_valid = await verify_password_async(stored_hash, req.password)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="아이디 또는 비밀번호가 올바르지 않습니다."
            )

        session_id = generate_session_id()
        token = create_access_token(user_id=user_id, token_version=token_ver, session_id=session_id)

        user_dict = {
            "id": user_id,
            "user_id": user_id,
            "name": display_name,
            "username": normalized_username,
            "token_version": token_ver,
        }
        return {
            "token": token,
            "user": user_dict,
            **user_dict,
        }

    @router.get("/me")
    async def get_me(current_user: Dict[str, Any] = Depends(get_current_user_v2)):
        with db_session() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT p.username
                    FROM password_credentials p
                    WHERE p.user_id = %s
                """, (current_user["user_id"],))
                row = cur.fetchone()
                username = row[0] if row else None

        user_dict = {
            "id": current_user["user_id"],
            "user_id": current_user["user_id"],
            "name": current_user["name"],
            "username": username,
            "token_version": current_user["token_version"],
        }
        return {
            **user_dict,
            "user": user_dict,
        }

    @router.post("/reauth/password")
    async def reauth_password(
        req: ReauthPasswordRequest,
        request: Request,
        current_user: Dict[str, Any] = Depends(get_current_user_v2)
    ):
        user_key = f"user_{current_user['user_id']}"
        if not reauth_limiter.check(user_key):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="재인증 시도 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요."
            )

        if req.purpose not in ALLOWED_REAUTH_PURPOSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"허용되지 않은 재인증 목적입니다: {req.purpose}"
            )

        user_id = current_user["user_id"]
        token_ver = current_user["token_version"]
        session_id = current_user.get("session_id") or generate_session_id()

        with db_session() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT password_hash FROM password_credentials WHERE user_id = %s", (user_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="비밀번호가 설정되어 있지 않은 계정입니다. 소셜 재인증을 사용해 주세요."
                    )
                password_hash = row[0]

        is_valid = await verify_password_async(password_hash, req.password)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="현재 비밀번호가 일치하지 않습니다."
            )

        target_prov = req.target_provider.strip().lower() if req.target_provider else None
        if req.purpose == REAUTH_PURPOSE_SOCIAL_UNLINK:
            if not target_prov or target_prov not in ("google", "naver"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="소셜 연동 해제를 위해 유효한 대상 제공자(target_provider: 'google' 또는 'naver')가 필요합니다."
                )

        # Generate ticket & record in DB single-use store
        ticket, jti = create_reauth_ticket(
            user_id=user_id,
            purpose=req.purpose,
            session_id=session_id,
            token_version=token_ver,
            target_provider=target_prov,
            expires_in_minutes=5,
        )

        with db_session() as conn:
            with conn.cursor() as cur:
                store_reauth_ticket_record(
                    cur=cur,
                    ticket_jti=jti,
                    user_id=user_id,
                    session_id=session_id,
                    purpose=req.purpose,
                    token_version=token_ver,
                    target_provider=target_prov,
                    ttl_minutes=5,
                )
                conn.commit()

        return {
            "reauth_ticket": ticket,
            "expires_in": 300,
        }

    # ── Account Management Endpoints (Step D) ───────────────────────────────────

    @router.get("/account/methods")
    async def get_account_methods(current_user: Dict[str, Any] = Depends(get_current_user_v2)):
        """Retrieves all registered login methods and unlinkability flags for the current user."""
        with db_session() as conn:
            with conn.cursor() as cur:
                return get_account_methods_summary(cur, current_user["user_id"])

    @router.post("/account/password/add")
    async def add_password(
        req: PasswordAddRequest,
        request: Request,
        current_user: Dict[str, Any] = Depends(get_current_user_v2)
    ):
        """Allows social-only users to add username/password to their existing account."""
        user_key = f"user_{current_user['user_id']}"
        if not account_limiter.check(user_key):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
            )

        # 1. Validation
        try:
            valid_username = normalize_and_validate_username(req.username)
            validate_password_for_credential_change(req.password)
        except AuthValidationError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        user_id = current_user["user_id"]
        session_id = current_user.get("session_id", "")
        token_ver = current_user["token_version"]

        # 2. Re-auth Ticket Verification
        try:
            ticket_claims = decode_and_validate_reauth_ticket(
                ticket=req.reauth_ticket,
                expected_user_id=user_id,
                expected_purpose=REAUTH_PURPOSE_PASSWORD_ADD,
                expected_session_id=session_id if session_id else None,
                expected_token_version=token_ver,
            )
        except TokenValidationError as e:
            err_str = str(e)
            if "purpose mismatch" in err_str:
                korean_detail = "아이디/비밀번호 등록을 위한 재인증 티켓이 아닙니다."
            elif "session binding mismatch" in err_str:
                korean_detail = "세션 정보가 일치하지 않는 재인증 티켓입니다."
            elif "token_version" in err_str or "expired" in err_str.lower():
                korean_detail = "만료되었거나 이미 사용된 재인증 티켓입니다."
            else:
                korean_detail = "유효하지 않은 본인 재인증 티켓입니다. 다시 인증해 주세요."
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=korean_detail)

        jti = ticket_claims["jti"]
        hashed_password = await hash_password_async(req.password)

        # 3. Single-transaction atomic consumption & insert via shared service
        with db_session() as conn:
            with conn.cursor() as cur:
                try:
                    add_password_credential(
                        cur=cur,
                        user_id=user_id,
                        username=valid_username,
                        password_hash=hashed_password,
                        ticket_jti=jti,
                        session_id=session_id,
                        token_version=token_ver,
                    )
                    conn.commit()
                except CredentialAlreadyExistsError as e:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
                except UsernameConflictError as e:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
                except (TokenAlreadyConsumedError, TokenExpiredInStoreError, TokenBindingMismatchError, TokenNotFoundError) as e:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"재인증 티켓 사용 불가: {e}")

        return {"success": True, "message": "아이디와 비밀번호가 성공적으로 등록되었습니다."}

    @router.post("/account/password/change")
    async def change_password(
        req: PasswordChangeRequest,
        request: Request,
        current_user: Dict[str, Any] = Depends(get_current_user_v2)
    ):
        """Changes password for account, bumping token_version and issuing fresh JWT."""
        user_key = f"user_{current_user['user_id']}"
        if not account_limiter.check(user_key):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
            )

        try:
            validate_password_for_credential_change(req.new_password)
        except AuthValidationError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        user_id = current_user["user_id"]
        session_id = current_user.get("session_id", "")
        token_ver = current_user["token_version"]

        try:
            ticket_claims = decode_and_validate_reauth_ticket(
                ticket=req.reauth_ticket,
                expected_user_id=user_id,
                expected_purpose=REAUTH_PURPOSE_PASSWORD_CHANGE,
                expected_session_id=session_id if session_id else None,
                expected_token_version=token_ver,
            )
        except TokenValidationError as e:
            err_str = str(e)
            if "purpose mismatch" in err_str:
                korean_detail = "비밀번호 변경을 위한 재인증 티켓이 아닙니다."
            elif "session binding mismatch" in err_str:
                korean_detail = "세션 정보가 일치하지 않는 재인증 티켓입니다."
            elif "token_version" in err_str or "expired" in err_str.lower():
                korean_detail = "만료되었거나 이미 사용된 재인증 티켓입니다."
            else:
                korean_detail = "유효하지 않은 본인 재인증 티켓입니다. 다시 인증해 주세요."
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=korean_detail)

        jti = ticket_claims["jti"]
        hashed_password = await hash_password_async(req.new_password)

        with db_session() as conn:
            with conn.cursor() as cur:
                try:
                    new_token_ver = change_password_credential(
                        cur=cur,
                        user_id=user_id,
                        new_password_hash=hashed_password,
                        ticket_jti=jti,
                        session_id=session_id,
                        token_version=token_ver,
                    )
                    conn.commit()
                except CredentialNotFoundError as e:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
                except (TokenAlreadyConsumedError, TokenExpiredInStoreError, TokenBindingMismatchError, TokenNotFoundError) as e:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"재인증 티켓 사용 불가: {e}")

        # Issue fresh JWT with new token_version (all prior sessions invalidated)
        new_token = create_access_token(
            user_id=user_id,
            token_version=new_token_ver,
            session_id=session_id,
        )

        return {
            "success": True,
            "token": new_token,
            "new_token_version": new_token_ver,
            "message": "비밀번호가 성공적으로 변경되었습니다."
        }

    @router.post("/account/social/unlink")
    async def unlink_social(
        req: SocialUnlinkRequest,
        request: Request,
        current_user: Dict[str, Any] = Depends(get_current_user_v2)
    ):
        """Unlinks a social provider account with strict Last Method Protection."""
        user_key = f"user_{current_user['user_id']}"
        if not account_limiter.check(user_key):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
            )

        provider = req.provider.strip().lower()
        if provider not in ("google", "naver"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"지원되지 않는 소셜 제공자입니다: {req.provider}"
            )

        user_id = current_user["user_id"]
        session_id = current_user.get("session_id", "")
        token_ver = current_user["token_version"]

        try:
            ticket_claims = decode_and_validate_reauth_ticket(
                ticket=req.reauth_ticket,
                expected_user_id=user_id,
                expected_purpose=REAUTH_PURPOSE_SOCIAL_UNLINK,
                expected_session_id=session_id if session_id else None,
                expected_token_version=token_ver,
                expected_target_provider=provider,
            )
        except TokenValidationError as e:
            err_str = str(e)
            if "target provider mismatch" in err_str:
                korean_detail = "해제 대상 소셜 계정과 일치하지 않는 재인증 티켓입니다."
            elif "purpose mismatch" in err_str:
                korean_detail = "소셜 연동 해제를 위한 재인증 티켓이 아닙니다."
            elif "session binding mismatch" in err_str:
                korean_detail = "세션 정보가 일치하지 않는 재인증 티켓입니다."
            elif "token_version" in err_str or "expired" in err_str.lower():
                korean_detail = "만료되었거나 이미 사용된 재인증 티켓입니다."
            else:
                korean_detail = "유효하지 않은 본인 재인증 티켓입니다. 다시 인증해 주세요."
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=korean_detail)

        jti = ticket_claims["jti"]

        with db_session() as conn:
            with conn.cursor() as cur:
                try:
                    unlink_social_account(
                        cur=cur,
                        user_id=user_id,
                        provider=provider,
                        ticket_jti=jti,
                        session_id=session_id,
                        token_version=token_ver,
                    )
                    conn.commit()
                except SocialAccountNotFoundError as e:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
                except LastLoginMethodError as e:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
                except (TokenAlreadyConsumedError, TokenExpiredInStoreError, TokenBindingMismatchError, TokenNotFoundError) as e:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"재인증 티켓 사용 불가: {e}")

        return {"success": True, "message": f"{provider} 계정 연동이 해제되었습니다."}

    @router.post("/account/password/unlink")
    async def unlink_password(
        req: PasswordUnlinkRequest,
        request: Request,
        current_user: Dict[str, Any] = Depends(get_current_user_v2)
    ):
        """Removes username/password credential with strict Last Method Protection."""
        user_key = f"user_{current_user['user_id']}"
        if not account_limiter.check(user_key):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
            )

        user_id = current_user["user_id"]
        session_id = current_user.get("session_id", "")
        token_ver = current_user["token_version"]

        try:
            ticket_claims = decode_and_validate_reauth_ticket(
                ticket=req.reauth_ticket,
                expected_user_id=user_id,
                expected_purpose=REAUTH_PURPOSE_PASSWORD_UNLINK,
                expected_session_id=session_id if session_id else None,
                expected_token_version=token_ver,
            )
        except TokenValidationError as e:
            err_str = str(e)
            if "purpose mismatch" in err_str:
                korean_detail = "아이디/비밀번호 해제를 위한 재인증 티켓이 아닙니다."
            elif "session binding mismatch" in err_str:
                korean_detail = "세션 정보가 일치하지 않는 재인증 티켓입니다."
            elif "token_version" in err_str or "expired" in err_str.lower():
                korean_detail = "만료되었거나 이미 사용된 재인증 티켓입니다."
            else:
                korean_detail = "유효하지 않은 본인 재인증 티켓입니다. 다시 인증해 주세요."
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=korean_detail)

        jti = ticket_claims["jti"]

        with db_session() as conn:
            with conn.cursor() as cur:
                try:
                    new_token_ver = unlink_password_credential(
                        cur=cur,
                        user_id=user_id,
                        ticket_jti=jti,
                        session_id=session_id,
                        token_version=token_ver,
                    )
                    conn.commit()
                except CredentialNotFoundError as e:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
                except LastLoginMethodError as e:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
                except (TokenAlreadyConsumedError, TokenExpiredInStoreError, TokenBindingMismatchError, TokenNotFoundError) as e:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"재인증 티켓 사용 불가: {e}")

        new_token = create_access_token(
            user_id=user_id,
            token_version=new_token_ver,
            session_id=session_id,
        )

        return {
            "success": True,
            "token": new_token,
            "new_token_version": new_token_ver,
            "message": "아이디/비밀번호 로그인 수단이 해제되었습니다."
        }

    # ── OAuth & Exchange & Password Reset Endpoints ─────────────────────────────

    @router.post("/oauth/exchange")
    async def exchange_oauth_code(req: OAuthExchangeRequest, request: Request):
        """
        Exchanges short-lived opaque OAuth code for an access JWT in response body.
        Code is atomically consumed with 1-time limit and 60-second TTL.
        """
        code = req.exchange_code.strip()
        session_id = (req.session_id or "").strip()
        if not code:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="교환 코드가 필요합니다.")

        with db_session() as conn:
            with conn.cursor() as cur:
                try:
                    user_id = consume_oauth_exchange_code(
                        cur=cur,
                        code_secret=code,
                        expected_session_id=session_id,
                    )
                except TokenNotFoundError:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="유효하지 않은 교환 코드입니다.")
                except TokenAlreadyConsumedError:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 사용된 교환 코드입니다.")
                except TokenExpiredInStoreError:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="만료된 교환 코드입니다. 다시 로그인해 주세요.")
                except TokenBindingMismatchError:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="세션 바인딩이 일치하지 않습니다.")

                # Fetch user details
                cur.execute("SELECT id, name, token_version FROM users WHERE id = %s", (user_id,))
                user_row = cur.fetchone()
                if not user_row:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자 정보를 찾을 수 없습니다.")

                cur.execute("SELECT username FROM password_credentials WHERE user_id = %s", (user_id,))
                pwd_row = cur.fetchone()
                username = pwd_row[0] if pwd_row else None

                conn.commit()

        u_id, u_name, u_ver = user_row
        access_token = create_access_token(
            user_id=u_id,
            token_version=u_ver,
            session_id=session_id,
        )

        user_dict = {
            "id": u_id,
            "user_id": u_id,
            "name": u_name,
            "username": username,
            "token_version": u_ver,
        }
        return {
            "token": access_token,
            "user": user_dict,
            **user_dict,
        }

    @router.post("/oauth/{provider}/authorize-url")
    async def get_oauth_authorize_url(
        provider: str,
        req: OAuthAuthorizeUrlRequest,
        current_user: Dict[str, Any] = Depends(get_current_user_v2),
    ):
        """
        Creates an authenticated provider OAuth redirect URL for logged-in user operations (link / reauth).
        Guarantees JWT is NEVER exposed in URL query parameters, state, or Referer.
        Enforces user ownership, safe redirect origin, single-use state generation, and provider whitelist.
        """
        provider = provider.strip().lower()
        if provider not in ("google", "naver"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"지원하지 않는 제공자입니다: {provider}")

        purpose = req.purpose.strip().lower()
        if purpose not in ("link", "reauth"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"지원하지 않는 목적입니다: {purpose}")

        target_redirect = resolve_target_redirect(req.redirect_uri, purpose=purpose)

        bound_user_id = current_user["user_id"]
        sid = (req.session_id or current_user.get("session_id") or "").strip()
        if not sid:
            sid = generate_session_id()

        # If reauth, verify this user actually has this provider linked in social_accounts
        if purpose == "reauth":
            with db_session() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT 1 FROM social_accounts
                        WHERE user_id = %s AND provider = %s
                    """, (bound_user_id, provider))
                    if not cur.fetchone():
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"현재 계정에 {provider.capitalize()} 소셜 연동이 존재하지 않아 본인 인증을 진행할 수 없습니다."
                        )

        full_purpose = f"reauth:{req.target_purpose}" if (purpose == "reauth" and req.target_purpose) else purpose
        state_secret = secrets.token_urlsafe(32)
        with db_session() as conn:
            with conn.cursor() as cur:
                store_oauth_state(
                    cur=cur,
                    state_secret=state_secret,
                    session_id=sid,
                    purpose=full_purpose,
                    user_id=bound_user_id,
                    target_provider=provider,
                    ttl_seconds=600,
                )
                conn.commit()

        env_name = os.getenv("ENV", os.getenv("APP_ENV", "development")).lower()
        is_prod = env_name in ("production", "prod") or (os.getenv("VERCEL") is not None)
        allow_mock = (os.getenv("USE_MOCK_OAUTH", "false").lower() in ("true", "1")) and not is_prod

        if allow_mock and (os.getenv("USE_MOCK_OAUTH", "false").lower() in ("true", "1")):
            mock_url = (
                f"/auth/v2/oauth/{provider}/mock-consent?"
                f"state={state_secret}&session_id={sid}&purpose={purpose}&redirect_uri={target_redirect}"
            )
            if req.target_purpose:
                mock_url += f"&target_purpose={req.target_purpose}"
            return {"authorization_url": mock_url, "provider": provider, "purpose": purpose}

        if provider == "google":
            client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
            if not client_id:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="GOOGLE_CLIENT_ID 환경변수가 설정되지 않았습니다."
                )
            google_callback = os.getenv("GOOGLE_CALLBACK_URL", "http://127.0.0.1:8000/auth/v2/oauth/google/callback").strip()
            expected_nonce = hash_token_or_code(f"google_nonce:{state_secret}")[:32]
            auth_params = {
                "response_type": "code",
                "client_id": client_id,
                "redirect_uri": google_callback,
                "scope": "openid email profile",
                "state": state_secret,
                "nonce": expected_nonce,
                "prompt": "select_account",
            }
            auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(auth_params)}"
            return {"authorization_url": auth_url, "provider": provider, "purpose": purpose}

        elif provider == "naver":
            client_id = os.getenv("NAVER_CLIENT_ID", "").strip()
            if not client_id:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="NAVER_CLIENT_ID 환경변수가 설정되지 않았습니다."
                )
            naver_callback = os.getenv("NAVER_CALLBACK_URL", "http://127.0.0.1:8000/auth/v2/oauth/naver/callback")
            auth_params = {
                "response_type": "code",
                "client_id": client_id,
                "redirect_uri": naver_callback,
                "state": state_secret,
            }
            if purpose == "reauth":
                auth_params["auth_type"] = "reauthenticate"
            auth_url = f"https://nid.naver.com/oauth2.0/authorize?{urlencode(auth_params)}"
            return {"authorization_url": auth_url, "provider": provider, "purpose": purpose}

    @router.get("/oauth/{provider}/authorize")
    async def oauth_authorize(
        provider: str,
        purpose: str = Query("login"),
        redirect_uri: Optional[str] = Query(None),
        session_id: Optional[str] = Query(None),
        auth_token: Optional[str] = Query(None),
        target_purpose: Optional[str] = Query(None),
        mock: bool = Query(False),
    ):
        """
        Initiates OAuth flow (Google / Naver).
        Supports login, link, and reauth purposes.
        Defaults to mock provider when running in local development mode.
        """
        provider = provider.strip().lower()
        if provider not in ("google", "naver"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"지원하지 않는 제공자입니다: {provider}")

        purpose = purpose.strip().lower()
        if purpose not in ("login", "link", "reauth"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"지원하지 않는 목적입니다: {purpose}")

        target_redirect = resolve_target_redirect(redirect_uri, purpose=purpose)

        sid = (session_id or "").strip()
        if not sid:
            sid = generate_session_id()

        bound_user_id = None
        if purpose == "link":
            if not auth_token:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="연동을 위해 로그인이 필요합니다.")
            try:
                claims = decode_and_validate_access_token(auth_token, allow_legacy_no_version=True)
                bound_user_id = claims["user_id"]
            except Exception as e:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"인증 토큰 유효성 검증 실패: {e}")
        elif purpose == "reauth":
            if auth_token:
                try:
                    claims = decode_and_validate_access_token(auth_token, allow_legacy_no_version=True)
                    bound_user_id = claims["user_id"]
                except Exception as e:
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"인증 토큰 유효성 검증 실패: {e}")
            elif target_purpose != "password_reset":
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="재인증을 위해 로그인이 필요합니다.")

        full_purpose = f"reauth:{target_purpose}" if (purpose == "reauth" and target_purpose) else purpose
        state_secret = secrets.token_urlsafe(32)
        with db_session() as conn:
            with conn.cursor() as cur:
                store_oauth_state(
                    cur=cur,
                    state_secret=state_secret,
                    session_id=sid,
                    purpose=full_purpose,
                    user_id=bound_user_id,
                    target_provider=provider,
                    ttl_seconds=600,
                )
                conn.commit()

        env_name = os.getenv("ENV", os.getenv("APP_ENV", "development")).lower()
        is_prod = env_name in ("production", "prod") or (os.getenv("VERCEL") is not None)
        allow_mock = (os.getenv("USE_MOCK_OAUTH", "false").lower() in ("true", "1")) and not is_prod

        if mock and not allow_mock:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="운영 환경 또는 모의 인증 비활성화 상태에서는 mock 파라미터를 사용할 수 없습니다."
            )

        use_mock = allow_mock and (mock or os.getenv("USE_MOCK_OAUTH", "false").lower() in ("true", "1"))
        if use_mock:
            mock_url = (
                f"/auth/v2/oauth/{provider}/mock-consent?"
                f"state={state_secret}&session_id={sid}&purpose={purpose}&redirect_uri={target_redirect}"
            )
            if target_purpose:
                mock_url += f"&target_purpose={target_purpose}"
            return RedirectResponse(url=mock_url)

        if provider == "google":
            client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
            if not client_id:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="GOOGLE_CLIENT_ID 환경변수가 설정되지 않았습니다."
                )
            google_callback = os.getenv("GOOGLE_CALLBACK_URL", "http://127.0.0.1:8000/auth/v2/oauth/google/callback").strip()
            expected_nonce = hash_token_or_code(f"google_nonce:{state_secret}")[:32]
            auth_params = {
                "response_type": "code",
                "client_id": client_id,
                "redirect_uri": google_callback,
                "scope": "openid email profile",
                "state": state_secret,
                "nonce": expected_nonce,
                "prompt": "select_account",
            }
            auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(auth_params)}"
            return RedirectResponse(url=auth_url)
        elif provider == "naver":
            client_id = os.getenv("NAVER_CLIENT_ID", "").strip()
            if not client_id:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="NAVER_CLIENT_ID 환경변수가 설정되지 않았습니다."
                )
            naver_callback = os.getenv("NAVER_CALLBACK_URL", "http://127.0.0.1:8000/auth/v2/oauth/naver/callback")
            auth_params = {
                "response_type": "code",
                "client_id": client_id,
                "redirect_uri": naver_callback,
                "state": state_secret,
            }
            if purpose == "reauth":
                auth_params["auth_type"] = "reauthenticate"
            auth_url = f"https://nid.naver.com/oauth2.0/authorize?{urlencode(auth_params)}"
            return RedirectResponse(url=auth_url)

    @router.get("/oauth/{provider}/mock-consent", response_class=HTMLResponse)
    async def oauth_mock_consent(
        provider: str,
        state: str = Query(...),
        session_id: str = Query(...),
        purpose: str = Query("login"),
        redirect_uri: str = Query("http://127.0.0.1:3000"),
        target_purpose: Optional[str] = Query(None),
    ):
        """Mock OAuth consent screen for local isolated browser verification."""
        prov_title = provider.capitalize()
        default_uid = f"mock_{provider}_{secrets.token_hex(4)}"
        default_email = f"{provider}_user@example.com"
        default_name = f"{prov_title} 사용자"

        target_input = f'<input type="hidden" name="target_purpose" value="{target_purpose}" />' if target_purpose else ''

        html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>Overloader Mock OAuth - {prov_title}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f12; color: #f3f4f6; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }}
    .card {{ background: #18181f; border: 1px solid #282834; border-radius: 16px; padding: 28px; width: 360px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }}
    h2 {{ margin-top: 0; color: #f97316; font-size: 20px; }}
    .desc {{ font-size: 13px; color: #9ca3af; margin-bottom: 20px; line-height: 1.5; }}
    label {{ display: block; font-size: 12px; color: #9ca3af; margin-bottom: 4px; font-weight: 600; }}
    input {{ width: 100%; box-sizing: border-box; background: #121217; border: 1px solid #282834; border-radius: 8px; color: #f3f4f6; padding: 10px; margin-bottom: 14px; font-size: 14px; }}
    .btn {{ width: 100%; background: #f97316; color: white; border: none; border-radius: 9999px; padding: 12px; font-size: 14px; font-weight: 700; cursor: pointer; }}
    .btn:hover {{ background: #ea580c; }}
    .badge {{ display: inline-block; background: rgba(249,115,22,0.15); color: #f97316; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; margin-bottom: 12px; }}
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">로컬 모의 OAuth 테스트 ({prov_title})</span>
    <h2>{prov_title} 계정 인증</h2>
    <div class="desc">로컬 환경에서 외부 네트워크 호출 없이 안전하게 {purpose} 흐름을 검증합니다.</div>
    <form action="/auth/v2/oauth/{provider}/callback" method="GET">
      <input type="hidden" name="state" value="{state}" />
      <input type="hidden" name="redirect_uri" value="{redirect_uri}" />
      <input type="hidden" name="mock_code" value="mock_code_{secrets.token_urlsafe(16)}" />
      {target_input}
      
      <label>소셜 고유 ID (provider_user_id)</label>
      <input type="text" name="mock_uid" value="{default_uid}" required />

      <label>이메일 (선택)</label>
      <input type="email" name="mock_email" value="{default_email}" />

      <label>닉네임</label>
      <input type="text" name="mock_name" value="{default_name}" required />

      <button type="submit" class="btn">동의하고 계속하기 ({purpose})</button>
    </form>
  </div>
</body>
</html>"""
        return HTMLResponse(content=html)

    @router.get("/oauth/{provider}/callback")
    async def oauth_callback(
        provider: str,
        state: Optional[str] = Query(None),
        code: Optional[str] = Query(None),
        redirect_uri: Optional[str] = Query(None),
        error: Optional[str] = Query(None),
        error_description: Optional[str] = Query(None),
        mock_uid: Optional[str] = Query(None),
        mock_email: Optional[str] = Query(None),
        mock_name: Optional[str] = Query(None),
        mock_code: Optional[str] = Query(None),
        target_purpose: Optional[str] = Query(None),
    ):
        """
        Handles OAuth callback.
        Verifies state single-use token, exchanges code for real tokens/profile (or mock in local dev),
        handles login/link/reauth, and redirects to frontend.
        """
        provider = provider.strip().lower()
        target_redirect = resolve_target_redirect(redirect_uri, purpose="login")

        # Strict production guard: forbid mock parameters in production or when mock disabled
        env_name = os.getenv("ENV", os.getenv("APP_ENV", "development")).lower()
        is_prod = env_name in ("production", "prod") or (os.getenv("VERCEL") is not None)
        allow_mock = (os.getenv("USE_MOCK_OAUTH", "false").lower() in ("true", "1")) and not is_prod

        if (mock_uid or mock_code) and not allow_mock:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="운영 환경 또는 모의 인증 비활성화 상태에서는 모의 인증 파라미터를 사용할 수 없습니다."
            )

        sep = "&" if "?" in target_redirect else "?"

        if error:
            raw_err = error_description or error
            safe_err = quote_plus(re.sub(r"[^\w\-_.: ]", "", str(raw_err)[:100]).strip() or "oauth_error")
            return RedirectResponse(url=f"{target_redirect}{sep}error={safe_err}")

        if not state:
            raw_err = error_description or error or "missing_state"
            safe_err = quote_plus(re.sub(r"[^\w\-_.: ]", "", str(raw_err)[:100]).strip() or "missing_state")
            return RedirectResponse(url=f"{target_redirect}{sep}error={safe_err}")

        from datetime import datetime, timezone

        with db_session() as conn:
            with conn.cursor() as cur:
                try:
                    token_hash = hash_token_or_code(state)
                    cur.execute("""
                        SELECT id, user_id, session_id, purpose, target_provider, consumed_at, expires_at
                        FROM auth_single_use_tokens
                        WHERE token_hash = %s AND token_type = 'oauth_state'
                        FOR UPDATE
                    """, (token_hash,))
                    row = cur.fetchone()
                    if not row:
                        conn.rollback()
                        return RedirectResponse(url=f"{target_redirect}{sep}error=state_not_found")

                    _id, st_user_id, st_session_id, st_purpose, st_provider, consumed_at, expires_at = row
                    if consumed_at is not None:
                        conn.rollback()
                        return RedirectResponse(url=f"{target_redirect}{sep}error=state_already_consumed")

                    if expires_at.tzinfo is not None:
                        expires_at = expires_at.astimezone(timezone.utc).replace(tzinfo=None)
                    now = datetime.now(timezone.utc).replace(tzinfo=None)
                    if expires_at < now:
                        conn.rollback()
                        return RedirectResponse(url=f"{target_redirect}{sep}error=state_expired")

                    if st_provider and st_provider != provider:
                        conn.rollback()
                        return RedirectResponse(url=f"{target_redirect}{sep}error=provider_mismatch")

                    base_purpose = st_purpose.split(":")[0] if st_purpose else "login"
                    saved_target_purpose = st_purpose.split(":", 1)[1] if (st_purpose and ":" in st_purpose) else None
                    effective_target_purpose = target_purpose or saved_target_purpose

                    target_redirect = resolve_target_redirect(redirect_uri, purpose=base_purpose)

                    sep = "&" if "?" in target_redirect else "?"

                    cur.execute("UPDATE auth_single_use_tokens SET consumed_at = now() WHERE id = %s", (_id,))

                    is_mock_flow = allow_mock and (mock_code is not None or mock_uid is not None)

                    if is_mock_flow:
                        prov_uid = (mock_uid or f"social_{provider}_{secrets.token_hex(4)}").strip()
                        prov_email = (mock_email or "").strip() or None
                        prov_name = (mock_name or f"{provider.capitalize()} User").strip()[:50]
                    else:
                        if provider == "naver":
                            if not code:
                                conn.rollback()
                                return RedirectResponse(url=f"{target_redirect}{sep}error=missing_auth_code")

                            client_id = os.getenv("NAVER_CLIENT_ID", "").strip()
                            client_secret = os.getenv("NAVER_CLIENT_SECRET", "").strip()
                            if not client_id or not client_secret:
                                conn.rollback()
                                return RedirectResponse(url=f"{target_redirect}{sep}error=naver_credentials_not_configured")

                            # 1. Exchange authorization code for access_token with Naver
                            token_url = "https://nid.naver.com/oauth2.0/token"
                            token_params = {
                                "grant_type": "authorization_code",
                                "client_id": client_id,
                                "client_secret": client_secret,
                                "code": code,
                                "state": state,
                            }
                            try:
                                async with httpx.AsyncClient(timeout=10.0) as http_client:
                                    token_res = await http_client.post(token_url, data=token_params)
                                    if token_res.status_code != 200:
                                        conn.rollback()
                                        return RedirectResponse(url=f"{target_redirect}{sep}error=naver_token_request_failed")
                                    token_json = token_res.json()
                                    naver_access_token = token_json.get("access_token")
                                    if not naver_access_token:
                                        conn.rollback()
                                        err_code = token_json.get("error_description") or token_json.get("error") or "token_missing"
                                        return RedirectResponse(url=f"{target_redirect}{sep}error={err_code}")

                                    # 2. Fetch profile from Naver Profile API
                                    profile_url = "https://openapi.naver.com/v1/nid/me"
                                    headers = {"Authorization": f"Bearer {naver_access_token}"}
                                    profile_res = await http_client.get(profile_url, headers=headers)
                                    if profile_res.status_code != 200:
                                        conn.rollback()
                                        return RedirectResponse(url=f"{target_redirect}{sep}error=naver_profile_request_failed")

                                    profile_json = profile_res.json()
                                    if profile_json.get("resultcode") != "00":
                                        conn.rollback()
                                        return RedirectResponse(url=f"{target_redirect}{sep}error=naver_profile_error")

                                    account_data = profile_json.get("response", {})
                                    raw_id = account_data.get("id")
                                    if not raw_id:
                                        conn.rollback()
                                        return RedirectResponse(url=f"{target_redirect}{sep}error=naver_id_missing")

                                    prov_uid = str(raw_id).strip()
                                    # Email is strictly optional: user may decline or not have email verified on Naver
                                    prov_email = (account_data.get("email") or "").strip() or None
                                    raw_name = account_data.get("nickname") or account_data.get("name") or "네이버 사용자"
                                    prov_name = str(raw_name).strip()[:50]
                            except httpx.TimeoutException:
                                conn.rollback()
                                return RedirectResponse(url=f"{target_redirect}{sep}error=naver_timeout")
                            except Exception as e:
                                conn.rollback()
                                return RedirectResponse(url=f"{target_redirect}{sep}error=naver_communication_error")
                        elif provider == "google":
                            if not code:
                                conn.rollback()
                                return RedirectResponse(url=f"{target_redirect}{sep}error=missing_auth_code")

                            client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
                            client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
                            if not client_id or not client_secret:
                                conn.rollback()
                                return RedirectResponse(url=f"{target_redirect}{sep}error=google_credentials_not_configured")

                            google_callback = os.getenv("GOOGLE_CALLBACK_URL", "http://127.0.0.1:8000/auth/v2/oauth/google/callback").strip()
                            token_url = "https://oauth2.googleapis.com/token"
                            token_data = {
                                "code": code,
                                "client_id": client_id,
                                "client_secret": client_secret,
                                "redirect_uri": google_callback,
                                "grant_type": "authorization_code",
                            }

                            try:
                                async with httpx.AsyncClient(timeout=10.0) as http_client:
                                    token_res = await http_client.post(token_url, data=token_data)
                                    if token_res.status_code != 200:
                                        conn.rollback()
                                        return RedirectResponse(url=f"{target_redirect}{sep}error=google_token_request_failed")

                                    token_json = token_res.json()
                                    raw_id_token = token_json.get("id_token")
                                    google_access_token = token_json.get("access_token")
                                    if not raw_id_token:
                                        conn.rollback()
                                        return RedirectResponse(url=f"{target_redirect}{sep}error=google_id_token_missing")

                                    # 1. ID Token Verification using official google-auth library
                                    try:
                                        idinfo = google_id_token.verify_oauth2_token(
                                            raw_id_token,
                                            google_requests.Request(),
                                            audience=client_id,
                                        )
                                    except Exception:
                                        conn.rollback()
                                        return RedirectResponse(url=f"{target_redirect}{sep}error=invalid_id_token")

                                    # Verify issuer
                                    if idinfo.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
                                        conn.rollback()
                                        return RedirectResponse(url=f"{target_redirect}{sep}error=invalid_id_token_issuer")

                                    # Verify nonce if present in ID token
                                    expected_nonce = hash_token_or_code(f"google_nonce:{state}")[:32]
                                    token_nonce = idinfo.get("nonce")
                                    if token_nonce and token_nonce != expected_nonce:
                                        conn.rollback()
                                        return RedirectResponse(url=f"{target_redirect}{sep}error=nonce_mismatch")

                                    id_sub = idinfo.get("sub")
                                    if not id_sub:
                                        conn.rollback()
                                        return RedirectResponse(url=f"{target_redirect}{sep}error=google_sub_missing")

                                    # 2. OIDC UserInfo endpoint verification
                                    if google_access_token:
                                        userinfo_url = "https://openidconnect.googleapis.com/v1/userinfo"
                                        userinfo_res = await http_client.get(
                                            userinfo_url,
                                            headers={"Authorization": f"Bearer {google_access_token}"}
                                        )
                                        if userinfo_res.status_code == 200:
                                            userinfo_json = userinfo_res.json()
                                            userinfo_sub = userinfo_json.get("sub")
                                            if userinfo_sub and userinfo_sub != id_sub:
                                                conn.rollback()
                                                return RedirectResponse(url=f"{target_redirect}{sep}error=sub_mismatch")
                                        else:
                                            conn.rollback()
                                            return RedirectResponse(url=f"{target_redirect}{sep}error=google_userinfo_request_failed")

                                    prov_uid = str(id_sub).strip()
                                    prov_email = (idinfo.get("email") or "").strip() or None
                                    raw_name = idinfo.get("name") or "구글 사용자"
                                    prov_name = str(raw_name).strip()[:50]
                            except httpx.TimeoutException:
                                conn.rollback()
                                return RedirectResponse(url=f"{target_redirect}{sep}error=google_timeout")
                            except Exception as e:
                                conn.rollback()
                                return RedirectResponse(url=f"{target_redirect}{sep}error=google_communication_error")
                        else:
                            conn.rollback()
                            return RedirectResponse(url=f"{target_redirect}{sep}error=unsupported_provider")

                    if base_purpose == "login":
                        cur.execute("""
                            SELECT user_id FROM social_accounts
                            WHERE provider = %s AND provider_user_id = %s
                        """, (provider, prov_uid))
                        soc_row = cur.fetchone()

                        if soc_row:
                            target_user_id = soc_row[0]
                        else:
                            cur.execute("""
                                INSERT INTO users (name, token_version)
                                VALUES (%s, 1)
                                RETURNING id
                            """, (prov_name,))
                            target_user_id = cur.fetchone()[0]

                            cur.execute("""
                                INSERT INTO social_accounts (user_id, provider, provider_user_id, email)
                                VALUES (%s, %s, %s, %s)
                            """, (target_user_id, provider, prov_uid, prov_email))

                            if provider == "google":
                                cur.execute("UPDATE users SET google_id = %s WHERE id = %s", (prov_uid, target_user_id))

                        exchange_code = generate_oauth_exchange_code()
                        store_oauth_exchange_code(
                            cur=cur,
                            code_secret=exchange_code,
                            user_id=target_user_id,
                            session_id=st_session_id,
                            ttl_seconds=60,
                        )
                        conn.commit()

                        return RedirectResponse(
                            url=f"{target_redirect}{sep}exchange_code={exchange_code}&session_id={st_session_id}"
                        )

                    elif base_purpose == "link":
                        if not st_user_id:
                            conn.rollback()
                            return RedirectResponse(url=f"{target_redirect}{sep}error=missing_user_for_link")

                        cur.execute("""
                            SELECT user_id FROM social_accounts
                            WHERE provider = %s AND provider_user_id = %s
                        """, (provider, prov_uid))
                        existing = cur.fetchone()
                        if existing and existing[0] != st_user_id:
                            conn.rollback()
                            return RedirectResponse(url=f"{target_redirect}{sep}error=already_linked_to_other_user")

                        cur.execute("""
                            INSERT INTO social_accounts (user_id, provider, provider_user_id, email)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (provider, provider_user_id) DO NOTHING
                        """, (st_user_id, provider, prov_uid, prov_email))

                        if provider == "google":
                            cur.execute("UPDATE users SET google_id = %s WHERE id = %s AND google_id IS NULL", (prov_uid, st_user_id))

                        conn.commit()
                        return RedirectResponse(url=f"{target_redirect}{sep}status=link_success&provider={provider}")

                    elif base_purpose == "reauth":
                        target_user_id = st_user_id
                        if not target_user_id:
                            # Logged out reauth for password reset: find user associated with this social account
                            cur.execute("""
                                SELECT user_id FROM social_accounts
                                WHERE provider = %s AND provider_user_id = %s
                            """, (provider, prov_uid))
                            u_acc = cur.fetchone()
                            if not u_acc:
                                conn.rollback()
                                return RedirectResponse(url=f"{target_redirect}{sep}error=social_account_not_registered")
                            target_user_id = u_acc[0]
                        else:
                            # Logged in reauth: verify this social account belongs to currently logged in user
                            cur.execute("""
                                SELECT 1 FROM social_accounts
                                WHERE user_id = %s AND provider = %s AND provider_user_id = %s
                            """, (target_user_id, provider, prov_uid))
                            if not cur.fetchone():
                                conn.rollback()
                                return RedirectResponse(url=f"{target_redirect}{sep}error=reauth_user_mismatch")

                        cur.execute("SELECT token_version FROM users WHERE id = %s", (target_user_id,))
                        u_row = cur.fetchone()
                        if not u_row:
                            conn.rollback()
                            return RedirectResponse(url=f"{target_redirect}{sep}error=user_not_found")

                        t_ver = u_row[0]
                        reauth_purpose = effective_target_purpose or REAUTH_PURPOSE_PASSWORD_RESET
                        ticket, jti = create_reauth_ticket(
                            user_id=target_user_id,
                            purpose=reauth_purpose,
                            session_id=st_session_id,
                            token_version=t_ver,
                            target_provider=provider,
                        )
                        store_reauth_ticket_record(
                            cur=cur,
                            ticket_jti=jti,
                            user_id=target_user_id,
                            session_id=st_session_id,
                            purpose=reauth_purpose,
                            token_version=t_ver,
                            target_provider=provider,
                        )
                        conn.commit()
                        return RedirectResponse(url=f"{target_redirect}{sep}ticket={ticket}&purpose={reauth_purpose}&session_id={st_session_id}")

                except HTTPException:
                    conn.rollback()
                    raise
                except Exception as e:
                    conn.rollback()
                    return RedirectResponse(url=f"{target_redirect}{sep}error={str(e)}")

    @router.post("/account/password/reset")
    async def reset_password(req: PasswordResetRequest, request: Request):
        """
        Resets (or establishes) password using a valid reauth ticket (purpose=password_reset).
        Increments token_version and returns fresh JWT.
        """
        try:
            validate_password_for_credential_change(req.new_password)
        except AuthValidationError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        valid_username = None
        if req.username:
            try:
                valid_username = normalize_and_validate_username(req.username)
            except AuthValidationError as e:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        try:
            ticket_claims = decode_and_validate_reauth_ticket(
                ticket=req.reauth_ticket,
                expected_purpose=REAUTH_PURPOSE_PASSWORD_RESET,
                expected_session_id=req.session_id,
            )
            target_uid = int(ticket_claims["user_id"])
        except TokenValidationError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"재인증 티켓 검증 실패: {e}")

        jti = ticket_claims["jti"]
        session_id = ticket_claims.get("sid", "")
        token_ver = ticket_claims.get("tver", 1)

        hashed_password = await hash_password_async(req.new_password)

        with db_session() as conn:
            with conn.cursor() as cur:
                try:
                    new_ver = reset_password_credential(
                        cur=cur,
                        user_id=target_uid,
                        new_password_hash=hashed_password,
                        ticket_jti=jti,
                        session_id=session_id,
                        token_version=token_ver,
                        username=valid_username,
                    )
                    conn.commit()
                except UsernameConflictError as e:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
                except (TokenAlreadyConsumedError, TokenExpiredInStoreError, TokenBindingMismatchError, TokenNotFoundError) as e:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"재인증 티켓 사용 불가: {e}")
                except Exception as e:
                    conn.rollback()
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        new_jwt = create_access_token(
            user_id=target_uid,
            token_version=new_ver,
            session_id=session_id,
        )

        return {
            "success": True,
            "token": new_jwt,
            "new_token_version": new_ver,
            "message": "비밀번호가 성공적으로 재설정되었습니다."
        }

    return router
