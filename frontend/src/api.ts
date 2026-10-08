import axios from "axios";

const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");
const localHostnames = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
const runningLocally = typeof window !== "undefined" && localHostnames.has(window.location.hostname);

// Production should use the same-origin /api route through Caddy. This avoids a
// broken browser request to the visitor's own localhost when VITE_API_URL is not
// present during a production build.
export const API_URL = configuredApiUrl || (runningLocally ? "http://localhost:8000" : "/api");

export function websocketApiBase(): string {
  if (/^https?:\/\//i.test(API_URL)) return API_URL.replace(/^http/i, "ws");
  if (typeof window === "undefined") return API_URL;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const path = API_URL.startsWith("/") ? API_URL : `/${API_URL}`;
  return `${protocol}//${window.location.host}${path}`;
}

export function logoutToLogin() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("account_profile_cache");
  localStorage.removeItem("account_bootstrap_cache_v106");
  localStorage.removeItem("account_is_admin");
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const requestUrl = String(error.config?.url || "");
    const status = Number(error.response?.status || 0);
    const method = String(error.config?.method || "get").toLowerCase();
    const config = error.config as any;
    const transient = status === 502 || status === 503 || status === 504 || (!error.response && Boolean(error.request));
    const retryableLogin = method === "post" && requestUrl.includes("/auth/login");
    const retryableRequest = method === "get" || retryableLogin;
    const retryLimit = retryableLogin ? 3 : 3;
    if (transient && retryableRequest && !requestUrl.includes("/health/") && Number(config?._ghmRetryCount || 0) < retryLimit) {
      config._ghmRetryCount = Number(config._ghmRetryCount || 0) + 1;
      const retryAfter = Number(error.response?.headers?.["retry-after"] || 0);
      const baseDelay = retryableLogin ? 700 : 650;
      const exponentialDelay = baseDelay * Math.pow(2, Math.max(0, config._ghmRetryCount - 1));
      const waitMs = retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : Math.min(exponentialDelay, 5000);
      await new Promise((resolve) => window.setTimeout(resolve, waitMs));
      return api.request(config);
    }
    const isAuthAttempt = [
      "/auth/login",
      "/auth/register",
      "/auth/google",
    ].some((path) => requestUrl.includes(path));

    // Do not clear an existing session when a login/register/Google attempt fails.
    // This keeps the real error visible on the login screen instead of silently
    // bouncing the user back to /login. For protected API calls, a 401 still
    // means the saved session is invalid/expired, so we clear it.
    if (error.response?.status === 401 && !isAuthAttempt) {
      localStorage.setItem(
        "session_expired_message",
        "Your session expired. Please sign in again.",
      );
      logoutToLogin();
    }
    return Promise.reject(error);
  },
);

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;

    if (Array.isArray(detail)) {
      return detail
        .map((item) => item?.msg || item?.message || String(item))
        .join(", ");
    }

    if (typeof detail === "string") return detail;

    if (detail && typeof detail === "object") {
      const message = (detail as { message?: unknown; error?: unknown; reason?: unknown }).message
        || (detail as { message?: unknown; error?: unknown; reason?: unknown }).error
        || (detail as { message?: unknown; error?: unknown; reason?: unknown }).reason;
      if (typeof message === "string" && message.trim()) return message;
    }

    const topMessage = error.response?.data?.message;
    if (typeof topMessage === "string" && topMessage.trim()) return topMessage;

    if (error.response?.status === 502) return "GHM reached the server, but the household service is temporarily unavailable. Your data is not deleted. Please retry in a moment.";
    if (error.response?.status === 503 || error.response?.status === 504) return typeof detail === "string" ? detail : "GHM is reconnecting to your household data. Please retry in a moment.";
    if (!error.response && error.request) return "GHM could not reach the server. Check your connection and try again.";
    return error.message || "Something went wrong";
  }
  return "Something went wrong";
}


export async function probeApiHealth(): Promise<{ live: boolean; ready: boolean; detail?: string }> {
  try {
    const live = await axios.get(`${API_URL}/health/live`, { timeout: 5000, headers: { "Cache-Control": "no-cache" } });
    if (live.status < 200 || live.status >= 300) return { live: false, ready: false, detail: "GHM service is not responding." };
  } catch (error) {
    return { live: false, ready: false, detail: axios.isAxiosError(error) ? error.message : "GHM service is not responding." };
  }
  try {
    const ready = await axios.get(`${API_URL}/health/ready`, { timeout: 5000, headers: { "Cache-Control": "no-cache" } });
    return { live: true, ready: ready.status >= 200 && ready.status < 300 };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const detail = error.response?.data?.detail;
      return { live: true, ready: false, detail: typeof detail === "string" ? detail : "GHM is reconnecting to your household data." };
    }
    return { live: true, ready: false, detail: "GHM is reconnecting to your household data." };
  }
}
