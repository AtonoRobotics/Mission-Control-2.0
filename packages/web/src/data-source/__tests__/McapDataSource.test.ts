import { describe, test, expect, vi, beforeEach } from 'vitest';
import { McapDataSource } from '../McapDataSource';

// Mock @mcap/core McapIndexedReader
const mockMessages = [
  {
    channelId: 1,
    logTime: BigInt(1000000000), // 1ms in ns
    publishTime: BigInt(1000000000),
    data: new TextEncoder().encode(JSON.stringify({ linear: { x: 1 } })),
  },
  {
    channelId: 1,
    logTime: BigInt(2000000000), // 2ms in ns
    publishTime: BigInt(2000000000),
    data: new TextEncoder().encode(JSON.stringify({ linear: { x: 2 } })),
  },
];

const mockReader = {
  channelsById: new Map([
    [1, { id: 1, schemaId: 1, topic: '/cmd_vel', messageEncoding: 'json', metadata: new Map() }],
    [2, { id: 2, schemaId: 2, topic: '/scan', messageEncoding: 'json', metadata: new Map() }],
  ]),
  schemasById: new Map([
    [1, { id: 1, name: 'geometry_msgs/msg/Twist', encoding: 'json', data: new Uint8Array() }],
    [2, { id: 2, name: 'sensor_msgs/msg/LaserScan', encoding: 'json', data: new Uint8Array() }],
  ]),
  statistics: {
    messageStartTime: BigInt(0),
    messageEndTime: BigInt(5000000000), // 5ms
    messageCount: 2n,
    channelCount: 2,
    schemaCount: 2,
    chunkCount: 1,
    channelMessageCounts: new Map(),
    attachmentCount: 0,
    metadataCount: 0,
  },
  readMessages: vi.fn(async function* (opts?: any) {
    for (const msg of mockMessages) {
      if (opts?.topics && !opts.topics.includes(
        mockReader.channelsById.get(msg.channelId)!.topic,
      )) continue;
      if (opts?.startTime !== undefined && msg.logTime < opts.startTime) continue;
      if (opts?.endTime !== undefined && msg.logTime > opts.endTime) continue;
      yield msg;
    }
  }),
};

vi.mock('@mcap/core', () => ({
  McapIndexedReader: {
    Initialize: vi.fn(async () => mockReader),
  },
}));

function createMockFile(): File {
  return new File([new Uint8Array(100)], 'test.mcap', { type: 'application/octet-stream' });
}

describe('McapDataSource', () => {
  let ds: McapDataSource;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset readMessages mock to default
    mockReader.readMessages.mockImplementation(async function* (opts?: any) {
      for (const msg of mockMessages) {
        if (opts?.topics && !opts.topics.includes(
          mockReader.channelsById.get(msg.channelId)!.topic,
        )) continue;
        if (opts?.startTime !== undefined && msg.logTime < opts.startTime) continue;
        if (opts?.endTime !== undefined && msg.logTime > opts.endTime) continue;
        yield msg;
      }
    });
    ds = new McapDataSource(createMockFile());
  });

  test('type is mcap', () => {
    expect(ds.type).toBe('mcap');
  });

  test('starts disconnected', () => {
    expect(ds.status).toBe('disconnected');
  });

  test('connect reads MCAP index and populates topics', async () => {
    await ds.connect();
    expect(ds.status).toBe('connected');

    const topics = ds.getTopics();
    expect(topics).toHaveLength(2);
    expect(topics.map((t) => t.name)).toContain('/cmd_vel');
    expect(topics.map((t) => t.name)).toContain('/scan');
    expect(topics[0].schemaName).toContain('Twist');
  });

  test('connect fires status and topic listeners', async () => {
    const statusCb = vi.fn();
    const topicCb = vi.fn();
    ds.onStatusChange(statusCb);
    ds.onTopicsChange(topicCb);

    await ds.connect();

    expect(statusCb).toHaveBeenCalledWith('connecting');
    expect(statusCb).toHaveBeenCalledWith('connected');
    expect(topicCb).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ name: '/cmd_vel' }),
    ]));
  });

  test('disconnect resets state', async () => {
    await ds.connect();
    await ds.disconnect();

    expect(ds.status).toBe('disconnected');
    expect(ds.getTopics()).toHaveLength(0);
  });

  test('subscribe and receive messages', async () => {
    await ds.connect();

    const messages: any[] = [];
    const sub = ds.subscribe('/cmd_vel', (event) => {
      messages.push(event);
    });

    expect(sub.topic).toBe('/cmd_vel');

    // Manually trigger a seek to deliver latched messages
    const controls = ds.getPlaybackControls();
    await controls.seek(3000); // seek to 3000ms (past both messages at 1000ms and 2000ms)

    expect(messages.length).toBeGreaterThan(0);
    expect(messages[messages.length - 1].schemaName).toContain('Twist');
  });

  test('unsubscribe stops delivery', async () => {
    await ds.connect();

    const messages: any[] = [];
    const sub = ds.subscribe('/cmd_vel', (event) => {
      messages.push(event);
    });
    sub.unsubscribe();

    const controls = ds.getPlaybackControls();
    await controls.seek(3000);

    expect(messages).toHaveLength(0);
  });

  test('getPlaybackControls returns controls with state', async () => {
    await ds.connect();

    const controls = ds.getPlaybackControls();
    expect(controls).toBeDefined();
    expect(controls.state.startTime).toBe(0);
    expect(controls.state.endTime).toBe(5000); // 5000000000 ns = 5000ms
    expect(controls.state.isPlaying).toBe(false);
    expect(controls.state.speed).toBe(1.0);
  });

  test('setSpeed and setLoop update state', async () => {
    await ds.connect();
    const controls = ds.getPlaybackControls();

    controls.setSpeed(2.0);
    expect(ds.getPlaybackControls().state.speed).toBe(2.0);

    controls.setLoop(true);
    expect(ds.getPlaybackControls().state.loop).toBe(true);
  });

  test('play and pause toggle playback', async () => {
    await ds.connect();
    const controls = ds.getPlaybackControls();

    controls.play();
    expect(ds.getPlaybackControls().state.isPlaying).toBe(true);

    controls.pause();
    expect(ds.getPlaybackControls().state.isPlaying).toBe(false);
  });

  test('JSON messages are decoded', async () => {
    await ds.connect();

    const messages: any[] = [];
    ds.subscribe('/cmd_vel', (event) => {
      messages.push(event);
    });

    const controls = ds.getPlaybackControls();
    await controls.seek(3000);

    // The last latched message should have decoded JSON
    const last = messages[messages.length - 1];
    expect(last.message).toEqual(expect.objectContaining({ linear: expect.any(Object) }));
  });
});
