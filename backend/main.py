import sys
import os

_cur_dir = os.path.dirname(os.path.abspath(__file__))
_root_dir = os.path.dirname(_cur_dir)
if _cur_dir not in sys.path:
    sys.path.insert(0, _cur_dir)
if _root_dir not in sys.path:
    sys.path.insert(0, _root_dir)

import re
import unicodedata
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import psycopg2 
from psycopg2 import pool
import pandas as pd
from datetime import date, timedelta, datetime, timezone
import httpx
from jose import jwt, JWTError
import os
import requests
from dotenv import load_dotenv
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import random
import string
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional, List
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware
import numpy as np
from sklearn.linear_model import LinearRegression
from workout_utils import (
    WORKOUT_ALIASES,
    workout_match_key,
    NORMALIZED_ALIASES,
    normalize_workout_name,
    EXACT_CATEGORY_MAP,
    CATEGORY_PATTERNS,
    get_category,
)



_root_env = os.path.join(_root_dir, ".env")
if os.path.exists(_root_env):
    load_dotenv(dotenv_path=_root_env, override=False)
else:
    load_dotenv(override=False)
class DiscordWebhookBody(BaseModel):
    webhook_url: str = Field(default="")

class RoutineExercise(BaseModel):
    name: str
    sets: Optional[int] = 0
    reps: Optional[str] = ""

class RoutineBody(BaseModel):
    name: str
    exercises: List[RoutineExercise]

class AIRecommendBody(BaseModel):
    memo: Optional[str] = ""


ADMIN_DISCORD_WEBHOOK = os.getenv("ADMIN_DISCORD_WEBHOOK")
ADMIN_TELEGRAM_CHAT_ID = os.getenv("ADMIN_TELEGRAM_CHAT_ID")
ADMIN_TELEGRAM_BOT_TOKEN = os.getenv("ADMIN_TELEGRAM_BOT_TOKEN")

# =========================
# Admin Notification
# =========================

def notify_discord(webhook_url, msg):

    if not webhook_url:
        return

    try:
        requests.post(
            webhook_url,
            json={"content": msg},
            timeout=2
        )

    except Exception as e:
        print("Discord notify error:", e)


def notify_telegram(bot_token, chat_id, msg):

    if not bot_token or not chat_id:
        return

    try:
        requests.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": msg
            },
            timeout=5
        )

    except Exception as e:
        print("Telegram notify error:", e)


def notify_admin(msg):

    notify_discord(
        ADMIN_DISCORD_WEBHOOK,
        msg
    )

    notify_telegram(
        ADMIN_TELEGRAM_BOT_TOKEN,
        ADMIN_TELEGRAM_CHAT_ID,
        msg
    )


app = FastAPI()
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):

    try:

        notify_admin(
            f"🚨 SERVER ERROR\n\n"
            f"path: {request.url.path}\n"
            f"error: {str(exc)}"
        )

    except Exception as e:

        print("notify_admin failed:", e)

    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "https://app.overloader.cloud",
    "https://overloader.vercel.app"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SlowAPIMiddleware)


db_host = os.getenv("DB_HOST")
if not db_host:
    env_name = os.getenv("ENV", os.getenv("APP_ENV", "")).lower()
    is_cloud_prod = (env_name in ("production", "prod")) or (os.getenv("VERCEL") is not None)
    if not is_cloud_prod:
        raise RuntimeError(
            "DB_HOST 환경변수가 설정되지 않았습니다. 운영 Azure DB로의 의도치 않은 자동 접속을 차단합니다. "
            "(로컬 환경에서는 scripts/start_local_dev.ps1을 사용하거나 DB_HOST=127.0.0.1 환경변수를 지정하세요.)"
        )
    db_host = "overloader.postgres.database.azure.com"

DB_CONFIG = {
    "host": db_host,
    "port": int(os.getenv("DB_PORT", "5432")),
    "database": os.getenv("DB_NAME", "overloaderdb"),
    "user": os.getenv("DB_USER", "margaron55"),
    "password": os.getenv("DB_PASSWORD"),
    "sslmode": os.getenv("DB_SSLMODE", "require")
}

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"

security = HTTPBearer()

db_pool = pool.SimpleConnectionPool(minconn=1, maxconn=10, **DB_CONFIG)

def get_conn():
    return db_pool.getconn()

def release_conn(conn):
    db_pool.putconn(conn)

try:
    from auth_router import create_auth_router
except ImportError:
    from backend.auth_router import create_auth_router

auth_v2_router = create_auth_router(get_conn, release_conn)
app.include_router(auth_v2_router)


def create_jwt(user_id: int) -> str:
    now = datetime.utcnow()

    payload = {
        "user_id": user_id,
        "iat": now,
        "exp": now + timedelta(days=30),
    }

    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        try:
            from auth_utils import (
                decode_and_validate_access_token,
                TokenValidationError,
                TokenExpiredError,
                TokenTypeMismatchError,
                TokenVersionMismatchError,
            )
        except ImportError:
            from backend.auth_utils import (
                decode_and_validate_access_token,
                TokenValidationError,
                TokenExpiredError,
                TokenTypeMismatchError,
                TokenVersionMismatchError,
            )

        # 1. 헤더 및 클레임 안전 조회
        unverified_claims = jwt.get_unverified_claims(token)
        has_ver = "ver" in unverified_claims

        # 2. Step D 토큰인 경우 (ver 포함): DB에서 user의 token_version을 조회하여 원자적 검증
        expected_version = None
        if has_ver:
            uid = unverified_claims.get("user_id") or unverified_claims.get("sub")
            if uid:
                conn = get_conn()
                try:
                    with conn.cursor() as cur:
                        cur.execute("SELECT token_version FROM users WHERE id = %s", (int(uid),))
                        row = cur.fetchone()
                        if row:
                            expected_version = row[0]
                finally:
                    release_conn(conn)

        payload = decode_and_validate_access_token(
            token=token,
            expected_token_version=expected_version,
            allow_legacy_no_version=True,
        )
        return int(payload["user_id"])
    except TokenExpiredError:
        raise HTTPException(status_code=401, detail="Token expired")
    except TokenVersionMismatchError:
        raise HTTPException(status_code=401, detail="Token version revoked")
    except (TokenTypeMismatchError, TokenValidationError, JWTError) as e:
        raise HTTPException(status_code=401, detail=f"Token invalid: {e}")
    except (psycopg2.OperationalError, psycopg2.DatabaseError):
        raise HTTPException(status_code=503, detail="인증 데이터베이스 일시 장애")
    except Exception:
        raise HTTPException(status_code=401, detail="Token expired or invalid")

# ── 구글 로그인 ──
@app.post("/auth/google")
@limiter.limit("10/minute")
async def google_auth(request: Request, body: dict):

    token = body.get("access_token")
    is_id_token = body.get("is_id_token", False)

    # -----------------------------
    # Google 사용자 정보 가져오기
    # -----------------------------

    if is_id_token:
        idinfo = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )

        google_id = idinfo["sub"]
        email = idinfo.get("email")
        name = idinfo.get("name")
        picture = idinfo.get("picture")

    else:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {token}"}
            )

        if res.status_code != 200:
            raise HTTPException(
                status_code=401,
                detail="Invalid Google token"
            )

        info = res.json()

        google_id = info["id"]
        email = info.get("email")
        name = info.get("name")
        picture = info.get("picture")

    # -----------------------------
    # DB 처리
    # -----------------------------

    conn = get_conn()
    cur = conn.cursor()

    is_new_user = False

    try:

        cur.execute(
            "SELECT id FROM users WHERE google_id = %s",
            (google_id,)
        )
        user = cur.fetchone()

        if not user:

            is_new_user = True

            cur.execute(
                '''
                INSERT INTO users
                (google_id, email, name, profile_img)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                ''',
                (google_id, email, name, picture)
            )

            user = cur.fetchone()

            conn.commit()

    finally:
        cur.close()
        release_conn(conn)

    user_id = user[0]

    # -----------------------------
    # 관리자 알림
    # -----------------------------

    if is_new_user:

        msg = (
            f"🆕 신규 가입\n\n"
            f"이름: {name}\n"
            f"이메일: {email}\n"
            f"user_id: {user_id}"
        )

        notify_admin(msg)

    # -----------------------------
    # JWT 발급
    # -----------------------------

    jwt_token = create_jwt(user_id)

    return {
        "token": jwt_token,
        "name": name,
        "picture": picture
    }


