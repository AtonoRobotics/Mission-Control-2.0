/**
 * Publish Panel — compose and publish ROS2 messages.
 * Single shot or rate-based publishing via roslib.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Topic } from 'roslib';
import { getRos } from '@/ros/connection';
import { useTopics } from '@/data-source/hooks';

export default function PublishPanel(props: any) {
  const { config = {}, onConfigChange = () => {} } = props;
  const topics = useTopics();
  const topicName = (config.topic as string) || '';
  const messageType = (config.messageType as string) || '';
  const [body, setBody] = useState('{\n  \n}');
  const [error, setError] = useState('');
  const [lastPublished, setLastPublished] = useState<string | null>(null);
  const [rateEnabled, setRateEnabled] = useState(false);
  const [rateHz, setRateHz] = useState(10);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const topicRef = useRef<Topic<any> | null>(null);

  // Keep topic ref in sync
  useEffect(() => {
    if (topicName && messageType) {
      topicRef.current = new Topic({ ros: getRos(), name: topicName, messageType });
    } else {
      topicRef.current = null;
    }
    return () => { topicRef.current = null; };
  }, [topicName, messageType]);

  const doPublish = useCallback(() => {
    if (!topicRef.current) return;
    try {
      const msg = JSON.parse(body);
      setError('');
      topicRef.current.publish(msg);
      setLastPublished(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e.message);
    }
  }, [body]);

  // Rate-based publishing
  useEffect(() => {
    if (rateEnabled && topicRef.current) {
      intervalRef.current = setInterval(doPublish, 1000 / rateHz);
    }
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [rateEnabled, rateHz, doPublish]);

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-surface-2)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle, #333)',
    borderRadius: 3,
    fontSize: 11,
    padding: '3px 6px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--border-subtle, #333)', flexShrink: 0, flexWrap: 'wrap' }}>
        <select value={topicName} onChange={(e) => onConfigChange({ ...config, topic: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 120 }}>
          <option value="">Topic...</option>
          {topics.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
        <input type="text" value={messageType} onChange={(e) => onConfigChange({ ...config, messageType: e.target.value })} placeholder="msg type (e.g. geometry_msgs/Twist)" style={{ ...inputStyle, width: 200 }} />
      </div>

      {/* Rate control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--border-subtle, #333)', fontSize: 11, color: 'var(--text-secondary)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={rateEnabled} onChange={(e) => setRateEnabled(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
          Rate
        </label>
        <input type="number" value={rateHz} onChange={(e) => setRateHz(Math.max(1, Math.min(100, Number(e.target.value))))} min={1} max={100} style={{ ...inputStyle, width: 50 }} disabled={!rateEnabled} />
        <span>Hz</span>
        <div style={{ flex: 1 }} />
        {lastPublished && <span style={{ color: 'var(--text-tertiary, #666)' }}>Last: {lastPublished}</span>}
        {rateEnabled && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>PUBLISHING</span>}
      </div>

      {/* JSON editor */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1,
          background: 'var(--bg-base, #0a0a0a)',
          color: 'var(--text-primary)',
          border: 'none',
          fontFamily: 'monospace',
          fontSize: 12,
          padding: 8,
          resize: 'none',
          outline: 'none',
        }}
      />

      {/* Error + publish button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderTop: '1px solid var(--border-subtle, #333)' }}>
        {error && <span style={{ color: '#ff4444', fontSize: 11, flex: 1 }}>{error}</span>}
        {!error && <div style={{ flex: 1 }} />}
        <button
          onClick={doPublish}
          disabled={!topicName || !messageType}
          style={{
            background: 'var(--accent-dim, rgba(255,170,0,0.15))',
            color: 'var(--accent)',
            border: '1px solid var(--accent)',
            borderRadius: 3,
            fontSize: 11,
            padding: '4px 16px',
            cursor: topicName && messageType ? 'pointer' : 'not-allowed',
            opacity: topicName && messageType ? 1 : 0.5,
          }}
        >
          Publish
        </button>
      </div>
    </div>
  );
}
