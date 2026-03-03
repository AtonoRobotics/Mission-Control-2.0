import { create } from 'zustand';

export type PageId =
  | 'overview'
  | 'viewer3d'
  | 'actionGraph'
  | 'rqtGraph'
  | 'robots'
  | 'fleet'
  | 'agents'
  | 'infrastructure'
  | 'registry'
  | 'pipelines';

interface NavState {
  activePage: PageId;
  setPage: (page: PageId) => void;
}

export const useNavStore = create<NavState>((set) => ({
  activePage: 'overview',
  setPage: (page) => set({ activePage: page }),
}));
