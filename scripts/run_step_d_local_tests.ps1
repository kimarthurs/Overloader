param(
    [switch]$TestOnly
)

# ============================================================================
# Overloader Step D: 로컬 전용 테스트 DB 초기화 및 PostgreSQL 동시성 검증 스크립트
# 대상: 127.0.0.1:5433 / overloaderdb_stepd_test
# 주의: 이 스크립트는 로컬 격리 테스트 환경 전용입니다. 운영 Azure DB에는 접속하지 않습니다.
# ============================================================================

$ErrorActionPreference = "Stop"

# 1. 인코딩 및 환경변수 백업
$env:PGCLIENTENCODING = "UTF8"
$origPgPassword = $env:PGPASSWORD
$origStepdPassword = $env:STEPD_TEST_PASSWORD

# 고정 대상 (운영 DB 절대 fallback 금지)
$LOCAL_HOST = "127.0.0.1"
$LOCAL_PORT = "5433"
$LOCAL_USER = "postgres"
$TARGET_DB  = "overloaderdb_stepd_test"

$PG_BIN = "C:\Program Files\PostgreSQL\18\bin"
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
Set-Location $PROJECT_ROOT

# 검증된 Step C 적용 전 백업 파일 및 마이그레이션 SQL
$BACKUP_FILE = "C:\Users\Arthur\Documents\project\overloader_backups\db\overloaderdb_prod_pre_stepc_20261106_142331.dump"
$STEP_C_SQL  = Join-Path $PROJECT_ROOT "backend\migrations\step_c_unified_auth.sql"
$STEP_D_SQL  = Join-Path $PROJECT_ROOT "backend\migrations\step_d_local_auth_store.sql"

# 저장소 외부의 테스트 결과 디렉터리
$TEST_REPORT_DIR = "C:\Users\Arthur\Documents\project\overloader_backups\test_reports"
$TEST_REPORT_XML = Join-Path $TEST_REPORT_DIR "stepd_concurrency_junit.xml"

# 신규 초기화 모드일 때만 백업 파일 및 마이그레이션 파일 존재 검증
if (-not $TestOnly) {
    if (-not (Test-Path $BACKUP_FILE) -or (Get-Item $BACKUP_FILE).Length -le 0) {
        Write-Error "[중단] 검증된 백업 파일이 없거나 크기가 0입니다: $BACKUP_FILE"
        exit 1
    }
    if (-not (Test-Path $STEP_C_SQL) -or -not (Test-Path $STEP_D_SQL)) {
        Write-Error "[중단] 필수 마이그레이션 SQL 파일이 누락되었습니다."
        exit 1
    }
}

$bstrPtr = [System.IntPtr]::Zero

