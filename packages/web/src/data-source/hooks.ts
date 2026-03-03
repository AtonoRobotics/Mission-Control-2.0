/**
 * DataSource hooks — panels consume data through these,
 * agnostic to whether the source is live or recorded.
 */

import { useContext, useEffect, useState } from 'react';
import { DataSourceContext, type DataSourceContextValue } from './DataSourceProvider';
import type {
  DataSource,
  ConnectionStatus,
  TopicInfo,
  MessageEvent,
  PlaybackControls,
} from './types';

function useDataSourceContext(): DataSourceContextValue {
  const ctx = useContext(DataSourceContext);
  if (!ctx) throw new Error('useDataSource must be used within <DataSourceProvider>');
  return ctx;
}

/** Get the active DataSource instance */
export function useDataSource(): DataSource {
  return useDataSourceContext().dataSource;
}

/** Get current connection status (reactive) */
export function useConnectionStatus(): ConnectionStatus {
  return useDataSourceContext().status;
}

/** Get available topics (reactive) */
export function useTopics(): TopicInfo[] {
  return useDataSourceContext().topics;
}

/** Get playback controls (undefined for live sources) */
export function usePlaybackControls(): PlaybackControls | undefined {
  const ds = useDataSource();
  return ds.getPlaybackControls();
}

/** Subscribe to a topic, returns latest message (or undefined) */
export function useSubscription(topic: string): MessageEvent | undefined {
  const ds = useDataSource();
  const [message, setMessage] = useState<MessageEvent | undefined>();

  useEffect(() => {
    if (!topic) return;
    const sub = ds.subscribe(topic, setMessage);
    return () => sub.unsubscribe();
  }, [ds, topic]);

  return message;
}

/** Get source switching functions */
export function useDataSourceSwitch() {
  const ctx = useDataSourceContext();
  return {
    switchToLive: ctx.switchToLive,
    switchToMcap: ctx.switchToMcap,
  };
}
