/**
 * @mission-control/core — Platform-agnostic shared library
 * Re-exports types, interfaces, and utilities used by web, desktop, and iOS.
 */

// Data source abstraction
export type {
  ConnectionStatus,
  TopicInfo,
  MessageEvent,
  MessageCallback,
  Subscription,
  PlaybackState,
  PlaybackControls,
  DataSourceType,
  DataSource,
} from './data-source/types';

// ROS message type constants
export { MSG } from './ros/messageTypes';
export type { RosMessageType } from './ros/messageTypes';