WORKOUT_ALIASES = {
    # ── 가슴 ──
    "벤프": "바벨 벤치프레스",
    "벤치프레스": "바벨 벤치프레스",
    "바벨 벤치 프레스": "바벨 벤치프레스",
    "바벨플랫벤치프레스": "바벨 벤치프레스",
    "스미스벤치프레스": "스미스 머신 벤치프레스",
    "스미스머신 벤치프레스": "스미스 머신 벤치프레스",
    "체스트프레스머신": "체스트 프레스",
    "체스트프레스 머신": "체스트 프레스",
    "체스트프레스": "체스트 프레스",
    "디클라인 체스트 프레스": "디클라인 프레스",
    
    # 가슴 (인클라인)
    "인클라인덤벨프레스": "인클라인 덤벨프레스",
    "인클라인 덤벨 프레스": "인클라인 덤벨프레스",
    "덤벨 인클라인 벤치 프레스": "인클라인 덤벨프레스",
    "덤벨 인클라인 프레스": "인클라인 덤벨프레스",
    "인클라인스미스프레스": "인클라인 벤치프레스",
    "스미스인클라인벤치프레스": "인클라인 벤치프레스",
    "스미스머신 인클라인 벤치프레스": "인클라인 벤치프레스",
    "스미스 인클라인 벤치": "인클라인 벤치프레스",
    "머신 인클라인 벤치": "인클라인 벤치프레스",
    "머신 인클라인 프레스": "인클라인 벤치프레스",
    "인클라인체스트프레스": "인클라인 벤치프레스", 
    "인클라인체스트프레스머신": "인클라인 벤치프레스",
    "인클라인체스트프레스 머신": "인클라인 벤치프레스",

    # 가슴 (플라이 - 덤벨/케이블/머신 완벽 분리)
    "펙덱플라이": "펙 덱 플라이",
    "펙덱": "펙 덱 플라이",
    "머신 플라이": "펙 덱 플라이",
    "덤벨프레스": "덤벨 벤치프레스",
    "덥벨업워드플라이": "덤벨 업워드 플라이", 
    "업워드플라이": "덤벨 업워드 플라이",
    "덥벨 업워드 플라이": "덤벨 업워드 플라이",
    "케이블 어퍼플라이": "케이블 크로스오버",
    "케이블 아래 플라이": "케이블 크로스오버",
    "케이블 플라이 아래": "케이블 크로스오버",
    "케이블 플라이 (아래)": "케이블 크로스오버",
    "케이블 체스트 플라이": "케이블 크로스오버",
    "케이블 오버 플라이": "케이블 크로스오버",
    "케이블 크로스오버 플라이": "케이블 크로스오버",
    "케이블 크로스 풀오버": "케이블 크로스오버",

    # ── 어깨 ──
    "사레레": "덤벨 사이드 레터럴 레이즈",
    "사이드레터럴레이즈": "덤벨 사이드 레터럴 레이즈",
    "사이드 레터럴 레이즈": "덤벨 사이드 레터럴 레이즈",
    "오버헤드프레스": "오버헤드 프레스",
    "덤벨숄더프레스": "덤벨 숄더 프레스",
    "덤벨 숄더프레스": "덤벨 숄더 프레스",
    "덤벨 숄더 프레스": "덤벨 숄더 프레스",
    "머신숄더프레스": "머신 숄더 프레스",
    "스미스머신 오버헤드 숄더 프레스": "머신 숄더 프레스",
    "시티드 덤벨 숄더 프레스": "덤벨 숄더 프레스",
    "리버스바벨레이즈": "리버스 바벨 레이즈",
    "리버스 바벨 레이즈": "리버스 바벨 레이즈",
    "리버스펙덱플라이": "리버스 펙 덱 플라이",
    "리버스 펙덱": "리버스 펙 덱 플라이",
    "리어델트플라이": "리어델트 플라이",

    # ── 등 ──
    "랫풀다운": "랫풀다운",
    "랫 풀 다운": "랫풀다운",
    "와이드": "랫풀다운",
    "맥 그립 랫 풀 다운": "랫풀다운",
    "와이드풀다운": "랫풀다운",
    "와이드 풀다운 리어 머신": "랫풀다운",
    "시티드로우": "시티드 로우",
    "케이블 시티드 로우": "시티드 로우",
    "시티드머신": "시티드 로우",
    "시티드머신로우": "시티드 로우",
    "프론트로우": "시티드 로우",
    "로우로우": "시티드 로우",
    "티바 로우": "티바로우",
    "스미스머신바벨로우": "바벨로우",
    "스미스 머신 바벨 로우": "바벨로우",
    "어시스트풀업": "어시스트 풀업",
    "어시스티드 머신 풀 업": "어시스트 풀업",
    "원암덤벨로우": "원암 덤벨로우",
    "덤벨로우": "원암 덤벨로우",
    "턱걸이": "풀업",
    "케이블 스트레이트 암 풀 다운": "암풀다운",

    # ── 하체 & 팔 ──
    "루마니안데드": "루마니안 데드리프트",
    "이너타이": "힙 어덕션",
    "아웃타이": "힙 어브덕션",
    "힙어덕션": "힙 어덕션",
    "힙어브덕션": "힙 어브덕션",
    "이지바컬": "바벨컬",
    "이지바 컬": "바벨컬",
    "이지바/덤벨 컬": "바벨컬",
    "케이블푸시다운": "케이블 트라이셉스 푸시다운",
    "케이블푸쉬다운": "케이블 트라이셉스 푸시다운",
    "케이블 삼두 푸시다운": "케이블 트라이셉스 푸시다운",
}



def workout_match_key(name: Optional[str]) -> str:
    if name is None:
        return ""
    text = unicodedata.normalize("NFKC", str(name)).strip().lower()
    return re.sub(r"[\s\-_()/.,]+", "", text)

NORMALIZED_ALIASES = {
    workout_match_key(alias): canonical
    for alias, canonical in WORKOUT_ALIASES.items()
}

def normalize_workout_name(name: Optional[str]) -> str:
    raw_name = "" if name is None else str(name).strip()
    if not raw_name:
        return raw_name
    return NORMALIZED_ALIASES.get(workout_match_key(raw_name), raw_name)

def parse_weight_input(weight_str):

    text = str(weight_str).strip().lower()

    if "lbs" in text or "lb" in text:

        value = float(
            text.replace("lbs", "")
                .replace("lb", "")
                .strip()
        )

        kg = round(value * 0.453592, 1)

        return kg, "lbs"

    return float(text), "kg"

# ── 1. 명시적 카테고리 맵 (정규화된 이름 기준 완벽 매칭) ──
EXACT_CATEGORY_MAP = {
    # 가슴
    "바벨 벤치프레스": "가슴",
    "스미스 머신 벤치프레스": "가슴",
    "인클라인 벤치프레스": "가슴",
    "인클라인 덤벨프레스": "가슴",
    "체스트 프레스": "가슴",
    "펙 덱 플라이": "가슴",
    "디클라인 프레스": "가슴",
    "케이블 크로스오버": "가슴",

    # 등
    "랫풀다운": "등",
    "시티드 로우": "등",
    "시티드로우": "등",
    "티바로우": "등",
    "원암 기구 로우": "등",
    "원암 덤벨로우": "등",
    "어시스트 풀업": "등",
    "바벨로우": "등",
    "암풀다운": "등",
    "풀오버": "등",
    "풀업": "등",

    # 어깨
    "오버헤드 프레스": "어깨",
    "머신 숄더 프레스": "어깨",
    "덤벨 숄더 프레스": "어깨",
    "덤벨 사이드 레터럴 레이즈": "어깨",
    "리어델트 플라이": "어깨",
    "리버스 펙 덱 플라이": "어깨",
    "페이스풀": "어깨",
    "아놀드 프레스": "어깨",
    "리버스 바벨 레이즈": "어깨",

    # 하체
    "스쿼트": "하체",
    "레그프레스": "하체",
    "힙 어덕션": "하체",
    "힙 어브덕션": "하체",
    "레그컬": "하체",
    "레그 익스텐션": "하체",
    "힙쓰러스트": "하체",
    "불가리안 스플릿 스쿼트": "하체",
    "카프레이즈": "하체",
    "브이스쿼트": "하체",
    "핵스쿼트": "하체",
    "루마니안 데드리프트": "등", # 👈 정책에 따라 하체로 변경 가능
    "컨벤셔널 데드리프트": "등", # 👈 정책에 따라 하체로 변경 가능

    # 팔 (이두+삼두 통합)
    "이지바/덤벨 컬": "팔",
    "바벨컬": "팔",
    "덤벨컬": "팔",
    "해머컬": "팔",
    "케이블 트라이셉스 푸시다운": "팔",
    "라잉트라이셉스 익스텐션": "팔",
    "케이블 암컬": "팔",
}

