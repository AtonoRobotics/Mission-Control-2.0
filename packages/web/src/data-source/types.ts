/**
 * Mission Control — DataSource Abstraction Types
 * Unified interface for live (rosbridge) and recorded (MCAP) data.
 * Panels subscribe through DataSource, agnostic to data origin.
 */

// ── Core Types ────────────────────────────────────────────────────────────────

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TopicInfo {
  name: string;
  schemaName: string;  // ROS message type, e.g. "sensor_msgs/msg/Image"
  publisherCount?: number;
  subscriberCount?: number;
}

export interface MessageEvent {
  topic: string;
  message: unknown;
  timestamp: number;       // epoch ms
  receiveTime: number;     // wall clock epoch ms
  schemaName: string;
}

export type MessageCallback = (event: MessageEvent) => void;

export interface Subscription {
  topic: string;
  unsubscribe: () => void;
}

// ── Playback (MCAP only) ─────────────────────────────────────────────────────

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;    // epoch ms
  startTime: number;
  endTime: number;
  speed: number;          // 1.0 = realtime
  loop: boolean;
}

export interface PlaybackControls {
  play: () => void;
  pause: () => void;
  seek: (timeMs: number) => void;
  setSpeed: (speed: number) => void;
  setLoop: (loop: boolean) => void;
  state: PlaybackState;
}

// ── DataSource Interface ─────────────────────────────────────────────────────

export type DataSourceType = 'live' | 'mcap';

export interface DataSource {
  readonly type: DataSourceType;
  readonly status: ConnectionStatus;

  // Connection lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // Topic discovery
  getTopics(): TopicInfo[];

  // Subscriptions
  subscribe(topic: string, callback: MessageCallback): Subscription;

  // Playback (only available for MCAP sources)
  getPlaybackControls(): PlaybackControls | undefined;

  // Event listeners
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void;
  onTopicsChange(callback: (topics: TopicInfo[]) => void): () => void;
}
