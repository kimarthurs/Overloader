import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import {
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from "recharts";
import { initAuthSession, performLogout, registerLogoutCallback } from "./auth";
import AppShell from "./components/layout/AppShell";
import HomeScreen from "./components/home/HomeScreen";
import RecordScreen from "./components/record/RecordScreen";
import CalendarScreen from "./components/calendar/CalendarScreen";
import AnalyticsScreen from "./components/analyze/AnalyticsScreen";

const API = process.env.REACT_APP_API_URL;
const GOOGLE_CLIENT_ID = "907903471313-hrjku47jnpcgqktsp3vhfsq5846iutkb.apps.googleusercontent.com";

// ── 공통 스타일 (CSS 변수 사용) ──
const S = {
  card: {
    background: "var(--card)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    border: "1px solid var(--border)",
  },
  input: {
    padding: "11px 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    fontSize: 15,
    width: "100%",
    boxSizing: "border-box",
    background: "var(--input-bg)",
    color: "var(--text)",
    outline: "none",
  },
  btn: (color) => ({
    padding: "11px 20px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    background: color || "var(--accent)",
    color: "white",
    fontWeight: "700",
    fontSize: 15,
    transition: "opacity .15s",
  }),
  btnGhost: {
    padding: "11px 20px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    cursor: "pointer",
    background: "transparent",
    color: "var(--text)",
    fontWeight: "600",
    fontSize: 15,
  },
  th: { padding: "10px 12px", textAlign: "left", fontWeight: "700", color: "var(--sub)", fontSize: 13 },
  td: { padding: "10px 12px", fontSize: 14, color: "var(--text)" },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "var(--text)", marginBottom: 16, marginTop: 0 },
};

// ── 다크모드 훅 ──
function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  return { theme, toggle };
}

// ── 달력 및 날짜별 유산소: CalendarScreen 컴포넌트로 분리됨 (src/components/calendar/CalendarScreen.jsx) ──


// ── 운동 기록 입력 폼 (근력 + 유산소): RecordScreen 컴포넌트로 분리됨 (src/components/record/RecordScreen.jsx) ──



