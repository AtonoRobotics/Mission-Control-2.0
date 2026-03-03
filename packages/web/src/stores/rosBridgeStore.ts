import { create } from 'zustand';
import type { RosConnectionStatus } from '@/ros/connection';

interface RosBridgeState {
  status: RosConnectionStatus;
  url: string;
  error: string | null;
  setStatus: (status: RosConnectionStatus) => void;
  setError: (error: string | null) => void;
}

export const useRosBridgeStore = create<RosBridgeState>((set) => ({
  status: 'disconnected',
  url: `ws://${window.location.hostname}:${import.meta.env.VITE_ROSBRIDGE_PORT || '9090'}`,
  error: null,
  setStatus: (status) => set({ status, error: status === 'error' ? 'Connection error' : null }),
  setError: (error) => set({ error }),
}));