# ── 2. 우선순위 기반 정규식 Fallback (충돌 방지 순서) ──
CATEGORY_PATTERNS = [
    # 1순위: 코어 (레그레이즈가 하체로 빠지는 것 방지)
    (
        "기타", # 코어 탭을 없앴으므로 기타(또는 복근 등 원하는 이름)로 배정
        [r"레그레이즈", r"행잉니레이즈", r"크런치", r"플랭크", r"앱휠"]
    ),
    # 2순위: 하체 (레그컬이 팔로, 레그프레스가 가슴으로 빠지는 것 방지)
    (
        "하체",
        [r"스쿼트", r"레그프레스", r"레그익스텐션", r"레그컬", r"햄스트링컬", r"힙쓰러스트", r"힙어브덕션", r"힙어덕션", r"런지", r"불가리안", r"카프", r"데드"]
    ),
    # 3순위: 어깨 (숄더프레스가 가슴으로 빠지는 것 방지)
    (
        "어깨",
        [r"숄더", r"오버헤드", r"밀리터리", r"아놀드", r"레터럴", r"사레레", r"페이스풀", r"리어델트", r"리버스펙덱"]
    ),
    # 4순위: 등
    (
        "등",
        [r"랫풀", r"풀다운", r"풀업", r"친업", r"로우", r"암풀", r"풀오버"]
    ),
    # 5순위: 팔
    (
        "팔",
        [r"이두", r"삼두", r"바이셉", r"트라이셉", r"푸시다운", r"킥백", r"프리처컬", r"해머컬", r"암컬", r"컬$"]
    ),
    # 6순위: 가슴 (가장 일반적인 단어들)
    (
        "가슴",
        [r"벤치", r"체스트", r"펙덱", r"케이블플라이", r"덤벨플라이", r"푸쉬업", r"푸시업", r"딥스", r"인클라인.*프레스", r"디클라인.*프레스"]
    ),
]

# ── 3. 분류기 엔진 ──
def get_category(workout_name: Optional[str]) -> str:
    canonical_name = normalize_workout_name(workout_name)

    # 1차: 확실한 이름은 명시적 맵에서 바로 반환
    exact_category = EXACT_CATEGORY_MAP.get(canonical_name)
    if exact_category:
        return exact_category

    # 2차: Fallback 비교를 위해 공백 및 특수문자 제거
    name_clean = workout_match_key(canonical_name)
    if not name_clean:
        return "기타"

    # 3차: 정해진 우선순위(충돌 방지)대로 정규식 검사
    for category, patterns in CATEGORY_PATTERNS:
        if any(re.search(pattern, name_clean) for pattern in patterns):
            return category

    # 4차: 여기까지 왔다면 진짜 모르는 운동
    return "기타"

# ── 설정 조회 ──
@app.get("/settings")
def get_settings(user_id: int = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT
                telegram_chat_id,
                discord_webhook_url,
                link_code,
                link_code_expires,
                show_last_workout
            FROM users WHERE id = %s
        """, (user_id,))
        
        row = cur.fetchone()

    finally:
        cur.close()
        release_conn(conn)
    return {
        "telegram_connected": row[0] is not None,
        "discord_webhook_url": row[1] or "",
        "link_code": row[2],
        "link_code_expires": str(row[3]) if row[3] else None,
        "show_last_workout": row[4]
            }

@app.post("/settings/last-workout")
def update_last_workout_setting(
    enabled: bool,
    user_id: int = Depends(get_current_user)
):
    conn = get_conn()
    cur = conn.cursor()

    try:
        cur.execute("""
            UPDATE users
            SET show_last_workout = %s
            WHERE id = %s
        """, (enabled, user_id))

        conn.commit()

    finally:
        cur.close()
        release_conn(conn)

    return {"status": "ok"}

@app.get("/last-workout")
def get_last_workout(userid: int = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT
                date,
                workout_name,
                COUNT(*) AS set_count,
                ROUND(AVG(weight_kg)::numeric, 1) AS avg_weight,
                ROUND(AVG(reps)::numeric, 1) AS avg_reps
            FROM public.workout_logs
            WHERE user_id = %s
            AND date = (
                SELECT MAX(date)
                FROM public.workout_logs
                WHERE user_id = %s
            )
            GROUP BY date, workout_name
            ORDER BY workout_name ASC
            """,
            (userid, userid),
        )
        rows = cur.fetchall()
    finally:
        cur.close()
        release_conn(conn)

    return [
        {
            "date": str(r[0]),
            "workoutname": r[1],
            "setcount": r[2],
            "avgweight": float(r[3]) if r[3] is not None else None,
            "avgreps": float(r[4]) if r[4] is not None else None,
        }
        for r in rows
    ]

# ── 디스코드 웹훅 저장 ──
@app.post("/settings/discord")
def save_discord(
    body: DiscordWebhookBody,
    user_id: int = Depends(get_current_user)
):
    webhook_url = body.webhook_url

    if len(webhook_url) > 500:
        raise HTTPException(status_code=400, detail="Webhook URL too long")
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE users SET discord_webhook_url = %s WHERE id = %s", (webhook_url, user_id))
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"status": "ok"}

