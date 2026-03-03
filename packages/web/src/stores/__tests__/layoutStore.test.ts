import { describe, test, expect, beforeEach } from 'vitest';
import { useLayoutStore } from '../layoutStore';

describe('layoutStore', () => {
  beforeEach(() => {
    // Reset store to defaults between tests
    useLayoutStore.getState().resetLayout();
  });

  test('has default layout on init', () => {
    const state = useLayoutStore.getState();
    expect(state.layout).not.toBeNull();
    expect(state.panelConfigs).toHaveProperty('viewport3d');
  });

  test('addPanel creates new instance and updates tree', () => {
    const store = useLayoutStore.getState();
    store.addPanel('plot');

    const state = useLayoutStore.getState();
    const plotInstances = Object.entries(state.panelConfigs).filter(
      ([_, v]) => v.type === 'plot',
    );
    expect(plotInstances).toHaveLength(1);
    expect(state.layout).not.toBeNull();
  });

  test('removePanel removes from configs and tree', () => {
    const store = useLayoutStore.getState();
    store.addPanel('plot');

    let state = useLayoutStore.getState();
    const plotId = Object.keys(state.panelConfigs).find(
      (k) => state.panelConfigs[k].type === 'plot',
    )!;

    store.removePanel(plotId);
    state = useLayoutStore.getState();
    expect(state.panelConfigs[plotId]).toBeUndefined();
  });

  test('updatePanelConfig merges config', () => {
    useLayoutStore.getState().updatePanelConfig('viewport3d', { showGrid: true });
    const config = useLayoutStore.getState().panelConfigs['viewport3d'].config;
    expect(config.showGrid).toBe(true);
  });

  test('saveLayout and loadLayout round-trip', () => {
    const store = useLayoutStore.getState();
    const countBefore = useLayoutStore.getState().savedLayouts.length;
    store.saveLayout('My Layout');

    let state = useLayoutStore.getState();
    expect(state.savedLayouts).toHaveLength(countBefore + 1);
    const myLayout = state.savedLayouts.find((l) => l.name === 'My Layout');
    expect(myLayout).toBeDefined();

    // Modify current layout
    store.addPanel('log');

    // Load saved
    store.loadLayout(myLayout!.id);
    state = useLayoutStore.getState();
    expect(state.activeLayoutId).toBe(myLayout!.id);
  });

  test('deleteLayout removes saved layout', () => {
    const store = useLayoutStore.getState();
    const countBefore = useLayoutStore.getState().savedLayouts.length;
    store.saveLayout('Temp');

    const layouts = useLayoutStore.getState().savedLayouts;
    const tempLayout = layouts.find((l) => l.name === 'Temp')!;
    store.deleteLayout(tempLayout.id);

    expect(useLayoutStore.getState().savedLayouts).toHaveLength(countBefore);
  });

  test('setVariable stores and retrieves', () => {
    useLayoutStore.getState().setVariable('selectedTopic', '/camera/image');
    expect(useLayoutStore.getState().variables.selectedTopic).toBe('/camera/image');
  });
});
