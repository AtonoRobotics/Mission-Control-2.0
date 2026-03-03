/**
 * Mission Control — Axios API client with JWT interceptor.
 * Auto-attaches Bearer token and refreshes on 401.
 */

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { 'Content-Type': 'application/json' },
});

let isRefreshing = false;
let failedQueue: { resolve: (token: string) => void; reject: (err: unknown) => void }[] = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token!);
  });
  failedQueue = [];
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mc_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          },
          reject,
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    const refreshToken = localStorage.getItem('mc_refresh_token');
    if (!refreshToken) {
      isRefreshing = false;
      localStorage.removeItem('mc_access_token');
      localStorage.removeItem('mc_refresh_token');
      window.location.href = '/';
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post(`${API_BASE}/api/auth/refresh`, {
        refresh_token: refreshToken,
      });
      localStorage.setItem('mc_access_token', data.access_token);
      localStorage.setItem('mc_refresh_token', data.refresh_token);
      processQueue(null, data.access_token);
      original.headers.Authorization = `Bearer ${data.access_token}`;
      return api(original);
    } catch (refreshError) {
      processQueue(refreshError, null);
      localStorage.removeItem('mc_access_token');
      localStorage.removeItem('mc_refresh_token');
      window.location.href = '/';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
