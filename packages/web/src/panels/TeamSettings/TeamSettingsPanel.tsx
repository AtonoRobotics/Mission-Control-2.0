/**
 * Team Settings Panel — manage team members, invite users, assign roles.
 */

import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Trash2 } from 'lucide-react';
import api from '@/services/api';

interface TeamMember {
  user_id: string;
  display_name: string;
  email: string;
  role: string;
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--text-muted)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  fontFamily: 'monospace',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-surface-2)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 4,
  fontSize: 12,
  padding: '6px 10px',
  fontFamily: 'monospace',
  outline: 'none',
};

export default function TeamSettingsPanel(_props: any) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/users')
      .then(({ data }) => setMembers(data))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, []);

  const handleInvite = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inviteEmail) return;
      try {
        const { data: user } = await api.post('/users/invite', { email: inviteEmail, role: inviteRole });
        setMembers((prev) => [...prev, user]);
        setInviteEmail('');
        setInviteRole('viewer');
      } catch (e) {
        console.error('Invite failed:', e);
      }
    },
    [inviteEmail, inviteRole],
  );

  const handleRemove = useCallback(async (userId: string) => {
    try {
      await api.delete(`/users/${userId}`);
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (e) {
      console.error('Remove failed:', e);
    }
  }, []);

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
        <Users size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          Team Members
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {members.length} members
        </span>
      </div>

      {/* Member list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>Loading...</div>
        ) : members.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>No team members</div>
        ) : (
          members.map((m) => (
            <div
              key={m.user_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                fontSize: 11,
                fontFamily: 'monospace',
              }}
            >
              <span style={{ width: 100, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.display_name}
              </span>
              <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.email}
              </span>
              <span
                style={{
                  fontSize: 9,
                  padding: '1px 6px',
                  borderRadius: 2,
                  color: m.role === 'admin' ? 'var(--accent)' : 'var(--text-muted)',
                  border: `1px solid ${m.role === 'admin' ? 'var(--accent)' : 'var(--border-default)'}`,
                  textTransform: 'uppercase',
                }}
              >
                {m.role}
              </span>
              <button
                onClick={() => handleRemove(m.user_id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ff444480',
                  cursor: 'pointer',
                  padding: 2,
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Invite form */}
      <form
        onSubmit={handleInvite}
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          padding: 12,
          borderTop: '1px solid var(--border-default)',
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ ...labelStyle, marginBottom: 3 }}>Email</div>
          <input
            type="email"
            placeholder="user@team.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
        <div>
          <div style={{ ...labelStyle, marginBottom: 3 }}>Role</div>
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            style={{ ...inputStyle, padding: '5px 8px' }}
          >
            <option value="viewer">Viewer</option>
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button
          type="submit"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            background: 'var(--accent)',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <UserPlus size={12} /> Invite
        </button>
      </form>
    </div>
  );
}
