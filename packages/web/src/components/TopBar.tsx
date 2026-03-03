/**
 * Mission Control — Top Bar
 * Replaces sidebar navigation with horizontal toolbar.
 * Layout selector, +Panel, data source, robot selector, user menu.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLayoutStore } from '@/stores/layoutStore';
import { useAuthStore } from '@/stores/authStore';
import { useConnectionStatus, useDataSource, useDataSourceSwitch } from '@/data-source/hooks';
import { useNavStore, type WorkspaceMode } from '@/stores/navStore';
import { WORKSPACE_LAYOUTS } from '@/layouts/defaults';
import PanelCatalog from './PanelCatalog';

const WORKSPACE_MODES: WorkspaceMode[] = [
  'build',
  'scene',
  'motion',
  'simulate',
  'deploy',
  'monitor',
];

export default function TopBar() {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const { savedLayouts, activeLayoutId, loadLayout, saveLayout, deleteLayout, resetLayout, setLayout: setMosaicLayout } =
    useLayoutStore();
  const { user, logout } = useAuthStore();
  const { activeMode, setMode } = useNavStore();
  const connectionStatus = useConnectionStatus();
  const dataSource = useDataSource();
  const { switchToLive, switchToMcap } = useDataSourceSwitch();

  const handleModeClick = useCallback((mode: WorkspaceMode) => {
    setMode(mode);
    // Load the workspace default layout for this mode
    const preset = WORKSPACE_LAYOUTS[mode];
    if (preset) {
      loadLayout(preset.id);
    }
  }, [setMode, loadLayout]);

  const handleOpenMcap = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mcap';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) await switchToMcap(file);
    };
    input.click();
  }, [switchToMcap]);

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 40,
          padding: '0 12px',
          background: 'var(--bg-surface-1)',
          borderBottom: '1px solid var(--border-default, #222)',
          gap: 6,
          flexShrink: 0,
        }}
      >
        {/* Brand */}
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--accent)',
            letterSpacing: 1.5,
            marginRight: 12,
          }}
        >
          MISSION CONTROL
        </span>

        {/* Workspace mode tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {WORKSPACE_MODES.map((mode) => (
            <button
              key={mode}
              onClick={() => handleModeClick(mode)}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                color: activeMode === mode ? 'var(--accent)' : 'var(--text-tertiary, #666)',
                background: activeMode === mode ? 'var(--accent-dim)' : 'transparent',
                border: 'none',
                borderBottom: activeMode === mode ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (activeMode !== mode) {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                  e.currentTarget.style.background = 'var(--bg-surface-2)';
                }
              }}
              onMouseLeave={(e) => {
                if (activeMode !== mode) {
                  e.currentTarget.style.color = 'var(--text-tertiary, #666)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle, #333)', margin: '0 4px' }} />

        {/* Layout selector */}
        <DropdownButton
          label={
            savedLayouts.find((l) => l.id === activeLayoutId)?.name ?? 'Default Layout'
          }
          open={layoutMenuOpen}
          onToggle={() => setLayoutMenuOpen(!layoutMenuOpen)}
          onClose={() => setLayoutMenuOpen(false)}
        >
          <DropdownItem onClick={() => { resetLayout(); setLayoutMenuOpen(false); }}>
            Default Layout
          </DropdownItem>
          {savedLayouts.map((l) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center' }}>
              <DropdownItem
                onClick={() => { loadLayout(l.id); setLayoutMenuOpen(false); }}
                style={{ flex: 1 }}
              >
                {l.name}
              </DropdownItem>
              <button
                onClick={(e) => { e.stopPropagation(); deleteLayout(l.id); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-tertiary, #666)',
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: '4px 6px',
                }}
                title="Delete layout"
              >
                &times;
              </button>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--border-subtle, #333)', marginTop: 4, paddingTop: 4 }}>
            <DropdownItem
              onClick={() => {
                const name = prompt('Layout name:');
                if (name) { saveLayout(name); setLayoutMenuOpen(false); }
              }}
            >
              + Save Current Layout
            </DropdownItem>
          </div>
        </DropdownButton>

        {/* Add Panel */}
        <ToolbarButton onClick={() => setCatalogOpen(true)}>+ Panel</ToolbarButton>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Data source indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 8px',
            borderRadius: 4,
            background: 'var(--bg-surface-2)',
            fontSize: 11,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background:
                connectionStatus === 'connected'
                  ? 'var(--success, #4caf50)'
                  : connectionStatus === 'connecting'
                    ? 'var(--warning, #ff9800)'
                    : 'var(--danger, #f44336)',
            }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>
            {dataSource.type === 'mcap'
              ? 'MCAP'
              : connectionStatus === 'connected'
                ? 'Live'
                : connectionStatus === 'connecting'
                  ? 'Connecting'
                  : 'Offline'}
          </span>
        </div>

        {/* Data source switching */}
        {dataSource.type === 'mcap' ? (
          <ToolbarButton onClick={() => switchToLive()}>Go Live</ToolbarButton>
        ) : (
          <ToolbarButton onClick={handleOpenMcap}>Open MCAP</ToolbarButton>
        )}

        {/* User menu */}
        {user && (
          <DropdownButton
            label={user.display_name}
            open={userMenuOpen}
            onToggle={() => setUserMenuOpen(!userMenuOpen)}
            onClose={() => setUserMenuOpen(false)}
          >
            <div
              style={{
                padding: '6px 10px',
                fontSize: 11,
                color: 'var(--text-tertiary, #666)',
                borderBottom: '1px solid var(--border-subtle, #333)',
                marginBottom: 4,
              }}
            >
              {user.email}
              <br />
              <span style={{ textTransform: 'capitalize' }}>{user.role}</span>
            </div>
            <DropdownItem
              onClick={() => {
                logout();
                setUserMenuOpen(false);
              }}
            >
              Sign Out
            </DropdownItem>
          </DropdownButton>
        )}
      </div>

      <PanelCatalog open={catalogOpen} onClose={() => setCatalogOpen(false)} />
    </>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function ToolbarButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--text-secondary)',
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border-subtle, #333)',
        borderRadius: 4,
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-subtle, #333)';
        e.currentTarget.style.color = 'var(--text-secondary)';
      }}
    >
      {children}
    </button>
  );
}

function DropdownButton({
  label,
  open,
  onToggle,
  onClose,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={onToggle}
        style={{
          padding: '4px 10px',
          fontSize: 12,
          fontWeight: 500,
          color: open ? 'var(--accent)' : 'var(--text-secondary)',
          background: 'var(--bg-surface-2)',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border-subtle, #333)'}`,
          borderRadius: 4,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {label}
        <span style={{ fontSize: 8 }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            minWidth: 180,
            background: 'var(--bg-surface-1)',
            border: '1px solid var(--border-subtle, #333)',
            borderRadius: 6,
            padding: '4px 0',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  children,
  onClick,
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        padding: '6px 12px',
        fontSize: 12,
        color: 'var(--text-primary)',
        background: 'transparent',
        border: 'none',
        textAlign: 'left',
        cursor: 'pointer',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--accent-dim)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}