# ── 텔레그램 연결용 임시 코드 발급 ──
@app.post("/settings/link-code")
def generate_link_code(user_id: int = Depends(get_current_user)):
    code = ''.join(random.choices(string.digits, k=6))
    expires = datetime.now() + timedelta(minutes=10)
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE users SET link_code = %s, link_code_expires = %s WHERE id = %s
        """, (code, expires, user_id))
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"code": code, "expires_in": "10분"}

# ── 봇에서 /link 코드 입력시 호출 ──
@app.post("/settings/link-telegram")
def link_telegram(body: dict):

    code = body.get("code")
    chat_id = str(body.get("chat_id"))

    conn = get_conn()
    cur = conn.cursor()

    try:

        cur.execute("""
            SELECT id, name
            FROM users
            WHERE link_code = %s
            AND link_code_expires > NOW()
        """, (code,))

        user = cur.fetchone()

        if not user:
            raise HTTPException(
                status_code=400,
                detail="코드가 잘못되었거나 만료되었습니다"
            )

        user_id = user[0]
        name = user[1] or "Unknown"

        cur.execute("""
            UPDATE users
            SET telegram_chat_id = %s,
                link_code = NULL,
                link_code_expires = NULL
            WHERE id = %s
        """, (chat_id, user_id))

        conn.commit()

        notify_admin(
            f"🔗 Telegram linked\n\n"
            f"👤 name: {name}\n"
            f"🆔 user_id: {user_id}\n"
            f"💬 telegram_chat_id: {chat_id}"
        )

    finally:
        cur.close()
        release_conn(conn)

    return {"status": "ok"}


# ── 엔드포인트 (JWT 인증 적용) ──
@app.get("/volume")
def get_volume(sessions: int = 10, user_id: int = Depends(get_current_user)):
    conn = get_conn()
    try:
        # 최근 운동한 날짜(session)들을 중복 없이 최신순으로 가져옵니다 (비교를 위해 목표치의 2배수 조회)
        df_dates = pd.read_sql("""
            SELECT DISTINCT date 
            FROM workout_logs 
            WHERE user_id = %s 
            ORDER BY date DESC 
            LIMIT %s
        """, conn, params=(user_id, sessions * 2))
        
        if df_dates.empty:
            return []
        
        valid_dates = df_dates['date'].tolist()
        
        cur_dates = valid_dates[:sessions]
        prev_dates = valid_dates[sessions:]
        
        if not cur_dates:
            return []

        # 가져온 날짜의 최소~최대 범위 데이터만 한 번에 조회합니다.
        min_date = valid_dates[-1]
        max_date = valid_dates[0]
        
        df = pd.read_sql("""
            SELECT date, workout_name, weight_kg, reps
            FROM workout_logs
            WHERE user_id = %s AND date >= %s AND date <= %s
        """, conn, params=(user_id, min_date, max_date))
    finally:
        release_conn(conn)

    df['date'] = pd.to_datetime(df['date']).dt.date
    df['volume'] = df['weight_kg'] * df['reps']
    
    # 여기서 카테고리가 분류됩니다 (정규화 후 매핑)
    df['category'] = df['workout_name'].apply(get_category)

    # 👇 터미널 print 대신 알림 함수(notify_admin)를 호출합니다 👇
    other_workouts = df[df['category'] == '기타']['workout_name'].unique().tolist()
    if other_workouts:
        msg = f"🚨 [디버깅] 기타 탭에 숨은 운동들:\n{', '.join(other_workouts)}"
        notify_admin(msg) # 👈 텔레그램/디스코드로 즉시 전송!

    # 최근 N회 날짜와 이전 N회 날짜를 분리
    cur_set = set(d for d in cur_dates)
    prev_set = set(d for d in prev_dates)

    cur = df[df['date'].isin(cur_set)]
    prev = df[df['date'].isin(prev_set)]

    cur_vol = cur.groupby('category')['volume'].sum()
    prev_vol = prev.groupby('category')['volume'].sum()

    # 표시할 카테고리 순서 (팔로 합치고 코어 제외)
    cat_order = ['등', '가슴', '어깨', '하체', '팔', '기타']
    all_cats = sorted(
        set(cur_vol.index) | set(prev_vol.index),
        key=lambda c: cat_order.index(c) if c in cat_order else 99
    )

    # 10회, 20회 등 유동적으로 라벨이 바뀝니다.
    cur_label = f"최근 {len(cur_dates)}일"
    prev_label = f"이전 {len(prev_dates)}일"

    result = []
    for cat in all_cats:
        result.append({
            "category": cat,
            cur_label: round(cur_vol.get(cat, 0)),
            prev_label: round(prev_vol.get(cat, 0)),
            "cur_label": cur_label,
            "prev_label": prev_label,
        })
    return result


@app.get("/1rm")
def get_1rm(user_id: int = Depends(get_current_user)):
    conn = get_conn()
    try:
        df = pd.read_sql("""
            SELECT date, workout_name, weight_kg, reps
            FROM workout_logs
            WHERE user_id = %s
        """, conn, params=(user_id,))
    finally:
        release_conn(conn)

    if df.empty:
        return []

    # 🚀 핵심: 데이터 정규화 적용!
    df['workout_name_raw'] = df['workout_name'].fillna("").astype(str)
    df['workout_name'] = df['workout_name_raw'].apply(normalize_workout_name)
    df['date'] = pd.to_datetime(df['date']).dt.date.astype(str)
    df['weight_kg'] = pd.to_numeric(df['weight_kg'], errors="coerce")
    df['reps'] = pd.to_numeric(df['reps'], errors="coerce")
    
    df = df.dropna(subset=["date", "workout_name", "weight_kg", "reps"])
    df = df[(df["weight_kg"] > 0) & (df["reps"] > 0)].copy()

    if df.empty:
        return []

    # 1RM 공식 계산
    df['1rm'] = df.apply(
        lambda r: round(r['weight_kg'] * (1 + r['reps']/30), 1) if r['reps'] > 1 else r['weight_kg'],
        axis=1
    )

    # 정규화된 운동 이름(workout_name) 기준으로 최고 1RM 찾기
    idx = df.groupby('workout_name')['1rm'].idxmax()
    return df.loc[idx][['workout_name', '1rm', 'weight_kg', 'reps', 'date']].to_dict(orient='records')



# 업무 기준 시간대 (KST, Asia/Seoul, UTC+9)
BUSINESS_TZ = timezone(timedelta(hours=9))

def get_business_today() -> date:
    return datetime.now(BUSINESS_TZ).date()

def validate_workout_date(date_str: str | None) -> date:
    """
    날짜 문자열을 검증하고 업무 시간대(Asia/Seoul, UTC+9) 기준으로 미래 날짜를 차단합니다.
    date_str 생략 시 하위 호환을 위해 get_business_today()를 반환합니다.
    """
    if not date_str:
        return get_business_today()

    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        raise HTTPException(
            status_code=400,
            detail="유효하지 않은 날짜 형식입니다. (YYYY-MM-DD 형식 필요)"
        )

    try:
        parsed_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="달력에 존재하지 않는 유효하지 않은 날짜입니다."
        )

    today_kst = get_business_today()
    if parsed_date > today_kst:
        raise HTTPException(
            status_code=400,
            detail=f"미래 날짜의 운동 기록은 저장할 수 없습니다. (기준일: {today_kst})"
        )

    return parsed_date

@app.post("/record")
async def post_record(
    workout_name: str,
    weight_kg: str,
    reps: int,
    unit: str='kg',
    duration_sec: int | None = None,
    set_type: str = "normal",
    set_group: str | None = None,
    date_str: str | None = None,
    user_id: int = Depends(get_current_user)
):
    conn = get_conn()
    cur = conn.cursor()

    try:
        log_date = validate_workout_date(date_str)
        parsed_weight, parsed_unit = parse_weight_input(weight_kg)
        workout_name = normalize_workout_name(workout_name)

        # 기록 저장
        cur.execute("""
            INSERT INTO workout_logs
            (
                user_id,
                date,
                workout_name,
                weight_kg,
                reps,
                unit,
                duration_sec,
                set_type,
                set_group
            )
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            user_id,
            log_date,
            workout_name,
            parsed_weight,
            reps,
            parsed_unit,
            duration_sec,
            set_type,
            set_group
        ))
    
    # 유저 알림 설정 조회
        cur.execute("""
            SELECT telegram_chat_id, discord_webhook_url FROM users WHERE id = %s
        """, (user_id,))
        row = cur.fetchone()
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)

    telegram_chat_id = row[0] if row else None
    discord_webhook_url = row[1] if row else None
    
    today_kst = get_business_today()
    date_notice = "" if log_date == today_kst else f" ({log_date} 기록)"

    if parsed_unit == "lbs":
        original_lbs = round(parsed_weight / 0.453592, 1)
        msg = (
            f"💪 운동 기록!{date_notice}\n"
            f"{workout_name} "
            f"{original_lbs}lbs ({parsed_weight}kg) × {reps}회"
        )
    else:
        msg = (
            f"💪 운동 기록!{date_notice}\n"
            f"{workout_name} {parsed_weight}kg × {reps}회"
        )

    # 텔레그램 알림
    if telegram_chat_id:
        TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
        async with httpx.AsyncClient() as client:
            await client.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": telegram_chat_id, "text": msg}
            )

    # 디스코드 알림
    if discord_webhook_url:
        async with httpx.AsyncClient() as client:
            await client.post(discord_webhook_url, json={"content": msg})

    return {"status": "ok"}


@app.get("/logs")
def get_logs(user_id: int = Depends(get_current_user), month: str = None, date_str: str = None):
    conn = get_conn()

    if month:
        try:
            # 근력 날짜
            df_strength = pd.read_sql("""
                SELECT DISTINCT date FROM workout_logs
                WHERE user_id = %s AND TO_CHAR(date, 'YYYY-MM') = %s
            """, conn, params=(user_id, month))

            # 유산소 날짜
            df_cardio = pd.read_sql("""
                SELECT DISTINCT date FROM cardio_logs
                WHERE user_id = %s AND TO_CHAR(date, 'YYYY-MM') = %s
            """, conn, params=(user_id, month))
        finally:
            release_conn(conn)

        strength_dates = set(df_strength['date'].astype(str).tolist())
        cardio_dates   = set(df_cardio['date'].astype(str).tolist())
        all_dates      = strength_dates | cardio_dates

        return {
            "dates":          sorted(all_dates),
            "strength_dates": sorted(strength_dates),
            "cardio_dates":   sorted(cardio_dates),
        }

    if date_str:
        try:
            df = pd.read_sql("""
                SELECT id, workout_name, weight_kg, reps, unit
                FROM workout_logs
                WHERE user_id = %s AND date::text = %s
                ORDER BY workout_name, id
            """, conn, params=(user_id, date_str))
        finally:
            release_conn(conn)
        df['set_no'] = df.groupby('workout_name').cumcount() + 1
        return df.to_dict(orient='records')
    release_conn(conn)
    return {"error": "month 또는 date_str 파라미터 필요"}

# ── 바디 로그 ──
@app.post("/body")
def post_body(
    weight_kg: float = None,
    body_fat_pct: float = None,
    muscle_kg: float = None,
    memo: str = None,
    user_id: int = Depends(get_current_user)
):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO body_logs (user_id, date, weight_kg, body_fat_pct, muscle_kg, memo)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (user_id, date.today(), weight_kg, body_fat_pct, muscle_kg, memo))
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"status": "ok"}

@app.get("/body")
def get_body(user_id: int = Depends(get_current_user)):
    conn = get_conn()
    try:
        df = pd.read_sql("""
            SELECT id, date, weight_kg, body_fat_pct, muscle_kg, memo
            FROM body_logs
            WHERE user_id = %s
            ORDER BY date
        """, conn, params=(user_id,))
    finally:
        release_conn(conn)
    df['date'] = df['date'].astype(str)
    return df.to_dict(orient='records')

