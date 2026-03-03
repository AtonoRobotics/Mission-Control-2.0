/**
 * Mission Control — Notification Store (Zustand)
 * Manages in-app notifications for team events.
 */

import { create } from 'zustand';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;

  addNotification: (type: Notification['type'], title: string, message: string) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (type, title, message) =>
    set((state) => {
      const notification: Notification = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        type,
        title,
        message,
        timestamp: Date.now(),
        read: false,
      };
      return {
        notifications: [notification, ...state.notifications],
        unreadCount: state.unreadCount + 1,
      };
    }),

  markRead: (id) =>
    set((state) => {
      const n = state.notifications.find((n) => n.id === id);
      if (!n || n.read) return state;
      return {
        notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        unreadCount: Math.max(0, state.unreadCount - 1),
      };
    }),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  dismiss: (id) =>
    set((state) => {
      const n = state.notifications.find((n) => n.id === id);
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: n && !n.read ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      };
    }),

  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}));
