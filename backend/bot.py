import requests
from telegram import Update
from telegram.ext import ApplicationBuilder, ContextTypes, MessageHandler, CommandHandler, filters
import re
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib import font_manager
import io
import os
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter
import psycopg2
from datetime import datetime, timedelta
import difflib
from workout_utils import (
    WORKOUT_ALIASES,
    normalize_workout_name,
    get_workout_category,
    category_sort_key,
    sort_workouts_by_category,
    find_workout_match,
    CATEGORY_EMOJI,
    CATEGORY_COLORS,
)


# ---------------- 한글 폰트 설정 ----------------
def setup_korean_font():
    candidates = [
        '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
        '/usr/share/fonts/truetype/nanum/NanumBarunGothic.ttf',
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    ]
    for path in candidates:
        if os.path.exists(path):
            font_manager.fontManager.addfont(path)
            font_name = font_manager.FontProperties(fname=path).get_name()
            plt.rcParams['font.family'] = font_name
            plt.rcParams['axes.unicode_minus'] = False
            print(f"한글 폰트 설정: {font_name}")
            return
    print("⚠️ 한글 폰트를 찾지 못했어요.")

setup_korean_font()

# ---------------- 설정 ----------------
DB_CONFIG = {
    "host": "overloader.postgres.database.azure.com",
    "database": "overloaderdb",
    "user": "margaron55",
    "password": os.getenv("DB_PASSWORD"),
    "sslmode": "require"
}

def get_conn():
    return psycopg2.connect(**DB_CONFIG)

# chat_id별 상태 관리
user_state = {}  # { chat_id: {"last_workout": None, "pending_confirm": None, "last_set": None} }

def get_state(chat_id):
    if chat_id not in user_state:
        user_state[chat_id] = {
            "last_workout": None,
            "pending_confirm": None,
            "last_set": None,
            "rejected_matches": []
        }

    return user_state[chat_id]
    return user_state[chat_id]


OUTLIER_THRESHOLD = 0.5

# ---------------- 네트워크 ----------------
def get_robust_session():
    session = requests.Session()
    retry = Retry(total=5, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session

def get_user_by_chat_id(chat_id):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, telegram_id, discord_webhook_url
            FROM users WHERE telegram_chat_id = %s
        """, (str(chat_id),))
        row = cur.fetchone()
    finally:
        cur.close()
        conn.close()
    return row

def send_to_discord(content, chat_id):
    user = get_user_by_chat_id(chat_id)
    if not user or not user[2]:
        return
    session = get_robust_session()
    try:
        session.post(user[2], json={"content": content}, timeout=10)
    except Exception as e:
        print(f"디스코드 전송 실패: {e}")

# ---------------- 데이터 헬퍼 ----------------
def load_dataframe(chat_id):
    user = get_user_by_chat_id(chat_id)
    if not user:
        return None
    user_id = user[0]
    conn = get_conn()
    try:
        df = pd.read_sql("""
            SELECT w.date AS 날짜, w.workout_name AS 운동명,
                   w.weight_kg AS 무게, w.reps AS 횟수, w.unit AS 단위
            FROM workout_logs w
            WHERE w.user_id = %s
            ORDER BY w.date
        """, conn, params=(user_id,))
    finally:
        conn.close()
    if df.empty:
        return None
    df['날짜'] = pd.to_datetime(df['날짜'])
    df['운동명'] = df['운동명'].str.strip().apply(normalize_workout_name)
    return df

def save_record(date, workout_name, weight_kg, reps, unit, chat_id):
    user = get_user_by_chat_id(chat_id)
    if not user:
        return None

    conn = get_conn()
    cur = conn.cursor()

    try:
        cur.execute("""
            INSERT INTO workout_logs
            (user_id, date, workout_name, weight_kg, reps, unit)
            VALUES (%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (
            user[0], date, workout_name,
            weight_kg, reps, unit
        ))

        inserted_id = cur.fetchone()[0]
        conn.commit()
        return inserted_id

    finally:
        cur.close()
        conn.close()

def save_cardio_record(cardio_name, duration_min, distance_km, pace, incline, kcal, chat_id):
    user = get_user_by_chat_id(chat_id)
    if not user:
        return False
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO cardio_logs
                (user_id, date, cardio_name, duration_min, distance_km, pace, incline, kcal)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            user[0],
            datetime.today().date(),
            cardio_name,
            duration_min,
            distance_km,
            pace,
            incline,
            kcal,
        ))
        conn.commit()
    finally:
        cur.close()
        conn.close()
    return True

def parse_weight_input(weight_str):
    weight_str = weight_str.strip()
    if weight_str == "빈바":
        return 20.0, 'kg'
    match = re.match(r"(\d+\.?\d*)\s*(.*)", weight_str)
    if not match:
        return float(weight_str), 'kg'
    weight_val = float(match.group(1))
    unit = match.group(2).lower().strip()
    if unit == 'lbs':
        return round(weight_val * 0.453592, 1), 'lbs'
    return weight_val, 'kg'

def estimate_1rm(weight, reps):
    if reps <= 0:
        return 0
    if reps == 1:
        return weight
    return round(weight * (1 + reps / 30), 1)

def check_outlier(workout_name, weight_kg, chat_id):
    df = load_dataframe(chat_id)
    if df is None or df.empty:
        return False, None
    workout_name = normalize_workout_name(workout_name)
    today = pd.Timestamp.now().normalize()
    today_records = df[(df['운동명'] == workout_name) & (df['날짜'] == today)]
    if not today_records.empty:
        return False, None
    cutoff = today - pd.Timedelta(days=30)
    recent = df[(df['운동명'] == workout_name) & (df['날짜'] >= cutoff) & (df['날짜'] < today)]
    if len(recent) < 3:
        return False, None
    avg = recent['무게'].mean()
    if avg == 0:
        return False, avg
    return abs(weight_kg - avg) / avg > OUTLIER_THRESHOLD, avg

