/**
 * User Script Panel — TypeScript data transforms.
 * Simple code editor that subscribes to topics and transforms data.
 * Uses new Function() intentionally — this IS a user scripting panel.
 * (Full Monaco integration deferred to monorepo phase)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDataSource, useTopics } from '@/data-source/hooks';
import type { MessageEvent } from '@/data-source/types';

export default function UserScriptPanel(props: any) {
  const { config = {}, onConfigChange = () => {} } = props;
  const ds = useDataSource();
  const topics = useTopics();
  const [code, setCode] = useState(
    (config.code as string) ||
`// User Script — transform ROS data
// Available: message (latest from input topic)
// Return value is displayed in the output area

function transform(message) {
  return JSON.stringify(message, null, 2);
}`,
  );
  const [inputTopic, setInputTopic] = useState((config.inputTopic as string) || '');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const subRef = useRef<{ unsubscribe: () => void } | null>(null);

  const runScript = useCallback((message: unknown) => {
    try {
      // Intentional: User Script panel evaluates user-authored code
      // eslint-disable-next-line no-new-func
      const fn = new Function('message', `${code}\nreturn transform(message);`);
      const result = fn(message);
      setOutput(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }, [code]);

  useEffect(() => {
    if (subRef.current) { subRef.current.unsubscribe(); subRef.current = null; }

    if (running && inputTopic) {
      subRef.current = ds.subscribe(inputTopic, (event: MessageEvent) => {
        runScript(event.message);
      });
    }

    return () => {
      if (subRef.current) { subRef.current.unsubscribe(); subRef.current = null; }
    };
  }, [ds, inputTopic, running, runScript]);

  const toggleRunning = useCallback(() => {
    setRunning(!running);
    onConfigChange({ ...config, code, inputTopic });
  }, [running, code, inputTopic, config, onConfigChange]);

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--border-subtle, #333)', flexShrink: 0 }}>
        <select value={inputTopic} onChange={(e) => setInputTopic(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 100 }}>
          <option value="">Input topic...</option>
          {topics.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
        <button
          onClick={toggleRunning}
          style={{
            background: running ? 'rgba(255,68,68,0.15)' : 'rgba(0,204,102,0.15)',
            color: running ? '#ff4444' : '#00cc66',
            border: `1px solid ${running ? '#ff4444' : '#00cc66'}`,
            borderRadius: 3,
            fontSize: 11,
            padding: '3px 12px',
            cursor: 'pointer',
          }}
        >
          {running ? 'Stop' : 'Run'}
        </button>
      </div>

      {/* Code editor */}
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1,
          background: 'var(--bg-base, #0a0a0a)',
          color: '#a5d6a7',
          border: 'none',
          fontFamily: 'monospace',
          fontSize: 12,
          padding: 8,
          resize: 'none',
          outline: 'none',
          lineHeight: 1.5,
          tabSize: 2,
          minHeight: 80,
        }}
      />

      {/* Output */}
      <div style={{ flex: '0 0 auto', maxHeight: '40%', overflow: 'auto', borderTop: '1px solid var(--border-subtle, #333)' }}>
        <div style={{ padding: '3px 8px', fontSize: 10, color: 'var(--text-tertiary, #666)' }}>OUTPUT</div>
        {error && <pre style={{ padding: '4px 8px', color: '#ff4444', fontFamily: 'monospace', fontSize: 11, margin: 0 }}>{error}</pre>}
        {!error && output && <pre style={{ padding: '4px 8px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 11, margin: 0, whiteSpace: 'pre-wrap' }}>{output}</pre>}
        {!error && !output && <div style={{ padding: '8px', color: 'var(--text-tertiary, #666)', fontSize: 11 }}>{running ? 'Waiting for messages...' : 'Click Run to start'}</div>}
      </div>
    </div>
  );
}
