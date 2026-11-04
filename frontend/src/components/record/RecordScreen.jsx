import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  DumbbellIcon,
  RunnerIcon,
  PlusIcon,
  ArrowDownIcon,
  TrashIcon,
  ClockIcon,
  CheckIcon,
  FlameIcon
} from "../common/Icons";

const API = process.env.REACT_APP_API_URL;

const QUICK_STRENGTH_PRESETS = [
  "바벨 벤치프레스",
  "바벨 스쿼트",
  "데드리프트",
  "오버헤드 프레스",
  "바벨 로우",
  "턱걸이"
];

const CARDIO_PRESETS = [
  "런닝머신",
  "사이클",
  "일립티컬",
  "로잉머신",
  "계단오르기",
  "줄넘기"
];

export default function RecordScreen({ onSaved }) {
  // 모드 전환: "strength" | "cardio"
  const [mode, setMode] = useState("strength");

  // ── 근력 운동 상태 ──
  const [workoutName, setWorkoutName] = useState("");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [sets, setSets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(null);
  const lastAddedRef = useRef(null);

  // 운동명 자동완성
  const [availableNames, setAvailableNames] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // 실시간 운동 타이머
  const [workoutStartTime, setWorkoutStartTime] = useState(null);
  const [now, setNow] = useState(Date.now());

  // 최근 운동 불러오기
  const [recentLogs, setRecentLogs] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState("");

  // ── 유산소 상태 ──
  const [cardioName, setCardioName] = useState("런닝머신");
  const [customCardio, setCustomCardio] = useState(false);
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [pace, setPace] = useState("");
  const [incline, setIncline] = useState("");
  const [cardioKcal, setCardioKcal] = useState("");
  const [cardioMemo, setCardioMemo] = useState("");
  const [cardioSaving, setCardioSaving] = useState(false);
  const [cardioDone, setCardioDone] = useState(false);

  // 타이머 인터벌
  useEffect(() => {
    if (!workoutStartTime) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [workoutStartTime]);

  // 최근 운동 목록 조회
  const loadRecentLogs = async () => {
    try {
      setRecentLoading(true);
      setRecentError("");
      const res = await axios.get(`${API}/last-workout?limit=5`, { timeout: 10000 });
      setRecentLogs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("최근 운동 조회 실패:", err);
      setRecentError("최근 운동 기록을 불러오지 못했습니다.");
    } finally {
      setRecentLoading(false);
    }
  };

  // 운동명 자동완성 목록 조회
  useEffect(() => {
    loadRecentLogs();
    axios
      .get(`${API}/workout-names`)
      .then((res) => {
        if (Array.isArray(res.data)) {
          setAvailableNames(res.data);
        }
      })
      .catch((err) => {
        console.warn("운동명 목록 조회 실패:", err);
      });
  }, []);

  // ── 근력 세트 추가 ──
  const addSet = () => {
    // 입력창이 비어있고 마지막 추가 세트가 있으면 복원 (기존 편의 UX 유지)
    if ((!weight || !reps) && lastAddedRef.current) {
      const last = lastAddedRef.current;
      setWeight(last.weight);
      setReps(last.reps);
      return;
    }

    if (!workoutName || !reps) return;

    if (!workoutStartTime) {
      setWorkoutStartTime(Date.now());
    }

    const newSet = {
      workoutName: workoutName.trim(),
      weight: weight.trim() || "0",
      reps: reps.trim(),
      setType: "normal",
      setGroup: crypto.randomUUID()
    };

    const nextIdx = sets.length;
    setHighlightIndex(nextIdx);
    setTimeout(() => setHighlightIndex(null), 700);

    setSets((prev) => [...prev, newSet]);
    lastAddedRef.current = newSet;

    // 종목명은 유지하고 무게/횟수만 초기화
    setWeight("");
    setReps("");
    setShowSuggestions(false);
  };

  // 드랍 세트 추가
  const addDropSet = () => {
    if (sets.length === 0) return;
    const lastSet = sets[sets.length - 1];

    if (!workoutStartTime) {
      setWorkoutStartTime(Date.now());
    }

    const dropSet = {
      workoutName: lastSet.workoutName,
      weight: weight.trim() || lastSet.weight,
      reps: reps.trim() || lastSet.reps,
      setType: "drop",
      setGroup: lastSet.setGroup
    };

    const nextIdx = sets.length;
    setHighlightIndex(nextIdx);
    setTimeout(() => setHighlightIndex(null), 700);

    setSets((prev) => [...prev, dropSet]);
    setWeight("");
    setReps("");
  };

  // 세트 삭제
  const removeSet = (indexToRemove) => {
    setSets((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // 근력 운동 일괄 저장
  const saveStrength = async () => {
    if (sets.length === 0) return;
    setSaving(true);

    const durationSec = workoutStartTime
      ? Math.floor((Date.now() - workoutStartTime) / 1000)
      : null;

    try {
      for (const s of sets) {
        await axios.post(
          `${API}/record?workout_name=${encodeURIComponent(s.workoutName)}&weight_kg=${encodeURIComponent(
            s.weight
          )}&reps=${encodeURIComponent(s.reps)}&duration_sec=${durationSec || ""}&set_type=${encodeURIComponent(
            s.setType
          )}&set_group=${encodeURIComponent(s.setGroup)}`
        );
      }

      setSaving(false);
      setDone(true);
      setSets([]);
      setWorkoutName("");
      setWeight("");
      setReps("");
      setWorkoutStartTime(null);
      await loadRecentLogs();

      setTimeout(() => {
        setDone(false);
        onSaved?.();
      }, 1500);
    } catch (err) {
      console.error("근력 운동 저장 실패:", err);
      alert("운동 기록 저장 중 오류가 발생했습니다.");
      setSaving(false);
    }
  };

  // ── 유산소 저장 ──
  const saveCardio = async () => {
    if (!duration && !distance) return;
    setCardioSaving(true);

    const p = new URLSearchParams();
    p.append("cardio_name", cardioName);
    if (duration) p.append("duration_min", duration);
    if (distance) p.append("distance_km", distance);
    if (pace) p.append("pace", pace);
    if (incline) p.append("incline", incline);
    if (cardioKcal) p.append("kcal", cardioKcal);
    if (cardioMemo) p.append("memo", cardioMemo);

    try {
      await axios.post(`${API}/cardio?${p.toString()}`);
      setCardioSaving(false);
      setCardioDone(true);
      setDuration("");
      setDistance("");
      setPace("");
      setIncline("");
      setCardioKcal("");
      setCardioMemo("");

      setTimeout(() => {
        setCardioDone(false);
        onSaved?.();
      }, 1500);
    } catch (err) {
      console.error("유산소 저장 실패:", err);
      alert("유산소 기록 저장 중 오류가 발생했습니다.");
      setCardioSaving(false);
    }
  };

  // 타이머 텍스트 포맷 (MM:SS)
  const elapsedSec = workoutStartTime ? Math.floor((now - workoutStartTime) / 1000) : 0;
  const elapsedMinStr = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const elapsedSecStr = String(elapsedSec % 60).padStart(2, "0");

  // 자동완성 필터
  const filteredSuggestions = workoutName.trim()
    ? availableNames.filter(
        (name) =>
          name.toLowerCase().includes(workoutName.toLowerCase()) &&
          name.toLowerCase() !== workoutName.toLowerCase()
      ).slice(0, 5)
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── 1. 상단 상태 배너 (실시간 타이머 & 세션 세트 수) ── */}
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
            운동 기록
          </h2>
          <p style={{ fontSize: 13, color: "var(--sub)", margin: "4px 0 0" }}>
            {mode === "strength" ? "세트를 추가하고 완료 시 저장하세요" : "유산소 운동 수치를 입력하세요"}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* 타이머 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: "var(--radius-pill)",
              backgroundColor: workoutStartTime ? "var(--accent-bg)" : "var(--card-subtle)",
              border: `1px solid ${workoutStartTime ? "var(--accent)" : "var(--border)"}`,
              color: workoutStartTime ? "var(--accent)" : "var(--sub)",
              fontSize: 13,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums"
            }}
          >
            <ClockIcon size={15} />
            <span>{elapsedMinStr}:{elapsedSecStr}</span>
          </div>

          {/* 현재 세션 세트 수 */}
          {mode === "strength" && (
            <div
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-pill)",
                backgroundColor: sets.length > 0 ? "rgba(16, 185, 129, 0.12)" : "var(--card-subtle)",
                border: `1px solid ${sets.length > 0 ? "var(--success)" : "var(--border)"}`,
                color: sets.length > 0 ? "var(--success)" : "var(--sub)",
                fontSize: 13,
                fontWeight: 700
              }}
            >
              세션 {sets.length}세트
            </div>
          )}
        </div>
      </div>

      {/* ── 2. 근력 / 유산소 모드 전환 세그먼트 ── */}
      <div
        style={{
          display: "flex",
          background: "var(--card)",
          borderRadius: "var(--radius-pill)",
          padding: 4,
          border: "1px solid var(--border)"
        }}
      >
        <button
          onClick={() => setMode("strength")}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "10px 0",
            borderRadius: "var(--radius-pill)",
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 14,
            background: mode === "strength" ? "var(--accent)" : "transparent",
            color: mode === "strength" ? "#ffffff" : "var(--sub)",
            transition: "all 0.2s"
          }}
        >
          <DumbbellIcon size={18} />
          <span>근력 운동</span>
        </button>

        <button
          onClick={() => setMode("cardio")}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "10px 0",
            borderRadius: "var(--radius-pill)",
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 14,
            background: mode === "cardio" ? "var(--accent)" : "transparent",
            color: mode === "cardio" ? "#ffffff" : "var(--sub)",
            transition: "all 0.2s"
          }}
        >
          <RunnerIcon size={18} />
          <span>유산소 운동</span>
        </button>
      </div>

      {/* ── 3. 근력 모드 화면 ── */}
      {mode === "strength" && (
        <div className="record-grid">
          {/* 좌측: 입력 폼 카드 */}
          <div className="ui-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                🏋️ 세트 입력
              </span>
              {workoutStartTime && (
                <button
                  onClick={() => setWorkoutStartTime(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--sub)",
                    fontSize: 12,
                    cursor: "pointer",
                    textDecoration: "underline"
                  }}
                >
                  타이머 리셋
                </button>
              )}
            </div>

            {/* 운동 이름 입력 & 자동완성 */}
            <div style={{ position: "relative" }}>
              <label style={{ display: "block", fontSize: 13, color: "var(--sub)", marginBottom: 6 }}>
                운동 종목
              </label>
              <input
                className="record-input"
                placeholder="운동 종목 입력 (예: 바벨 벤치프레스)"
                value={workoutName}
                onChange={(e) => {
                  setWorkoutName(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
              />

              {/* 자동완성 추천 드롭다운 */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-inner)",
                    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
                    zIndex: 20,
                    overflow: "hidden"
                  }}
                >
                  {filteredSuggestions.map((name) => (
                    <div
                      key={name}
                      onClick={() => {
                        setWorkoutName(name);
                        setShowSuggestions(false);
                      }}
                      style={{
                        padding: "10px 14px",
                        fontSize: 13,
                        cursor: "pointer",
                        borderBottom: "1px solid var(--border)",
                        color: "var(--text)",
                        backgroundColor: "var(--card)"
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--card-subtle)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--card)")}
                    >
                      {name}
                    </div>
                  ))}
                </div>
              )}

              {/* 빠른 선택 프리셋 칩 */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {QUICK_STRENGTH_PRESETS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`record-chip ${workoutName === name ? "active" : ""}`}
                    onClick={() => {
                      setWorkoutName(name);
                      setShowSuggestions(false);
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* 중량 및 횟수 입력 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, color: "var(--sub)", marginBottom: 6 }}>
                  무게 (kg)
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    className="record-input"
                    type="text"
                    placeholder="예: 60"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    style={{ paddingRight: 36 }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: 13,
                      color: "var(--sub)"
                    }}
                  >
                    kg
                  </span>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, color: "var(--sub)", marginBottom: 6 }}>
                  횟수 (회)
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    className="record-input"
                    type="number"
                    placeholder="예: 10"
                    value={reps}
                    onChange={(e) => setReps(e.target.value)}
                    style={{ paddingRight: 36 }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: 13,
                      color: "var(--sub)"
                    }}
                  >
                    회
                  </span>
                </div>
              </div>
            </div>

            {/* 버튼: 세트 추가 / DROP 세트 */}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={addSet}
                style={{ flex: 1, padding: "12px 16px" }}
              >
                <PlusIcon size={16} />
                <span>+ 세트 추가</span>
              </button>

              <button
                type="button"
                className="btn-ghost"
                onClick={addDropSet}
                disabled={sets.length === 0}
                style={{
                  padding: "12px 14px",
                  borderColor: "var(--accent)",
                  color: "var(--accent)",
                  opacity: sets.length === 0 ? 0.4 : 1
                }}
              >
                <ArrowDownIcon size={15} />
                <span>DROP</span>
              </button>
            </div>
          </div>

          {/* 우측: 현재 세션 목록 & 일괄 저장 카드 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="ui-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                  📋 이번 운동 세트 ({sets.length})
                </span>
                {sets.length > 0 && (
                  <span style={{ fontSize: 12, color: "var(--sub)" }}>
                    완료 후 아래 저장 버튼을 누르세요
                  </span>
                )}
              </div>

              {sets.length === 0 ? (
                <div
                  style={{
                    padding: "36px 16px",
                    textAlign: "center",
                    color: "var(--sub)",
                    backgroundColor: "var(--card-subtle)",
                    borderRadius: "var(--radius-inner)",
                    border: "1px dashed var(--border)"
                  }}
                >
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>아직 추가된 세트가 없습니다</p>
                  <p style={{ margin: "6px 0 0", fontSize: 12 }}>
                    운동명, 무게, 횟수를 입력하고 <strong>+ 세트 추가</strong>를 눌러주세요.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" }}>
                  {sets.map((s, i) => {
                    const normalSetNumber =
                      sets.slice(0, i + 1).filter(
                        (x) => x.workoutName === s.workoutName && x.setType !== "drop"
                      ).length;

                    return (
                      <div
                        key={i}
                        className={`record-set-item ${highlightIndex === i ? "highlight" : ""}`}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 26,
                              height: 26,
                              borderRadius: "var(--radius-pill)",
                              backgroundColor: s.setType === "drop" ? "rgba(249, 115, 22, 0.15)" : "var(--card)",
                              color: s.setType === "drop" ? "var(--accent)" : "var(--sub)",
                              fontSize: 12,
                              fontWeight: 700,
                              border: "1px solid var(--border)"
                            }}
                          >
                            {s.setType === "drop" ? "D" : normalSetNumber}
                          </span>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                              {s.workoutName}
                              {s.setType === "drop" && (
                                <span
                                  style={{
                                    marginLeft: 6,
                                    padding: "2px 6px",
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
                            <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
                              {s.weight} kg × {s.reps} 회
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeSet(i)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--sub)",
                            padding: 6,
                            cursor: "pointer",
                            borderRadius: 6,
                            display: "flex",
                            alignItems: "center"
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--sub)")}
                        >
                          <TrashIcon size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 세션 저장 버튼 */}
              <button
                type="button"
                className="btn-primary"
                onClick={saveStrength}
                disabled={saving || sets.length === 0}
                style={{
                  width: "100%",
                  padding: "13px 0",
                  opacity: sets.length === 0 ? 0.4 : 1,
                  backgroundColor: done ? "var(--success)" : "var(--accent)"
                }}
              >
                {saving ? (
                  <span>저장 중...</span>
                ) : done ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <CheckIcon size={16} /> 저장 완료!
                  </span>
                ) : (
                  <span>💾 세션 저장 ({sets.length}개 세트)</span>
                )}
              </button>
            </div>

            {/* 최근 근력 운동 요약 */}
            <div className="ui-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                💪 최근 운동 요약
              </span>

              {recentLoading ? (
                <div style={{ color: "var(--sub)", fontSize: 13 }}>불러오는 중...</div>
              ) : recentError ? (
                <div style={{ color: "var(--danger)", fontSize: 13 }}>{recentError}</div>
              ) : recentLogs.length === 0 ? (
                <div style={{ color: "var(--sub)", fontSize: 13 }}>아직 기록된 운동이 없습니다.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {recentLogs.map((log, idx) => (
                    <div
                      key={`${log.workoutname}-${idx}`}
                      onClick={() => setWorkoutName(log.workoutname)}
                      style={{
                        padding: "10px 12px",
                        backgroundColor: "var(--card-subtle)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-inner)",
                        cursor: "pointer",
                        transition: "border-color 0.15s"
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                          {log.workoutname}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--sub)" }}>
                          {log.date}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
                        {log.setcount}세트 · 평균 {log.avgweight ?? 0}kg · {log.avgreps ?? 0}회
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 4. 유산소 모드 화면 ── */}
      {mode === "cardio" && (
        <div className="ui-card" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
            🏃 유산소 운동 기록
          </span>

          {/* 종목 선택 필 칩 */}
          <div>
            <label style={{ display: "block", fontSize: 13, color: "var(--sub)", marginBottom: 8 }}>
              종목 선택
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {CARDIO_PRESETS.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`record-chip ${!customCardio && cardioName === name ? "active" : ""}`}
                  onClick={() => {
                    setCardioName(name);
                    setCustomCardio(false);
                  }}
                  style={{ padding: "8px 14px", fontSize: 13 }}
                >
                  {name}
                </button>
              ))}

              <button
                type="button"
                className={`record-chip ${customCardio ? "active" : ""}`}
                onClick={() => {
                  setCustomCardio(true);
                  setCardioName("");
                }}
                style={{ padding: "8px 14px", fontSize: 13 }}
              >
                직접 입력
              </button>

              {customCardio && (
                <input
                  className="record-input"
                  placeholder="종목 이름 입력"
                  value={cardioName}
                  onChange={(e) => setCardioName(e.target.value)}
                  style={{ width: 140, padding: "8px 12px", fontSize: 13 }}
                  autoFocus
                />
              )}
            </div>
          </div>

          {/* 2열 수치 입력 그리드 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14
            }}
          >
            <div>
              <label style={{ display: "block", fontSize: 13, color: "var(--sub)", marginBottom: 6 }}>
                운동 시간 (분) <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <input
                className="record-input"
                type="number"
                placeholder="예: 30"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, color: "var(--sub)", marginBottom: 6 }}>
                이동 거리 (km)
              </label>
              <input
                className="record-input"
                type="number"
                step="0.01"
                placeholder="예: 5.2"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, color: "var(--sub)", marginBottom: 6 }}>
                페이스 (분/km)
              </label>
              <input
                className="record-input"
                placeholder="예: 5'30''"
                value={pace}
                onChange={(e) => setPace(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, color: "var(--sub)", marginBottom: 6 }}>
                경사도 (%)
              </label>
              <input
                className="record-input"
                type="number"
                step="0.5"
                placeholder="예: 2.0"
                value={incline}
                onChange={(e) => setIncline(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, color: "var(--sub)", marginBottom: 6 }}>
                소모 칼로리 (kcal)
              </label>
              <input
                className="record-input"
                type="number"
                placeholder="예: 320"
                value={cardioKcal}
                onChange={(e) => setCardioKcal(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, color: "var(--sub)", marginBottom: 6 }}>
                메모
              </label>
              <input
                className="record-input"
                placeholder="예: 인터벌 훈련"
                value={cardioMemo}
                onChange={(e) => setCardioMemo(e.target.value)}
              />
            </div>
          </div>

          {/* 요약 미리보기 칩 */}
          {(duration || distance || cardioKcal) && (
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                padding: "12px 14px",
                backgroundColor: "var(--card-subtle)",
                borderRadius: "var(--radius-inner)",
                border: "1px solid var(--border)"
              }}
            >
              <span className="record-chip active">🏃 {cardioName || "유산소"}</span>
              {duration && <span className="record-chip">⏱ {duration}분</span>}
              {distance && <span className="record-chip">📍 {distance}km</span>}
              {pace && <span className="record-chip">⚡ 페이스 {pace}/km</span>}
              {incline && <span className="record-chip">📐 경사 {incline}%</span>}
              {cardioKcal && (
                <span className="record-chip" style={{ color: "var(--accent)" }}>
                  <FlameIcon size={14} /> {cardioKcal}kcal
                </span>
              )}
            </div>
          )}

          {/* 저장 버튼 */}
          <button
            type="button"
            className="btn-primary"
            onClick={saveCardio}
            disabled={cardioSaving || (!duration && !distance)}
            style={{
              width: "100%",
              padding: "13px 0",
              opacity: !duration && !distance ? 0.4 : 1,
              backgroundColor: cardioDone ? "var(--success)" : "var(--accent)"
            }}
          >
            {cardioSaving ? (
              <span>저장 중...</span>
            ) : cardioDone ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <CheckIcon size={16} /> 저장 완료!
              </span>
            ) : (
              <span>🏃 유산소 기록 저장</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
