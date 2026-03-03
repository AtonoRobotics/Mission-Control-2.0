/**
 * LiveDataSource — Adapter wrapping existing rosbridge connection
 * into the DataSource interface. Existing stores continue to work;
 * this is an adapter, not a rewrite.
 */

import {
  connect as rosConnect,
  disconnect as rosDisconnect,
  getStatus,
  onStatusChange as rosOnStatusChange,
  subscribeTopic,
} from '@/ros/connection';
import { startTopicPolling, stopTopicPolling } from '@/ros/topicPoller';
import { useTopicStore } from '@/stores/topicStore';
import type {
  DataSource,
  TopicInfo,
  MessageEvent,
  MessageCallback,
  Subscription,
  ConnectionStatus,
  PlaybackControls,
} from './types';

export class LiveDataSource implements DataSource {
  readonly type = 'live' as const;

  private statusListeners = new Set<(status: ConnectionStatus) => void>();
  private topicListeners = new Set<(topics: TopicInfo[]) => void>();
  private rosStatusUnsub: (() => void) | null = null;
  private topicStoreUnsub: (() => void) | null = null;

  get status(): ConnectionStatus {
    return getStatus();
  }

  async connect(): Promise<void> {
    rosConnect();

    // Bridge ros/connection status changes to our listeners
    this.rosStatusUnsub = rosOnStatusChange((status) => {
      this.statusListeners.forEach((fn) => fn(status));
    });

    // Bridge topic store changes to our listeners
    this.topicStoreUnsub = useTopicStore.subscribe((state) => {
      const topics = this.getTopics();
      this.topicListeners.forEach((fn) => fn(topics));
    });

    startTopicPolling(3000);
  }

  async disconnect(): Promise<void> {
    stopTopicPolling();
    this.rosStatusUnsub?.();
    this.rosStatusUnsub = null;
    this.topicStoreUnsub?.();
    this.topicStoreUnsub = null;
    rosDisconnect();
  }

  getTopics(): TopicInfo[] {
    const storeTopics = useTopicStore.getState().topics;
    const result: TopicInfo[] = [];
    storeTopics.forEach((t) => {
      result.push({ name: t.name, schemaName: t.type });
    });
    return result;
  }

  subscribe(topic: string, callback: MessageCallback): Subscription {
    // Look up the message type from the topic store
    const storeTopics = useTopicStore.getState().topics;
    const topicInfo = storeTopics.get(topic);
    const messageType = topicInfo?.type ?? '';

    const rosTopic = subscribeTopic(topic, messageType, (msg: unknown) => {
      const event: MessageEvent = {
        topic,
        message: msg,
        timestamp: Date.now(),
        receiveTime: Date.now(),
        schemaName: messageType,
      };
      callback(event);
    });

    return {
      topic,
      unsubscribe: () => rosTopic.unsubscribe(),
    };
  }

  getPlaybackControls(): PlaybackControls | undefined {
    return undefined; // Live sources have no playback
  }

  onStatusChange(callback: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  onTopicsChange(callback: (topics: TopicInfo[]) => void): () => void {
    this.topicListeners.add(callback);
    return () => this.topicListeners.delete(callback);
  }
}
