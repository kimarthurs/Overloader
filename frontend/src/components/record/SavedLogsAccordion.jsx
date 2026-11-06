import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, AlertTriangleIcon, RefreshIcon } from "../common/Icons";

const API = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

export default function SavedLogsAccordion({ date, mode, refreshTrigger }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [logs, setLogs] = useState([]);
  const activeReqIdRef = useRef(0);

  const fetchLogs = async (targetDate, targetMode) => {
    if (!targetDate) return;
    const reqId = ++activeReqIdRef.current;
    setLoading(true);
    setError(false);

    try {
      let res;
      if (targetMode === "strength") {
        res = await axios.get(`${API}/logs?date_str=${encodeURIComponent(targetDate)}`);
        // If race condition: ignore if request is stale
        if (reqId !== activeReqIdRef.current) return;
        const data = Array.isArray(res.data) ? res.data : [];
        setLogs(data);
      } else {
        res = await axios.get(`${API}/cardio?date_str=${encodeURIComponent(targetDate)}`);
        if (reqId !== activeReqIdRef.current) return;
        const data = Array.isArray(res.data) ? res.data : [];
        setLogs(data);
      }
    } catch (err) {
      if (reqId !== activeReqIdRef.current) return;
      console.warn("날짜별 서버 기록 조회 실패:", err);
      setError(true);
      setLogs([]);
    } finally {
      if (reqId === activeReqIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchLogs(date, mode);
  }, [date, mode, refreshTrigger]);

  if (loading) {
    return (
      <div
        className="ui-card"
        style={{
          padding: "10px 14px",
          fontSize: 12,
          color: "var(--sub)",
          display: "flex",
          alignItems: "center",
          gap: 8
        }}
      >
        <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid var(--sub)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <span>서버에 저장된 기록 확인 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="ui-card"
        style={{
          padding: "10px 14px",
          fontSize: 12,
          color: "var(--danger)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          border: "1px dashed var(--danger)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <AlertTriangleIcon size={14} color="var(--danger)" />
          <span>해당 날짜의 서버 기록을 불러오지 못했습니다.</span>
        </div>
        <button
          type="button"
          onClick={() => fetchLogs(date, mode)}
          className="btn-ghost"
          style={{ fontSize: 11, padding: "2px 8px", display: "flex", alignItems: "center", gap: 4 }}
        >
          <RefreshIcon size={12} />
          <span>다시 시도</span>
        </button>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div
        className="ui-card"
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "var(--card-subtle)",
          border: "1px solid var(--border)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CheckIcon size={16} color="var(--sub)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
            이 날짜에 저장된 기록
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 4,
              backgroundColor: "var(--card)",
              color: "var(--sub)",
              border: "1px solid var(--border)"
            }}
          >
            0건
          </span>
        </div>
        <span style={{ fontSize: 12, color: "var(--sub)" }}>
          서버에 저장된 기록이 없습니다
        </span>
      </div>
    );
  }

  return (
    <div
      className="ui-card"
      style={{
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        backgroundColor: "var(--card-subtle)",
        border: "1px solid var(--border)"
      }}
    >
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          userSelect: "none"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CheckIcon size={16} color="var(--success)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
            이 날짜에 저장된 기록
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 4,
              backgroundColor: "rgba(34, 197, 94, 0.15)",
              color: "var(--success)"
            }}
          >
            서버 저장 완료 {logs.length}건
          </span>
        </div>

        <button
          type="button"
          style={{
            background: "none",
            border: "none",
            color: "var(--sub)",
            padding: "4px 8px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4
          }}
          aria-label={isOpen ? "목록 닫기" : "목록 열기"}
        >
          <span style={{ fontSize: 12, color: "var(--sub)", fontWeight: 600 }}>
            {isOpen ? "접기" : "기록 보기"}
          </span>
          {isOpen ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
        </button>
      </div>

      {isOpen && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 10,
            display: "flex",
            flexDirection: "column",
            gap: 6
          }}
        >
          {mode === "strength" ? (
            logs.map((item, idx) => (
              <div
                key={item.id || idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 12,
                  padding: "6px 8px",
                  borderRadius: "var(--radius-inner)",
                  backgroundColor: "var(--card)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--sub)", fontSize: 11, minWidth: 20 }}>
                    #{item.set_no || idx + 1}
                  </span>
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>
                    {item.workout_name}
                  </span>
                </div>
                <div style={{ color: "var(--sub)" }}>
                  <strong style={{ color: "var(--text)" }}>{item.weight_kg}kg</strong> × {item.reps}회
                </div>
              </div>
            ))
          ) : (
            logs.map((c, idx) => (
              <div
                key={c.id || idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 12,
                  padding: "6px 8px",
                  borderRadius: "var(--radius-inner)",
                  backgroundColor: "var(--card)"
                }}
              >
                <span style={{ fontWeight: 600, color: "var(--text)" }}>
                  {c.cardio_name || "유산소"}
                </span>
                <span style={{ color: "var(--sub)" }}>
                  {c.duration_min && `${c.duration_min}분 `}
                  {c.distance_km && `${c.distance_km}km `}
                  {c.kcal && `· ${c.kcal}kcal`}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
