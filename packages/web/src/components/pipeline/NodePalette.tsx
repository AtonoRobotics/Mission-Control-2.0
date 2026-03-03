// ============================================================
// Node Palette — draggable sidebar for the Physical AI Pipeline
// canvas. Two collapsible sections (Assets / Operations) with
// search filtering. Drag entries onto the PipelineCanvas.
// ============================================================

import { useState, useCallback } from 'react';

// ── Palette entry definition ─────────────────────────────────

interface PaletteEntry {
  category: 'asset' | 'operation';
  type: string;
  label: string;
  icon: string;
}

const ASSET_ENTRIES: PaletteEntry[] = [
  { category: 'asset', type: 'robot_urdf', label: 'Robot URDF', icon: '\u2699' },
  { category: 'asset', type: 'robot_usd', label: 'Robot USD', icon: '\u2B22' },
  { category: 'asset', type: 'curobo_config', label: 'cuRobo Config', icon: '\u2630' },
  { category: 'asset', type: 'environment_usd', label: 'Environment USD', icon: '\u25A3' },
  { category: 'asset', type: 'object_usd', label: 'Object USD', icon: '\u25CB' },
  { category: 'asset', type: 'sensor_config', label: 'Sensor Config', icon: '\u25C9' },
  { category: 'asset', type: 'scene_usd', label: 'Scene USD', icon: '\u25A8' },
  { category: 'asset', type: 'demo_dataset', label: 'Demo Dataset', icon: '\u25A4' },
  { category: 'asset', type: 'synth_dataset', label: 'Synth Dataset', icon: '\u25A5' },
  { category: 'asset', type: 'checkpoint', label: 'Checkpoint', icon: '\u2691' },
  { category: 'asset', type: 'eval_report', label: 'Eval Report', icon: '\u2637' },
  { category: 'asset', type: 'deployment_pkg', label: 'Deployment Pkg', icon: '\u2690' },
  { category: 'asset', type: 'pretrained_model', label: 'Pretrained Model', icon: '\u29BE' },
];

const OPERATION_ENTRIES: PaletteEntry[] = [
  { category: 'operation', type: 'usd_compose', label: 'USD Compose', icon: '\u2A01' },
  { category: 'operation', type: 'isaac_lab_setup', label: 'Isaac Lab Setup', icon: '\u2316' },
  { category: 'operation', type: 'demo_record', label: 'Record Demos', icon: '\u25CF' },
  { category: 'operation', type: 'groot_mimic', label: 'GR00T-Mimic', icon: '\u2649' },
  { category: 'operation', type: 'cosmos_transfer', label: 'Cosmos Transfer', icon: '\u21C4' },
  { category: 'operation', type: 'cosmos_predict', label: 'Cosmos Predict', icon: '\u2732' },
  { category: 'operation', type: 'isaac_lab_rl', label: 'Isaac Lab RL', icon: '\u27F3' },
  { category: 'operation', type: 'groot_finetune', label: 'GR00T Fine-tune', icon: '\u2699' },
  { category: 'operation', type: 'arena_eval', label: 'Arena Eval', icon: '\u2611' },
  { category: 'operation', type: 'curobo_validate', label: 'cuRobo Validate', icon: '\u2713' },
  { category: 'operation', type: 'deploy', label: 'Deploy', icon: '\u2B95' },
];

// ── Component ────────────────────────────────────────────────

export default function NodePalette() {
  const [search, setSearch] = useState('');
  const [assetsOpen, setAssetsOpen] = useState(true);
  const [opsOpen, setOpsOpen] = useState(true);

  const filter = useCallback(
    (entries: PaletteEntry[]) => {
      if (!search.trim()) return entries;
      const q = search.toLowerCase();
      return entries.filter(
        (e) =>
          e.label.toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q),
      );
    },
    [search],
  );

  const filteredAssets = filter(ASSET_ENTRIES);
  const filteredOps = filter(OPERATION_ENTRIES);

  const handleDragStart = useCallback(
    (e: React.DragEvent, entry: PaletteEntry) => {
      e.dataTransfer.setData(
        'application/pipeline-node',
        JSON.stringify({
          category: entry.category,
          type: entry.type,
          label: entry.label,
        }),
      );
      e.dataTransfer.effectAllowed = 'copy';
    },
    [],
  );

  return (
    <div
      style={{
        width: 180,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#111111',
        borderRight: '1px solid #2a2a2a',
        overflowY: 'auto',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Search input */}
      <div style={{ padding: '6px 6px 4px', flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Search nodes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: '#1a1a1a',
            border: '1px solid #2a2a2a',
            borderRadius: 3,
            color: '#ccc',
            fontSize: 10,
            padding: '4px 6px',
            outline: 'none',
          }}
        />
      </div>

      {/* Assets section */}
      <SectionHeader
        title="Assets"
        count={filteredAssets.length}
        open={assetsOpen}
        onToggle={() => setAssetsOpen((v) => !v)}
        accentColor="#ffaa00"
      />
      {assetsOpen &&
        filteredAssets.map((entry) => (
          <PaletteItem
            key={entry.type}
            entry={entry}
            onDragStart={handleDragStart}
            accentColor="#ffaa00"
          />
        ))}

      {/* Operations section */}
      <SectionHeader
        title="Operations"
        count={filteredOps.length}
        open={opsOpen}
        onToggle={() => setOpsOpen((v) => !v)}
        accentColor="#888888"
      />
      {opsOpen &&
        filteredOps.map((entry) => (
          <PaletteItem
            key={entry.type}
            entry={entry}
            onDragStart={handleDragStart}
            accentColor="#888888"
          />
        ))}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  accentColor: string;
}

function SectionHeader({ title, count, open, onToggle, accentColor }: SectionHeaderProps) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 8px',
        cursor: 'pointer',
        background: '#171717',
        borderBottom: '1px solid #2a2a2a',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 8, color: '#666', width: 10 }}>
        {open ? '\u25BC' : '\u25B6'}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: accentColor,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {title}
      </span>
      <span
        style={{
          marginLeft: 'auto',
          fontSize: 8,
          color: '#555',
          background: '#1e1e1e',
          borderRadius: 8,
          padding: '0 4px',
        }}
      >
        {count}
      </span>
    </div>
  );
}

interface PaletteItemProps {
  entry: PaletteEntry;
  onDragStart: (e: React.DragEvent, entry: PaletteEntry) => void;
  accentColor: string;
}

function PaletteItem({ entry, onDragStart, accentColor }: PaletteItemProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, entry)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px 4px 12px',
        borderBottom: '1px solid #1e1e1e',
        cursor: 'grab',
        background: hovered ? `${accentColor}14` : 'transparent',
        transition: 'background 0.1s',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          fontSize: 11,
          width: 16,
          textAlign: 'center',
          color: accentColor,
          flexShrink: 0,
          opacity: 0.7,
        }}
      >
        {entry.icon}
      </span>
      <span
        style={{
          fontSize: 10,
          color: hovered ? '#e0e0e0' : '#aaa',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          transition: 'color 0.1s',
        }}
      >
        {entry.label}
      </span>
    </div>
  );
}
