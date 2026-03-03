/**
 * Shared sub-components for robot panels.
 */

export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case 'promoted': case 'complete': case 'connected': return 'var(--success)';
    case 'validated': case 'running': case 'connecting': return 'var(--warning)';
    case 'draft': case 'pending': return 'var(--accent)';
    case 'failed': case 'disconnected': return 'var(--danger)';
    default: return 'var(--text-muted)';
  }
}

export function buildStatusBadge(status: string): string {
  switch (status) {
    case 'complete': return 'badge badge-success';
    case 'running': return 'badge badge-warning';
    case 'pending': return 'badge badge-info';
    case 'failed': return 'badge badge-danger';
    default: return 'badge';
  }
}

export function Spinner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      color: 'var(--text-muted)', fontSize: 12, padding: 24,
    }}>
      <div style={{
        width: 14, height: 14, border: '2px solid var(--border-default)',
        borderTopColor: 'var(--accent)', borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      Loading…
    </div>
  );
}

export function ErrorMessage({ msg }: { msg: string }) {
  return (
    <div style={{
      padding: '12px 16px',
      background: 'rgba(255, 68, 68, 0.08)',
      border: '1px solid rgba(255, 68, 68, 0.25)',
      borderRadius: 'var(--radius-md)',
      color: 'var(--danger)',
      fontSize: 12,
    }}>
      {msg}
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div style={{
      padding: '32px 0', textAlign: 'center',
      color: 'var(--text-muted)', fontSize: 12,
    }}>
      {label}
    </div>
  );
}

export function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 12,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
      {right}
    </div>
  );
}

export function StatusDot({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      backgroundColor: statusColor(status), marginRight: 6, flexShrink: 0,
    }} />
  );
}

export function NullBadge() {
  return (
    <span style={{
      fontSize: 9, padding: '1px 6px', borderRadius: 3,
      background: 'rgba(255, 68, 68, 0.1)', color: 'var(--danger)',
      fontWeight: 600, letterSpacing: 0.3,
    }}>
      NULL
    </span>
  );
}
