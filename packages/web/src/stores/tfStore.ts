import { create } from 'zustand';
import * as THREE from 'three';

export interface TFFrame {
  frameId: string;
  parentId: string;
  translation: THREE.Vector3;
  rotation: THREE.Quaternion;
  timestamp: number;
}

interface TFState {
  frames: Map<string, TFFrame>;
  frameList: string[];
  updateFrame: (frame: TFFrame) => void;
  getTransform: (frameId: string, targetFrame: string) => THREE.Matrix4 | null;
}

export const useTFStore = create<TFState>((set, get) => ({
  frames: new Map(),
  frameList: [],

  updateFrame: (frame) =>
    set((state) => {
      const next = new Map(state.frames);
      next.set(frame.frameId, frame);
      const frameList = Array.from(next.keys()).sort();
      return { frames: next, frameList };
    }),

  getTransform: (frameId, targetFrame) => {
    const { frames } = get();
    if (frameId === targetFrame) return new THREE.Matrix4();

    const chainToRoot = (fid: string): THREE.Matrix4[] => {
      const chain: THREE.Matrix4[] = [];
      let current = fid;
      const visited = new Set<string>();
      while (current && !visited.has(current)) {
        visited.add(current);
        const f = frames.get(current);
        if (!f) break;
        const mat = new THREE.Matrix4();
        mat.compose(f.translation, f.rotation, new THREE.Vector3(1, 1, 1));
        chain.push(mat);
        current = f.parentId;
      }
      return chain;
    };

    const chainA = chainToRoot(frameId);
    const chainB = chainToRoot(targetFrame);

    const result = new THREE.Matrix4();
    for (const m of chainA) result.premultiply(m);
    const targetMat = new THREE.Matrix4();
    for (const m of chainB) targetMat.premultiply(m);
    targetMat.invert();
    result.premultiply(targetMat);

    return result;
  },
}));
