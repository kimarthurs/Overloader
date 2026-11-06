import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { EyeIcon, EyeOffIcon } from "../common/Icons";
import { initAuthSession } from "../../auth";

const API = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

// ASCII 구두점 기호 정규식
const SPECIAL_CHAR_REGEX = /[!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]/;

// 세션 ID 생성 (브라우저 흐름 바인딩용)
function getOrCreateSessionId() {
  let sid = sessionStorage.getItem("overloader_auth_sid");
  if (!sid) {
    sid = "sid_" + Math.random().toString(36).substring(2, 15) + "_" + Date.now();
    sessionStorage.setItem("overloader_auth_sid", sid);
  }
  return sid;
}

export default function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" | "register" | "reset"
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 비밀번호 재설정 티켓 상태
  const [reauthTicket, setReauthTicket] = useState(null);

  // UI 상태
  const [loading, setLoading] = useState(false);
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const sessionId = useMemo(() => getOrCreateSessionId(), []);

  // ── URL 쿼리 파라미터 처리 (OAuth 교환 코드 및 재인증 티켓 수신) ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const exchangeCode = params.get("exchange_code");
    const ticketParam = params.get("ticket");
    const purposeParam = params.get("purpose");
    const errorParam = params.get("error");
    const statusParam = params.get("status");

    // 1. OAuth 일회용 교환 코드 감지 -> POST /auth/v2/oauth/exchange 호출
    if (exchangeCode) {
      setExchangeLoading(true);
      setErrorMsg("");

      axios.post(`${API}/auth/v2/oauth/exchange`, {
        exchange_code: exchangeCode,
        session_id: sessionId
      })
      .then(res => {
        // 교환 성공: URL에서 쿼리스트링 제거
        window.history.replaceState({}, document.title, window.location.pathname);
        initAuthSession(res.data.token, res.data.name);
        onLogin(res.data);
      })
      .catch(err => {
        window.history.replaceState({}, document.title, window.location.pathname);
        const detail = err.response?.data?.detail || "소셜 로그인 인증 코드 교환에 실패했습니다.";
        setErrorMsg(detail);
      })
      .finally(() => {
        setExchangeLoading(false);
      });
      return;
    }

    // 2. 소셜 재인증 티켓 감지 (비밀번호 재설정 목적)
    if (ticketParam && purposeParam === "password_reset") {
      setReauthTicket(ticketParam);
      setMode("reset");
      setSuccessMsg("소셜 본인 인증이 완료되었습니다. 새로운 비밀번호를 설정해 주세요.");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    // 3. 연동 성공 또는 에러 파라미터 감지
    if (statusParam === "link_success") {
      setSuccessMsg("소셜 계정 연동이 완료되었습니다.");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (errorParam) {
      if (errorParam === "google_oauth_pending") {
        setErrorMsg("구글 소셜 로그인은 연동 준비 중입니다. 현재는 네이버 로그인 및 일반 아이디/비밀번호 로그인을 지원합니다.");
      } else {
        setErrorMsg(`인증 중 오류가 발생했습니다: ${errorParam}`);
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [sessionId, onLogin]);

  // ── 아이디 유효성 검사 ──
  const usernameValidation = useMemo(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      return {
        valid: false,
        hasAt: false,
        message: "아이디는 영문·숫자·밑줄(_)을 사용한 4~20자로 입력해 주세요."
      };
    }
    if (trimmed.includes("@")) {
      return {
        valid: false,
        hasAt: true,
        message: "아이디에는 이메일 주소를 사용할 수 없습니다. 이메일은 아래 선택 입력란에 입력해 주세요."
      };
    }
    if (trimmed.length < 4 || trimmed.length > 20) {
      return {
        valid: false,
        hasAt: false,
        message: "아이디는 4자 이상 20자 이하이어야 합니다."
      };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return {
        valid: false,
        hasAt: false,
        message: "아이디는 영문·숫자·밑줄(_)을 사용한 4~20자로 입력해 주세요."
      };
    }
    return {
      valid: true,
      hasAt: false,
      message: "사용 가능한 아이디 형식입니다."
    };
  }, [username]);

  // ── 이메일 (선택) 유효성 검사 ──
  const emailValidation = useMemo(() => {
    const trimmed = email.trim();
    if (!trimmed) {
      return { valid: true, message: "" }; // 선택 입력이므로 빈 값 허용
    }
    if (trimmed.length > 255) {
      return { valid: false, message: "이메일은 255자를 초과할 수 없습니다." };
    }
    const emailRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if (!emailRegex.test(trimmed)) {
      return { valid: false, message: "올바른 이메일 형식이 아닙니다." };
    }
    return { valid: true, message: "올바른 이메일 형식입니다." };
  }, [email]);

  // ── 비밀번호 복잡도 실시간 체크 ──
  const passwordCriteria = useMemo(() => {
    return {
      length: password.length >= 8 && password.length <= 128,
      hasUpper: /[A-Z]/.test(password),
      hasLower: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecial: SPECIAL_CHAR_REGEX.test(password),
    };
  }, [password]);

  const passwordValid = useMemo(() => {
    return (
      passwordCriteria.length &&
      passwordCriteria.hasUpper &&
      passwordCriteria.hasLower &&
      passwordCriteria.hasNumber &&
      passwordCriteria.hasSpecial
    );
  }, [passwordCriteria]);

  const passwordMatch = useMemo(() => {
    if (!confirmPassword) return false;
    return password === confirmPassword;
  }, [password, confirmPassword]);

  // ── 일반 로그인 핸들러 ──
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setErrorMsg("");
    setSuccessMsg("");

    const normUsername = username.trim().toLowerCase();
    if (!normUsername || !password) {
      setErrorMsg("아이디와 비밀번호를 모두 입력해 주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/v2/login`, {
        username: normUsername,
        password: password
      });
      initAuthSession(res.data.token, res.data.name);
      onLogin(res.data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setErrorMsg(detail || "아이디 또는 비밀번호가 올바르지 않습니다.");
    } finally {
      setLoading(false);
    }
  };

  // ── 회원가입 핸들러 ──
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setErrorMsg("");
    setSuccessMsg("");

    const normUsername = username.trim().toLowerCase();
    const trimName = name.trim();
    const trimEmail = email.trim();

    if (!usernameValidation.valid) {
      setErrorMsg(usernameValidation.message || "올바른 아이디를 입력해 주세요.");
      return;
    }
    if (trimEmail && !emailValidation.valid) {
      setErrorMsg(emailValidation.message || "올바른 이메일 형식을 입력해 주세요.");
      return;
    }
    if (!trimName) {
      setErrorMsg("닉네임을 입력하세요 (1~50자).");
      return;
    }
    if (!passwordValid) {
      setErrorMsg("비밀번호 5대 필수 조건을 모두 충족해야 합니다.");
      return;
    }
    if (!passwordMatch) {
      setErrorMsg("비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/v2/register`, {
        username: normUsername,
        password: password,
        name: trimName,
        email: trimEmail || null,
      });
      initAuthSession(res.data.token, res.data.name);
      onLogin(res.data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setErrorMsg(detail || "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // ── 소셜 재인증 비밀번호 재설정 핸들러 ──
  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setErrorMsg("");
    setSuccessMsg("");

    if (!reauthTicket) {
      setErrorMsg("소셜 계정 본인 인증이 필요합니다.");
      return;
    }
    if (!passwordValid) {
      setErrorMsg("새 비밀번호 조건을 모두 충족해야 합니다.");
      return;
    }
    if (!passwordMatch) {
      setErrorMsg("새 비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        reauth_ticket: reauthTicket,
        new_password: password,
        session_id: sessionId
      };
      if (username.trim()) {
        payload.username = username.trim().toLowerCase();
      }

      const res = await axios.post(`${API}/auth/v2/account/password/reset`, payload);
      setSuccessMsg("비밀번호가 성공적으로 재설정되었습니다. 로그인 세션으로 이동합니다.");
      setTimeout(() => {
        initAuthSession(res.data.token, res.data.name || name || "사용자");
        onLogin(res.data);
      }, 800);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setErrorMsg(detail || "비밀번호 재설정에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  // ── 소셜 로그인 시작 (Google / Naver) ──
  const startOAuthLogin = (provider) => {
    const redirectUri = window.location.origin;
    window.location.href = `${API}/auth/v2/oauth/${provider}/authorize?purpose=login&session_id=${encodeURIComponent(sessionId)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  };

  // ── 비밀번호 재설정용 소셜 본인인증 시작 ──
  const startOAuthReauth = (provider) => {
    const redirectUri = window.location.origin;
    window.location.href = `${API}/auth/v2/oauth/${provider}/authorize?purpose=reauth&target_purpose=password_reset&session_id=${encodeURIComponent(sessionId)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  };

  // ── 교환 코드 처리 중 로딩 화면 ──
  if (exchangeLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <img
                src={`${process.env.PUBLIC_URL}/logo.png`}
                alt="Overloader 로고"
                style={styles.logoImage}
              />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: "800", color: "var(--text)", marginTop: 16 }}>
              로그인 세션 확인 중
            </h2>
            <p style={{ color: "var(--sub)", fontSize: 14, marginTop: 8 }}>
              일회성 인증 코드를 안전하게 확인하고 있습니다...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* 상단 브랜드 헤더 */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <img
              src={`${process.env.PUBLIC_URL}/logo.png`}
              alt="Overloader 로고"
              style={styles.logoImage}
            />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: "900", color: "var(--text)", margin: "0 0 6px" }}>
            Overloader
          </h1>
          <p style={{ fontSize: 13, color: "var(--sub)", margin: 0, lineHeight: 1.4 }}>
            스마트한 운동기록 대시보드로 나의 헬스를 더 스마트하게!
          </p>
        </div>

        {/* 탭 전환 (로그인 / 회원가입) */}
        {mode !== "reset" ? (
          <div style={styles.tabContainer}>
            <button
              type="button"
              onClick={() => { setMode("login"); setErrorMsg(""); setSuccessMsg(""); }}
              style={{
                ...styles.tabBtn,
                ...(mode === "login" ? styles.tabBtnActive : {})
              }}
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => { setMode("register"); setErrorMsg(""); setSuccessMsg(""); }}
              style={{
                ...styles.tabBtn,
                ...(mode === "register" ? styles.tabBtnActive : {})
              }}
            >
              회원가입
            </button>
          </div>
        ) : (
          <div style={{ marginBottom: 16, textAlign: "center" }}>
            <span style={styles.modeBadge}>비밀번호 재설정</span>
          </div>
        )}

        {/* 에러 및 성공 안내 메시지 */}
        {errorMsg && (
          <div style={styles.alertError}>
            ⚠️ {errorMsg}
          </div>
        )}
        {successMsg && (
          <div style={styles.alertSuccess}>
            ✅ {successMsg}
          </div>
        )}

        {/* ── 1. 로그인 폼 ── */}
        {mode === "login" && (
          <form onSubmit={handleLoginSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={styles.label}>아이디</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="아이디를 입력하세요"
                autoComplete="username"
                required
                style={styles.input}
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={styles.label}>비밀번호</label>
                <button
                  type="button"
                  onClick={() => { setMode("reset"); setErrorMsg(""); setSuccessMsg(""); }}
                  style={styles.textLink}
                >
                  비밀번호 찾기
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  autoComplete="current-password"
                  required
                  style={{ ...styles.input, paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOffIcon size={18} color="var(--sub)" /> : <EyeIcon size={18} color="var(--sub)" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ ...styles.primaryBtn, opacity: loading ? 0.6 : 1 }}
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>

            {/* 간편 로그인 구분선 */}
            <div style={styles.divider}>
              <span style={styles.dividerLine} />
              <span style={styles.dividerText}>또는 간편 로그인</span>
              <span style={styles.dividerLine} />
            </div>

            {/* 소셜 로그인 버튼들 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                onClick={() => startOAuthLogin("google")}
                style={styles.googleBtn}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Google 계정으로 계속하기
              </button>

              <button
                type="button"
                onClick={() => startOAuthLogin("naver")}
                style={styles.naverBtn}
              >
                <span style={{ fontWeight: "900", fontSize: 16 }}>N</span>
                네이버 계정으로 계속하기
              </button>
            </div>
          </form>
        )}

        {/* ── 2. 회원가입 폼 ── */}
        {mode === "register" && (
          <form onSubmit={handleRegisterSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={styles.label}>아이디</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                placeholder="4~20자 영문 소문자, 숫자, _"
                autoComplete="username"
                required
                style={styles.input}
              />
              <div style={{
                fontSize: 12,
                marginTop: 4,
                color: !username.trim()
                  ? "var(--sub)"
                  : usernameValidation.hasAt
                    ? "var(--danger, #ef4444)"
                    : usernameValidation.valid
                      ? "var(--success, #22c55e)"
                      : "var(--danger, #ef4444)"
              }}>
                {usernameValidation.message}
              </div>
            </div>

            <div>
              <label style={styles.label}>이메일 (선택)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com (선택 입력)"
                autoComplete="email"
                style={styles.input}
              />
              <div style={{
                fontSize: 11,
                marginTop: 4,
                color: (email.trim() && !emailValidation.valid) ? "var(--danger, #ef4444)" : "var(--sub)"
              }}>
                {email.trim() && !emailValidation.valid
                  ? emailValidation.message
                  : "선택 입력이며, 현재 이메일 인증·비밀번호 복구에는 사용되지 않습니다."
                }
              </div>
            </div>

            <div>
              <label style={styles.label}>닉네임</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="닉네임을 입력하세요 (1~50자)"
                required
                style={styles.input}
              />
            </div>

            <div>
              <label style={styles.label}>비밀번호</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8~128자 영문 대소문자, 숫자, 특수문자"
                  autoComplete="new-password"
                  required
                  style={{ ...styles.input, paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOffIcon size={18} color="var(--sub)" /> : <EyeIcon size={18} color="var(--sub)" />}
                </button>
              </div>

              {/* 실시간 5대 필수 조건 체크리스트 */}
              <div style={styles.criteriaBox}>
                <div style={styles.criteriaItem(passwordCriteria.length)}>
                  <span style={styles.criteriaCheck(passwordCriteria.length)}>✓</span> 8자 이상 128자 이하
                </div>
                <div style={styles.criteriaItem(passwordCriteria.hasUpper)}>
                  <span style={styles.criteriaCheck(passwordCriteria.hasUpper)}>✓</span> 영문 대문자 포함
                </div>
                <div style={styles.criteriaItem(passwordCriteria.hasLower)}>
                  <span style={styles.criteriaCheck(passwordCriteria.hasLower)}>✓</span> 영문 소문자 포함
                </div>
                <div style={styles.criteriaItem(passwordCriteria.hasNumber)}>
                  <span style={styles.criteriaCheck(passwordCriteria.hasNumber)}>✓</span> 숫자 포함
                </div>
                <div style={styles.criteriaItem(passwordCriteria.hasSpecial)}>
                  <span style={styles.criteriaCheck(passwordCriteria.hasSpecial)}>✓</span> 특수문자(기호) 포함
                </div>
              </div>
            </div>

            <div>
              <label style={styles.label}>비밀번호 확인</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호를 한 번 더 입력하세요"
                  autoComplete="new-password"
                  required
                  style={{ ...styles.input, paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeBtn}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOffIcon size={18} color="var(--sub)" /> : <EyeIcon size={18} color="var(--sub)" />}
                </button>
              </div>
              {confirmPassword && (
                <div style={{
                  fontSize: 12, marginTop: 4,
                  color: passwordMatch ? "var(--success)" : "var(--danger)"
                }}>
                  {passwordMatch ? "비밀번호가 일치합니다." : "비밀번호가 일치하지 않습니다."}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !usernameValidation.valid || !emailValidation.valid || !name.trim() || !passwordValid || !passwordMatch}
              style={{
                ...styles.primaryBtn,
                opacity: (loading || !usernameValidation.valid || !emailValidation.valid || !name.trim() || !passwordValid || !passwordMatch) ? 0.6 : 1
              }}
            >
              {loading ? "가입 처리 중..." : "회원가입 완료"}
            </button>
          </form>
        )}

        {/* ── 3. 소셜 본인인증 기반 비밀번호 재설정 ── */}
        {mode === "reset" && (
          <div>
            {!reauthTicket ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ fontSize: 13, color: "var(--sub)", lineHeight: 1.5, margin: "0 0 8px" }}>
                  연동된 소셜 계정(Google 또는 Naver)으로 본인 인증을 완료하면 안전하게 비밀번호를 재설정할 수 있습니다.
                </p>

                <button
                  type="button"
                  onClick={() => startOAuthReauth("google")}
                  style={styles.googleBtn}
                >
                  Google 계정으로 본인 인증
                </button>

                <button
                  type="button"
                  onClick={() => startOAuthReauth("naver")}
                  style={styles.naverBtn}
                >
                  <span style={{ fontWeight: "900", fontSize: 16 }}>N</span>
                  네이버 계정으로 본인 인증
                </button>

                <button
                  type="button"
                  onClick={() => { setMode("login"); setErrorMsg(""); setSuccessMsg(""); }}
                  style={{ ...styles.textLink, textAlign: "center", marginTop: 8 }}
                >
                  로그인 화면으로 돌아가기
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ fontSize: 13, color: "var(--success)", marginBottom: 4 }}>
                  ✅ 소셜 계정 본인 인증 완료 (재인증 티켓 발급됨)
                </div>

                <div>
                  <label style={styles.label}>아이디 (소셜 전용 계정일 경우 필수 입력)</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                    placeholder="사용할 아이디 (기존 등록자는 생략 가능)"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={styles.label}>새 비밀번호</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8~128자 영문 대소문자, 숫자, 특수문자"
                    required
                    style={styles.input}
                  />
                  {/* 실시간 체크리스트 */}
                  <div style={styles.criteriaBox}>
                    <div style={styles.criteriaItem(passwordCriteria.length)}>
                      <span style={styles.criteriaCheck(passwordCriteria.length)}>✓</span> 8자 이상 128자 이하
                    </div>
                    <div style={styles.criteriaItem(passwordCriteria.hasUpper)}>
                      <span style={styles.criteriaCheck(passwordCriteria.hasUpper)}>✓</span> 영문 대문자
                    </div>
                    <div style={styles.criteriaItem(passwordCriteria.hasLower)}>
                      <span style={styles.criteriaCheck(passwordCriteria.hasLower)}>✓</span> 영문 소문자
                    </div>
                    <div style={styles.criteriaItem(passwordCriteria.hasNumber)}>
                      <span style={styles.criteriaCheck(passwordCriteria.hasNumber)}>✓</span> 숫자
                    </div>
                    <div style={styles.criteriaItem(passwordCriteria.hasSpecial)}>
                      <span style={styles.criteriaCheck(passwordCriteria.hasSpecial)}>✓</span> 특수문자
                    </div>
                  </div>
                </div>

                <div>
                  <label style={styles.label}>새 비밀번호 확인</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="새 비밀번호 확인"
                    required
                    style={styles.input}
                  />
                  {confirmPassword && (
                    <div style={{
                      fontSize: 12, marginTop: 4,
                      color: passwordMatch ? "var(--success)" : "var(--danger)"
                    }}>
                      {passwordMatch ? "비밀번호가 일치합니다." : "비밀번호가 일치하지 않습니다."}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !passwordValid || !passwordMatch}
                  style={{
                    ...styles.primaryBtn,
                    opacity: (loading || !passwordValid || !passwordMatch) ? 0.6 : 1
                  }}
                >
                  {loading ? "재설정 중..." : "새 비밀번호 설정 완료"}
                </button>

                <button
                  type="button"
                  onClick={() => { setMode("login"); setReauthTicket(null); setErrorMsg(""); setSuccessMsg(""); }}
                  style={{ ...styles.textLink, textAlign: "center", marginTop: 4 }}
                >
                  취소하고 로그인으로 돌아가기
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    backgroundColor: "var(--bg)",
    padding: "20px",
    boxSizing: "border-box"
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    backgroundColor: "var(--card)",
    borderRadius: "var(--radius-card, 16px)",
    border: "1px solid var(--border)",
    padding: "32px 28px",
    boxSizing: "border-box",
    boxShadow: "0 10px 30px rgba(0,0,0,0.3)"
  },
  logoImage: {
    width: "56px",
    height: "52px",
    objectFit: "contain",
    display: "block",
    filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))"
  },
  logoBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "48px",
    height: "48px",
    borderRadius: "14px",
    backgroundColor: "var(--accent-bg, rgba(249, 115, 22, 0.12))",
    color: "var(--accent, #f97316)",
    fontSize: "24px",
    fontWeight: "800"
  },
  tabContainer: {
    display: "flex",
    backgroundColor: "var(--card-subtle)",
    borderRadius: "12px",
    padding: "4px",
    marginBottom: "20px",
    border: "1px solid var(--border)"
  },
  tabBtn: {
    flex: 1,
    padding: "10px 0",
    border: "none",
    borderRadius: "8px",
    backgroundColor: "transparent",
    color: "var(--sub)",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "all 0.15s ease"
  },
  tabBtnActive: {
    backgroundColor: "var(--card)",
    color: "var(--text)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
  },
  modeBadge: {
    display: "inline-block",
    backgroundColor: "var(--accent-bg, rgba(249, 115, 22, 0.12))",
    color: "var(--accent)",
    padding: "4px 12px",
    borderRadius: "9999px",
    fontSize: "12px",
    fontWeight: "700"
  },
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: "700",
    color: "var(--sub)",
    marginBottom: "6px"
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    backgroundColor: "var(--input-bg)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    color: "var(--text)",
    fontSize: "14px",
    outline: "none",
    transition: "border-color 0.15s"
  },
  eyeBtn: {
    position: "absolute",
    right: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    display: "flex",
    alignItems: "center"
  },
  primaryBtn: {
    width: "100%",
    padding: "13px",
    backgroundColor: "var(--accent, #f97316)",
    color: "var(--accent-contrast, #ffffff)",
    border: "none",
    borderRadius: "12px",
    fontSize: "14px",
    fontWeight: "800",
    cursor: "pointer",
    transition: "opacity 0.15s"
  },
  divider: {
    display: "flex",
    alignItems: "center",
    margin: "18px 0 14px"
  },
  dividerLine: {
    flex: 1,
    height: "1px",
    backgroundColor: "var(--border)"
  },
  dividerText: {
    padding: "0 10px",
    fontSize: "12px",
    color: "var(--sub)"
  },
  googleBtn: {
    width: "100%",
    padding: "11px",
    backgroundColor: "#ffffff",
    color: "#3c4043",
    border: "1px solid #dadce0",
    borderRadius: "12px",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    transition: "background-color 0.15s"
  },
  naverBtn: {
    width: "100%",
    padding: "11px",
    backgroundColor: "#03C75A",
    color: "#ffffff",
    border: "none",
    borderRadius: "12px",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    transition: "background-color 0.15s"
  },
  textLink: {
    background: "none",
    border: "none",
    color: "var(--accent, #f97316)",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    padding: 0
  },
  criteriaBox: {
    marginTop: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    backgroundColor: "var(--card-subtle)",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid var(--border)"
  },
  criteriaItem: (satisfied) => ({
    fontSize: "11px",
    color: satisfied ? "var(--success)" : "var(--sub)",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontWeight: satisfied ? "700" : "500"
  }),
  criteriaCheck: (satisfied) => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    backgroundColor: satisfied ? "var(--success)" : "rgba(156, 163, 175, 0.2)",
    color: satisfied ? "#ffffff" : "var(--sub)",
    fontSize: "9px",
    fontWeight: "800"
  }),
  alertError: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    border: "1px solid var(--danger)",
    color: "var(--danger)",
    padding: "10px 12px",
    borderRadius: "8px",
    fontSize: "13px",
    marginBottom: "14px"
  },
  alertSuccess: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    border: "1px solid var(--success)",
    color: "var(--success)",
    padding: "10px 12px",
    borderRadius: "8px",
    fontSize: "13px",
    marginBottom: "14px"
  }
};
