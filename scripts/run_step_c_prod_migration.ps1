# ============================================================================
# Overloader Step C: 운영 DB(Azure) 마이그레이션 및 정합성 검증 실행 스크립트
# 주의: 이 스크립트는 운영 DB 적용 승인 시 관리자가 PowerShell에서 직접 실행합니다.
# 비밀번호는 스크립트, 명령 인수, 로그에 저장되지 않으며, 대화형 프롬프트로 입력받습니다.
# ============================================================================

$ErrorActionPreference = "Stop"

# 1. 인코딩 및 SSL 강제 설정
$env:PGCLIENTENCODING = "UTF8"
$env:PGSSLMODE = "require"

# 2. 실행 대상 및 경로 계산 ($PSScriptRoot 기준)
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot

$DB_HOST = "overloader.postgres.database.azure.com"
$DB_PORT = "5432"
$DB_USER = "margaron55"
$DB_NAME = "overloaderdb"
$PG_BIN  = "C:\Program Files\PostgreSQL\18\bin"

$TARGET_STR = "{0}@{1}:{2}/{3}" -f $DB_USER, $DB_HOST, $DB_PORT, $DB_NAME

# 프로젝트 외부의 명시적인 사용자 백업 폴더 경로
$BACKUP_DIR = "C:\Users\Arthur\Documents\project\overloader_backups\db"

$PRECHECK_SQL  = Join-Path $PROJECT_ROOT "backend\migrations\precheck_step_c.sql"
$MIGRATION_SQL = Join-Path $PROJECT_ROOT "backend\migrations\step_c_unified_auth.sql"
$VERIFY_SQL    = Join-Path $PROJECT_ROOT "backend\migrations\verify_post_migration.sql"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "[운영 실행 대상] $TARGET_STR" -ForegroundColor Cyan
Write-Host "[프로젝트 루트] $PROJECT_ROOT" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 3. 사전 파일 및 바이너리 존재 여부 검증 (DB 작업 전 필수 확인)
$requiredBinaries = @(
    (Join-Path $PG_BIN "pg_dump.exe"),
    (Join-Path $PG_BIN "pg_restore.exe"),
    (Join-Path $PG_BIN "psql.exe")
)
foreach ($bin in $requiredBinaries) {
    if (-not (Test-Path $bin)) {
        Write-Error "[중단] 필수 실행 파일이 존재하지 않습니다: $bin"
        exit 1
    }
}

$requiredSqlFiles = @($PRECHECK_SQL, $MIGRATION_SQL, $VERIFY_SQL)
foreach ($sql in $requiredSqlFiles) {
    if (-not (Test-Path $sql)) {
        Write-Error "[중단] 필수 마이그레이션 SQL 파일이 존재하지 않습니다: $sql"
        exit 1
    }
}

