import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DumbbellIcon,
  RunnerIcon,
  TrashIcon,
  PlusIcon,
  CalendarIcon
} from "../common/Icons";

const API = process.env.REACT_APP_API_URL;

const WEEKDAYS = [
  { label: "일", color: "#ef4444" },
  { label: "월", color: "var(--sub)" },
  { label: "화", color: "var(--sub)" },
  { label: "수", color: "var(--sub)" },
  { label: "목", color: "var(--sub)" },
  { label: "금", color: "var(--sub)" },
  { label: "토", color: "var(--accent)" }
];

function getLocalDateStr(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateHeader(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const dayName = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${parts[0]}년 ${Number(parts[1])}월 ${Number(parts[2])}일 (${dayName})`;
}

export default function CalendarScreen({ onNavigateTab }) {
  const todayStr = getLocalDateStr();

  // 현재 조회 중인 년/월
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth()); // 0 ~ 11

  // 현재 선택된 날짜 (기본: 오늘)
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // 월간 운동 날짜 데이터 (/logs?month=)
  const [monthData, setMonthData] = useState({
    dates: [],
    strength_dates: [],
    cardio_dates: []
  });
  const [monthLoading, setMonthLoading] = useState(false);

  // 선택된 날짜의 근력 운동 목록 (/logs?date_str=)
  const [dayStrengthLogs, setDayStrengthLogs] = useState([]);
  const [strengthLoading, setStrengthLoading] = useState(false);

  // 선택된 날짜의 유산소 운동 목록 (/cardio?date_str=)
  const [dayCardioLogs, setDayCardioLogs] = useState([]);
  const [cardioLoading, setCardioLoading] = useState(false);

  const monthStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;

  // 1. 월별 운동 날짜 조회
  const loadMonthData = useCallback(async (targetMonth) => {
    try {
      setMonthLoading(true);
      const res = await axios.get(`${API}/logs?month=${targetMonth}`);
      if (res.data) {
        setMonthData({
          dates: res.data.dates || [],
          strength_dates: res.data.strength_dates || [],
          cardio_dates: res.data.cardio_dates || []
        });
      }
    } catch (err) {
      console.warn("월간 운동 데이터 조회 실패:", err);
    } finally {
      setMonthLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMonthData(monthStr);
  }, [monthStr, loadMonthData]);

  // 2. 선택일의 상세 기록(근력 + 유산소) 조회
  const loadDayLogs = useCallback(async (targetDate) => {
    if (!targetDate) return;
    try {
      setStrengthLoading(true);
      setCardioLoading(true);

      const [strengthRes, cardioRes] = await Promise.all([
        axios.get(`${API}/logs?date_str=${targetDate}`).catch(() => ({ data: [] })),
        axios.get(`${API}/cardio?date_str=${targetDate}`).catch(() => ({ data: [] }))
      ]);

      setDayStrengthLogs(Array.isArray(strengthRes.data) ? strengthRes.data : []);
      setDayCardioLogs(Array.isArray(cardioRes.data) ? cardioRes.data : []);
    } catch (err) {
      console.warn("선택일 운동 기록 조회 실패:", err);
    } finally {
      setStrengthLoading(false);
      setCardioLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDayLogs(selectedDate);
  }, [selectedDate, loadDayLogs]);

  // 3. 월 이동 네비게이션
  const navigateMonth = (delta) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  // 4. '오늘' 버튼 클릭 핸들러
  const handleJumpToToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(todayStr);
  };

  // 5. 근력 세트 삭제 핸들러
  const handleDeleteStrengthSet = async (setId) => {
    if (!window.confirm("이 세트를 삭제할까요?")) return;
    try {
      await axios.delete(`${API}/logs/${setId}`);
      await loadDayLogs(selectedDate);
      await loadMonthData(monthStr);
    } catch (err) {
      console.error("세트 삭제 실패:", err);
      alert("세트 삭제 중 오류가 발생했습니다.");
    }
  };

  // 6. 유산소 기록 삭제 핸들러
  const handleDeleteCardioLog = async (logId) => {
    if (!window.confirm("유산소 기록을 삭제할까요?")) return;
    try {
      await axios.delete(`${API}/cardio/${logId}`);
      await loadDayLogs(selectedDate);
      await loadMonthData(monthStr);
    } catch (err) {
      console.error("유산소 삭제 실패:", err);
      alert("유산소 기록 삭제 중 오류가 발생했습니다.");
    }
  };

  // 달력 42칸 생성 (6행 x 7열 고정)
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);
  while (calendarDays.length < 42) calendarDays.push(null);

  // 근력 로그 운동명별 그룹화
  const groupedStrengthLogs = dayStrengthLogs.reduce((acc, row) => {
    const name = row.workout_name || "운동";
    if (!acc[name]) acc[name] = [];
    acc[name].push(row);
    return acc;
  }, {});

  const totalStrengthSets = dayStrengthLogs.length;
  const totalCardioCount = dayCardioLogs.length;
  const isSelectedDateEmpty = !strengthLoading && !cardioLoading && totalStrengthSets === 0 && totalCardioCount === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── 상단 헤더 배너 ── */}
      <div
        className="ui-card"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          background: "linear-gradient(135deg, var(--card) 0%, var(--card-subtle) 100%)"
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text)" }}>
            운동 달력
          </h2>
          <p style={{ fontSize: 13, color: "var(--sub)", margin: "4px 0 0" }}>
            날짜별 근력 및 유산소 운동 내역을 확인하고 관리하세요
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              padding: "6px 14px",
              borderRadius: "var(--radius-pill)",
              backgroundColor: "var(--card-subtle)",
              border: "1px solid var(--border)",
              color: "var(--accent)",
              fontSize: 13,
              fontWeight: 700
            }}
          >
            이번 달 {monthData.dates.length}일 운동
          </div>
        </div>
      </div>

      {/* ── 2열 분할 레이아웃 (PC: 좌측 달력, 우측 상세 / 모바일: 1열 스택) ── */}
      <div className="calendar-layout">
        {/* ── 좌측: 월간 달력 카드 ── */}
        <div className="ui-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 달력 상단 네비게이션 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => navigateMonth(-1)}
                style={{ padding: "6px 10px", borderRadius: "var(--radius-inner)" }}
                title="이전 달"
              >
                <ChevronLeftIcon size={16} />
              </button>

              <span style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", padding: "0 6px" }}>
                {viewYear}년 {viewMonth + 1}월
              </span>

              <button
                type="button"
                className="btn-ghost"
                onClick={() => navigateMonth(1)}
                style={{ padding: "6px 10px", borderRadius: "var(--radius-inner)" }}
                title="다음 달"
              >
                <ChevronRightIcon size={16} />
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={handleJumpToToday}
                style={{ fontSize: 12, padding: "6px 12px", borderRadius: "var(--radius-pill)" }}
              >
                오늘
              </button>
            </div>
          </div>

          {/* 범례 (Legend) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontSize: 12,
              color: "var(--sub)",
              paddingBottom: 4,
              borderBottom: "1px solid var(--border)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "var(--accent)" }} />
              <span>근력</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "var(--success)" }} />
              <span>유산소</span>
            </div>
            {monthLoading && (
              <span style={{ fontSize: 11, color: "var(--sub)", marginLeft: "auto" }}>갱신 중...</span>
            )}
          </div>

          {/* 요일 헤더 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center" }}>
            {WEEKDAYS.map((w) => (
              <div
                key={w.label}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "4px 0",
                  color: w.color
                }}
              >
                {w.label}
              </div>
            ))}
          </div>

          {/* 달력 날짜 그리드 (42칸 고정) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {calendarDays.map((day, idx) => {
              if (!day) {
                return <div key={`empty-${idx}`} className="calendar-cell empty" />;
              }

              const cellDateStr = `${monthStr}-${String(day).padStart(2, "0")}`;
              const isSelected = selectedDate === cellDateStr;
              const isToday = todayStr === cellDateStr;
              const hasStrength = monthData.strength_dates.includes(cellDateStr);
              const hasCardio = monthData.cardio_dates.includes(cellDateStr);

              return (
                <div
                  key={cellDateStr}
                  className={`calendar-cell ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}`}
                  onClick={() => setSelectedDate(cellDateStr)}
                >
                  <span>{day}</span>

                  {/* 근력 / 유산소 표시 닷 */}
                  <div style={{ display: "flex", gap: 3, height: 5, marginTop: 2, alignItems: "center" }}>
                    {hasStrength && (
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          backgroundColor: isSelected ? "#ffffff" : "var(--accent)"
                        }}
                      />
                    )}
                    {hasCardio && (
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          backgroundColor: isSelected ? "#ffffff" : "var(--success)"
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 우측: 선택일 운동 기록 상세 카드 (DayDetail) ── */}
        <div className="ui-card" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* 선택일 헤더 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: 12,
              borderBottom: "1px solid var(--border)"
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                {formatDateHeader(selectedDate)}
              </div>
              <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
                {selectedDate === todayStr ? "오늘의 운동 내역" : "과거 운동 상세 내역"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              {totalStrengthSets > 0 && (
                <span
                  style={{
                    padding: "3px 8px",
                    borderRadius: "var(--radius-pill)",
                    fontSize: 11,
                    fontWeight: 700,
                    backgroundColor: "var(--accent-bg)",
                    color: "var(--accent)"
                  }}
                >
                  근력 {totalStrengthSets}세트
                </span>
              )}
              {totalCardioCount > 0 && (
                <span
                  style={{
                    padding: "3px 8px",
                    borderRadius: "var(--radius-pill)",
                    fontSize: 11,
                    fontWeight: 700,
                    backgroundColor: "var(--success-bg)",
                    color: "var(--success)"
                  }}
                >
                  유산소 {totalCardioCount}건
                </span>
              )}
            </div>
          </div>

          {/* 로딩 표시 */}
          {(strengthLoading || cardioLoading) && (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--sub)", fontSize: 13 }}>
              운동 기록을 불러오는 중...
            </div>
          )}

          {/* 빈 상태 안내 */}
          {isSelectedDateEmpty && (
            <div
              style={{
                padding: "36px 16px",
                textAlign: "center",
                backgroundColor: "var(--card-subtle)",
                borderRadius: "var(--radius-inner)",
                border: "1px dashed var(--border)"
              }}
            >
              <CalendarIcon size={32} color="var(--sub)" />
              <p style={{ margin: "10px 0 0", fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                기록된 운동이 없습니다
              </p>
              <p style={{ margin: "4px 0 16px", fontSize: 12, color: "var(--sub)" }}>
                {selectedDate === todayStr ? "오늘 진행한 운동을 기록 탭에서 추가해보세요!" : "해당 날짜에는 운동 기록이 존재하지 않습니다."}
              </p>

              {onNavigateTab && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => onNavigateTab("record")}
                  style={{ fontSize: 13, padding: "8px 16px" }}
                >
                  <PlusIcon size={14} />
                  <span>운동 기록하러 가기</span>
                </button>
              )}
            </div>
          )}

          {/* ── 1. 근력 운동 상세 내역 ── */}
          {!strengthLoading && Object.keys(groupedStrengthLogs).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--accent)", fontSize: 14, fontWeight: 700 }}>
                <DumbbellIcon size={16} />
                <span>근력 운동 내역</span>
              </div>

              {Object.entries(groupedStrengthLogs).map(([workoutName, sets]) => (
                <div
                  key={workoutName}
                  style={{
                    padding: "12px 14px",
                    backgroundColor: "var(--card-subtle)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-inner)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                      {workoutName}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--sub)" }}>
                      총 {sets.length}세트
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {sets.map((s, idx) => {
                      const setNumber = sets.slice(0, idx + 1).filter((x) => x.workout_name === s.workout_name).length;
                      return (
                        <div
                          key={s.id || idx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "6px 10px",
                            borderRadius: 8,
                            backgroundColor: "var(--card)",
                            border: "1px solid var(--border)",
                            fontSize: 13
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 22,
                                height: 22,
                                borderRadius: "var(--radius-pill)",
                                backgroundColor: s.set_type === "drop" ? "rgba(249, 115, 22, 0.15)" : "var(--card-subtle)",
                                color: s.set_type === "drop" ? "var(--accent)" : "var(--sub)",
                                fontSize: 11,
                                fontWeight: 700
                              }}
                            >
                              {s.set_type === "drop" ? "D" : setNumber}
                            </span>
                            <span style={{ color: "var(--text)" }}>
                              {s.weight_kg ?? s.weight ?? 0} {s.unit || "kg"} × {s.reps}회
                            </span>
                            {s.set_type === "drop" && (
                              <span
                                style={{
                                  padding: "1px 5px",
                                  borderRadius: 4,
                                  fontSize: 10,
                                  backgroundColor: "rgba(249, 115, 22, 0.2)",
                                  color: "var(--accent)",
                                  fontWeight: 700
                                }}
                              >
                                DROP
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteStrengthSet(s.id)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--sub)",
                              cursor: "pointer",
                              padding: 4,
                              display: "flex",
                              alignItems: "center"
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--sub)")}
                            title="세트 삭제"
                          >
                            <TrashIcon size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── 2. 유산소 운동 상세 내역 ── */}
          {!cardioLoading && dayCardioLogs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--success)", fontSize: 14, fontWeight: 700 }}>
                <RunnerIcon size={16} />
                <span>유산소 운동 내역</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dayCardioLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      padding: "12px 14px",
                      backgroundColor: "var(--card-subtle)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-inner)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between"
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                        {log.cardio_name}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          flexWrap: "wrap",
                          fontSize: 12,
                          color: "var(--sub)",
                          marginTop: 4
                        }}
                      >
                        {log.duration_min && <span>⏱ {log.duration_min}분</span>}
                        {log.distance_km && <span>📍 {log.distance_km}km</span>}
                        {log.pace && <span>⚡ 페이스 {log.pace}/km</span>}
                        {log.incline && <span>📐 경사 {log.incline}%</span>}
                        {log.kcal && <span>🔥 {log.kcal}kcal</span>}
                        {log.memo && <span>💬 {log.memo}</span>}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteCardioLog(log.id)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--sub)",
                        cursor: "pointer",
                        padding: 6,
                        display: "flex",
                        alignItems: "center"
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--sub)")}
                      title="유산소 기록 삭제"
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
