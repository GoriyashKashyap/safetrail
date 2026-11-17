import axios from 'axios';

export const TOKEN_KEY = 'safetrail.token';

/**
 * Origin of the API server.
 * Empty in development: requests stay relative and the Vite proxy forwards
 * them to localhost. In a deployed build set VITE_API_URL to the backend
 * origin (e.g. https://safetrail-service.onrender.com) — a trailing "/api"
 * is also accepted and stripped.
 */
export const SERVER_URL = (import.meta.env.VITE_API_URL || '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');

const api = axios.create({
  baseURL: SERVER_URL ? `${SERVER_URL}/api` : '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLoginAttempt = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLoginAttempt && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.assign('/login?expired=1');
    }
    return Promise.reject(err);
  }
);

/** Pull a human-readable message out of an API error. */
export const apiError = (err, fallback = 'Something went wrong. Please try again.') =>
  err?.response?.data?.message || err?.message || fallback;

export default api;
