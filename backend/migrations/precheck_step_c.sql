-- ============================================================================
-- Overloader Step C: 통합 계정 스키마 사전 점검 쿼리 (Read-Only)
-- 목적: Step C DDL 및 백필 실행 전 DB 환경, 기존 테이블/컬럼/제약조건, 데이터 정합성 사전 확인
-- 주의: 이 스크립트는 단순 조회(SELECT)만 수행하며 데이터를 변경하지 않습니다.
-- ============================================================================

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';

-- 1. PostgreSQL 엔진 버전 확인
SELECT version() AS postgres_version;

-- 2. 신규 생성 대상 테이블('password_credentials', 'social_accounts') 충돌 여부 확인 (0건이어야 함)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('password_credentials', 'social_accounts');

-- 3. 기존 users 테이블의 컬럼 타입 및 Nullable 상태 확인
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
ORDER BY ordinal_position;

-- 4. users 테이블의 기존 제약조건(PK, UNIQUE, CHECK 등) 확인
SELECT
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'users'
ORDER BY tc.constraint_type, kcu.column_name;

-- 5. users 테이블의 기존 인덱스 확인
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'users';

-- 6. users 테이블 전체 사용자 수 및 google_id 상태 집계 (개인정보 원문 노출 없음)
SELECT
    COUNT(*) AS total_users,
    COUNT(google_id) AS users_with_google_id,
    COUNT(*) - COUNT(google_id) AS users_with_null_google_id,
    COUNT(CASE WHEN google_id IS NOT NULL AND google_id != TRIM(google_id) THEN 1 END) AS users_with_whitespace_google_id,
    COUNT(CASE WHEN google_id IS NOT NULL AND TRIM(google_id) = '' THEN 1 END) AS users_with_empty_google_id
FROM users;

-- 7. google_id 중복 건수 정밀 집계 (원문 기준 vs TRIM 적용 후 기준)
SELECT 
    COUNT(*) AS raw_duplicate_google_id_groups,
    COALESCE(SUM(grp_count), 0) AS raw_duplicate_rows
FROM (
    SELECT google_id, COUNT(*) AS grp_count
    FROM users
    WHERE google_id IS NOT NULL AND google_id != ''
    GROUP BY google_id
    HAVING COUNT(*) > 1
) sub_raw;

SELECT 
    COUNT(*) AS trimmed_duplicate_google_id_groups,
    COALESCE(SUM(grp_count), 0) AS trimmed_duplicate_rows
FROM (
    SELECT TRIM(google_id) AS trimmed_gid, COUNT(*) AS grp_count
    FROM users
    WHERE google_id IS NOT NULL AND TRIM(google_id) != ''
    GROUP BY TRIM(google_id)
    HAVING COUNT(*) > 1
) sub_trim;

-- 8. users.email 상태 및 중복 집계 (개인정보 원문 노출 없음)
SELECT
    COUNT(email) AS users_with_email,
    COUNT(*) - COUNT(email) AS users_with_null_email,
    COUNT(CASE WHEN email IS NOT NULL AND TRIM(email) = '' THEN 1 END) AS users_with_empty_email
FROM users;

SELECT 
    COUNT(*) AS duplicate_email_groups,
    COALESCE(SUM(grp_count), 0) AS total_rows_sharing_email
FROM (
    SELECT TRIM(email), COUNT(*) AS grp_count
    FROM users
    WHERE email IS NOT NULL AND TRIM(email) != ''
    GROUP BY TRIM(email)
    HAVING COUNT(*) > 1
) sub_email;

-- 9. users.created_at 상태 확인
SELECT
    COUNT(*) AS total_rows,
    COUNT(created_at) AS rows_with_created_at,
    COUNT(*) - COUNT(created_at) AS rows_with_null_created_at
FROM users;

-- 10. 사전 점검 이상 데이터 감지 시 실행 중단 검증 (DO 블록)
-- 이상 데이터가 존재하면 예외를 발생시켜 psql이 즉시 0이 아닌 종료 코드로 중단되도록 함
DO $$
DECLARE
    cnt_tables integer;
    cnt_dup_gid integer;
    cnt_space_gid integer;
BEGIN
    SELECT COUNT(*) INTO cnt_tables
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('password_credentials', 'social_accounts');

    IF cnt_tables > 0 THEN
        RAISE EXCEPTION 'PRECHECK_ABORT: Target table already exists (% found)', cnt_tables;
    END IF;

    SELECT COUNT(*) INTO cnt_space_gid
    FROM users
    WHERE google_id IS NOT NULL AND (google_id != TRIM(google_id) OR TRIM(google_id) = '');

    IF cnt_space_gid > 0 THEN
        RAISE EXCEPTION 'PRECHECK_ABORT: Whitespace or empty google_id detected (% rows)', cnt_space_gid;
    END IF;

    SELECT COUNT(*) INTO cnt_dup_gid
    FROM (
        SELECT google_id FROM users
        WHERE google_id IS NOT NULL AND TRIM(google_id) != ''
        GROUP BY google_id HAVING COUNT(*) > 1
    ) s;

    IF cnt_dup_gid > 0 THEN
        RAISE EXCEPTION 'PRECHECK_ABORT: Duplicate google_id detected (% groups)', cnt_dup_gid;
    END IF;
END $$;

COMMIT;
