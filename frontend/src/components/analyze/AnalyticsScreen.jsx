import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
import {
  AnalyzeIcon,
  TrophyIcon,
  TrendingUpIcon,
  AlertTriangleIcon,
  BoltIcon
} from "../common/Icons";

const API = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

// 카테고리 정의 (기존 TrendsTab과 100% 동일한 분류 보존)
const CATEGORIES = {
  "전체": null,
  "등":   ["랫풀다운", "시티드 로우", "티바로우", "원암 기구 로우", "원암 덤벨로우", "데드리프트", "컨벤셔널 데드리프트", "어시스트 풀업", "바벨로우", "암풀다운"],
  "가슴": [
    "바벨 벤치프레스", 
    "스미스 머신 벤치프레스", 
    "인클라인 벤치프레스", 
    "인클라인 덤벨프레스", 
    "체스트 프레스", 
    "펙 덱 플라이",
    "케이블 크로스오버",
    "덤벨 업워드 플라이",
    "덤벨 벤치프레스",   
    "디클라인 프레스"    
  ],
  "어깨": ["오버헤드 프레스", "머신 숄더 프레스", "덤벨 숄더 프레스", "덤벨 사이드 레터럴 레이즈", "리어델트 플라이", "리버스 펙 덱 플라이", "페이스풀"],
  "하체": ["스쿼트", "레그프레스", "힙 어덕션", "힙 어브덕션", "레그컬", "레그 익스텐션", "힙쓰러스트", "루마니안 데드리프트"],
  "팔":   ["이지바/덤벨 컬", "바벨컬", "덤벨컬", "해머컬", "케이블 트라이셉스 푸시다운", "라잉트라이셉스 익스텐션"],
};

const CHART_COLORS = [
  "var(--accent)", "#3b82f6", "var(--success)", "#ec4899",
  "#a855f7", "#06b6d4", "#f59e0b", "#84cc16", "#f97316", "#64748b"
];

