"""
Comprehensive Unit Tests for Overloader Auth Utilities (Step D)
Tests:
- Username normalization and validation
- Display name validation
- Strict password complexity policy (boundary, conditions, non-mutation)
- Argon2id hashing & verification (sync + async non-blocking, dummy timing defense)
- Fixed-algorithm JWT (HS256) strict enforcement
- Strict issuer & audience validation
- Tampered token signature rejection
- Expired token rejection
- Missing mandatory claims rejection
- Token version mismatch rejection
- Re-auth ticket claims, session binding, and token_version binding
- Secrets-based opaque OAuth exchange code generation & SHA-256 hashing
"""

import asyncio
import time
import pytest
from datetime import datetime, timedelta, timezone
from jose import jwt

from backend.auth_utils import (
    normalize_and_validate_username,
    validate_display_name,
    validate_optional_email,
    evaluate_password_complexity,
    validate_password_for_credential_change,
    hash_password,
    verify_password,
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
    TokenClaimMissingError,
    TokenAlgorithmMismatchError,
    TokenValidationError,
    JWT_SECRET,
    JWT_ALGORITHM,
    JWT_ISSUER,
    JWT_AUDIENCE,
    REAUTH_PURPOSE_PASSWORD_CHANGE,
    REAUTH_PURPOSE_PASSWORD_RESET,
    REAUTH_PURPOSE_SOCIAL_LINK,
    REAUTH_PURPOSE_SOCIAL_UNLINK,
)


# ── 1. Username Validation Tests ────────────────────────────────────────────────

class TestUsernameValidation:
    def test_valid_usernames(self):
        assert normalize_and_validate_username("john_doe") == "john_doe"
        assert normalize_and_validate_username("user123") == "user123"
        assert normalize_and_validate_username("a1_b") == "a1_b"
        assert normalize_and_validate_username("abcd") == "abcd"  # exactly 4 chars
        assert normalize_and_validate_username("a" * 20) == "a" * 20  # exactly 20 chars

    def test_username_normalization_and_stripping(self):
        assert normalize_and_validate_username("  John_Doe  ") == "john_doe"
        assert normalize_and_validate_username("USER_NAME_99") == "user_name_99"

    def test_forbidden_at_symbol(self):
        with pytest.raises(AuthValidationError, match="cannot contain '@'"):
            normalize_and_validate_username("user@domain.com")
        with pytest.raises(AuthValidationError, match="cannot contain '@'"):
            normalize_and_validate_username("@admin")

    def test_invalid_lengths(self):
        with pytest.raises(AuthValidationError, match="between 4 and 20 characters"):
            normalize_and_validate_username("abc")  # 3 chars
        with pytest.raises(AuthValidationError, match="between 4 and 20 characters"):
            normalize_and_validate_username("a" * 21)  # 21 chars

    def test_forbidden_characters(self):
        with pytest.raises(AuthValidationError, match="only ASCII letters, numbers, and underscores"):
            normalize_and_validate_username("john.doe")
        with pytest.raises(AuthValidationError, match="only ASCII letters, numbers, and underscores"):
            normalize_and_validate_username("john-doe")
        with pytest.raises(AuthValidationError, match="only ASCII letters, numbers, and underscores"):
            normalize_and_validate_username("홍길동12")
        with pytest.raises(AuthValidationError, match="only ASCII letters, numbers, and underscores"):
            normalize_and_validate_username("user name")

    def test_empty_or_none(self):
        with pytest.raises(AuthValidationError):
            normalize_and_validate_username("")
        with pytest.raises(AuthValidationError):
            normalize_and_validate_username("   ")
        with pytest.raises(AuthValidationError):
            normalize_and_validate_username(None)


# ── 2. Display Name (Nickname) Validation Tests ─────────────────────────────────

class TestDisplayNameValidation:
    def test_valid_display_names(self):
        assert validate_display_name("홍길동") == "홍길동"
        assert validate_display_name("  Arthur Kim  ") == "Arthur Kim"
        assert validate_display_name("User #1 (Pro)") == "User #1 (Pro)"

    def test_empty_or_none_display_names(self):
        with pytest.raises(AuthValidationError, match="닉네임은 비어 있을 수 없습니다"):
            validate_display_name("")
        with pytest.raises(AuthValidationError, match="닉네임은 비어 있을 수 없습니다"):
            validate_display_name("   ")
        with pytest.raises(AuthValidationError, match="닉네임은 비어 있을 수 없습니다"):
            validate_display_name(None)

    def test_excessive_length(self):
        with pytest.raises(AuthValidationError, match="닉네임은 50자를 초과할 수 없습니다"):
            validate_display_name("x" * 51)


# ── 2-1. Optional Contact Email Validation Tests ───────────────────────────────

