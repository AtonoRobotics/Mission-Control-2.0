// ============================================================
// Node Templates — Action Graph Panel
// Defines the library of draggable node blueprints that can
// be instantiated onto the canvas.
// ============================================================

export type PortDirection = 'in' | 'out';
export type PortType = 'msg' | 'tf' | 'srv' | 'param';
export type NodeCategory = 'Publishers' | 'Subscribers' | 'Transforms' | 'Processing';
export type NodeVariant = 'publisher-node' | 'subscriber-node' | 'transform-node' | 'topic-node';

export interface PortDef {
  id: string;
  label: string;
  direction: PortDirection;
  portType: PortType;
}

export interface NodeTemplate {
  id: string;
  name: string;
  description: string;
  category: NodeCategory;
  type: NodeVariant;
  ports: PortDef[];
}

// ── Publishers ────────────────────────────────────────────────
const publishers: NodeTemplate[] = [
  {
    id: 'camera_publisher',
    name: 'Camera Publisher',
    description: 'Publishes raw image frames from a connected camera device.',
    category: 'Publishers',
    type: 'publisher-node',
    ports: [
      { id: 'image_raw', label: 'image_raw', direction: 'out', portType: 'msg' },
      { id: 'camera_info', label: 'camera_info', direction: 'out', portType: 'msg' },
    ],
  },
  {
    id: 'joint_state_publisher',
    name: 'Joint State Publisher',
    description: 'Publishes current joint positions, velocities, and efforts.',
    category: 'Publishers',
    type: 'publisher-node',
    ports: [
      { id: 'joint_states', label: 'joint_states', direction: 'out', portType: 'msg' },
    ],
  },
  {
    id: 'tf_broadcaster',
    name: 'TF Broadcaster',
    description: 'Broadcasts static or dynamic transform frames to the TF tree.',
    category: 'Publishers',
    type: 'publisher-node',
    ports: [
      { id: 'tf_out', label: '/tf', direction: 'out', portType: 'tf' },
      { id: 'tf_static_out', label: '/tf_static', direction: 'out', portType: 'tf' },
    ],
  },
  {
    id: 'cmd_vel_publisher',
    name: 'Cmd Vel Publisher',
    description: 'Publishes velocity commands for mobile base or joint control.',
    category: 'Publishers',
    type: 'publisher-node',
    ports: [
      { id: 'cmd_vel', label: 'cmd_vel', direction: 'out', portType: 'msg' },
    ],
  },
];

// ── Subscribers ───────────────────────────────────────────────
const subscribers: NodeTemplate[] = [
  {
    id: 'image_subscriber',
    name: 'Image Subscriber',
    description: 'Receives raw or compressed image messages for display or processing.',
    category: 'Subscribers',
    type: 'subscriber-node',
    ports: [
      { id: 'image_in', label: 'image', direction: 'in', portType: 'msg' },
      { id: 'camera_info_in', label: 'camera_info', direction: 'in', portType: 'msg' },
    ],
  },
  {
    id: 'pointcloud_subscriber',
    name: 'PointCloud Subscriber',
    description: 'Subscribes to PointCloud2 messages from depth sensors or lidar.',
    category: 'Subscribers',
    type: 'subscriber-node',
    ports: [
      { id: 'points_in', label: 'points', direction: 'in', portType: 'msg' },
    ],
  },
  {
    id: 'marker_subscriber',
    name: 'Marker Subscriber',
    description: 'Subscribes to Marker or MarkerArray messages for visualization.',
    category: 'Subscribers',
    type: 'subscriber-node',
    ports: [
      { id: 'markers_in', label: 'markers', direction: 'in', portType: 'msg' },
    ],
  },
];