# 외부 백업 디렉터리 준비
if (-not (Test-Path $BACKUP_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_DIR -Force | Out-Null
    Write-Host "[준비] 외부 백업 디렉터리 생성: $BACKUP_DIR" -ForegroundColor Green
}

# 고유 타임스탬프 백업 파일명 생성 (기존 백업 덮어쓰기 금지)
$TIMESTAMP   = Get-Date -Format 'yyyyMMdd_HHmmss'
$BACKUP_FILE = Join-Path $BACKUP_DIR ("overloaderdb_prod_pre_stepc_{0}.dump" -f $TIMESTAMP)
if (Test-Path $BACKUP_FILE) {
    Write-Error "[중단] 동일한 이름의 백업 파일이 이미 존재합니다: $BACKUP_FILE"
    exit 1
}

# ============================================================================
# [단계 1/5] 운영 DB 신규 백업 생성
# ============================================================================
Write-Host "`n[단계 1/5] 운영 DB 신규 독립 백업 생성 시작: $BACKUP_FILE" -ForegroundColor Yellow

$dumpArgs = @(
    "-h", $DB_HOST,
    "-p", $DB_PORT,
    "-U", $DB_USER,
    "-d", $DB_NAME,
    "-F", "c",
    "-f", $BACKUP_FILE
)
& (Join-Path $PG_BIN "pg_dump.exe") @dumpArgs
$dumpExitCode = $LASTEXITCODE
if ($dumpExitCode -ne 0) {
    Write-Error "[중단] pg_dump 실패 (종료 코드: $dumpExitCode). 마이그레이션을 진행하지 않고 즉시 중단합니다."
    exit $dumpExitCode
}

# ============================================================================
# [단계 2/5] 백업 파일 무결성(크기, 목차, 전체 읽기) 검증
# ============================================================================
Write-Host "[단계 2/5] 백업 파일 무결성 및 전체 읽기 검증" -ForegroundColor Yellow

$backupItem = Get-Item $BACKUP_FILE
if ($backupItem.Length -le 0) {
    Write-Error "[중단] 백업 파일 크기가 0 byte입니다. 마이그레이션을 즉시 중단합니다."
    exit 1
}
Write-Host "  - 백업 파일 크기 확인: $($backupItem.Length) bytes" -ForegroundColor Green

# 목차(TOC) 읽기 검증
$restoreListArgs = @("--list", $BACKUP_FILE)
& (Join-Path $PG_BIN "pg_restore.exe") @restoreListArgs | Out-Null
$tocExitCode = $LASTEXITCODE
if ($tocExitCode -ne 0) {
    Write-Error "[중단] pg_restore 목차(TOC) 읽기 실패 (종료 코드: $tocExitCode). 마이그레이션을 즉시 중단합니다."
    exit $tocExitCode
}
Write-Host "  - 백업 목차(TOC) 읽기 정상" -ForegroundColor Green

# 아카이브 전체 읽기 무결성 검증 (손상 블록 감지)
$restoreTestArgs = @("-f", "NUL", $BACKUP_FILE)
& (Join-Path $PG_BIN "pg_restore.exe") @restoreTestArgs
$testReadExitCode = $LASTEXITCODE
if ($testReadExitCode -ne 0) {
    Write-Error "[중단] 백업 아카이브 전체 읽기 무결성 검증 실패 (종료 코드: $testReadExitCode). 마이그레이션을 즉시 중단합니다."
    exit $testReadExitCode
}
Write-Host "  - 백업 아카이브 전체 읽기 무결성 검증 통과" -ForegroundColor Green

# ============================================================================
# [단계 3/5] 읽기 전용 사전 점검 (이상 데이터 감지 시 중단)
# ============================================================================
Write-Host "`n[단계 3/5] 읽기 전용 사전 점검 실행 (backend/migrations/precheck_step_c.sql)" -ForegroundColor Yellow

$precheckArgs = @(
    "-X",
    "-v", "ON_ERROR_STOP=1",
    "-h", $DB_HOST,
    "-p", $DB_PORT,
    "-U", $DB_USER,
    "-d", $DB_NAME,
    "-f", $PRECHECK_SQL
)
& (Join-Path $PG_BIN "psql.exe") @precheckArgs
$precheckExitCode = $LASTEXITCODE
if ($precheckExitCode -ne 0) {
    Write-Error "[중단] 사전 점검 실패 또는 이상 데이터 감지 (종료 코드: $precheckExitCode). DDL을 실행하지 않고 즉시 중단합니다."
    exit $precheckExitCode
}
Write-Host "  - 사전 점검 통과 (신규 테이블 충돌 없음, google_id 공백/중복 이상 없음)" -ForegroundColor Green

# ============================================================================
# [확인 프롬프트] DDL 실행 직전 명시적 사용자 확인 요구
# ============================================================================
Write-Host "`n==================================================" -ForegroundColor Magenta
Write-Host "[명시적 확인 요구] DDL 및 백필 실행 직전 단계입니다." -ForegroundColor Magenta
Write-Host "대상: $TARGET_STR" -ForegroundColor Magenta
Write-Host "마이그레이션을 계속 진행하려면 'APPLY_STEP_C' 를 정확히 입력하십시오." -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Magenta

$userConfirmation = Read-Host "확인 문구 입력"
if ($userConfirmation -ne "APPLY_STEP_C") {
    Write-Warning "`n[중단] 사용자가 확인 문구를 올바르게 입력하지 않았습니다. DDL을 실행하지 않고 안전하게 종료합니다."
    exit 0
}

# ============================================================================
# [단계 4/5] Step C DDL 및 Google 계정 백필 실행 (단일 트랜잭션)
# ============================================================================
Write-Host "`n[단계 4/5] Step C DDL 및 백필 실행 (backend/migrations/step_c_unified_auth.sql)" -ForegroundColor Yellow

$migrationArgs = @(
    "-X",
    "-v", "ON_ERROR_STOP=1",
    "-h", $DB_HOST,
    "-p", $DB_PORT,
    "-U", $DB_USER,
    "-d", $DB_NAME,
    "-f", $MIGRATION_SQL
)
& (Join-Path $PG_BIN "psql.exe") @migrationArgs
$migrationExitCode = $LASTEXITCODE

if ($migrationExitCode -ne 0) {
    Write-Error "`n[실패] Step C DDL 및 백필 실행 실패 (종료 코드: $migrationExitCode)."
    Write-Warning ">> 실패 처리 안내:"
    Write-Warning "   1. 단일 트랜잭션 내부 오류인 경우 PostgreSQL이 자동 ROLLBACK을 수행합니다."
    Write-Warning "   2. 단, 네트워크 단절이나 COMMIT 응답 유실 시에는 결과가 불명(UNKNOWN)일 수 있으므로 서버 세션을 수동 점검하십시오."
    Write-Warning "   3. 자동 재실행, DROP TABLE, 백업 파일 덮어쓰기는 절대 금지됩니다."
    exit $migrationExitCode
}
Write-Host "  - Step C DDL 및 백필 트랜잭션 정상 COMMIT 완료 (종료 코드: 0)" -ForegroundColor Green

# ============================================================================
# [단계 5/5] 마이그레이션 적용 후 동적 정합성 검증
# ============================================================================
Write-Host "`n[단계 5/5] 마이그레이션 적용 후 동적 정합성 검증 (backend/migrations/verify_post_migration.sql)" -ForegroundColor Yellow

$verifyArgs = @(
    "-X",
    "-v", "ON_ERROR_STOP=1",
    "-h", $DB_HOST,
    "-p", $DB_PORT,
    "-U", $DB_USER,
    "-d", $DB_NAME,
    "-f", $VERIFY_SQL
)
& (Join-Path $PG_BIN "psql.exe") @verifyArgs
$verifyExitCode = $LASTEXITCODE

if ($verifyExitCode -ne 0) {
    Write-Error "`n[사후 검증 실패] 사후 정합성 검증에서 이상이 감지되었습니다 (종료 코드: $verifyExitCode)."
    Write-Warning ">> 주의: 4단계(DDL/백필)는 이미 COMMIT 완료된 상태입니다."
    Write-Warning ">> 사후 검증 실패는 이미 커밋된 DDL을 자동으로 롤백시키지 않습니다."
    Write-Warning ">> 보존된 백업 파일($BACKUP_FILE)과 DB 상태를 수동으로 대조 점검하십시오."
    exit $verifyExitCode
}

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "[완료] Step C 운영 마이그레이션 및 사후 검증 성공" -ForegroundColor Cyan
Write-Host "[백업 보존 위치] $BACKUP_FILE" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
