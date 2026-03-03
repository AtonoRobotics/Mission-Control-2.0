import { Mosaic, MosaicWindow, type MosaicBranch } from 'react-mosaic-component';
import 'react-mosaic-component/react-mosaic-component.css';
import { useLayoutStore } from '@/stores/layoutStore';
import { getPanel } from '@/panels/panelRegistry';
import { ErrorBoundary } from './ErrorBoundary';

export default function Layout() {
  const { layout, setLayout } = useLayoutStore();

  const renderTile = (id: string, path: MosaicBranch[]) => {
    const panel = getPanel(id);
    if (!panel) return <div className="p-4 text-sm" style={{ color: 'var(--text-muted)' }}>Unknown panel: {id}</div>;
    const Component = panel.component;

    return (
      <MosaicWindow<string>
        path={path}
        title={panel.title}
        toolbarControls={<></>}
      >
        <ErrorBoundary
          fallback={
            <div style={{ padding: 12, color: '#ff4444', fontFamily: 'monospace', fontSize: 11 }}>
              Panel "{panel.title}" crashed. Check console.
            </div>
          }
        >
          <Component />
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
