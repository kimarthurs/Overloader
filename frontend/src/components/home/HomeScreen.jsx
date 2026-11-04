import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  PlusIcon,
  ChevronRightIcon,
  DumbbellIcon,
  RunnerIcon,
  ClockIcon,
  AnalyzeIcon,
  HealthIcon,
  SettingsIcon
} from "../common/Icons";

const API = process.env.REACT_APP_API_URL;

// 로컬 시간대 기준 YYYY-MM-DD 및 YYYY-MM 산출 헬퍼
function getLocalDateStr(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalMonthStr(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function HomeScreen({ userName, onNavigateTab, showLastWorkout = true }) {
  const todayStr = getLocalDateStr();
  const currentMonthStr = getLocalMonthStr();

  // 최근 운동 데이터 (/last-workout)
  const [recentLogs, setRecentLogs] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState(false);

  // 월간 운동 데이터 (/logs?month=)
  const [monthData, setMonthData] = useState({ dates: [], strength_dates: [], cardio_dates: [] });
  const [monthLoading, setMonthLoading] = useState(true);
  const [monthError, setMonthError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // 1. 최근 근력 운동 데이터 조회
    axios
      .get(`${API}/last-workout`)
      .then((res) => {
        if (!isMounted) return;
        setRecentLogs(Array.isArray(res.data) ? res.data : []);
        setRecentLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("홈 최근 운동 로드 실패:", err);
        setRecentError(true);
        setRecentLoading(false);
      });

    // 2. 월간 활동 데이터 조회
    axios
      .get(`${API}/logs?month=${currentMonthStr}`)
      .then((res) => {
        if (!isMounted) return;
        setMonthData({
          dates: res.data?.dates || [],
          strength_dates: res.data?.strength_dates || [],
          cardio_dates: res.data?.cardio_dates || []
        });
        setMonthLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("홈 월간 데이터 로드 실패:", err);
        setMonthError(true);
        setMonthLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentMonthStr]);

  // 오늘 세트 수 계산: recentLogs의 첫 항목 날짜가 오늘(todayStr)과 일치할 때만 합산
  const isLastWorkoutToday = recentLogs.length > 0 && recentLogs[0].date === todayStr;
  const todaySetCount = isLastWorkoutToday
    ? recentLogs.reduce((sum, item) => sum + (item.setcount || 0), 0)
    : 0;

  // 가장 최근 근력 운동일
  const recentStrengthDate = recentLogs.length > 0 ? recentLogs[0].date : null;

  // 날짜 헤더 문자열 (예: 11월 4일 (수))
  const todayDateObj = new Date();
  const formattedToday = `${todayDateObj.getMonth() + 1}월 ${todayDateObj.getDate()}일 (${WEEKDAYS[todayDateObj.getDay()]})`;

  // 미니 달력 날짜 그리드 계산
  const currentYear = todayDateObj.getFullYear();
  const currentMonth = todayDateObj.getMonth();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
  const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const calendarDays = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= totalDaysInMonth; d++) {
    calendarDays.push(d);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── 데스크톱 2열 그리드 / 모바일 1열 스택 ── */}
      <div className="home-grid" style={{ display: "grid", gap: 20 }}>
        {/* ── 좌측/상단 메인 영역 ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 상단 히어로 카드 */}
          <div
            className="ui-card"
            style={{
              background: "linear-gradient(135deg, rgba(249, 115, 22, 0.12) 0%, rgba(24, 24, 31, 0.95) 70%)",
              position: "relative",
              overflow: "hidden"
            }}
          >
            <div style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600, marginBottom: 6 }}>
              📅 오늘 · {formattedToday}
            </div>

            <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px", color: "var(--text)" }}>
              {recentLoading ? (
                "운동 기록을 확인하는 중..."
              ) : recentError ? (
                `${userName || "회원"}님, 환영합니다!`
              ) : isLastWorkoutToday ? (
                `${userName || "회원"}님, ${todaySetCount}세트 기록했어요`
              ) : (
                `${userName || "회원"}님, 오늘 운동을 시작해보세요!`
              )}
            </h2>

            <p style={{ fontSize: 13, color: "var(--sub)", margin: "0 0 18px", lineHeight: 1.5 }}>
              이어서 세트를 추가하거나, 최근 흐름을 확인해보세요.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button
                className="btn-primary"
                onClick={() => onNavigateTab("record")}
              >
                <PlusIcon size={16} />
                <span>운동 기록하기</span>
              </button>

              <div
                style={{
                  padding: "6px 14px",
                  borderRadius: "var(--radius-pill)",
                  backgroundColor: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--sub)"
                }}
              >
                {monthLoading
                  ? "이번 달 집계 중..."
                  : monthError
                  ? "이번 달 운동 데이터 미제공"
                  : monthData.dates.length > 0
                  ? `이번 달 ${monthData.dates.length}일 운동`
                  : "이번 달 운동 기록 없음"}
              </div>
            </div>
          </div>

          {/* 3종 요약 지표 타일 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
            {/* 이번 달 근력 */}
            <div className="ui-card" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--sub)", marginBottom: 8 }}>
                <DumbbellIcon size={15} color="var(--accent)" />
                <span>이번 달 근력</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>
                {monthLoading ? "..." : monthError ? "-" : `${monthData.strength_dates.length}일`}
              </div>
            </div>

            {/* 이번 달 유산소 */}
            <div className="ui-card" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--sub)", marginBottom: 8 }}>
                <RunnerIcon size={15} color="var(--success)" />
                <span>이번 달 유산소</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>
                {monthLoading ? "..." : monthError ? "-" : `${monthData.cardio_dates.length}일`}
              </div>
            </div>

            {/* 최근 근력 운동 */}
            <div className="ui-card" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--sub)", marginBottom: 8 }}>
                <ClockIcon size={15} color="var(--sub)" />
                <span>최근 근력 운동</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>
                {recentLoading
                  ? "..."
                  : recentError
                  ? "-"
                  : recentStrengthDate
                  ? recentStrengthDate.slice(5) // MM-DD
                  : "기록 없음"}
              </div>
            </div>
          </div>

          {/* 최근 근력 운동 목록 (설정의 showLastWorkout 토글 연동) */}
          {showLastWorkout && (
            <div className="ui-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                    💪 최근 근력 운동
                  </span>
                  {recentStrengthDate && (
                    <span style={{ fontSize: 12, color: "var(--sub)", marginLeft: 8 }}>
                      ({recentStrengthDate})
                    </span>
                  )}
                </div>

                <button
                  onClick={() => onNavigateTab("calendar")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4
                  }}
                >
                  <span>전체 보기</span>
                  <ChevronRightIcon size={14} />
                </button>
              </div>

              {recentLoading ? (
                <div style={{ color: "var(--sub)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                  최근 운동을 불러오는 중...
                </div>
              ) : recentError ? (
                <div style={{ color: "var(--danger)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                  최근 운동을 불러오지 못했어요.
                </div>
              ) : recentLogs.length === 0 ? (
                <div style={{ color: "var(--sub)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                  아직 기록된 근력 운동이 없어요.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {recentLogs.map((log, index) => (
                    <div
                      key={`${log.workoutname}-${index}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 14px",
                        borderRadius: "var(--radius-inner)",
                        backgroundColor: "var(--card-subtle)",
                        border: "1px solid var(--border)"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            backgroundColor: "rgba(255, 255, 255, 0.05)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--sub)",
                            flexShrink: 0
                          }}
                        >
                          <DumbbellIcon size={16} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                            {log.workoutname}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
                            총 {log.setcount}세트 · 평균 {log.avgweight ?? 0}kg · {log.avgreps ?? 0}회
                          </div>
                        </div>
                      </div>

                      <div style={{ fontSize: 12, color: "var(--sub)", fontWeight: 500, flexShrink: 0 }}>
                        {log.date ? log.date.slice(5) : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 우측 컬럼 (PC) / 하단 스택 (모바일) ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 미니 캘린더 카드 */}
          <div className="ui-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                {currentYear}년 {currentMonth + 1}월 운동 기록
              </span>
              <button
                onClick={() => onNavigateTab("calendar")}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4
                }}
              >
                <span>달력</span>
                <ChevronRightIcon size={14} />
              </button>
            </div>

            {/* 요일 헤더 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: 8 }}>
              {WEEKDAYS.map((w, idx) => (
                <div
                  key={w}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: idx === 0 ? "var(--danger)" : idx === 6 ? "var(--accent)" : "var(--sub)"
                  }}
                >
                  {w}
                </div>
              ))}
            </div>

            {/* 날짜 그리드 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {calendarDays.map((day, idx) => {
                if (!day) return <div key={idx} style={{ height: 36 }} />;

                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isToday = dateStr === todayStr;
                const hasStrength = monthData.strength_dates.includes(dateStr);
                const hasCardio = monthData.cardio_dates.includes(dateStr);
                const hasActivity = hasStrength || hasCardio;

                return (
                  <div
                    key={idx}
                    onClick={() => onNavigateTab("calendar")}
                    style={{
                      height: 36,
                      borderRadius: 8,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: hasActivity ? "pointer" : "default",
                      backgroundColor: isToday ? "rgba(249, 115, 22, 0.15)" : "transparent",
                      border: isToday ? "1px solid var(--accent)" : "1px solid transparent",
                      color: isToday ? "var(--accent)" : "var(--text)",
                      fontSize: 13,
                      fontWeight: isToday ? 700 : 400
                    }}
                  >
                    <span>{day}</span>
                    {/* 운동 점 표시 */}
                    <div style={{ display: "flex", gap: 3, marginTop: 2, height: 4 }}>
                      {hasStrength && (
                        <div style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "var(--accent)" }} />
                      )}
                      {hasCardio && (
                        <div style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "var(--success)" }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 범례 및 안내 */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 14,
                paddingTop: 12,
                borderTop: "1px solid var(--border)",
                fontSize: 11,
                color: "var(--sub)"
              }}
            >
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "var(--accent)" }} />
                  근력
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "var(--success)" }} />
                  유산소
                </span>
              </div>
              <span>날짜를 누르면 상세 기록</span>
            </div>
          </div>

          {/* 바로가기 카드 */}
          <div className="ui-card">
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
              바로가기
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* 분석 */}
              <button
                onClick={() => onNavigateTab("analyze")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-inner)",
                  backgroundColor: "var(--card-subtle)",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  color: "inherit",
                  textAlign: "left"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <AnalyzeIcon size={18} color="var(--accent)" />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>분석</div>
                    <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2 }}>볼륨 · 1RM · 추세 · ML</div>
                  </div>
                </div>
                <ChevronRightIcon size={14} color="var(--sub)" />
              </button>

              {/* 건강 */}
              <button
                onClick={() => onNavigateTab("health")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-inner)",
                  backgroundColor: "var(--card-subtle)",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  color: "inherit",
                  textAlign: "left"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <HealthIcon size={18} color="var(--success)" />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>건강</div>
                    <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2 }}>바디 · 식단 · 루틴 · AI</div>
                  </div>
                </div>
                <ChevronRightIcon size={14} color="var(--sub)" />
              </button>

              {/* 설정 */}
              <button
                onClick={() => onNavigateTab("settings")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-inner)",
                  backgroundColor: "var(--card-subtle)",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  color: "inherit",
                  textAlign: "left"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <SettingsIcon size={18} color="var(--sub)" />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>설정</div>
                    <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2 }}>테마 · 계정 · 홈 설정</div>
                  </div>
                </div>
                <ChevronRightIcon size={14} color="var(--sub)" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
