/**
 * Overloader 운동 초안 로컬 스토리지 관리 유틸리티 (Step B)
 * - 사용자 ID별 네임스페이스 격리 (일반 UI 혼선 방지용)
 * - 스키마 버전 관리 (v1) 및 마지막 수정 시각(updatedAt) 추적
 * - 14일 초과 초안 자동 정리 (운동일이 아닌 마지막 수정 시각 updatedAt 기준)
 * - 비정상 타이머(12시간 초과) 자동 보정
 * - 다중 탭 충돌 감지 및 로컬스토리지 예외(용량초과, JSON 손상) 안전 방어
 */

export const DRAFT_VERSION = 1;
export const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14일 (마지막 수정 기준)
export const MAX_TIMER_MS = 12 * 60 * 60 * 1000; // 타이머 유효 한계 (12시간)

export const SET_STATUS = {
  PENDING: "PENDING",                     // 저장 전
  SAVING: "SAVING",                       // 저장 중
  CONFIRMED_SUCCESS: "CONFIRMED_SUCCESS", // 저장 성공 확인
  CONFIRMED_FAILED: "CONFIRMED_FAILED",   // 저장 실패 확인 (클라이언트 유효성/4xx 등)
  UNKNOWN: "UNKNOWN"                      // 저장 결과 불명 (타임아웃/응답유실)
};

/**
 * KST (Asia/Seoul, UTC+9) 기준 오늘 날짜 문자열(YYYY-MM-DD) 반환
 */
export function getKSTTodayStr() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 3600000);
  return kst.toISOString().slice(0, 10);
}

/**
 * JWT 토큰 문자열로부터 로컬 스토리지 격리용 user_id 추출
 * (주의: 로컬 UI 키 분리용이며, 서버 인가 근거로 신뢰하지 않음)
 */
export function getUserIdFromToken(token) {
  if (!token || typeof token !== "string") return "guest";
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(atob(parts[1]));
      return payload.user_id ? String(payload.user_id) : "guest";
    }
  } catch (err) {
    console.warn("JWT payload user_id 파싱 실패:", err);
  }
  return "guest";
}

/**
 * 오래된 초안(updatedAt 기준 14일 초과) 자동 정리 (서버 데이터와 무관)
 */
export function cleanExpiredDrafts() {
  try {
    const now = Date.now();
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("overloader_draft_strength_") || key.startsWith("overloader_draft_cardio_"))) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.updatedAt && now - parsed.updatedAt > DRAFT_TTL_MS) {
              keysToRemove.push(key);
            }
          } catch {
            keysToRemove.push(key); // 손상된 JSON은 정리
          }
        }
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (err) {
    console.warn("만료 초안 정리 중 예외:", err);
  }
}

/**
 * 근력 운동 초안 저장
 */
export function saveStrengthDraft(userId, dateStr, data) {
  if (!userId || !dateStr) return { success: false, error: "Missing key params" };
  const key = `overloader_draft_strength_${userId}_${dateStr}`;
  try {
    // 다중 탭 충돌 감지
    const rawExisting = localStorage.getItem(key);
    let hasConflict = false;
    if (rawExisting && data.loadedAt) {
      try {
        const existing = JSON.parse(rawExisting);
        if (existing.updatedAt && existing.updatedAt > data.loadedAt) {
          hasConflict = true;
        }
      } catch {
        // ignore parse error
      }
    }

    const payload = {
      version: DRAFT_VERSION,
      updatedAt: Date.now(),
      date: dateStr,
      sets: Array.isArray(data.sets) ? data.sets : [],
      workoutStartTime: data.workoutStartTime || null,
      formInputs: {
        workoutName: data.workoutName || "",
        weight: data.weight || "",
        reps: data.reps || "",
        setType: data.setType || "normal"
      }
    };

    localStorage.setItem(key, JSON.stringify(payload));
    cleanExpiredDrafts();
    return { success: true, hasConflict, updatedAt: payload.updatedAt };
  } catch (err) {
    console.error("근력 초안 로컬 저장 실패 (용량 초과 등):", err);
    return { success: false, error: err.message };
  }
}

