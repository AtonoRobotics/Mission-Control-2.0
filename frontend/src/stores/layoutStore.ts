import { create } from 'zustand';
import type { MosaicNode } from 'react-mosaic-component';

export type PanelId = 'viewport3d' | 'rqtGraph' | 'actionGraph' | 'imageViewer' | 'displays' | 'topics' | 'properties';

const DEFAULT_LAYOUT: MosaicNode<PanelId> = {
  direction: 'row',
  first: {
    direction: 'column',
    first: 'displays',
    second: 'topics',
    splitPercentage: 60,
  },
  second: {
    direction: 'row',
    first: 'viewport3d',
    second: 'properties',
    splitPercentage: 80,
  },
  splitPercentage: 18,
};

interface LayoutState {
  layout: MosaicNode<PanelId> | null;
  setLayout: (layout: MosaicNode<PanelId> | null) => void;
  resetLayout: () => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  layout: DEFAULT_LAYOUT,
  setLayout: (layout) => set({ layout }),
  resetLayout: () => set({ layout: DEFAULT_LAYOUT }),
}));
