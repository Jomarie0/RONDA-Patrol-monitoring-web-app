/**
 * R.O.N.D.A. — Axios client with JWT attachment and refresh.
 */
import axios from 'axios';

export const API_BASE_URL = (process.env.REACT_APP_API_URL || 'https://ronda-patrol-monitoring-web-app.onrender.com/api').replace(/\/+$/, '');

export const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

export const WS_BASE_URL = (process.env.REACT_APP_WS_URL || `${BACKEND_ORIGIN.replace(/^http/i, 'ws')}/ws`).replace(/\/+$/, '');

export function toAbsoluteBackendUrl(value) {
  if (!value) return value;
  const v = String(value);
  if (/^https?:\/\//i.test(v) || /^data:/i.test(v) || /^blob:/i.test(v)) return v;
  if (v.startsWith('/')) return `${BACKEND_ORIGIN}${v}`;
  return `${BACKEND_ORIGIN}/${v}`;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

console.log('[API] Base URL:', API_BASE_URL);

let isRefreshing = false;
let refreshPromise = null;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token && !config.url.includes('/auth/token/')) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    if (!original) return Promise.reject(err);

    if (err.response?.status === 401 && !original._retry && !String(original.url || '').includes('/auth/token/')) {
      original._retry = true;

      const refresh = localStorage.getItem('refreshToken');
      if (!refresh) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(err);
      }

      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = axios
          .post(`${API_BASE_URL}/auth/token/refresh/`, { refresh })
          .then(({ data }) => {
            localStorage.setItem('accessToken', data.access);
            onRefreshed(data.access);
            return data.access;
          })
          .catch((e) => {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            window.location.href = '/login';
            throw e;
          })
          .finally(() => {
            isRefreshing = false;
            refreshPromise = null;
          });
      }

      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((token) => {
          try {
            original.headers = original.headers || {};
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          } catch (e) {
            reject(e);
          }
        });

        if (refreshPromise) {
          refreshPromise.catch(reject);
        }
      });
    }

    return Promise.reject(err);
  }
);

export default api;
