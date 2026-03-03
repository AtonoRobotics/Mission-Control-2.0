import { describe, test, expect } from 'vitest';
import { PanelRegistry } from '../panelRegistry';

describe('PanelRegistry', () => {
  test('registers and retrieves panel definition', () => {
    const registry = new PanelRegistry();
    registry.register({
      id: 'test-panel',
      title: 'Test Panel',
      category: '3d-spatial',
      component: () => null,
      platforms: ['web', 'desktop'],
    });
    const def = registry.get('test-panel');
    expect(def?.title).toBe('Test Panel');
    expect(def?.category).toBe('3d-spatial');
  });

  test('lists panels by category', () => {
    const registry = new PanelRegistry();
    registry.register({ id: 'a', title: 'A', category: 'data', component: () => null, platforms: ['web'] });
    registry.register({ id: 'b', title: 'B', category: 'data', component: () => null, platforms: ['web'] });
    registry.register({ id: 'c', title: 'C', category: 'ros2-inspect', component: () => null, platforms: ['web'] });
    expect(registry.getByCategory('data')).toHaveLength(2);
    expect(registry.getByCategory('ros2-inspect')).toHaveLength(1);
  });

  test('getAll returns all registered panels', () => {
    const registry = new PanelRegistry();
    registry.register({ id: 'x', title: 'X', category: 'utility', component: () => null, platforms: ['web'] });
    expect(registry.getAll()).toHaveLength(1);
  });

  test('getByPlatform filters correctly', () => {
    const registry = new PanelRegistry();
    registry.register({ id: 'web-only', title: 'W', category: 'data', component: () => null, platforms: ['web'] });
    registry.register({ id: 'all', title: 'A', category: 'data', component: () => null, platforms: ['web', 'desktop', 'ios'] });
    expect(registry.getByPlatform('ios')).toHaveLength(1);
    expect(registry.getByPlatform('web')).toHaveLength(2);
  });

  test('has returns true for registered panel', () => {
    const registry = new PanelRegistry();
    registry.register({ id: 'exists', title: 'E', category: 'utility', component: () => null, platforms: ['web'] });
    expect(registry.has('exists')).toBe(true);
    expect(registry.has('missing')).toBe(false);
  });
});
