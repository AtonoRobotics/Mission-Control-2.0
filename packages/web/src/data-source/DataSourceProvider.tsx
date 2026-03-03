/**
 * DataSourceProvider — React context providing the active DataSource
 * to all panels. Supports seamless switching between live and MCAP sources.
 */

import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DataSource, ConnectionStatus, TopicInfo } from './types';
import { LiveDataSource } from './LiveDataSource';
import { McapDataSource } from './McapDataSource';

export interface DataSourceContextValue {
  dataSource: DataSource;
  status: ConnectionStatus;
  topics: TopicInfo[];
  switchToLive: () => Promise<void>;
  switchToMcap: (file: File) => Promise<void>;
}

export const DataSourceContext = createContext<DataSourceContextValue | null>(null);

interface Props {
  children: ReactNode;
}

export function DataSourceProvider({ children }: Props) {
  const dsRef = useRef<DataSource>(new LiveDataSource());
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [topics, setTopics] = useState<TopicInfo[]>([]);
  // Force re-render when data source swaps so context consumers get new ref
  const [, setVersion] = useState(0);

  const attachListeners = useCallback((ds: DataSource) => {
    const unsubStatus = ds.onStatusChange(setStatus);
    const unsubTopics = ds.onTopicsChange(setTopics);
    return () => {
      unsubStatus();
      unsubTopics();
    };
  }, []);

  useEffect(() => {
    const ds = dsRef.current;
    const detach = attachListeners(ds);
    ds.connect();

    return () => {
      detach();
      ds.disconnect();
    };
  }, [attachListeners]);

  const switchToLive = useCallback(async () => {
    await dsRef.current.disconnect();
    const live = new LiveDataSource();
    dsRef.current = live;
    setStatus('disconnected');
    setTopics([]);

    attachListeners(live);
    await live.connect();
    setVersion((v) => v + 1);
  }, [attachListeners]);

  const switchToMcap = useCallback(async (file: File) => {
    await dsRef.current.disconnect();
    const mcap = new McapDataSource(file);
    dsRef.current = mcap;
    setStatus('disconnected');
    setTopics([]);

    attachListeners(mcap);
    await mcap.connect();
    setVersion((v) => v + 1);
  }, [attachListeners]);

  return (
    <DataSourceContext.Provider value={{ dataSource: dsRef.current, status, topics, switchToLive, switchToMcap }}>
      {children}
    </DataSourceContext.Provider>
  );
}
