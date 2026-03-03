/**
 * Mission Control — Default Layout Presets
 * One layout per workspace mode (build, scene, motion, simulate, deploy, monitor).
 */

import type { MosaicNode } from 'react-mosaic-component';
import type { SavedLayout, PanelInstance } from '@/stores/layoutStore';
import type { WorkspaceMode } from '@/stores/navStore';

interface LayoutPreset {
  id: string;
  name: string;
  layout: MosaicNode<string>;
  panelConfigs: Record<string, PanelInstance>;
}

function pc(type: string): PanelInstance {
  return { type, config: {} };
}

export const WORKSPACE_LAYOUTS: Record<WorkspaceMode, LayoutPreset> = {
  build: {
    id: 'build',
    name: 'Build',
    layout: {
      direction: 'row',
      first: 'robot-list',
      second: {
        direction: 'row',
        first: 'robot-config',
        second: 'viewport3d',
        splitPercentage: 57, // 40/(40+30)
      },
      splitPercentage: 30,
    },
    panelConfigs: {
      'robot-list': pc('robot-list'),
      'robot-config': pc('robot-config'),
      viewport3d: pc('viewport3d'),
    },
  },
  scene: {
    id: 'scene',
    name: 'Scene',
    layout: {
      direction: 'row',
      first: 'viewport3d',
      second: {
        direction: 'column',
        first: 'displays',
        second: 'properties',
        splitPercentage: 50,
      },
      splitPercentage: 70,
    },
    panelConfigs: {
      viewport3d: pc('viewport3d'),
      displays: pc('displays'),
      properties: pc('properties'),
    },
  },
  motion: {
    id: 'motion',
    name: 'Motion',
    layout: {
      direction: 'column',
      first: 'viewport3d',
      second: 'pipeline-builder',
      splitPercentage: 60,
    },
    panelConfigs: {
      viewport3d: pc('viewport3d'),
      'pipeline-builder': pc('pipeline-builder'),
    },
  },
  simulate: {
    id: 'simulate',
    name: 'Simulate',
    layout: {
      direction: 'row',
      first: 'viewport3d',
      second: {
        direction: 'column',
        first: 'robot-isaac',
        second: 'diagnostics',
        splitPercentage: 50,
      },
      splitPercentage: 50,
    },
    panelConfigs: {
      viewport3d: pc('viewport3d'),
      'robot-isaac': pc('robot-isaac'),
      diagnostics: pc('diagnostics'),
    },
  },
  deploy: {
    id: 'deploy',
    name: 'Deploy',
    layout: {
      direction: 'row',
      first: 'fleet-status',
      second: {
        direction: 'column',
        first: 'robot-real',
        second: 'agent-monitor',
        splitPercentage: 50,
      },
      splitPercentage: 50,
    },
    panelConfigs: {
      'fleet-status': pc('fleet-status'),
      'robot-real': pc('robot-real'),
      'agent-monitor': pc('agent-monitor'),
    },
  },
  monitor: {
    id: 'monitor',
    name: 'Monitor',
    layout: {
      direction: 'row',
      first: 'overview',
      second: {
        direction: 'row',
        first: 'fleet-status',
        second: 'diagnostics',
        splitPercentage: 50,
      },
      splitPercentage: 40,
    },
    panelConfigs: {
      overview: pc('overview'),
      'fleet-status': pc('fleet-status'),
      diagnostics: pc('diagnostics'),
    },
  },
};

/** Backward-compatible array of all workspace layouts */
export const DEFAULT_LAYOUTS: LayoutPreset[] = Object.values(WORKSPACE_LAYOUTS);

export function toSavedLayouts(): SavedLayout[] {
  return DEFAULT_LAYOUTS.map((l) => ({
    id: l.id,
    name: l.name,
    layout: l.layout,
    panelConfigs: l.panelConfigs,
    createdAt: new Date().toISOString(),
  }));
}