@app.delete("/body/{log_id}")
def delete_body(log_id: int, user_id: int = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM body_logs WHERE id = %s AND user_id = %s", (log_id, user_id))
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"status": "ok"}

@app.delete("/logs/{log_id}")
def delete_log(log_id: int, user_id: int = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM workout_logs WHERE id = %s AND user_id = %s", (log_id, user_id))
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"status": "ok"} 

# ── 식단 로그 ──
@app.post("/meal")
def post_meal(
    meal_type: str,
    food_name: str,
    kcal: float = None,
    protein: float = None,
    carb: float = None,
    fat: float = None,
    memo: str = None,
    user_id: int = Depends(get_current_user)
):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO meal_logs (user_id, date, meal_type, food_name, kcal, protein, carb, fat, memo)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (user_id, date.today(), meal_type, food_name, kcal, protein, carb, fat, memo))
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"status": "ok"}

@app.get("/meal")
def get_meal(date_str: str = None, user_id: int = Depends(get_current_user)):

    conn = get_conn()

    try:

        if date_str:

            df = pd.read_sql("""
                SELECT id, date, meal_type, food_name,
                    kcal, protein, carb, fat, memo
                FROM meal_logs
                WHERE user_id = %s AND date = %s
                ORDER BY meal_type, id
            """, conn, params=(user_id, date_str))

        else:

            df = pd.read_sql("""
                SELECT id, date, meal_type, food_name,
                    kcal, protein, carb, fat, memo
                FROM meal_logs
                WHERE user_id = %s
                ORDER BY date DESC, meal_type, id
            """, conn, params=(user_id,))

    finally:

        release_conn(conn)

    df = df.replace({np.nan: None})

    df['date'] = df['date'].astype(str)

    return df.to_dict(orient='records')

@app.delete("/meal/{meal_id}")
def delete_meal(meal_id: int, user_id: int = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM meal_logs WHERE id = %s AND user_id = %s", (meal_id, user_id))
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"status": "ok"}

# ── 루틴 ──
@app.get("/routines")
def get_routines(user_id: int = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, name, exercises FROM routines
            WHERE user_id = %s
            ORDER BY sort_order ASC, id ASC
        """, (user_id,))
        rows = cur.fetchall()
    finally:
        cur.close()
        release_conn(conn)
    return [{"id": r[0], "name": r[1], "exercises": r[2]} for r in rows]

@app.post("/routines")
def post_routine(body: RoutineBody, user_id: int = Depends(get_current_user)):
    import json
    name = body.name
    exercises = [e.dict() for e in body.exercises]
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO routines (user_id, name, exercises)
            VALUES (%s, %s, %s) RETURNING id
        """, (user_id, name, json.dumps(exercises, ensure_ascii=False)))
        row = cur.fetchone()
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"status": "ok", "id": row[0]}

@app.delete("/routines/{routine_id}")
def delete_routine(routine_id: int, user_id: int = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM routines WHERE id = %s AND user_id = %s", (routine_id, user_id))
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"status": "ok"}

# ── 목표 설정 ──
@app.get("/goals")
def get_goals(user_id: int = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT goal_weight, goal_body_fat, goal_muscle, ai_memo
            FROM users WHERE id = %s
        """, (user_id,))
        row = cur.fetchone()
    finally:
        cur.close()
        release_conn(conn)
    return {
            "goal_weight": row[0],
            "goal_body_fat": row[1],
            "goal_muscle": row[2],
            "ai_memo": row[3] or ""
            }

@app.post("/goals")
def save_goals(body: dict, user_id: int = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE users SET
                goal_weight = %s,
                goal_body_fat = %s,
                goal_muscle = %s,
                ai_memo = %s
            WHERE id = %s
        """, (
            body.get("goal_weight"),
            body.get("goal_body_fat"),
            body.get("goal_muscle"),
            body.get("ai_memo"),
            user_id
        ))
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"status": "ok"}

# ── AI 추천 결과 조회 ──
@app.get("/ai/recommend")
def get_ai_recommend(user_id: int = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT ai_last_result, ai_last_updated FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
    finally:
        cur.close()
        release_conn(conn)
    return {
            "result": row[0] or "",
            "updated_at": str(row[1]) if row[1] else None
            }
    
# ── AI 추천 ──
@app.post("/ai/recommend")
@limiter.limit("5/minute")
async def ai_recommend(request: Request, user_id: int = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        # 목표 + 메모
        cur.execute("""
            SELECT goal_weight, goal_body_fat, goal_muscle, ai_memo
            FROM users WHERE id = %s
        """, (user_id,))
        goals = cur.fetchone()

        # 최근 바디 기록 (최근 5개)
        cur.execute("""
            SELECT date, weight_kg, body_fat_pct, muscle_kg, memo
            FROM body_logs WHERE user_id = %s
            ORDER BY date DESC LIMIT 5
        """, (user_id,))
        body_logs = cur.fetchall()

        # 최근 운동 기록 (최근 2주)
        cur.execute("""
            SELECT date, workout_name, weight_kg, reps
            FROM workout_logs WHERE user_id = %s
            AND date >= NOW() - INTERVAL '14 days'
            ORDER BY date DESC
        """, (user_id,))
        workout_logs = cur.fetchall()

        # 최근 식단 기록 (최근 3일)
        cur.execute("""
            SELECT date, meal_type, food_name, kcal, protein, carb, fat, memo
            FROM meal_logs WHERE user_id = %s
            AND date >= NOW() - INTERVAL '3 days'
            ORDER BY date DESC
        """, (user_id,))
        meal_logs = cur.fetchall()

        # 루틴
        cur.execute("""
            SELECT name, exercises FROM routines WHERE user_id = %s
        """, (user_id,))
        routines = cur.fetchall()

        #⚠️ AI abuse
        cur.execute("""
            SELECT COUNT(*)
            FROM users
            WHERE ai_last_updated > NOW() - INTERVAL '10 minutes'
            AND id = %s
        """, (user_id,))

        recent_ai_count = cur.fetchone()[0]

        if recent_ai_count >= 5:

            notify_admin(
                f"⚠️ AI abuse\n\n"
                f"user_id: {user_id}\n"
                f"requests: {recent_ai_count} in 10min"
            )

    finally:
        cur.close()
        release_conn(conn)

    # 프롬프트 구성
    prompt = "당신은 전문 피트니스 트레이너이자 영양사입니다. 아래 사용자 데이터를 분석해서 한국어로 답변해주세요.\n\n"

    if goals:
        prompt += f"## 목표\n"
        if goals[0]: prompt += f"- 목표 체중: {goals[0]}kg\n"
        if goals[1]: prompt += f"- 목표 체지방률: {goals[1]}%\n"
        if goals[2]: prompt += f"- 목표 골격근량: {goals[2]}kg\n"
        if goals[3]: prompt += f"- 메모: {goals[3]}\n"
        prompt += "\n"

    if body_logs:
        prompt += "## 최근 바디 기록\n"
        for log in body_logs:
            prompt += f"- {log[0]}: 체중 {log[1]}kg, 체지방률 {log[2]}%, 근육량 {log[3]}kg"
            if log[4]: prompt += f" (메모: {log[4]})"
            prompt += "\n"
        prompt += "\n"

    if workout_logs:
        prompt += "## 최근 2주 운동 기록\n"
        from collections import defaultdict
        by_date = defaultdict(list)
        for log in workout_logs:
            by_date[str(log[0])].append(f"{log[1]} {log[2]}kg×{log[3]}회")
        for d, logs in sorted(by_date.items(), reverse=True):
            prompt += f"- {d}: {', '.join(logs)}\n"
        prompt += "\n"

    if meal_logs:
        prompt += "## 최근 3일 식단\n"
        for log in meal_logs:
            prompt += f"- {log[0]} {log[1]}: {log[2]}"
            if log[3]: prompt += f" ({log[3]}kcal, 단백질 {log[4]}g, 탄수 {log[5]}g, 지방 {log[6]}g)"
            if log[7]: prompt += f" (메모: {log[7]})"
            prompt += "\n"
        prompt += "\n"

    if routines:
        prompt += "## 현재 루틴\n"
        for r in routines:
            prompt += f"- {r[0]}\n"
        prompt += "\n"

    prompt += """다음 지시를 정확히 따르세요: 인사말, 자기소개, 마무리 멘트 없이 바로 본론만 답하세요. 마크다운 기호(##, **, *, ---) 절대 사용 금지.\n\n
    다음 5가지를 간결하게 한국어로 답해주세요. 마크다운 기호(##, **, *, ---)는 절대 사용하지 마세요. 각 항목은 2~4문장으로 핵심만.

1. 현재 상태: 목표 대비 현재 체중/체지방/근육량 차이
2. 예상 기간: 목표 달성까지 현실적인 기간
3. 루틴 추천: 메모의 조건을 반영한 핵심 운동 3~5가지
4. 식단 추천: 메모의 조건(지역 등)을 반영한 핵심 식단 3~5가지
5. 개선 포인트: 현재 기록에서 고칠 점 2~3가지

간결하고 실용적으로, 불필요한 설명 없이."""

    # Gemini API 호출
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    async with httpx.AsyncClient(timeout=60) as client:
        try:
            res = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}",
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "thinkingConfig": {
                            "thinkingBudget": 0  # thinking 비활성화
                        }
                    }
                }
            )

            # 상태 코드 확인
            print("GEMINI STATUS:", res.status_code)
            result = res.json()
            print("GEMINI RESPONSE:", result)

            if res.status_code != 200:
                text = f"Gemini 오류 ({res.status_code}): {result.get('error', {}).get('message', '알 수 없는 오류')}"
            else:
                text = result["candidates"][0]["content"]["parts"][0]["text"]

        except httpx.RequestError as e:
            # 네트워크/타임아웃 오류
            print("Gemini RequestError:", str(e))
            text = f"AI 요청 실패: {str(e)}"
        except KeyError as e:
            # 응답 구조가 예상과 다를 때
            print("Gemini KeyError:", str(e), "Response:", result)
            text = f"AI 응답 파싱 실패: {str(e)}"
        except Exception as e:
            # 기타 예외
            print("Gemini Exception:", str(e))
            text = f"AI 처리 중 오류 발생: {str(e)}"
        
    # DB에 저장
    conn2 = get_conn()
    cur2 = conn2.cursor()
    try:
        cur2.execute("""
            UPDATE users SET ai_last_result = %s, ai_last_updated = NOW()
            WHERE id = %s
        """, (text, user_id))
        conn2.commit()
    finally:

        cur2.close()
        release_conn(conn2)
    return {"result": text}

