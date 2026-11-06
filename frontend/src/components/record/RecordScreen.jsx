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
  FlameIcon,
  SaveIcon,
  MapPinIcon,
  ZapIcon,
  GaugeIcon,
  AlertTriangleIcon
} from "../common/Icons";
import DateSelector from "./DateSelector";
import SavedLogsAccordion from "./SavedLogsAccordion";
import {
  getUserIdFromToken,
  getKSTTodayStr,
  loadStrengthDraft,
  saveStrengthDraft,
  clearStrengthDraft,
  loadCardioDraft,
  saveCardioDraft,
  clearCardioDraft,
  getLastSessionState,
  saveLastSessionState,
  SET_STATUS
} from "../../utils/draftStorage";

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
  // 사용자 식별자 (로컬 초안 격리 네임스페이스용)
  const token = localStorage.getItem("token");
  const userId = getUserIdFromToken(token);
  const todayKST = getKSTTodayStr();

  // 초기 날짜 및 모드 복원
  const initialSession = getLastSessionState(userId);
  const [selectedDate, setSelectedDate] = useState(() => {
    return initialSession?.lastDate || todayKST;
  });
  const [mode, setMode] = useState(() => {
    return initialSession?.lastMode || "strength";
  });

  // ── 근력 운동 상태 ──
  const [workoutName, setWorkoutName] = useState("");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [sets, setSets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(null);
  const [saveErrorBanner, setSaveErrorBanner] = useState(null);
  const [savedLogsRefresh, setSavedLogsRefresh] = useState(0);
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
  const [cardioErrorBanner, setCardioErrorBanner] = useState(null);

  // 초기 복원 완료 가드 (초기 렌더 시 빈 값으로 기존 초안 덮어쓰기 방지)
  const isRestoredRef = useRef(false);

  // 타이머 인터벌
  useEffect(() => {
    if (!workoutStartTime) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [workoutStartTime]);

  // 마운트 시 초기 초안 로드
  useEffect(() => {
    if (mode === "strength") {
      const draft = loadStrengthDraft(userId, selectedDate);
      if (draft) {
        setSets(draft.sets || []);
        setWorkoutStartTime(draft.workoutStartTime || null);
        if (draft.formInputs) {
          setWorkoutName(draft.formInputs.workoutName || "");
          setWeight(draft.formInputs.weight || "");
          setReps(draft.formInputs.reps || "");
        }
      }
    } else {
      const cDraft = loadCardioDraft(userId, selectedDate);
      if (cDraft && cDraft.inputs) {
        setCardioName(cDraft.inputs.cardioName || "런닝머신");
        setDuration(cDraft.inputs.duration || "");
        setDistance(cDraft.inputs.distance || "");
        setPace(cDraft.inputs.pace || "");
        setIncline(cDraft.inputs.incline || "");
        setCardioKcal(cDraft.inputs.cardioKcal || "");
        setCardioMemo(cDraft.inputs.cardioMemo || "");
      }
    }
    isRestoredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // 근력 초안 자동 저장 Effect (복원 완료 이후에만 동작)
  useEffect(() => {
    if (!isRestoredRef.current) return;
    if (mode !== "strength") return;

    saveStrengthDraft(userId, selectedDate, {
      sets,
      workoutStartTime,
      workoutName,
      weight,
      reps
    });
  }, [sets, workoutStartTime, workoutName, weight, reps, selectedDate, mode, userId]);

  // 유산소 초안 자동 저장 Effect
  useEffect(() => {
    if (!isRestoredRef.current) return;
    if (mode !== "cardio") return;

    saveCardioDraft(userId, selectedDate, {
      cardioName,
      duration,
      distance,
      pace,
      incline,
      cardioKcal,
      cardioMemo
    });
  }, [cardioName, duration, distance, pace, incline, cardioKcal, cardioMemo, selectedDate, mode, userId]);

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

  // ── 날짜 전환 처리 ──
  const handleDateChange = (newDate) => {
    if (saving || cardioSaving) return;
    if (newDate === selectedDate) return;

    // 1. 현재 날짜 초안 저장
    if (mode === "strength") {
      saveStrengthDraft(userId, selectedDate, {
        sets,
        workoutStartTime,
        workoutName,
        weight,
        reps
      });
    } else {
      saveCardioDraft(userId, selectedDate, {
        cardioName,
        duration,
        distance,
        pace,
        incline,
        cardioKcal,
        cardioMemo
      });
    }

    // 2. 날짜 상태 변경 및 마지막 사용 날짜 저장
    setSelectedDate(newDate);
    saveLastSessionState(userId, { lastDate: newDate, lastMode: mode });
    setSaveErrorBanner(null);
    setCardioErrorBanner(null);

    // 3. 대상 날짜 초안 로드
    if (mode === "strength") {
      const draft = loadStrengthDraft(userId, newDate);
      if (draft) {
        setSets(draft.sets || []);
        setWorkoutStartTime(draft.workoutStartTime || null);
        if (draft.formInputs) {
          setWorkoutName(draft.formInputs.workoutName || "");
          setWeight(draft.formInputs.weight || "");
          setReps(draft.formInputs.reps || "");
        }
      } else {
        setSets([]);
        setWorkoutStartTime(null);
      }
    } else {
      const cDraft = loadCardioDraft(userId, newDate);
      if (cDraft && cDraft.inputs) {
        setCardioName(cDraft.inputs.cardioName || "런닝머신");
        setDuration(cDraft.inputs.duration || "");
        setDistance(cDraft.inputs.distance || "");
        setPace(cDraft.inputs.pace || "");
        setIncline(cDraft.inputs.incline || "");
        setCardioKcal(cDraft.inputs.cardioKcal || "");
        setCardioMemo(cDraft.inputs.cardioMemo || "");
      } else {
        setDuration("");
        setDistance("");
        setPace("");
        setIncline("");
        setCardioKcal("");
        setCardioMemo("");
      }
    }
  };

  // ── 모드 전환 처리 ──
  const handleModeChange = (newMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    saveLastSessionState(userId, { lastDate: selectedDate, lastMode: newMode });
  };

  // ── 현재 날짜 초안 비우기 ──
  const handleClearCurrentDraft = () => {
    if (mode === "strength") {
      if (sets.length === 0 && !workoutName && !weight && !reps) return;
      if (window.confirm(`${selectedDate}의 작성 중인 세트 초안을 비우시겠습니까?\n(서버에 이미 저장된 기록은 삭제되지 않습니다)`)) {
        clearStrengthDraft(userId, selectedDate);
        setSets([]);
        setWorkoutStartTime(null);
        setWorkoutName("");
        setWeight("");
        setReps("");
        setSaveErrorBanner(null);
      }
    } else {
      if (!duration && !distance && !cardioMemo) return;
      if (window.confirm(`${selectedDate}의 작성 중인 유산소 초안을 비우시겠습니까?`)) {
        clearCardioDraft(userId, selectedDate);
        setDuration("");
        setDistance("");
        setPace("");
        setIncline("");
        setCardioKcal("");
        setCardioMemo("");
        setCardioErrorBanner(null);
      }
    }
  };

  // ── 근력 세트 추가 ──
  const addSet = () => {
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
      clientSetId: `set_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      workoutName: workoutName.trim(),
      weight: weight.trim() || "0",
      reps: reps.trim(),
      setType: "normal",
      setGroup: crypto.randomUUID(),
      status: SET_STATUS.PENDING
    };

    const nextIdx = sets.length;
    setHighlightIndex(nextIdx);
    setTimeout(() => setHighlightIndex(null), 700);

    setSets((prev) => [...prev, newSet]);
    lastAddedRef.current = newSet;

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
      clientSetId: `set_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      workoutName: lastSet.workoutName,
      weight: weight.trim() || lastSet.weight,
      reps: reps.trim() || lastSet.reps,
      setType: "drop",
      setGroup: lastSet.setGroup,
      status: SET_STATUS.PENDING
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

  // ── 근력 운동 세션 스냅샷 저장 (부분 성공/불명 결과 처리) ──
  const saveStrength = async () => {
    if (sets.length === 0 || saving) return;
    setSaving(true);
    setSaveErrorBanner(null);

    const snapshotDate = selectedDate;
    const snapshotUser = userId;
    const snapshotSets = [...sets];

    const durationSec = workoutStartTime
      ? Math.floor((Date.now() - workoutStartTime) / 1000)
      : null;

    let anyFailed = false;
        let currentSets = [...snapshotSets];

    for (let i = 0; i < currentSets.length; i++) {
      const s = currentSets[i];
      if (s.status === SET_STATUS.CONFIRMED_SUCCESS) continue;
      if (s.status === SET_STATUS.UNKNOWN) {
                continue; // 결과 불명 항목은 사용자 수동 확인 전 자동 재전송 금지
      }

      currentSets = currentSets.map((item, idx) =>
        idx === i ? { ...item, status: SET_STATUS.SAVING } : item
      );
      setSets(currentSets);

      try {
        const url = `${API}/record?workout_name=${encodeURIComponent(s.workoutName)}&weight_kg=${encodeURIComponent(
          s.weight
        )}&reps=${encodeURIComponent(s.reps)}&duration_sec=${durationSec || ""}&set_type=${encodeURIComponent(
          s.setType
        )}&set_group=${encodeURIComponent(s.setGroup)}&date_str=${encodeURIComponent(snapshotDate)}`;

        await axios.post(url, null, { timeout: 12000 });

        currentSets = currentSets.map((item, idx) =>
          idx === i ? { ...item, status: SET_STATUS.CONFIRMED_SUCCESS } : item
        );
        setSets(currentSets);

        // 성공 항목 즉시 초안 반영
        saveStrengthDraft(snapshotUser, snapshotDate, {
          sets: currentSets,
          workoutStartTime,
          workoutName,
          weight,
          reps
        });
      } catch (err) {
        console.error("세트 저장 중 오류:", err);
        const status = err.response ? err.response.status : null;

        if (status && status >= 400 && status < 500) {
          currentSets = currentSets.map((item, idx) =>
            idx === i ? { ...item, status: SET_STATUS.CONFIRMED_FAILED } : item
          );
          anyFailed = true;
        } else {
          currentSets = currentSets.map((item, idx) =>
            idx === i ? { ...item, status: SET_STATUS.UNKNOWN } : item
          );
                  }
        setSets(currentSets);
        saveStrengthDraft(snapshotUser, snapshotDate, {
          sets: currentSets,
          workoutStartTime,
          workoutName,
          weight,
          reps
        });
        break; // 추가 실패 방지를 위해 루프 중단
      }
    }

    setSaving(false);

    const hasUnsaved = currentSets.some(
      (s) => s.status === SET_STATUS.PENDING || s.status === SET_STATUS.CONFIRMED_FAILED
    );
    const hasUnknown = currentSets.some((s) => s.status === SET_STATUS.UNKNOWN);
    const allSuccess = currentSets.every((s) => s.status === SET_STATUS.CONFIRMED_SUCCESS);

    if (allSuccess) {
      setDone(true);
      clearStrengthDraft(snapshotUser, snapshotDate);
      setSets([]);
      setWorkoutName("");
      setWeight("");
      setReps("");
      setWorkoutStartTime(null);
      setSavedLogsRefresh((prev) => prev + 1);
      await loadRecentLogs();

      setTimeout(() => {
        setDone(false);
        onSaved?.();
      }, 1500);
    } else if (hasUnknown) {
      setSaveErrorBanner(
        "일부 세트 저장 중 응답이 유실되어 저장 결과가 불명확합니다. 중복 저장을 방지하기 위해 상단 [저장된 기록]을 먼저 확인해주세요."
      );
    } else if (hasUnsaved || anyFailed) {
      setSaveErrorBanner(
        "세트 저장 중 오류가 발생했습니다. 미저장된 세트를 확인 후 다시 시도해주세요."
      );
    }
  };

  // ── 유산소 저장 ──
  const saveCardio = async () => {
    if (!duration && !distance) return;
    setCardioSaving(true);
    setCardioErrorBanner(null);

    const snapshotDate = selectedDate;
    const snapshotUser = userId;

    const p = new URLSearchParams();
    p.append("cardio_name", cardioName);
    p.append("date_str", snapshotDate);
    if (duration) p.append("duration_min", duration);
    if (distance) p.append("distance_km", distance);
    if (pace) p.append("pace", pace);
    if (incline) p.append("incline", incline);
    if (cardioKcal) p.append("kcal", cardioKcal);
    if (cardioMemo) p.append("memo", cardioMemo);

    try {
      await axios.post(`${API}/cardio?${p.toString()}`, null, { timeout: 12000 });
      setCardioSaving(false);
      setCardioDone(true);
      clearCardioDraft(snapshotUser, snapshotDate);
      setDuration("");
      setDistance("");
      setPace("");
      setIncline("");
      setCardioKcal("");
      setCardioMemo("");
      setSavedLogsRefresh((prev) => prev + 1);

      setTimeout(() => {
        setCardioDone(false);
        onSaved?.();
      }, 1500);
    } catch (err) {
      console.error("유산소 저장 실패:", err);
      const isClientErr = err.response && err.response.status >= 400 && err.response.status < 500;
      setCardioErrorBanner(
        isClientErr
          ? err.response?.data?.detail || "입력값이 올바르지 않거나 미래 날짜입니다."
          : "통신 오류로 유산소 기록 저장이 확인되지 않았습니다. 상단 저장된 기록을 확인해주세요."
      );
      setCardioSaving(false);
    }
  };

  // 타이머 텍스트 포맷 (MM:SS)
  const elapsedSec = workoutStartTime ? Math.floor((now - workoutStartTime) / 1000) : 0;
  const elapsedMinStr = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const elapsedSecStr = String(elapsedSec % 60).padStart(2, "0");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. 상단 날짜 선택기 */}
      <DateSelector
        selectedDate={selectedDate}
        onChangeDate={handleDateChange}
        disabled={saving || cardioSaving}
      />

      {/* 2. 해당 날짜에 이미 저장된 서버 기록 목록 */}
      <SavedLogsAccordion
        date={selectedDate}
        mode={mode}
        refreshTrigger={savedLogsRefresh}
      />

      {/* 3. 모드 전환 세그먼트 (근력 vs 유산소) */}
      <div
        className="ui-card"
        style={{
          display: "flex",
          padding: 4,
          borderRadius: "var(--radius-inner)",
          backgroundColor: "var(--card-subtle)"
        }}
      >
        <button
          type="button"
          onClick={() => handleModeChange("strength")}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "10px 0",
            border: "none",
            borderRadius: "var(--radius-inner)",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            transition: "all 0.15s ease",
            backgroundColor: mode === "strength" ? "var(--card)" : "transparent",
            color: mode === "strength" ? "var(--accent)" : "var(--sub)",
            boxShadow: mode === "strength" ? "var(--shadow-card)" : "none"
          }}
        >
          <DumbbellIcon size={18} color={mode === "strength" ? "var(--accent)" : "var(--sub)"} />
          <span>근력 운동</span>
        </button>

        <button
          type="button"
          onClick={() => handleModeChange("cardio")}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "10px 0",
            border: "none",
            borderRadius: "var(--radius-inner)",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            transition: "all 0.15s ease",
            backgroundColor: mode === "cardio" ? "var(--card)" : "transparent",
            color: mode === "cardio" ? "var(--accent)" : "var(--sub)",
            boxShadow: mode === "cardio" ? "var(--shadow-card)" : "none"
          }}
        >
          <RunnerIcon size={18} color={mode === "cardio" ? "var(--accent)" : "var(--sub)"} />
          <span>유산소 운동</span>
        </button>
      </div>

      {/* 4. 근력 운동 입력 모드 */}
      {mode === "strength" && (
        <>
          <div className="ui-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                세트 입력
              </span>
              {workoutStartTime && (
                <button
                  type="button"
                  onClick={() => setWorkoutStartTime(null)}
                  className="record-chip active"
                  style={{
                    backgroundColor: "rgba(249, 115, 22, 0.15)",
                    borderColor: "var(--accent)",
                    color: "var(--accent)",
                    cursor: "pointer"
                  }}
                  title="타이머 리셋"
                >
                  <ClockIcon size={14} color="var(--accent)" />
                  <span>{elapsedMinStr}:{elapsedSecStr} (종료)</span>
                </button>
              )}
            </div>

            {/* 빠른 종목 프리셋 칩 */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
              {QUICK_STRENGTH_PRESETS.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`record-chip ${workoutName === name ? "active" : ""}`}
                  onClick={() => {
                    setWorkoutName(name);
                    setShowSuggestions(false);
                  }}
                  style={{ flexShrink: 0 }}
                >
                  {name}
                </button>
              ))}
            </div>

            {/* 운동명 입력 및 자동완성 */}
            <div style={{ position: "relative" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--sub)", marginBottom: 6 }}>
                운동명
              </label>
              <input
                type="text"
                className="record-input"
                placeholder="예: 바벨 벤치프레스, 스쿼트"
                value={workoutName}
                onChange={(e) => {
                  setWorkoutName(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
              />

              {showSuggestions && workoutName.trim() && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-inner)",
                    marginTop: 4,
                    maxHeight: 180,
                    overflowY: "auto",
                    zIndex: 10,
                    boxShadow: "var(--shadow-card)"
                  }}
                >
                  {availableNames
                    .filter((n) => n.toLowerCase().includes(workoutName.toLowerCase()) && n !== workoutName)
                    .slice(0, 6)
                    .map((item) => (
                      <div
                        key={item}
                        onMouseDown={() => {
                          setWorkoutName(item);
                          setShowSuggestions(false);
                        }}
                        style={{
                          padding: "10px 14px",
                          fontSize: 13,
                          cursor: "pointer",
                          color: "var(--text)",
                          borderBottom: "1px solid var(--border)"
                        }}
                      >
                        {item}
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* 무게 및 횟수 입력 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--sub)", marginBottom: 6 }}>
                  무게 (kg)
                </label>
                <input
                  type="number"
                  step="0.5"
                  className="record-input"
                  placeholder="예: 60"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--sub)", marginBottom: 6 }}>
                  횟수 (reps)
                </label>
                <input
                  type="number"
                  className="record-input"
                  placeholder="예: 10"
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                />
              </div>
            </div>

            {/* 세트 추가 버튼 그룹 */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={addSet}
                disabled={saving}
                style={{ flex: 1, padding: "12px 16px" }}
              >
                <PlusIcon size={16} />
                <span>세트 추가</span>
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={addDropSet}
                disabled={saving || sets.length === 0}
                style={{
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: sets.length === 0 ? "var(--sub)" : "var(--accent)"
                }}
              >
                <ArrowDownIcon size={16} />
                <span>드랍세트</span>
              </button>
            </div>
          </div>

          {/* 에러 및 안내 배너 */}
          {saveErrorBanner && (
            <div
              className="ui-card"
              style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid var(--danger)",
                color: "var(--danger)",
                fontSize: 13,
                lineHeight: 1.5
              }}
            >
              <AlertTriangleIcon size={18} color="var(--danger)" />
              <div style={{ flex: 1 }}>{saveErrorBanner}</div>
            </div>
          )}

          {/* 작성 중인 세트 목록 (미저장 초안) */}
          <div className="ui-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                    작성 중인 세트
                  </span>
                  {sets.length > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 6px",
                        borderRadius: 4,
                        backgroundColor: "var(--card-subtle)",
                        color: "var(--accent)"
                      }}
                    >
                      {sets.length}개
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 4 }}>
                  아직 서버에 저장되지 않은 초안입니다
                </div>
              </div>

              {sets.length > 0 && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={handleClearCurrentDraft}
                  disabled={saving}
                  style={{ fontSize: 11, padding: "4px 8px", color: "var(--sub)" }}
                >
                  초안 비우기
                </button>
              )}
            </div>

            {sets.length === 0 ? (
              <div
                style={{
                  padding: "36px 16px",
                  textAlign: "center",
                  color: "var(--sub)",
                  backgroundColor: "var(--card-subtle)",
                  borderRadius: "var(--radius-inner)"
                }}
              >
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>아직 추가된 세트가 없습니다</p>
                <p style={{ margin: "6px 0 0", fontSize: 12 }}>
                  운동명, 무게, 횟수를 입력하고 <strong>세트 추가</strong>를 눌러주세요.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sets.map((s, i) => (
                  <div
                    key={s.clientSetId || i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: "var(--radius-inner)",
                      backgroundColor: highlightIndex === i ? "var(--accent-bg)" : "var(--card-subtle)",
                      border: s.status === SET_STATUS.UNKNOWN
                        ? "1px solid #eab308"
                        : s.status === SET_STATUS.CONFIRMED_FAILED
                        ? "1px solid var(--danger)"
                        : "1px solid var(--border)",
                      transition: "all 0.2s ease"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--sub)",
                          minWidth: 20
                        }}
                      >
                        #{i + 1}
                      </span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                          <span>{s.workoutName}</span>
                          {s.setType === "drop" && (
                            <span
                              style={{
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
                          {s.status === SET_STATUS.UNKNOWN && (
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: 10,
                                backgroundColor: "rgba(234, 179, 8, 0.2)",
                                color: "#eab308",
                                fontWeight: 700
                              }}
                            >
                              결과 불명
                            </span>
                          )}
                          {s.status === SET_STATUS.CONFIRMED_FAILED && (
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: 10,
                                backgroundColor: "rgba(239, 68, 68, 0.2)",
                                color: "var(--danger)",
                                fontWeight: 700
                              }}
                            >
                              실패
                            </span>
                          )}
                          {s.status === SET_STATUS.CONFIRMED_SUCCESS && (
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: 10,
                                backgroundColor: "rgba(34, 197, 94, 0.2)",
                                color: "var(--success)",
                                fontWeight: 700
                              }}
                            >
                              저장됨
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
                      aria-label="세트 삭제"
                      onClick={() => !saving && removeSet(i)}
                      disabled={saving}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--sub)",
                        padding: 6,
                        cursor: saving ? "not-allowed" : "pointer",
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
                ))}
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
                padding: "14px 0",
                fontSize: 15,
                backgroundColor: done ? "var(--success)" : "var(--accent)",
                cursor: saving || sets.length === 0 ? "not-allowed" : "pointer"
              }}
            >
              {saving ? (
                <span>저장 중...</span>
              ) : done ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <CheckIcon size={16} /> 저장 완료!
                </span>
              ) : (
                <>
                  <SaveIcon size={16} />
                  <span>세션 저장 ({sets.length}개 세트)</span>
                </>
              )}
            </button>
          </div>

          {/* 최근 근력 운동 요약 */}
          <div className="ui-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
              최근 운동 요약
            </span>

            {recentLoading ? (
              <div style={{ color: "var(--sub)", fontSize: 13 }}>불러오는 중...</div>
            ) : recentError ? (
              <div style={{ color: "var(--danger)", fontSize: 13 }}>{recentError}</div>
            ) : recentLogs.length === 0 ? (
              <div style={{ color: "var(--sub)", fontSize: 13 }}>최근 운동 기록이 없습니다.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recentLogs.map((log, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      borderBottom: idx < recentLogs.length - 1 ? "1px solid var(--border)" : "none",
                      paddingBottom: 6
                    }}
                  >
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>
                      {log.workout_name}
                    </span>
                    <span style={{ color: "var(--sub)" }}>
                      {log.weight_kg}kg × {log.reps}회 ({log.date})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* 5. 유산소 운동 모드 */}
      {mode === "cardio" && (
        <div className="ui-card" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
              유산소 운동 기록
            </span>
            {(duration || distance || cardioMemo) && (
              <button
                type="button"
                className="btn-ghost"
                onClick={handleClearCurrentDraft}
                disabled={cardioSaving}
                style={{ fontSize: 11, padding: "4px 8px", color: "var(--sub)" }}
              >
                초안 비우기
              </button>
            )}
          </div>

          {/* 종목 선택 필 칩 */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CARDIO_PRESETS.map((name) => (
              <button
                key={name}
                type="button"
                className={`record-chip ${cardioName === name && !customCardio ? "active" : ""}`}
                onClick={() => {
                  setCardioName(name);
                  setCustomCardio(false);
                }}
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
            >
              직접 입력
            </button>
          </div>

          {customCardio && (
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--sub)", marginBottom: 6 }}>
                유산소 종목명
              </label>
              <input
                type="text"
                className="record-input"
                placeholder="예: 조깅, 수영, 버피"
                value={cardioName}
                onChange={(e) => setCardioName(e.target.value)}
              />
            </div>
          )}

          {/* 시간 & 거리 입력 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--sub)", marginBottom: 6 }}>
                운동 시간 (분)
              </label>
              <input
                type="number"
                className="record-input"
                placeholder="예: 30"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--sub)", marginBottom: 6 }}>
                이동 거리 (km)
              </label>
              <input
                type="number"
                step="0.1"
                className="record-input"
                placeholder="예: 5.0"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
              />
            </div>
          </div>

          {/* 페이스 & 경사도 입력 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--sub)", marginBottom: 6 }}>
                페이스 (예: 5'30")
              </label>
              <input
                type="text"
                className="record-input"
                placeholder="예: 5분 30초"
                value={pace}
                onChange={(e) => setPace(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--sub)", marginBottom: 6 }}>
                경사도 (%)
              </label>
              <input
                type="number"
                step="0.5"
                className="record-input"
                placeholder="예: 3.0"
                value={incline}
                onChange={(e) => setIncline(e.target.value)}
              />
            </div>
          </div>

          {/* 소모 칼로리 & 메모 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--sub)", marginBottom: 6 }}>
                소모 칼로리 (kcal)
              </label>
              <input
                type="number"
                className="record-input"
                placeholder="예: 250"
                value={cardioKcal}
                onChange={(e) => setCardioKcal(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--sub)", marginBottom: 6 }}>
                메모 (선택)
              </label>
              <input
                type="text"
                className="record-input"
                placeholder="컨디션 등"
                value={cardioMemo}
                onChange={(e) => setCardioMemo(e.target.value)}
              />
            </div>
          </div>

          {/* 요약 칩 바 */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              padding: "12px 14px",
              backgroundColor: "var(--card-subtle)",
              borderRadius: "var(--radius-inner)",
              border: "1px solid var(--border)"
            }}
          >
            <span className="record-chip active">
              <RunnerIcon size={14} /> {cardioName || "유산소"}
            </span>
            {duration && (
              <span className="record-chip">
                <ClockIcon size={14} /> {duration}분
              </span>
            )}
            {distance && (
              <span className="record-chip">
                <MapPinIcon size={14} /> {distance}km
              </span>
            )}
            {pace && (
              <span className="record-chip">
                <ZapIcon size={14} /> 페이스 {pace}/km
              </span>
            )}
            {incline && (
              <span className="record-chip">
                <GaugeIcon size={14} /> 경사 {incline}%
              </span>
            )}
            {cardioKcal && (
              <span className="record-chip" style={{ color: "var(--accent)" }}>
                <FlameIcon size={14} /> {cardioKcal}kcal
              </span>
            )}
          </div>

          {/* 에러 및 안내 배너 */}
          {cardioErrorBanner && (
            <div
              className="ui-card"
              style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid var(--danger)",
                color: "var(--danger)",
                fontSize: 13,
                lineHeight: 1.5
              }}
            >
              <AlertTriangleIcon size={18} color="var(--danger)" />
              <div style={{ flex: 1 }}>{cardioErrorBanner}</div>
            </div>
          )}

          {/* 유산소 저장 버튼 */}
          <button
            type="button"
            className="btn-primary"
            onClick={saveCardio}
            disabled={cardioSaving || (!duration && !distance)}
            style={{
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
              <>
                <SaveIcon size={16} />
                <span>유산소 기록 저장</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