class TestOptionalEmailValidation:
    def test_empty_or_none_email_returns_none(self):
        assert validate_optional_email(None) is None
        assert validate_optional_email("") is None
        assert validate_optional_email("   ") is None

    def test_valid_contact_emails(self):
        assert validate_optional_email("user@example.com") == "user@example.com"
        assert validate_optional_email("  USER.name+tag@sub.domain.co.kr  ") == "user.name+tag@sub.domain.co.kr"
        assert validate_optional_email("test_123@overloader.cloud") == "test_123@overloader.cloud"

    def test_invalid_email_format(self):
        with pytest.raises(AuthValidationError, match="올바른 이메일 형식이 아닙니다"):
            validate_optional_email("invalid-email")
        with pytest.raises(AuthValidationError, match="올바른 이메일 형식이 아닙니다"):
            validate_optional_email("user@")
        with pytest.raises(AuthValidationError, match="올바른 이메일 형식이 아닙니다"):
            validate_optional_email("@example.com")
        with pytest.raises(AuthValidationError, match="올바른 이메일 형식이 아닙니다"):
            validate_optional_email("user name@domain.com")

    def test_excessive_email_length(self):
        long_email = "a" * 250 + "@test.com"  # 259 chars
        with pytest.raises(AuthValidationError, match="이메일은 255자를 초과할 수 없습니다"):
            validate_optional_email(long_email)


# ── 3. Password Complexity Policy Tests ─────────────────────────────────────────

class TestPasswordComplexity:
    def test_fully_compliant_passwords(self):
        valid_passwords = [
            "Password123!",
            "Admin#2026_Secure",
            "k-K7#abc",        # exactly 8 chars
            "A" + "a" * 124 + "1!",  # exactly 128 chars
            "Pass 123!@#",     # spaces included + all required ASCII present
            "운동Pass123!@",    # korean included + all required ASCII present
        ]
        for pwd in valid_passwords:
            res = evaluate_password_complexity(pwd)
            assert res["valid"] is True, f"Failed for {pwd}"
            validate_password_for_credential_change(pwd)  # does not raise

    def test_missing_conditions(self):
        # Missing uppercase
        res = evaluate_password_complexity("password123!")
        assert res["valid"] is False
        assert res["has_upper"] is False

        # Missing lowercase
        res = evaluate_password_complexity("PASSWORD123!")
        assert res["valid"] is False
        assert res["has_lower"] is False

        # Missing digit
        res = evaluate_password_complexity("Password!@#")
        assert res["valid"] is False
        assert res["has_number"] is False

        # Missing special character
        res = evaluate_password_complexity("Password1234")
        assert res["valid"] is False
        assert res["has_special"] is False

    def test_whitespace_does_not_satisfy_special_char_requirement(self):
        res = evaluate_password_complexity("Password 1234")
        assert res["has_special"] is False
        assert res["valid"] is False
        with pytest.raises(AuthValidationError, match="특수문자"):
            validate_password_for_credential_change("Password 1234")

    def test_korean_does_not_satisfy_mandatory_requirements(self):
        res = evaluate_password_complexity("비밀번호1234!@")
        assert res["has_upper"] is False
        assert res["has_lower"] is False
        assert res["valid"] is False

    def test_length_boundaries(self):
        res_short = evaluate_password_complexity("Pass1!a")
        assert res_short["length"] is False
        assert res_short["valid"] is False
        with pytest.raises(AuthValidationError, match="8자 이상"):
            validate_password_for_credential_change("Pass1!a")

        long_pwd = "P" + "a" * 125 + "1!" + "extra"
        res_long = evaluate_password_complexity(long_pwd)
        assert res_long["length"] is False
        assert res_long["valid"] is False
        with pytest.raises(AuthValidationError, match="128자 이하"):
            validate_password_for_credential_change(long_pwd)

    def test_password_is_not_mutated_or_trimmed(self):
        padded_pwd = "  P1!aaaa"  # 9 chars total
        res = evaluate_password_complexity(padded_pwd)
        assert res["length"] is True
        assert res["valid"] is True


# ── 4. Argon2id Hashing & Verification Tests ────────────────────────────────────

class TestArgon2idHashing:
    def test_sync_hashing_and_verification(self):
        password = "SecurePassword123!"
        hashed = hash_password(password)

        assert hashed.startswith("$argon2id$v=19$m=19456,t=2,p=1$")
        assert verify_password(hashed, password) is True
        assert verify_password(hashed, "WrongPassword123!") is False
        assert verify_password("invalid_hash_string", password) is False

    def test_async_non_blocking_hashing_and_verification(self):
        async def _run():
            password = "AsyncPassword456$"
            hashed = await hash_password_async(password)
            assert hashed.startswith("$argon2id$v=19$m=19456,t=2,p=1$")
            is_valid = await verify_password_async(hashed, password)
            assert is_valid is True
            is_invalid = await verify_password_async(hashed, "BadPassword456$")
            assert is_invalid is False

        asyncio.run(_run())

    def test_dummy_password_verification(self):
        async def _run():
            # Must run without throwing exceptions
            await verify_dummy_password_async()

        asyncio.run(_run())


