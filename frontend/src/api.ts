import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function logoutToLogin() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = String(error.config?.url || '');
    const isAuthAttempt = ['/auth/login', '/auth/register', '/auth/google'].some((path) => requestUrl.includes(path));

    // Do not clear an existing session when a login/register/Google attempt fails.
    // This keeps the real error visible on the login screen instead of silently
    // bouncing the user back to /login. For protected API calls, a 401 still
    // means the saved session is invalid/expired, so we clear it.
    if (error.response?.status === 401 && !isAuthAttempt) {
      logoutToLogin();
    }
    return Promise.reject(error);
  }
);

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (Array.isArray(detail)) return detail.map((item) => item.msg || String(item)).join(', ');
    if (typeof detail === 'string') return detail;
    return error.message;
  }
  return 'Something went wrong';
}
