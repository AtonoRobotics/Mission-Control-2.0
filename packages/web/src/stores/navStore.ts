import { create } from 'zustand';

export type WorkspaceMode =
  | 'build'
  | 'scene'
  | 'motion'
  | 'simulate'
  | 'deploy'
  | 'monitor';

interface NavState {
  activeMode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
}

export const useNavStore = create<NavState>((set) => ({
  activeMode: 'monitor',
  setMode: (mode) => set({ activeMode: mode }),
}));
