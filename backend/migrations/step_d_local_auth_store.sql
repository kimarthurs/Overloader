-- ============================================================================
-- Overloader Step D: 일회성 인증 토큰 저장소 및 token_version 스키마 (로컬 테스트용)
-- 주의: 이 파일은 로컬 격리 테스트 환경 전용이며 운영 DB에 임의 실행하지 마십시오.
-- 이미 적용된 Step C 마이그레이션 SQL을 수정하지 않고 신규 분리 작성되었습니다.
-- ============================================================================

BEGIN;

-- 1. users 테이블에 token_version 컬럼 추가 (세션 무효화 지원)
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 1;

-- 2. OAuth state, OAuth 교환 코드, 재인증 티켓의 원자적 일회성 소비를 위한 저장소
CREATE TABLE IF NOT EXISTS auth_single_use_tokens (
    id serial PRIMARY KEY,
    token_hash character varying(64) NOT NULL UNIQUE,
    token_type character varying(30) NOT NULL,
    user_id integer REFERENCES users(id) ON DELETE CASCADE,
    session_id character varying(128) NOT NULL,
    purpose character varying(50),
    target_provider character varying(20),
    token_version integer,
    consumed_at timestamp without time zone,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT chk_auth_tokens_type CHECK (token_type IN ('oauth_state', 'oauth_exchange_code', 'reauth_ticket'))
);

-- 인덱스: 토큰 해시 조회, 만료 시각 조회, 사용자별 연관 조회
CREATE INDEX IF NOT EXISTS idx_auth_single_use_tokens_hash ON auth_single_use_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_single_use_tokens_exp ON auth_single_use_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_single_use_tokens_user ON auth_single_use_tokens(user_id);

COMMIT;