def check_pr(workout_name, weight_kg, reps, chat_id, exclude_today=True):
    df = load_dataframe(chat_id)
    if df is None or df.empty:
        return None
    workout_name = normalize_workout_name(workout_name)
    target = df[df['운동명'] == workout_name]
    if exclude_today:
        today = pd.Timestamp.now().normalize()
        target = target[target['날짜'] < today]
    if target.empty:
        return None
    new_1rm = estimate_1rm(weight_kg, reps)
    today = pd.Timestamp.now().normalize()
    today_same = df[
        (df['운동명'] == workout_name) & (df['날짜'] == today) &
        (df['무게'] == weight_kg) & (df['횟수'] == reps)
    ]
    if not today_same.empty:
        return None
    target_1rm = target.apply(lambda r: estimate_1rm(r['무게'], r['횟수']), axis=1)
    prev_max_1rm = target_1rm.max()
    prev_max_weight = target['무게'].max()
    if weight_kg > prev_max_weight:
        return {'type': 'weight', 'prev_weight': prev_max_weight, 'new_weight': weight_kg,
                'new_1rm': new_1rm, 'prev_1rm': prev_max_1rm}
    if weight_kg == prev_max_weight:
        same_weight_max_reps = target[target['무게'] == weight_kg]['횟수'].max()
        if reps > same_weight_max_reps:
            return {'type': 'reps', 'weight': weight_kg, 'prev_reps': int(same_weight_max_reps),
                    'new_reps': reps, 'new_1rm': new_1rm, 'prev_1rm': prev_max_1rm}
    if new_1rm > prev_max_1rm and prev_max_1rm > 0:
        return {'type': '1rm', 'new_1rm': new_1rm, 'prev_1rm': prev_max_1rm,
                'weight': weight_kg, 'reps': reps}
    return None

def lookup_workout(workout_name, chat_id):
    df = load_dataframe(chat_id)
    if df is None or df.empty:
        return "❌ 기록이 아직 없어요."
    workout_name = normalize_workout_name(workout_name)
    target = df[df['운동명'] == workout_name]
    if target.empty:
        return f"❌ '{workout_name}' 기록이 없어요."
    last_date = target['날짜'].max()
    last_session = target[target['날짜'] == last_date]
    sets_str = ", ".join(f"{row['무게']:g}kg×{int(row['횟수'])}회" for _, row in last_session.iterrows())
    max_weight = target['무게'].max()
    best = target[target['무게'] == max_weight].sort_values('횟수', ascending=False).iloc[0]
    target_with_1rm = target.copy()
    target_with_1rm['1rm'] = target_with_1rm.apply(lambda r: estimate_1rm(r['무게'], r['횟수']), axis=1)
    best_1rm_row = target_with_1rm.loc[target_with_1rm['1rm'].idxmax()]
    best_1rm = best_1rm_row['1rm']
    return (f"💪 **{workout_name}** 조회\n"
            f"📅 저번 세션 ({last_date.strftime('%m/%d')}): {sets_str}\n"
            f"🏆 역대 최고 무게: {max_weight:g}kg × {int(best['횟수'])}회 ({best['날짜'].strftime('%m/%d')})\n"
            f"📊 추정 1RM: {best_1rm:g}kg ({best_1rm_row['무게']:g}kg × {int(best_1rm_row['횟수'])}회 기준, {best_1rm_row['날짜'].strftime('%m/%d')})")

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

def calc_trend(sub_df):
    if len(sub_df) < 2:
        return '', ''
    sorted_df = sub_df.sort_values('날짜')
    delta = sorted_df.iloc[-1]['best_1rm'] - sorted_df.iloc[0]['best_1rm']
    if delta > 0: return '↑', f'+{delta:g}kg'
    if delta < 0: return '↓', f'{delta:g}kg'
    return '→', '±0kg'

def get_recent_workouts(chat_id, days=14):
    df = load_dataframe(chat_id)
    if df is None or df.empty:
        return []
    cutoff = pd.Timestamp.now().normalize() - pd.Timedelta(days=days)
    recent = df[df['날짜'] >= cutoff]
    if recent.empty:
        return []
    return recent.groupby('운동명')['날짜'].max().sort_values(ascending=False).index.tolist()

# ---------------- 그래프 ----------------
def build_volume_graph(chat_id, period='week'):
    df = load_dataframe(chat_id)
    if df is None or df.empty:
        return None
    today = pd.Timestamp.now().normalize()
    this_week_start = today - pd.Timedelta(days=today.weekday())
    last_week_start = this_week_start - pd.Timedelta(days=7)
    this_month_start = today.replace(day=1)
    if this_month_start.month == 1:
        last_month_start = this_month_start.replace(year=this_month_start.year-1, month=12)
    else:
        last_month_start = this_month_start.replace(month=this_month_start.month-1)
    if period == 'week':
        cur_start, cur_end = this_week_start, today
        prev_start, prev_end = last_week_start, this_week_start
        cur_label, prev_label = '이번주', '저번주'
    elif period == 'last':
        cur_start, cur_end = last_week_start, this_week_start
        prev_start, prev_end = last_week_start - pd.Timedelta(days=7), last_week_start
        cur_label, prev_label = '저번주', '저저번주'
    else:
        cur_start, cur_end = this_month_start, today
        prev_start, prev_end = last_month_start, this_month_start
        cur_label, prev_label = '이번달', '저번달'
    df['볼륨'] = df['무게'] * df['횟수']
    df['부위'] = df['운동명'].apply(get_workout_category)
    cur = df[(df['날짜'] >= cur_start) & (df['날짜'] <= cur_end)].groupby('부위')['볼륨'].sum()
    prev = df[(df['날짜'] >= prev_start) & (df['날짜'] < prev_end)].groupby('부위')['볼륨'].sum()
    cat_order = category_sort_key()
    all_cats = sorted(set(cur.index) | set(prev.index), key=lambda c: cat_order.get(c, 99))
    x = range(len(all_cats))
    fig, ax = plt.subplots(figsize=(10, 5))
    width = 0.35
    bars1 = ax.bar([i - width/2 for i in x], [prev.get(c, 0) for c in all_cats], width, label=prev_label, color='#aec6e8', zorder=3)
    bars2 = ax.bar([i + width/2 for i in x], [cur.get(c, 0) for c in all_cats], width, label=cur_label, color='#1f77b4', zorder=3)
    for bar in bars1:
        h = bar.get_height()
        if h > 0:
            ax.text(bar.get_x() + bar.get_width()/2, h + 20, f'{h:,.0f}', ha='center', va='bottom', fontsize=8, color='#666')
    for bar in bars2:
        h = bar.get_height()
        if h > 0:
            ax.text(bar.get_x() + bar.get_width()/2, h + 20, f'{h:,.0f}', ha='center', va='bottom', fontsize=8, fontweight='bold')
    ax.set_xticks(list(x))
    ax.set_xticklabels([f"{CATEGORY_EMOJI.get(c,'')} {c}" for c in all_cats], fontsize=10)
    ax.set_ylabel('총 볼륨 (kg)', fontsize=10)
    ax.set_title(f'부위별 볼륨 ({cur_label} vs {prev_label})', fontsize=13)
    ax.legend(fontsize=9)
    ax.grid(axis='y', alpha=0.3, zorder=0)
    ax.set_axisbelow(True)
    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=110, bbox_inches='tight')
    buf.seek(0)
    plt.close(fig)
    return buf

