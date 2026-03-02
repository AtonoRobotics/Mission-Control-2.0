import { getRos } from './connection';
import { useTopicStore } from '@/stores/topicStore';
import { Service } from 'roslib';

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startTopicPolling(intervalMs = 3000) {
  if (pollTimer) return;

  const poll = () => {
    const ros = getRos();

    const topicsClient = new Service({
      ros,
      name: '/rosapi/topics',
      serviceType: 'rosapi/Topics',
    });

    topicsClient.callService(
      {},
      (result: any) => {
        const topics = (result.topics || []).map((name: string, i: number) => ({
          name,
          type: (result.types || [])[i] || 'unknown',
          hz: null,
          lastMessage: 0,
        }));
        useTopicStore.getState().setTopics(topics);
      },
      () => {},
    );
  };

  poll();
  pollTimer = setInterval(poll, intervalMs);
}

export function stopTopicPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