/**
 * 근력 운동 초안 불러오기
 */
export function loadStrengthDraft(userId, dateStr) {
  if (!userId || !dateStr) return null;
  const key = `overloader_draft_strength_${userId}_${dateStr}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== DRAFT_VERSION) return null;

    // 타이머가 12시간 이상 지난 경우 세션 종료로 간주하여 초기화
    let workoutStartTime = parsed.workoutStartTime;
    if (workoutStartTime && Date.now() - workoutStartTime > MAX_TIMER_MS) {
      workoutStartTime = null;
    }

    return {
      updatedAt: parsed.updatedAt || Date.now(),
      date: parsed.date || dateStr,
      sets: Array.isArray(parsed.sets) ? parsed.sets : [],
      workoutStartTime,
      formInputs: parsed.formInputs || { workoutName: "", weight: "", reps: "", setType: "normal" }
    };
  } catch (err) {
    console.warn("근력 초안 로드 중 오류:", err);
    return null;
  }
}

/**
 * 근력 운동 초안 삭제
 */
export function clearStrengthDraft(userId, dateStr) {
  if (!userId || !dateStr) return;
  const key = `overloader_draft_strength_${userId}_${dateStr}`;
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn("근력 초안 삭제 실패:", err);
  }
}

/**
 * 유산소 운동 초안 저장
 */
export function saveCardioDraft(userId, dateStr, data) {
  if (!userId || !dateStr) return { success: false, error: "Missing key params" };
  const key = `overloader_draft_cardio_${userId}_${dateStr}`;
  try {
    const payload = {
      version: DRAFT_VERSION,
      updatedAt: Date.now(),
      date: dateStr,
      inputs: {
        cardioName: data.cardioName || "런닝머신",
        duration: data.duration || "",
        distance: data.distance || "",
        pace: data.pace || "",
        incline: data.incline || "",
        cardioKcal: data.cardioKcal || "",
        cardioMemo: data.cardioMemo || ""
      }
    };
    localStorage.setItem(key, JSON.stringify(payload));
    return { success: true, updatedAt: payload.updatedAt };
  } catch (err) {
    console.error("유산소 초안 로컬 저장 실패:", err);
    return { success: false, error: err.message };
  }
}

/**
 * 유산소 운동 초안 불러오기
 */
export function loadCardioDraft(userId, dateStr) {
  if (!userId || !dateStr) return null;
  const key = `overloader_draft_cardio_${userId}_${dateStr}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== DRAFT_VERSION) return null;
    return {
      updatedAt: parsed.updatedAt || Date.now(),
      date: parsed.date || dateStr,
      inputs: parsed.inputs || {}
    };
  } catch (err) {
    console.warn("유산소 초안 로드 오류:", err);
    return null;
  }
}

/**
 * 유산소 운동 초안 삭제
 */
export function clearCardioDraft(userId, dateStr) {
  if (!userId || !dateStr) return;
  const key = `overloader_draft_cardio_${userId}_${dateStr}`;
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn("유산소 초안 삭제 실패:", err);
  }
}

/**
 * 사용자의 마지막 세션 상태(선택 날짜 및 모드) 불러오기
 */
export function getLastSessionState(userId) {
  if (!userId) return null;
  const key = `overloader_last_session_${userId}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 사용자의 마지막 세션 상태(선택 날짜 및 모드) 저장
 */
export function saveLastSessionState(userId, state) {
  if (!userId) return;
  const key = `overloader_last_session_${userId}`;
  try {
    localStorage.setItem(key, JSON.stringify({
      lastDate: state.lastDate,
      lastMode: state.lastMode,
      updatedAt: Date.now()
    }));
  } catch (err) {
    console.warn("마지막 세션 상태 저장 실패:", err);
  }
}