def send_volume_graph_to_discord(header, chat_id, period='week'):
    user = get_user_by_chat_id(chat_id)
    if not user or not user[2]:
        return False
    buf = build_volume_graph(chat_id, period=period)
    if buf is None:
        return False
    try:
        get_robust_session().post(user[2], data={'content': header},
                                  files={'file': ('volume.png', buf, 'image/png')}, timeout=20)
        return True
    except Exception as e:
        print(f"볼륨 차트 전송 실패: {e}")
        return False

def build_progress_graph(workouts, chat_id, days=30):
    df = load_dataframe(chat_id)
    if df is None or df.empty:
        return None, {}
    cutoff = pd.Timestamp.now().normalize() - pd.Timedelta(days=days)
    df = df[df['날짜'] >= cutoff]
    workouts = list(dict.fromkeys([normalize_workout_name(w) for w in workouts]))
    df = df[df['운동명'].isin(workouts)]
    if df.empty:
        return None, {}
    df['est_1rm'] = df.apply(lambda r: estimate_1rm(r['무게'], r['횟수']), axis=1)
    grouped = df.groupby(['운동명', '날짜'])['est_1rm'].max().reset_index()
    grouped.rename(columns={'est_1rm': 'best_1rm'}, inplace=True)
    chart_workouts = []
    single_data_summary = {}
    for w in workouts:
        sub = grouped[grouped['운동명'] == w]
        if sub.empty:
            continue
        if len(sub) == 1:
            only_date = sub['날짜'].iloc[0]
            session_data = df[(df['운동명'] == w) & (df['날짜'] == only_date)]
            sets_str = ", ".join(f"{row['무게']:g}kg×{int(row['횟수'])}회" for _, row in session_data.iterrows())
            single_data_summary[w] = {'category': get_workout_category(w), 'date': only_date, 'sets_str': sets_str}
        else:
            chart_workouts.append(w)
    if not chart_workouts:
        return None, single_data_summary
    by_category = {}
    for w in chart_workouts:
        by_category.setdefault(get_workout_category(w), []).append(w)
    cat_order = category_sort_key()
    sorted_cats = sorted(by_category.keys(), key=lambda c: cat_order.get(c, 99))
    n_charts = len(sorted_cats)
    ncols = 1 if n_charts == 1 else 2
    nrows = (n_charts + 1) // 2
    fig, axes = plt.subplots(nrows, ncols, figsize=(6 * ncols, 3.8 * nrows), squeeze=False)
    for idx, cat in enumerate(sorted_cats):
        ax = axes[idx // ncols][idx % ncols]
        colors = CATEGORY_COLORS.get(cat, CATEGORY_COLORS['기타'])
        for w_idx, w in enumerate(sort_workouts_by_category(by_category[cat])):
            sub = grouped[grouped['운동명'] == w].sort_values('날짜')
            color = colors[w_idx % len(colors)]
            arrow, delta = calc_trend(sub)
            label = f"{w} {arrow}{delta}".strip() if arrow else w
            ax.plot(sub['날짜'], sub['best_1rm'], marker='o', linestyle='-', color=color, label=label, linewidth=2, markersize=6)
            last_x, last_y = sub['날짜'].iloc[-1], sub['best_1rm'].iloc[-1]
            ax.annotate(f'{last_y:g}', (last_x, last_y), textcoords="offset points", xytext=(5, 5), fontsize=8, color=color, fontweight='bold')
        ax.set_title(f"{cat} — 세션별 최대 무게 (지난 {days}일)", fontsize=11)
        ax.set_ylabel('추정 1RM (kg)', fontsize=9)
        ax.grid(True, alpha=0.3)
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%m/%d'))
        ax.legend(loc='best', fontsize=8, framealpha=0.85)
        ax.tick_params(axis='x', labelsize=8)
        ax.tick_params(axis='y', labelsize=8)
    for idx in range(n_charts, nrows * ncols):
        axes[idx // ncols][idx % ncols].axis('off')
    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=110, bbox_inches='tight')
    buf.seek(0)
    plt.close(fig)
    return buf, single_data_summary

def format_single_data_card(single_data):
    if not single_data:
        return None
    by_cat = {}
    for w, info in single_data.items():
        by_cat.setdefault(info['category'], []).append((w, info))
    cat_order = category_sort_key()
    sorted_cats = sorted(by_cat.keys(), key=lambda c: cat_order.get(c, 99))
    lines = ["📋 **기록 1회뿐인 운동들**"]
    for cat in sorted_cats:
        lines.append(f"\n{CATEGORY_EMOJI.get(cat, '')} **{cat}**")
        for w, info in by_cat[cat]:
            lines.append(f"• **{w}** — {info['date'].strftime('%m/%d')} — {info['sets_str']}")
    return "\n".join(lines)

def send_graph_to_discord(workouts, header, chat_id, days=30):
    user = get_user_by_chat_id(chat_id)
    if not user or not user[2]:
        return False
    buf, single_data = build_progress_graph(workouts, chat_id, days=days)
    session = get_robust_session()
    try:
        if buf is not None:
            session.post(user[2], data={'content': header},
                         files={'file': ('progress.png', buf, 'image/png')}, timeout=20)
        elif not single_data:
            return False
        card = format_single_data_card(single_data)
        if card:
            send_to_discord(card, chat_id)
        return True
    except Exception as e:
        print(f"그래프 전송 실패: {e}")
        return False

# ---------------- 핸들러 ----------------
async def link_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("사용법: /link 123456")
        return
    code = context.args[0]
    chat_id = update.effective_chat.id
    res = requests.post("https://api.overloader.cloud/settings/link-telegram",
                        json={"code": code, "chat_id": chat_id})
    if res.status_code == 200:
        await update.message.reply_text("✅ 연결 완료! 이제 웹에서 기록하면 알림이 와요.")
    else:
        await update.message.reply_text("❌ 코드가 잘못되었거나 만료되었습니다.")

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "💪 *Overloader 운동 기록 봇*\n\n"

        "📝 *근력 기록*\n"
        "• `사레레, 6, 15`\n"
        "• `6, 15` — 직전 운동 이어쓰기\n"
        "• `반복` / `ㅂㅂ` — 직전 세트 반복\n"
        "• `벤치프레스, 50lbs, 8`\n\n"

        "🏃 *유산소*\n"
        "• /cardio — 유산소 기록\n"
        "• 예: `/cardio 런닝머신 30`\n"
        "• 예: `/cardio 런닝머신 30 3.5`\n"
        "• 예: `/cardio 런닝머신 30 3.5 6'30''`\n\n"

        "🔍 *조회*\n"
        "• `사레레?` — 최근/최고 기록 보기\n\n"

        "📊 *그래프*\n"
        "• /graph — 최근 운동 추이\n"
        "• `/graph 운동명` — 특정 운동 추이\n"
        "• `/graph volume` — 주간 볼륨\n\n"

        "📈 *통계*\n"
        "• /summary week\n"
        "• `/1rm` — 최고 1RM 랭킹\n\n"

        "⚙️ *기타*\n"
        "• /routine 1~6\n"
        "• /food yes|no\n"
        "• /cancel — 방금 기록 삭제\n"
        "• /finish — 운동 종료 + 차트",
        parse_mode='Markdown'
    )

