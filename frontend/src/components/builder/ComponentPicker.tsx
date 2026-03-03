import { useState, useEffect } from 'react';
import { useComponentStore, type Component } from '@/stores/componentStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComponentPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (component: Component) => void;
  filterCategory?: string;
  filterInterfaceType?: string;
}

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'camera', label: 'Camera' },
  { value: 'lens', label: 'Lens' },
  { value: 'camera_plate', label: 'Camera Plate' },
  { value: 'fiz', label: 'FIZ' },
  { value: 'rail', label: 'Rail' },
  { value: 'base', label: 'Base' },
  { value: 'sensor', label: 'Sensor' },
  { value: 'accessory', label: 'Accessory' },
];

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--bg-primary, #0a0a0a)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-lg, 8px)',
  width: 520,
  maxHeight: '70vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-surface, #1a1a1a)',
  border: '1px solid var(--border-default)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  fontSize: 12,
  padding: '6px 10px',
  outline: 'none',
  width: '100%',
};

// ---------------------------------------------------------------------------
// ComponentPicker
// ---------------------------------------------------------------------------

export default function ComponentPicker({
  open, onClose, onSelect, filterCategory, filterInterfaceType,
}: ComponentPickerProps) {
  const { components, fetchComponents, loading } = useComponentStore();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(filterCategory ?? '');

  useEffect(() => {
    if (open) {
      fetchComponents();
      setSearch('');
      setCategory(filterCategory ?? '');
    }
  }, [open, fetchComponents, filterCategory]);

  if (!open) return null;

  const filtered = components.filter((c) => {
    if (category && c.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !c.name.toLowerCase().includes(q) &&
        !(c.manufacturer ?? '').toLowerCase().includes(q) &&
        !(c.model ?? '').toLowerCase().includes(q)
      ) return false;
    }
    if (filterInterfaceType) {
      const hasInterface = c.attachment_interfaces.some(
        (ai) => ai.type === filterInterfaceType
      );
      if (!hasInterface) return false;
    }
    return true;
  });

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border-default)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            Add Component
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 16, padding: '2px 6px',
            }}
          >
            &times;
          </button>
        </div>

        {/* Filters */}
        <div style={{ padding: '10px 16px', display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Search components..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            autoFocus
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ ...inputStyle, width: 130 }}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Results list */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 8px 8px',
        }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No components found
            </div>
          ) : (
            filtered.map((comp) => (
              <button
                key={comp.component_id}
                onClick={() => { onSelect(comp); onClose(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '8px 10px',
                  background: 'transparent',
                  border: '1px solid transparent',
                  borderRadius: 4,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s, border-color 0.15s',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 170, 0, 0.06)';
                  e.currentTarget.style.borderColor = 'var(--border-default)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                }}
              >
                {/* Approval dot */}
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  backgroundColor: comp.approval_status === 'approved'
                    ? 'var(--success, #4caf50)'
                    : comp.approval_status === 'rejected'
                      ? 'var(--danger, #f44)'
                      : 'var(--accent, #ffaa00)',
                }} />
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {comp.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                    {comp.manufacturer ?? comp.category}
                    {comp.physics?.mass_kg != null && ` \u2022 ${comp.physics.mass_kg}kg`}
                  </div>
                </div>
                {/* Category badge */}
                <span style={{
                  fontSize: 9,
                  color: 'var(--text-muted)',
                  background: 'var(--bg-surface, #1a1a1a)',
                  padding: '2px 8px',
                  borderRadius: 8,
                  textTransform: 'uppercase',
                  flexShrink: 0,
                }}>
                  {comp.category}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
