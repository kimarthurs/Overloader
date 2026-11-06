# ============================================================================
# Overloader Step D: 로컬 브라우저 검증용 백엔드 서버 구동 스크립트
# 대상: 사용자 격리 로컬 DB (127.0.0.1:5433 / overloaderdb_stepd_test)
# ============================================================================

[CmdletBinding()]
param(
    [switch]$RealOAuth
)

$ErrorActionPreference = 'Stop'

$LOCAL_HOST = '127.0.0.1'
$LOCAL_PORT = '5433'
$LOCAL_USER = 'postgres'
$TARGET_DB  = 'overloaderdb_stepd_test'

$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
Set-Location $PROJECT_ROOT

$origDbHost     = $env:DB_HOST
$origDbPort     = $env:DB_PORT
$origDbName     = $env:DB_NAME
$origDbUser     = $env:DB_USER
$origDbPass     = $env:DB_PASSWORD
$origDbSsl      = $env:DB_SSLMODE
$origMockOAuth  = $env:USE_MOCK_OAUTH

$bstrPtr = [System.IntPtr]::Zero

try {
    $targetDesc = '{0}@{1}:{2} / {3}' -f $LOCAL_USER, $LOCAL_HOST, $LOCAL_PORT, $TARGET_DB
    Write-Host '==================================================' -ForegroundColor Cyan
    Write-Host ('[Step D 로컬 개발 서버] 대상: ' + $targetDesc) -ForegroundColor Cyan
    if ($RealOAuth) {
        Write-Host '실제 OAuth(Real OAuth) 모드 활성화: http://127.0.0.1:8000' -ForegroundColor Green
        Write-Host '  네이버 Callback URL: http://127.0.0.1:8000/auth/v2/oauth/naver/callback' -ForegroundColor Green
    } else {
        Write-Host '모의 OAuth(Mock OAuth) 모드 활성화: http://127.0.0.1:8000' -ForegroundColor Cyan
    }
    $rootEnvFile = Join-Path $PROJECT_ROOT '.env'
    if (Test-Path $rootEnvFile) {
        Write-Host ('[환경설정] 프로젝트 루트 .env 로드 예정: ' + $rootEnvFile) -ForegroundColor DarkGray
    }
    Write-Host '==================================================' -ForegroundColor Cyan

    $promptText = '로컬 PostgreSQL 비밀번호 입력 ({0}@{1}:{2})' -f $LOCAL_USER, $LOCAL_HOST, $LOCAL_PORT
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

    $env:DB_HOST        = $LOCAL_HOST
    $env:DB_PORT        = $LOCAL_PORT
    $env:DB_NAME        = $TARGET_DB
    $env:DB_USER        = $LOCAL_USER
    $env:DB_PASSWORD    = $plainPass
    $env:DB_SSLMODE     = 'disable'
    if ($RealOAuth) {
        $env:USE_MOCK_OAUTH = 'false'
    } else {
        $env:USE_MOCK_OAUTH = 'true'
    }
    $plainPass = $null

    Write-Host "`n[안내] 프론트엔드는 별도 터미널에서 아래 명령으로 구동하세요:" -ForegroundColor Yellow
    Write-Host '  cd frontend ; npm start' -ForegroundColor Yellow
    Write-Host "  브라우저 접속 주소: http://127.0.0.1:3000`n" -ForegroundColor Yellow

    Write-Host '[실행] FastAPI 백엔드 서버 시작 (127.0.0.1:8000)...' -ForegroundColor Green
    Set-Location (Join-Path $PROJECT_ROOT 'backend')
    & uvicorn main:app --host 127.0.0.1 --port 8000 --reload

} finally {
    Set-Location $PROJECT_ROOT
    if ($null -ne $origDbHost) { $env:DB_HOST = $origDbHost } else { Remove-Item env:DB_HOST -ErrorAction SilentlyContinue }
    if ($null -ne $origDbPort) { $env:DB_PORT = $origDbPort } else { Remove-Item env:DB_PORT -ErrorAction SilentlyContinue }
    if ($null -ne $origDbName) { $env:DB_NAME = $origDbName } else { Remove-Item env:DB_NAME -ErrorAction SilentlyContinue }
    if ($null -ne $origDbUser) { $env:DB_USER = $origDbUser } else { Remove-Item env:DB_USER -ErrorAction SilentlyContinue }
    if ($null -ne $origDbPass) { $env:DB_PASSWORD = $origDbPass } else { Remove-Item env:DB_PASSWORD -ErrorAction SilentlyContinue }
    if ($null -ne $origDbSsl)  { $env:DB_SSLMODE = $origDbSsl } else { Remove-Item env:DB_SSLMODE -ErrorAction SilentlyContinue }
    if ($null -ne $origMockOAuth) { $env:USE_MOCK_OAUTH = $origMockOAuth } else { Remove-Item env:USE_MOCK_OAUTH -ErrorAction SilentlyContinue }
}
