import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
import {
  HealthIcon,
  ScaleIcon,
  RunnerIcon,
  UtensilsIcon,
  ClipboardListIcon,
  SparklesIcon,
  PlusIcon,
  TrashIcon,
  EditIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  GripVerticalIcon
} from "../common/Icons";

const API = process.env.REACT_APP_API_URL;

// 공통 카드/인풋 스타일 헬퍼
const S = {
  card: {
    background: "var(--card)",
    borderRadius: "var(--radius-card)",
    padding: "20px",
    border: "1px solid var(--border)",
    marginBottom: "16px",
    boxSizing: "border-box"
  },
  cardSubtle: {
    background: "var(--card-subtle)",
    borderRadius: "var(--radius-inner)",
    padding: "16px",
    border: "1px solid var(--border)",
    marginBottom: "12px",
    boxSizing: "border-box"
  },
  input: {
    background: "var(--input-bg)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "10px 14px",
    color: "var(--text)",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    width: "100%",
    transition: "border-color 0.15s"
  },
  btn: (bg = "var(--accent)", color = "var(--accent-contrast, #ffffff)") => ({
    background: bg,
    color: color,
    border: "none",
    borderRadius: "var(--radius-pill)",
    padding: "10px 18px",
    fontWeight: "700",
    fontSize: "14px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    transition: "opacity 0.15s",
    boxSizing: "border-box"
  }),
  btnGhost: {
    background: "transparent",
    color: "var(--sub)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-pill)",
    padding: "8px 16px",
    fontWeight: "600",
    fontSize: "13px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    transition: "all 0.15s",
    boxSizing: "border-box"
  },
  sectionTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: "var(--text)",
    margin: "0 0 14px 0",
    display: "flex",
    alignItems: "center",
    gap: "8px"
  },
  th: {
    padding: "10px 8px",
    textAlign: "left",
    color: "var(--sub)",
    fontSize: "12px",
    fontWeight: "600"
  },
  td: {
    padding: "12px 8px",
    color: "var(--text)",
    fontSize: "13px"
  }
};

