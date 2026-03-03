/**
 * Sidebar — DEPRECATED. Replaced by TopBar workspace mode tabs.
 * Kept for reference only. Not imported anywhere.
 */

import { useNavStore, type WorkspaceMode } from '@/stores/navStore';
import { useRosBridgeStore } from '@/stores/rosBridgeStore';

interface NavItem {
  id: WorkspaceMode;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'build', label: 'Build', icon: '◉' },
  { id: 'scene', label: 'Scene', icon: '◎' },
  { id: 'motion', label: 'Motion', icon: '⟐' },
  { id: 'simulate', label: 'Simulate', icon: '⬢' },
  { id: 'deploy', label: 'Deploy', icon: '▦' },
  { id: 'monitor', label: 'Monitor', icon: '⬡' },
];

export default function Sidebar() {
  const activeMode = useNavStore((s) => s.activeMode);
  const setMode = useNavStore((s) => s.setMode);
  const rosStatus = useRosBridgeStore((s) => s.status);

  return (
    <div
      className="w-48 h-full flex flex-col border-r flex-shrink-0"
      style={{ background: 'var(--bg-surface-1)', borderColor: 'var(--border-default)' }}
    >
      {/* Logo */}
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-default)' }}>
        <div className="text-sm font-semibold tracking-wider" style={{ color: 'var(--accent)' }}>
          MISSION CONTROL
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Cinema Robot Platform
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className="w-full flex items-center gap-3 px-4 py-1.5 text-left transition-colors"
            style={{
              color: activeMode === item.id ? 'var(--accent)' : 'var(--text-secondary)',
              background: activeMode === item.id ? 'var(--accent-dim)' : 'transparent',
              borderLeft: activeMode === item.id ? '2px solid var(--accent)' : '2px solid transparent',
            }}
            onClick={() => setMode(item.id)}
          >
            <span className="text-sm w-5 text-center">{item.icon}</span>
            <span className="text-xs font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--border-default)' }}>
        <div className="flex items-center gap-2">
          <span
            className="status-dot"
            style={{
              backgroundColor:
                rosStatus === 'connected' ? 'var(--success)' :
                rosStatus === 'connecting' ? 'var(--warning)' : 'var(--danger)',
            }}
          />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            ROS: {rosStatus}
          </span>
        </div>
        <div className="text-xs mt-1 mono" style={{ color: 'var(--text-muted)' }}>
          v0.1.0
        </div>
      </div>
    </div>
  );
}
