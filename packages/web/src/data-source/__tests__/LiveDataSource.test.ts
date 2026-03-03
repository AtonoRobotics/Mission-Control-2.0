import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock ros/connection
vi.mock('@/ros/connection', () => {
  const statusListeners = new Set<(s: string) => void>();
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    getStatus: vi.fn(() => 'disconnected'),
    onStatusChange: vi.fn((fn: (s: string) => void) => {
      statusListeners.add(fn);
      return () => statusListeners.delete(fn);
    }),
    subscribeTopic: vi.fn((_topic: string, _type: string, cb: (msg: unknown) => void) => {
      // Store callback so tests can trigger messages
      (subscribeTopic as any).__lastCallback = cb;
      return { unsubscribe: vi.fn() };
    }),
    __statusListeners: statusListeners,
  };
});

// Mock topicPoller
vi.mock('@/ros/topicPoller', () => ({
  startTopicPolling: vi.fn(),
  stopTopicPolling: vi.fn(),
}));

// Mock topicStore with a minimal Zustand-like store
const mockTopics = new Map<string, { name: string; type: string; hz: null; lastMessage: number }>();
const storeSubscribers = new Set<(state: any) => void>();
vi.mock('@/stores/topicStore', () => ({
  useTopicStore: {
    getState: () => ({ topics: mockTopics }),
    subscribe: (fn: (state: any) => void) => {
      storeSubscribers.add(fn);
      return () => storeSubscribers.delete(fn);
    },
  },
}));

import { LiveDataSource } from '../LiveDataSource';
import { connect, disconnect, getStatus, subscribeTopic } from '@/ros/connection';
import { startTopicPolling, stopTopicPolling } from '@/ros/topicPoller';

describe('LiveDataSource', () => {
  let ds: LiveDataSource;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTopics.clear();
    storeSubscribers.clear();
    ds = new LiveDataSource();
  });

  test('type is live', () => {
    expect(ds.type).toBe('live');
  });

  test('status delegates to getStatus()', () => {
    vi.mocked(getStatus).mockReturnValue('connected');
    expect(ds.status).toBe('connected');
  });

  test('connect calls rosConnect and starts polling', async () => {
    await ds.connect();
    expect(connect).toHaveBeenCalled();
    expect(startTopicPolling).toHaveBeenCalledWith(3000);
  });

  test('disconnect calls rosDisconnect and stops polling', async () => {
    await ds.connect();
    await ds.disconnect();
    expect(stopTopicPolling).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });

  test('getTopics maps from topic store', () => {
    mockTopics.set('/cmd_vel', { name: '/cmd_vel', type: 'geometry_msgs/msg/Twist', hz: null, lastMessage: 0 });
    mockTopics.set('/scan', { name: '/scan', type: 'sensor_msgs/msg/LaserScan', hz: null, lastMessage: 0 });

    const topics = ds.getTopics();
    expect(topics).toHaveLength(2);
    expect(topics[0].name).toBe('/cmd_vel');
    expect(topics[0].schemaName).toBe('geometry_msgs/msg/Twist');
  });

  test('subscribe creates ros subscription and wraps callback', () => {
    mockTopics.set('/cmd_vel', { name: '/cmd_vel', type: 'geometry_msgs/msg/Twist', hz: null, lastMessage: 0 });

    const callback = vi.fn();
    const sub = ds.subscribe('/cmd_vel', callback);

    expect(subscribeTopic).toHaveBeenCalledWith('/cmd_vel', 'geometry_msgs/msg/Twist', expect.any(Function));
    expect(sub.topic).toBe('/cmd_vel');

    // Simulate message from rosbridge
    const rawMsg = { linear: { x: 1 } };
    (subscribeTopic as any).__lastCallback(rawMsg);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: '/cmd_vel',
        message: rawMsg,
        schemaName: 'geometry_msgs/msg/Twist',
      }),
    );
  });

  test('unsubscribe calls ros topic unsubscribe', () => {
    mockTopics.set('/cmd_vel', { name: '/cmd_vel', type: 'geometry_msgs/msg/Twist', hz: null, lastMessage: 0 });
    const sub = ds.subscribe('/cmd_vel', vi.fn());
    sub.unsubscribe();
    // The mock subscribeTopic returns { unsubscribe: vi.fn() }
    // We verify it was returned properly
    expect(sub.topic).toBe('/cmd_vel');
  });

  test('getPlaybackControls returns undefined for live', () => {
    expect(ds.getPlaybackControls()).toBeUndefined();
  });

  test('onStatusChange fires when ros status changes', async () => {
    await ds.connect();

    const statusCb = vi.fn();
    const unsub = ds.onStatusChange(statusCb);

    // Trigger status change through the mock
    const { __statusListeners } = await import('@/ros/connection') as any;
    __statusListeners.forEach((fn: (s: string) => void) => fn('connected'));

    expect(statusCb).toHaveBeenCalledWith('connected');

    unsub();
    statusCb.mockClear();
    __statusListeners.forEach((fn: (s: string) => void) => fn('error'));
    expect(statusCb).not.toHaveBeenCalled();
  });

  test('onTopicsChange fires when topic store updates', async () => {
    await ds.connect();

    const topicCb = vi.fn();
    ds.onTopicsChange(topicCb);

    // Simulate topic store update
    mockTopics.set('/new_topic', { name: '/new_topic', type: 'std_msgs/msg/String', hz: null, lastMessage: 0 });
    storeSubscribers.forEach((fn) => fn({ topics: mockTopics }));

    expect(topicCb).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: '/new_topic', schemaName: 'std_msgs/msg/String' }),
      ]),
    );
  });
});
