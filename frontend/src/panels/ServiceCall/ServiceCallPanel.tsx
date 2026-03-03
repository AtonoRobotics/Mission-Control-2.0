/**
 * Service Call Panel — invoke ROS2 services from the UI.
 * Auto-generated request form, response display, call history.
 */

import { useState, useCallback } from 'react';
import { Service } from 'roslib';
import { getRos } from '@/ros/connection';

interface HistoryEntry {
  serviceName: string;
  request: string;
  response: string;
  timestamp: string;
  success: boolean;
}

export default function ServiceCallPanel(props: any) {
  const { config = {}, onConfigChange = () => {} } = props;
  const serviceName = (config.serviceName as string) || '';
  const serviceType = (config.serviceType as string) || '';
  const [requestBody, setRequestBody] = useState('{}');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const callService = useCallback(() => {
    if (!serviceName || !serviceType) return;
    let req: any;
    try {
      req = JSON.parse(requestBody);
    } catch (e: any) {
      setError(`Invalid JSON: ${e.message}`);
      return;
    }

    setLoading(true);
    setError('');
    setResponse(null);

    const svc = new Service({ ros: getRos(), name: serviceName, serviceType });
    svc.callService(
      req,
      (res: any) => {
        const resStr = JSON.stringify(res, null, 2);
        setResponse(resStr);
        setLoading(false);
        setHistory((prev) => [
          { serviceName, request: requestBody, response: resStr, timestamp: new Date().toLocaleTimeString(), success: true },
          ...prev.slice(0, 9),
        ]);
      },
      (err: string) => {
        setError(err);
        setLoading(false);
        setHistory((prev) => [
          { serviceName, request: requestBody, response: err, timestamp: new Date().toLocaleTimeString(), success: false },
          ...prev.slice(0, 9),
        ]);
      },
    );
  }, [serviceName, serviceType, requestBody]);

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
        <input type="text" value={serviceName} onChange={(e) => onConfigChange({ ...config, serviceName: e.target.value })} placeholder="/service_name" style={{ ...inputStyle, flex: 1, minWidth: 120 }} />
        <input type="text" value={serviceType} onChange={(e) => onConfigChange({ ...config, serviceType: e.target.value })} placeholder="pkg/srv/Type" style={{ ...inputStyle, width: 160 }} />
        <button
          onClick={callService}
          disabled={loading || !serviceName || !serviceType}
          style={{
            background: 'var(--accent-dim, rgba(255,170,0,0.15))',
            color: 'var(--accent)',
            border: '1px solid var(--accent)',
            borderRadius: 3,
            fontSize: 11,
            padding: '3px 12px',
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '...' : 'Call'}
        </button>
      </div>

      {/* Request + Response */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Request textarea */}
        <div style={{ flex: '0 0 auto', maxHeight: '40%' }}>
          <div style={{ padding: '4px 8px', fontSize: 10, color: 'var(--text-tertiary, #666)', borderBottom: '1px solid var(--border-subtle, #333)' }}>REQUEST</div>
          <textarea
            value={requestBody}
            onChange={(e) => setRequestBody(e.target.value)}
            spellCheck={false}
            style={{ width: '100%', height: 80, background: 'var(--bg-base, #0a0a0a)', color: 'var(--text-primary)', border: 'none', fontFamily: 'monospace', fontSize: 12, padding: 8, resize: 'vertical', outline: 'none' }}
          />
        </div>

        {/* Response */}
        <div style={{ flex: 1, overflow: 'auto', borderTop: '1px solid var(--border-subtle, #333)' }}>
          <div style={{ padding: '4px 8px', fontSize: 10, color: 'var(--text-tertiary, #666)', borderBottom: '1px solid var(--border-subtle, #333)' }}>RESPONSE</div>
          {error && <pre style={{ padding: 8, color: '#ff4444', fontFamily: 'monospace', fontSize: 12, margin: 0 }}>{error}</pre>}
          {response && <pre style={{ padding: 8, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>{response}</pre>}
          {!response && !error && !loading && <div style={{ padding: 16, color: 'var(--text-tertiary, #666)', fontSize: 12 }}>Call a service to see the response</div>}
          {loading && <div style={{ padding: 16, color: 'var(--accent)', fontSize: 12 }}>Calling service...</div>}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div style={{ maxHeight: '30%', overflow: 'auto', borderTop: '1px solid var(--border-subtle, #333)' }}>
          <div style={{ padding: '4px 8px', fontSize: 10, color: 'var(--text-tertiary, #666)' }}>HISTORY ({history.length})</div>
          {history.map((h, i) => (
            <div key={i}>
              <div
                onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                style={{ display: 'flex', gap: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
              >
                <span style={{ color: h.success ? '#00cc66' : '#ff4444' }}>{h.success ? '✓' : '✗'}</span>
                <span style={{ color: 'var(--text-tertiary, #666)' }}>{h.timestamp}</span>
                <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{h.serviceName}</span>
              </div>
              {expandedIdx === i && (
                <pre style={{ padding: '4px 8px 4px 24px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>{h.response}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
