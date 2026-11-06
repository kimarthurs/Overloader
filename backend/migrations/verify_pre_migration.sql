-- ============================================================================
-- Overloader Step C: 마이그레이션 적용 전 데이터 검증 스크립트 (Read-Only)
-- 대상: 로컬 테스트 DB (overloaderdb_stepc_restore_test)
-- ============================================================================

-- 1. 현재 접속 세션 대상 검증 (운영 DB가 아닌 로컬 테스트 DB인지 확인)
SELECT 
    current_database() AS connected_db,
    inet_server_addr() AS server_ip,
    inet_server_port() AS server_port,
    current_user AS db_user;

-- 2. 주요 테이블 전체 건수 기준선(Baseline) 확인
SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL
SELECT 'workout_logs', COUNT(*) FROM workout_logs
UNION ALL
SELECT 'cardio_logs', COUNT(*) FROM cardio_logs
UNION ALL
SELECT 'body_logs', COUNT(*) FROM body_logs
UNION ALL
SELECT 'meal_logs', COUNT(*) FROM meal_logs;

-- 3. 사용자(user_id)별 운동 및 건강 기록 건수 기준선
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