// ─────────────────────────────────────────────
// 1. 볼륨 서브탭 (VolumePanel)
// ─────────────────────────────────────────────
function VolumePanel() {
  const [volume, setVolume] = useState([]);
  const [period, setPeriod] = useState("10"); // 기본값 10세션
  const [labels, setLabels] = useState({ cur: "최근 10일", prev: "이전 10일" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios
      .get(`${API}/volume?sessions=${period}`)
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : [];
        if (data.length > 0) {
          setLabels({ cur: data[0].cur_label, prev: data[0].prev_label });
        }
        setVolume(data);
      })
      .catch((err) => {
        console.warn("볼륨 데이터 조회 실패:", err);
      })
      .finally(() => setLoading(false));
  }, [period]);

  // 총 볼륨 및 증감률 합산 계산 (중복 집계 없는 category별 합산)
  const totalCurVolume = volume.reduce((sum, item) => sum + (Number(item[labels.cur]) || 0), 0);
  const totalPrevVolume = volume.reduce((sum, item) => sum + (Number(item[labels.prev]) || 0), 0);

  // 이전 값이 0이거나 없을 경우 비교 불가 처리 (무한대/0% 왜곡 방지)
  const hasPrevData = totalPrevVolume > 0;
  const volumeDiff = totalCurVolume - totalPrevVolume;
  const volumeDiffPct = hasPrevData
    ? ((volumeDiff / totalPrevVolume) * 100).toFixed(1)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 기간 세그먼트 (5세션, 10세션, 20세션) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { val: "5",  label: "5세션" },
            { val: "10", label: "10세션" },
            { val: "20", label: "20세션" }
          ].map((p) => (
            <button
              key={p.val}
              type="button"
              className={`record-chip ${period === p.val ? "active" : ""}`}
              onClick={() => setPeriod(p.val)}
              style={{ padding: "7px 14px", fontSize: 13 }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <span style={{ fontSize: 12, color: "var(--sub)" }}>
          {labels.cur} vs {labels.prev}
        </span>
      </div>

      {/* 상단 요약 카드 3종 */}
      <div className="analyze-stat-grid">
        <div className="ui-card" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: "var(--sub)" }}>{labels.cur} 총 볼륨</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", marginTop: 4 }}>
            {totalCurVolume.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 500 }}>kg</span>
          </div>
        </div>

        <div className="ui-card" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: "var(--sub)" }}>{labels.prev} 총 볼륨</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--sub)", marginTop: 4 }}>
            {totalPrevVolume.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 500 }}>kg</span>
          </div>
        </div>

        <div className="ui-card" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: "var(--sub)" }}>구간 대비 증감</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>
            {hasPrevData ? (
              <span style={{ color: volumeDiff >= 0 ? "var(--success)" : "var(--danger)" }}>
                {volumeDiff >= 0 ? `+${volumeDiffPct}%` : `${volumeDiffPct}%`}
              </span>
            ) : (
              <span style={{ fontSize: 14, color: "var(--sub)", fontWeight: 600 }}>비교 데이터 없음</span>
            )}
          </div>
        </div>
      </div>

      {/* 부위별 볼륨 비교 바 차트 */}
      <div className="ui-card" style={{ padding: "20px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
            부위별 볼륨 비교
          </span>
          <span style={{ fontSize: 12, color: "var(--sub)" }}>단위: kg</span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--sub)", fontSize: 13 }}>
            볼륨 분석 데이터를 불러오는 중...
          </div>
        ) : volume.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--sub)", fontSize: 13 }}>
            기록된 볼륨 데이터가 없습니다.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={volume} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 12, fill: "var(--sub)" }} tickLine={false} />
              <YAxis unit="kg" tick={{ fontSize: 11, fill: "var(--sub)" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                  borderRadius: "var(--radius-inner)",
                  color: "var(--text)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
                }}
                formatter={(v) => [`${Number(v).toLocaleString()} kg`]}
              />
              <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} />
              <Bar dataKey={labels.prev} fill="var(--border)" radius={[4, 4, 0, 0]} name={labels.prev} />
              <Bar dataKey={labels.cur} fill="var(--accent)" radius={[4, 4, 0, 0]} name={labels.cur} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 부위별 상세 수치 카드 목록 */}
      {!loading && volume.length > 0 && (
        <div className="ui-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
            부위별 세부 현황
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {volume.map((item) => {
              const curVal = Number(item[labels.cur]) || 0;
              const prevVal = Number(item[labels.prev]) || 0;
              const diff = curVal - prevVal;
              const pct = prevVal > 0 ? ((diff / prevVal) * 100).toFixed(1) : null;

              return (
                <div
                  key={item.category}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    backgroundColor: "var(--card-subtle)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-inner)"
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                    {item.category}
                  </span>

                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ textAlign: "right", fontSize: 12 }}>
                      <div style={{ color: "var(--text)", fontWeight: 700 }}>
                        {curVal.toLocaleString()} kg
                      </div>
                      <div style={{ color: "var(--sub)" }}>
                        이전 {prevVal.toLocaleString()} kg
                      </div>
                    </div>

                    <div style={{ minWidth: 70, textAlign: "right" }}>
                      {pct !== null ? (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: diff >= 0 ? "var(--success)" : "var(--danger)"
                          }}
                        >
                          {diff >= 0 ? `+${pct}%` : `${pct}%`}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--sub)" }}>-</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 2. 1RM 서브탭 (OneRmPanel)
// ─────────────────────────────────────────────
function OneRmPanel() {
  const [oneRM, setOneRM] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios
      .get(`${API}/1rm`)
      .then((res) => {
        setOneRM(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        console.warn("1RM 데이터 조회 실패:", err);
      })
      .finally(() => setLoading(false));
  }, []);

  // 기존 기준 보존: 1RM 내림차순 정렬
  const sortedList = [...oneRM].sort((a, b) => (Number(b["1rm"]) || 0) - (Number(a["1rm"]) || 0));
  const topOne = sortedList.length > 0 ? sortedList[0] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 최고 기록 하이라이트 배너 카드 (Top 1) */}
      {topOne && (
        <div
          className="ui-card"
          style={{
            padding: "20px",
            background: "linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, var(--card) 100%)",
            border: "1px solid var(--accent)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent)", fontWeight: 700, fontSize: 13 }}>
              <TrophyIcon size={18} />
              <span>최고 추정 1RM 하이라이트</span>
            </div>
            <span style={{ fontSize: 12, color: "var(--sub)" }}>달성일: {String(topOne.date).slice(0, 10)}</span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)" }}>
                {topOne.workout_name}
              </div>
              <div style={{ fontSize: 13, color: "var(--sub)", marginTop: 4 }}>
                실제 기록: {topOne.weight_kg}kg × {topOne.reps}회
              </div>
            </div>

            <div style={{ fontSize: 32, fontWeight: 900, color: "var(--accent)" }}>
              {topOne["1rm"]} <span style={{ fontSize: 16, fontWeight: 600 }}>kg</span>
            </div>
          </div>
        </div>
      )}

      {/* 1RM 순위 테이블 카드 */}
      <div className="ui-card" style={{ padding: "18px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
            종목별 1RM 순위
          </span>
          <span style={{ fontSize: 12, color: "var(--sub)" }}>총 {sortedList.length}개 종목</span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--sub)", fontSize: 13 }}>
            1RM 순위를 불러오는 중...
          </div>
        ) : sortedList.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--sub)", fontSize: 13 }}>
            기록된 1RM 데이터가 없습니다.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--sub)", fontSize: 12, textAlign: "left" }}>
                  <th style={{ padding: "8px 6px", width: 44, textAlign: "center" }}>순위</th>
                  <th style={{ padding: "8px 10px" }}>종목명</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>추정 1RM</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>달성 기록</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>달성일</th>
                </tr>
              </thead>
              <tbody>
                {sortedList.map((row, i) => (
                  <tr
                    key={row.workout_name}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      transition: "background-color 0.15s"
                    }}
                  >
                    <td style={{ padding: "12px 6px", textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 22,
                          height: 22,
                          borderRadius: "var(--radius-pill)",
                          backgroundColor: i === 0 ? "var(--accent)" : "var(--card-subtle)",
                          color: i === 0 ? "#ffffff" : "var(--sub)",
                          fontSize: 11,
                          fontWeight: 700
                        }}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td style={{ padding: "12px 10px", fontWeight: 700, color: "var(--text)" }}>
                      {row.workout_name}
                    </td>
                    <td style={{ padding: "12px 10px", textAlign: "right", fontWeight: 800, color: "var(--accent)" }}>
                      {row["1rm"]} kg
                    </td>
                    <td style={{ padding: "12px 10px", textAlign: "right", color: "var(--sub)", fontSize: 13 }}>
                      {row.weight_kg}kg × {row.reps}회
                    </td>
                    <td style={{ padding: "12px 10px", textAlign: "right", color: "var(--sub)", fontSize: 12 }}>
                      {String(row.date).slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 3. 추세 서브탭 (TrendsPanel)
// ─────────────────────────────────────────────
function TrendsPanel() {
  const [allData, setAllData] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [detailData, setDetailData] = useState([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("전체");

  const fetchAll = async (d) => {
    setLoading(true);
    setSelectedWorkout(null);
    setDetailData([]);
    try {
      const res = await axios.get(`${API}/trends?days=${d}`);
      setAllData(res.data);
    } catch (err) {
      console.warn("추세 데이터 조회 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (workout) => {
    setSelectedWorkout(workout);
    try {
      const res = await axios.get(`${API}/trends?workout_name=${encodeURIComponent(workout)}&days=${days}`);
      setDetailData(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.warn("상세 추세 조회 실패:", err);
    }
  };

  useEffect(() => {
    fetchAll(days);
  }, [days]);

  // 카테고리 필터링 적용 (기존 로직 보존)
  const filteredWorkouts = allData && allData.workouts
    ? category === "전체"
      ? allData.workouts
      : allData.workouts.filter((w) => CATEGORIES[category]?.includes(w))
    : [];

  // 안전한 로컬 타임존 날짜 파싱 헬퍼 (밀림 방지)
  const parseLocalDateToTimestamp = (dateStr) => {
    if (!dateStr) return 0;
    const parts = String(dateStr).split("-").map(Number);
    if (parts.length === 3) {
      return new Date(parts[0], parts[1] - 1, parts[2]).getTime();
    }
    return new Date(dateStr).getTime();
  };

  // 안정적인 Y축 범위 계산 (최소 15kg 폭 확보 및 적응형 패딩으로 과장 방지)
  const calculateYDomain = (minVal, maxVal, minSpan = 15) => {
    if (!isFinite(minVal) || !isFinite(maxVal)) return [0, 100];
    const span = maxVal - minVal;
    if (span < minSpan) {
      const mid = (minVal + maxVal) / 2;
      const half = minSpan / 2;
      const low = Math.max(0, Math.floor((mid - half) / 5) * 5);
      const high = Math.ceil((mid + half) / 5) * 5;
      return [low, high];
    }
    const pad = Math.max(span * 0.12, 5);
    const low = Math.max(0, Math.floor((minVal - pad) / 5) * 5);
    const high = Math.ceil((maxVal + pad) / 5) * 5;
    return [low, high];
  };

  // 전체 추세 멀티라인 차트용 날짜별 맵 결합 (실제 관측치 보존)
  const mergedMap = {};
  if (allData && Array.isArray(allData.data)) {
    allData.data.forEach((d) => {
      const date = d.date;
      if (!mergedMap[date]) {
        mergedMap[date] = { date, timestamp: parseLocalDateToTimestamp(date) };
      }
      mergedMap[date][d.workout_name] = d.est_1rm;
    });
  }
  const mergedData = Object.values(mergedMap).sort((a, b) => a.timestamp - b.timestamp);

  const activeWorkouts = filteredWorkouts.slice(0, 8);

  // 멀티라인 Y축 범위 계산
  let trendMinY = Infinity;
  let trendMaxY = -Infinity;
  mergedData.forEach((row) => {
    activeWorkouts.forEach((w) => {
      const val = row[w];
      if (typeof val === "number" && !isNaN(val)) {
        if (val < trendMinY) trendMinY = val;
        if (val > trendMaxY) trendMaxY = val;
      }
    });
  });
  const trendYDomain = calculateYDomain(trendMinY, trendMaxY, 15);

  // 멀티라인 X축 시간 범위 계산 (1개 지점 예외 방어)
  let trendXDomain = ["dataMin", "dataMax"];
  if (mergedData.length === 1) {
    const ts = mergedData[0].timestamp;
    trendXDomain = [ts - 86400000, ts + 86400000];
  } else if (mergedData.length > 1) {
    const minTs = mergedData[0].timestamp;
    const maxTs = mergedData[mergedData.length - 1].timestamp;
    const pad = Math.max((maxTs - minTs) * 0.05, 86400000);
    trendXDomain = [minTs - pad, maxTs + pad];
  }

  // 상세 기록 정렬 및 타임스탬프 계산
  const sortedDetail = [...detailData]
    .map((item) => ({
      ...item,
      timestamp: parseLocalDateToTimestamp(item.date)
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  // 상세 차트 Y축 범위 계산
  let detailMinY = Infinity;
  let detailMaxY = -Infinity;
  sortedDetail.forEach((row) => {
    if (typeof row.est_1rm === "number" && !isNaN(row.est_1rm)) {
      if (row.est_1rm < detailMinY) detailMinY = row.est_1rm;
      if (row.est_1rm > detailMaxY) detailMaxY = row.est_1rm;
    }
    if (typeof row.weight_kg === "number" && !isNaN(row.weight_kg)) {
      if (row.weight_kg < detailMinY) detailMinY = row.weight_kg;
      if (row.weight_kg > detailMaxY) detailMaxY = row.weight_kg;
    }
  });
  const detailYDomain = calculateYDomain(detailMinY, detailMaxY, 15);

  // 상세 차트 X축 시간 범위 계산
  let detailXDomain = ["dataMin", "dataMax"];
  if (sortedDetail.length === 1) {
    const ts = sortedDetail[0].timestamp;
    detailXDomain = [ts - 86400000, ts + 86400000];
  } else if (sortedDetail.length > 1) {
    const minTs = sortedDetail[0].timestamp;
    const maxTs = sortedDetail[sortedDetail.length - 1].timestamp;
    const pad = Math.max((maxTs - minTs) * 0.05, 86400000);
    detailXDomain = [minTs - pad, maxTs + pad];
  }

  // 멀티라인 스타일 (색상 + 대시패턴 조합으로 가독성 향상)
  const LINE_STYLES = [
    { strokeDasharray: undefined, dotRadius: 4 },
    { strokeDasharray: "5 5", dotRadius: 3.5 },
    { strokeDasharray: "2 2", dotRadius: 3 },
    { strokeDasharray: "8 4", dotRadius: 4 },
    { strokeDasharray: "6 3 2 3", dotRadius: 3.5 },
    { strokeDasharray: "4 4", dotRadius: 3.5 },
    { strokeDasharray: "10 2", dotRadius: 4 },
    { strokeDasharray: "3 3", dotRadius: 3 }
  ];

  // 툴팁 렌더러 (테마 CSS 변수 호환 및 날짜 형식화)
  const renderTrendsTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const d = new Date(label);
    const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
    return (
      <div
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-inner)",
          padding: "10px 12px",
          boxShadow: "var(--shadow-card)",
          fontSize: 12
        }}
      >
        <div style={{ color: "var(--sub)", marginBottom: 6, fontWeight: 600 }}>{dateStr}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {payload.map((entry, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: entry.color || "var(--text)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: entry.color }} />
                {entry.name}
              </span>
              <span style={{ fontWeight: 700, color: "var(--text)" }}>{entry.value} kg</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDetailTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const d = new Date(label);
    const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
    const rowData = payload[0]?.payload;
    return (
      <div
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-inner)",
          padding: "10px 12px",
          boxShadow: "var(--shadow-card)",
          fontSize: 12
        }}
      >
        <div style={{ color: "var(--sub)", marginBottom: 6, fontWeight: 600 }}>{dateStr}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {payload.map((entry, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: entry.color || "var(--text)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: entry.color }} />
                {entry.name}
              </span>
              <span style={{ fontWeight: 700, color: "var(--text)" }}>{entry.value} kg</span>
            </div>
          ))}
          {rowData?.reps && (
            <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2, borderTop: "1px solid var(--border)", paddingTop: 4 }}>
              수행 횟수: {rowData.reps}회
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 기간 필터 & 부위 필터 칩 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* 기간 선택 (2주, 1개월, 3개월, 6개월) */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { val: 14,  label: "2주" },
            { val: 30,  label: "1개월" },
            { val: 90,  label: "3개월" },
            { val: 180, label: "6개월" }
          ].map((d) => (
            <button
              key={d.val}
              type="button"
              className={`record-chip ${days === d.val ? "active" : ""}`}
              onClick={() => setDays(d.val)}
              style={{ padding: "6px 14px", fontSize: 13 }}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* 부위 필터 (전체, 등, 가슴, 어깨, 하체, 팔) */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {Object.keys(CATEGORIES).map((cat) => (
            <button
              key={cat}
              type="button"
              className={`record-chip ${category === cat ? "active" : ""}`}
              onClick={() => {
                setCategory(cat);
                setSelectedWorkout(null);
              }}
              style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 개별 종목 선택 칩 목록 */}
      {filteredWorkouts.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {filteredWorkouts.map((w, idx) => {
            const isSelected = selectedWorkout === w;
            const chipColor = CHART_COLORS[idx % CHART_COLORS.length];
            return (
              <button
                key={w}
                type="button"
                className="record-chip"
                onClick={() => (isSelected ? setSelectedWorkout(null) : fetchDetail(w))}
                style={{
                  backgroundColor: isSelected ? chipColor : "var(--card)",
                  borderColor: isSelected ? chipColor : "var(--border)",
                  color: isSelected ? "#ffffff" : "var(--text)",
                  padding: "6px 12px",
                  fontSize: 12
                }}
              >
                {w}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--sub)", fontSize: 13 }}>
          추세 데이터를 불러오는 중...
        </div>
      ) : !allData || !allData.workouts || allData.workouts.length === 0 ? (
        <div className="ui-card" style={{ textAlign: "center", padding: "40px 0", color: "var(--sub)", fontSize: 13 }}>
          분석 가능한 운동 기록이 없습니다.
        </div>
      ) : (
        <>
          {/* 1. 전체 추세 멀티라인 차트 (개별 종목 미선택 시) */}
          {!selectedWorkout && (
            <div className="ui-card" style={{ padding: "20px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                  상위 종목 추정 1RM 추세
                </span>
                <span style={{ fontSize: 12, color: "var(--sub)" }}>단위: kg</span>
              </div>

              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={mergedData} margin={{ top: 16, right: 20, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={trendXDomain}
                    tickFormatter={(ts) => {
                      const d = new Date(ts);
                      return `${d.getMonth() + 1}/${d.getDate()}`;
                    }}
                    tick={{ fontSize: 11, fill: "var(--sub)" }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                  />
                  <YAxis
                    unit="kg"
                    domain={trendYDomain}
                    tick={{ fontSize: 11, fill: "var(--sub)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={renderTrendsTooltip} />
                  <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} />
                  {activeWorkouts.map((w, idx) => (
                    <Line
                      key={w}
                      type="monotone"
                      dataKey={w}
                      name={w}
                      stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                      strokeDasharray={LINE_STYLES[idx % LINE_STYLES.length].strokeDasharray}
                      strokeWidth={2}
                      dot={{ r: LINE_STYLES[idx % LINE_STYLES.length].dotRadius, stroke: "var(--card)", strokeWidth: 1.5 }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              {filteredWorkouts.length > 8 && (
                <div style={{ fontSize: 12, color: "var(--sub)", textAlign: "center", marginTop: 8 }}>
                  상위 8개 종목 표시 중 · 상단 종목을 클릭하면 단일 상세 추세를 볼 수 있습니다
                </div>
              )}
            </div>
          )}

          {/* 2. 특정 종목 상세 추세 차트 & 상세 테이블 */}
          {selectedWorkout && detailData.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="ui-card" style={{ padding: "20px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                    {selectedWorkout} 상세 추세
                  </span>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setSelectedWorkout(null)}
                    style={{ fontSize: 11, padding: "4px 8px" }}
                  >
                    전체 추세 보기
                  </button>
                </div>

                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={sortedDetail} margin={{ top: 16, right: 20, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      type="number"
                      scale="time"
                      domain={detailXDomain}
                      tickFormatter={(ts) => {
                        const d = new Date(ts);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                      tick={{ fontSize: 11, fill: "var(--sub)" }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--border)" }}
                    />
                    <YAxis
                      unit="kg"
                      domain={detailYDomain}
                      tick={{ fontSize: 11, fill: "var(--sub)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={renderDetailTooltip} />
                    <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="est_1rm"
                      name="추정 1RM"
                      stroke="var(--accent)"
                      strokeWidth={2.5}
                      dot={{ r: 4.5, stroke: "var(--card)", strokeWidth: 1.5 }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="weight_kg"
                      name="실제 무게"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={{ r: 3.5, stroke: "var(--card)", strokeWidth: 1.5 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 상세 기록 내역 테이블 */}
              <div className="ui-card" style={{ padding: "18px 16px" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 12, display: "block" }}>
                  {selectedWorkout} 기록 내역
                </span>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--sub)", textAlign: "left", fontSize: 12 }}>
                        <th style={{ padding: "8px 6px" }}>날짜</th>
                        <th style={{ padding: "8px 8px" }}>입력 명칭</th>
                        <th style={{ padding: "8px 8px", textAlign: "right" }}>중량</th>
                        <th style={{ padding: "8px 8px", textAlign: "right" }}>횟수</th>
                        <th style={{ padding: "8px 8px", textAlign: "right" }}>추정 1RM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...detailData].reverse().map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 6px", color: "var(--sub)", fontSize: 12 }}>{r.date}</td>
                          <td style={{ padding: "10px 8px", color: "var(--text)" }}>
                            <span style={{ backgroundColor: "var(--card-subtle)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>
                              {r.workout_name_raw || r.workout_name || "-"}
                            </span>
                          </td>
                          <td style={{ padding: "10px 8px", textAlign: "right", color: "var(--text)" }}>
                            {r.weight_kg}kg
                          </td>
                          <td style={{ padding: "10px 8px", textAlign: "right", color: "var(--sub)" }}>
                            {r.reps}회
                          </td>
                          <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700, color: "var(--accent)" }}>
                            {r.est_1rm}kg
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
function MlPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios
      .get(`${API}/ml/recommend`)
      .then((res) => {
        setData(res.data);
      })
      .catch((err) => {
        console.warn("ML 추천 조회 실패:", err);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--sub)", fontSize: 13 }}>
        머신러닝 모델 분석 중...
      </div>
    );
  }

  // 기존 기준 보존: 신뢰도 60% (r2 >= 0.6) 이상 필터링
  const validRecommendations = data?.recommendations?.filter((r) => r.r2 >= 0.6) || [];
  const warnings = data?.warnings || [];

  if (!data || validRecommendations.length === 0) {
    return (
      <div className="ui-card" style={{ padding: "24px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent)", fontWeight: 700, fontSize: 16 }}>
          <BoltIcon size={18} />
          <span>머신러닝 추천</span>
        </div>

        <p style={{ color: "var(--text)", fontSize: 14, margin: "14px 0 6px", fontWeight: 600 }}>
          신뢰도 60% 이상인 추천 결과가 아직 없습니다
        </p>
        <p style={{ color: "var(--sub)", fontSize: 13, margin: "0 0 16px" }}>
          현재 분석된 전체 기록: {data?.data_count || 0}개
        </p>

        <div
          style={{
            padding: "14px 16px",
            borderRadius: "var(--radius-inner)",
            backgroundColor: "var(--card-subtle)",
            border: "1px dashed var(--border)",
            fontSize: 13,
            color: "var(--sub)",
            lineHeight: 1.6
          }}
        >
          <strong>추천 조건</strong>: 종목별 최소 5세션 이상 기록이 축적되고, 선형 회귀 모델의 결정계수(R²)가 60% 이상일 때 자동으로 추천 무게가 계산됩니다.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. 과훈련 및 하향 경고 배너 목록 (기존 데이터 구조 100% 보존) */}
      {warnings.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {warnings.map((w, i) => {
            const isOvertraining = w.type === "overtraining";
            return (
              <div
                key={i}
                className="ui-card"
                style={{
                  padding: "14px 16px",
                  borderLeft: `4px solid ${isOvertraining ? "var(--danger)" : "var(--accent)"}`,
                  backgroundColor: "var(--card-subtle)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertTriangleIcon size={16} color={isOvertraining ? "var(--danger)" : "var(--accent)"} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: isOvertraining ? "var(--danger)" : "var(--accent)" }}>
                    {w.message}
                  </span>
                </div>

                {isOvertraining && w.recent_volume && w.prev_volume && (
                  <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 6, paddingLeft: 24 }}>
                    이전 2주: {Number(w.prev_volume).toLocaleString()}kg → 최근 2주: {Number(w.recent_volume).toLocaleString()}kg (+{w.change_pct}%)
                  </div>
                )}
                {w.type === "declining" && Array.isArray(w.last_3_1rm) && (
                  <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 6, paddingLeft: 24 }}>
                    최근 3세션 1RM: {w.last_3_1rm.map((v) => `${v}kg`).join(" → ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 2. 추천 무게 카드 목록 */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
              다음 세션 추천 무게
            </span>
            <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
              선형 회귀 기반 | 5세션 이상 · 모델 신뢰도 60% 이상
            </div>
          </div>
          <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>
            {validRecommendations.length}개 종목 추천
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {validRecommendations.map((r, i) => (
            <div key={i} className="ui-card" style={{ padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                    {r.workout_name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
                    {r.trend} · {r.sessions}세션 분석
                  </div>
                </div>

                {/* 추천 무게 배지 */}
                <div
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "#ffffff",
                    borderRadius: "var(--radius-inner)",
                    padding: "6px 14px",
                    textAlign: "center"
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.9 }}>추천 10RM</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{r.recommended_10rm}kg</div>
                </div>
              </div>

              {/* 3열 수치 스탯 그리드 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div style={{ backgroundColor: "var(--card-subtle)", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 2 }}>저번 무게</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{r.last_weight}kg</div>
                </div>
                <div style={{ backgroundColor: "var(--card-subtle)", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 2 }}>현재 1RM</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{r.current_1rm}kg</div>
                </div>
                <div style={{ backgroundColor: "var(--card-subtle)", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 2 }}>예측 1RM</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>{r.predicted_1rm}kg</div>
                </div>
              </div>

              {/* 주당 성장(kg 단위 유지) & 모델 정확도 */}
              <div style={{ display: "flex", gap: 8 }}>
                <div
                  style={{
                    flex: 1,
                    backgroundColor: "var(--card-subtle)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12,
                    textAlign: "center",
                    color: "var(--sub)"
                  }}
                >
                  <span>주당 성장 </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: r.slope_per_week > 0 ? "var(--success)" : r.slope_per_week < 0 ? "var(--danger)" : "var(--sub)"
                    }}
                  >
                    {r.slope_per_week > 0 ? `+${r.slope_per_week}kg` : `${r.slope_per_week}kg`}
                  </span>
                </div>

                <div
                  style={{
                    flex: 1,
                    backgroundColor: "var(--card-subtle)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12,
                    textAlign: "center",
                    color: "var(--sub)"
                  }}
                >
                  <span>모델 정확도 </span>
                  <span style={{ fontWeight: 700, color: "var(--text)" }}>
                    {Math.round(r.r2 * 100)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 하단 데이터 현황 요약 */}
      <div className="ui-card" style={{ padding: "12px 16px", textAlign: "center" }}>
        <span style={{ color: "var(--sub)", fontSize: 12 }}>
          총 {data.data_count}개 세트 분석 완료 · 데이터가 누적될수록 정확도가 향상됩니다
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 메인 분석 화면 (AnalyticsScreen)
// ─────────────────────────────────────────────
export default function AnalyticsScreen({ defaultSubTab = "volume" }) {
  const [currentSubTab, setCurrentSubTab] = useState(defaultSubTab);

  const SUB_TABS = [
    { id: "volume", label: "볼륨", icon: AnalyzeIcon },
    { id: "1rm",    label: "1RM", icon: TrophyIcon },
    { id: "trends", label: "추세", icon: TrendingUpIcon },
    { id: "ml",     label: "머신러닝", icon: BoltIcon }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── 1. 상단 타이틀 배너 ── */}
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
            운동 분석
          </h2>
          <p style={{ fontSize: 13, color: "var(--sub)", margin: "4px 0 0" }}>
            볼륨, 1RM, 종목별 추세 및 머신러닝 성장 예측을 확인하세요
          </p>
        </div>
      </div>

      {/* ── 2. 서브탭 필 스위처 ── */}
      <div className="analyze-nav">
        {SUB_TABS.map((t) => {
          const IconComp = t.icon;
          const isActive = currentSubTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`analyze-nav-btn ${isActive ? "active" : ""}`}
              onClick={() => setCurrentSubTab(t.id)}
            >
              <IconComp size={15} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── 3. 선택된 서브탭 패널 ── */}
      <div>
        {currentSubTab === "volume" && <VolumePanel />}
        {currentSubTab === "1rm"    && <OneRmPanel />}
        {currentSubTab === "trends" && <TrendsPanel />}
        {currentSubTab === "ml"     && <MlPanel />}
      </div>
    </div>
  );
}