# ──────────────────────────────────────────
# 유산소 기록 (cardio_logs)
# ──────────────────────────────────────────

@app.get("/cardio")
def get_cardio(
    date_str: str = None,
    month: str = None,
    user_id: int = Depends(get_current_user)
):
    conn = get_conn()
    cur = conn.cursor()
    try:

        if date_str:
            cur.execute("""
                SELECT id, date, cardio_name, duration_min, distance_km, pace, incline, kcal, memo
                FROM cardio_logs
                WHERE user_id = %s AND date = %s
                ORDER BY id ASC
            """, (user_id, date_str))
        elif month:
            cur.execute("""
                SELECT id, date, cardio_name, duration_min, distance_km, pace, incline, kcal, memo
                FROM cardio_logs
                WHERE user_id = %s AND TO_CHAR(date, 'YYYY-MM') = %s
                ORDER BY date DESC, id ASC
            """, (user_id, month))
        else:
            cur.execute("""
                SELECT id, date, cardio_name, duration_min, distance_km, pace, incline, kcal, memo
                FROM cardio_logs
                WHERE user_id = %s
                ORDER BY date DESC, id ASC
            """, (user_id,))

        rows = cur.fetchall()
    finally:
        cur.close()
        release_conn(conn)

    return [
            {
                "id": r[0],
                "date": str(r[1]),
                "cardio_name": r[2],
                "duration_min": r[3],
                "distance_km": r[4],
                "pace": r[5],
                "incline": r[6],
                "kcal": r[7],
                "memo": r[8],
            }
            for r in rows
            ]


@app.post("/cardio")
def post_cardio(
    cardio_name: str = "런닝머신",
    duration_min: float = None,
    distance_km: float = None,
    pace: str = None,
    incline: float = None,
    kcal: float = None,
    memo: str = None,
    date_str: str = None,
    user_id: int = Depends(get_current_user)
):
    conn = get_conn()
    cur = conn.cursor()
    try:
        log_date = validate_workout_date(date_str)
        cur.execute("""
            INSERT INTO cardio_logs
                (user_id, date, cardio_name, duration_min, distance_km, pace, incline, kcal, memo)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (user_id, log_date, cardio_name, duration_min, distance_km, pace, incline, kcal, memo))
        new_id = cur.fetchone()[0]
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"id": new_id, "message": "저장 완료"}


@app.delete("/cardio/{log_id}")
def delete_cardio(log_id: int, user_id: int = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            "DELETE FROM cardio_logs WHERE id = %s AND user_id = %s",
            (log_id, user_id)
        )
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"message": "삭제 완료"}


# ── 루틴 히스토리 (이전 기록) ──
@app.get("/routines/{routine_id}/history")
def get_routine_history(routine_id: int, user_id: int = Depends(get_current_user)):
    import json
    conn = get_conn()
    cur = conn.cursor()
    try:
        # 루틴 정보 조회
        cur.execute("""
            SELECT name, exercises FROM routines
            WHERE id = %s AND user_id = %s
        """, (routine_id, user_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "루틴 없음")

        exercises = row[1] if isinstance(row[1], list) else json.loads(row[1])

        result = []
        for ex in exercises:
            workout_name = ex.get("workout_name")
            target_sets  = int(ex.get("sets") or 0)

            # 목표 횟수 범위 파싱 (예: "5~8" or "8" or "5-8")
            reps_raw = str(ex.get("reps", "")).strip()
            import re
            match = re.search(r'(\d+)\s*[~\-]\s*(\d+)', reps_raw)
            if match:
                reps_min = int(match.group(1))
                reps_max = int(match.group(2))
            elif re.match(r'^\d+$', reps_raw):
                reps_min = int(reps_raw)
                reps_max = int(reps_raw)
            else:
                reps_min, reps_max = 0, 9999

            # 가장 최근 운동 날짜에서 해당 운동 기록 조회
            # 정확히 일치하는 이름 먼저, 없으면 포함된 이름으로 검색
            workout_name_no_space = workout_name.replace(" ", "")

            cur.execute("""
                SELECT workout_name FROM workout_logs
                WHERE user_id = %s AND (
                    workout_name = %s
                    OR workout_name ILIKE %s
                    OR %s ILIKE '%%' || workout_name || '%%'
                    OR workout_name ILIKE '%%' || %s || '%%'
                    OR REPLACE(workout_name, ' ', '') = %s
                    OR REPLACE(workout_name, ' ', '') ILIKE %s
                    OR %s ILIKE '%%' || REPLACE(workout_name, ' ', '') || '%%'
                )
                GROUP BY workout_name
                ORDER BY COUNT(*) DESC
                LIMIT 1
            """, (
                user_id,
                workout_name,
                f"%{workout_name}%",
                workout_name,
                workout_name,
                workout_name_no_space,
                f"%{workout_name_no_space}%",
                workout_name_no_space,
            ))

            matched = cur.fetchone()
            matched_name = matched[0] if matched else workout_name

            # 정확히 일치 우선, 없으면 유사 이름으로 매칭
            cur.execute("""
                SELECT workout_name FROM workout_logs
                WHERE user_id = %s AND (
                    workout_name = %s
                    OR workout_name ILIKE %s
                    OR %s ILIKE '%%' || workout_name || '%%'
                    OR workout_name ILIKE '%%' || %s || '%%'
                )
                GROUP BY workout_name
                ORDER BY COUNT(*) DESC
                LIMIT 1
            """, (user_id, workout_name, f"%{workout_name}%", workout_name, workout_name))
            matched = cur.fetchone()
            matched_name = matched[0] if matched else workout_name

            cur.execute("""
                SELECT date, weight_kg, reps
                FROM workout_logs
                WHERE user_id = %s AND workout_name = %s
                AND date = (
                    SELECT MAX(date) FROM workout_logs
                    WHERE user_id = %s AND workout_name = %s
                )
                ORDER BY id ASC
            """, (user_id, matched_name, user_id, matched_name))
            logs = cur.fetchall()

            # 목표 횟수 범위 내 세트만 필터링
            valid_sets = [r for r in logs if reps_min <= r[2] <= reps_max]
            all_sets   = logs  # 범위 외 포함 전체

            if not logs:
                # 기록 자체가 없음
                result.append({
                    "workout_name": workout_name,
                    "target_sets": target_sets,
                    "target_reps": reps_raw,
                    "last_date": None,
                    "display": None,
                    "status": "no_data",
                })
                continue

            last_date = str(logs[0][0])
            actual_set_count = len(all_sets)

            if len(valid_sets) == 0:
                # 유효 세트 없음 (전부 범위 미달)
                result.append({
                    "workout_name": workout_name,
                    "target_sets": target_sets,
                    "target_reps": reps_raw,
                    "last_date": last_date,
                    "display": None,
                    "status": "invalid",  # 미달이라 표시 안 함
                })
                continue

            # 목표 세트 수 달성 여부
            if actual_set_count >= target_sets and len(valid_sets) >= target_sets:
                # 완수: 평균으로 표시
                avg_weight = round(sum(r[1] for r in valid_sets) / len(valid_sets), 1)
                avg_reps   = round(sum(r[2] for r in valid_sets) / len(valid_sets), 1)
                display_sets = actual_set_count  # 초과 세트도 표시
                result.append({
                    "workout_name": workout_name,
                    "target_sets": target_sets,
                    "target_reps": reps_raw,
                    "last_date": last_date,
                    "display": {
                        "type": "average",
                        "sets": display_sets,
                        "avg_weight": avg_weight,
                        "avg_reps": int(avg_reps),
                    },
                    "status": "completed",
                })
            else:
                # 목표 미달성이지만 유효 세트는 있음: 세트별로 표시
                result.append({
                    "workout_name": workout_name,
                    "target_sets": target_sets,
                    "target_reps": reps_raw,
                    "last_date": last_date,
                    "display": {
                        "type": "sets",
                        "sets": actual_set_count,
                        "detail": [{"weight": r[1], "reps": r[2]} for r in valid_sets],
                    },
                    "status": "partial",
                })
    finally:
        cur.close()
        release_conn(conn)
    return result

# ── 운동명 목록 (자동완성용) ──
# ── 운동명 목록 (자동완성용) ──
@app.get("/workout-names")
def get_workout_names(user_id: int = Depends(get_current_user)):
    # 정적 목록 (EXACT_CATEGORY_MAP에 등록된 정식 명칭들 사용)
    static_names = list(EXACT_CATEGORY_MAP.keys())

    # DB에서 실제 기록한 운동명
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT DISTINCT workout_name FROM workout_logs
            WHERE user_id = %s
            ORDER BY workout_name
        """, (user_id,))
        db_names = [row[0] for row in cur.fetchall()]
    finally:
        cur.close()
        release_conn(conn)

    # 합치고 중복 제거, 정렬
    combined = sorted(set(static_names + db_names))
    return combined