async def _process_workout_input(update, workout_name, weight_str, reps, date):
    chat_id = update.effective_chat.id
    state = get_state(chat_id)
    workout_name = normalize_workout_name(workout_name)
    weight_kg, original_unit = parse_weight_input(weight_str)
    reps_int = int(float(reps))
    is_outlier, recent_avg = check_outlier(workout_name, weight_kg, chat_id)
    if is_outlier:
        state["pending_confirm"] = {
            "workout": workout_name, "weight_kg": weight_kg,
            "unit": original_unit, "reps": reps_int, "date": date,
        }
        await update.message.reply_text(
            f"⚠️ 잠깐! **{workout_name}** 최근 평균이 {recent_avg:.1f}kg인데 "
            f"입력값은 {weight_kg}kg이에요.\n맞으면 'y', 다시 입력하려면 'n'",
            parse_mode='Markdown'
        )
        return
    await _save_record(update, {"workout": workout_name, "weight_kg": weight_kg,
                                "unit": original_unit, "reps": reps_int, "date": date})

async def _save_record(update, record):
    chat_id = update.effective_chat.id
    state = get_state(chat_id)
    current_workout = record["workout"]
    weight_kg = record["weight_kg"]
    unit = record["unit"]
    reps = record["reps"]
    date = record["date"]

    pr = check_pr(current_workout, weight_kg, reps, chat_id)

    if current_workout != state["last_workout"]:
        if state["last_workout"] is not None:
            send_to_discord(f"✅ **{state['last_workout']}** 완료!", chat_id)
        send_to_discord(f"🔥 **{current_workout}** 시작합니다.", chat_id)
        state["last_workout"] = current_workout

    inserted_id = save_record(
        date,
        current_workout,
        weight_kg,
        reps,
        unit,
        chat_id
    )

    if unit == 'lbs':
        original_lbs = round(weight_kg / 0.453592, 1)
        msg = f"기록 완료: {current_workout} {original_lbs}lbs ({weight_kg}kg) {reps}회"
    else:
        msg = f"기록 완료: {current_workout} {weight_kg}kg {reps}회"

    await update.message.reply_text(msg)
    send_to_discord(f"- {weight_kg}kg x {reps}회", chat_id)

    if pr:
        t = pr['type']
        if t == 'weight':
            prmsg = (f"🏆 *{current_workout}* 중량 PR! "
                     f"{pr['prev_weight']:.1f}→*{pr['new_weight']:.1f}kg* "
                     f"| 추정1RM {pr['prev_1rm']:.1f}→*{pr['new_1rm']:.1f}kg*")
        elif t == 'reps':
            prmsg = (f"🔁 *{current_workout}* {pr['weight']:.1f}kg 렙수 PR! "
                     f"{pr['prev_reps']}회→*{pr['new_reps']}회*")
        else:
            prmsg = (f"📈 *{current_workout}* 추정1RM PR! "
                     f"{pr['prev_1rm']:.1f}→*{pr['new_1rm']:.1f}kg*")
        await update.message.reply_text(prmsg, parse_mode='Markdown')
        send_to_discord(prmsg, chat_id)

    state["last_set"] = {
        "id": inserted_id,
        "workout": current_workout,
        "weight_kg": weight_kg,
        "unit": unit,
        "reps": reps
    }    
    state["rejected_matches"] = []
    
