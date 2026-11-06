import React from "react";
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon } from "../common/Icons";
import { getKSTTodayStr } from "../../utils/draftStorage";

export default function DateSelector({ selectedDate, onChangeDate, disabled = false }) {
  const todayKST = getKSTTodayStr();

  const handlePrevDay = () => {
    if (disabled) return;
    const [y, m, d] = selectedDate.split("-").map(Number);
    const prev = new Date(y, m - 1, d - 1);
    const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`;
    onChangeDate(prevStr);
  };

  const handleNextDay = () => {
    if (disabled || selectedDate >= todayKST) return;
    const [y, m, d] = selectedDate.split("-").map(Number);
    const next = new Date(y, m - 1, d + 1);
    const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    if (nextStr <= todayKST) {
      onChangeDate(nextStr);
    }
  };

  const handleDateInput = (e) => {
    if (disabled) return;
    const val = e.target.value;
    if (val && val <= todayKST) {
      onChangeDate(val);
    }
  };

  const isToday = selectedDate === todayKST;
  const isPast = selectedDate < todayKST;

  // 일수 차이 계산
  let diffDays = 0;
  if (isPast) {
    const dSelected = new Date(selectedDate);
    const dToday = new Date(todayKST);
    diffDays = Math.round((dToday - dSelected) / (1000 * 60 * 60 * 24));
  }

  return (
    <div
      className="ui-card"
      style={{
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        background: isPast ? "var(--card-subtle)" : "var(--card)",
        border: isPast ? "1px solid var(--accent)" : "1px solid var(--border)",
        transition: "all 0.2s ease"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <CalendarIcon size={18} color={isPast ? "var(--accent)" : "var(--sub)"} />
        <span style={{ fontSize: 13, fontWeight: 700, color: isPast ? "var(--accent)" : "var(--text)" }}>
          운동 날짜
        </span>
        {isToday && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 12,
              backgroundColor: "rgba(34, 197, 94, 0.15)",
              color: "var(--success)"
            }}
          >
            오늘
          </span>
        )}
        {isPast && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 12,
              backgroundColor: "var(--accent-bg)",
              color: "var(--accent)"
            }}
          >
            과거 기록 ({diffDays}일 전)
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          onClick={handlePrevDay}
          disabled={disabled}
          className="btn-icon"
          aria-label="이전 날짜"
          style={{
            padding: "8px 10px",
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-inner)",
            color: "var(--text)",
            cursor: disabled ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center"
          }}
        >
          <ChevronLeftIcon size={16} />
        </button>

        <input
          type="date"
          value={selectedDate}
          max={todayKST}
          disabled={disabled}
          onChange={handleDateInput}
          className="record-date-input"
          style={{
            cursor: disabled ? "not-allowed" : "pointer"
          }}
        />

        <button
          type="button"
          onClick={handleNextDay}
          disabled={disabled || selectedDate >= todayKST}
          className="btn-icon"
          aria-label="다음 날짜"
          style={{
            padding: "8px 10px",
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-inner)",
            color: selectedDate >= todayKST ? "var(--sub)" : "var(--text)",
            cursor: disabled || selectedDate >= todayKST ? "not-allowed" : "pointer",
            opacity: selectedDate >= todayKST ? 0.4 : 1,
            display: "flex",
            alignItems: "center"
          }}
        >
          <ChevronRightIcon size={16} />
        </button>

        {!isToday && (
          <button
            type="button"
            onClick={() => !disabled && onChangeDate(todayKST)}
            disabled={disabled}
            className="btn-ghost"
            style={{
              fontSize: 12,
              padding: "8px 12px",
              marginLeft: 4,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-inner)",
              cursor: disabled ? "not-allowed" : "pointer"
            }}
          >
            오늘로
          </button>
        )}
      </div>
    </div>
  );
}
