import { describe, test, expect } from 'vitest';
import type {
  DataSource, TopicInfo, MessageEvent, ConnectionStatus,
  PlaybackState, Subscription, DataSourceType,
} from '../types';

describe('DataSource types', () => {
  test('TopicInfo has required fields', () => {
    const topic: TopicInfo = {
      name: '/camera/image',
      schemaName: 'sensor_msgs/msg/Image',
    };
    expect(topic.name).toBe('/camera/image');
    expect(topic.schemaName).toBe('sensor_msgs/msg/Image');
  });

  test('MessageEvent has required fields', () => {
    const event: MessageEvent = {
      topic: '/cmd_vel',
      message: { linear: { x: 1 } },
      timestamp: Date.now(),
      receiveTime: Date.now(),
      schemaName: 'geometry_msgs/msg/Twist',
    };
    expect(event.topic).toBe('/cmd_vel');
    expect(event.schemaName).toContain('Twist');
  });

  test('ConnectionStatus is valid union', () => {
    const statuses: ConnectionStatus[] = ['disconnected', 'connecting', 'connected', 'error'];
    expect(statuses).toHaveLength(4);
  });

  test('DataSourceType is valid union', () => {
    const types: DataSourceType[] = ['live', 'mcap'];
    expect(types).toHaveLength(2);
  });

  test('PlaybackState has timing fields', () => {
    const state: PlaybackState = {
      isPlaying: false,
      currentTime: 1000,
      startTime: 0,
      endTime: 5000,
      speed: 1.0,
      loop: false,
    };
    expect(state.endTime - state.startTime).toBe(5000);
  });

  test('Subscription has unsubscribe', () => {
    let called = false;
    const sub: Subscription = {
      topic: '/test',
      unsubscribe: () => { called = true; },
    };
    sub.unsubscribe();
    expect(called).toBe(true);
  });

  test('DataSource interface contract is satisfiable', () => {
    // Verify the interface is structurally valid by creating a mock
    const mockSource: DataSource = {
      type: 'live',
      status: 'disconnected',
      connect: async () => {},
      disconnect: async () => {},
      getTopics: () => [],
      subscribe: (topic, _cb) => ({ topic, unsubscribe: () => {} }),
      getPlaybackControls: () => undefined,
      onStatusChange: (_cb) => () => {},
      onTopicsChange: (_cb) => () => {},
    };
    expect(mockSource.type).toBe('live');
    expect(mockSource.getPlaybackControls()).toBeUndefined();
  });
});