# ── 루틴 순서 저장 ──
@app.put("/routines/reorder")
def reorder_routines(body: dict, user_id: int = Depends(get_current_user)):
    # body: { "order": [id1, id2, id3, ...] }
    order = body.get("order", [])
    conn = get_conn()
    cur = conn.cursor()
    try:
        for idx, routine_id in enumerate(order):
            cur.execute("""
                UPDATE routines SET sort_order = %s
                WHERE id = %s AND user_id = %s
            """, (idx, routine_id, user_id))
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"status": "ok"}

# ── 루틴 수정 ──
@app.put("/routines/{routine_id}")
def update_routine(routine_id: int, body: dict, user_id: int = Depends(get_current_user)):
    import json
    name = body.get("name")
    exercises = body.get("exercises", [])
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE routines SET name = %s, exercises = %s
            WHERE id = %s AND user_id = %s
        """, (name, json.dumps(exercises, ensure_ascii=False), routine_id, user_id))
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"status": "ok"}

# ── 식단 템플릿 ──
# ── 템플릿 이름 관리 ──
@app.get("/meal-template-names")
def get_meal_template_names(user_id: int = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, name, sort_order FROM meal_template_names
            WHERE user_id = %s ORDER BY sort_order, id
        """, (user_id,))
        rows = cur.fetchall()
    finally:
        cur.close()
        release_conn(conn)
    return [{"id": r[0], "name": r[1], "sort_order": r[2]} for r in rows]

@app.post("/meal-template-names")
def post_meal_template_name(body: dict, user_id: int = Depends(get_current_user)):
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(400, "이름 필요")
    conn = get_conn()
    cur = conn.cursor()
    try:
        # 중복 체크
        cur.execute("SELECT id FROM meal_template_names WHERE user_id = %s AND name = %s", (user_id, name))
        if cur.fetchone():
            raise HTTPException(400, "이미 존재하는 이름")
        cur.execute("""
            INSERT INTO meal_template_names (user_id, name, sort_order)
            VALUES (%s, %s, (SELECT COALESCE(MAX(sort_order)+1, 0) FROM meal_template_names WHERE user_id = %s))
            RETURNING id
        """, (user_id, name, user_id))
        new_id = cur.fetchone()[0]
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"id": new_id, "status": "ok"}