try {
    # 2. 비밀번호 안전 입력 (try 내부에서 BSTR 해제 보장)
    $targetDesc = "{0}@{1}:{2} / {3}" -f $LOCAL_USER, $LOCAL_HOST, $LOCAL_PORT, $TARGET_DB
    Write-Host "==================================================" -ForegroundColor Cyan
    if ($TestOnly) {
        Write-Host "[Step D 로컬 테스트 - 기존 DB 재사용 모드 (-TestOnly)]" -ForegroundColor Cyan
    } else {
        Write-Host "[Step D 로컬 테스트 - 신규 DB 초기화 및 테스트 모드]" -ForegroundColor Cyan
    }
    Write-Host "대상: $targetDesc" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan

    $promptText = "로컬 PostgreSQL 비밀번호 입력 ({0}@{1}:{2})" -f $LOCAL_USER, $LOCAL_HOST, $LOCAL_PORT
    $securePass = Read-Host $promptText -AsSecureString
    try {
        $bstrPtr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
        $plainPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstrPtr)
    } finally {
        if ($bstrPtr -ne [System.IntPtr]::Zero) {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstrPtr)
            $bstrPtr = [System.IntPtr]::Zero
        }
    }

    $env:PGPASSWORD          = $plainPass
    $env:STEPD_TEST_PASSWORD = $plainPass
    $env:STEPD_TEST_HOST     = $LOCAL_HOST
    $env:STEPD_TEST_PORT     = $LOCAL_PORT
    $env:STEPD_TEST_DB       = $TARGET_DB
    $env:STEPD_TEST_USER     = $LOCAL_USER
    $plainPass = $null

    # 3. 대상 DB 사전 존재 여부 확인 및 종료 코드 즉시 검사
    Write-Host "`n[확인] 기존 DB 존재 여부 점검..." -ForegroundColor Yellow
    $checkDbQuery = "SELECT 1 FROM pg_database WHERE datname = '{0}'" -f $TARGET_DB
    $checkDbArgs = @(
        "-X",
        "-h", $LOCAL_HOST,
        "-p", $LOCAL_PORT,
        "-U", $LOCAL_USER,
        "-d", "postgres",
        "-tAc", $checkDbQuery
    )
    $dbExists = & (Join-Path $PG_BIN "psql.exe") @checkDbArgs
    $checkExitCode = $LASTEXITCODE

    if ($checkExitCode -ne 0) {
        Write-Error "[중단] DB 존재 여부 확인 쿼리 실패 (종료 코드: $checkExitCode). 즉시 중단합니다."
        exit $checkExitCode
    }

    if ($TestOnly) {
        # 테스트 전용 모드: DB가 반드시 존재해야 함
        if ($dbExists -ne "1") {
            Write-Error "[중단] $TARGET_DB 데이터베이스가 존재하지 않습니다. 먼저 -TestOnly 없이 초기화 실행을 진행하세요."
            exit 1
        }
        Write-Host "  - 기존 대상 DB ($TARGET_DB) 확인 완료. DB 생성/복원/DDL을 건너뛰고 테스트를 바로 실행합니다." -ForegroundColor Green
    } else {
        # 신규 초기화 모드: DB가 없어야 함 (덮어쓰기 방지)
        if ($dbExists -eq "1") {
            Write-Error "[중단] $TARGET_DB 데이터베이스가 이미 존재합니다. 기존 DB를 재사용하여 테스트하려면 -TestOnly 옵션을 사용하세요."
            exit 1
        }
        Write-Host "  - 대상 DB 없음 확인 완료 (신규 생성 가능)." -ForegroundColor Green

        # 4. [단계 1/4] 새 DB 생성 (template0 기반)
        Write-Host "`n[단계 1/4] template0 기반 새 DB ($TARGET_DB) 생성..." -ForegroundColor Cyan
        $createDbArgs = @(
            "-h", $LOCAL_HOST,
            "-p", $LOCAL_PORT,
            "-U", $LOCAL_USER,
            "-T", "template0",
            $TARGET_DB
        )
        & (Join-Path $PG_BIN "createdb.exe") @createDbArgs
        $createExitCode = $LASTEXITCODE
        if ($createExitCode -ne 0) {
            Write-Error "[중단] createdb 실패 (종료 코드: $createExitCode). 중단합니다."
            exit $createExitCode
        }
        Write-Host "  - template0 기반 DB 생성 완료." -ForegroundColor Green

        # 5. [단계 2/4] Step C 적용 전 백업 복원 (단일 트랜잭션, no-owner, no-acl)
        Write-Host "`n[단계 2/4] Step C 적용 전 백업 복원 중: $BACKUP_FILE" -ForegroundColor Cyan
        $restoreArgs = @(
            "-h", $LOCAL_HOST,
            "-p", $LOCAL_PORT,
            "-U", $LOCAL_USER,
            "-d", $TARGET_DB,
            "--no-owner",
            "--no-acl",
            "--single-transaction",
            $BACKUP_FILE
        )
        & (Join-Path $PG_BIN "pg_restore.exe") @restoreArgs
        $restoreExitCode = $LASTEXITCODE
        if ($restoreExitCode -ne 0) {
            Write-Error "[중단] pg_restore 복원 실패 (종료 코드: $restoreExitCode). 중단합니다."
            exit $restoreExitCode
        }
        Write-Host "  - 기본 스키마 및 원본 데이터 복원 완료." -ForegroundColor Green

        # 6. [단계 3/4] Step C 마이그레이션 적용 (통합 계정 스키마 및 Google 백필)
        Write-Host "`n[단계 3/4] Step C 마이그레이션 적용 (backend/migrations/step_c_unified_auth.sql)..." -ForegroundColor Cyan
        $stepCArgs = @(
            "-X",
            "-v", "ON_ERROR_STOP=1",
            "-h", $LOCAL_HOST,
            "-p", $LOCAL_PORT,
            "-U", $LOCAL_USER,
            "-d", $TARGET_DB,
            "-f", $STEP_C_SQL
        )
        & (Join-Path $PG_BIN "psql.exe") @stepCArgs
        $stepCExitCode = $LASTEXITCODE
        if ($stepCExitCode -ne 0) {
            Write-Error "[중단] Step C 마이그레이션 실패 (종료 코드: $stepCExitCode). 중단합니다."
            exit $stepCExitCode
        }
        Write-Host "  - Step C 적용 완료." -ForegroundColor Green

        # 7. [단계 4/4] Step D 로컬 마이그레이션 적용 (일회성 저장소 및 token_version)
        Write-Host "`n[단계 4/4] Step D 로컬 마이그레이션 적용 (backend/migrations/step_d_local_auth_store.sql)..." -ForegroundColor Cyan
        $stepDArgs = @(
            "-X",
            "-v", "ON_ERROR_STOP=1",
            "-h", $LOCAL_HOST,
            "-p", $LOCAL_PORT,
            "-U", $LOCAL_USER,
            "-d", $TARGET_DB,
            "-f", $STEP_D_SQL
        )
        & (Join-Path $PG_BIN "psql.exe") @stepDArgs
        $stepDExitCode = $LASTEXITCODE
        if ($stepDExitCode -ne 0) {
            Write-Error "[중단] Step D 로컬 마이그레이션 실패 (종료 코드: $stepDExitCode). 중단합니다."
            exit $stepDExitCode
        }
        Write-Host "  - Step D 적용 완료." -ForegroundColor Green
    }

    # 8. 실제 PostgreSQL 동시성/원자성 테스트 실행 및 엄격 검증
    Write-Host "`n[테스트 실행] PostgreSQL 동시성 및 원자성 테스트 (기대: 8건)..." -ForegroundColor Cyan

    if (-not (Test-Path $TEST_REPORT_DIR)) {
        New-Item -ItemType Directory -Path $TEST_REPORT_DIR -Force | Out-Null
    }
    if (Test-Path $TEST_REPORT_XML) {
        Remove-Item -Path $TEST_REPORT_XML -Force
    }

    $junitArg = "--junitxml={0}" -f $TEST_REPORT_XML
    $pytestArgs = @(
        "-m", "pytest",
        "tests/test_pg_concurrency.py",
        "-v",
        $junitArg
    )
    & python @pytestArgs
    $pytestExitCode = $LASTEXITCODE

    if ($pytestExitCode -ne 0) {
        Write-Error "[실패] pytest 프로세스 오류 (종료 코드: $pytestExitCode)."
        exit $pytestExitCode
    }

    if (-not (Test-Path $TEST_REPORT_XML)) {
        Write-Error "[실패] 테스트 결과 파일이 생성되지 않았습니다: $TEST_REPORT_XML"
        exit 1
    }

    [xml]$junitXml = Get-Content -Path $TEST_REPORT_XML -Encoding UTF8
    $suite = $junitXml.testsuites.testsuite
    if ($null -eq $suite) { $suite = $junitXml.testsuite }

    $totalCount = [int]$suite.tests
    $failCount  = [int]$suite.failures
    $errorCount = [int]$suite.errors
    $skipCount  = [int]$suite.skipped

    Write-Host "`n--- [테스트 결과 분석] ---" -ForegroundColor Yellow
    Write-Host "실행 건수: $totalCount" -ForegroundColor Yellow
    Write-Host "실패 건수: $failCount" -ForegroundColor Yellow
    Write-Host "오류 건수: $errorCount" -ForegroundColor Yellow
    Write-Host "스킵 건수: $skipCount" -ForegroundColor Yellow

    # 8건 모두 통과하고 skip이 0건이어야 성공
    if ($totalCount -lt 8 -or $failCount -gt 0 -or $errorCount -gt 0 -or $skipCount -gt 0) {
        $detailMsg = "[검증 실패] 테스트는 8건 모두 통과하고 스킵이 0건이어야 합니다. (실행: {0}, 실패: {1}, 오류: {2}, 스킵: {3})" -f $totalCount, $failCount, $errorCount, $skipCount
        Write-Error $detailMsg
        exit 1
    }

    Write-Host "`n==================================================" -ForegroundColor Green
    Write-Host "[검증 성공] $totalCount건 전건 통과 및 skip 0건 확인 완료!" -ForegroundColor Green
    Write-Host "[대상] $targetDesc" -ForegroundColor Green
    Write-Host "[결과 파일] $TEST_REPORT_XML" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Green

} finally {
    # 9. 비밀번호 및 환경변수 안전 복구 (원래 값으로 복구하거나 미설정 상태로 복귀)
    if ($null -ne $origPgPassword) {
        $env:PGPASSWORD = $origPgPassword
    } else {
        Remove-Item env:PGPASSWORD -ErrorAction SilentlyContinue
    }

    if ($null -ne $origStepdPassword) {
        $env:STEPD_TEST_PASSWORD = $origStepdPassword
    } else {
        Remove-Item env:STEPD_TEST_PASSWORD -ErrorAction SilentlyContinue
    }

    Remove-Item env:STEPD_TEST_HOST -ErrorAction SilentlyContinue
    Remove-Item env:STEPD_TEST_PORT -ErrorAction SilentlyContinue
    Remove-Item env:STEPD_TEST_DB   -ErrorAction SilentlyContinue
    Remove-Item env:STEPD_TEST_USER -ErrorAction SilentlyContinue
}
