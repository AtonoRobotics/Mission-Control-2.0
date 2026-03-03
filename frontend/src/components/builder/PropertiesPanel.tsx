import { useComponentStore, type Component, type DataSource } from '@/stores/componentStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PropertiesPanelProps {
  componentId: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tierBadge(tier: 1 | 2) {
  const bg = tier === 1 ? 'rgba(76, 175, 80, 0.15)' : 'rgba(255, 170, 0, 0.15)';
  const color = tier === 1 ? 'var(--success, #4caf50)' : 'var(--accent, #ffaa00)';
  const label = tier === 1 ? 'T1' : 'T2';
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
      background: bg, color,
    }}>
      {label}
    </span>
  );
}

function PropertyRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '4px 0', fontSize: 12,
    }}>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0, width: 110 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', textAlign: 'right', flex: 1, wordBreak: 'break-word' }}>
        {value ?? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>NULL</span>}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PropertiesPanel
// ---------------------------------------------------------------------------

export default function PropertiesPanel({ componentId, onApprove, onReject }: PropertiesPanelProps) {
  const { components } = useComponentStore();

  const component = componentId
    ? components.find((c) => c.component_id === componentId)
    : null;

  if (!component) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', height: '100%',
      }}>
        <div style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--border-default)',
          fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          Properties
        </div>
        <div style={{
          padding: '32px 12px', textAlign: 'center',
          color: 'var(--text-muted)', fontSize: 12,
        }}>
          Select a component to view properties
        </div>
      </div>
    );
  }

  const physics = component.physics ?? {};
  const approvalBg = component.approval_status === 'approved'
    ? 'rgba(76, 175, 80, 0.1)'
    : component.approval_status === 'rejected'
      ? 'rgba(255, 68, 68, 0.1)'
      : 'rgba(255, 170, 0, 0.1)';
  const approvalColor = component.approval_status === 'approved'
    ? 'var(--success, #4caf50)'
    : component.approval_status === 'rejected'
      ? 'var(--danger, #f44)'
      : 'var(--accent, #ffaa00)';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 10px',
        borderBottom: '1px solid var(--border-default)',
        fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        Properties
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
        {/* Identity */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            {component.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {component.manufacturer} {component.model && `\u2014 ${component.model}`}
          </div>
        </div>

        {/* Approval status */}
        <div style={{
          padding: '8px 10px', borderRadius: 6, background: approvalBg,
          marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 11, color: approvalColor, fontWeight: 600, textTransform: 'uppercase' }}>
              {component.approval_status.replace('_', ' ')}
            </div>
            {component.approved_by && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                by {component.approved_by}
              </div>
            )}
          </div>
          {component.approval_status === 'pending_hit' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => onApprove(component.component_id)}
                style={{
                  background: 'var(--success, #4caf50)', border: 'none', color: '#fff',
                  padding: '4px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Approve
              </button>
              <button
                onClick={() => onReject(component.component_id)}
                style={{
                  background: 'var(--danger, #f44)', border: 'none', color: '#fff',
                  padding: '4px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Reject
              </button>
            </div>
          )}
        </div>

        {/* Physics */}
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
          }}>
            Physics
          </div>
          <PropertyRow label="Mass" value={physics.mass_kg != null ? `${physics.mass_kg} kg` : null} />
          {physics.dimensions_mm && (
            <PropertyRow
              label="Dimensions"
              value={`${physics.dimensions_mm.l} x ${physics.dimensions_mm.w} x ${physics.dimensions_mm.h} mm`}
            />
          )}
          {physics.center_of_mass && (
            <PropertyRow
              label="CoM"
              value={`[${physics.center_of_mass.join(', ')}]`}
            />
          )}
        </div>

        {/* Data Sources */}
        {component.data_sources.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
            }}>
              Sources
            </div>
            {component.data_sources.map((ds: DataSource, i: number) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 0', fontSize: 11,
              }}>
                {tierBadge(ds.tier)}
                <span style={{ color: 'var(--text-primary)', flex: 1 }}>{ds.source}</span>
                {ds.url && (
                  <a
                    href={ds.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent, #ffaa00)', fontSize: 10, textDecoration: 'none' }}
                  >
                    link
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Attachment Interfaces */}
        {component.attachment_interfaces.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
            }}>
              Interfaces
            </div>
            {component.attachment_interfaces.map((ai, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 0', fontSize: 11,
              }}>
                <span style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 4,
                  background: ai.role === 'provides' ? 'rgba(76, 175, 80, 0.12)' : 'rgba(33, 150, 243, 0.12)',
                  color: ai.role === 'provides' ? 'var(--success, #4caf50)' : '#2196f3',
                }}>
                  {ai.role}
                </span>
                <span style={{ color: 'var(--text-primary)' }}>{ai.name}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>({ai.type})</span>
              </div>
            ))}
          </div>
        )}

        {/* Notes */}
        {component.notes && (
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
            }}>
              Notes
            </div>
            <div style={{
              fontSize: 11, color: 'var(--text-secondary)',
              background: 'var(--bg-surface, #1a1a1a)',
              padding: '6px 8px', borderRadius: 4,
              whiteSpace: 'pre-wrap',
            }}>
              {component.notes}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
