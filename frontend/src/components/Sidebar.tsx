import { useNavStore, type PageId } from '@/stores/navStore';
import { useRosBridgeStore } from '@/stores/rosBridgeStore';

interface NavItem {
  id: PageId;
  label: string;
  icon: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Visualization',
    items: [
      { id: 'overview', label: 'Overview', icon: '⬡' },
      { id: 'viewer3d', label: '3D Viewer', icon: '◎' },
      { id: 'rqtGraph', label: 'ROS Graph', icon: '⊞' },
      { id: 'actionGraph', label: 'Action Graph', icon: '⬢' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'robots', label: 'Robots', icon: '◉' },
      { id: 'fleet', label: 'Fleet', icon: '▦' },
      { id: 'agents', label: 'Agents', icon: '⚙' },
      { id: 'infrastructure', label: 'Infra', icon: '▣' },
    ],
  },
  {
    label: 'Management',
    items: [
      { id: 'registry', label: 'Registry', icon: '◈' },
      { id: 'pipelines', label: 'Pipelines', icon: '⟐' },
    ],
  },
];

export default function Sidebar() {
  const activePage = useNavStore((s) => s.activePage);
  const setPage = useNavStore((s) => s.setPage);
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
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div
              className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--text-muted)', fontSize: '9px' }}
            >
              {section.label}
            </div>
            {section.items.map((item) => (
              <button
                key={item.id}
                className="w-full flex items-center gap-3 px-4 py-1.5 text-left transition-colors"
                style={{
                  color: activePage === item.id ? 'var(--accent)' : 'var(--text-secondary)',
                  background: activePage === item.id ? 'var(--accent-dim)' : 'transparent',
                  borderLeft: activePage === item.id ? '2px solid var(--accent)' : '2px solid transparent',
                }}
                onClick={() => setPage(item.id)}
              >
                <span className="text-sm w-5 text-center">{item.icon}</span>
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            ))}
          </div>
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
