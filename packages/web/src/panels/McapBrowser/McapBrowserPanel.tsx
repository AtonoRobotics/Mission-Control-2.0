/**
 * MCAP Browser Panel — browse, search, open, and delete recorded MCAP files.
 */

import { useState, useEffect, useCallback } from 'react';

interface RecordingEntry {
  recording_id: string;
  device_name: string;
  start_time: string;
  end_time: string | null;
  duration_sec: number | null;
  topics: Array<{ name: string; type: string; message_count?: number }>;
  size_bytes: number | null;
  status: string;
  shared: boolean;
  tags: string[];
}

function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes === 0) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDuration(sec: number | null): string {
  if (sec == null) return '--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-surface-2)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle, #333)',
  borderRadius: 3,
  fontSize: 11,
  padding: '3px 6px',
  fontFamily: 'monospace',
};

const statusColors: Record<string, string> = {
  recording: '#ff4444',
  complete: '#00cc66',
  uploading: '#ffaa00',
  cloud: '#4fc3f7',
  archived: '#666',
};

export default function McapBrowserPanel(_props: any) {
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'shared'>('all');

  const fetchRecordings = useCallback(async () => {
    setLoading(true);
    try {
      const [ownResp, sharedResp] = await Promise.all([
        fetch('/mc/api/recordings/'),
        fetch('/mc/api/recordings/shared/list'),
      ]);
      const own = ownResp.ok ? await ownResp.json() : [];
      const shared = sharedResp.ok ? await sharedResp.json() : [];
      // Merge, deduplicate by recording_id
      const map = new Map<string, RecordingEntry>();
      for (const r of [...own, ...shared]) map.set(r.recording_id, r);
      setRecordings(Array.from(map.values()));
    } catch (e) {
      console.error('Failed to fetch recordings:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const resp = await fetch(`/api/recordings/${id}`, { method: 'DELETE' });
        if (resp.ok) {
          setRecordings((prev) => prev.filter((r) => r.recording_id !== id));
        }
      } catch (e) {
        console.error('Failed to delete recording:', e);
      }
    },
    [],
  );

  const handleShare = useCallback(async (id: string) => {
    try {
      const resp = await fetch(`/mc/api/recordings/${id}/share`, { method: 'POST' });
      if (resp.ok) {
        setRecordings((prev) => prev.map((r) => (r.recording_id === id ? { ...r, shared: true } : r)));
      }
    } catch (e) {
      console.error('Failed to share recording:', e);
    }
  }, []);

  const filtered = recordings
    .filter((r) => filter === 'all' || r.shared)
    .filter(
      (r) =>
        !search ||
        r.device_name.toLowerCase().includes(search.toLowerCase()) ||
        r.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())),
    );

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
        <input
          type="text"
          placeholder="Search recordings..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={fetchRecordings}
          style={{
            background: 'var(--bg-surface-2)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle, #333)',
            borderRadius: 3,
            fontSize: 11,
            padding: '3px 8px',
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
        {(['all', 'shared'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? 'var(--accent-dim, rgba(255,170,0,0.15))' : 'none',
              color: filter === f ? 'var(--accent)' : 'var(--text-tertiary, #666)',
              border: filter === f ? '1px solid var(--accent)' : '1px solid transparent',
              borderRadius: 3,
              fontSize: 10,
              padding: '2px 8px',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {f}
          </button>
        ))}
        <span style={{ fontSize: 10, color: 'var(--text-tertiary, #666)' }}>
          {filtered.length} recordings
        </span>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 16, color: 'var(--text-tertiary, #666)', fontSize: 12 }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--text-tertiary, #666)', fontSize: 12 }}>
            No recordings found
          </div>
        ) : (
          filtered.map((rec) => (
            <div
              key={rec.recording_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                fontSize: 11,
                fontFamily: 'monospace',
              }}
            >
              {/* Status dot */}
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: statusColors[rec.status] || '#666',
                  flexShrink: 0,
                }}
              />

              {/* Device */}
              <span style={{ width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                {rec.device_name}
              </span>

              {/* Time */}
              <span style={{ width: 100, color: 'var(--text-secondary)' }}>
                {formatTime(rec.start_time)}
              </span>

              {/* Duration */}
              <span style={{ width: 45, color: 'var(--text-secondary)', textAlign: 'right' }}>
                {formatDuration(rec.duration_sec)}
              </span>

              {/* Size */}
              <span style={{ width: 55, color: 'var(--text-secondary)', textAlign: 'right' }}>
                {formatBytes(rec.size_bytes)}
              </span>

              {/* Topics */}
              <span style={{ width: 30, color: 'var(--text-tertiary, #666)', textAlign: 'center' }}>
                {rec.topics.length}t
              </span>

              {/* Shared badge */}
              {rec.shared && (
                <span style={{ fontSize: 9, color: '#00cc66', padding: '1px 4px', border: '1px solid #00cc6640', borderRadius: 2 }}>
                  shared
                </span>
              )}

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Actions */}
              <button
                onClick={() => {
                  // TODO: switch data source to MCAP
                  console.log('Open recording:', rec.recording_id);
                }}
                style={{
                  background: 'var(--accent-dim, rgba(255,170,0,0.1))',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                  borderRadius: 3,
                  fontSize: 10,
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                Open
              </button>
              {!rec.shared && (
                <button
                  onClick={() => handleShare(rec.recording_id)}
                  style={{
                    background: 'none',
                    color: '#00cc66',
                    border: '1px solid #00cc6640',
                    borderRadius: 3,
                    fontSize: 10,
                    padding: '2px 8px',
                    cursor: 'pointer',
                  }}
                >
                  Share
                </button>
              )}
              <button
                onClick={() => handleDelete(rec.recording_id)}
                style={{
                  background: 'none',
                  color: '#ff444480',
                  border: '1px solid #ff444440',
                  borderRadius: 3,
                  fontSize: 10,
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