// ── 분석: 유산소 ──
function CardioAnalysisTab() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    axios.get(`${API}/cardio`).then(res => setLogs(res.data));
  }, []);

  // 그래프용 데이터 (날짜 오름차순)
  const chartData = [...logs]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(r => ({
    date: r.date.slice(5),        // MM-DD
    시간: r.duration_min,
    거리: r.distance_km,
    칼로리: r.kcal,
  }));

  // 종목별 집계
  const byName = logs.reduce((acc, r) => {
    if (!acc[r.cardio_name]) acc[r.cardio_name] = { count: 0, totalMin: 0, totalKm: 0 };
    acc[r.cardio_name].count++;
    acc[r.cardio_name].totalMin  += r.duration_min  || 0;
    acc[r.cardio_name].totalKm   += r.distance_km   || 0;
    return acc;
  }, {});

  if (logs.length === 0) return (
    <div style={{ textAlign: "center", color: "var(--sub)", marginTop: 60 }}>
      유산소 기록이 없어요.<br />기록 탭에서 추가해보세요!
    </div>
  );

  return (
    <div>
      {/* 종목별 요약 카드 */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        {Object.entries(byName).map(([name, stat]) => (
          <div key={name} style={{
            ...S.card, marginBottom: 0, flex: "1 1 140px",
            borderLeft: "3px solid var(--success)"
          }}>
            <div style={{ fontWeight: "700", marginBottom: 6 }}>{name}</div>
            <div style={{ fontSize: 13, color: "var(--sub)", display: "flex", flexDirection: "column", gap: 2 }}>
              <span>총 {stat.count}회</span>
              {stat.totalMin > 0 && <span>⏱ {stat.totalMin}분</span>}
              {stat.totalKm  > 0 && <span>📍 {stat.totalKm.toFixed(1)}km</span>}
            </div>
          </div>
        ))}
      </div>

      {/* 시간 추이 그래프 */}
      {chartData.some(d => d.시간) && (
        <div style={S.card}>
          <p style={S.sectionTitle}>⏱ 운동 시간 추이 (분)</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)}  tick={{ fontSize: 11, fill: "var(--sub)" }} />
              <YAxis unit="분" tick={{ fontSize: 11, fill: "var(--sub)" }} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
              <Line type="monotone" dataKey="시간" stroke="var(--success)" strokeWidth={2} dot={{ r: 4 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 거리 추이 그래프 */}
      {chartData.some(d => d.거리) && (
        <div style={S.card}>
          <p style={S.sectionTitle}>📍 거리 추이 (km)</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)}  tick={{ fontSize: 11, fill: "var(--sub)" }} />
              <YAxis unit="km" tick={{ fontSize: 11, fill: "var(--sub)" }} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
              <Line type="monotone" dataKey="거리" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 전체 기록 목록 */}
      <div style={S.card}>
        <p style={S.sectionTitle}>📋 전체 기록</p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, tableLayout: "fixed" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={S.th}>날짜</th><th style={S.th}>종목</th><th style={S.th}>시간</th>
              <th style={S.th}>거리</th><th style={S.th}>kcal</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={S.td}>{r.date}</td>
                <td style={S.td}>{r.cardio_name}</td>
                <td style={S.td}>{r.duration_min ? `${r.duration_min}분` : "-"}</td>
                <td style={S.td}>{r.distance_km  ? `${r.distance_km}km` : "-"}</td>
                <td style={S.td}>{r.kcal         ? `${r.kcal}kcal` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 분석 탭: AnalyticsScreen 컴포넌트로 분리됨 (src/components/analyze/AnalyticsScreen.jsx) ──

// ── 바디 탭 ──
function BodyTab() {
  const [logs, setLogs] = useState([]);
  const [weightKg, setWeightKg] = useState(""); const [bodyFat, setBodyFat] = useState("");
  const [muscleKg, setMuscleKg] = useState(""); const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false); const [done, setDone] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(null);
  const fetchLogs = () => axios.get(`${API}/body`).then(res => setLogs(res.data));
  useEffect(() => { fetchLogs(); }, []);

  const save = async () => {
    if (!weightKg && !bodyFat && !muscleKg) return;
    setSaving(true);
    const p = new URLSearchParams();
    if (weightKg) p.append("weight_kg", weightKg);
    if (bodyFat) p.append("body_fat_pct", bodyFat);
    if (muscleKg) p.append("muscle_kg", muscleKg);
    if (memo) p.append("memo", memo);
    await axios.post(`${API}/body?${p.toString()}`);
    setSaving(false); setDone(true);
    setWeightKg(""); setBodyFat(""); setMuscleKg(""); setMemo("");
    fetchLogs();
    setTimeout(() => setDone(false), 1500);
  };

  const chartData = logs.map(r => ({
    date: r.date, 몸무게: r.weight_kg, 체지방률: r.body_fat_pct, 근육량: r.muscle_kg,
  }));

  return (
    <div>
      <div style={S.card}>
        <p style={S.sectionTitle}>📝 오늘 기록</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input placeholder="몸무게(kg)" type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)} style={{ ...S.input, flex: 1 }} />
          <input placeholder="체지방(%)" type="number" value={bodyFat} onChange={e => setBodyFat(e.target.value)} style={{ ...S.input, flex: 1 }} />
          <input placeholder="근육량(kg)" type="number" value={muscleKg} onChange={e => setMuscleKg(e.target.value)} style={{ ...S.input, flex: 1 }} />
        </div>
        <input placeholder="메모 (선택)" value={memo} onChange={e => setMemo(e.target.value)} style={{ ...S.input, marginBottom: 10 }} />
        <button onClick={save} disabled={saving} style={{ ...S.btn(), width: "100%" }}>
          {saving ? "저장 중..." : done ? "✅ 저장됨!" : "💾 저장"}
        </button>
      </div>

      {logs.length > 0 && (
        <>
          <div style={S.card}>
            <p style={S.sectionTitle}>📊 몸무게 추이</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--sub)" }} tickFormatter={d => d.slice(5)} />
                <YAxis unit="kg" domain={['auto','auto']} tick={{ fontSize: 11, fill: "var(--sub)" }} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }}
                  formatter={(v, n) => [`${v}${n === '체지방률' ? '%' : 'kg'}`, n]} />
                <Legend />
                <Line type="monotone" dataKey="몸무게" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                {logs.some(r => r.muscle_kg) && (
                  <Line type="monotone" dataKey="근육량" stroke="var(--success)" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {logs.some(r => r.body_fat_pct) && (
            <div style={S.card}>
              <p style={S.sectionTitle}>📊 체지방률 추이</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date"  tick={{ fontSize: 11, fill: "var(--sub)" }} tickFormatter={d => d.slice(5)} />
                  <YAxis unit="%" domain={['auto','auto']} tick={{ fontSize: 11, fill: "var(--sub)" }} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }} />
                  <Line type="monotone" dataKey="체지방률" stroke="var(--danger)" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div style={S.card}>
            <p style={S.sectionTitle}>📋 기록 목록</p>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={S.th}>날짜</th><th style={S.th}>몸무게</th><th style={S.th}>체지방%</th>
                  <th style={S.th}>근육량</th><th style={S.th}>메모</th><th style={{ ...S.th, width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {[...logs].reverse().map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={S.td}>{r.date}</td>
                    <td style={S.td}>{r.weight_kg ? `${r.weight_kg}kg` : "-"}</td>
                    <td style={S.td}>{r.body_fat_pct ? `${r.body_fat_pct}%` : "-"}</td>
                    <td style={S.td}>{r.muscle_kg ? `${r.muscle_kg}kg` : "-"}</td>
                    <td style={S.td}>{r.memo || "-"}</td>
                    <td style={S.td}>
                      <button onClick={async () => {
                        if (!window.confirm("삭제할까요?")) return;
                        await axios.delete(`${API}/body/${r.id}`);
                        fetchLogs();
                      }} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 16 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {logs.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--sub)", marginTop: 40 }}>아직 기록이 없어요!</div>
      )}
    </div>
  );
}

// ── AI 탭 ──
function AITab() {
  const [goals, setGoals] = useState({ goal_weight: "", goal_body_fat: "", goal_muscle: "", ai_memo: "" });
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    axios.get(`${API}/goals`).then(res => {
      setGoals({ goal_weight: res.data.goal_weight || "", goal_body_fat: res.data.goal_body_fat || "",
        goal_muscle: res.data.goal_muscle || "", ai_memo: res.data.ai_memo || "" });
    });
    axios.get(`${API}/ai/recommend`).then(res => {
      if (res.data.result) { setResult(res.data.result); setUpdatedAt(res.data.updated_at); }
    });
  }, []);

  const saveGoals = async () => {
    setSaving(true);
    await axios.post(`${API}/goals`, goals);
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const getRecommendation = async () => {
    setLoading(true); setResult("");
    try {
      const res = await axios.post(`${API}/ai/recommend`);
      setResult(res.data.result); setUpdatedAt(res.data.updated_at);
    } catch { setResult("AI 추천을 받아오는 데 실패했어요."); }
    setLoading(false);
  };

  const formatResult = (text) => text.split('\n').map((line, i) => {
    const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return <p key={i} dangerouslySetInnerHTML={{ __html: bold }} style={{ margin: "4px 0", lineHeight: 1.7 }} />;
  });

  return (
    <div>
      <div style={S.card}>
        <p style={S.sectionTitle}>🎯 목표 설정</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input placeholder="목표 체중(kg)" type="number" value={goals.goal_weight}
            onChange={e => setGoals(p => ({ ...p, goal_weight: e.target.value }))} style={{ ...S.input, flex: 1 }} />
          <input placeholder="체지방(%)" type="number" value={goals.goal_body_fat}
            onChange={e => setGoals(p => ({ ...p, goal_body_fat: e.target.value }))} style={{ ...S.input, flex: 1 }} />
          <input placeholder="근육량(kg)" type="number" value={goals.goal_muscle}
            onChange={e => setGoals(p => ({ ...p, goal_muscle: e.target.value }))} style={{ ...S.input, flex: 1 }} />
        </div>
        <textarea placeholder="AI 메모 (운동 방식, 식단 특이사항 등)"
          value={goals.ai_memo} onChange={e => setGoals(p => ({ ...p, ai_memo: e.target.value }))}
          style={{ ...S.input, height: 90, resize: "vertical", marginBottom: 10 }} />
        <button onClick={saveGoals} disabled={saving} style={{ ...S.btn(), width: "100%" }}>
          {saving ? "저장 중..." : saved ? "✅ 저장됨!" : "💾 목표 저장"}
        </button>
      </div>
      <div style={S.card}>
        <p style={S.sectionTitle}>🤖 AI 추천</p>
        <p style={{ color: "var(--sub)", fontSize: 14, marginBottom: 14 }}>바디 기록, 운동 기록, 식단, 목표를 분석해서 맞춤 추천을 드려요.</p>
        <button onClick={getRecommendation} disabled={loading}
          style={{ ...S.btn(loading ? "var(--sub)" : "#22c55e"), width: "100%" }}>
          {loading ? "⏳ 분석 중... (10~20초)" : "✨ AI 추천 받기"}
        </button>
      </div>
      {result && (
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p style={{ ...S.sectionTitle, marginBottom: 0 }}>📊 분석 결과</p>
            {updatedAt && <span style={{ fontSize: 12, color: "var(--sub)" }}>{updatedAt.slice(0, 16)}</span>}
          </div>
          <div style={{ lineHeight: 1.8 }}>{formatResult(result)}</div>
        </div>
      )}
    </div>
  );
}

// ── 루틴 탭 ──
function RoutineTab() {
  const [routines, setRoutines] = useState([]);
  const [name, setName] = useState("");
  const [exercises, setExercises] = useState([]);
  const [exName, setExName] = useState("");
  const [exSets, setExSets] = useState("");
  const [exReps, setExReps] = useState("");
  const [exRir, setExRir] = useState("");
  const [exRest, setExRest] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [history, setHistory] = useState({});
  const [loadingHistory, setLoadingHistory] = useState({});
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [workoutNames, setWorkoutNames] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const routineListRef = useRef(null);

  const touchDragState = useRef({
    active: false,
    currentIndex: null,
  });

  const fetchRoutines = () => {
    axios.get(`${API}/routines`).then((res) => setRoutines(res.data));
  };

  useEffect(() => {
    fetchRoutines();
    axios.get(`${API}/workout-names`).then((res) => setWorkoutNames(res.data));
  }, []);

  const handleExNameChange = (val, setter) => {
    setter(val);
    if (val.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const filtered = workoutNames
      .filter(
        (n) =>
          n.replace(/\s/g, "").toLowerCase().includes(val.replace(/\s/g, "").toLowerCase()) ||
          n.toLowerCase().includes(val.toLowerCase())
      )
      .slice(0, 6);
    setSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
  };

  // 데스크탑 HTML5 drag
  const handleDragStart = (e, idx) => {
    dragItem.current = idx;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnter = (idx) => {
    if (dragItem.current === null || dragItem.current === idx) return;

    const newRoutines = [...routines];
    const dragged = newRoutines.splice(dragItem.current, 1)[0];
    newRoutines.splice(idx, 0, dragged);

    dragItem.current = idx;
    setRoutines(newRoutines);
  };

  const handleDragEnd = async () => {
    dragItem.current = null;
    dragOverItem.current = null;
    await axios.put(`${API}/routines/reorder`, {
      order: routines.map((r) => r.id),
    });
  };

  // iOS / 모바일 터치 드래그
  const handleTouchStart = (e, idx) => {
    e.stopPropagation();
    touchDragState.current = {
      active: true,
      currentIndex: idx,
    };
    setDraggingIdx(idx);
  };

  const handleTouchMove = (e) => {
    if (!touchDragState.current.active || touchDragState.current.currentIndex == null) return;

    e.preventDefault();

    const listEl = routineListRef.current;
    if (!listEl) return;

    const touchY = e.touches[0].clientY;
    const items = Array.from(listEl.children);
    if (!items.length) return;

    let targetIdx = items.findIndex((el) => {
      const rect = el.getBoundingClientRect();
      return touchY < rect.top + rect.height / 2;
    });

    if (targetIdx === -1) targetIdx = items.length - 1;

    const currentIdx = touchDragState.current.currentIndex;
    if (targetIdx === currentIdx) return;

    setRoutines((prev) => {
      const next = [...prev];
      const [dragged] = next.splice(currentIdx, 1);
      next.splice(targetIdx, 0, dragged);
      return next;
    });

    touchDragState.current.currentIndex = targetIdx;
    setDraggingIdx(targetIdx);
  };

  const handleTouchEnd = async () => {
    if (!touchDragState.current.active) return;

    touchDragState.current = {
      active: false,
      currentIndex: null,
    };
    setDraggingIdx(null);

    await axios.put(`${API}/routines/reorder`, {
      order: routines.map((r) => r.id),
    });
  };

  useEffect(() => {
    const el = routineListRef.current;
    if (!el) return;

    const handler = (e) => {
      if (touchDragState.current.active) {
        e.preventDefault();
      }
    };

    el.addEventListener("touchmove", handler, { passive: false });
    return () => el.removeEventListener("touchmove", handler);
  }, []);

  const toggleExpand = async (id) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }

    setExpanded(id);

    if (!history[id]) {
      setLoadingHistory((p) => ({ ...p, [id]: true }));
      try {
        const res = await axios.get(`${API}/routines/${id}/history`);
        setHistory((p) => ({ ...p, [id]: res.data }));
      } catch {
      } finally {
        setLoadingHistory((p) => ({ ...p, [id]: false }));
      }
    }
  };

  const addExercise = () => {
    if (!exName) return;
    setExercises((prev) => [
      ...prev,
      {
        workout_name: exName,
        sets: exSets,
        reps: exReps,
        rir: exRir,
        rest: exRest,
      },
    ]);
    setExName("");
    setExSets("");
    setExReps("");
    setExRir("");
    setExRest("");
    setShowSuggestions(false);
  };

  const saveRoutine = async () => {
    if (!name || exercises.length === 0) return;
    setSaving(true);
    await axios.post(`${API}/routines`, { name, exercises });
    setSaving(false);
    setDone(true);
    setName("");
    setExercises([]);
    fetchRoutines();
    setTimeout(() => setDone(false), 1500);
  };

  const deleteRoutine = async (id) => {
    if (!window.confirm("정말 삭제할까요?")) return;
    await axios.delete(`${API}/routines/${id}`);
    fetchRoutines();
  };

  const startEdit = (r) => {
    setEditingId(r.id);
    setEditData({
      name: r.name,
      exercises: JSON.parse(JSON.stringify(r.exercises)),
    });
    setExpanded(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData(null);
  };

  const saveEdit = async () => {
    await axios.put(`${API}/routines/${editingId}`, editData);
    setEditingId(null);
    setEditData(null);
    setHistory((p) => {
      const n = { ...p };
      delete n[editingId];
      return n;
    });
    fetchRoutines();
  };

  const moveEx = (idx, dir) => {
    const exs = [...editData.exercises];
    const target = idx + dir;
    if (target < 0 || target >= exs.length) return;
    [exs[idx], exs[target]] = [exs[target], exs[idx]];
    setEditData((p) => ({ ...p, exercises: exs }));
  };

  const updateEx = (idx, field, val) => {
    const exs = [...editData.exercises];
    exs[idx] = { ...exs[idx], [field]: val };
    setEditData((p) => ({ ...p, exercises: exs }));
  };

  const removeEx = (idx) => {
    setEditData((p) => ({
      ...p,
      exercises: p.exercises.filter((_, i) => i !== idx),
    }));
  };

  const addExToEdit = () => {
    setEditData((p) => ({
      ...p,
      exercises: [
        ...p.exercises,
        { workout_name: "", sets: "", reps: "", rir: "", rest: "" },
      ],
    }));
  };

  const renderHistory = (ex, hist) => {
    if (!hist) return null;
    const h = hist.find((h) => h.workout_name === ex.workout_name);
    if (!h || h.status === "nodata" || h.status === "invalid" || !h.display) return null;

    const { display, last_date } = h;

    if (display.type === "average") {
      return (
        <div
          style={{
            marginTop: 6,
            padding: "8px 12px",
            borderRadius: 8,
            background: "var(--input-bg)",
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--sub)" }}>이전 평균: </span>
          <span style={{ color: "var(--success)", fontWeight: 700 }}>
            {display.avg_weight}kg × {display.avg_reps}회
          </span>
          <span style={{ color: "var(--sub)" }}>
            {" "}
            ({display.sets}세트, {last_date})
          </span>
        </div>
      );
    }

    if (display.type === "sets") {
      return (
        <div
          style={{
            marginTop: 6,
            padding: "8px 12px",
            borderRadius: 8,
            background: "var(--input-bg)",
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--sub)" }}>이전 기록: </span>
          <span style={{ color: "var(--accent2)", fontWeight: 700 }}>
            {display.detail.map((d) => `${d.weight}kg×${d.reps}`).join(", ")}
          </span>
          <span style={{ color: "var(--sub)" }}> ({last_date})</span>
        </div>
      );
    }

    return null;
  };

  return (
    <div>
      <p style={S.sectionTitle}>📋 내 루틴</p>

      {routines.length === 0 && (
        <div style={{ color: "var(--sub)", marginBottom: 24 }}>
          저장된 루틴이 아직 없어요.
        </div>
      )}

      <div ref={routineListRef}>
        {routines.map((r, idx) => (
          <div
            key={r.id}
            draggable={editingId !== r.id}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragEnter={() => handleDragEnter(idx)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
            style={{
              ...S.card,
              cursor: editingId === r.id ? "default" : "default",
              transition: "box-shadow .15s",
              userSelect: "none",
              boxShadow: draggingIdx === idx ? "0 8px 24px rgba(0,0,0,.18)" : "none",
            }}
          >
            {editingId === r.id && editData ? (
              <div>
                <p style={{ ...S.sectionTitle, marginBottom: 12 }}>✏️ 루틴 수정</p>

                <input
                  value={editData.name}
                  onChange={(e) => setEditData((p) => ({ ...p, name: e.target.value }))}
                  style={{ ...S.input, marginBottom: 16, fontWeight: "700" }}
                />

                {editData.exercises.map((ex, i) => (
                  <div
                    key={i}
                    style={{
                      background: "var(--input-bg)",
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        value={ex.workout_name}
                        onChange={(e) => updateEx(i, "workout_name", e.target.value)}
                        style={{ ...S.input, flex: 1, fontSize: 14 }}
                        placeholder="운동명"
                      />
                      <button
                        onClick={() => moveEx(i, -1)}
                        disabled={i === 0}
                        style={{
                          ...S.btnGhost,
                          padding: "8px 10px",
                          fontSize: 14,
                          opacity: i === 0 ? 0.3 : 1,
                        }}
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveEx(i, 1)}
                        disabled={i === editData.exercises.length - 1}
                        style={{
                          ...S.btnGhost,
                          padding: "8px 10px",
                          fontSize: 14,
                          opacity: i === editData.exercises.length - 1 ? 0.3 : 1,
                        }}
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => removeEx(i)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--danger)",
                          cursor: "pointer",
                          fontSize: 18,
                        }}
                      >
                        ✕
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: 6 }}>
                      {[
                        ["sets", "세트"],
                        ["reps", "횟수"],
                        ["rir", "RIR"],
                        ["rest", "휴식"],
                      ].map(([field, placeholder]) => (
                        <input
                          key={field}
                          value={ex[field]}
                          onChange={(e) => updateEx(i, field, e.target.value)}
                          placeholder={placeholder}
                          style={{ ...S.input, flex: 1, fontSize: 13 }}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                <button
                  onClick={addExToEdit}
                  style={{ ...S.btn("var(--accent2)"), width: "100%", marginBottom: 12 }}
                >
                  + 운동 추가
                </button>

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={cancelEdit} style={{ ...S.btnGhost, flex: 1 }}>
                    취소
                  </button>
                  <button onClick={saveEdit} style={{ ...S.btn(), flex: 2 }}>
                    저장
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      flex: 1,
                      minWidth: 0,
                      gap: 10,
                    }}
                  >
                    <span
                      onTouchStart={(e) => handleTouchStart(e, idx)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      style={{
                        color: "var(--border)",
                        fontSize: 20,
                        cursor: "grab",
                        padding: "6px 4px",
                        lineHeight: 1,
                        touchAction: "none",
                        WebkitUserSelect: "none",
                        userSelect: "none",
                        flexShrink: 0,
                      }}
                    >
                      ☰
                    </span>

                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 15,
                        cursor: "pointer",
                        color: "var(--text)",
                        flex: 1,
                        minWidth: 0,
                      }}
                      onClick={() => toggleExpand(r.id)}
                    >
                      {expanded === r.id ? "▼ " : "▶ "} {r.name}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => startEdit(r)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent)",
                        cursor: "pointer",
                        fontSize: 15,
                      }}
                    >
                      수정
                    </button>
                    <button
                      onClick={() => deleteRoutine(r.id)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--danger)",
                        cursor: "pointer",
                        fontSize: 16,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {expanded === r.id && (
                  <div style={{ marginTop: 14 }}>
                    {loadingHistory[r.id] ? (
                      <div style={{ color: "var(--sub)", fontSize: 14 }}>불러오는 중...</div>
                    ) : (
                      r.exercises?.map((ex, i) => (
                        <div
                          key={i}
                          style={{
                            marginBottom: 14,
                            paddingBottom: 14,
                            borderBottom:
                              i !== r.exercises.length - 1 ? "1px solid var(--border)" : "none",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: 15,
                                color: "var(--text)",
                                minWidth: 100,
                              }}
                            >
                              {ex.workout_name}
                            </span>
                            <span style={{ color: "var(--sub)", fontSize: 14 }}>
                              {ex.sets}세트
                            </span>
                            <span style={{ color: "var(--sub)", fontSize: 14 }}>
                              {ex.reps}회
                            </span>
                            <span style={{ color: "var(--sub)", fontSize: 14 }}>
                              RIR {ex.rir || "-"}
                            </span>
                            <span style={{ color: "var(--sub)", fontSize: 14 }}>
                              휴식 {ex.rest || "-"}
                            </span>
                          </div>

                          {renderHistory(ex, history[r.id])}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div style={S.card}>
        <p style={S.sectionTitle}>➕ 새 루틴 만들기</p>

        <input
          placeholder="예: Day 1 - Push"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ ...S.input, marginBottom: 12 }}
        />

        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 8,
            flexWrap: "wrap",
            position: "relative",
          }}
        >
          <div style={{ flex: 2, minWidth: 100, position: "relative" }}>
            <input
              placeholder="운동명"
              value={exName}
              onChange={(e) => handleExNameChange(e.target.value, setExName)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              style={S.input}
            />
            {showSuggestions && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  marginTop: 4,
                  overflow: "hidden",
                  boxShadow: "0 4px 12px rgba(0,0,0,.15)",
                }}
              >
                {suggestions.map((s, i) => (
                  <div
                    key={`${s}-${i}`}
                    onMouseDown={() => {
                      setExName(s);
                      setShowSuggestions(false);
                    }}
                    style={{
                      padding: "10px 14px",
                      cursor: "pointer",
                      fontSize: 14,
                      color: "var(--text)",
                      borderBottom:
                        i !== suggestions.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--input-bg)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>

          <input
            placeholder="세트"
            value={exSets}
            onChange={(e) => setExSets(e.target.value)}
            style={{ ...S.input, flex: 1, minWidth: 50 }}
          />
          <input
            placeholder="횟수"
            value={exReps}
            onChange={(e) => setExReps(e.target.value)}
            style={{ ...S.input, flex: 1, minWidth: 50 }}
          />
          <input
            placeholder="RIR"
            value={exRir}
            onChange={(e) => setExRir(e.target.value)}
            style={{ ...S.input, flex: 1, minWidth: 50 }}
          />
          <input
            placeholder="휴식"
            value={exRest}
            onChange={(e) => setExRest(e.target.value)}
            style={{ ...S.input, flex: 1, minWidth: 50 }}
          />

          <button
            onClick={addExercise}
            style={{ ...S.btn("var(--accent2)"), whiteSpace: "nowrap" }}
          >
            추가
          </button>
        </div>

        {exercises.length > 0 && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
              marginBottom: 12,
              tableLayout: "fixed",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={S.th}>운동</th>
                <th style={S.th}>세트</th>
                <th style={S.th}>횟수</th>
                <th style={S.th}>RIR</th>
                <th style={S.th}>휴식</th>
                <th style={{ ...S.th, width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {exercises.map((ex, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={S.td}>{ex.workout_name}</td>
                  <td style={S.td}>{ex.sets}</td>
                  <td style={S.td}>{ex.reps}회</td>
                  <td style={S.td}>{ex.rir || "-"}</td>
                  <td style={S.td}>{ex.rest || "-"}</td>
                  <td style={S.td}>
                    <button
                      onClick={() => setExercises((p) => p.filter((_, idx) => idx !== i))}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--danger)",
                        cursor: "pointer",
                        fontSize: 16,
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <button onClick={saveRoutine} disabled={saving} style={{ ...S.btn(), width: "100%" }}>
          {saving ? "저장 중..." : done ? "저장 완료!" : "루틴 저장"}
        </button>
      </div>
    </div>
  );
}

// ── 식단 탭 ──
function MealTab() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [meals, setMeals] = useState([]);
  const [mealType, setMealType] = useState("아침");
  const [foodName, setFoodName] = useState(""); const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState(""); const [carb, setCarb] = useState("");
  const [fat, setFat] = useState(""); const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false); const [done, setDone] = useState(false);

  // 템플릿
  const [templateView, setTemplateView] = useState(false);
  const [templateNames, setTemplateNames] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState("");
  const [newTmplName, setNewTmplName] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyDone, setApplyDone] = useState(false);
  const [intakes, setIntakes] = useState({});  // { template_item_id: g }

  // 템플릿 항목 입력
  const [tmplMealType, setTmplMealType] = useState("아침");
  const [tmplFoodName, setTmplFoodName] = useState("");
  const [tmplKcal, setTmplKcal] = useState("");
  const [tmplProtein, setTmplProtein] = useState("");
  const [tmplCarb, setTmplCarb] = useState("");
  const [tmplFat, setTmplFat] = useState("");
  const [tmplMemo, setTmplMemo] = useState("");
  const [tmplServingUnit, setTmplServingUnit] = useState("total");
  const [tmplServingSize, setTmplServingSize] = useState("");
  const [tmplSaving, setTmplSaving] = useState(false);
  const [tmplDone, setTmplDone] = useState(false);

  const fetchMeals = (d) => axios.get(`${API}/meal?date_str=${d}`).then(res => setMeals(res.data));
  const fetchTemplateNames = () => axios.get(`${API}/meal-template-names`).then(res => {
    setTemplateNames(res.data);
    if (res.data.length > 0 && !templateName) setTemplateName(res.data[0].name);
  });
  const fetchTemplates = () => axios.get(`${API}/meal-templates`).then(res => setTemplates(res.data));

  useEffect(() => { fetchMeals(date); }, [date]);
  useEffect(() => { fetchTemplateNames(); fetchTemplates(); }, []);

  const mealIcon = (t) => t === "아침" ? "🌅" : t === "점심" ? "☀️" : t === "저녁" ? "🌙" : "🍎";
  const mealOrder = ["아침","점심","저녁","간식"];

  // 오늘 식단 저장
  const save = async () => {
    if (!foodName) return;
    setSaving(true);
    const p = new URLSearchParams();
    p.append("meal_type", mealType); p.append("food_name", foodName);
    if (kcal) p.append("kcal", kcal); if (protein) p.append("protein", protein);
    if (carb) p.append("carb", carb); if (fat) p.append("fat", fat);
    if (memo) p.append("memo", memo);
    await axios.post(`${API}/meal?${p.toString()}`);
    setSaving(false); setDone(true);
    setFoodName(""); setKcal(""); setProtein(""); setCarb(""); setFat(""); setMemo("");
    fetchMeals(date);
    setTimeout(() => setDone(false), 1500);
  };

  const deleteMeal = async (id) => {
    if (!window.confirm("삭제할까요?")) return;
    await axios.delete(`${API}/meal/${id}`);
    fetchMeals(date);
  };

  // 템플릿 이름 추가
  const addTemplateName = async () => {
    if (!newTmplName.trim()) return;
    try {
      await axios.post(`${API}/meal-template-names`, { name: newTmplName.trim() });
      setNewTmplName("");
      await fetchTemplateNames();
      setTemplateName(newTmplName.trim());
    } catch { alert("이미 존재하는 이름이에요!"); }
  };

  // 템플릿 이름 삭제
  const deleteTemplateName = async (id, name) => {
    if (!window.confirm(`"${name}" 템플릿과 모든 항목을 삭제할까요?`)) return;
    await axios.delete(`${API}/meal-template-names/${id}`);
    await fetchTemplateNames();
    await fetchTemplates();
    setTemplateName("");
  };

  // 템플릿 적용
  const applyTemplate = async (name) => {
    setApplying(true);
    try {
      await axios.post(`${API}/meal-templates/apply`, {
        template_name: name,
        date_str: date,
        intakes: intakes,
      });
      setApplyDone(true);
      setIntakes({});
      fetchMeals(date);
      setTimeout(() => setApplyDone(false), 2000);
    } catch { alert("템플릿이 비어있어요!"); }
    setApplying(false);
  };

  // 템플릿 항목 저장
  const saveTmplItem = async () => {
    if (!tmplFoodName) return;
    setTmplSaving(true);
    await axios.post(`${API}/meal-templates`, {
      template_name: templateName,
      meal_type: tmplMealType,
      food_name: tmplFoodName,
      kcal: tmplKcal || null,
      protein: tmplProtein || null,
      carb: tmplCarb || null,
      fat: tmplFat || null,
      memo: tmplMemo || null,
      serving_unit: tmplServingUnit,
      serving_size: tmplServingSize || null,
    });
    setTmplSaving(false); setTmplDone(true);
    setTmplFoodName(""); setTmplKcal(""); setTmplProtein("");
    setTmplCarb(""); setTmplFat(""); setTmplMemo("");
    setTmplServingUnit("total"); setTmplServingSize("");
    fetchTemplates();
    setTimeout(() => setTmplDone(false), 1500);
  };

  const deleteTmpl = async (id) => {
    if (!window.confirm("삭제할까요?")) return;
    await axios.delete(`${API}/meal-templates/${id}`);
    fetchTemplates();
  };

  // 현재 선택된 템플릿 항목
  const currentItems = templates.filter(t => t.template_name === templateName);
  const tmplGrouped = mealOrder.reduce((acc, type) => {
    acc[type] = currentItems.filter(t => t.meal_type === type); return acc;
  }, {});

  // 오늘 식단 그룹
  const grouped = mealOrder.reduce((acc, type) => {
    acc[type] = meals.filter(m => m.meal_type === type); return acc;
  }, {});
  const totals = meals.reduce((acc, m) => ({
    kcal: acc.kcal + (m.kcal || 0), protein: acc.protein + (m.protein || 0),
    carb: acc.carb + (m.carb || 0), fat: acc.fat + (m.fat || 0),
  }), { kcal: 0, protein: 0, carb: 0, fat: 0 });

  // 자동계산 미리보기
  const calcNutrition = (item, intakeG) => {
    if (!intakeG || !item.kcal) return null;
    const g = parseFloat(intakeG);
    const base = item.serving_unit === "per100g" ? 100 : parseFloat(item.serving_size || 1);
    if (!base || base === 0) return null;
    const ratio = g / base;
    return {
      kcal:    item.kcal    ? Math.round(item.kcal    * ratio) : null,
      protein: item.protein ? Math.round(item.protein * ratio * 10) / 10 : null,
      carb:    item.carb    ? Math.round(item.carb    * ratio * 10) / 10 : null,
      fat:     item.fat     ? Math.round(item.fat     * ratio * 10) / 10 : null,
    };
  };

  return (
    <div>
      {/* 날짜 + 뷰 토글 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ ...S.input, width: "auto" }} />
        <button onClick={() => setTemplateView(!templateView)}
          style={templateView ? S.btn("var(--accent)") : S.btnGhost}>
          {templateView ? "📅 오늘 식단" : "📋 기본 식단"}
        </button>
      </div>

      {/* ── 기본 식단 템플릿 뷰 ── */}
      {templateView ? (
        <div>
          {/* 템플릿 이름 탭 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            {templateNames.map(n => (
              <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button onClick={() => setTemplateName(n.name)}
                  style={templateName === n.name ? S.btn("var(--accent)") : S.btnGhost}>
                  {n.name}
                </button>
                <button onClick={() => deleteTemplateName(n.id, n.name)}
                  style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            ))}
          </div>

          {/* 새 템플릿 이름 추가 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <input placeholder="새 식단 이름 (예: 대회준비)" value={newTmplName}
              onChange={e => setNewTmplName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addTemplateName()}
              style={{ ...S.input, flex: 1 }} />
            <button onClick={addTemplateName} style={S.btn("var(--accent2)")}>+ 추가</button>
          </div>

          {templateName && (
            <>
              {/* 적용 버튼 */}
              <button onClick={() => applyTemplate(templateName)}
                disabled={applying || currentItems.length === 0}
                style={{
                  ...S.btn(currentItems.length === 0 ? "var(--sub)" : "var(--success)"),
                  width: "100%", marginBottom: 20
                }}>
                {applying ? "적용 중..." : applyDone ? "✅ 적용됨!" : `📅 ${date}에 "${templateName}" 적용`}
              </button>

              {/* 템플릿 항목 목록 (섭취량 입력 포함) */}
              {currentItems.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--sub)", marginBottom: 24 }}>
                  "{templateName}" 템플릿이 비어있어요!
                </div>
              ) : (
                mealOrder.map(type => tmplGrouped[type].length > 0 && (
                  <div key={type} style={{ marginBottom: 16 }}>
                    <p style={{ fontWeight: "700", color: "var(--accent)", marginBottom: 8, fontSize: 15 }}>
                      {mealIcon(type)} {type}
                    </p>
                    <div style={S.card}>
                      {tmplGrouped[type].map((t, i) => {
                        const intakeG = intakes[t.id] || "";
                        const preview = intakeG ? calcNutrition(t, intakeG) : null;
                        const hasServing = t.serving_unit && (t.serving_size || t.serving_unit === "per100g");
                        return (
                          <div key={i} style={{
                            paddingBottom: i < tmplGrouped[type].length - 1 ? 14 : 0,
                            marginBottom: i < tmplGrouped[type].length - 1 ? 14 : 0,
                            borderBottom: i < tmplGrouped[type].length - 1 ? "1px solid var(--border)" : "none"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: "600", color: "var(--text)", marginBottom: 4 }}>{t.food_name}</div>
                                <div style={{ fontSize: 13, color: "var(--sub)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                                  {t.kcal    && <span>🔥 {t.kcal}kcal</span>}
                                  {t.protein && <span>💪 {t.protein}g</span>}
                                  {t.carb    && <span>🍚 {t.carb}g</span>}
                                  {t.fat     && <span>🥑 {t.fat}g</span>}
                                  {hasServing && (
                                    <span style={{ color: "var(--accent)" }}>
                                      ({t.serving_unit === "per100g" ? "100g당" : `${t.serving_size}g 기준`})
                                    </span>
                                  )}
                                </div>

                                {/* 섭취량 입력 (serving 있는 경우만) */}
                                {hasServing && (
                                  <div style={{ marginTop: 8 }}>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                      <input
                                        placeholder="섭취량 (g)"
                                        type="number"
                                        value={intakeG}
                                        onChange={e => setIntakes(p => ({ ...p, [t.id]: e.target.value }))}
                                        style={{ ...S.input, width: 110, fontSize: 13 }}
                                      />
                                      {intakeG && <span style={{ fontSize: 13, color: "var(--sub)" }}>g 섭취</span>}
                                    </div>
                                    {/* 자동계산 미리보기 */}
                                    {preview && (
                                      <div style={{
                                        marginTop: 6, padding: "6px 10px", borderRadius: 8,
                                        background: "var(--input-bg)", fontSize: 13,
                                        display: "flex", gap: 10, flexWrap: "wrap", color: "var(--success)"
                                      }}>
                                        <span>→</span>
                                        {preview.kcal    && <span>🔥 {preview.kcal}kcal</span>}
                                        {preview.protein && <span>💪 {preview.protein}g</span>}
                                        {preview.carb    && <span>🍚 {preview.carb}g</span>}
                                        {preview.fat     && <span>🥑 {preview.fat}g</span>}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <button onClick={() => deleteTmpl(t.id)}
                                style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 16, marginLeft: 8 }}>✕</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}

              {/* 템플릿 항목 추가 폼 */}
              <div style={S.card}>
                <p style={S.sectionTitle}>➕ "{templateName}" 항목 추가</p>

                {/* 식사 타입 */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  {mealOrder.map(t => (
                    <button key={t} onClick={() => setTmplMealType(t)}
                      style={tmplMealType === t ? S.btn("var(--accent)") : S.btnGhost}>
                      {mealIcon(t)} {t}
                    </button>
                  ))}
                </div>

                <input placeholder="음식 이름 *" value={tmplFoodName}
                  onChange={e => setTmplFoodName(e.target.value)}
                  style={{ ...S.input, marginBottom: 8 }} />

                {/* 영양성분 기준 단위 */}
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  {[
                    { val: "total",   label: "총중량 기준" },
                    { val: "per100g", label: "100g당 기준" },
                  ].map(u => (
                    <button key={u.val} onClick={() => setTmplServingUnit(u.val)}
                      style={tmplServingUnit === u.val ? S.btn("var(--accent)") : S.btnGhost}>
                      {u.label}
                    </button>
                  ))}
                </div>

                {/* 총중량 기준일 때만 기준 중량 입력 */}
                {tmplServingUnit === "total" && (
                  <input placeholder="기준 중량 (g) — 예: 580" type="number" value={tmplServingSize}
                    onChange={e => setTmplServingSize(e.target.value)}
                    style={{ ...S.input, marginBottom: 8 }} />
                )}

                {/* 영양성분 */}
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input placeholder="칼로리(kcal)" type="number" value={tmplKcal}
                    onChange={e => setTmplKcal(e.target.value)} style={{ ...S.input, flex: 1 }} />
                  <input placeholder="단백질(g)" type="number" value={tmplProtein}
                    onChange={e => setTmplProtein(e.target.value)} style={{ ...S.input, flex: 1 }} />
                  <input placeholder="탄수화물(g)" type="number" value={tmplCarb}
                    onChange={e => setTmplCarb(e.target.value)} style={{ ...S.input, flex: 1 }} />
                  <input placeholder="지방(g)" type="number" value={tmplFat}
                    onChange={e => setTmplFat(e.target.value)} style={{ ...S.input, flex: 1 }} />
                </div>

                <input placeholder="메모 (선택)" value={tmplMemo}
                  onChange={e => setTmplMemo(e.target.value)}
                  style={{ ...S.input, marginBottom: 10 }} />

                <button onClick={saveTmplItem} disabled={tmplSaving}
                  style={{ ...S.btn("var(--accent2)"), width: "100%" }}>
                  {tmplSaving ? "저장 중..." : tmplDone ? "✅ 추가됨!" : "➕ 추가"}
                </button>
              </div>
            </>
          )}
        </div>

      ) : (
        /* ── 오늘 식단 뷰 ── */
        <div>
          {/* 빠른 템플릿 적용 */}
          {templateNames.length > 0 && (
            <div style={{ ...S.card, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--sub)", fontWeight: "600" }}>빠른 적용:</span>
              {templateNames.map(n => (
                <button key={n.id} onClick={() => applyTemplate(n.name)}
                  style={{ ...S.btn("var(--accent)"), padding: "7px 14px", fontSize: 13 }}>
                  {applyDone ? "✅" : n.name}
                </button>
              ))}
            </div>
          )}

          {/* 식단 입력 폼 */}
          <div style={S.card}>
            <p style={S.sectionTitle}>📝 식단 입력</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {mealOrder.map(t => (
                <button key={t} onClick={() => setMealType(t)}
                  style={mealType === t ? S.btn("var(--accent)") : S.btnGhost}>
                  {mealIcon(t)} {t}
                </button>
              ))}
            </div>
            <input placeholder="음식 이름 *" value={foodName} onChange={e => setFoodName(e.target.value)}
              style={{ ...S.input, marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input placeholder="칼로리(kcal)" type="number" value={kcal} onChange={e => setKcal(e.target.value)} style={{ ...S.input, flex: 1 }} />
              <input placeholder="단백질(g)" type="number" value={protein} onChange={e => setProtein(e.target.value)} style={{ ...S.input, flex: 1 }} />
              <input placeholder="탄수화물(g)" type="number" value={carb} onChange={e => setCarb(e.target.value)} style={{ ...S.input, flex: 1 }} />
              <input placeholder="지방(g)" type="number" value={fat} onChange={e => setFat(e.target.value)} style={{ ...S.input, flex: 1 }} />
            </div>
            <input placeholder="메모 (선택)" value={memo} onChange={e => setMemo(e.target.value)}
              style={{ ...S.input, marginBottom: 10 }} />
            <button onClick={save} disabled={saving} style={{ ...S.btn("var(--accent2)"), width: "100%" }}>
              {saving ? "저장 중..." : done ? "✅ 저장됨!" : "💾 저장"}
            </button>
          </div>

          {/* 합계 */}
          {meals.length > 0 && (
            <div style={{ ...S.card, display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontWeight: "700" }}>📊 합계</span>
              <span>🔥 {totals.kcal} kcal</span>
              <span>💪 {totals.protein.toFixed(1)}g</span>
              <span>🍚 {totals.carb.toFixed(1)}g</span>
              <span>🥑 {totals.fat.toFixed(1)}g</span>
            </div>
          )}

          {/* 식단 목록 */}
          {mealOrder.map(type => grouped[type].length > 0 && (
            <div key={type} style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: "700", color: "var(--accent)", marginBottom: 8, fontSize: 15 }}>
                {mealIcon(type)} {type}
              </p>
              <div style={S.card}>
                {grouped[type].map((m, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    paddingBottom: i < grouped[type].length - 1 ? 10 : 0,
                    marginBottom: i < grouped[type].length - 1 ? 10 : 0,
                    borderBottom: i < grouped[type].length - 1 ? "1px solid var(--border)" : "none"
                  }}>
                    <div>
                      <div style={{ fontWeight: "600", color: "var(--text)" }}>{m.food_name}</div>
                      <div style={{ fontSize: 13, color: "var(--sub)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {m.kcal    && <span>🔥 {m.kcal}kcal</span>}
                        {m.protein && <span>💪 {m.protein}g</span>}
                        {m.carb    && <span>🍚 {m.carb}g</span>}
                        {m.fat     && <span>🥑 {m.fat}g</span>}
                        {m.memo    && <span>💬 {m.memo}</span>}
                      </div>
                    </div>
                    <button onClick={() => deleteMeal(m.id)}
                      style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {meals.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--sub)", marginTop: 40 }}>
              이 날 식단 기록이 없어요!
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 설정 탭 ──
function SettingsTab({ theme, onToggleTheme, onLogout, userName, showLastWorkout, onToggleShowLastWorkout }) {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    axios.get(`${API}/settings`).then(res => {
      setSettings(res.data);
    });
  }, []);

  if (!settings) return <div style={{ color: "var(--sub)" }}>로딩 중...</div>;

  const isEnabled = showLastWorkout !== undefined ? showLastWorkout : (settings.show_last_workout ?? true);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* 계정 */}
      <div style={S.card}>
        <p style={{ fontWeight: "700", marginBottom: 12, marginTop: 0, color: "var(--text)" }}>👤 계정</p>
        <p style={{ color: "var(--sub)", fontSize: 14, marginBottom: 14, marginTop: 0 }}>{userName}</p>
        <button onClick={onLogout} style={{ ...S.btnGhost, width: "100%" }}>로그아웃</button>
      </div>

      {/* 다크모드 토글 */}
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontWeight: "700", margin: 0, color: "var(--text)" }}>
              {theme === "dark" ? "🌙 다크 모드" : "☀️ 라이트 모드"}
            </p>
            <p style={{ fontSize: 13, color: "var(--sub)", margin: "4px 0 0" }}>브라우저에 저장됩니다</p>
          </div>
          <div onClick={onToggleTheme}
            style={{
              width: 52, height: 28, borderRadius: 14, cursor: "pointer",
              background: theme === "dark" ? "var(--accent)" : "var(--border)",
              position: "relative", transition: "background .2s", flexShrink: 0,
            }}>
            <div style={{
              position: "absolute", top: 3,
              left: theme === "dark" ? 27 : 3,
              width: 22, height: 22, borderRadius: "50%",
              background: "white", transition: "left .2s",
              boxShadow: "0 1px 4px rgba(0,0,0,.3)"
            }} />
          </div>
        </div>
      </div>

      {/* 홈 최근 운동 표시 */}
      <div style={S.card}>
        <p style={{
          fontWeight: "700",
          marginBottom: 4,
          marginTop: 0,
          color: "var(--text)"
        }}>
          💪 홈 최근 운동 표시
        </p>

        <p style={{
          color: "var(--sub)",
          fontSize: 14,
          marginBottom: 14,
          marginTop: 0
        }}>
          메인 화면에 최근 운동 기록 카드를 표시합니다
        </p>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>

          <span style={{
            color: "var(--text)",
            fontWeight: "600"
          }}>
            최근 운동 표시
          </span>

          <input
            type="checkbox"
            checked={isEnabled}

            onChange={async (e) => {
              const enabled = e.target.checked;

              setSettings({
                ...settings,
                show_last_workout: enabled
              });

              if (onToggleShowLastWorkout) {
                onToggleShowLastWorkout(enabled);
              }

              await axios.post(
                `${API}/settings/last-workout?enabled=${enabled}`
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── 로그인 화면 ──
function LoginScreen({ onLogin }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "100vh", gap: 24,
      background: "var(--bg)",
    }}>
      <h1 style={{ fontSize: 32, fontWeight: "800", color: "var(--text)", margin: 0 }}>Overloader</h1>
      <p style={{ color: "var(--sub)", margin: 0 }}>구글 계정으로 로그인하세요</p>
      <GoogleLogin
        onSuccess={async (credentialResponse) => {
          const res = await axios.post(`${API}/auth/google`, {
            access_token: credentialResponse.credential, is_id_token: true
          });
          initAuthSession(res.data.token, res.data.name);
          onLogin(res.data);
        }}
        onError={() => alert("로그인 실패")}
      />
    </div>
  );
}

// ── 메인 앱 ──
export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("home");
  const [showLastWorkout, setShowLastWorkout] = useState(true);
  const [subPlan, setSubPlan] = useState("routine");
  const [subHealth, setSubHealth] = useState("body");
  const clearAppState = useCallback(() => {
    setUser(null);
    setTab("home");
  }, []);

  useEffect(() => {
    registerLogoutCallback(clearAppState);
  }, [clearAppState]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const name = localStorage.getItem("userName");
    if (token) {
      initAuthSession(token, name);
      setUser({ token, name });
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    axios.get(`${API}/settings`)
      .then(res => {
        if (res.data && typeof res.data.show_last_workout === "boolean") {
          setShowLastWorkout(res.data.show_last_workout);
        }
      })
      .catch(() => {});
  }, [user]);

  const handleLogout = useCallback(() => {
    performLogout({ expired: false });
  }, []);

  const handleLogin = useCallback((data) => {
    initAuthSession(data.token, data.name);
    setUser(data);
  }, []);


  if (!user) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <LoginScreen onLogin={handleLogin} />
      </GoogleOAuthProvider>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AppShell
        currentTab={tab}
        onTabChange={setTab}
        userName={user.name}
        onLogout={handleLogout}
      >
        {tab === "home" && (
          <HomeScreen
            userName={user.name}
            onNavigateTab={setTab}
            showLastWorkout={showLastWorkout}
          />
        )}

        {tab === "record" && (
          <RecordScreen />
        )}

        {tab === "calendar" && (
          <CalendarScreen onNavigateTab={setTab} />
        )}

        {tab === "analyze" && (
          <AnalyticsScreen />
        )}

        {tab === "health" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
              {[
                { id: "body",    label: "⚖️ 바디" },
                { id: "cardio",  label: "🏃 유산소" },
                { id: "meal",    label: "🍽️ 식단" },
                { id: "routine", label: "📋 루틴" },
                { id: "ai",      label: "🤖 AI" },
              ].map(s => (
                <button key={s.id} onClick={() => setSubHealth(s.id)}
                  style={{
                    ...(subHealth === s.id ? S.btn("var(--accent)") : S.btnGhost),
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}>
                  {s.label}
                </button>
              ))}
            </div>
            {subHealth === "body"    && <BodyTab />}
            {subHealth === "cardio"  && <CardioAnalysisTab />}
            {subHealth === "meal"    && <MealTab />}
            {subHealth === "routine" && <RoutineTab />}
            {subHealth === "ai"      && <AITab />}
          </div>
        )}

        {tab === "settings" && (
          <SettingsTab
            theme={theme}
            onToggleTheme={toggleTheme}
            onLogout={handleLogout}
            userName={user.name}
            showLastWorkout={showLastWorkout}
            onToggleShowLastWorkout={setShowLastWorkout}
          />
        )}
      </AppShell>
    </GoogleOAuthProvider>
  );
}


const tagStyle = (color) => ({
  padding: "3px 10px", borderRadius: 20, fontSize: 13, fontWeight: "600",
  background: color + "22",   // 투명도 낮은 배경
  color: color,
  border: `1px solid ${color}44`,
});