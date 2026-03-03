/**
 * Cloud Settings Panel — configure S3/MinIO storage.
 * Endpoint, bucket, credentials, test connection.
 */

import { useState, useCallback } from 'react';
import { Cloud, CheckCircle, XCircle, Loader2, Upload } from 'lucide-react';

interface ConnectionResult {
  ok: boolean;
  bucket: string;
  error?: string;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 3,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  fontFamily: 'monospace',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-surface-2)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 4,
  fontSize: 12,
  padding: '6px 10px',
  fontFamily: 'monospace',
  outline: 'none',
  transition: 'border-color 0.15s',
};

const fieldGroupStyle: React.CSSProperties = {
  marginBottom: 12,
};

export default function CloudSettingsPanel(_props: any) {
  const [endpoint, setEndpoint] = useState('');
  const [bucket, setBucket] = useState('mission-control');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [autoUpload, setAutoUpload] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionResult | null>(null);

  const testConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const resp = await fetch('/mc/api/cloud/test');
      if (resp.ok) {
        setTestResult(await resp.json());
      } else {
        setTestResult({ ok: false, bucket: bucket, error: `HTTP ${resp.status}` });
      }
    } catch (e) {
      setTestResult({ ok: false, bucket: bucket, error: 'Network error' });
    } finally {
      setTesting(false);
    }
  }, [bucket]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderBottom: '1px solid var(--border-default)',
          flexShrink: 0,
        }}
      >
        <Cloud size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          Cloud Storage
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          S3 / MinIO
        </span>
      </div>

      {/* Form */}
      <div style={{ padding: '12px', flex: 1 }}>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Endpoint URL</label>
          <input
            type="text"
            placeholder="https://s3.amazonaws.com or http://minio:9000"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            style={inputStyle}
            onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--border-default)'; }}
          />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>
            Leave empty for AWS S3. Set for MinIO or S3-compatible.
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ ...fieldGroupStyle, flex: 1 }}>
            <label style={labelStyle}>Bucket</label>
            <input
              type="text"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              style={inputStyle}
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border-default)'; }}
            />
          </div>
          <div style={{ ...fieldGroupStyle, flex: 1 }}>
            <label style={labelStyle}>Region</label>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              style={inputStyle}
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border-default)'; }}
            />
          </div>
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Access Key</label>
          <input
            type="text"
            value={accessKey}
            onChange={(e) => setAccessKey(e.target.value)}
            style={inputStyle}
            onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--border-default)'; }}
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Secret Key</label>
          <input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            style={inputStyle}
            onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--border-default)'; }}
          />
        </div>

        {/* Auto-upload toggle */}
        <div style={{ ...fieldGroupStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={autoUpload}
            onChange={(e) => setAutoUpload(e.target.checked)}
            id="auto-upload"
          />
          <label htmlFor="auto-upload" style={{ fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <Upload size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            Auto-upload recordings after stop
          </label>
        </div>

        {/* Test connection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <button
            onClick={testConnection}
            disabled={testing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              background: 'var(--bg-surface-2)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              cursor: testing ? 'wait' : 'pointer',
              transition: 'border-color 0.15s',
              opacity: testing ? 0.6 : 1,
            }}
            onMouseEnter={(e) => { if (!testing) e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
          >
            {testing ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Cloud size={13} />}
            Test Connection
          </button>

          {testResult && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontFamily: 'monospace',
                color: testResult.ok ? 'var(--success)' : 'var(--danger)',
              }}
            >
              {testResult.ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
              {testResult.ok ? `Connected to ${testResult.bucket}` : testResult.error}
            </span>
          )}
        </div>

        {/* Save note */}
        <div style={{ marginTop: 16, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          Settings are configured via environment variables (MC_S3_*). Changes here are for testing only — update .env.machines for persistence.
        </div>
      </div>
    </div>
  );
}