# ── 5. Opaque Token & Hash Helper Tests ─────────────────────────────────────────

class TestOpaqueTokenHelpers:
    def test_session_id_generation(self):
        sid1 = generate_session_id()
        sid2 = generate_session_id()
        assert len(sid1) >= 40
        assert sid1 != sid2

    def test_oauth_exchange_code_generation(self):
        code = generate_oauth_exchange_code()
        assert isinstance(code, str)
        assert len(code) >= 40
        # Must be opaque random string, not a JWT (no dots)
        assert "." not in code

    def test_hash_token_or_code(self):
        raw = "my_secret_code_123"
        h1 = hash_token_or_code(raw)
        h2 = hash_token_or_code(raw)
        assert h1 == h2
        assert len(h1) == 64  # SHA-256 hex string


# ── 6. Strict JWT Access Token Tests ────────────────────────────────────────────

class TestStrictJWTAccessToken:
    def test_valid_access_token_creation_and_decoding(self):
        token = create_access_token(user_id=10, token_version=1, session_id="sess_123")
        payload = decode_and_validate_access_token(token, expected_token_version=1)

        assert payload["user_id"] == 10
        assert payload["sub"] == "10"
        assert payload["type"] == "access"
        assert payload["ver"] == 1
        assert payload["sid"] == "sess_123"
        assert payload["iss"] == JWT_ISSUER
        assert payload["aud"] == JWT_AUDIENCE

    def test_tampered_signature_rejected(self):
        token = create_access_token(user_id=10, token_version=1)
        # Tamper last 5 chars of signature
        tampered_token = token[:-5] + "XXXXX"

        with pytest.raises(TokenValidationError, match="Invalid token signature"):
            decode_and_validate_access_token(tampered_token)

    def test_expired_token_rejected(self):
        now = datetime.now(timezone.utc)
        expired_payload = {
            "sub": "10",
            "user_id": 10,
            "type": "access",
            "ver": 1,
            "sid": "sess_123",
            "iss": JWT_ISSUER,
            "aud": JWT_AUDIENCE,
            "iat": int((now - timedelta(days=2)).timestamp()),
            "exp": int((now - timedelta(days=1)).timestamp()),
        }
        expired_token = jwt.encode(expired_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

        with pytest.raises(TokenExpiredError, match="Token has expired"):
            decode_and_validate_access_token(expired_token)

    def test_wrong_algorithm_rejected(self):
        payload = {
            "sub": "10",
            "user_id": 10,
            "type": "access",
            "ver": 1,
            "sid": "sess_123",
            "iss": JWT_ISSUER,
            "aud": JWT_AUDIENCE,
            "iat": int(time.time()),
            "exp": int(time.time() + 3600),
        }
        # Encode with unapproved HS384 algorithm
        wrong_alg_token = jwt.encode(payload, JWT_SECRET, algorithm="HS384")

        with pytest.raises(TokenAlgorithmMismatchError, match="expected 'HS256', got 'HS384'"):
            decode_and_validate_access_token(wrong_alg_token)

    def test_wrong_issuer_rejected(self):
        payload = {
            "sub": "10",
            "user_id": 10,
            "type": "access",
            "ver": 1,
            "sid": "sess_123",
            "iss": "rogue-issuer",
            "aud": JWT_AUDIENCE,
            "iat": int(time.time()),
            "exp": int(time.time() + 3600),
        }
        rogue_token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

        with pytest.raises(TokenValidationError):
            decode_and_validate_access_token(rogue_token)

    def test_wrong_audience_rejected(self):
        payload = {
            "sub": "10",
            "user_id": 10,
            "type": "access",
            "ver": 1,
            "sid": "sess_123",
            "iss": JWT_ISSUER,
            "aud": "wrong-audience",
            "iat": int(time.time()),
            "exp": int(time.time() + 3600),
        }
        rogue_token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

        with pytest.raises(TokenValidationError):
            decode_and_validate_access_token(rogue_token)

    def test_missing_mandatory_claims_rejected(self):
        # Missing user_id
        payload_no_user = {
            "sub": "10",
            "type": "access",
            "ver": 1,
            "sid": "sess_123",
            "iss": JWT_ISSUER,
            "aud": JWT_AUDIENCE,
            "iat": int(time.time()),
            "exp": int(time.time() + 3600),
        }
        token_no_user = jwt.encode(payload_no_user, JWT_SECRET, algorithm=JWT_ALGORITHM)
        with pytest.raises(TokenClaimMissingError, match="missing required 'user_id' claim"):
            decode_and_validate_access_token(token_no_user)

    def test_token_version_revocation(self):
        token = create_access_token(user_id=10, token_version=1)

        # Expected DB version has incremented to 2
        with pytest.raises(TokenVersionMismatchError, match="revoked"):
            decode_and_validate_access_token(token, expected_token_version=2)

    def test_legacy_token_without_version_rejected_when_strict(self):
        # Token with issuer and audience but no version
        token_no_ver = jwt.encode(
            {
                "sub": "10",
                "user_id": 10,
                "type": "access",
                "iss": JWT_ISSUER,
                "aud": JWT_AUDIENCE,
                "iat": int(time.time()),
                "exp": int(time.time() + 3600),
            },
            JWT_SECRET,
            algorithm=JWT_ALGORITHM,
        )

        with pytest.raises(TokenVersionMismatchError, match="Legacy token lacking version"):
            decode_and_validate_access_token(token_no_ver, expected_token_version=1, allow_legacy_no_version=False)

        # Legacy token with completely missing issuer/audience rejected in strict mode
        legacy_old_token = jwt.encode(
            {"user_id": 10, "iat": int(time.time()), "exp": int(time.time() + 3600)},
            JWT_SECRET,
            algorithm=JWT_ALGORITHM,
        )
        with pytest.raises(TokenValidationError):
            decode_and_validate_access_token(legacy_old_token, expected_token_version=1, allow_legacy_no_version=False)


# ── 7. Strict Re-auth Ticket Tests ──────────────────────────────────────────────

class TestStrictReauthTicket:
    def test_valid_reauth_ticket(self):
        ticket, jti = create_reauth_ticket(
            user_id=10,
            purpose=REAUTH_PURPOSE_PASSWORD_CHANGE,
            session_id="sess_abc",
            token_version=1,
            target_provider=None,
        )

        payload = decode_and_validate_reauth_ticket(
            ticket=ticket,
            expected_user_id=10,
            expected_purpose=REAUTH_PURPOSE_PASSWORD_CHANGE,
            expected_session_id="sess_abc",
            expected_token_version=1,
        )
        assert payload["user_id"] == 10
        assert payload["type"] == "reauth"
        assert payload["jti"] == jti
        assert payload["tver"] == 1
        assert payload["iss"] == JWT_ISSUER
        assert payload["aud"] == JWT_AUDIENCE

    def test_ticket_invalidated_if_password_reset_occurred_after_issuance(self):
        # User requested ticket at token_version=1
        ticket, _ = create_reauth_ticket(
            user_id=10,
            purpose=REAUTH_PURPOSE_PASSWORD_CHANGE,
            session_id="sess_abc",
            token_version=1,
        )

        # But active DB token_version was bumped to 2 (e.g. by another session reset)
        with pytest.raises(TokenVersionMismatchError, match="does not match active version"):
            decode_and_validate_reauth_ticket(
                ticket=ticket,
                expected_user_id=10,
                expected_purpose=REAUTH_PURPOSE_PASSWORD_CHANGE,
                expected_session_id="sess_abc",
                expected_token_version=2,
            )

    def test_cross_token_type_rejection(self):
        access_token = create_access_token(user_id=10, token_version=1)
        reauth_ticket, _ = create_reauth_ticket(
            user_id=10,
            purpose=REAUTH_PURPOSE_PASSWORD_CHANGE,
            session_id="sess_abc",
            token_version=1,
        )

        # Cannot use access token where reauth ticket is expected
        with pytest.raises(TokenTypeMismatchError, match="Expected token type 'reauth'"):
            decode_and_validate_reauth_ticket(
                ticket=access_token,
                expected_user_id=10,
                expected_purpose=REAUTH_PURPOSE_PASSWORD_CHANGE,
            )

        # Cannot use reauth ticket where access token is expected
        with pytest.raises(TokenTypeMismatchError, match="Expected token type 'access'"):
            decode_and_validate_access_token(reauth_ticket)

    def test_session_and_purpose_binding_enforced(self):
        ticket, _ = create_reauth_ticket(
            user_id=10,
            purpose=REAUTH_PURPOSE_PASSWORD_CHANGE,
            session_id="sess_abc",
        )

        # Wrong purpose
        with pytest.raises(TokenValidationError, match="purpose mismatch"):
            decode_and_validate_reauth_ticket(
                ticket, expected_user_id=10, expected_purpose=REAUTH_PURPOSE_SOCIAL_UNLINK
            )

        # Wrong session
        with pytest.raises(TokenValidationError, match="session binding mismatch"):
            decode_and_validate_reauth_ticket(
                ticket,
                expected_user_id=10,
                expected_purpose=REAUTH_PURPOSE_PASSWORD_CHANGE,
                expected_session_id="hijacked_session",
            )
