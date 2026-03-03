/**
 * Raw Messages Panel — JSON tree viewer for ROS messages.
 * Collapsible nodes, diff mode, topic selector, copy to clipboard.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTopics, useSubscription } from '@/data-source/hooks';
import type { MessageEvent } from '@/data-source/types';

interface JsonNodeProps {
  keyName: string;
  value: unknown;
  depth: number;
  diffValue?: unknown;
  showDiff: boolean;
}

function JsonNode({ keyName, value, depth, diffValue, showDiff }: JsonNodeProps) {
  const [collapsed, setCollapsed] = useState(depth > 2);
  const isObject = value !== null && typeof value === 'object';
  const indent = depth * 16;

  if (!isObject) {
    const changed = showDiff && diffValue !== undefined && diffValue !== value;
    return (
      <div style={{ paddingLeft: indent, fontFamily: 'monospace', fontSize: 12, lineHeight: '20px' }}>
        <span style={{ color: 'var(--text-tertiary, #666)' }}>{keyName}: </span>
        <span style={{
          color: changed ? 'var(--accent)' : typeof value === 'string' ? '#a5d6a7' : '#90caf9',
          background: changed ? 'rgba(255,170,0,0.1)' : 'transparent',
        }}>
          {typeof value === 'string' ? `"${value}"` : String(value)}
        </span>
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);

  const diffObj = (showDiff && diffValue && typeof diffValue === 'object') ? diffValue as Record<string, unknown> : undefined;

  return (
    <div style={{ paddingLeft: indent }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          cursor: 'pointer',
          fontFamily: 'monospace',
          fontSize: 12,
          lineHeight: '20px',
          userSelect: 'none',
        }}
      >
        <span style={{ color: 'var(--text-tertiary, #666)', marginRight: 4 }}>
          {collapsed ? '▸' : '▾'}
        </span>
        <span style={{ color: 'var(--text-secondary)' }}>{keyName}</span>
        <span style={{ color: 'var(--text-tertiary, #666)', marginLeft: 4 }}>
          {Array.isArray(value) ? `[${value.length}]` : `{${entries.length}}`}
        </span>
      </div>
      {!collapsed &&
        entries.map(([k, v]) => (
          <JsonNode
            key={k}
            keyName={k}
            value={v}
            depth={depth + 1}
            diffValue={diffObj ? (diffObj as any)[k] : undefined}
            showDiff={showDiff}
          />
        ))}
    </div>
  );
}

export default function RawMessagesPanel(props: any) {
  const { config = {}, onConfigChange = () => {} } = props;
  const topics = useTopics();
  const selectedTopic = (config.topic as string) || '';
  const [diffMode, setDiffMode] = useState(false);
  const prevMessageRef = useRef<unknown>(null);

  const latestEvent = useSubscription(selectedTopic);

  // Track previous message for diff
  const prevMessage = prevMessageRef.current;
  useEffect(() => {
    if (latestEvent) {
      prevMessageRef.current = latestEvent.message;
    }
  }, [latestEvent]);

  const handleCopy = useCallback(() => {
    if (latestEvent) {
      navigator.clipboard.writeText(JSON.stringify(latestEvent.message, null, 2));
    }
  }, [latestEvent]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          borderBottom: '1px solid var(--border-subtle, #333)',
          flexShrink: 0,
        }}
      >
        <select
          value={selectedTopic}
          onChange={(e) => onConfigChange({ topic: e.target.value })}
          style={{
            flex: 1,
            background: 'var(--bg-surface-2)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle, #333)',
            borderRadius: 3,
            fontSize: 11,
            padding: '3px 6px',
          }}
        >
          <option value="">Select topic...</option>
          {topics.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={diffMode}
            onChange={(e) => setDiffMode(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          Diff
        </label>

        <button
          onClick={handleCopy}
          style={{
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border-subtle, #333)',
            color: 'var(--text-secondary)',
            borderRadius: 3,
            fontSize: 11,
            padding: '3px 8px',
            cursor: 'pointer',
          }}
          title="Copy JSON to clipboard"
        >
          Copy
        </button>
      </div>

      {/* Message tree */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {!selectedTopic && (
          <div style={{ padding: 16, color: 'var(--text-tertiary, #666)', fontSize: 12 }}>
            Select a topic to view messages
          </div>
        )}
        {selectedTopic && !latestEvent && (
          <div style={{ padding: 16, color: 'var(--text-tertiary, #666)', fontSize: 12 }}>
            Waiting for messages on {selectedTopic}...
          </div>
        )}
        {latestEvent && (
          <JsonNode
            keyName={latestEvent.schemaName || 'message'}
            value={latestEvent.message}
            depth={0}
            diffValue={diffMode ? prevMessage : undefined}
            showDiff={diffMode}
          />
        )}
      </div>
    </div>
  );
}
