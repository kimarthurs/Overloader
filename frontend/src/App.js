import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { initAuthSession, performLogout, registerLogoutCallback } from "./auth";
import AppShell from "./components/layout/AppShell";
import HomeScreen from "./components/home/HomeScreen";
import RecordScreen from "./components/record/RecordScreen";
import CalendarScreen from "./components/calendar/CalendarScreen";
import AnalyticsScreen from "./components/analyze/AnalyticsScreen";
import HealthScreen from "./components/health/HealthScreen";

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
// ── 건강 탭: HealthScreen 컴포넌트로 분리됨 (src/components/health/HealthScreen.jsx) ──

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
          <HealthScreen />
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


