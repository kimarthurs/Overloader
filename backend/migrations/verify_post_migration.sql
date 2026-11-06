-- ============================================================================
-- Overloader Step C: 마이그레이션 적용 후 데이터 검증 스크립트 (Read-Only)
-- 대상: 로컬 테스트 DB 또는 운영 DB
-- ============================================================================

-- 1. 현재 접속 세션 대상 검증 (의도한 DB인지 확인)
SELECT 
    current_database() AS connected_db,
    inet_server_addr() AS server_ip,
    inet_server_port() AS server_port,
    current_user AS db_user;

-- 2. 신규 테이블 및 컬럼 생성 확인
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
      table_name IN ('password_credentials', 'social_accounts')
      OR (table_name = 'users' AND column_name = 'email_verified')
  )
ORDER BY table_name, ordinal_position;

-- 3. 제약조건(PK, FK, UNIQUE, CHECK) 실제 정의 확인 (pg_constraint 기준)
SELECT
    c.conrelid::regclass AS table_name,
    c.conname,
    c.contype,
    pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid IN (
    'public.password_credentials'::regclass,
    'public.social_accounts'::regclass
)
ORDER BY table_name, c.conname;

-- 4. 신규 테이블 데이터 건수 동적 확인 (하드코딩 제거: users의 google_id 보유 수와 social_accounts 대조)
SELECT 
    (SELECT COUNT(*) FROM users WHERE google_id IS NOT NULL AND google_id != '') AS users_google_id_count,
    (SELECT COUNT(*) FROM social_accounts WHERE provider = 'google') AS social_accounts_google_count,
    (SELECT COUNT(*) FROM password_credentials) AS password_credentials_count;

-- 5. Google 식별자와 users.id 1:1 매핑 누락 여부 확인 (0건이어야 함)
SELECT 
    COUNT(*) AS unmapped_users_count
FROM users u
LEFT JOIN social_accounts s
  ON s.provider = 'google'
 AND s.provider_user_id = u.google_id
 AND s.user_id = u.id
WHERE u.google_id IS NOT NULL AND u.google_id != ''
  AND s.id IS NULL;

-- 6. 기존 테이블 전체 건수 확인
SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL
SELECT 'workout_logs', COUNT(*) FROM workout_logs
UNION ALL
SELECT 'cardio_logs', COUNT(*) FROM cardio_logs
UNION ALL
SELECT 'body_logs', COUNT(*) FROM body_logs
UNION ALL
SELECT 'meal_logs', COUNT(*) FROM meal_logs;

-- 7. 사용자(user_id)별 건수 확인
SELECT 
    u.id AS user_id,
    COALESCE(w.cnt, 0) AS workout_logs_count,
    COALESCE(c.cnt, 0) AS cardio_logs_count,
    COALESCE(b.cnt, 0) AS body_logs_count,
    COALESCE(m.cnt, 0) AS meal_logs_count
FROM users u
LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM workout_logs GROUP BY user_id) w ON u.id = w.user_id
LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM cardio_logs GROUP BY user_id) c ON u.id = c.user_id
LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM body_logs GROUP BY user_id) b ON u.id = b.user_id
LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM meal_logs GROUP BY user_id) m ON u.id = m.user_id
ORDER BY u.id;

-- 8. 사후 정합성 검증 실패 시 중단 예외 발생 (DO 블록)
-- 동시 신규 가입 등으로 인한 증가분은 예외가 아닌 NOTICE로 안내하고, 누락 및 고아 데이터만 엄격 차단
DO $$
DECLARE
    exp_cnt integer;
    act_cnt integer;
    unmapped_cnt integer;
    orphan_cnt integer;
    pwd_cnt integer;
BEGIN
    SELECT COUNT(*) INTO exp_cnt FROM users WHERE google_id IS NOT NULL AND google_id != '';
    SELECT COUNT(*) INTO act_cnt FROM social_accounts WHERE provider = 'google';

    -- 1) 백필 누락 검증 (실제 건수가 기대치보다 적으면 즉시 중단)
    IF act_cnt < exp_cnt THEN
        RAISE EXCEPTION 'POSTCHECK_ABORT: Missing backfilled google accounts: expected at least %, but found %', exp_cnt, act_cnt;
    END IF;

    -- 2) 동시 신규 가입 등으로 실제 건수가 더 많은 경우 (데이터 손상이 아닌 확인 대상 NOTICE로 처리)
    IF act_cnt > exp_cnt THEN
        RAISE NOTICE 'POSTCHECK_INFO: social_accounts count (%) exceeds users.google_id count (%). May indicate concurrent signup activity. Check for review.', act_cnt, exp_cnt;
    END IF;

    -- 3) users의 google_id 중 social_accounts에 매핑되지 않은 계정 누락 검증
    SELECT COUNT(*) INTO unmapped_cnt
    FROM users u
    LEFT JOIN social_accounts s
      ON s.provider = 'google'
     AND s.provider_user_id = u.google_id
     AND s.user_id = u.id
    WHERE u.google_id IS NOT NULL AND u.google_id != ''
      AND s.id IS NULL;

    IF unmapped_cnt > 0 THEN
        RAISE EXCEPTION 'POSTCHECK_ABORT: % users with google_id failed 1:1 mapping in social_accounts', unmapped_cnt;
    END IF;

    -- 4) social_accounts에 유효하지 않은 user_id를 참조하는 고아 레코드 검증
    SELECT COUNT(*) INTO orphan_cnt
    FROM social_accounts s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE u.id IS NULL;

    IF orphan_cnt > 0 THEN
        RAISE EXCEPTION 'POSTCHECK_ABORT: % orphan social_accounts records found with invalid user_id', orphan_cnt;
    END IF;

    -- 5) password_credentials 테이블이 비어 있는지 검증 (Step C 직후는 0건이어야 함)
    SELECT COUNT(*) INTO pwd_cnt FROM password_credentials;
    IF pwd_cnt != 0 THEN
        RAISE EXCEPTION 'POSTCHECK_ABORT: password_credentials is not empty (% rows found)', pwd_cnt;
    END IF;
END $$;