// ─────────────────────────────────────────────
// 1. 바디 (체성분) 패널
// ─────────────────────────────────────────────
function BodyPanel() {
  const [logs, setLogs] = useState([]);
  const [weightKg, setWeightKg] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [muscleKg, setMuscleKg] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const fetchLogs = () => {
    axios.get(`${API}/body`).then(res => setLogs(res.data)).catch(() => {});
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const save = async () => {
    if (!weightKg && !bodyFat && !muscleKg) return;
    setSaving(true);
    const p = new URLSearchParams();
    if (weightKg) p.append("weight_kg", weightKg);
    if (bodyFat) p.append("body_fat_pct", bodyFat);
    if (muscleKg) p.append("muscle_kg", muscleKg);
    if (memo) p.append("memo", memo);

    try {
      await axios.post(`${API}/body?${p.toString()}`);
      setDone(true);
      setWeightKg("");
      setBodyFat("");
      setMuscleKg("");
      setMemo("");
      fetchLogs();
      setTimeout(() => setDone(false), 1500);
    } catch {
      alert("바디 기록 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const deleteLog = async (id) => {
    if (!window.confirm("이 기록을 삭제할까요?")) return;
    try {
      await axios.delete(`${API}/body/${id}`);
      fetchLogs();
    } catch {
      alert("삭제 실패");
    }
  };

  // 차트 데이터 (오름차순)
  const chartData = [...logs]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(r => ({
      date: r.date.slice(5),
      fullDate: r.date,
      몸무게: r.weight_kg != null ? Number(r.weight_kg) : null,
      체지방률: r.body_fat_pct != null ? Number(r.body_fat_pct) : null,
      근육량: r.muscle_kg != null ? Number(r.muscle_kg) : null,
    }));

  return (
    <div>
      {/* 오늘 기록 입력 카드 */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <ScaleIcon size={18} color="var(--accent)" />
          <span style={{ fontSize: 16, fontWeight: "700" }}>오늘 기록</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--sub)", margin: "0 0 16px 0" }}>
          몸무게(kg) · 체지방(%) · 근육량(kg) · 메모(선택)를 기록합니다.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--sub)", marginBottom: 6, fontWeight: "600" }}>몸무게</label>
            <div style={{ position: "relative" }}>
              <input
                type="number"
                step="0.1"
                placeholder="75.0"
                value={weightKg}
                onChange={e => setWeightKg(e.target.value)}
                style={{ ...S.input, paddingRight: 36 }}
              />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--sub)" }}>kg</span>
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--sub)", marginBottom: 6, fontWeight: "600" }}>체지방</label>
            <div style={{ position: "relative" }}>
              <input
                type="number"
                step="0.1"
                placeholder="18.5"
                value={bodyFat}
                onChange={e => setBodyFat(e.target.value)}
                style={{ ...S.input, paddingRight: 36 }}
              />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--sub)" }}>%</span>
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--sub)", marginBottom: 6, fontWeight: "600" }}>근육량</label>
            <div style={{ position: "relative" }}>
              <input
                type="number"
                step="0.1"
                placeholder="35.0"
                value={muscleKg}
                onChange={e => setMuscleKg(e.target.value)}
                style={{ ...S.input, paddingRight: 36 }}
              />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--sub)" }}>kg</span>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--sub)", marginBottom: 6, fontWeight: "600" }}>메모 (선택)</label>
          <input
            placeholder="컨디션, 수분 섭취 등"
            value={memo}
            onChange={e => setMemo(e.target.value)}
            style={S.input}
          />
        </div>

        <button onClick={save} disabled={saving} style={{ ...S.btn(), width: "100%", padding: "12px" }}>
          {saving ? "저장 중..." : done ? "✅ 저장 완료!" : "💾 저장"}
        </button>
      </div>

      {logs.length > 0 && (
        <>
          {/* 몸무게 · 근육량 추이 */}
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={{ ...S.sectionTitle, margin: 0 }}>몸무게 · 근육량 추이</p>
              <span style={{ fontSize: 12, color: "var(--sub)" }}>단위: kg</span>
            </div>
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--sub)" }} />
                <YAxis unit="kg" domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "var(--sub)" }} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)" }}
                  formatter={(v, n) => [`${v}kg`, n]}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
                <Line type="monotone" dataKey="몸무게" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                {logs.some(r => r.muscle_kg) && (
                  <Line type="monotone" dataKey="근육량" stroke="var(--success)" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 체지방률 추이 */}
          {logs.some(r => r.body_fat_pct) && (
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <p style={{ ...S.sectionTitle, margin: 0 }}>체지방률 추이</p>
                <span style={{ fontSize: 12, color: "var(--sub)" }}>단위: %</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--sub)" }} />
                  <YAxis unit="%" domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "var(--sub)" }} />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)" }}
                    formatter={(v) => [`${v}%`, "체지방률"]}
                  />
                  <Line type="monotone" dataKey="체지방률" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 기록 목록 테이블 */}
          <div style={S.card}>
            <p style={S.sectionTitle}>기록 목록</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 420 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={{ ...S.th, width: 80 }}>날짜</th>
                    <th style={S.th}>몸무게</th>
                    <th style={S.th}>체지방</th>
                    <th style={S.th}>근육량</th>
                    <th style={S.th}>메모</th>
                    <th style={{ ...S.th, width: 44, textAlign: "center" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {[...logs].reverse().map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={S.td}>{r.date.slice(5)}</td>
                      <td style={{ ...S.td, fontWeight: "600" }}>{r.weight_kg ? `${r.weight_kg}kg` : "-"}</td>
                      <td style={S.td}>{r.body_fat_pct ? `${r.body_fat_pct}%` : "-"}</td>
                      <td style={S.td}>{r.muscle_kg ? `${r.muscle_kg}kg` : "-"}</td>
                      <td style={{ ...S.td, color: "var(--sub)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.memo || "-"}
                      </td>
                      <td style={{ ...S.td, textAlign: "center" }}>
                        <button
                          onClick={() => deleteLog(r.id)}
                          style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", padding: 4 }}
                          title="삭제"
                        >
                          <TrashIcon size={15} color="var(--sub)" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {logs.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--sub)", padding: "40px 0" }}>
          아직 바디 기록이 없어요! 오늘 수치를 기록해보세요.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 2. 유산소 (Cardio) 패널
// ─────────────────────────────────────────────
function CardioPanel() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    axios.get(`${API}/cardio`).then(res => setLogs(res.data)).catch(() => {});
  }, []);

  // 그래프용 데이터 (날짜 오름차순)
  const chartData = [...logs]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(r => ({
      date: r.date.slice(5),
      시간: r.duration_min != null ? Number(r.duration_min) : null,
      거리: r.distance_km != null ? Number(r.distance_km) : null,
      칼로리: r.kcal != null ? Number(r.kcal) : null,
    }));

  // 종목별 집계
  const byName = logs.reduce((acc, r) => {
    if (!acc[r.cardio_name]) acc[r.cardio_name] = { count: 0, totalMin: 0, totalKm: 0 };
    acc[r.cardio_name].count++;
    acc[r.cardio_name].totalMin += (r.duration_min || 0);
    acc[r.cardio_name].totalKm  += (r.distance_km  || 0);
    return acc;
  }, {});

  if (logs.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "var(--sub)", padding: "60px 0" }}>
        유산소 기록이 없어요.<br />기록 탭에서 추가해보세요!
      </div>
    );
  }

  return (
    <div>
      {/* 종목별 요약 카드 그리드 */}
      <div style={{ marginBottom: 20 }}>
        <p style={S.sectionTitle}>종목별 통계 요약</p>
        <div className="cardio-stat-grid">
          {Object.entries(byName).map(([name, stat]) => (
            <div key={name} style={{ ...S.card, margin: 0, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: "600", color: "var(--sub)", marginBottom: 8 }}>{name}</div>
              <div style={{ fontSize: 24, fontWeight: "800", color: "var(--text)", marginBottom: 6 }}>
                {stat.count}<span style={{ fontSize: 14, fontWeight: "600", color: "var(--sub)", marginLeft: 2 }}>회</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--sub)" }}>
                {stat.totalMin > 0 && `총 ${stat.totalMin}분 `}
                {stat.totalKm > 0 ? `${stat.totalKm.toFixed(1)}km` : stat.totalMin > 0 ? "거리 없음" : ""}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 운동 시간 & 거리 추이 (2 컬럼 그리드) */}
      <div className="cardio-chart-grid" style={{ marginBottom: 16 }}>
        {chartData.some(d => d.시간) && (
          <div style={{ ...S.card, margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={{ ...S.sectionTitle, margin: 0 }}>운동 시간 추이</p>
              <span style={{ fontSize: 12, color: "var(--sub)" }}>단위: 분</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--sub)" }} />
                <YAxis unit="분" tick={{ fontSize: 11, fill: "var(--sub)" }} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)" }} />
                <Line type="monotone" dataKey="시간" stroke="var(--success)" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {chartData.some(d => d.거리) && (
          <div style={{ ...S.card, margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={{ ...S.sectionTitle, margin: 0 }}>거리 추이</p>
              <span style={{ fontSize: 12, color: "var(--sub)" }}>단위: km</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--sub)" }} />
                <YAxis unit="km" tick={{ fontSize: 11, fill: "var(--sub)" }} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)" }} />
                <Line type="monotone" dataKey="거리" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 전체 기록 목록 */}
      <div style={S.card}>
        <p style={S.sectionTitle}>전체 기록</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 460 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ ...S.th, width: 80 }}>날짜</th>
                <th style={S.th}>종목</th>
                <th style={S.th}>시간</th>
                <th style={S.th}>거리</th>
                <th style={S.th}>칼로리</th>
              </tr>
            </thead>
            <tbody>
              {[...logs].reverse().map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={S.td}>{r.date.slice(5)}</td>
                  <td style={{ ...S.td, fontWeight: "600" }}>{r.cardio_name}</td>
                  <td style={S.td}>{r.duration_min ? `${r.duration_min}분` : "-"}</td>
                  <td style={S.td}>{r.distance_km ? `${r.distance_km}km` : "-"}</td>
                  <td style={{ ...S.td, color: "var(--sub)" }}>{r.kcal ? `${r.kcal}kcal` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 3. 식단 (Meal) 패널
// ─────────────────────────────────────────────
function MealPanel() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [meals, setMeals] = useState([]);
  const [mealType, setMealType] = useState("아침");
  const [foodName, setFoodName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carb, setCarb] = useState("");
  const [fat, setFat] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // 템플릿 모드
  const [templateView, setTemplateView] = useState(false);
  const [templateNames, setTemplateNames] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState("");
  const [newTmplName, setNewTmplName] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyDone, setApplyDone] = useState(false);
  const [intakes, setIntakes] = useState({});

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

  const fetchMeals = (d) => {
    axios.get(`${API}/meal?date_str=${d}`).then(res => setMeals(res.data)).catch(() => {});
  };

  const fetchTemplateNames = () => {
    axios.get(`${API}/meal-template-names`).then(res => {
      setTemplateNames(res.data);
      if (res.data.length > 0 && !templateName) setTemplateName(res.data[0].name);
    }).catch(() => {});
  };

  const fetchTemplates = () => {
    axios.get(`${API}/meal-templates`).then(res => setTemplates(res.data)).catch(() => {});
  };

  useEffect(() => {
    fetchMeals(date);
  }, [date]);

  useEffect(() => {
    fetchTemplateNames();
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mealIcon = (t) => t === "아침" ? "🌅" : t === "점심" ? "☀️" : t === "저녁" ? "🌙" : "🍎";
  const mealOrder = ["아침", "점심", "저녁", "간식"];

  // 오늘 식단 저장
  const save = async () => {
    if (!foodName) return;
    setSaving(true);
    const p = new URLSearchParams();
    p.append("meal_type", mealType);
    p.append("food_name", foodName);
    if (kcal) p.append("kcal", kcal);
    if (protein) p.append("protein", protein);
    if (carb) p.append("carb", carb);
    if (fat) p.append("fat", fat);
    if (memo) p.append("memo", memo);

    try {
      await axios.post(`${API}/meal?${p.toString()}`);
      setDone(true);
      setFoodName("");
      setKcal("");
      setProtein("");
      setCarb("");
      setFat("");
      setMemo("");
      fetchMeals(date);
      setTimeout(() => {
        setDone(false);
        setShowAddForm(false);
      }, 1200);
    } catch {
      alert("식단 저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const deleteMeal = async (id) => {
    if (!window.confirm("삭제할까요?")) return;
    try {
      await axios.delete(`${API}/meal/${id}`);
      fetchMeals(date);
    } catch {
      alert("삭제 실패");
    }
  };

  // 템플릿 관리
  const addTemplateName = async () => {
    if (!newTmplName.trim()) return;
    try {
      await axios.post(`${API}/meal-template-names`, { name: newTmplName.trim() });
      const added = newTmplName.trim();
      setNewTmplName("");
      await fetchTemplateNames();
      setTemplateName(added);
    } catch {
      alert("이미 존재하는 이름이에요!");
    }
  };

  const deleteTemplateName = async (id, name) => {
    if (!window.confirm(`"${name}" 템플릿과 모든 항목을 삭제할까요?`)) return;
    try {
      await axios.delete(`${API}/meal-template-names/${id}`);
      await fetchTemplateNames();
      await fetchTemplates();
      setTemplateName("");
    } catch {
      alert("삭제 실패");
    }
  };

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
    } catch {
      alert("템플릿 적용에 실패했습니다.");
    } finally {
      setApplying(false);
    }
  };

  const saveTmplItem = async () => {
    if (!tmplFoodName) return;
    setTmplSaving(true);
    try {
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
      setTmplDone(true);
      setTmplFoodName("");
      setTmplKcal("");
      setTmplProtein("");
      setTmplCarb("");
      setTmplFat("");
      setTmplMemo("");
      setTmplServingUnit("total");
      setTmplServingSize("");
      fetchTemplates();
      setTimeout(() => setTmplDone(false), 1500);
    } catch {
      alert("항목 추가 실패");
    } finally {
      setTmplSaving(false);
    }
  };

  const deleteTmpl = async (id) => {
    if (!window.confirm("삭제할까요?")) return;
    try {
      await axios.delete(`${API}/meal-templates/${id}`);
      fetchTemplates();
    } catch {
      alert("삭제 실패");
    }
  };

  const currentItems = templates.filter(t => t.template_name === templateName);
  const tmplGrouped = mealOrder.reduce((acc, type) => {
    acc[type] = currentItems.filter(t => t.meal_type === type);
    return acc;
  }, {});

  const grouped = mealOrder.reduce((acc, type) => {
    acc[type] = meals.filter(m => m.meal_type === type);
    return acc;
  }, {});

  const totals = meals.reduce((acc, m) => ({
    kcal: acc.kcal + (m.kcal || 0),
    protein: acc.protein + (m.protein || 0),
    carb: acc.carb + (m.carb || 0),
    fat: acc.fat + (m.fat || 0),
  }), { kcal: 0, protein: 0, carb: 0, fat: 0 });

  const calcNutrition = (item, intakeG) => {
    if (!intakeG || !item.kcal) return null;
    const g = parseFloat(intakeG);
    const base = item.serving_unit === "per100g" ? 100 : parseFloat(item.serving_size || 1);
    if (!base || base === 0) return null;
    const ratio = g / base;
    return {
      kcal: item.kcal ? Math.round(item.kcal * ratio) : null,
      protein: item.protein ? Math.round(item.protein * ratio * 10) / 10 : null,
      carb: item.carb ? Math.round(item.carb * ratio * 10) / 10 : null,
      fat: item.fat ? Math.round(item.fat * ratio * 10) / 10 : null,
    };
  };

  // 날짜 포맷 (예: 11월 4일 (수))
  const formatHeaderDate = (dStr) => {
    if (!dStr) return "";
    const parts = dStr.split("-");
    if (parts.length !== 3) return dStr;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
    return `${Number(parts[1])}월 ${Number(parts[2])}일 (${dayNames[d.getDay()]})`;
  };

  return (
    <div>
      {/* 서브 토글 (오늘 식단 vs 템플릿) & 날짜 선택 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "inline-flex", background: "var(--card)", borderRadius: "var(--radius-pill)", border: "1px solid var(--border)", padding: 3 }}>
          <button
            onClick={() => setTemplateView(false)}
            style={{
              ...(templateView ? S.btnGhost : S.btn()),
              border: "none",
              padding: "7px 18px",
              fontSize: "13px"
            }}
          >
            오늘 식단
          </button>
          <button
            onClick={() => setTemplateView(true)}
            style={{
              ...(templateView ? S.btn() : S.btnGhost),
              border: "none",
              padding: "7px 18px",
              fontSize: "13px"
            }}
          >
            템플릿
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--sub)", fontWeight: "600" }}>날짜</span>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ ...S.input, width: "auto", padding: "7px 12px", fontSize: 13 }}
          />
        </div>
      </div>

      {templateView ? (
        /* ── 템플릿 뷰 ── */
        <div>
          {/* 템플릿 이름 탭들 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            {templateNames.map(n => (
              <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button
                  onClick={() => setTemplateName(n.name)}
                  style={{
                    ...(templateName === n.name ? S.btn() : S.btnGhost),
                    padding: "7px 14px",
                    fontSize: 13
                  }}
                >
                  {n.name}
                </button>
                <button
                  onClick={() => deleteTemplateName(n.id, n.name)}
                  style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", padding: "4px" }}
                  title="삭제"
                >
                  <TrashIcon size={14} color="var(--sub)" />
                </button>
              </div>
            ))}
          </div>

          {/* 새 템플릿 이름 추가 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <input
              placeholder="새 식단 이름 (예: 대회준비, 린매스업)"
              value={newTmplName}
              onChange={e => setNewTmplName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addTemplateName()}
              style={{ ...S.input, flex: 1 }}
            />
            <button onClick={addTemplateName} style={S.btn("var(--accent2)")}>
              <PlusIcon size={16} /> 추가
            </button>
          </div>

          {templateName && (
            <>
              {/* 적용 버튼 */}
              <button
                onClick={() => applyTemplate(templateName)}
                disabled={applying || currentItems.length === 0}
                style={{
                  ...S.btn(currentItems.length === 0 ? "var(--sub)" : "var(--accent)"),
                  width: "100%",
                  marginBottom: 20,
                  padding: "12px"
                }}
              >
                {applying ? "적용 중..." : applyDone ? "✅ 적용 완료!" : `📅 ${date}에 "${templateName}" 적용`}
              </button>

              {/* 템플릿 항목 목록 */}
              {currentItems.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--sub)", padding: "30px 0" }}>
                  "{templateName}" 템플릿에 등록된 항목이 없어요.
                </div>
              ) : (
                mealOrder.map(type => tmplGrouped[type].length > 0 && (
                  <div key={type} style={{ marginBottom: 16 }}>
                    <p style={{ fontWeight: "700", color: "var(--text)", marginBottom: 8, fontSize: 14 }}>
                      {mealIcon(type)} {type}
                    </p>
                    <div style={S.card}>
                      {tmplGrouped[type].map((t, i) => {
                        const intakeG = intakes[t.id] || "";
                        const preview = intakeG ? calcNutrition(t, intakeG) : null;
                        const hasServing = t.serving_unit && (t.serving_size || t.serving_unit === "per100g");

                        return (
                          <div
                            key={t.id || i}
                            style={{
                              paddingBottom: i < tmplGrouped[type].length - 1 ? 12 : 0,
                              marginBottom: i < tmplGrouped[type].length - 1 ? 12 : 0,
                              borderBottom: i < tmplGrouped[type].length - 1 ? "1px solid var(--border)" : "none"
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: "600", color: "var(--text)", marginBottom: 4 }}>{t.food_name}</div>
                                <div style={{ fontSize: 13, color: "var(--sub)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                                  {t.kcal && <span>🔥 {t.kcal}kcal</span>}
                                  {t.protein && <span>💪 {t.protein}g</span>}
                                  {t.carb && <span>🍚 {t.carb}g</span>}
                                  {t.fat && <span>🥑 {t.fat}g</span>}
                                  {hasServing && (
                                    <span style={{ color: "var(--accent)" }}>
                                      ({t.serving_unit === "per100g" ? "100g당" : `${t.serving_size}g 기준`})
                                    </span>
                                  )}
                                </div>

                                {hasServing && (
                                  <div style={{ marginTop: 8 }}>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                      <input
                                        placeholder="섭취량 (g)"
                                        type="number"
                                        value={intakeG}
                                        onChange={e => setIntakes(p => ({ ...p, [t.id]: e.target.value }))}
                                        style={{ ...S.input, width: 110, padding: "6px 10px", fontSize: 13 }}
                                      />
                                      <span style={{ fontSize: 13, color: "var(--sub)" }}>g 섭취</span>
                                    </div>
                                    {preview && (
                                      <div style={{
                                        marginTop: 6, padding: "6px 10px", borderRadius: 8,
                                        background: "var(--input-bg)", fontSize: 12,
                                        display: "flex", gap: 10, flexWrap: "wrap", color: "var(--success)"
                                      }}>
                                        <span>→</span>
                                        {preview.kcal && <span>{preview.kcal}kcal</span>}
                                        {preview.protein && <span>단 {preview.protein}g</span>}
                                        {preview.carb && <span>탄 {preview.carb}g</span>}
                                        {preview.fat && <span>지 {preview.fat}g</span>}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => deleteTmpl(t.id)}
                                style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", padding: 4 }}
                              >
                                <TrashIcon size={15} color="var(--sub)" />
                              </button>
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
                <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  {mealOrder.map(t => (
                    <button
                      key={t}
                      onClick={() => setTmplMealType(t)}
                      style={{
                        ...(tmplMealType === t ? S.btn() : S.btnGhost),
                        padding: "6px 14px",
                        fontSize: 13
                      }}
                    >
                      {mealIcon(t)} {t}
                    </button>
                  ))}
                </div>

                <input
                  placeholder="음식 이름 *"
                  value={tmplFoodName}
                  onChange={e => setTmplFoodName(e.target.value)}
                  style={{ ...S.input, marginBottom: 8 }}
                />

                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <button
                    onClick={() => setTmplServingUnit("total")}
                    style={tmplServingUnit === "total" ? S.btn() : S.btnGhost}
                  >
                    총중량 기준
                  </button>
                  <button
                    onClick={() => setTmplServingUnit("per100g")}
                    style={tmplServingUnit === "per100g" ? S.btn() : S.btnGhost}
                  >
                    100g당 기준
                  </button>
                </div>

                {tmplServingUnit === "total" && (
                  <input
                    placeholder="기준 중량 (g) — 예: 580"
                    type="number"
                    value={tmplServingSize}
                    onChange={e => setTmplServingSize(e.target.value)}
                    style={{ ...S.input, marginBottom: 8 }}
                  />
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
                  <input placeholder="칼로리(kcal)" type="number" value={tmplKcal} onChange={e => setTmplKcal(e.target.value)} style={S.input} />
                  <input placeholder="단백질(g)" type="number" value={tmplProtein} onChange={e => setTmplProtein(e.target.value)} style={S.input} />
                  <input placeholder="탄수화물(g)" type="number" value={tmplCarb} onChange={e => setTmplCarb(e.target.value)} style={S.input} />
                  <input placeholder="지방(g)" type="number" value={tmplFat} onChange={e => setTmplFat(e.target.value)} style={S.input} />
                </div>

                <input
                  placeholder="메모 (선택)"
                  value={tmplMemo}
                  onChange={e => setTmplMemo(e.target.value)}
                  style={{ ...S.input, marginBottom: 12 }}
                />

                <button onClick={saveTmplItem} disabled={tmplSaving} style={{ ...S.btn("var(--accent2)"), width: "100%" }}>
                  {tmplSaving ? "저장 중..." : tmplDone ? "✅ 추가 완료!" : "➕ 항목 추가"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        /* ── 오늘 식단 뷰 ── */
        <div>
          {/* 요약 카드: 총합 + 음식 추가 버튼 */}
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: "700" }}>
                {formatHeaderDate(date)} 총합
              </div>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                style={{ ...S.btn(), padding: "7px 14px", fontSize: 13 }}
              >
                <PlusIcon size={14} /> 음식 추가
              </button>
            </div>

            {/* 4 매크로 그리드 */}
            <div className="macro-grid">
              <div style={{ background: "var(--card-subtle)", padding: "12px 8px", borderRadius: "var(--radius-inner)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 4 }}>칼로리</div>
                <div style={{ fontSize: 18, fontWeight: "800", color: "var(--text)" }}>
                  {totals.kcal} <span style={{ fontSize: 12, fontWeight: "normal", color: "var(--sub)" }}>kcal</span>
                </div>
              </div>
              <div style={{ background: "var(--card-subtle)", padding: "12px 8px", borderRadius: "var(--radius-inner)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 4 }}>단백질</div>
                <div style={{ fontSize: 18, fontWeight: "800", color: "var(--text)" }}>
                  {totals.protein.toFixed(1)} <span style={{ fontSize: 12, fontWeight: "normal", color: "var(--sub)" }}>g</span>
                </div>
              </div>
              <div style={{ background: "var(--card-subtle)", padding: "12px 8px", borderRadius: "var(--radius-inner)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 4 }}>탄수화물</div>
                <div style={{ fontSize: 18, fontWeight: "800", color: "var(--text)" }}>
                  {totals.carb.toFixed(1)} <span style={{ fontSize: 12, fontWeight: "normal", color: "var(--sub)" }}>g</span>
                </div>
              </div>
              <div style={{ background: "var(--card-subtle)", padding: "12px 8px", borderRadius: "var(--radius-inner)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 4 }}>지방</div>
                <div style={{ fontSize: 18, fontWeight: "800", color: "var(--text)" }}>
                  {totals.fat.toFixed(1)} <span style={{ fontSize: 12, fontWeight: "normal", color: "var(--sub)" }}>g</span>
                </div>
              </div>
            </div>
          </div>

          {/* 빠른 템플릿 적용 바 */}
          {templateNames.length > 0 && (
            <div style={{ ...S.card, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "12px 16px" }}>
              <span style={{ fontSize: 12, color: "var(--sub)", fontWeight: "600" }}>빠른 적용:</span>
              {templateNames.map(n => (
                <button
                  key={n.id}
                  onClick={() => applyTemplate(n.name)}
                  style={{ ...S.btnGhost, padding: "5px 12px", fontSize: 12 }}
                >
                  {applyDone ? "✅" : n.name}
                </button>
              ))}
            </div>
          )}

          {/* 음식 추가 폼 (토글) */}
          {showAddForm && (
            <div style={S.card}>
              <p style={S.sectionTitle}>📝 식단 입력</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                {mealOrder.map(t => (
                  <button
                    key={t}
                    onClick={() => setMealType(t)}
                    style={{
                      ...(mealType === t ? S.btn() : S.btnGhost),
                      padding: "6px 14px",
                      fontSize: 13
                    }}
                  >
                    {mealIcon(t)} {t}
                  </button>
                ))}
              </div>

              <input
                placeholder="음식 이름 *"
                value={foodName}
                onChange={e => setFoodName(e.target.value)}
                style={{ ...S.input, marginBottom: 8 }}
              />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
                <input placeholder="칼로리(kcal)" type="number" value={kcal} onChange={e => setKcal(e.target.value)} style={S.input} />
                <input placeholder="단백질(g)" type="number" value={protein} onChange={e => setProtein(e.target.value)} style={S.input} />
                <input placeholder="탄수화물(g)" type="number" value={carb} onChange={e => setCarb(e.target.value)} style={S.input} />
                <input placeholder="지방(g)" type="number" value={fat} onChange={e => setFat(e.target.value)} style={S.input} />
              </div>

              <input
                placeholder="메모 (선택)"
                value={memo}
                onChange={e => setMemo(e.target.value)}
                style={{ ...S.input, marginBottom: 12 }}
              />

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowAddForm(false)} style={{ ...S.btnGhost, flex: 1 }}>취소</button>
                <button onClick={save} disabled={saving} style={{ ...S.btn(), flex: 2 }}>
                  {saving ? "저장 중..." : done ? "✅ 저장 완료!" : "💾 저장"}
                </button>
              </div>
            </div>
          )}

          {/* 식단 목록 (아침, 점심, 저녁, 간식) */}
          {mealOrder.map(type => grouped[type].length > 0 && (
            <div key={type} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: "700", color: "var(--text)", fontSize: 14 }}>
                  {mealIcon(type)} {type}
                </span>
                <span style={{ fontSize: 12, color: "var(--sub)" }}>
                  {grouped[type].reduce((sum, m) => sum + (m.kcal || 0), 0)}kcal
                </span>
              </div>

              <div style={S.card}>
                {grouped[type].map((m, i) => (
                  <div
                    key={m.id || i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingBottom: i < grouped[type].length - 1 ? 12 : 0,
                      marginBottom: i < grouped[type].length - 1 ? 12 : 0,
                      borderBottom: i < grouped[type].length - 1 ? "1px solid var(--border)" : "none"
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: "600", color: "var(--text)", fontSize: 14 }}>{m.food_name}</div>
                      <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {m.kcal != null && <span>🔥 {m.kcal}kcal</span>}
                        {m.protein != null && <span>단 {m.protein}g</span>}
                        {m.carb != null && <span>탄 {m.carb}g</span>}
                        {m.fat != null && <span>지 {m.fat}g</span>}
                        {m.memo && <span>💬 {m.memo}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteMeal(m.id)}
                      style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", padding: 4 }}
                      title="삭제"
                    >
                      <TrashIcon size={15} color="var(--sub)" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {meals.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--sub)", padding: "40px 0" }}>
              이 날 등록된 식단 기록이 없어요! 음식 추가 버튼으로 기록해보세요.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 4. 루틴 (Routine) 패널
// ─────────────────────────────────────────────
function RoutinePanel() {
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
  const routineListRef = useRef(null);
  const touchDragState = useRef({ active: false, currentIndex: null });

  const fetchRoutines = () => {
    axios.get(`${API}/routines`).then((res) => setRoutines(res.data)).catch(() => {});
  };

  useEffect(() => {
    fetchRoutines();
    axios.get(`${API}/workout-names`).then((res) => setWorkoutNames(res.data)).catch(() => {});
  }, []);

  const handleExNameChange = (val, setter) => {
    setter(val);
    if (val.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const filtered = workoutNames
      .filter((n) =>
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
    try {
      await axios.put(`${API}/routines/reorder`, {
        order: routines.map((r) => r.id),
      });
    } catch {}
  };

  // 모바일 터치 드래그
  const handleTouchStart = (e, idx) => {
    e.stopPropagation();
    touchDragState.current = { active: true, currentIndex: idx };
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
    touchDragState.current = { active: false, currentIndex: null };
    setDraggingIdx(null);
    try {
      await axios.put(`${API}/routines/reorder`, {
        order: routines.map((r) => r.id),
      });
    } catch {}
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
    try {
      await axios.post(`${API}/routines`, { name, exercises });
      setDone(true);
      setName("");
      setExercises([]);
      fetchRoutines();
      setTimeout(() => setDone(false), 1500);
    } catch {
      alert("루틴 저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const deleteRoutine = async (id) => {
    if (!window.confirm("정말 이 루틴을 삭제할까요?")) return;
    try {
      await axios.delete(`${API}/routines/${id}`);
      fetchRoutines();
    } catch {
      alert("삭제 실패");
    }
  };

  const startEdit = (r) => {
    setEditingId(r.id);
    setEditData({
      name: r.name,
      exercises: JSON.parse(JSON.stringify(r.exercises || [])),
    });
    setExpanded(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData(null);
  };

  const saveEdit = async () => {
    try {
      await axios.put(`${API}/routines/${editingId}`, editData);
      setEditingId(null);
      setEditData(null);
      setHistory((p) => {
        const n = { ...p };
        delete n[editingId];
        return n;
      });
      fetchRoutines();
    } catch {
      alert("수정 저장 실패");
    }
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
    const h = hist.find((item) => item.workout_name === ex.workout_name);
    if (!h || h.status === "nodata" || h.status === "invalid" || !h.display) return null;

    const { display, last_date } = h;

    if (display.type === "average") {
      return (
        <div style={{ marginTop: 6, padding: "8px 12px", borderRadius: 8, background: "var(--input-bg)", fontSize: 12 }}>
          <span style={{ color: "var(--sub)" }}>이전 평균: </span>
          <span style={{ color: "var(--success)", fontWeight: 700 }}>
            {display.avg_weight}kg × {display.avg_reps}회
          </span>
          <span style={{ color: "var(--sub)" }}> ({display.sets}세트, {last_date})</span>
        </div>
      );
    }

    if (display.type === "sets") {
      return (
        <div style={{ marginTop: 6, padding: "8px 12px", borderRadius: 8, background: "var(--input-bg)", fontSize: 12 }}>
          <span style={{ color: "var(--sub)" }}>이전 기록: </span>
          <span style={{ color: "var(--accent)", fontWeight: 700 }}>
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
      {/* 새 루틴 만들기 카드 */}
      <div style={S.card}>
        <p style={S.sectionTitle}>새 루틴 만들기</p>

        <input
          placeholder="예: 상체 A, 하체 볼륨데이"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ ...S.input, marginBottom: 12 }}
        />

        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", position: "relative" }}>
          <div style={{ flex: 2, minWidth: 120, position: "relative" }}>
            <input
              placeholder="운동명"
              value={exName}
              onChange={(e) => handleExNameChange(e.target.value, setExName)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              style={S.input}
            />
            {showSuggestions && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                background: "var(--card)", border: "1px solid var(--border)",
                borderRadius: 10, marginTop: 4, overflow: "hidden",
                boxShadow: "0 4px 12px rgba(0,0,0,.15)"
              }}>
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
                      fontSize: 13,
                      color: "var(--text)",
                      borderBottom: i !== suggestions.length - 1 ? "1px solid var(--border)" : "none"
                    }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>

          <input placeholder="세트" value={exSets} onChange={(e) => setExSets(e.target.value)} style={{ ...S.input, flex: 1, minWidth: 50 }} />
          <input placeholder="횟수" value={exReps} onChange={(e) => setExReps(e.target.value)} style={{ ...S.input, flex: 1, minWidth: 50 }} />
          <input placeholder="RIR" value={exRir} onChange={(e) => setExRir(e.target.value)} style={{ ...S.input, flex: 1, minWidth: 50 }} />
          <input placeholder="휴식" value={exRest} onChange={(e) => setExRest(e.target.value)} style={{ ...S.input, flex: 1, minWidth: 50 }} />

          <button onClick={addExercise} style={{ ...S.btn("var(--accent2)"), whiteSpace: "nowrap" }}>
            <PlusIcon size={15} /> 추가
          </button>
        </div>

        {exercises.length > 0 && (
          <div style={{ overflowX: "auto", marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 320 }}>
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
                        style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer" }}
                      >
                        <TrashIcon size={14} color="var(--sub)" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button onClick={saveRoutine} disabled={saving || !name || exercises.length === 0} style={{ ...S.btn(), width: "100%", padding: "12px" }}>
          {saving ? "저장 중..." : done ? "✅ 루틴 저장 완료!" : "+ 루틴 추가"}
        </button>
      </div>

      {/* 내 루틴 목록 */}
      <div style={{ marginBottom: 16 }}>
        <p style={S.sectionTitle}>내 루틴 ({routines.length})</p>

        {routines.length === 0 && (
          <div style={{ color: "var(--sub)", textAlign: "center", padding: "30px 0" }}>
            저장된 루틴이 아직 없어요. 위에서 새 루틴을 만들어보세요!
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
                marginBottom: 12,
                boxShadow: draggingIdx === idx ? "0 8px 24px rgba(0,0,0,.25)" : "none",
                transition: "box-shadow 0.15s",
              }}
            >
              {editingId === r.id && editData ? (
                <div>
                  <p style={{ ...S.sectionTitle, marginBottom: 12 }}>✏️ 루틴 수정</p>
                  <input
                    value={editData.name}
                    onChange={(e) => setEditData((p) => ({ ...p, name: e.target.value }))}
                    style={{ ...S.input, marginBottom: 12, fontWeight: "700" }}
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
                          style={{ ...S.input, flex: 1, fontSize: 13 }}
                          placeholder="운동명"
                        />
                        <button
                          onClick={() => moveEx(i, -1)}
                          disabled={i === 0}
                          style={{ ...S.btnGhost, padding: "6px 10px", fontSize: 12, opacity: i === 0 ? 0.3 : 1 }}
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveEx(i, 1)}
                          disabled={i === editData.exercises.length - 1}
                          style={{ ...S.btnGhost, padding: "6px 10px", fontSize: 12, opacity: i === editData.exercises.length - 1 ? 0.3 : 1 }}
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removeEx(i)}
                          style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", padding: 4 }}
                        >
                          <TrashIcon size={15} color="var(--sub)" />
                        </button>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                        {[
                          ["sets", "세트"],
                          ["reps", "횟수"],
                          ["rir", "RIR"],
                          ["rest", "휴식"],
                        ].map(([field, placeholder]) => (
                          <input
                            key={field}
                            value={ex[field] || ""}
                            onChange={(e) => updateEx(i, field, e.target.value)}
                            placeholder={placeholder}
                            style={{ ...S.input, fontSize: 12, padding: "6px 8px" }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={addExToEdit}
                    style={{ ...S.btnGhost, width: "100%", marginBottom: 12 }}
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, gap: 8 }}>
                      <span
                        onTouchStart={(e) => handleTouchStart(e, idx)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        style={{
                          color: "var(--sub)",
                          cursor: "grab",
                          touchAction: "none",
                          userSelect: "none",
                          flexShrink: 0,
                          padding: "4px"
                        }}
                      >
                        <GripVerticalIcon size={18} color="var(--sub)" />
                      </span>

                      <div
                        onClick={() => toggleExpand(r.id)}
                        style={{ cursor: "pointer", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {expanded === r.id ? (
                            <ChevronDownIcon size={16} color="var(--accent)" />
                          ) : (
                            <ChevronRightIcon size={16} color="var(--sub)" />
                          )}
                          <span style={{ fontWeight: "700", fontSize: 15, color: "var(--text)" }}>
                            {r.name}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--sub)", marginLeft: 22 }}>
                          {r.exercises ? `${r.exercises.length}개 운동` : "운동 없음"}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                      <button
                        onClick={() => startEdit(r)}
                        style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", padding: "6px" }}
                        title="수정"
                      >
                        <EditIcon size={16} color="var(--sub)" />
                      </button>
                      <button
                        onClick={() => deleteRoutine(r.id)}
                        style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", padding: "6px" }}
                        title="삭제"
                      >
                        <TrashIcon size={16} color="var(--sub)" />
                      </button>
                    </div>
                  </div>

                  {expanded === r.id && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                      {loadingHistory[r.id] ? (
                        <div style={{ color: "var(--sub)", fontSize: 13 }}>불러오는 중...</div>
                      ) : (
                        r.exercises?.map((ex, i) => (
                          <div
                            key={i}
                            style={{
                              marginBottom: 10,
                              paddingBottom: 10,
                              borderBottom: i !== r.exercises.length - 1 ? "1px solid var(--border)" : "none",
                            }}
                          >
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <span style={{ fontWeight: "600", fontSize: 14, color: "var(--text)", minWidth: 90 }}>
                                {ex.workout_name}
                              </span>
                              <span style={{ color: "var(--sub)", fontSize: 13 }}>{ex.sets}세트</span>
                              <span style={{ color: "var(--sub)", fontSize: 13 }}>{ex.reps}회</span>
                              <span style={{ color: "var(--sub)", fontSize: 13 }}>RIR {ex.rir || "-"}</span>
                              <span style={{ color: "var(--sub)", fontSize: 13 }}>휴식 {ex.rest || "-"}</span>
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
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 5. AI (Coaching) 패널
// ─────────────────────────────────────────────
function AiPanel() {
  const [goals, setGoals] = useState({ goal_weight: "", goal_body_fat: "", goal_muscle: "", ai_memo: "" });
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    axios.get(`${API}/goals`).then((res) => {
      setGoals({
        goal_weight: res.data.goal_weight || "",
        goal_body_fat: res.data.goal_body_fat || "",
        goal_muscle: res.data.goal_muscle || "",
        ai_memo: res.data.ai_memo || "",
      });
    }).catch(() => {});

    axios.get(`${API}/ai/recommend`).then((res) => {
      if (res.data.result) {
        setResult(res.data.result);
        setUpdatedAt(res.data.updated_at);
      }
    }).catch(() => {});
  }, []);

  const saveGoals = async () => {
    setSaving(true);
    try {
      await axios.post(`${API}/goals`, goals);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      alert("목표 저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const getRecommendation = async () => {
    setLoading(true);
    setResult("");
    try {
      const res = await axios.post(`${API}/ai/recommend`);
      setResult(res.data.result);
      setUpdatedAt(res.data.updated_at);
    } catch {
      setResult("AI 추천을 받아오는 데 실패했어요.");
    } finally {
      setLoading(false);
    }
  };

  const formatResult = (text) =>
    text.split("\n").map((line, i) => {
      const bold = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      return (
        <p
          key={i}
          dangerouslySetInnerHTML={{ __html: bold }}
          style={{ margin: "4px 0", lineHeight: 1.7, fontSize: "14px" }}
        />
      );
    });

  return (
    <div>
      {/* 목표 신체 수치 카드 */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 16 }}>🎯</span>
          <span style={{ fontSize: 16, fontWeight: "700" }}>목표 신체 수치</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--sub)", margin: "0 0 16px 0" }}>
          목표는 AI 조언 생성 시 참고 자료로 사용됩니다. 입력하지 않은 항목은 비워 둘 수 있습니다.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--sub)", marginBottom: 6, fontWeight: "600" }}>목표 체중</label>
            <div style={{ position: "relative" }}>
              <input
                type="number"
                step="0.1"
                placeholder="72.0"
                value={goals.goal_weight}
                onChange={(e) => setGoals((p) => ({ ...p, goal_weight: e.target.value }))}
                style={{ ...S.input, paddingRight: 36 }}
              />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--sub)" }}>kg</span>
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--sub)", marginBottom: 6, fontWeight: "600" }}>목표 체지방</label>
            <div style={{ position: "relative" }}>
              <input
                type="number"
                step="0.1"
                placeholder="15.0"
                value={goals.goal_body_fat}
                onChange={(e) => setGoals((p) => ({ ...p, goal_body_fat: e.target.value }))}
                style={{ ...S.input, paddingRight: 36 }}
              />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--sub)" }}>%</span>
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--sub)", marginBottom: 6, fontWeight: "600" }}>목표 골격근</label>
            <div style={{ position: "relative" }}>
              <input
                type="number"
                step="0.1"
                placeholder="37.0"
                value={goals.goal_muscle}
                onChange={(e) => setGoals((p) => ({ ...p, goal_muscle: e.target.value }))}
                style={{ ...S.input, paddingRight: 36 }}
              />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--sub)" }}>kg</span>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--sub)", marginBottom: 6, fontWeight: "600" }}>메모 (선택)</label>
          <textarea
            placeholder="12월까지 체지방 15% 목표, 운동 방식, 식단 특이사항 등"
            value={goals.ai_memo}
            onChange={(e) => setGoals((p) => ({ ...p, ai_memo: e.target.value }))}
            style={{ ...S.input, height: 80, resize: "vertical" }}
          />
        </div>

        <button onClick={saveGoals} disabled={saving} style={{ ...S.btn(), width: "100%", padding: "12px" }}>
          {saving ? "저장 중..." : saved ? "✅ 목표 저장 완료!" : "💾 목표 저장"}
        </button>
      </div>

      {/* AI 피트니스 조언 카드 */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <SparklesIcon size={18} color="var(--accent)" />
          <span style={{ fontSize: 16, fontWeight: "700" }}>AI 피트니스 조언</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--sub)", margin: "0 0 16px 0" }}>
          기존 Gemini 리포트 생성 API를 사용합니다. 생성에는 10~20초 정도 걸릴 수 있습니다.
        </p>

        <button
          onClick={getRecommendation}
          disabled={loading}
          style={{
            ...S.btn(loading ? "var(--sub)" : "var(--accent)"),
            width: "100%",
            padding: "12px",
            marginBottom: result ? 16 : 0
          }}
        >
          {loading ? "⏳ 분석 중... (10~20초)" : "✨ AI 분석 생성"}
        </button>

        {result && (
          <div style={{ background: "var(--card-subtle)", borderRadius: "var(--radius-inner)", padding: 16, border: "1px solid var(--border)", marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: "700", fontSize: 14 }}>
                <ClockIcon size={15} color="var(--accent)" />
                <span>분석 일시</span>
              </div>
              {updatedAt && (
                <span style={{ fontSize: 12, color: "var(--sub)" }}>
                  {updatedAt.slice(0, 16).replace("T", " ")}
                </span>
              )}
            </div>
            <div style={{ color: "var(--text)" }}>{formatResult(result)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 메인 HealthScreen 컨테이너
// ─────────────────────────────────────────────
export default function HealthScreen({ initialSubtab = "body" }) {
  const [subTab, setSubTab] = useState(initialSubtab);

  const subTabs = [
    { id: "body", label: "바디", icon: ScaleIcon },
    { id: "cardio", label: "유산소", icon: RunnerIcon },
    { id: "meal", label: "식단", icon: UtensilsIcon },
    { id: "routine", label: "루틴", icon: ClipboardListIcon },
    { id: "ai", label: "AI", icon: SparklesIcon },
  ];

  return (
    <div>
      {/* 탭 헤더 영역 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--accent-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent)"
          }}>
            <HealthIcon size={20} color="var(--accent)" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: "800", margin: 0, color: "var(--text)" }}>
            건강
          </h1>
        </div>
        <p style={{ fontSize: 13, color: "var(--sub)", margin: 0 }}>
          체성분·유산소·식단·루틴·AI 조언을 기존 기록 기준으로 관리합니다.
        </p>
      </div>

      {/* 서브탭 네비게이션 */}
      <div className="health-subtab-nav" style={{ marginBottom: 20 }}>
        {subTabs.map((t) => {
          const IconComponent = t.icon;
          const isActive = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`health-subtab-btn ${isActive ? "active" : ""}`}
            >
              <IconComponent size={16} color={isActive ? "#ffffff" : "currentColor"} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* 서브탭 컨텐츠 */}
      {subTab === "body" && <BodyPanel />}
      {subTab === "cardio" && <CardioPanel />}
      {subTab === "meal" && <MealPanel />}
      {subTab === "routine" && <RoutinePanel />}
      {subTab === "ai" && <AiPanel />}
    </div>
  );
}
