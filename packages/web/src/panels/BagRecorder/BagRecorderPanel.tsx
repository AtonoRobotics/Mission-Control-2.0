/**
 * Bag Recorder Panel — record ROS2 topics to MCAP files.
 * Topic checklist, start/stop, live duration/count/size display.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTopics } from '@/data-source/hooks';
import api from '@/services/api';

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-surface-2)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle, #333)',
  borderRadius: 3,
  fontSize: 11,
  padding: '3px 6px',
  fontFamily: 'monospace',
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function BagRecorderPanel(_props: any) {
  const topics = useTopics();
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [fileSize, setFileSize] = useState(0);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [deviceName, setDeviceName] = useState('workstation');
  const [autoUpload, setAutoUpload] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleTopic = useCallback((name: string) => {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedTopics(new Set(topics.map((t) => t.name)));
  }, [topics]);

  const selectNone = useCallback(() => {
    setSelectedTopics(new Set());
  }, []);

  const startRecording = useCallback(async () => {
    if (selectedTopics.size === 0) return;
    try {
      const topicList = Array.from(selectedTopics).map((name) => {
        const t = topics.find((x) => x.name === name);
        return { name, type: t?.schemaName ?? 'unknown' };
      });
      await api.post('/recordings/start', { device_name: deviceName, topics: topicList });
      setIsRecording(true);
      setDuration(0);
      setMessageCount(0);
      setFileSize(0);
    } catch (e) {
      console.error('Failed to start recording:', e);
    }
  }, [deviceName, selectedTopics, topics]);

  const stopRecording = useCallback(async () => {
    try {
      await api.post('/recordings/stop');
      setIsRecording(false);
    } catch (e) {
      console.error('Failed to stop recording:', e);
    }
  }, []);

  // Poll status while recording
  useEffect(() => {
    if (!isRecording) return;
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get('/recordings/status/active');
        setDuration(data.duration_sec ?? 0);
        setMessageCount(data.message_count ?? 0);
      } catch { /* ignore */ }
    }, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isRecording]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          borderBottom: '1px solid var(--border-subtle, #333)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={!isRecording && selectedTopics.size === 0}
          style={{
            background: isRecording ? '#ff4444' : 'var(--accent)',
            color: isRecording ? '#fff' : '#000',
            border: 'none',
            borderRadius: 3,
            fontSize: 11,
            fontWeight: 600,
            padding: '4px 12px',
            cursor: 'pointer',
            opacity: !isRecording && selectedTopics.size === 0 ? 0.4 : 1,
          }}
        >
          {isRecording ? 'Stop' : 'Record'}
        </button>

        {isRecording && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontFamily: 'monospace',
              color: '#ff4444',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff4444', animation: 'pulse 1s infinite' }} />
            {formatDuration(duration)} | {messageCount} msgs
          </span>
        )}

        <div style={{ flex: 1 }} />

        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
          Device
          <input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            style={{ ...inputStyle, width: 80 }}
            disabled={isRecording}
          />
        </label>

        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={autoUpload}
            onChange={(e) => setAutoUpload(e.target.checked)}
          />
          S3
        </label>
      </div>

      {/* Topic list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        <div style={{ display: 'flex', gap: 8, padding: '2px 8px', fontSize: 10, color: 'var(--text-tertiary, #666)' }}>
          <button onClick={selectAll} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 10, padding: 0 }}>All</button>
          <button onClick={selectNone} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 10, padding: 0 }}>None</button>
          <span>{selectedTopics.size} / {topics.length} topics</span>
        </div>
        {topics.map((t) => (
          <label
            key={t.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 8px',
              fontSize: 11,
              fontFamily: 'monospace',
              color: selectedTopics.has(t.name) ? 'var(--text-primary)' : 'var(--text-tertiary, #666)',
              cursor: isRecording ? 'default' : 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={selectedTopics.has(t.name)}
              onChange={() => toggleTopic(t.name)}
              disabled={isRecording}
            />
            {t.name}
            <span style={{ fontSize: 9, color: 'var(--text-tertiary, #666)', marginLeft: 'auto' }}>{t.schemaName}</span>
          </label>
        ))}
        {topics.length === 0 && (
          <div style={{ padding: 16, color: 'var(--text-tertiary, #666)', fontSize: 12 }}>
            No topics available. Connect to a data source first.
          </div>
        )}
      </div>
    </div>
  );
}
