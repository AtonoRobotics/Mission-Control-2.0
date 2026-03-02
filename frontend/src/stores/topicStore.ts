import { create } from 'zustand';

export interface TopicInfo {
  name: string;
  type: string;
  hz: number | null;
  lastMessage: number;
}

interface TopicState {
  topics: Map<string, TopicInfo>;
  setTopics: (topics: TopicInfo[]) => void;
  updateHz: (name: string, hz: number) => void;
}

export const useTopicStore = create<TopicState>((set) => ({
  topics: new Map(),
  setTopics: (topics) =>
    set({ topics: new Map(topics.map((t) => [t.name, t])) }),
  updateHz: (name, hz) =>
    set((state) => {
      const next = new Map(state.topics);
      const existing = next.get(name);
      if (existing) next.set(name, { ...existing, hz, lastMessage: Date.now() });
      return { topics: next };
    }),
}));
