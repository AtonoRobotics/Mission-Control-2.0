import type { ComponentType } from 'react';
import type { PanelId } from '@/stores/layoutStore';

export interface PanelDef {
  id: PanelId;
  title: string;
  component: ComponentType;
}

const registry = new Map<PanelId, PanelDef>();

export function registerPanel(def: PanelDef) {
  registry.set(def.id, def);
}

export function getPanel(id: PanelId): PanelDef | undefined {
  return registry.get(id);
}

export function getAllPanels(): PanelDef[] {
  return Array.from(registry.values());
}
