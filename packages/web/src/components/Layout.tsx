/**
 * Mission Control — Workspace Layout
 * Full-screen mosaic renderer with panel headers (title, close button).
 * Right-click context menu on panel chrome for split / maximize / close.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Mosaic, MosaicWindow, type MosaicBranch } from 'react-mosaic-component';
import 'react-mosaic-component/react-mosaic-component.css';
import { useLayoutStore } from '@/stores/layoutStore';
import { getPanel } from '@/panels/panelRegistry';
import { ErrorBoundary } from './ErrorBoundary';
import type { MosaicNode } from 'react-mosaic-component';

// ── Context Menu State ──────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  instanceId: string;
  path: MosaicBranch[];
}

export default function Layout() {
  const { layout, setLayout, panelConfigs, removePanel, updatePanelConfig, addPanel } = useLayoutStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [maximizedPanel, setMaximizedPanel] = useState<string | null>(null);
  const [preMaximizeLayout, setPreMaximizeLayout] = useState<MosaicNode<string> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  // Close context menu on Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, instanceId: string, path: MosaicBranch[]) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, instanceId, path });
  }, []);

  const handleSplit = useCallback((direction: 'row' | 'column') => {
    if (!contextMenu) return;
    const { instanceId } = contextMenu;
    const instance = panelConfigs[instanceId];
    const panelType = instance?.type ?? instanceId;

    // Create a new instance of the same panel type
    const newId = `${panelType}-${Date.now()}`;
    const currentLayout = layout;
    if (!currentLayout) return;

    const newNode: MosaicNode<string> = {
      direction,
      first: instanceId,
      second: newId,
      splitPercentage: 50,
    };

    // Replace the panel in the tree with the split node
    const updatedLayout = replacePanelInTree(currentLayout, instanceId, newNode);

    useLayoutStore.setState({
      layout: updatedLayout,
      panelConfigs: {
        ...panelConfigs,
        [newId]: { type: panelType, config: {} },
      },
    });

    setContextMenu(null);
  }, [contextMenu, layout, panelConfigs]);

  const handleMaximize = useCallback(() => {
    if (!contextMenu) return;
    const { instanceId } = contextMenu;

    if (maximizedPanel === instanceId) {
      // Restore
      if (preMaximizeLayout) {
        setLayout(preMaximizeLayout);
      }
      setMaximizedPanel(null);
      setPreMaximizeLayout(null);
    } else {
      // Maximize
      setPreMaximizeLayout(layout);
      setLayout(instanceId);
      setMaximizedPanel(instanceId);
    }

    setContextMenu(null);
  }, [contextMenu, layout, maximizedPanel, preMaximizeLayout, setLayout]);

  const handleClose = useCallback(() => {
    if (!contextMenu) return;
    removePanel(contextMenu.instanceId);
    if (maximizedPanel === contextMenu.instanceId) {
      setMaximizedPanel(null);
      if (preMaximizeLayout) {
        setLayout(preMaximizeLayout);
        setPreMaximizeLayout(null);
      }
    }
    setContextMenu(null);
  }, [contextMenu, removePanel, maximizedPanel, preMaximizeLayout, setLayout]);

  const renderTile = (instanceId: string, path: MosaicBranch[]) => {
    const instance = panelConfigs[instanceId];
    const panelType = instance?.type ?? instanceId;
    const panel = getPanel(panelType);

    if (!panel) {
      return (
        <MosaicWindow<string> path={path} title={`Unknown: ${instanceId}`} toolbarControls={<></>}>
          <div className="p-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            Unknown panel: {instanceId}
          </div>
        </MosaicWindow>
      );
    }

    const Component = panel.component;
    const config = instance?.config ?? {};

    const toolbarControls = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {maximizedPanel === instanceId && (
          <button
            onClick={() => {
              if (preMaximizeLayout) setLayout(preMaximizeLayout);
              setMaximizedPanel(null);
              setPreMaximizeLayout(null);
            }}
            title="Restore panel"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-tertiary, #666)',
              cursor: 'pointer',
              fontSize: 12,
              padding: '0 4px',
              lineHeight: 1,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary, #666)'; }}
          >
            ⊟
          </button>
        )}
        <button
          onClick={() => removePanel(instanceId)}
          title="Close panel"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-tertiary, #666)',
            cursor: 'pointer',
            fontSize: 14,
            padding: '0 4px',
            lineHeight: 1,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger, #f44)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary, #666)'; }}
        >
          &times;
        </button>
      </div>
    );

    return (
      <MosaicWindow<string>
        path={path}
        title={panel.title}
        toolbarControls={toolbarControls}
      >
        <div
          style={{ width: '100%', height: '100%' }}
          onContextMenu={(e) => handleContextMenu(e, instanceId, path)}
        >
          <ErrorBoundary
            fallback={
              <div style={{ padding: 12, color: '#ff4444', fontFamily: 'monospace', fontSize: 11 }}>
                Panel "{panel.title}" crashed. Check console.
              </div>
            }
          >
            <Component
              panelId={instanceId}
              config={config}
              onConfigChange={(c: Record<string, unknown>) => updatePanelConfig(instanceId, c)}
            />
          </ErrorBoundary>
        </div>
      </MosaicWindow>
    );
  };

  return (
    <>
      <Mosaic<string>
        renderTile={renderTile}
        value={layout}
        onChange={setLayout as any}
        className="mosaic-blueprint-theme bp5-dark"
      />

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 9999,
            minWidth: 180,
            background: 'var(--bg-surface-1)',
            border: '1px solid var(--border-subtle, #333)',
            borderRadius: 6,
            padding: '4px 0',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <ContextMenuItem onClick={() => handleSplit('row')}>
            Split Horizontal
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleSplit('column')}>
            Split Vertical
          </ContextMenuItem>
          <div style={{ borderTop: '1px solid var(--border-subtle, #333)', margin: '4px 0' }} />
          <ContextMenuItem onClick={handleMaximize}>
            {maximizedPanel === contextMenu.instanceId ? 'Restore' : 'Maximize'}
          </ContextMenuItem>
          <div style={{ borderTop: '1px solid var(--border-subtle, #333)', margin: '4px 0' }} />
          <ContextMenuItem onClick={handleClose} danger>
            Close Panel
          </ContextMenuItem>
        </div>
      )}
    </>
  );
}

// ── Context Menu Item ───────────────────────────────────────────────────────

function ContextMenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        padding: '6px 14px',
        fontSize: 12,
        color: danger ? 'var(--danger, #f44)' : 'var(--text-primary)',
        background: 'transparent',
        border: 'none',
        textAlign: 'left',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger
          ? 'rgba(255,68,68,0.1)'
          : 'var(--accent-dim)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}

// ── Tree Helpers ─────────────────────────────────────────────────────────────

function replacePanelInTree(
  node: MosaicNode<string>,
  targetId: string,
  replacement: MosaicNode<string>,
): MosaicNode<string> {
  if (typeof node === 'string') {
    return node === targetId ? replacement : node;
  }

  return {
    ...node,
    first: replacePanelInTree(node.first, targetId, replacement),
    second: replacePanelInTree(node.second, targetId, replacement),
  };
}
