import React from "react";
import {
  HomeIcon,
  RecordIcon,
  CalendarIcon,
  AnalyzeIcon,
  HealthIcon,
  SettingsIcon,
  LogoutIcon,
  BoltIcon,
  UserIcon
} from "../common/Icons";

const TABS = [
  { id: "home", label: "홈", icon: HomeIcon },
  { id: "record", label: "기록", icon: RecordIcon },
  { id: "calendar", label: "달력", icon: CalendarIcon },
  { id: "analyze", label: "분석", icon: AnalyzeIcon },
  { id: "health", label: "건강", icon: HealthIcon }
];

export default function AppShell({
  currentTab,
  onTabChange,
  userName,
  onLogout,
  children
}) {
  return (
    <div className="app-container">
      {/* ── 데스크톱 고정 좌측 사이드바 ── */}
      <aside className="pc-sidebar">
        {/* 로고 영역 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff"
            }}
          >
            <BoltIcon size={18} />
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5, color: "var(--text)" }}>
            Overloader
          </span>
        </div>

        {/* 메인 메뉴 네비게이션 */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: "var(--radius-inner)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  backgroundColor: isActive ? "var(--accent-bg)" : "transparent",
                  color: isActive ? "var(--accent)" : "var(--sub)",
                  textAlign: "left",
                  transition: "all 0.15s ease"
                }}
              >
                <Icon size={18} color={isActive ? "var(--accent)" : "var(--sub)"} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* 사이드바 하단: 설정 및 사용자 계정 정보 */}
        <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={() => onTabChange("settings")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "9px 14px",
              borderRadius: "var(--radius-inner)",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: currentTab === "settings" ? 700 : 500,
              backgroundColor: currentTab === "settings" ? "var(--accent-bg)" : "transparent",
              color: currentTab === "settings" ? "var(--accent)" : "var(--sub)",
              textAlign: "left"
            }}
          >
            <SettingsIcon size={18} color={currentTab === "settings" ? "var(--accent)" : "var(--sub)"} />
            <span>설정</span>
          </button>

          {/* 계정 카드 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              borderRadius: "var(--radius-inner)",
              backgroundColor: "var(--card-subtle)",
              border: "1px solid var(--border)",
              marginTop: 4
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  backgroundColor: "rgba(255,255,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--sub)",
                  flexShrink: 0
                }}
              >
                <UserIcon size={15} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}
                >
                  {userName || "사용자"}
                </div>
                <div style={{ fontSize: 11, color: "var(--sub)" }}>Google 계정</div>
              </div>
            </div>

            <button
              onClick={onLogout}
              title="로그아웃"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 6,
                color: "var(--sub)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              <LogoutIcon size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── 모바일 전용 상단 헤더 ── */}
      <header className="mobile-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              backgroundColor: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff"
            }}
          >
            <BoltIcon size={15} />
          </div>
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.5, color: "var(--text)" }}>
            Overloader
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={() => onTabChange("settings")}
            title="설정"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 8,
              color: currentTab === "settings" ? "var(--accent)" : "var(--sub)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <SettingsIcon size={19} />
          </button>
          <button
            onClick={onLogout}
            title="로그아웃"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 8,
              color: "var(--sub)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <LogoutIcon size={19} />
          </button>
        </div>
      </header>

      {/* ── 메인 콘텐츠 영역 ── */}
      <main className="main-content">
        {children}
      </main>

      {/* ── 모바일 전용 하단 탭바 ── */}
      <nav className="mobile-bottom-nav">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "6px 0",
                color: isActive ? "var(--accent)" : "var(--sub)",
                transition: "color 0.15s ease"
              }}
            >
              <Icon size={20} color={isActive ? "var(--accent)" : "var(--sub)"} />
              <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, letterSpacing: -0.2 }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
