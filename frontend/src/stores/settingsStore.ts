import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  fixedFrame: string;
  backgroundColor: string;
  showGrid: boolean;
  showAxes: boolean;
  gridSize: number;
  gridDivisions: number;
  setFixedFrame: (frame: string) => void;
  setSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      fixedFrame: 'base_link',
      backgroundColor: '#0a0a0a',
      showGrid: true,
      showAxes: true,
      gridSize: 10,
      gridDivisions: 20,
      setFixedFrame: (frame) => set({ fixedFrame: frame }),
      setSetting: (key, value) => set({ [key]: value } as any),
    }),
    { name: 'mc-settings' },
  ),
);
