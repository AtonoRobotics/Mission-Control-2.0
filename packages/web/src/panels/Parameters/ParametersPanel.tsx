/**
 * Parameters Panel — view and edit ROS2 node parameters.
 * Get/set parameters via roslib Param API.
 */

import { useState, useCallback } from 'react';
import { Param } from 'roslib';
import { getRos } from '@/ros/connection';

interface ParamEntry {
  node: string;
  name: string;
  value: string;
  action: 'get' | 'set';
  timestamp: string;
}

export default function ParametersPanel(props: any) {
  const { config = {} } = props;
  const [nodeName, setNodeName] = useState((config.nodeName as string) || '');
  const [paramName, setParamName] = useState('');
  const [paramValue, setParamValue] = useState('');
  const [valueType, setValueType] = useState<'string' | 'number' | 'boolean' | 'json'>('string');
  const [history, setHistory] = useState<ParamEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fullName = nodeName ? `${nodeName}/${paramName}` : paramName;

  const getParam = useCallback(() => {
    if (!fullName) return;
    setLoading(true);
    setError('');
    const param = new Param({ ros: getRos(), name: fullName });
    param.get((value: any) => {
      const valStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
      setParamValue(valStr);
      if (typeof value === 'boolean') setValueType('boolean');
      else if (typeof value === 'number') setValueType('number');
      else if (typeof value === 'object') setValueType('json');
      else setValueType('string');
      setLoading(false);
      setHistory((prev) => [
        { node: nodeName, name: paramName, value: valStr, action: 'get', timestamp: new Date().toLocaleTimeString() },
        ...prev.slice(0, 19),
      ]);
    });
  }, [fullName, nodeName, paramName]);

  const setParam = useCallback(() => {
    if (!fullName) return;
    setError('');
    let parsed: any;
    try {
      if (valueType === 'boolean') parsed = paramValue === 'true';
      else if (valueType === 'number') parsed = Number(paramValue);
      else if (valueType === 'json') parsed = JSON.parse(paramValue);
      else parsed = paramValue;
    } catch (e: any) {
      setError(e.message);
      return;
    }

    const param = new Param({ ros: getRos(), name: fullName });
    param.set(parsed);
    setHistory((prev) => [
      { node: nodeName, name: paramName, value: String(parsed), action: 'set', timestamp: new Date().toLocaleTimeString() },
      ...prev.slice(0, 19),
    ]);
  }, [fullName, paramValue, valueType, nodeName, paramName]);

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-surface-2)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle, #333)',
    borderRadius: 3,
    fontSize: 11,
    padding: '3px 6px',
  };

  const btnStyle: React.CSSProperties = {
    background: 'var(--bg-surface-2)',
    border: '1px solid var(--border-subtle, #333)',
    color: 'var(--text-secondary)',
    borderRadius: 3,
    fontSize: 11,
    padding: '3px 10px',
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--border-subtle, #333)', flexShrink: 0, flexWrap: 'wrap' }}>
        <input type="text" value={nodeName} onChange={(e) => setNodeName(e.target.value)} placeholder="/node_name" style={{ ...inputStyle, width: 120 }} />
        <span style={{ color: 'var(--text-tertiary, #666)', fontSize: 11 }}>/</span>
        <input type="text" value={paramName} onChange={(e) => setParamName(e.target.value)} placeholder="param_name" style={{ ...inputStyle, flex: 1 }} />
        <button onClick={getParam} disabled={!fullName || loading} style={btnStyle}>Get</button>
        <button onClick={setParam} disabled={!fullName} style={{ ...btnStyle, color: 'var(--accent)', borderColor: 'var(--accent)' }}>Set</button>
      </div>

      {/* Value editor */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle, #333)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <select value={valueType} onChange={(e) => setValueType(e.target.value as any)} style={{ ...inputStyle, width: 80 }}>
          <option value="string">string</option>
          <option value="number">number</option>
          <option value="boolean">bool</option>
          <option value="json">JSON</option>
        </select>

        {valueType === 'boolean' ? (
          <button
            onClick={() => setParamValue(paramValue === 'true' ? 'false' : 'true')}
            style={{ ...btnStyle, color: paramValue === 'true' ? '#00cc66' : '#ff4444', minWidth: 60 }}
          >
            {paramValue === 'true' ? 'true' : 'false'}
          </button>
        ) : valueType === 'json' ? (
          <textarea
            value={paramValue}
            onChange={(e) => setParamValue(e.target.value)}
            spellCheck={false}
            style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', height: 60, resize: 'vertical' }}
          />
        ) : (
          <input
            type={valueType === 'number' ? 'number' : 'text'}
            value={paramValue}
            onChange={(e) => setParamValue(e.target.value)}
            style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
          />
        )}
      </div>

      {error && <div style={{ padding: '4px 8px', color: '#ff4444', fontSize: 11 }}>{error}</div>}

      {/* History */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '4px 8px', fontSize: 10, color: 'var(--text-tertiary, #666)', borderBottom: '1px solid var(--border-subtle, #333)' }}>
          HISTORY ({history.length})
          {history.length > 0 && (
            <button onClick={() => setHistory([])} style={{ ...btnStyle, marginLeft: 8, padding: '1px 6px', fontSize: 10 }}>Clear</button>
          )}
        </div>
        {history.map((h, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 8,
              padding: '3px 8px',
              fontSize: 11,
              fontFamily: 'monospace',
              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
            }}
          >
            <span style={{ color: 'var(--text-tertiary, #666)', width: 60, flexShrink: 0 }}>{h.timestamp}</span>
            <span style={{ color: h.action === 'set' ? 'var(--accent)' : '#4499ff', width: 24, flexShrink: 0 }}>{h.action === 'set' ? 'SET' : 'GET'}</span>
            <span style={{ color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {h.node}/{h.name} = {h.value}
            </span>
          </div>
        ))}
        {history.length === 0 && <div style={{ padding: 16, color: 'var(--text-tertiary, #666)', fontSize: 12 }}>Get or set a parameter to see history</div>}
      </div>
    </div>
  );
}