async def log_workout(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    state = get_state(chat_id)
    try:
        text = update.message.text.strip()

        if state.get("pending_confirm"):
            pending = state["pending_confirm"]
            confirm_type = pending.get("type", "outlier")

            if confirm_type == "outlier" or "weight_kg" in pending:
                if text.lower() in ("y", "예", "ㅇ", "yes", "맞아", "맞음"):
                    state["pending_confirm"] = None
                    await _save_record(update, pending)
                    return
                elif text.lower() in ("n", "아니", "ㄴ", "no", "취소"):
                    state["pending_confirm"] = None
                    await update.message.reply_text("❌ 기록을 취소했어요. 다시 입력해주세요.")
                    return
                else:
                    state["pending_confirm"] = None

            elif confirm_type == "workout_match":
                if text.lower() in ("y", "예", "ㅇ", "yes", "맞아", "맞음"):
                    matched = pending["matched_workout"]
                    state["pending_confirm"] = None
                    await _process_workout_input(update, matched, pending["weight_str"], pending["reps"], pending["date"])
                    return
                elif text.lower() in ("n", "아니", "ㄴ", "no", "취소"):

                    matched = pending["matched_workout"]

                    rejected = state.get("rejected_matches", [])

                    if matched not in rejected:
                        rejected.append(matched)

                    state["rejected_matches"] = rejected

                    state["pending_confirm"] = None

                    await update.message.reply_text(
                        "새 운동명을 다시 입력해주세요."
                    )

                    return
                else:
                    state["pending_confirm"] = None

            elif confirm_type in ("workout_select", "workout_suggest"):

                if text.lower() in ("n", "no", "ㄴ"):
                    original = pending["original_workout"]

                    state["pending_confirm"] = None

                    await _process_workout_input(
                        update,
                        original,
                        pending["weight_str"],
                        pending["reps"],
                        pending["date"]
                    )
                    return

                elif text.isdigit():

                    idx = int(text) - 1
                    options = pending["options"]

                    if 0 <= idx < len(options):

                        selected = options[idx]

                        state["pending_confirm"] = None

                        await _process_workout_input(
                            update,
                            selected,
                            pending["weight_str"],
                            pending["reps"],
                            pending["date"]
                        )
                        return

                    else:
                        await update.message.reply_text("번호가 범위를 벗어났어요.")
                        return

        if text in ("반복", "ㅂㅂ", "repeat"):
            last = state.get("last_set")
            if not last:
                await update.message.reply_text("반복할 세트 기록이 없어요.")
                return
            await update.message.reply_text(f"♻️ {last['workout']} {last['weight_kg']}kg × {last['reps']}회 반복!")
            await _save_record(update, {**last, "date": update.message.date.strftime('%Y-%m-%d')})
            return

        if text.endswith('?'):
            workout_name = text.rstrip('?').strip()
            if not workout_name:
                await update.message.reply_text("운동명을 알려주세요. 예: 사레레?")
                return
            await update.message.reply_text(lookup_workout(workout_name, chat_id), parse_mode='Markdown')
            return

        if text.lower().startswith("test"):
            await update.message.reply_text("🧪 [테스트 모드]")
            return

        data = [x.strip() for x in text.split(',')]
        if len(data) < 2:
            await update.message.reply_text("앗! 횟수도 같이 알려주세요!")
            return

        if len(data) == 2:
            if state["last_workout"]:
                current_workout = state["last_workout"]
                weight_str, reps = data[0], data[1]
            else:
                await update.message.reply_text("어떤 운동인지 먼저 알려주셔야 해요!")
                return
        else:
            current_workout, weight_str, reps = data[0], data[1], data[2]

        current_workout_input = current_workout.strip()
        current_workout = normalize_workout_name(current_workout_input)

        df_check = load_dataframe(chat_id)
        if df_check is not None and not df_check.empty:
            all_workouts = df_check['운동명'].unique().tolist()
            if current_workout not in all_workouts:
                status, match = find_workout_match(
                    current_workout,
                    all_workouts,
                    rejected=state.get("rejected_matches", [])
                )
                if status == 'auto':
                    await update.message.reply_text(f"💡 '{current_workout_input}' → **{match}**(으)로 인식했어요")
                    current_workout = match
                elif status == 'confirm':
                    state["pending_confirm"] = {"type": "workout_match", "matched_workout": match,
                                                "weight_str": weight_str, "reps": reps,
                                                "date": update.message.date.strftime('%Y-%m-%d')}
                    await update.message.reply_text(f"❓ '{current_workout_input}' → **{match}** 맞나요?\n맞으면 'y', 새 운동이면 'n'", parse_mode='Markdown')
                    return
                elif status == 'multi':
                    options = "\n".join(f"  {i+1}. {w}" for i, w in enumerate(match))
                    state["pending_confirm"] = {"type": "workout_select", "options": match,
                                                "weight_str": weight_str, "reps": reps,
                                                "date": update.message.date.strftime('%Y-%m-%d'),
                                                "original_workout": current_workout_input
                                                }
                    await update.message.reply_text(f"❓ '{current_workout_input}'에 해당하는 운동:\n{options}\n번호로 답해주세요, 새 운동이면 'n'")
                    return
                elif status == 'suggest':
                    options = match

                    state["pending_confirm"] = {
                        "type": "workout_suggest",
                        "options": match,
                        "original_workout": current_workout_input,
                        "weight_str": weight_str,
                        "reps": reps,
                        "date": update.message.date.strftime('%Y-%m-%d'),
                    }

                    await update.message.reply_text(
                        f"❓ '{current_workout_input}' 못 찾았어요.\n"
                        f"혹시 {', '.join(options)}?\n"
                        f"번호 입력 / 새 운동이면 n"
                    )
                    return

        weight_kg, original_unit = parse_weight_input(weight_str)
        reps_int = int(float(reps))

        is_outlier, recent_avg = check_outlier(current_workout, weight_kg, chat_id)
        if is_outlier:
            state["pending_confirm"] = {"workout": current_workout, "weight_kg": weight_kg,
                                        "unit": original_unit, "reps": reps_int,
                                        "date": update.message.date.strftime('%Y-%m-%d')}
            await update.message.reply_text(
                f"⚠️ **{current_workout}** 최근 평균 {recent_avg:.1f}kg인데 입력값 {weight_kg}kg이에요.\n맞으면 'y', 다시 입력하려면 'n'",
                parse_mode='Markdown'
            )
            return

        await _save_record(update, {"workout": current_workout, "weight_kg": weight_kg,
                                    "unit": original_unit, "reps": reps_int,
                                    "date": update.message.date.strftime('%Y-%m-%d')})

    except ValueError:
        await update.message.reply_text("무게나 횟수에 숫자가 아닌 값이 들어간 것 같아요!")
    except Exception as e:
        print(f"⚠️ 에러 발생: {e}")
        await update.message.reply_text("기록 중 문제가 발생했어요.")

async def finish_workout(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    state = get_state(chat_id)
    if state["last_workout"]:
        send_to_discord(f"✅ **{state['last_workout']}** 완료! 오늘 운동 끝! 🏋️‍♂️", chat_id)
        try:
            df = load_dataframe(chat_id)
            today = pd.Timestamp.now().normalize()
            today_workouts = df[df['날짜'] == today]['운동명'].drop_duplicates().tolist() if df is not None else []
            if today_workouts:
                send_volume_graph_to_discord('📊 **부위별 주간 볼륨 (이번주 vs 저번주)**', chat_id)
        except Exception as e:
            print(f"오늘 운동 추출 실패: {e}")
        state["last_workout"] = None
        await update.message.reply_text("오늘 기록을 마치고 그래프를 디스코드에 공유했어요!")
    else:
        await update.message.reply_text("종료할 운동 기록이 없습니다.")

async def cancel_last(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    state = get_state(chat_id)

    last = state.get("last_set")

    if not last or not last.get("id"):
        await update.message.reply_text("❌ 취소할 최근 기록이 없어요.")
        return

    conn = get_conn()
    cur = conn.cursor()

    try:
        cur.execute("""
            DELETE FROM workout_logs
            WHERE id = %s
        """, (last["id"],))
        conn.commit()
    finally:
        cur.close()
        conn.close()

    await update.message.reply_text(
        f"🗑 {last['workout']} {last['weight_kg']}kg × {last['reps']}회 삭제했어요."
    )

    send_to_discord(
        f"🗑 기록 취소: {last['workout']} {last['weight_kg']}kg × {last['reps']}회",
        chat_id
    )

    state["last_set"] = None

async def show_summary(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    args = context.args
    period = args[0].lower() if args else 'week'
    valid_periods = ('week', 'last', 'month', 'lastmonth', 'all')
    if period not in valid_periods:
        await update.message.reply_text("사용법: /summary [week|last|month|lastmonth|all]")
        return
    df = load_dataframe(chat_id)
    if df is None or df.empty:
        await update.message.reply_text("❌ 기록이 아직 없어요.")
        return
    now = pd.Timestamp.now().normalize()
    end = None
    if period == 'week':
        start = now - pd.Timedelta(days=now.weekday())
        period_label = f"이번 주 ({start.strftime('%m/%d')} ~ )"
    elif period == 'last':
        this_week_start = now - pd.Timedelta(days=now.weekday())
        start = this_week_start - pd.Timedelta(days=7)
        end = this_week_start - pd.Timedelta(seconds=1)
        period_label = f"저번 주 ({start.strftime('%m/%d')} ~ {(this_week_start - pd.Timedelta(days=1)).strftime('%m/%d')})"
    elif period == 'month':
        start = now.replace(day=1)
        period_label = f"이번 달 ({start.strftime('%Y년 %m월')})"
    elif period == 'lastmonth':
        this_month_start = now.replace(day=1)
        start = this_month_start.replace(month=this_month_start.month-1) if this_month_start.month > 1 else this_month_start.replace(year=this_month_start.year-1, month=12)
        end = this_month_start - pd.Timedelta(seconds=1)
        period_label = f"저번 달 ({start.strftime('%Y년 %m월')})"
    else:
        start = df['날짜'].min()
        period_label = f"전체 ({start.strftime('%m/%d')} ~ )"
    target = df[df['날짜'] >= start]
    if end is not None:
        target = target[target['날짜'] <= end]
    if target.empty:
        await update.message.reply_text(f"❌ {period_label} 기록이 없어요.")
        return
    workout_days = target['날짜'].nunique()
    total_sets = len(target)
    total_volume = (target['무게'] * target['횟수']).sum()
    target_with_cat = target.copy()
    target_with_cat['부위'] = target_with_cat['운동명'].apply(get_workout_category)
    cat_sets = target_with_cat.groupby('부위').size().to_dict()
    cat_order = category_sort_key()
    sorted_cats = sorted(cat_sets.keys(), key=lambda c: cat_order.get(c, 99))
    max_sets = max(cat_sets.values()) if cat_sets else 1
    cat_lines = []
    for cat in sorted_cats:
        s = cat_sets[cat]
        bar_len = int(round(s / max_sets * 8))
        cat_lines.append(f"{CATEGORY_EMOJI.get(cat,'')} {cat}: {'█'*bar_len}{'░'*(8-bar_len)} {s}세트")
    target_with_cat['1rm'] = target_with_cat.apply(lambda r: estimate_1rm(r['무게'], r['횟수']), axis=1)
    best_1rm_lines = []
    for cat in sorted_cats:
        cat_data = target_with_cat[target_with_cat['부위'] == cat]
        if cat_data.empty or cat_data['1rm'].max() == 0:
            continue
        best_row = cat_data.loc[cat_data['1rm'].idxmax()]
        best_1rm_lines.append(f"{CATEGORY_EMOJI.get(cat,'')} {cat}: {best_row['운동명']} **{best_row['1rm']:g}kg** ({best_row['무게']:g}kg×{int(best_row['횟수'])}회)")
    last_workout_date = df['날짜'].max()
    days_since = (now - last_workout_date).days
    last_str = "오늘 운동 중! 🔥" if days_since == 0 else "어제 운동했어요" if days_since == 1 else f"마지막 운동 {days_since}일 전 ({last_workout_date.strftime('%m/%d')})"
    msg_lines = [f"📊 **{period_label} 통계**", "", f"🗓 운동 일수: **{workout_days}일**",
                 f"💪 총 세트: **{total_sets}세트**", f"⚖️ 총 볼륨: **{total_volume:,.0f}kg**", "",
                 "**부위별 분포**"] + cat_lines
    if best_1rm_lines:
        msg_lines += ["", "**부위별 최고 1RM (기간 내)**"] + best_1rm_lines
    msg_lines += ["", f"⏱ {last_str}"]
    await update.message.reply_text("\n".join(msg_lines), parse_mode='Markdown')

async def show_1rm(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    df = load_dataframe(chat_id)
    if df is None or df.empty:
        await update.message.reply_text("❌ 기록이 아직 없어요.")
        return
    df = df.copy()
    df['1rm'] = df.apply(lambda r: estimate_1rm(r['무게'], r['횟수']), axis=1)
    df['부위'] = df['운동명'].apply(get_workout_category)
    idx = df.groupby('운동명')['1rm'].idxmax()
    best_per_workout = df.loc[idx].sort_values('1rm', ascending=False)
    cat_order = category_sort_key()
    by_cat = {}
    for _, row in best_per_workout.iterrows():
        if row['1rm'] == 0:
            continue
        by_cat.setdefault(row['부위'], []).append(row)
    sorted_cats = sorted(by_cat.keys(), key=lambda c: cat_order.get(c, 99))
    msg_lines = ["🏆 **역대 최고 1RM 랭킹**", ""]
    for cat in sorted_cats:
        msg_lines.append(f"{CATEGORY_EMOJI.get(cat,'')} **{cat}**")
        for row in by_cat[cat]:
            msg_lines.append(f"  • {row['운동명']}: **{row['1rm']:g}kg** ({row['무게']:g}kg×{int(row['횟수'])}회, {row['날짜'].strftime('%m/%d')})")
        msg_lines.append("")
    zero_workouts = best_per_workout[best_per_workout['1rm'] == 0]
    if not zero_workouts.empty:
        msg_lines.append("📝 *맨몸 운동 (1RM 측정 N/A)*")
        for _, row in zero_workouts.iterrows():
            msg_lines.append(f"  • {row['운동명']}: 최대 {int(row['횟수'])}회 ({row['날짜'].strftime('%m/%d')})")
    await update.message.reply_text("\n".join(msg_lines), parse_mode='Markdown')

async def show_graph(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    args = context.args
    if args and args[0].lower() == 'volume':
        period = args[1].lower() if len(args) > 1 else 'week'
        if period not in ('week', 'last', 'month'):
            await update.message.reply_text("사용법: /graph volume [week|last|month]")
            return
        await update.message.reply_text("📊 볼륨 차트 만들고 있어요...")
        ok = send_volume_graph_to_discord('📊 **부위별 볼륨**', chat_id, period=period)
        await update.message.reply_text("디스코드에 볼륨 차트 보냈어요!" if ok else "차트 만드는 데 실패했어요.")
        return
    if args and args[0].lower() == '1rm':
        args = args[1:]
    
    days = None

    for i, arg in enumerate(args):
        arg = arg.lower()

        if arg == "week":
            days = 7
            args.pop(i)
            break

        elif arg == "month":
            days = 30
            args.pop(i)
            break

        elif re.match(r"^\d+week$", arg):
            days = int(arg.replace("week", "")) * 7
            args.pop(i)
            break



    if args:
        workout_name = normalize_workout_name(" ".join(args).strip())
        df = load_dataframe(chat_id)
        if df is None or df.empty or workout_name not in df['운동명'].values:
            await update.message.reply_text(f"❌ '{workout_name}' 기록이 없어요.")
            return
        await update.message.reply_text(f"📊 '{workout_name}' 그래프 만들고 있어요...")
        label = "전체" if days is None else f"{days}일"

        ok = send_graph_to_discord(
            [workout_name],
            f'📈 **{workout_name}** {label} 추이',
            chat_id,
            days=days or 3650
        )
        await update.message.reply_text("디스코드에 그래프를 보냈어요!" if ok else "그래프 만드는 데 실패했어요.")
    else:
        recent = get_recent_workouts(
            chat_id,
            days=days or 3650
        )
        if not recent:
            await update.message.reply_text(
                "❌ 그래프로 표시할 기록이 없어요. 예: /graph 사레레"
            )
            return
        label = "전체" if days is None else f"{days}일"

        await update.message.reply_text(
            f"📊 {label} 그래프 만들고 있어요..."
        )
        ok = send_graph_to_discord(
            recent,
            f'📈 **최근 운동들 {label} 추이**',
            chat_id,
            days=days or 3650
        )
        await update.message.reply_text("디스코드에 그래프를 보냈어요!" if ok else "그래프 만드는 데 실패했어요.")

async def show_food(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    args = context.args

    if not args or args[0].upper() not in ['YES', 'NO']:
        await update.message.reply_text("사용법: /food YES 또는 /food NO")
        return

    template_name = "운동일" if args[0].upper() == "YES" else "비운동일"

    user = get_user_by_chat_id(chat_id)
    if not user:
        await update.message.reply_text("❌ 먼저 /link로 계정을 연결해주세요.")
        return

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT meal_type, food_name, kcal, protein, carb, fat, memo
            FROM meal_templates
            WHERE user_id = %s AND template_name = %s
            ORDER BY sort_order, id
        """, (user[0], template_name))
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    if not rows:
        await update.message.reply_text(f"❌ '{template_name}' 템플릿이 비어있어요. 웹에서 먼저 설정해주세요!")
        return

    meal_order = ["아침", "점심", "저녁", "간식"]
    meal_icons = {"아침": "🌅", "점심": "☀️", "저녁": "🌙", "간식": "🍎"}
    grouped = {t: [] for t in meal_order}
    for row in rows:
        meal_type = row[0]
        if meal_type in grouped:
            grouped[meal_type].append(row)

    emoji = "🏋️" if template_name == "운동일" else "😴"
    lines = [f"{emoji} *{template_name} 식단*\n"]

    for meal_type in meal_order:
        items = grouped[meal_type]
        if not items:
            continue
        lines.append(f"{meal_icons[meal_type]} *{meal_type}*")
        for item in items:
            _, food_name, kcal, protein, carb, fat, memo = item
            line = f"• {food_name}"
            nutrition = []
            if kcal:    nutrition.append(f"{kcal}kcal")
            if protein: nutrition.append(f"단백질 {protein}g")
            if carb:    nutrition.append(f"탄수 {carb}g")
            if fat:     nutrition.append(f"지방 {fat}g")
            if nutrition:
                line += f" ({', '.join(nutrition)})"
            if memo:
                line += f" — {memo}"
            lines.append(line)
        lines.append("")

    await update.message.reply_text("\n".join(lines), parse_mode='Markdown')

async def show_routine(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    user = get_user_by_chat_id(chat_id)
    if not user:
        await update.message.reply_text("❌ 먼저 /link로 계정을 연결해주세요.")
        return

    args = context.args
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, name, exercises FROM routines
            WHERE user_id = %s
            ORDER BY sort_order ASC, id ASC
        """, (user[0],))
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    if not rows:
        await update.message.reply_text("❌ 저장된 루틴이 없어요.")
        return

    if not args:
        msg = "📋 *루틴 목록*\n\n"
        for i, row in enumerate(rows, 1):
            msg += f"{i}. {row[1]}\n"
        msg += "\n`/routine 번호` 로 상세 내용을 확인하세요."
        await update.message.reply_text(msg, parse_mode='Markdown')
        return

    try:
        idx = int(args[0]) - 1
        if idx < 0 or idx >= len(rows):
            await update.message.reply_text(f"1~{len(rows)} 사이 번호를 입력해주세요.")
            return
    except ValueError:
        await update.message.reply_text("숫자로 입력해주세요. 예: /routine 1")
        return

    row = rows[idx]
    name = row[1]
    exercises = row[2]

    msg = f"💪 *{name}*\n\n"
    for ex in exercises:
        workout = ex.get('workout_name', '')
        sets = ex.get('sets', '')
        reps = ex.get('reps', '')
        rir = ex.get('rir', '')
        rest = ex.get('rest', '')

        line = f"• {workout}: {sets}×{reps}회"
        if rir:
            line += f" (RIR {rir}"
            if rest:
                line += f" / 휴식 {rest}"
            line += ")"
        elif rest:
            line += f" (휴식 {rest})"
        msg += line + "\n"

    await update.message.reply_text(msg, parse_mode='Markdown')

async def cardio_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    args = context.args

    if not args:
        await update.message.reply_text(
            "🏃 *유산소 기록 사용법*\n\n"
            "`/cardio 종목 시간(분) [거리km] [페이스] [경사%] [kcal]`\n\n"
            "예시:\n"
            "• `/cardio 런닝머신 30` — 30분\n"
            "• `/cardio 런닝머신 30 3.5` — 30분 3.5km\n"
            "• `/cardio 런닝머신 30 3.5 6'30''` — 페이스 포함\n"
            "• `/cardio 런닝머신 30 3.5 6'30'' 1.0 250` — 전체\n\n"
            "종목: 런닝머신, 사이클, 일립티컬, 로잉머신 등",
            parse_mode='Markdown'
        )
        return

    cardio_name  = args[0] if len(args) > 0 else "런닝머신"
    duration_min = None
    distance_km  = None
    pace         = None
    incline      = None
    kcal         = None

    try:
        if len(args) > 1: duration_min = float(args[1])
        if len(args) > 2: distance_km  = float(args[2])
        if len(args) > 3: pace         = args[3]
        if len(args) > 4: incline      = float(args[4])
        if len(args) > 5: kcal         = int(args[5])
    except ValueError:
        await update.message.reply_text("❌ 숫자 형식이 잘못됐어요. 예: `/cardio 런닝머신 30 3.5`", parse_mode='Markdown')
        return

    if not duration_min and not distance_km:
        await update.message.reply_text("❌ 시간(분) 또는 거리(km)는 반드시 입력해주세요!")
        return

    ok = save_cardio_record(cardio_name, duration_min, distance_km, pace, incline, kcal, chat_id)
    if not ok:
        await update.message.reply_text("❌ 먼저 /link로 계정을 연결해주세요.")
        return

    parts = [f"🏃 *{cardio_name}* 기록 완료!"]
    if duration_min:  parts.append(f"⏱ {duration_min}분")
    if distance_km:   parts.append(f"📍 {distance_km}km")
    if pace:          parts.append(f"🔥 {pace}/km")
    if incline:       parts.append(f"📐 경사 {incline}%")
    if kcal:          parts.append(f"🔥 {kcal}kcal 소모")

    msg = "\n".join(parts)
    await update.message.reply_text(msg, parse_mode='Markdown')
    send_to_discord(msg, chat_id)

# ---------------- 실행 ----------------
if __name__ == '__main__':
    TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
    app = ApplicationBuilder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("finish", finish_workout))
    app.add_handler(CommandHandler("cancel", cancel_last))
    app.add_handler(CommandHandler("graph", show_graph))
    app.add_handler(CommandHandler("summary", show_summary))
    app.add_handler(CommandHandler("1rm", show_1rm))
    app.add_handler(CommandHandler("link", link_command))
    app.add_handler(CommandHandler("food", show_food))
    app.add_handler(CommandHandler("routine", show_routine))
    app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), log_workout))
    app.add_handler(CommandHandler("cardio", cardio_command))
    print("봇이 실행 중입니다...")
    app.run_polling()