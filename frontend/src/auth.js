import axios from "axios";

let authSessionId = 0;
let currentAbortController = new AbortController();
let isHandlingSessionExpiry = false;
let logoutCallback = null;
let interceptorsConfigured = false;

export function registerLogoutCallback(cb) {
  logoutCallback = cb;
}

export function getAuthSessionId() {
  return authSessionId;
}

export function initAuthSession(token, name, username) {
  authSessionId++;
  currentAbortController = new AbortController();
  if (token) {
    localStorage.setItem("token", token);
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  }
  if (name) {
    localStorage.setItem("userName", name);
  }
  if (username !== undefined) {
    if (username) {
      localStorage.setItem("userUsername", username);
    } else {
      localStorage.removeItem("userUsername");
    }
  }
}

export function clearAuthStorage() {
  localStorage.removeItem("token");
  localStorage.removeItem("userName");
  localStorage.removeItem("userUsername");
  delete axios.defaults.headers.common["Authorization"];
}

export function performLogout({ expired = false } = {}) {
  authSessionId++;
  try {
    currentAbortController.abort();
  } catch (e) {
    // ignore
  }
  currentAbortController = new AbortController();

  clearAuthStorage();

  if (logoutCallback) {
    logoutCallback();
  }

  if (expired) {
    alert("로그인이 만료되었어요. 다시 로그인해 주세요.");
  }
}

export function setupAuthInterceptors() {
  if (interceptorsConfigured) return;
  interceptorsConfigured = true;

  // Request interceptor: attach token, auth generation, and signal
  axios.interceptors.request.use(config => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
      config._authSessionId = authSessionId;
      config._authToken = token;
      if (!config.signal) {
        config.signal = currentAbortController.signal;
      }
    } else {
      if (config.headers && config.headers.Authorization) {
        delete config.headers.Authorization;
      }
    }
    return config;
  });

  // Response interceptor: handle stale responses and 401 session expiration
  axios.interceptors.response.use(
    response => {
      // Discard stale response if session changed or user logged out
      if (response.config?._authToken) {
        const currentToken = localStorage.getItem("token");
        if (
          !currentToken ||
          response.config._authSessionId !== authSessionId ||
          response.config._authToken !== currentToken
        ) {
          return new Promise(() => {});
        }
      }
      return response;
    },
    error => {
      const status = error.response ? error.response.status : null;
      const url = error.config?.url || "";
      const isLoginRequest = url.includes("/auth/");
      const hadAuth = !!(error.config?._authToken || error.config?.headers?.Authorization);

      if (status === 401 && !isLoginRequest && hadAuth) {
        const currentToken = localStorage.getItem("token");
        if (currentToken && !isHandlingSessionExpiry) {
          isHandlingSessionExpiry = true;
          performLogout({ expired: true });
          setTimeout(() => {
            isHandlingSessionExpiry = false;
          }, 1500);
        }
      }

      return Promise.reject(error);
    }
  );
}

// Automatically configure interceptors on import
setupAuthInterceptors();

// Export testing helper
export function __resetForTesting() {
  authSessionId = 0;
  isHandlingSessionExpiry = false;
  logoutCallback = null;
  currentAbortController = new AbortController();
  clearAuthStorage();
}
