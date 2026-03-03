/**
 * Profile Settings Panel — view and edit user profile.
 */

import { useState, useEffect, useCallback } from 'react';
import { User, Save, Check } from 'lucide-react';
import api from '@/services/api';

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
};

const fieldGroupStyle: React.CSSProperties = {
  marginBottom: 12,
};

export default function ProfileSettingsPanel(_props: any) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/users/me')
      .then(({ data }) => {
        setDisplayName(data.display_name || '');
        setEmail(data.email || '');
        setAvatarUrl(data.avatar_url || '');
      })
      .catch(() => {});
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch('/users/me', { display_name: displayName, avatar_url: avatarUrl });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Save failed:', e);
    } finally {
      setSaving(false);
    }
  }, [displayName, avatarUrl]);

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
        <User size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          Profile
        </span>
      </div>

      {/* Form */}
      <div style={{ padding: 12, flex: 1 }}>
        {/* Avatar preview */}
        <div style={{ ...fieldGroupStyle, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--bg-surface-2)',
              border: '2px solid var(--border-default)',
              overflow: 'hidden',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <User size={20} style={{ color: 'var(--text-muted)' }} />
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            {email || 'No email'}
          </div>
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Email</label>
          <input type="text" value={email} readOnly style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>
            Email is set by your authentication provider.
          </span>
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Avatar URL</label>
          <input
            type="text"
            placeholder="https://..."
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            background: saved ? 'var(--success, #00cc66)' : 'var(--accent)',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.6 : 1,
            transition: 'background 0.2s',
          }}
        >
          {saved ? <Check size={12} /> : <Save size={12} />}
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  );
}
