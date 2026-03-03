/**
 * Notification Center Panel — view and manage notifications.
 */

import { useNotificationStore } from '@/stores/notificationStore';
import { Bell, Trash2, CheckCheck } from 'lucide-react';

const typeColors: Record<string, string> = {
  info: '#4fc3f7',
  success: '#00cc66',
  warning: '#ffaa00',
  error: '#ff4444',
};

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export default function NotificationCenterPanel(_props: any) {
  const { notifications, unreadCount, markRead, markAllRead, dismiss, clearAll } =
    useNotificationStore();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
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
        <Bell size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          Notifications
        </span>
        {unreadCount > 0 && (
          <span
            style={{
              fontSize: 9,
              padding: '1px 6px',
              borderRadius: 8,
              background: 'var(--accent)',
              color: '#000',
              fontWeight: 700,
            }}
          >
            {unreadCount}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              fontSize: 10,
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            <CheckCheck size={12} /> Mark all read
          </button>
        )}
        {notifications.length > 0 && (
          <button
            onClick={clearAll}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 10,
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {notifications.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            No notifications
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.read && markRead(n.id)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '8px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                cursor: n.read ? 'default' : 'pointer',
                opacity: n.read ? 0.6 : 1,
              }}
            >
              {/* Type dot */}
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: typeColors[n.type] || '#666',
                  marginTop: 4,
                  flexShrink: 0,
                }}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                  {n.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'monospace' }}>
                  {n.message}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'monospace' }}>
                  {timeAgo(n.timestamp)}
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss(n.id);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 2,
                  flexShrink: 0,
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
