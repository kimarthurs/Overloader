// Overloader 강조색(Accent Color) 유틸리티

export const DEFAULT_ACCENT = "#f97316";

export const ACCENT_PRESETS = [
  { label: "오렌지 (기본)", hex: "#f97316" },
  { label: "크림슨 레드", hex: "#ef4444" },
  { label: "로즈 핑크", hex: "#f43f5e" },
  { label: "바이올렛", hex: "#8b5cf6" },
  { label: "스카이 블루", hex: "#0ea5e9" },
  { label: "에메랄드", hex: "#10b981" },
  { label: "앰버 골드", hex: "#f59e0b" },
  { label: "슬레이트", hex: "#64748b" },
];

export function isValidHex(hex) {
  return typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex);
}

export function applyAccentColor(rawHex) {
  const hex = isValidHex(rawHex) ? rawHex.toLowerCase() : DEFAULT_ACCENT;

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // Hover: 약 12% 톤 다운
  const hr = Math.max(0, Math.floor(r * 0.88)).toString(16).padStart(2, "0");
  const hg = Math.max(0, Math.floor(g * 0.88)).toString(16).padStart(2, "0");
  const hb = Math.max(0, Math.floor(b * 0.88)).toString(16).padStart(2, "0");
  const hoverHex = `#${hr}${hg}${hb}`;

  // 대비 계산: 밝은 배경(노랑/형광/흰색 등) 선택 시 텍스트 가독성 유지
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const contrast = lum > 165 ? "#111827" : "#ffffff";

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.style.setProperty("--accent", hex);
    root.style.setProperty("--accent-hover", hoverHex);
    root.style.setProperty("--accent-bg", `rgba(${r}, ${g}, ${b}, 0.14)`);
    root.style.setProperty("--accent-contrast", contrast);
  }

  try {
    localStorage.setItem("accentColor", hex);
  } catch {}

  return hex;
}

export function getSavedAccentColor() {
  try {
    const saved = localStorage.getItem("accentColor");
    if (saved && isValidHex(saved)) return saved;
  } catch {}
  return DEFAULT_ACCENT;
}
