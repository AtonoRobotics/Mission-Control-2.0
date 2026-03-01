/**
 * Mission Control — Core TypeScript Types
 * ROS2 primitives, workflow types, registry types.
 * No placeholder values. All fields reflect real data structures.
 */

// =============================================================================
// ROS2 Types
// =============================================================================

export interface RosTopic {
  name: string;
  type: string;
  publishers: number;
  subscribers: number;
  hz: number | null;
}

export interface RosNode {
  name: string;
  namespace: string;
  publishers: string[];
  subscribers: string[];
  services: string[];
}

export interface RosTfFrame {
  frameId: string;
  parentId: string | null;
  translation: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  timestamp: number;
}

export interface RosJointState {
  header: { stamp: number; frameId: string };
  name: string[];
  position: number[];
  velocity: number[];
  effort: number[];
}

export interface RosParameter {
  name: string;
  value: string | number | boolean | number[];
  type: 'string' | 'int' | 'double' | 'bool' | 'array';
}

export interface RosDiagnostic {
  name: string;
  message: string;
  level: 0 | 1 | 2 | 3; // OK | WARN | ERROR | STALE
  values: { key: string; value: string }[];
  timestamp: number;
}

export interface RosBagInfo {
  path: string;
  startTime: number;
  endTime: number;
  duration: number;
  messageCount: number;
  topics: { name: string; type: string; count: number }[];
  sizeBytes: number;
}

// =============================================================================
// Container Types
// =============================================================================

export type ContainerStatus = 'running' | 'stopped' | 'error' | 'not_found';

export interface ContainerInfo {
  name: string;
  status: ContainerStatus;
  uptimeSeconds: number | null;
  cpuPercent: number | null;
  memoryMb: number | null;
  image: string;
}

// =============================================================================
// Registry Types
// =============================================================================

export type FileType =
  | 'urdf'
  | 'usd'
  | 'launch'
  | 'yaml_sensor'
  | 'yaml_curob'
  | 'yaml_scene'
  | 'yaml_world'
  | 'script_sim'
  | 'script_lab'
  | 'script_groot'
  | 'script_cosmos'
  | 'script_curob'
  | 'script_urdf'
  | 'script_calibration';

export type FileStatus = 'draft' | 'validated' | 'promoted' | 'deprecated' | 'failed';

export interface NullField {
  field: string;
  element: string;
  criticality: 'critical' | 'non-critical';
  reason: string;
}

export interface RegistryFile {
  fileId: string;
  fileType: FileType;
  robotId: number | null;
  sceneId: string | null;
  version: string;
  fileHash: string;
  filePath: string;
  buildId: string;
  nullFields: NullField[];
  status: FileStatus;
  createdAt: string;
  promotedAt: string | null;
  promotedBy: string | null;
}

// =============================================================================
// Workflow Types
// =============================================================================

export interface WorkflowNodeDef {
  nodeId: string;
  nodeType: string;
  params: Record<string, unknown>;
  position: { x: number; y: number }; // React Flow canvas position
  nextNodeIds: string[];
  conditionBranch?: {
    sourceNodeId: string;
    branchId: string;
  };
}

export interface WorkflowGraph {
  graphId: string;
  name: string;
  version: string;
  description: string;
  nodes: WorkflowNodeDef[];
  createdAt: string;
  updatedAt: string;
}

export type WorkflowRunStatus = 'running' | 'complete' | 'failed' | 'paused';
export type NodeRunStatus = 'pending' | 'running' | 'ok' | 'failed' | 'skipped';

export interface NodeRunResult {
  nodeId: string;
  status: NodeRunStatus;
  output: Record<string, unknown>;
  error: string | null;
  durationMs: number;
  timestamp: string;
}

export interface WorkflowRun {
  runId: string;
  graphId: string;
  graphName: string;
  status: WorkflowRunStatus;
  nodeResults: Record<string, NodeRunResult>;
  startedAt: string;
  completedAt: string | null;
}

// =============================================================================
// Build Process Types
// =============================================================================

export type BuildProcess =
  | 'robot_build'
  | 'scene_build'
  | 'sensor_config'
  | 'pipeline_launch'
  | 'pipeline_audit';

export type BuildStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface BuildLog {
  buildId: string;
  process: BuildProcess;
  robotId: number | null;
  status: BuildStatus;
  steps: BuildStep[];
  nullReport: NullField[];
  createdAt: string;
  completedAt: string | null;
}

export interface BuildStep {
  step: string;
  agent: string;
  status: BuildStatus;
  output: Record<string, unknown>;
  error: string | null;
  durationMs: number;
}

// =============================================================================
// Compute Types
// =============================================================================

export interface ComputeSnapshot {
  host: string;
  timestamp: string;
  gpus: GpuStat[];
  cpuPercent: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  diskUsedGb: number;
  diskTotalGb: number;
}

export interface GpuStat {
  index: number;
  name: string;
  utilizationPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  temperatureCelsius: number;
}
