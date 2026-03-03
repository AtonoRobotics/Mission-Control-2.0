import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { DataSourceContext, type DataSourceContextValue } from '../DataSourceProvider';
import {
  useDataSource,
  useConnectionStatus,
  useTopics,
  usePlaybackControls,
  useSubscription,
  useDataSourceSwitch,
} from '../hooks';
import type { DataSource, MessageEvent } from '../types';

function createMockDataSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    type: 'live',
    status: 'connected',
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    getTopics: vi.fn(() => []),
    subscribe: vi.fn((topic, cb) => ({ topic, unsubscribe: vi.fn() })),
    getPlaybackControls: vi.fn(() => undefined),
    onStatusChange: vi.fn(() => () => {}),
    onTopicsChange: vi.fn(() => () => {}),
    ...overrides,
  };
}

function createWrapper(contextValue: DataSourceContextValue) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(DataSourceContext.Provider, { value: contextValue }, children);
  };
}

describe('DataSource hooks', () => {
  let mockDs: DataSource;
  let ctxValue: DataSourceContextValue;

  beforeEach(() => {
    mockDs = createMockDataSource();
    ctxValue = {
      dataSource: mockDs,
      status: 'connected',
      topics: [{ name: '/scan', schemaName: 'sensor_msgs/msg/LaserScan' }],
      switchToLive: vi.fn(async () => {}),
      switchToMcap: vi.fn(async () => {}),
    };
  });

  test('useDataSource returns the data source', () => {
    const { result } = renderHook(() => useDataSource(), {
      wrapper: createWrapper(ctxValue),
    });
    expect(result.current).toBe(mockDs);
  });

  test('useConnectionStatus returns status', () => {
    const { result } = renderHook(() => useConnectionStatus(), {
      wrapper: createWrapper(ctxValue),
    });
    expect(result.current).toBe('connected');
  });

  test('useTopics returns topics list', () => {
    const { result } = renderHook(() => useTopics(), {
      wrapper: createWrapper(ctxValue),
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].name).toBe('/scan');
  });

  test('usePlaybackControls returns undefined for live', () => {
    const { result } = renderHook(() => usePlaybackControls(), {
      wrapper: createWrapper(ctxValue),
    });
    expect(result.current).toBeUndefined();
  });

  test('useSubscription subscribes and receives messages', () => {
    let subscribeCb: ((e: MessageEvent) => void) | null = null;
    const unsubFn = vi.fn();
    mockDs = createMockDataSource({
      subscribe: vi.fn((topic, cb) => {
        subscribeCb = cb;
        return { topic, unsubscribe: unsubFn };
      }),
    });
    ctxValue = { ...ctxValue, dataSource: mockDs };

    const { result } = renderHook(() => useSubscription('/scan'), {
      wrapper: createWrapper(ctxValue),
    });

    expect(result.current).toBeUndefined();
    expect(mockDs.subscribe).toHaveBeenCalledWith('/scan', expect.any(Function));

    // Simulate message
    act(() => {
      subscribeCb!({
        topic: '/scan',
        message: { ranges: [1.0] },
        timestamp: 1000,
        receiveTime: 1001,
        schemaName: 'sensor_msgs/msg/LaserScan',
      });
    });

    expect(result.current?.topic).toBe('/scan');
    expect(result.current?.message).toEqual({ ranges: [1.0] });
  });

  test('useSubscription unsubscribes on unmount', () => {
    const unsubFn = vi.fn();
    mockDs = createMockDataSource({
      subscribe: vi.fn((_topic, _cb) => ({ topic: '/scan', unsubscribe: unsubFn })),
    });
    ctxValue = { ...ctxValue, dataSource: mockDs };

    const { unmount } = renderHook(() => useSubscription('/scan'), {
      wrapper: createWrapper(ctxValue),
    });

    unmount();
    expect(unsubFn).toHaveBeenCalled();
  });

  test('useDataSourceSwitch returns switch functions', () => {
    const { result } = renderHook(() => useDataSourceSwitch(), {
      wrapper: createWrapper(ctxValue),
    });
    expect(result.current.switchToLive).toBeDefined();
    expect(result.current.switchToMcap).toBeDefined();
  });

  test('useDataSource throws without provider', () => {
    expect(() => {
      renderHook(() => useDataSource());
    }).toThrow('useDataSource must be used within <DataSourceProvider>');
  });
});