@app.delete("/meal-template-names/{name_id}")
def delete_meal_template_name(name_id: int, user_id: int = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        # 템플릿 이름 조회
        cur.execute("SELECT name FROM meal_template_names WHERE id = %s AND user_id = %s", (name_id, user_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "없음")
        # 해당 이름의 템플릿 항목도 같이 삭제
        cur.execute("DELETE FROM meal_templates WHERE user_id = %s AND template_name = %s", (user_id, row[0]))
        cur.execute("DELETE FROM meal_template_names WHERE id = %s AND user_id = %s", (name_id, user_id))
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"status": "ok"}

# ── 식단 템플릿 (serving_unit, serving_size 포함) ──
@app.get("/meal-templates")
def get_meal_templates(user_id: int = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, template_name, meal_type, food_name,
                kcal, protein, carb, fat, memo, sort_order,
                serving_unit, serving_size
            FROM meal_templates
            WHERE user_id = %s
            ORDER BY template_name, sort_order, id
        """, (user_id,))
        rows = cur.fetchall()
    finally:
        cur.close()
        release_conn(conn)
    return [
            {
                "id": r[0], "template_name": r[1], "meal_type": r[2],
                "food_name": r[3], "kcal": r[4], "protein": r[5],
                "carb": r[6], "fat": r[7], "memo": r[8], "sort_order": r[9],
                "serving_unit": r[10], "serving_size": r[11],
            }
            for r in rows
            ]

@app.post("/meal-templates")
def post_meal_template(body: dict, user_id: int = Depends(get_current_user)):
    serving_unit = body.get("serving_unit", "total")  # 'total' | 'per100g'
    serving_size = body.get("serving_size")            # 기준 중량 (g)
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO meal_templates
                (user_id, template_name, meal_type, food_name,
                kcal, protein, carb, fat, memo, sort_order,
                serving_unit, serving_size)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (
            user_id,
            body.get("template_name", "운동일"),
            body.get("meal_type"),
            body.get("food_name"),
            body.get("kcal"),
            body.get("protein"),
            body.get("carb"),
            body.get("fat"),
            body.get("memo"),
            body.get("sort_order", 0),
            serving_unit,
            serving_size,
        ))
        new_id = cur.fetchone()[0]
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"id": new_id, "status": "ok"}

@app.post("/meal-templates/apply")
def apply_meal_template(body: dict, user_id: int = Depends(get_current_user)):
    template_name = body.get("template_name", "운동일")
    date_str = body.get("date_str", str(date.today()))
    # 섭취량 오버라이드: { template_item_id: intake_g }
    intakes = body.get("intakes", {})

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, meal_type, food_name, kcal, protein, carb, fat, memo,
                serving_unit, serving_size
            FROM meal_templates
            WHERE user_id = %s AND template_name = %s
            ORDER BY sort_order, id
        """, (user_id, template_name))
        templates = cur.fetchall()

        if not templates:
            raise HTTPException(404, "템플릿 없음")

        for t in templates:
            tid, meal_type, food_name, kcal, protein, carb, fat, memo, serving_unit, serving_size = t
            intake_g = intakes.get(str(tid))

            # 섭취량 입력 시 자동계산
            if intake_g and serving_size and serving_size > 0:
                ratio = float(intake_g) / float(serving_size)
                kcal    = round(kcal    * ratio, 1) if kcal    else None
                protein = round(protein * ratio, 1) if protein else None
                carb    = round(carb    * ratio, 1) if carb    else None
                fat     = round(fat     * ratio, 1) if fat     else None
                food_name = f"{food_name} {intake_g}g"
            elif intake_g and serving_unit == "per100g":
                ratio = float(intake_g) / 100
                kcal    = round(kcal    * ratio, 1) if kcal    else None
                protein = round(protein * ratio, 1) if protein else None
                carb    = round(carb    * ratio, 1) if carb    else None
                fat     = round(fat     * ratio, 1) if fat     else None
                food_name = f"{food_name} {intake_g}g"

            cur.execute("""
                INSERT INTO meal_logs
                    (user_id, date, meal_type, food_name, kcal, protein, carb, fat, memo)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (user_id, date_str, meal_type, food_name, kcal, protein, carb, fat, memo))

        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"status": "ok", "applied": len(templates)}

@app.delete("/meal-templates/{template_id}")
def delete_meal_template(template_id: int, user_id: int = Depends(get_current_user)):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            "DELETE FROM meal_templates WHERE id = %s AND user_id = %s",
            (template_id, user_id)
        )
        conn.commit()
    finally:
        cur.close()
        release_conn(conn)
    return {"status": "ok"}

# ── 운동별 1RM 추세 ──
@app.get("/trends")
def get_trends(
    workout_name: str | None = None,
    days: int = Query(default=30, ge=1, le=365),
    user_id: int = Depends(get_current_user),
):
    cutoff_date = date.today() - timedelta(days=days)
    
    # SQL 파라미터 바인딩 적용
    sql = """
        SELECT date, workout_name, weight_kg, reps
        FROM workout_logs
        WHERE user_id = %s AND date >= %s
        ORDER BY date ASC
    """
    
    conn = get_conn()
    try:
        df = pd.read_sql(sql, conn, params=(user_id, cutoff_date))
    finally:
        release_conn(conn)

    if df.empty:
        return [] if workout_name else {"workouts": [], "data": []}

    # 정규화 진행
    df["workout_name_raw"] = df["workout_name"].fillna("").astype(str)
    df["workout_name_normalized"] = df["workout_name_raw"].apply(normalize_workout_name)
    df["date"] = pd.to_datetime(df["date"]).dt.date.astype(str)
    df["weight_kg"] = pd.to_numeric(df["weight_kg"], errors="coerce")
    df["reps"] = pd.to_numeric(df["reps"], errors="coerce")
    
    df = df.dropna(subset=["date", "workout_name_normalized", "weight_kg", "reps"])
    df = df[(df["weight_kg"] > 0) & (df["reps"] > 0)].copy()

    if df.empty:
        return [] if workout_name else {"workouts": [], "data": []}

    df["est_1rm"] = (df["weight_kg"] * (1 + df["reps"] / 30)).round(1)

    if workout_name:
        requested_name = normalize_workout_name(workout_name)
        filtered_df = df[df["workout_name_normalized"] == requested_name].copy()

        if filtered_df.empty:
            return []

        daily_best_idx = filtered_df.groupby("date")["est_1rm"].idxmax()
        result = filtered_df.loc[daily_best_idx].sort_values("date")[
            ["date", "weight_kg", "reps", "est_1rm", "workout_name_raw", "workout_name_normalized"]
        ]
        return result.to_dict(orient="records")

    best = (
        df.groupby(["workout_name_normalized", "date"], as_index=False)["est_1rm"]
        .max()
        .rename(columns={"workout_name_normalized": "workout_name"})
        .sort_values(["workout_name", "date"])
    )

    return {
        "workouts": sorted(best["workout_name"].unique().tolist()),
        "data": best.to_dict(orient="records"),
    }

# ── 머신러닝: 다음 세션 추천 + 과훈련 감지 ──
@app.get("/ml/recommend")
def ml_recommend(user_id: int = Depends(get_current_user)):
    conn = get_conn()
    try:
        df = pd.read_sql("""
            SELECT date, workout_name, weight_kg, reps
            FROM workout_logs
            WHERE user_id = %s
            ORDER BY date ASC
        """, conn, params=(user_id,))
    finally:
        release_conn(conn)

    if df.empty:
        return {"recommendations": [], "warnings": [], "data_count": 0, "min_sessions_required": 5}

    df['date'] = pd.to_datetime(df['date'])
    
    # 🚀 ML 데이터셋 정규화
    df['workout_name_raw'] = df['workout_name']
    df['workout_name_normalized'] = df['workout_name_raw'].apply(normalize_workout_name)

    df['est_1rm'] = df.apply(
        lambda r: round(r['weight_kg'] * (1 + r['reps'] / 30), 1) if r['reps'] > 1 else r['weight_kg'],
        axis=1
    )

    # 날짜+정규화된 운동별 최고 1RM
    best = df.groupby(['workout_name_normalized', 'date'])['est_1rm'].max().reset_index()
    best = best.sort_values('date')

    recommendations = []
    warnings = []
    MIN_SAMPLES = 5

    for workout_name in best['workout_name_normalized'].unique():
        sub = best[best['workout_name_normalized'] == workout_name].copy()
        sub = sub.sort_values('date').reset_index(drop=True)

        # 🚀 데이터 부족 시 스킵 및 경고 추가
        if len(sub) < MIN_SAMPLES:
            continue

        # 날짜를 숫자로 변환 (첫 날 기준 일수)
        sub['day_num'] = (sub['date'] - sub['date'].min()).dt.days
        X = sub['day_num'].values.reshape(-1, 1)
        y = sub['est_1rm'].values

        # 선형 회귀
        model = LinearRegression()
        model.fit(X, y)
        r2 = model.score(X, y)
        
        # 🚀 신뢰도 등급 부여
        reliability = "높음" if r2 >= 0.7 else "보통" if r2 >= 0.4 else "낮음"

        # 다음 세션 예측 (마지막 날 + 평균 운동 간격)
        avg_interval = sub['day_num'].diff().mean()
        if pd.isna(avg_interval) or avg_interval <= 0:
            avg_interval = 7
        next_day = sub['day_num'].iloc[-1] + avg_interval
        predicted_1rm = round(model.predict([[next_day]])[0], 1)

        # 현재 최고 1RM 및 마지막 무게
        current_1rm = sub['est_1rm'].iloc[-1]
        last_weight = df[df['workout_name_normalized'] == workout_name]['weight_kg'].iloc[-1]

        # 추천 무게 계산
        recommended_weight = round(predicted_1rm * 0.85 / 2.5) * 2.5 
        recommended_10rm = round(predicted_1rm * 0.75 / 2.5) * 2.5

        # 추세 방향
        slope = model.coef_[0]
        if slope > 0.1:
            trend = "📈 상승 중"
        elif slope < -0.1:
            trend = "📉 하락 중"
        else:
            trend = "➡️ 정체 중"

        recommendations.append({
            "workout_name": workout_name,
            "current_1rm": current_1rm,
            "predicted_1rm": predicted_1rm,
            "recommended_weight": recommended_weight,
            "recommended_10rm": recommended_10rm,
            "last_weight": last_weight,
            "trend": trend,
            "r2": round(r2, 2),
            "reliability": reliability,  # 신뢰도 필드 추가
            "sessions": len(sub),
            "slope_per_week": round(slope * 7, 2), 
        })

        # ── 과훈련 감지 ──
        today = df['date'].max()
        recent_2w = df[
            (df['workout_name_normalized'] == workout_name) &
            (df['date'] >= today - pd.Timedelta(days=14))
        ]
        prev_2w = df[
            (df['workout_name_normalized'] == workout_name) &
            (df['date'] >= today - pd.Timedelta(days=28)) &
            (df['date'] < today - pd.Timedelta(days=14))
        ]

        if not recent_2w.empty and not prev_2w.empty:
            recent_vol = (recent_2w['weight_kg'] * recent_2w['reps']).sum()
            prev_vol   = (prev_2w['weight_kg']   * prev_2w['reps']).sum()
            if prev_vol > 0:
                vol_change = (recent_vol - prev_vol) / prev_vol
                if vol_change > 0.7 and recent_vol > 3000:
                    warnings.append({
                        "workout_name": workout_name,
                        "type": "overtraining",
                        "message": f"⚠️ {workout_name} 볼륨이 지난 2주 대비 {round(vol_change*100)}% 급증했어요. 피로와 회복 상태를 체크해보세요.",
                        "recent_volume": round(recent_vol),
                        "prev_volume": round(prev_vol),
                        "change_pct": round(vol_change * 100),
                    })

        # 1RM 하락 감지
        if len(sub) >= 3:
            last_3 = sub['est_1rm'].iloc[-3:].tolist()
            if last_3[0] > last_3[1] > last_3[2]:
                warnings.append({
                    "workout_name": workout_name,
                    "type": "declining",
                    "message": f"📉 {workout_name} 1RM이 3세션 연속 하락 중이에요. 회복이 필요할 수 있어요.",
                    "last_3_1rm": last_3,
                })

    recommendations.sort(key=lambda x: x['sessions'], reverse=True)

    return {
        "recommendations": recommendations,
        "warnings": warnings,
        "data_count": len(df),
        "min_sessions_required": MIN_SAMPLES,
    }