import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  SettingsIcon,
  UserIcon,
  LogoutIcon,
  MoonIcon,
  SunIcon,
  FlameIcon,
  TelegramIcon,
  DiscordIcon,
  RefreshIcon,
  EyeIcon,
  EyeOffIcon,
  CopyIcon,
  CheckIcon
} from "../common/Icons";

const API = process.env.REACT_APP_API_URL;

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
  btn: (bg = "var(--accent)", color = "#ffffff") => ({
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
  }
};

export default function SettingsScreen({
  theme,
  onToggleTheme,
  onLogout,
  userName,
  showLastWorkout,
  onToggleShowLastWorkout
}) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  // 텔레그램 상태
  const [linkCode, setLinkCode] = useState(null);
  const [expiresIn, setExpiresIn] = useState(null);
  const [issuingCode, setIssuingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [refreshingTelegram, setRefreshingTelegram] = useState(false);

  // 디스코드 상태
  const [discordUrl, setDiscordUrl] = useState("");
  const [showDiscordUrl, setShowDiscordUrl] = useState(false);
  const [savingDiscord, setSavingDiscord] = useState(false);
  const [discordStatusMsg, setDiscordStatusMsg] = useState("");

  const fetchSettings = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/settings`);
      setSettings(res.data);
      if (res.data.discord_webhook_url !== undefined) {
        setDiscordUrl(res.data.discord_webhook_url || "");
      }
      if (res.data.link_code) {
        // 이미 발급된 코드가 있고 만료되지 않았으면 보존
        setLinkCode(res.data.link_code);
        setExpiresIn("10분");
      }
    } catch {
      // 오류 시 기존 입력 유지
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // 텔레그램 연동 코드 발급 (사용자 명시적 클릭 시에만 실행)
  const handleGenerateLinkCode = async () => {
    if (issuingCode) return;
    setIssuingCode(true);
    try {
      const res = await axios.post(`${API}/settings/link-code`);
      setLinkCode(res.data.code);
      setExpiresIn(res.data.expires_in || "10분");
    } catch {
      alert("텔레그램 연결 코드 발급에 실패했습니다.");
    } finally {
      setIssuingCode(false);
    }
  };

  // 텔레그램 연결 상태 수동 새로고침
  const handleRefreshTelegram = async () => {
    setRefreshingTelegram(true);
    await fetchSettings();
    setTimeout(() => setRefreshingTelegram(false), 500);
  };

  // 코드 클립보드 복사
  const handleCopyCode = (text) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  };

  // 디스코드 웹훅 저장 (사용자 명시적 클릭 시에만 실행)
  const handleSaveDiscord = async () => {
    if (savingDiscord) return;
    setSavingDiscord(true);
    setDiscordStatusMsg("");

    const targetUrl = discordUrl.trim();
    try {
      await axios.post(`${API}/settings/discord`, { webhook_url: targetUrl });
      setDiscordStatusMsg(
        targetUrl ? "✅ 서버에 웹훅 URL이 저장되었습니다." : "✅ 웹훅이 삭제(해제)되었습니다."
      );
      fetchSettings();
      setTimeout(() => setDiscordStatusMsg(""), 3500);
    } catch {
      setDiscordStatusMsg("❌ 웹훅 저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSavingDiscord(false);
    }
  };

  // 홈 최근 운동 표시 토글
  const handleToggleLastWorkout = async () => {
    const nextVal = !showLastWorkout;
    if (onToggleShowLastWorkout) {
      onToggleShowLastWorkout(nextVal);
    }
    setSettings(prev => prev ? { ...prev, show_last_workout: nextVal } : null);
    try {
      await axios.post(`${API}/settings/last-workout?enabled=${nextVal}`);
    } catch {
      // 롤백
      if (onToggleShowLastWorkout) {
        onToggleShowLastWorkout(!nextVal);
      }
    }
  };

  const isDark = theme === "dark";
  const isTelegramConnected = settings?.telegram_connected ?? false;
  const isDiscordRegistered = Boolean(settings?.discord_webhook_url && settings.discord_webhook_url.trim().length > 0);

  return (
    <div>
      {/* 헤더 영역 */}
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
            <SettingsIcon size={20} color="var(--accent)" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: "800", margin: 0, color: "var(--text)" }}>
            설정
          </h1>
        </div>
        <p style={{ fontSize: 13, color: "var(--sub)", margin: 0 }}>
          테마, 계정, 홈 표시 및 외부 연동을 관리합니다.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "var(--sub)", padding: "40px 0" }}>
          설정을 불러오는 중...
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* 1. 계정 카드 */}
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "var(--input-bg)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--sub)",
                  flexShrink: 0
                }}>
                  <UserIcon size={22} color="var(--sub)" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: "700", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {userName || "사용자"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
                    기존 Google 계정 · JWT 세션을 사용합니다.
                  </div>
                </div>
              </div>

              <button
                onClick={onLogout}
                style={{ ...S.btnGhost, padding: "8px 14px", flexShrink: 0 }}
                title="로그아웃"
              >
                <LogoutIcon size={16} color="var(--sub)" />
                <span>로그아웃</span>
              </button>
            </div>
          </div>

          {/* 2. 화면 테마 (다크/라이트 모드) */}
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: "var(--radius-inner)",
                  background: isDark ? "rgba(249, 115, 22, 0.12)" : "rgba(234, 179, 8, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: isDark ? "var(--accent)" : "#eab308"
                }}>
                  {isDark ? <MoonIcon size={20} color="var(--accent)" /> : <SunIcon size={20} color="#eab308" />}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: "700", color: "var(--text)" }}>
                    {isDark ? "다크 모드" : "라이트 모드"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
                    브라우저에 저장됩니다. (기본값: 다크)
                  </div>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isDark}
                onClick={onToggleTheme}
                className={`settings-toggle-switch ${isDark ? "active" : ""}`}
              >
                <div className="settings-toggle-thumb" />
              </button>
            </div>
          </div>

          {/* 3. 홈 최근 운동 표시 */}
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: "var(--radius-inner)",
                  background: "var(--accent-bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--accent)"
                }}>
                  <FlameIcon size={20} color="var(--accent)" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: "700", color: "var(--text)" }}>
                    홈 최근 운동 표시
                  </div>
                  <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
                    메인 화면에 최근 운동 기록 카드를 표시합니다.
                  </div>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={showLastWorkout}
                onClick={handleToggleLastWorkout}
                className={`settings-toggle-switch ${showLastWorkout ? "active" : ""}`}
              >
                <div className="settings-toggle-thumb" />
              </button>
            </div>
          </div>

          {/* 4. 텔레그램 봇 연결 */}
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: "var(--radius-inner)",
                  background: "rgba(14, 165, 233, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#0ea5e9"
                }}>
                  <TelegramIcon size={20} color="#0ea5e9" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: "700", color: "var(--text)" }}>
                    텔레그램 봇 연결
                  </div>
                  <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
                    운동 기록 알림 및 봇 간편 기록을 지원합니다.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  borderRadius: "var(--radius-pill)",
                  fontSize: "12px",
                  fontWeight: "700",
                  background: isTelegramConnected ? "var(--success-bg)" : "var(--input-bg)",
                  color: isTelegramConnected ? "var(--success)" : "var(--sub)",
                  border: `1px solid ${isTelegramConnected ? "var(--success)" : "var(--border)"}`
                }}>
                  {isTelegramConnected ? "✅ 연결됨" : "미연결"}
                </span>

                <button
                  onClick={handleRefreshTelegram}
                  disabled={refreshingTelegram}
                  style={{
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: "50%",
                    width: 28,
                    height: 28,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: "var(--sub)"
                  }}
                  title="연결 상태 새로고침"
                >
                  <RefreshIcon size={14} color="var(--sub)" />
                </button>
              </div>
            </div>

            {isTelegramConnected ? (
              <div style={{
                background: "var(--card-subtle)",
                borderRadius: "var(--radius-inner)",
                padding: "14px 16px",
                border: "1px solid var(--border)",
                fontSize: "13px",
                color: "var(--sub)"
              }}>
                계정이 텔레그램 봇과 정상 연결되어 있습니다. 웹에서 운동 기록 시 봇으로 알림이 전송됩니다.
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 13, color: "var(--sub)", margin: "0 0 14px 0" }}>
                  연결 코드를 발급받은 뒤, 텔레그램 봇에서 <code style={{ color: "var(--accent)", fontWeight: "700" }}>/link 코드</code>를 입력하면 연결됩니다.
                </p>

                <button
                  onClick={handleGenerateLinkCode}
                  disabled={issuingCode}
                  style={{ ...S.btn(), width: "100%", padding: "11px" }}
                >
                  {issuingCode ? "코드 발급 중..." : "🔑 연결 코드 발급"}
                </button>

                {linkCode && (
                  <div style={{
                    marginTop: 14,
                    padding: 16,
                    background: "var(--card-subtle)",
                    borderRadius: "var(--radius-inner)",
                    border: "1px solid var(--border)"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--sub)" }}>
                        텔레그램 봇에서 전송할 명령어 (유효시간: {expiresIn || "10분"}):
                      </span>
                      <button
                        onClick={() => handleCopyCode(`/link ${linkCode}`)}
                        style={{
                          background: "none",
                          border: "none",
                          color: copiedCode ? "var(--success)" : "var(--accent)",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: "700",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4
                        }}
                      >
                        {copiedCode ? <CheckIcon size={13} color="var(--success)" /> : <CopyIcon size={13} color="var(--accent)" />}
                        {copiedCode ? "복사됨" : "명령어 복사"}
                      </button>
                    </div>

                    <div style={{
                      fontSize: 20,
                      fontWeight: "800",
                      letterSpacing: 2,
                      color: "var(--accent)",
                      textAlign: "center",
                      padding: "10px",
                      background: "var(--input-bg)",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      userSelect: "all"
                    }}>
                      /link {linkCode}
                    </div>

                    <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 10, lineHeight: 1.5 }}>
                      1. 텔레그램에서 Overloader 운동 기록 봇을 엽니다.<br />
                      2. 위 명령어를 그대로 복사하여 봇 채팅방에 전송합니다.<br />
                      3. 전송 후 상단 <strong>새로고침(↻)</strong> 버튼을 눌러 연결 상태를 확인하세요.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. Discord 웹훅 설정 */}
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: "var(--radius-inner)",
                  background: "rgba(88, 101, 242, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#5865F2"
                }}>
                  <DiscordIcon size={20} color="#5865F2" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: "700", color: "var(--text)" }}>
                    Discord 웹훅 설정
                  </div>
                  <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
                    운동 기록 및 알림을 Discord 채널로 전송합니다.
                  </div>
                </div>
              </div>

              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: "var(--radius-pill)",
                fontSize: "12px",
                fontWeight: "700",
                background: isDiscordRegistered ? "var(--accent-bg)" : "var(--input-bg)",
                color: isDiscordRegistered ? "var(--accent)" : "var(--sub)",
                border: `1px solid ${isDiscordRegistered ? "var(--accent)" : "var(--border)"}`
              }}>
                {isDiscordRegistered ? "웹훅 등록됨" : "미등록"}
              </span>
            </div>

            <p style={{ fontSize: 13, color: "var(--sub)", margin: "0 0 12px 0" }}>
              Discord 채널 설정 → 연동 → 웹후크에서 생성한 URL을 입력하세요. 빈 값으로 저장하면 웹훅이 해제(삭제)됩니다.
            </p>

            <div style={{ position: "relative", marginBottom: 10 }}>
              <input
                type={showDiscordUrl ? "text" : "password"}
                placeholder="https://discord.com/api/webhooks/..."
                value={discordUrl}
                onChange={(e) => setDiscordUrl(e.target.value)}
                style={{ ...S.input, paddingRight: 70 }}
                autoComplete="off"
                spellCheck="false"
              />

              <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 4 }}>
                {discordUrl && (
                  <button
                    type="button"
                    onClick={() => setDiscordUrl("")}
                    style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", padding: "4px" }}
                    title="입력 지우기"
                  >
                    ✕
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDiscordUrl(!showDiscordUrl)}
                  style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", padding: "4px" }}
                  title={showDiscordUrl ? "URL 숨기기" : "URL 보기"}
                >
                  {showDiscordUrl ? <EyeOffIcon size={16} color="var(--sub)" /> : <EyeIcon size={16} color="var(--sub)" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleSaveDiscord}
              disabled={savingDiscord}
              style={{ ...S.btn("#5865F2"), width: "100%", padding: "11px" }}
            >
              {savingDiscord ? "저장 중..." : "💾 웹훅 저장"}
            </button>

            {discordStatusMsg && (
              <div style={{
                marginTop: 10,
                fontSize: 13,
                fontWeight: "600",
                color: discordStatusMsg.startsWith("✅") ? "var(--success)" : "var(--danger)"
              }}>
                {discordStatusMsg}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
