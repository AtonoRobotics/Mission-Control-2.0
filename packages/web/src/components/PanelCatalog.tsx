/**
 * Mission Control — Panel Catalog
 * Modal dialog for adding panels to the workspace.
 * Groups panels by category with search/filter.
 */

import { useState, useMemo } from 'react';
import { panelRegistry, type PanelCategory, type PanelDefinition } from '@/panels/panelRegistry';
import { useLayoutStore } from '@/stores/layoutStore';

interface PanelCatalogProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<PanelCategory, string> = {
  '3d-spatial': '3D & Spatial',
  sensors: 'Sensors',
  data: 'Data',
  'ros2-inspect': 'ROS2 Inspect',
  'ros2-control': 'ROS2 Control',
  diagnostics: 'Diagnostics',
  recording: 'Recording',
  isaac: 'Isaac Sim',
  infrastructure: 'Infrastructure',
  project: 'Project',
  utility: 'Utility',
};

const CATEGORY_ORDER: PanelCategory[] = [
  '3d-spatial',
  'sensors',
  'data',
  'ros2-inspect',
  'ros2-control',
  'diagnostics',
  'recording',
  'isaac',
  'infrastructure',
  'project',
  'utility',
];

export default function PanelCatalog({ open, onClose }: PanelCatalogProps) {
  const [search, setSearch] = useState('');
  const addPanel = useLayoutStore((s) => s.addPanel);

  const grouped = useMemo(() => {
    const allPanels = panelRegistry.getAll();
    const filtered = search
      ? allPanels.filter(
          (p) =>
            p.title.toLowerCase().includes(search.toLowerCase()) ||
            p.category.toLowerCase().includes(search.toLowerCase()),
        )
      : allPanels;

    const groups: Partial<Record<PanelCategory, PanelDefinition[]>> = {};
    for (const p of filtered) {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category]!.push(p);
    }
    return groups;
  }, [search]);

  const handleAdd = (panelId: string) => {
    addPanel(panelId);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 520,
          maxHeight: '70vh',
          background: 'var(--bg-surface-1)',
          borderRadius: 10,
          border: '1px solid var(--border-subtle, #333)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border-subtle, #222)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
              Add Panel
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 18,
                padding: '0 4px',
              }}
            >
              &times;
            </button>
          </div>
          <input
            type="text"
            placeholder="Search panels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="mc-input"
            style={{ width: '100%' }}
          />
        </div>

        {/* Panel List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 16px' }}>
          {CATEGORY_ORDER.map((cat) => {
            const panels = grouped[cat];
            if (!panels?.length) return null;

            return (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-tertiary, #666)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 6,
                  }}
                >
                  {CATEGORY_LABELS[cat]}
                </div>
                {panels.map((panel) => (
                  <button
                    key={panel.id}
                    onClick={() => handleAdd(panel.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '8px 10px',
                      marginBottom: 2,
                      background: 'transparent',
                      border: '1px solid transparent',
                      borderRadius: 6,
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                      textAlign: 'left',
                      fontSize: 13,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--accent-dim)';
                      e.currentTarget.style.borderColor = 'var(--border-subtle, #333)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                  >
                    <span style={{ flex: 1 }}>{panel.title}</span>
                    <span style={{ display: 'flex', gap: 3 }}>
                      {panel.platforms.map((p) => (
                        <span
                          key={p}
                          style={{
                            fontSize: 9,
                            padding: '1px 5px',
                            borderRadius: 3,
                            background: 'var(--bg-surface-3, #222)',
                            color: 'var(--text-tertiary, #888)',
                            textTransform: 'uppercase',
                          }}
                        >
                          {p}
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}

          {Object.keys(grouped).length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>
              No panels match "{search}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
