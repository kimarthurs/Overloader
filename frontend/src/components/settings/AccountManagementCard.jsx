import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { UserIcon, LogoutIcon, EyeIcon, EyeOffIcon } from "../common/Icons";

const API = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";
const SPECIAL_CHAR_REGEX = /[!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]/;

export default function AccountManagementCard({ userName, onLogout, onProfileUpdate }) {
  const [methods, setMethods] = useState(null);

  const [successMsg, setSuccessMsg] = useState("");

  // 모달 상태
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const [addPwdOpen, setAddPwdOpen] = useState(false);
  const [reauthTicket, setReauthTicket] = useState(null);
  const [unlinkConfirmTarget, setUnlinkConfirmTarget] = useState(null); // { type: "social"|"password", provider?: "google"|"naver" }

  // 폼 입력 상태
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [addUsername, setAddUsername] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [modalError, setModalError] = useState("");

  // ── 로그인 수단 요약 조회 ──
  const fetchMethods = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/auth/v2/account/methods`);
      setMethods(res.data);
    } catch (err) {
      // 404 or not supported yet -> fallback
      console.warn("Failed to fetch account methods:", err);
    } finally {
      // done fetching
    }
  }, []);

  useEffect(() => {
    fetchMethods();
    try {
      const params = new URLSearchParams(window.location.search);
      const ticketParam = params.get("ticket");
      const purposeParam = params.get("purpose");
      const statusParam = params.get("status");
      const errParam = params.get("error");

      if (ticketParam && purposeParam === "password_add") {
        setReauthTicket(ticketParam);
        setAddPwdOpen(true);
        setSuccessMsg("소셜 본인 인증이 완료되었습니다. 사용할 아이디와 비밀번호를 입력해 주세요.");
        window.history.replaceState({}, document.title, window.location.pathname + "?tab=settings");
      } else if (statusParam === "link_success") {
        const prov = params.get("provider") || "소셜";
        const provLabel = prov === "naver" ? "네이버" : prov === "google" ? "Google" : prov;
        setSuccessMsg(`${provLabel} 계정 연동이 완료되었습니다.`);
        window.history.replaceState({}, document.title, window.location.pathname + "?tab=settings");
      } else if (errParam) {
        if (errParam === "already_linked_to_other_user") {
          setModalError("해당 소셜 계정은 이미 다른 사용자의 계정에 연동되어 있습니다.");
        } else if (errParam === "reauth_user_mismatch") {
          setModalError("현재 로그인된 계정에 연동된 소셜 계정과 일치하지 않습니다.");
        } else if (errParam === "google_oauth_pending") {
          setModalError("구글 소셜 계정 연동은 준비 중입니다. 현재는 네이버 소셜 계정 연동을 지원합니다.");
        } else {
          setModalError(`인증 오류: ${errParam}`);
        }
        window.history.replaceState({}, document.title, window.location.pathname + "?tab=settings");
      }
    } catch (e) {
      // ignore
    }
  }, [fetchMethods]);

  // ── 비밀번호 복잡도 실시간 검증 ──
  const criteria = useMemo(() => {
    return {
      length: newPassword.length >= 8 && newPassword.length <= 128,
      hasUpper: /[A-Z]/.test(newPassword),
      hasLower: /[a-z]/.test(newPassword),
      hasNumber: /[0-9]/.test(newPassword),
      hasSpecial: SPECIAL_CHAR_REGEX.test(newPassword),
    };
  }, [newPassword]);

  const isPasswordValid = useMemo(() => {
    return criteria.length && criteria.hasUpper && criteria.hasLower && criteria.hasNumber && criteria.hasSpecial;
  }, [criteria]);

  const isPasswordMatch = useMemo(() => {
    return newPassword && confirmPassword && newPassword === confirmPassword;
  }, [newPassword, confirmPassword]);

  // ── 비밀번호 변경 실행 (재인증 -> 변경 -> 새 토큰 저장) ──
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword || !isPasswordValid || !isPasswordMatch || actionLoading) return;

    setActionLoading(true);
    setModalError("");

    try {
      // 1. 현재 비밀번호로 재인증 티켓 발급
      const reauthRes = await axios.post(`${API}/auth/v2/reauth/password`, {
        password: currentPassword,
        purpose: "password_change"
      });
      const ticket = reauthRes.data.reauth_ticket;

      // 2. 재인증 티켓으로 비밀번호 변경
      const changeRes = await axios.post(`${API}/auth/v2/account/password/change`, {
        reauth_ticket: ticket,
        new_password: newPassword
      });

      // 3. 새 JWT로 세션 즉시 갱신
      if (changeRes.data.token) {
        localStorage.setItem("token", changeRes.data.token);
        axios.defaults.headers.common["Authorization"] = `Bearer ${changeRes.data.token}`;
      }

      setSuccessMsg("비밀번호가 성공적으로 변경되었습니다.");
      setTimeout(() => setSuccessMsg(""), 3500);
      setChangePwdOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      fetchMethods();
      onProfileUpdate?.();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setModalError(detail || "비밀번호 변경에 실패했습니다. 현재 비밀번호를 다시 확인하세요.");
    } finally {
      setActionLoading(false);
    }
  };

  // ── 소셜 전용 계정에 아이디/비밀번호 추가 ──
  const handleAddPassword = async (e) => {
    e.preventDefault();
    const cleanUsername = addUsername.trim().toLowerCase();
    if (!cleanUsername || !isPasswordValid || !isPasswordMatch || actionLoading) return;

    if (!reauthTicket) {
      startSocialReauthForPasswordAdd();
      return;
    }

    setActionLoading(true);
    setModalError("");

    try {
      const addRes = await axios.post(`${API}/auth/v2/account/password/add`, {
        username: cleanUsername,
        password: newPassword,
        reauth_ticket: reauthTicket
      });

      if (addRes.data.token) {
        localStorage.setItem("token", addRes.data.token);
        axios.defaults.headers.common["Authorization"] = `Bearer ${addRes.data.token}`;
      }

      setSuccessMsg("아이디와 비밀번호가 성공적으로 등록되었습니다.");
      setTimeout(() => setSuccessMsg(""), 3500);
      setAddPwdOpen(false);
      setReauthTicket(null);
      setAddUsername("");
      setNewPassword("");
      setConfirmPassword("");
      fetchMethods();
      onProfileUpdate?.();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setModalError(detail || "아이디/비밀번호 등록에 실패했습니다.");
    } finally {
      setActionLoading(false);
    }
  };

  const startSocialReauthForPasswordAdd = async (overrideProvider) => {
    setActionLoading(true);
    setModalError("");
    try {
      const prov = overrideProvider || methods?.social_accounts?.[0]?.provider || "naver";
      const redirectUri = `${window.location.origin}?tab=settings`;
      const res = await axios.post(`${API}/auth/v2/oauth/${prov}/authorize-url`, {
        purpose: "reauth",
        target_purpose: "password_add",
        redirect_uri: redirectUri
      });
      const authUrl = res.data.authorization_url;
      if (authUrl.startsWith("https://nid.naver.com/") || authUrl.startsWith("https://accounts.google.com/") || authUrl.startsWith("/auth/v2/oauth/")) {
        window.location.href = authUrl;
      } else {
        throw new Error("허용되지 않은 인가 URL입니다.");
      }
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || "소셜 본인 인증 시작에 실패했습니다.";
      setModalError(detail);
      setActionLoading(false);
    }
  };

  // ── 로그인 수단 해제 실행 ──
  const executeUnlink = async () => {
    if (!unlinkConfirmTarget || actionLoading) return;
    setActionLoading(true);
    setModalError("");

    try {
      if (unlinkConfirmTarget.type === "password") {
        if (!methods?.has_password) return;
        // 비밀번호 해제를 위한 현재 비밀번호 재인증
        const reauthRes = await axios.post(`${API}/auth/v2/reauth/password`, {
          password: currentPassword,
          purpose: "password_unlink"
        });
        const ticket = reauthRes.data.reauth_ticket;

        const res = await axios.post(`${API}/auth/v2/account/password/unlink`, {
          reauth_ticket: ticket
        });

        if (res.data.token) {
          localStorage.setItem("token", res.data.token);
          axios.defaults.headers.common["Authorization"] = `Bearer ${res.data.token}`;
        }
        setSuccessMsg("아이디/비밀번호 연결이 해제되었습니다.");
      } else if (unlinkConfirmTarget.type === "social") {
        const prov = unlinkConfirmTarget.provider;
        // 소셜 연동 해제를 위해 비밀번호(있다면)로 재인증
        if (methods?.has_password) {
          const reauthRes = await axios.post(`${API}/auth/v2/reauth/password`, {
            password: currentPassword,
            purpose: "social_unlink"
          });
          const ticket = reauthRes.data.reauth_ticket;

          await axios.post(`${API}/auth/v2/account/social/unlink`, {
            provider: prov,
            reauth_ticket: ticket
          });
          setSuccessMsg(`${prov} 계정 연동이 해제되었습니다.`);
        } else {
          // 비밀번호가 없는데 다른 소셜이 있는 경우
          alert("소셜 연동 해제를 위해 본인 인증이 필요합니다.");
          return;
        }
      }

      setTimeout(() => setSuccessMsg(""), 3500);
      setUnlinkConfirmTarget(null);
      setCurrentPassword("");
      fetchMethods();
      onProfileUpdate?.();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setModalError(detail || "연동 해제에 실패했습니다.");
    } finally {
      setActionLoading(false);
    }
  };

  // ── 소셜 계정 연동 시작 (Google / Naver link) ──
  const startOAuthLink = async (provider) => {
    setActionLoading(true);
    setModalError("");
    try {
      const redirectUri = `${window.location.origin}?tab=settings`;
      const res = await axios.post(`${API}/auth/v2/oauth/${provider}/authorize-url`, {
        purpose: "link",
        redirect_uri: redirectUri
      });
      const authUrl = res.data.authorization_url;
      if (authUrl.startsWith("https://nid.naver.com/") || authUrl.startsWith("https://accounts.google.com/") || authUrl.startsWith("/auth/v2/oauth/")) {
        window.location.href = authUrl;
      } else {
        throw new Error("허용되지 않은 인가 URL입니다.");
      }
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || "소셜 계정 연동 시작에 실패했습니다.";
      setModalError(detail);
      setActionLoading(false);
    }
  };

  const googleAcc = methods?.social_accounts?.find(a => a.provider === "google");
  const naverAcc = methods?.social_accounts?.find(a => a.provider === "naver");

  return (
    <div style={styles.card}>
      {/* 1. 상단 프로필 요약 및 로그아웃 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={styles.avatar}>
            <UserIcon size={22} color="var(--sub)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: "700", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {userName || "사용자"}
            </div>
            <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
              {methods?.username ? `아이디: @${methods.username}` : "소셜 로그인 전용 계정"}
            </div>
          </div>
        </div>

        <button
          onClick={onLogout}
          style={styles.btnGhost}
          title="로그아웃"
        >
          <LogoutIcon size={16} color="var(--sub)" />
          <span>로그아웃</span>
        </button>
      </div>

      {/* 상태 알림 메시지 */}
      {successMsg && (
        <div style={styles.alertSuccess}>
          ✅ {successMsg}
        </div>
      )}

      {/* 2. 로그인 수단 관리 섹션 */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: "700", color: "var(--text)" }}>
            로그인 수단 관리
          </div>
          {methods && (
            <span style={styles.methodCountBadge}>
              총 {methods.total_methods || 1}개 연동됨
            </span>
          )}
        </div>

        {/* (1) 일반 아이디/비밀번호 행 */}
        <div style={styles.methodRow}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={styles.methodIconBadge}>🔑</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: "600", color: "var(--text)" }}>
                아이디 / 비밀번호
              </div>
              <div style={{ fontSize: 12, color: "var(--sub)" }}>
                {methods?.has_password ? `@${methods.username}` : "미등록 (소셜 로그인만 사용 중)"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            {methods?.has_password ? (
              <>
                <button
                  type="button"
                  onClick={() => { setChangePwdOpen(true); setModalError(""); }}
                  style={styles.btnSmall}
                >
                  비밀번호 변경
                </button>
                <button
                  type="button"
                  disabled={!methods.can_unlink_password}
                  onClick={() => {
                    setUnlinkConfirmTarget({ type: "password" });
                    setModalError("");
                  }}
                  style={{
                    ...styles.btnSmallDanger,
                    opacity: methods.can_unlink_password ? 1 : 0.4,
                    cursor: methods.can_unlink_password ? "pointer" : "not-allowed"
                  }}
                  title={methods.can_unlink_password ? "비밀번호 해제" : "마지막 로그인 수단은 해제할 수 없습니다"}
                >
                  해제
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => { setAddPwdOpen(true); setModalError(""); }}
                style={styles.btnSmallPrimary}
              >
                아이디/비밀번호 등록
              </button>
            )}
          </div>
        </div>

        {/* (2) Google 연동 행 */}
        <div style={styles.methodRow}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={styles.methodIconBadge}>G</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: "600", color: "var(--text)" }}>
                Google 계정
              </div>
              <div style={{ fontSize: 12, color: "var(--sub)" }}>
                {googleAcc ? (googleAcc.email || "연동 완료") : "미연동"}
              </div>
            </div>
          </div>

          <div>
            {googleAcc ? (
              <button
                type="button"
                disabled={!methods?.can_unlink_social}
                onClick={() => {
                  setUnlinkConfirmTarget({ type: "social", provider: "google" });
                  setModalError("");
                }}
                style={{
                  ...styles.btnSmallDanger,
                  opacity: methods?.can_unlink_social ? 1 : 0.4,
                  cursor: methods?.can_unlink_social ? "pointer" : "not-allowed"
                }}
                title={methods?.can_unlink_social ? "Google 연동 해제" : "마지막 로그인 수단은 해제할 수 없습니다"}
              >
                연동 해제
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startOAuthLink("google")}
                style={styles.btnSmall}
              >
                Google 연동
              </button>
            )}
          </div>
        </div>

        {/* (3) Naver 연동 행 */}
        <div style={styles.methodRow}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ ...styles.methodIconBadge, color: "#03C75A", fontWeight: "900" }}>N</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: "600", color: "var(--text)" }}>
                네이버 계정
              </div>
              <div style={{ fontSize: 12, color: "var(--sub)" }}>
                {naverAcc ? (naverAcc.email || "연동 완료") : "미연동"}
              </div>
            </div>
          </div>

          <div>
            {naverAcc ? (
              <button
                type="button"
                disabled={!methods?.can_unlink_social}
                onClick={() => {
                  setUnlinkConfirmTarget({ type: "social", provider: "naver" });
                  setModalError("");
                }}
                style={{
                  ...styles.btnSmallDanger,
                  opacity: methods?.can_unlink_social ? 1 : 0.4,
                  cursor: methods?.can_unlink_social ? "pointer" : "not-allowed"
                }}
                title={methods?.can_unlink_social ? "네이버 연동 해제" : "마지막 로그인 수단은 해제할 수 없습니다"}
              >
                연동 해제
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startOAuthLink("naver")}
                style={styles.btnSmall}
              >
                네이버 연동
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── [모달 1] 비밀번호 변경 모달 ── */}
      {changePwdOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: "800", color: "var(--text)", margin: 0 }}>
                비밀번호 변경
              </h3>
              <button
                type="button"
                onClick={() => setChangePwdOpen(false)}
                style={styles.closeBtn}
              >
                ✕
              </button>
            </div>

            {modalError && <div style={styles.alertError}>{modalError}</div>}

            <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={styles.label}>현재 비밀번호</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="현재 비밀번호 확인"
                  required
                  style={styles.input}
                />
              </div>

              <div>
                <label style={styles.label}>새 비밀번호</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPwd ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="8~128자 영문 대소문자, 숫자, 기호"
                    required
                    style={{ ...styles.input, paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    style={styles.eyeBtn}
                    tabIndex={-1}
                  >
                    {showPwd ? <EyeOffIcon size={16} color="var(--sub)" /> : <EyeIcon size={16} color="var(--sub)" />}
                  </button>
                </div>

                {/* 5대 조건 실시간 인디케이터 */}
                <div style={styles.criteriaBox}>
                  <div style={styles.criteriaItem(criteria.length)}>
                    <span style={styles.criteriaCheck(criteria.length)}>✓</span> 8자 이상 128자 이하
                  </div>
                  <div style={styles.criteriaItem(criteria.hasUpper)}>
                    <span style={styles.criteriaCheck(criteria.hasUpper)}>✓</span> 영문 대문자
                  </div>
                  <div style={styles.criteriaItem(criteria.hasLower)}>
                    <span style={styles.criteriaCheck(criteria.hasLower)}>✓</span> 영문 소문자
                  </div>
                  <div style={styles.criteriaItem(criteria.hasNumber)}>
                    <span style={styles.criteriaCheck(criteria.hasNumber)}>✓</span> 숫자
                  </div>
                  <div style={styles.criteriaItem(criteria.hasSpecial)}>
                    <span style={styles.criteriaCheck(criteria.hasSpecial)}>✓</span> 특수문자(기호)
                  </div>
                </div>
              </div>

              <div>
                <label style={styles.label}>새 비밀번호 확인</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="새 비밀번호 다시 입력"
                  required
                  style={styles.input}
                />
                {confirmPassword && (
                  <div style={{ fontSize: 11, marginTop: 4, color: isPasswordMatch ? "var(--success)" : "var(--danger)" }}>
                    {isPasswordMatch ? "비밀번호가 일치합니다." : "비밀번호가 일치하지 않습니다."}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setChangePwdOpen(false)}
                  style={{ ...styles.btnGhost, flex: 1 }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !currentPassword || !isPasswordValid || !isPasswordMatch}
                  style={{
                    ...styles.btnPrimary,
                    flex: 1,
                    opacity: (actionLoading || !currentPassword || !isPasswordValid || !isPasswordMatch) ? 0.5 : 1
                  }}
                >
                  {actionLoading ? "변경 중..." : "변경 완료"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── [모달 2] 연동 해제 확인 모달 ── */}
      {unlinkConfirmTarget && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <h3 style={{ fontSize: 16, fontWeight: "800", color: "var(--danger)", margin: "0 0 12px" }}>
              ⚠️ 로그인 수단 해제
            </h3>
            <p style={{ fontSize: 13, color: "var(--sub)", lineHeight: 1.5, margin: "0 0 16px" }}>
              {unlinkConfirmTarget.type === "password"
                ? "아이디/비밀번호 로그인 수단을 해제합니다. 해제 후에는 연동된 소셜 계정으로만 로그인할 수 있습니다."
                : `${unlinkConfirmTarget.provider} 계정 연동을 해제합니다.`}
            </p>

            {modalError && <div style={styles.alertError}>{modalError}</div>}

            {methods?.has_password && (
              <div style={{ marginBottom: 16 }}>
                <label style={styles.label}>현재 비밀번호 입력 (본인 확인)</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="현재 비밀번호를 입력하세요"
                  required
                  style={styles.input}
                />
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => { setUnlinkConfirmTarget(null); setCurrentPassword(""); }}
                style={{ ...styles.btnGhost, flex: 1 }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={executeUnlink}
                disabled={actionLoading || (methods?.has_password && !currentPassword)}
                style={{
                  ...styles.btnDanger,
                  flex: 1,
                  opacity: (actionLoading || (methods?.has_password && !currentPassword)) ? 0.5 : 1
                }}
              >
                {actionLoading ? "해제 중..." : "해제 진행"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── [모달 3] 아이디/비밀번호 등록 모달 (소셜 전용 계정) ── */}
      {addPwdOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: "800", color: "var(--text)", margin: 0 }}>
                아이디 / 비밀번호 등록
              </h3>
              <button
                type="button"
                onClick={() => {
                  setAddPwdOpen(false);
                  setReauthTicket(null);
                  setModalError("");
                }}
                style={styles.closeBtn}
              >
                ✕
              </button>
            </div>

            {modalError && <div style={styles.alertError}>{modalError}</div>}

            {reauthTicket ? (
              // 2단계: 소셜 본인 인증 완료 후 아이디/비밀번호 입력 폼
              <>
                <div style={{ ...styles.alertSuccess, marginBottom: 14 }}>
                  ✅ 소셜 계정 본인 인증이 완료되었습니다. 등록할 아이디와 비밀번호를 입력해 주세요.
                </div>

                <form onSubmit={handleAddPassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={styles.label}>사용할 아이디</label>
                    <input
                      type="text"
                      value={addUsername}
                      onChange={(e) => setAddUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                      placeholder="4~20자 영문 소문자, 숫자, _"
                      required
                      style={styles.input}
                    />
                  </div>

                  <div>
                    <label style={styles.label}>비밀번호</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="8~128자 영문 대소문자, 숫자, 기호"
                      required
                      style={styles.input}
                    />
                    <div style={styles.criteriaBox}>
                      <div style={styles.criteriaItem(criteria.length)}>
                        <span style={styles.criteriaCheck(criteria.length)}>✓</span> 8자 이상 128자 이하
                      </div>
                      <div style={styles.criteriaItem(criteria.hasUpper)}>
                        <span style={styles.criteriaCheck(criteria.hasUpper)}>✓</span> 영문 대문자
                      </div>
                      <div style={styles.criteriaItem(criteria.hasLower)}>
                        <span style={styles.criteriaCheck(criteria.hasLower)}>✓</span> 영문 소문자
                      </div>
                      <div style={styles.criteriaItem(criteria.hasNumber)}>
                        <span style={styles.criteriaCheck(criteria.hasNumber)}>✓</span> 숫자
                      </div>
                      <div style={styles.criteriaItem(criteria.hasSpecial)}>
                        <span style={styles.criteriaCheck(criteria.hasSpecial)}>✓</span> 특수문자(기호)
                      </div>
                    </div>
                  </div>

                  <div>
                    <label style={styles.label}>비밀번호 확인</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="비밀번호 다시 입력"
                      required
                      style={styles.input}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setAddPwdOpen(false);
                        setReauthTicket(null);
                        setModalError("");
                      }}
                      style={{ ...styles.btnGhost, flex: 1 }}
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading || !addUsername || !isPasswordValid || !isPasswordMatch}
                      style={{
                        ...styles.btnPrimary,
                        flex: 1,
                        opacity: (actionLoading || !addUsername || !isPasswordValid || !isPasswordMatch) ? 0.5 : 1
                      }}
                    >
                      {actionLoading ? "등록 처리 중..." : "아이디/비밀번호 등록 완료"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              // 1단계: 소셜 본인 인증 시작 안내
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ fontSize: 13, color: "var(--sub)", lineHeight: 1.6, margin: 0 }}>
                  소셜 로그인 전용 계정입니다.<br />
                  보안을 위해 먼저 연동된 소셜 계정으로 본인 인증을 진행한 후 아이디와 비밀번호를 등록합니다.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                  {methods?.social_accounts?.map((acc) => (
                    <button
                      key={acc.provider}
                      type="button"
                      disabled={actionLoading}
                      onClick={() => startSocialReauthForPasswordAdd(acc.provider)}
                      style={{
                        ...styles.btnPrimary,
                        backgroundColor: acc.provider === "naver" ? "#03C75A" : "var(--accent)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        padding: "12px",
                        fontSize: "14px",
                        fontWeight: "700"
                      }}
                    >
                      <span>{acc.provider === "naver" ? "네이버" : "Google"} 계정으로 본인 인증</span>
                    </button>
                  ))}
                  {(!methods?.social_accounts || methods.social_accounts.length === 0) && (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => startSocialReauthForPasswordAdd("naver")}
                      style={{ ...styles.btnPrimary, padding: "12px" }}
                    >
                      소셜 계정 본인 인증 시작
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setAddPwdOpen(false);
                      setModalError("");
                    }}
                    style={{ ...styles.btnGhost, padding: "8px 16px" }}
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  card: {
    background: "var(--card)",
    borderRadius: "var(--radius-card, 16px)",
    padding: "20px",
    border: "1px solid var(--border)",
    marginBottom: "16px",
    boxSizing: "border-box"
  },
  avatar: {
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
  },
  btnGhost: {
    background: "transparent",
    color: "var(--sub)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-pill, 9999px)",
    padding: "8px 14px",
    fontWeight: "600",
    fontSize: "13px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px"
  },
  methodCountBadge: {
    fontSize: "11px",
    fontWeight: "700",
    backgroundColor: "var(--accent-bg, rgba(249, 115, 22, 0.12))",
    color: "var(--accent, #f97316)",
    padding: "2px 8px",
    borderRadius: "9999px"
  },
  methodRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px",
    backgroundColor: "var(--card-subtle)",
    borderRadius: "12px",
    border: "1px solid var(--border)",
    marginBottom: "8px"
  },
  methodIconBadge: {
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    backgroundColor: "var(--input-bg)",
    border: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px"
  },
  btnSmall: {
    background: "var(--card)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer"
  },
  btnSmallPrimary: {
    background: "var(--accent, #f97316)",
    color: "var(--accent-contrast, #ffffff)",
    border: "none",
    borderRadius: "8px",
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer"
  },
  btnSmallDanger: {
    background: "rgba(239, 68, 68, 0.12)",
    color: "var(--danger, #ef4444)",
    border: "1px solid var(--danger, #ef4444)",
    borderRadius: "8px",
    padding: "6px 10px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer"
  },
  btnPrimary: {
    background: "var(--accent, #f97316)",
    color: "var(--accent-contrast, #ffffff)",
    border: "none",
    borderRadius: "10px",
    padding: "10px 16px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer"
  },
  btnDanger: {
    background: "var(--danger, #ef4444)",
    color: "#ffffff",
    border: "none",
    borderRadius: "10px",
    padding: "10px 16px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer"
  },
  label: {
    display: "block",
    fontSize: "11px",
    fontWeight: "700",
    color: "var(--sub)",
    marginBottom: "4px"
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    backgroundColor: "var(--input-bg)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    color: "var(--text)",
    fontSize: "13px",
    outline: "none"
  },
  eyeBtn: {
    position: "absolute",
    right: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    display: "flex",
    alignItems: "center"
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: "20px"
  },
  modalBox: {
    width: "100%",
    maxWidth: "400px",
    backgroundColor: "var(--card)",
    borderRadius: "16px",
    border: "1px solid var(--border)",
    padding: "24px",
    boxShadow: "0 12px 32px rgba(0,0,0,0.5)"
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--sub)",
    fontSize: "16px",
    cursor: "pointer",
    padding: "4px"
  },
  criteriaBox: {
    marginTop: "6px",
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    backgroundColor: "var(--card-subtle)",
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid var(--border)"
  },
  criteriaItem: (satisfied) => ({
    fontSize: "10px",
    color: satisfied ? "var(--success)" : "var(--sub)",
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontWeight: satisfied ? "700" : "500"
  }),
  criteriaCheck: (satisfied) => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    backgroundColor: satisfied ? "var(--success)" : "rgba(156, 163, 175, 0.2)",
    color: satisfied ? "#ffffff" : "var(--sub)",
    fontSize: "8px",
    fontWeight: "800"
  }),
  alertSuccess: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    border: "1px solid var(--success)",
    color: "var(--success)",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    marginTop: "12px"
  },
  alertError: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    border: "1px solid var(--danger)",
    color: "var(--danger)",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    marginBottom: "12px"
  }
};
