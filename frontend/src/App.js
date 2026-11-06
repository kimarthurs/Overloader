import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { initAuthSession, performLogout, registerLogoutCallback } from "./auth";
import AppShell from "./components/layout/AppShell";
import HomeScreen from "./components/home/HomeScreen";
import RecordScreen from "./components/record/RecordScreen";
import CalendarScreen from "./components/calendar/CalendarScreen";
import AnalyticsScreen from "./components/analyze/AnalyticsScreen";
import HealthScreen from "./components/health/HealthScreen";
import SettingsScreen from "./components/settings/SettingsScreen";
import AuthScreen from "./components/auth/AuthScreen";
import { applyAccentColor, getSavedAccentColor } from "./utils/accentColor";

const API = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";
const GOOGLE_CLIENT_ID = "907903471313-hrjku47jnpcgqktsp3vhfsq5846iutkb.apps.googleusercontent.com";

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

// ── 설정 탭: SettingsScreen 컴포넌트로 분리됨 (src/components/settings/SettingsScreen.jsx) ──


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
    applyAccentColor(getSavedAccentColor());
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
        <AuthScreen onLogin={handleLogin} />
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
          <SettingsScreen
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


