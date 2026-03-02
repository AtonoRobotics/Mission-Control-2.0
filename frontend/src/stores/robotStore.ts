import { create } from 'zustand';

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

  fetchRobots: () => Promise<void>;
  selectRobot: (robotId: string | null) => void;
  fetchSpecs: (robotId: string) => Promise<void>;
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

  fetchRobots: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/mc/api/registry/robots');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ robots: Array.isArray(data) ? data : [], loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load robots', loading: false });
    }
  },

  selectRobot: (robotId) => {
    set({ selectedRobotId: robotId, joints: [], links: [], sensors: [], spheres: [] });
    if (robotId) get().fetchSpecs(robotId);
  },

  fetchSpecs: async (robotId) => {
    set({ specsLoading: true });
    try {
      const [jointsRes, linksRes, sensorsRes, spheresRes] = await Promise.allSettled([
        fetch(`/mc/api/empirical/robots/${robotId}/joints`),
        fetch(`/mc/api/empirical/robots/${robotId}/links`),
        fetch(`/mc/api/empirical/robots/${robotId}/sensors`),
        fetch(`/mc/api/empirical/robots/${robotId}/spheres`),
      ]);

      const parse = async (r: PromiseSettledResult<Response>) => {
        if (r.status === 'fulfilled' && r.value.ok) return r.value.json();
        return [];
      };

      set({
        joints: await parse(jointsRes),
        links: await parse(linksRes),
        sensors: await parse(sensorsRes),
        spheres: await parse(spheresRes),
        specsLoading: false,
      });
    } catch {
      set({ specsLoading: false });
    }
  },
}));
