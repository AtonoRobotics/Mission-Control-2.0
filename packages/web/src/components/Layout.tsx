/**
 * Mission Control — Workspace Layout
 * Full-screen mosaic renderer with panel headers (title, close button).
 * Resolves panel instances via layoutStore → panelRegistry.
 */

import { Mosaic, MosaicWindow, type MosaicBranch } from 'react-mosaic-component';
import 'react-mosaic-component/react-mosaic-component.css';
import { useLayoutStore } from '@/stores/layoutStore';
import { getPanel } from '@/panels/panelRegistry';
import { ErrorBoundary } from './ErrorBoundary';

export default function Layout() {
  const { layout, setLayout, panelConfigs, removePanel, updatePanelConfig } = useLayoutStore();

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
      </MosaicWindow>
    );
  };

  return (
    <Mosaic<string>
      renderTile={renderTile}
      value={layout}
      onChange={setLayout as any}
      className="mosaic-blueprint-theme bp5-dark"
    />
  );
}
