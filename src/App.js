import { useState, useEffect } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";

const API = process.env.REACT_APP_API_URL;



export default function App() {
  const [volume, setVolume] = useState([]);
  const [oneRM, setOneRM] = useState([]);
  const [period, setPeriod] = useState("week");
  const [tab, setTab] = useState("volume");
  const [labels, setLabels] = useState({ cur: "이번주", prev: "저번주" });

  useEffect(() => {
    axios.get(`${API}/volume?period=${period}`)
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : [];
        if (data.length > 0) {
          setLabels({ cur: data[0].cur_label, prev: data[0].prev_label });
        }
        setVolume(data);
      });
  }, [period]);

  useEffect(() => {
    axios.get(`${API}/1rm`)
      .then(res => setOneRM(res.data));
  }, []);

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1>💪 운동 대시보드</h1>

      {/* 탭 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["volume", "1rm"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
              background: tab === t ? "#1f77b4" : "#eee",
              color: tab === t ? "white" : "black", fontWeight: "bold"
            }}>
            {t === "volume" ? "📊 볼륨" : "🏆 1RM"}
          </button>
        ))}
      </div>

      {/* 볼륨 탭 */}
      {tab === "volume" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {["week", "last", "month"].map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                style={{
                  padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
                  background: period === p ? "#ff7f0e" : "#eee",
                  color: period === p ? "white" : "black"
                }}>
                {p === "week" ? "이번주" : p === "last" ? "저번주" : "이번달"}
              </button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={volume}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis unit="kg" />
              <Tooltip formatter={(v) => `${v.toLocaleString()}kg`} />
              <Legend />
              <Bar dataKey={labels.prev} fill="#aec6e8" radius={[6,6,0,0]} />
              <Bar dataKey={labels.cur} fill="#1f77b4" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 1RM 탭 */}
      {tab === "1rm" && (
        <div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={th}>운동명</th>
                <th style={th}>추정 1RM</th>
                <th style={th}>기록</th>
                <th style={th}>날짜</th>
              </tr>
            </thead>
            <tbody>
              {oneRM.sort((a,b) => b["1rm"] - a["1rm"]).map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={td}>{row.workout_name}</td>
                  <td style={{ ...td, fontWeight: "bold", color: "#1f77b4" }}>
                    {row["1rm"]}kg
                  </td>
                  <td style={td}>{row.weight_kg}kg × {row.reps}회</td>
                  <td style={td}>{String(row.date).slice(0,10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th = { padding: "10px 14px", textAlign: "left", fontWeight: "bold" };
const td = { padding: "10px 14px" };