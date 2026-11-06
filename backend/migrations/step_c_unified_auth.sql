-- ============================================================================
-- Overloader Step C: 통합 계정 스키마 및 Google 계정 백필 마이그레이션 DDL
-- 버전: Step C v2.0 (사전 점검 결과 반영본)
-- 주의: 이 파일은 사전 점검 완료 및 사용자 명시적 승인 전까지 실행하지 마십시오.
-- ============================================================================

BEGIN;

-- 1. 트랜잭션 내 안전 잠금 및 실행 타임아웃 설정 (SET LOCAL은 BEGIN 직후 배치)
-- 3초 내에 ACCESS EXCLUSIVE 잠금을 획득하지 못하면 즉시 롤백 및 중단 (서비스 블로킹 방지)
SET LOCAL lock_timeout = '3s';
-- DDL 및 백필 쿼리가 10초 이상 지연되면 즉시 롤백 및 중단
SET LOCAL statement_timeout = '10s';

-- 2. 사전 상태 안전 검증 (DO 블록)
-- 기존에 동일한 이름의 테이블이 이미 존재할 경우 구조 불일치 위험이 있으므로 즉시 중단
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('password_credentials', 'social_accounts')
    ) THEN
        RAISE EXCEPTION 'Safety check failed: password_credentials or social_accounts table already exists in database';
    END IF;

    -- Google ID에 앞뒤 공백 등 이상 데이터가 존재하면 임의 정규화하지 않고 즉시 중단
    IF EXISTS (
        SELECT 1 FROM users 
        WHERE google_id IS NOT NULL 
          AND (google_id != TRIM(google_id) OR TRIM(google_id) = '')
    ) THEN
        RAISE EXCEPTION 'Safety check failed: Whitespace or empty anomaly detected in users.google_id';
    END IF;
END $$;

-- 3. 기존 users 테이블에 email_verified 컬럼 추가
-- users.email_verified는 '선택 연락처 이메일의 소유 인증 여부'만을 관리 (소셜 로그인 유효성과 엄격 분리)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false;

-- 4. password_credentials 테이블 신설 (users 1 : 0..1 관계)
-- user_id 자체가 PRIMARY KEY이므로 단일 user_id당 최대 1개의 레코드만 물리적으로 존재 가능함을 DB 레벨에서 강제함
-- users.id (integer)와 password_credentials.user_id (integer)의 데이터 타입 일치
CREATE TABLE password_credentials (
    user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT uq_password_credentials_username UNIQUE (username)
);

-- 5. social_accounts 테이블 신설 (users 1 : N 관계)
-- provider 허용값 제약: CHECK (provider IN ('google', 'naver'))
-- users.id (integer)와 social_accounts.user_id (integer)의 데이터 타입 일치
CREATE TABLE social_accounts (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider character varying(20) NOT NULL,
    provider_user_id character varying(255) NOT NULL,
    email character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT chk_social_accounts_provider CHECK (provider IN ('google', 'naver')),
    CONSTRAINT uq_social_accounts_provider_uid UNIQUE (provider, provider_user_id),
    CONSTRAINT uq_social_accounts_user_provider UNIQUE (user_id, provider)
);

-- 인덱스 생성: 특정 사용자의 소셜 연동 목록 조회 성능 최적화
CREATE INDEX idx_social_accounts_user_id ON social_accounts(user_id);

-- 6. 기존 Google 로그인 사용자 백필 (Data Backfill)
-- ON CONFLICT DO NOTHING을 사용하지 않고 직접 인서트하여, 비정상 충돌 발생 시 조용히 넘기지 않고 즉시 예외 롤백 발생
INSERT INTO social_accounts (user_id, provider, provider_user_id, email, created_at, updated_at)
SELECT 
    u.id AS user_id,
    'google' AS provider,
    u.google_id AS provider_user_id,
    u.email AS email,
    COALESCE(u.created_at, now()) AS created_at,
    now() AS updated_at
FROM users u
WHERE u.google_id IS NOT NULL 
  AND u.google_id != '';

-- 7. 백필 정합성 정밀 검증 (DO 블록)
-- 건수 비교뿐 아니라 각 Google 식별자가 원래 users.id에 정확히 1:1로 연결되었는지 검증
DO $$
DECLARE
    expected_count integer;
    actual_count integer;
    mismatch_count integer;
BEGIN
    -- A. 백필 대상 수와 실제 social_accounts 생성 수 대조
    SELECT COUNT(*) INTO expected_count
    FROM users 
    WHERE google_id IS NOT NULL AND google_id != '';

    SELECT COUNT(*) INTO actual_count
    FROM social_accounts
    WHERE provider = 'google';

    IF expected_count != actual_count THEN
        RAISE EXCEPTION 'Backfill verification failed: expected % google accounts, but found % in social_accounts', expected_count, actual_count;
    END IF;

    -- B. 1:1 매핑 완전성 대조 (users의 id/google_id 쌍이 social_accounts의 user_id/provider_user_id와 정확히 일치하는지)
    SELECT COUNT(*) INTO mismatch_count
    FROM users u
    LEFT JOIN social_accounts s
      ON s.provider = 'google'
     AND s.provider_user_id = u.google_id
     AND s.user_id = u.id
    WHERE u.google_id IS NOT NULL AND u.google_id != ''
      AND s.id IS NULL;

    IF mismatch_count > 0 THEN
        RAISE EXCEPTION 'Backfill verification failed: % users have missing or mismatched 1:1 mappings in social_accounts', mismatch_count;
    END IF;
END $$;

COMMIT;
