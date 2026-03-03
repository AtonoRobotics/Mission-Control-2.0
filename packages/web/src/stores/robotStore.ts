import { create } from 'zustand';
import api from '@/services/api';

export interface RobotAsset {
  robot_id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  dof: number | null;
  payload_kg: number | null;
  reach_mm: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface JointSpec {
  joint_name: string;
  joint_type: string | null;
  parent_link: string | null;
  child_link: string | null;
  axis: string | null;
  lower_limit: number | null;
  upper_limit: number | null;
  effort_limit: number | null;
  velocity_limit: number | null;
  damping: number | null;
  friction: number | null;
}

export interface LinkSpec {
  link_name: string;
  mass: number | null;
  inertia_ixx: number | null;
  inertia_iyy: number | null;
  inertia_izz: number | null;
  visual_mesh: string | null;
  collision_mesh: string | null;
}

export interface SensorSpec {
  sensor_id: string;
  sensor_type: string | null;
  model: string | null;
  mount_link: string | null;
  mount_offset_xyz: string | null;
  mount_offset_rpy: string | null;
}

export interface CollisionSphere {
  link_name: string;
  sphere_index: number;
  center_x: number | null;
  center_y: number | null;
  center_z: number | null;
  radius: number | null;
}

export interface RobotFile {
  file_id: string;
  file_type: string;
  file_path: string;
  status: string;
  version: string;
  created_at: string;
}

interface RobotState {
  robots: RobotAsset[];
  selectedRobotId: string | null;
  loading: boolean;
  error: string | null;

  // Empirical specs for selected robot
  joints: JointSpec[];
  links: LinkSpec[];
  sensors: SensorSpec[];
  spheres: CollisionSphere[];
  specsLoading: boolean;

  // Config files for selected robot
  robotFiles: RobotFile[];
  robotFilesLoading: boolean;

  // Version history for currently viewed file
  fileHistory: RobotFile[];
  fileHistoryLoading: boolean;

  fetchRobots: () => Promise<void>;
  selectRobot: (robotId: string | null) => void;
  fetchSpecs: (robotId: string) => Promise<void>;
  fetchRobotFiles: (robotId: string) => Promise<void>;
  fetchFileHistory: (fileId: string) => Promise<void>;
  restoreFileVersion: (fileId: string) => Promise<RobotFile | null>;
}

export const useRobotStore = create<RobotState>((set, get) => ({
  robots: [],
  selectedRobotId: null,
  loading: false,
  error: null,
  joints: [],
  links: [],
  sensors: [],
  spheres: [],
  specsLoading: false,
  robotFiles: [],
  robotFilesLoading: false,
  fileHistory: [],
  fileHistoryLoading: false,

  fetchRobots: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get('/registry/robots');
      set({ robots: Array.isArray(data) ? data : [], loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load robots', loading: false });
    }
  },

  selectRobot: (robotId) => {
    set({
      selectedRobotId: robotId,
      joints: [], links: [], sensors: [], spheres: [],
      robotFiles: [],
      robotFilesLoading: !!robotId,
    });
    if (robotId) {
      get().fetchSpecs(robotId);
      get().fetchRobotFiles(robotId);
    }
  },

  fetchSpecs: async (robotId) => {
    set({ specsLoading: true });
    try {
      const [jointsRes, linksRes, sensorsRes, spheresRes] = await Promise.allSettled([
        api.get(`/empirical/robots/${robotId}/joints`),
        api.get(`/empirical/robots/${robotId}/links`),
        api.get(`/empirical/robots/${robotId}/sensors`),
        api.get(`/empirical/robots/${robotId}/spheres`),
      ]);

      const extract = (r: PromiseSettledResult<{ data: unknown }>) =>
        r.status === 'fulfilled' ? r.value.data : [];

      set({
        joints: extract(jointsRes) as JointSpec[],
        links: extract(linksRes) as LinkSpec[],
        sensors: extract(sensorsRes) as SensorSpec[],
        spheres: extract(spheresRes) as CollisionSphere[],
        specsLoading: false,
      });
    } catch {
      set({ specsLoading: false });
    }
  },

  fetchRobotFiles: async (robotId) => {
    set({ robotFilesLoading: true });
    try {
      const { data } = await api.get(`/registry/robots/${robotId}/files`);
      set({ robotFiles: Array.isArray(data) ? data : [], robotFilesLoading: false });
    } catch {
      set({ robotFiles: [], robotFilesLoading: false });
    }
  },

  fetchFileHistory: async (fileId) => {
    set({ fileHistoryLoading: true });
    try {
      const { data } = await api.get(`/registry/files/${fileId}/history`);
      set({ fileHistory: Array.isArray(data) ? data : [], fileHistoryLoading: false });
    } catch {
      set({ fileHistory: [], fileHistoryLoading: false });
    }
  },

  restoreFileVersion: async (fileId) => {
    try {
      const { data } = await api.post(`/registry/files/${fileId}/restore`);
      return data;
    } catch {
      return null;
    }
  },
}));
