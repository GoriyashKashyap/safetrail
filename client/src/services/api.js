import axios from 'axios';

export const TOKEN_KEY = 'safetrail.token';

/**
 * Origin of the API server.
 * Development: empty, so requests stay relative and the Vite proxy forwards
 * them to localhost. Production builds default to the deployed backend, so a
 * hosting provider that forgets VITE_API_URL still reaches the real API.
 * VITE_API_URL overrides both; a trailing "/api" is accepted and stripped.
 */
const PRODUCTION_API_ORIGIN = 'https://safetrail-service.onrender.com';

export const SERVER_URL = (
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? PRODUCTION_API_ORIGIN : '')
)
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
