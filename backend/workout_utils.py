import re
import unicodedata
from typing import Optional, List
import difflib

# ── 통합 운동 별칭 ──
WORKOUT_ALIASES = {
    # ── 가슴 ──
    "벤프": "바벨 벤치프레스",
    "벤치프레스": "바벨 벤치프레스",
    "바벨 벤치 프레스": "바벨 벤치프레스",
    "바벨플랫벤치프레스": "바벨 벤치프레스",
    "바벨 플랫 벤치 프레스": "바벨 벤치프레스",
    "스미스벤치프레스": "스미스 머신 벤치프레스",
    "스미스머신 벤치프레스": "스미스 머신 벤치프레스",
    "체스트프레스머신": "체스트 프레스",
    "체스트프레스 머신": "체스트 프레스",
    "체스트프레스": "체스트 프레스",
    "체스트 프레스": "체스트 프레스",
    "머신 체스트 프레스": "체스트 프레스",
    "디클라인 체스트 프레스": "디클라인 프레스",
    "디클라인프레스": "디클라인 프레스",
    "바벨 벤치프레스": "바벨 벤치프레스",
    "덤벨 벤치프레스": "덤벨 벤치프레스",
    "덤벨 플랫 벤치 프레스": "덤벨 벤치프레스",
    "덤벨프레스": "덤벨 벤치프레스",
    
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
    "인클라인 벤치프레스": "인클라인 벤치프레스",
    "인클라인 바벨프레스": "인클라인 벤치프레스",

    # 가슴 (플라이)
    "펙덱플라이": "펙 덱 플라이",
    "펙덱": "펙 덱 플라이",
    "머신 플라이": "펙 덱 플라이",
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
    "덤벨 레터럴 레이즈": "덤벨 사이드 레터럴 레이즈",
    "오버헤드프레스": "오버헤드 프레스",
    "오버헤드 프레스": "오버헤드 프레스",
    "덤벨숄더프레스": "덤벨 숄더 프레스",
    "덤벨 숄더프레스": "덤벨 숄더 프레스",
    "덤벨 숄더 프레스": "덤벨 숄더 프레스",
    "머신숄더프레스": "머신 숄더 프레스",
    "머신 숄더 프레스": "머신 숄더 프레스",
    "스미스머신 오버헤드 숄더 프레스": "머신 숄더 프레스",
    "시티드 덤벨 숄더 프레스": "덤벨 숄더 프레스",
    "리버스바벨레이즈": "리버스 바벨 레이즈",
    "리버스 바벨 레이즈": "리버스 바벨 레이즈",
    "리버스펙덱플라이": "리버스 펙 덱 플라이",
    "리버스 펙덱": "리버스 펙 덱 플라이",
    "리어델트플라이": "리어델트 플라이",
    "케이블 페이스 풀": "페이스풀",
    "페이스풀": "페이스풀",

    # ── 등 ──
    "랫풀다운": "랫풀다운",
    "랫 풀 다운": "랫풀다운",
    "와이드": "랫풀다운",
    "맥 그립 랫 풀 다운": "랫풀다운",
    "와이드풀다운": "랫풀다운",
    "와이드 풀다운 리어 머신": "랫풀다운",
    "시티드로우": "시티드 로우",
    "시티드 로우": "시티드 로우",
    "케이블 시티드 로우": "시티드 로우",
    "시티드머신": "시티드 로우",
    "시티드머신로우": "시티드 로우",
    "프론트로우": "시티드 로우",
    "로우로우": "시티드 로우",
    "티바 로우": "티바로우",
    "티바로우": "티바로우",
    "스미스머신바벨로우": "바벨로우",
    "스미스 머신 바벨 로우": "바벨로우",
    "바벨로우": "바벨로우",
    "어시스트풀업": "어시스트 풀업",
    "어시스트 풀업": "어시스트 풀업",
    "어시스티드 머신 풀 업": "어시스트 풀업",
    "원암덤벨로우": "원암 덤벨로우",
    "원암 덤벨로우": "원암 덤벨로우",
    "덤벨로우": "원암 덤벨로우",
    "턱걸이": "풀업",
    "풀업": "풀업",
    "케이블 스트레이트 암 풀 다운": "암풀다운",
    "암풀다운": "암풀다운",
    "원 암 머신 아이소 레터럴 로우": "원암 기구 로우",

    # ── 하체 & 팔 ──
    "루마니안데드": "루마니안 데드리프트",
    "루마니안 데드리프트": "루마니안 데드리프트",
    "바벨 루마니안 데드리프트": "루마니안 데드리프트",
    "컨벤셔널 데드리프트": "컨벤셔널 데드리프트",
    "스쿼트": "스쿼트",
    "바벨 스쿼트": "스쿼트",
    "레그프레스": "레그프레스",
    "레그 프레스": "레그프레스",
    "레그익스텐션": "레그 익스텐션",
    "레그 익스텐션": "레그 익스텐션",
    "레그컬": "레그컬",
    "라잉 레그컬": "레그컬",
    "시티드 레그컬": "레그컬",
    "기구레그컬": "레그컬",
    "이너타이": "힙 어덕션",
    "아웃타이": "힙 어브덕션",
    "힙어덕션": "힙 어덕션",
    "힙 어덕션": "힙 어덕션",
    "힙어브덕션": "힙 어브덕션",
    "힙 어브덕션": "힙 어브덕션",
    "이지바컬": "바벨컬",
    "이지바 컬": "바벨컬",
    "이지바/덤벨 컬": "바벨컬",
    "바벨컬": "바벨컬",
    "덤벨컬": "덤벨컬",
    "해머컬": "해머컬",
    "케이블푸시다운": "케이블 트라이셉스 푸시다운",
    "케이블푸쉬다운": "케이블 트라이셉스 푸시다운",
    "케이블 삼두 푸시다운": "케이블 트라이셉스 푸시다운",
    "케이블 트라이셉스 푸시다운": "케이블 트라이셉스 푸시다운",
    "라잉트라이셉스 익스텐션": "라잉트라이셉스 익스텐션",
    "행잉 레그레이즈": "행잉레그레이즈",
    "행잉레그레이즈": "행잉레그레이즈",
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

# ── 명시적 카테고리 맵 ──
EXACT_CATEGORY_MAP = {
    # 가슴
    "바벨 벤치프레스": "가슴",
    "스미스 머신 벤치프레스": "가슴",
    "인클라인 벤치프레스": "가슴",
    "인클라인 덤벨프레스": "가슴",
    "체스트 프레스": "가슴",
    "체스트프레스": "가슴",
    "펙 덱 플라이": "가슴",
    "디클라인 프레스": "가슴",
    "케이블 크로스오버": "가슴",
    "덤벨 벤치프레스": "가슴",

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
    "루마니안 데드리프트": "등",
    "컨벤셔널 데드리프트": "등",

    # 팔
    "바벨컬": "팔",
    "덤벨컬": "팔",
    "해머컬": "팔",
    "케이블 트라이셉스 푸시다운": "팔",
    "라잉트라이셉스 익스텐션": "팔",
    "케이블 암컬": "팔",
}

CATEGORY_PATTERNS = [
    ("기타", [r"레그레이즈", r"행잉니레이즈", r"크런치", r"플랭크", r"앱휠", r"행잉레그레이즈"]),
    ("하체", [r"스쿼트", r"레그프레스", r"레그익스텐션", r"레그컬", r"햄스트링컬", r"힙쓰러스트", r"힙어브덕션", r"힙어덕션", r"런지", r"불가리안", r"카프", r"데드"]),
    ("어깨", [r"숄더", r"오버헤드", r"밀리터리", r"아놀드", r"레터럴", r"사레레", r"페이스풀", r"리어델트", r"리버스펙덱"]),
    ("등", [r"랫풀", r"풀다운", r"풀업", r"친업", r"로우", r"암풀", r"풀오버"]),
    ("팔", [r"이두", r"삼두", r"바이셉", r"트라이셉", r"푸시다운", r"킥백", r"프리처컬", r"해머컬", r"암컬", r"컬$"]),
    ("가슴", [r"벤치", r"체스트", r"펙덱", r"케이블플라이", r"덤벨플라이", r"푸쉬업", r"푸시업", r"딥스", r"인클라인.*프레스", r"디클라인.*프레스"]),
]

def get_category(workout_name: Optional[str]) -> str:
    canonical_name = normalize_workout_name(workout_name)
    exact_category = EXACT_CATEGORY_MAP.get(canonical_name)
    if exact_category:
        return exact_category

    name_clean = workout_match_key(canonical_name)
    if not name_clean:
        return "기타"

    for category, patterns in CATEGORY_PATTERNS:
        if any(re.search(pattern, name_clean) for pattern in patterns):
            return category

    return "기타"

# bot.py 호환용 헬퍼 함수
def get_workout_category(workout_name: Optional[str]) -> str:
    cat = get_category(workout_name)
    # bot.py의 기존 카테고리('이두', '삼두' 등)와 맞추기 위한 매핑 보정
    if cat == "팔":
        canonical = normalize_workout_name(workout_name)
        if any(w in canonical for w in ["트라이셉스", "푸시다운", "익스텐션"]):
            return "삼두"
        elif any(w in canonical for w in ["컬", "이두"]):
            return "이두"
        return "팔"
    return cat

CATEGORY_EMOJI = {
    '등': '🔙', '가슴': '💪', '어깨': '🤸',
    '하체': '🦵', '코어': '🧘', '팔': '🦾', '이두': '💪', '삼두': '🦾', '기타': '❓',
}

CATEGORY_COLORS = {
    '등': ['#1f77b4', '#4a90c8', '#76aedc', '#a4ccea', '#0d4f8a', '#3585b8', '#5fa3d3'],
    '가슴': ['#d62728', '#e15858', '#ec8888', '#f4b3b3', '#a01818', '#bd2c2c', '#cf4848'],
    '어깨': ['#ff7f0e', '#ff9e3d', '#ffb86b', '#ffd0a0', '#cc6500', '#e67200', '#ff8b1c'],
    '하체': ['#2ca02c', '#54b454', '#7dc77d', '#a8daa8', '#1d701d', '#288228', '#3d943d'],
    '코어': ['#9467bd', '#a984cc'],
    '팔': ['#8c564b', '#c49c94'],
    '이두': ['#8c564b', '#c49c94'],
    '삼두': ['#e377c2', '#f7b6d2'],
    '기타': ['#7f7f7f', '#999999'],
}

def category_sort_key():
    order = ['등', '가슴', '어깨', '하체', '팔', '이두', '삼두', '코어', '기타']
    return {cat: i for i, cat in enumerate(order)}

def sort_workouts_by_category(workouts):
    order = category_sort_key()
    return sorted(workouts, key=lambda w: (order.get(get_workout_category(w), 99), w))

def find_workout_match(input_name, all_workouts, rejected=None):
    if rejected is None:
        rejected = []
    input_name = input_name.strip()
    standard = normalize_workout_name(input_name)
    if standard in all_workouts:
        return 'exact', standard
    if input_name in WORKOUT_ALIASES:
        return 'exact', WORKOUT_ALIASES[input_name]
    input_clean = input_name.replace(' ', '').lower()
    if len(input_clean) < 2:
        return 'none', None
    partial_matches = [
        w for w in all_workouts
        if (
            input_clean in w.replace(' ', '').lower()
            and w not in rejected
        )
    ]
    GENERIC_WORDS = {
        '레그', '덤벨', '머신',
        '프레스', '로우',
        '컬', '레이즈'
    }

    if len(partial_matches) == 1:
        matched = partial_matches[0]
        matched_clean = matched.replace(' ', '').lower()

        if (
            len(input_clean) >= 3 and
            input_clean not in GENERIC_WORDS and
            matched_clean.startswith(input_clean)
        ):
            return 'auto', matched

        return 'confirm', matched
    if len(partial_matches) > 1:
        return 'multi', partial_matches
    suggestions = difflib.get_close_matches(input_name, all_workouts, n=3, cutoff=0.6)
    if suggestions:
        return 'suggest', suggestions
    return 'none', None
