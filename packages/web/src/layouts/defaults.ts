/**
 * Mission Control — Default Layout Presets
 * Sensible workspace configurations for common workflows.
 */

import type { MosaicNode } from 'react-mosaic-component';
import type { SavedLayout, PanelInstance } from '@/stores/layoutStore';

interface LayoutPreset {
  id: string;
  name: string;
  layout: MosaicNode<string>;
  panelConfigs: Record<string, PanelInstance>;
}

function pc(type: string): PanelInstance {
  return { type, config: {} };
}

export const DEFAULT_LAYOUTS: LayoutPreset[] = [
  {
    id: 'overview',
    name: 'Overview',
    layout: {
      direction: 'row',
      first: 'overview',
      second: {
        direction: 'column',
        first: 'fleet-status',
        second: 'compute-monitor',
        splitPercentage: 50,
      },
      splitPercentage: 55,
    },
    panelConfigs: {
      overview: pc('overview'),
      'fleet-status': pc('fleet-status'),
      'compute-monitor': pc('compute-monitor'),
    },
  },
  {
    id: '3d-monitoring',
    name: '3D Monitoring',
    layout: {
      direction: 'row',
      first: {
        direction: 'column',
        first: 'displays',
        second: 'topics',
        splitPercentage: 60,
      },
      second: {
        direction: 'row',
        first: 'viewport3d',
        second: 'properties',
        splitPercentage: 80,
      },
      splitPercentage: 18,
    },
    panelConfigs: {
      viewport3d: pc('viewport3d'),
      displays: pc('displays'),
      topics: pc('topics'),
      properties: pc('properties'),
    },
  },
  {
    id: 'robot-builder',
    name: 'Robot Builder',
    layout: {
      direction: 'row',
      first: 'robot-list',
      second: 'robot-config',
      splitPercentage: 30,
    },
    panelConfigs: {
      'robot-list': pc('robot-list'),
      'robot-config': pc('robot-config'),
    },
  },
  {
    id: 'robot-ops',
    name: 'Robot Operations',
    layout: {
      direction: 'row',
      first: {
        direction: 'column',
        first: 'robot-isaac',
        second: 'robot-real',
        splitPercentage: 50,
      },
      second: 'viewport3d-ops',
      splitPercentage: 50,
    },
    panelConfigs: {
      'robot-isaac': pc('robot-isaac'),
      'robot-real': pc('robot-real'),
      'viewport3d-ops': pc('viewport3d'),
    },
  },
  {
    id: 'pipeline-builder',
    name: 'Pipeline Builder',
    layout: 'pipeline-builder',
    panelConfigs: {
      'pipeline-builder': pc('pipeline-builder'),
    },
  },
  {
    id: 'debug',
    name: 'Debug',
    layout: {
      direction: 'row',
      first: {
        direction: 'column',
        first: 'topics-debug',
        second: 'rqtGraph-debug',
        splitPercentage: 40,
      },
      second: {
        direction: 'column',
        first: 'actionGraph-debug',
        second: 'agent-monitor-debug',
        splitPercentage: 50,
      },
      splitPercentage: 50,
    },
    panelConfigs: {
      'topics-debug': pc('topics'),
      'rqtGraph-debug': pc('rqtGraph'),
      'actionGraph-debug': pc('actionGraph'),
      'agent-monitor-debug': pc('agent-monitor'),
    },
  },
];

export function toSavedLayouts(): SavedLayout[] {
  return DEFAULT_LAYOUTS.map((l) => ({
    id: l.id,
    name: l.name,
    layout: l.layout,
    panelConfigs: l.panelConfigs,
    createdAt: new Date().toISOString(),
  }));
}