// ── Transforms ────────────────────────────────────────────────
const transforms: NodeTemplate[] = [
  {
    id: 'tf_lookup',
    name: 'TF Lookup',
    description: 'Looks up the transform between two named frames in the TF tree.',
    category: 'Transforms',
    type: 'transform-node',
    ports: [
      { id: 'tf_in', label: '/tf', direction: 'in', portType: 'tf' },
      { id: 'frame_id_param', label: 'frame_id', direction: 'in', portType: 'param' },
      { id: 'child_frame_id_param', label: 'child_frame_id', direction: 'in', portType: 'param' },
      { id: 'transform_out', label: 'transform', direction: 'out', portType: 'tf' },
    ],
  },
  {
    id: 'frame_transform',
    name: 'Frame Transform',
    description: 'Transforms a pose or point from one coordinate frame to another.',
    category: 'Transforms',
    type: 'transform-node',
    ports: [
      { id: 'pose_in', label: 'pose_in', direction: 'in', portType: 'msg' },
      { id: 'tf_in', label: '/tf', direction: 'in', portType: 'tf' },
      { id: 'target_frame_param', label: 'target_frame', direction: 'in', portType: 'param' },
      { id: 'pose_out', label: 'pose_out', direction: 'out', portType: 'msg' },
    ],
  },
  {
    id: 'coordinate_remap',
    name: 'Coordinate Remap',
    description: 'Remaps axes (e.g. REP-103 convention fixes) between coordinate systems.',
    category: 'Transforms',
    type: 'transform-node',
    ports: [
      { id: 'input_pose', label: 'pose_in', direction: 'in', portType: 'msg' },
      { id: 'remap_config', label: 'config', direction: 'in', portType: 'param' },
      { id: 'output_pose', label: 'pose_out', direction: 'out', portType: 'msg' },
    ],
  },
];

// ── Processing ────────────────────────────────────────────────
const processing: NodeTemplate[] = [
  {
    id: 'image_proc',
    name: 'Image Proc',
    description: 'Rectifies, debayers, and resizes raw images using camera calibration.',
    category: 'Processing',
    type: 'transform-node',
    ports: [
      { id: 'image_raw_in', label: 'image_raw', direction: 'in', portType: 'msg' },
      { id: 'camera_info_in', label: 'camera_info', direction: 'in', portType: 'msg' },
      { id: 'image_rect_out', label: 'image_rect', direction: 'out', portType: 'msg' },
      { id: 'image_color_out', label: 'image_color', direction: 'out', portType: 'msg' },
    ],
  },
  {
    id: 'depth_to_pointcloud',
    name: 'Depth → PointCloud',
    description: 'Converts a depth image + camera info into a 3D PointCloud2 message.',
    category: 'Processing',
    type: 'transform-node',
    ports: [
      { id: 'depth_in', label: 'depth_image', direction: 'in', portType: 'msg' },
      { id: 'camera_info_in', label: 'camera_info', direction: 'in', portType: 'msg' },
      { id: 'points_out', label: 'points', direction: 'out', portType: 'msg' },
    ],
  },
  {
    id: 'pointcloud_filter',
    name: 'PointCloud Filter',
    description: 'Crops, voxelizes, or removes statistical outliers from a point cloud.',
    category: 'Processing',
    type: 'transform-node',
    ports: [
      { id: 'points_in', label: 'points_in', direction: 'in', portType: 'msg' },
      { id: 'filter_params', label: 'filter_params', direction: 'in', portType: 'param' },
      { id: 'points_out', label: 'points_out', direction: 'out', portType: 'msg' },
    ],
  },
  {
    id: 'imu_filter',
    name: 'IMU Filter',
    description: 'Fuses IMU data with optional magnetometer input using Madgwick filter.',
    category: 'Processing',
    type: 'transform-node',
    ports: [
      { id: 'imu_raw_in', label: 'imu_raw', direction: 'in', portType: 'msg' },
      { id: 'mag_in', label: 'mag (optional)', direction: 'in', portType: 'msg' },
      { id: 'imu_filtered_out', label: 'imu_filtered', direction: 'out', portType: 'msg' },
      { id: 'tf_out', label: '/tf', direction: 'out', portType: 'tf' },
    ],
  },
];

// ── Exported flat array ───────────────────────────────────────
export const NODE_TEMPLATES: NodeTemplate[] = [
  ...publishers,
  ...subscribers,
  ...transforms,
  ...processing,
];

// Grouped by category for sidebar rendering
export const TEMPLATE_CATEGORIES: NodeCategory[] = [
  'Publishers',
  'Subscribers',
  'Transforms',
  'Processing',
];

export function getTemplatesByCategory(category: NodeCategory): NodeTemplate[] {
  return NODE_TEMPLATES.filter((t) => t.category === category);
}

// Port type color palette (shared between nodes and handle rendering)
export const PORT_TYPE_COLORS: Record<PortType, string> = {
  msg: '#ffaa00',   // amber — message streams
  tf: '#4499ff',    // blue — transform frames
  srv: '#00cc66',   // green — service calls
  param: '#888888', // gray — parameters/config
};
