import { Ros, Topic } from 'roslib';

export type RosConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

type StatusListener = (status: RosConnectionStatus) => void;

let ros: Ros | null = null;
let currentStatus: RosConnectionStatus = 'disconnected';
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 3000;
const MAX_RECONNECT_DELAY = 30000;
const listeners = new Set<StatusListener>();

function getUrl(): string {
  const port = import.meta.env.VITE_ROSBRIDGE_PORT || '9090';
  return `ws://${window.location.hostname}:${port}`;
}

function setStatus(status: RosConnectionStatus) {
  currentStatus = status;
  listeners.forEach((fn) => fn(status));
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY);
}

export function connect(): Ros {
  if (ros) {
    ros.close();
  }

  setStatus('connecting');
  ros = new Ros({ url: getUrl() });

  ros.on('connection', () => {
    reconnectDelay = 3000;
    setStatus('connected');
  });

  ros.on('error', () => {
    setStatus('error');
  });

  ros.on('close', () => {
    setStatus('disconnected');
    scheduleReconnect();
  });

  return ros;
}

export function getRos(): Ros {
  if (!ros) {
    return connect();
  }
  return ros;
}

export function getStatus(): RosConnectionStatus {
  return currentStatus;
}

export function onStatusChange(fn: StatusListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ros) {
    ros.close();
    ros = null;
  }
  setStatus('disconnected');
}

export function subscribeTopic<T>(
  topicName: string,
  messageType: string,
  callback: (msg: T) => void,
  throttleRate = 0,
): Topic<any> {
  const topic = new Topic({
    ros: getRos(),
    name: topicName,
    messageType,
    throttle_rate: throttleRate,
  });
  topic.subscribe(callback as (msg: any) => void);
  return topic;
}
