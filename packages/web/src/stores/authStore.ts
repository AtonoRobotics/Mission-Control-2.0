/**
 * Mission Control — Auth Store (Zustand)
 * Manages user session, JWT tokens, and auth state.
 */

import { create } from 'zustand';
import api from '@/services/api';

export interface User {
  user_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  auth_provider: string;
  role: string;
  team_id: string | null;
  created_at: string;
  last_login: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  handleOAuthCallback: (accessToken: string, refreshToken: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('mc_access_token'),
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('mc_access_token', data.access_token);
      localStorage.setItem('mc_refresh_token', data.refresh_token);

      const me = await api.get('/auth/me');
      set({ user: me.data, isAuthenticated: true, isLoading: false });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Login failed';
      set({ error: msg, isLoading: false });
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Best-effort — clear local state regardless
    }
    localStorage.removeItem('mc_access_token');
    localStorage.removeItem('mc_refresh_token');
    set({ user: null, isAuthenticated: false });
  },

  fetchMe: async () => {
    const token = localStorage.getItem('mc_access_token');
    if (!token) {
      set({ isAuthenticated: false });
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data, isAuthenticated: true });
    } catch {
      localStorage.removeItem('mc_access_token');
      localStorage.removeItem('mc_refresh_token');
      set({ user: null, isAuthenticated: false });
    }
  },

  handleOAuthCallback: async (accessToken, refreshToken) => {
    localStorage.setItem('mc_access_token', accessToken);
    localStorage.setItem('mc_refresh_token', refreshToken);
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data, isAuthenticated: true });
    } catch {
      localStorage.removeItem('mc_access_token');
      localStorage.removeItem('mc_refresh_token');
      set({ user: null, isAuthenticated: false });
    }
  },

  clearError: () => set({ error: null }),
}));
