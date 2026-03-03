/**
 * Mission Control — Panel Registry
 * Type-safe panel registration with category grouping and platform targeting.
 */

import type { ComponentType } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PanelCategory =
  | '3d-spatial'
  | 'sensors'
  | 'data'
  | 'ros2-inspect'
  | 'ros2-control'
  | 'diagnostics'
  | 'recording'
  | 'isaac'
  | 'infrastructure'
  | 'project'
  | 'utility';

export type Platform = 'web' | 'desktop' | 'ios';

export interface PanelProps {
  panelId: string;
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

export interface PanelDefinition {
  id: string;
  title: string;
  category: PanelCategory;
  component: ComponentType<any>;
  icon?: ComponentType;
  platforms: Platform[];
  requiresLiveData?: boolean;
  defaultConfig?: Record<string, unknown>;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export class PanelRegistry {
  private panels = new Map<string, PanelDefinition>();

  register(def: PanelDefinition): void {
    this.panels.set(def.id, def);
  }

  get(id: string): PanelDefinition | undefined {
    return this.panels.get(id);
  }

  getAll(): PanelDefinition[] {
    return Array.from(this.panels.values());
  }

  getByCategory(category: PanelCategory): PanelDefinition[] {
    return this.getAll().filter((p) => p.category === category);
  }

  getByPlatform(platform: Platform): PanelDefinition[] {
    return this.getAll().filter((p) => p.platforms.includes(platform));
  }

  has(id: string): boolean {
    return this.panels.has(id);
  }
}

// ── Singleton + backward-compatible API ───────────────────────────────────────

export const panelRegistry = new PanelRegistry();

/** @deprecated Use panelRegistry.register() with full PanelDefinition */
export interface PanelDef {
  id: string;
  title: string;
  component: ComponentType;
}

export function registerPanel(def: PanelDef & Partial<PanelDefinition>): void {
  panelRegistry.register({
    category: 'utility',
    platforms: ['web', 'desktop'],
    ...def,
  });
}

export function getPanel(id: string): PanelDefinition | undefined {
  return panelRegistry.get(id);
}

export function getAllPanels(): PanelDefinition[] {
  return panelRegistry.getAll();
}
