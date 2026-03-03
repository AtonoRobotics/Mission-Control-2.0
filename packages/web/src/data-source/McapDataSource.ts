/**
 * McapDataSource — Reads MCAP files and provides playback controls.
 * Uses McapIndexedReader for random-access message reading.
 */

import { McapIndexedReader } from '@mcap/core';
import type { TypedMcapRecords } from '@mcap/core';
import type {
  DataSource,
  TopicInfo,
  MessageEvent,
  MessageCallback,
  Subscription,
  ConnectionStatus,
  PlaybackControls,
  PlaybackState,
} from './types';

// Browser-compatible IReadable for File/Blob
class BlobReadable {
  constructor(private blob: Blob) {}
  async size(): Promise<bigint> {
    return BigInt(this.blob.size);
  }
  async read(offset: bigint, size: bigint): Promise<Uint8Array> {
    const slice = this.blob.slice(Number(offset), Number(offset + size));
    const buffer = await slice.arrayBuffer();
    return new Uint8Array(buffer);
  }
}

// HTTP Range-based IReadable for S3/presigned URLs
class HttpReadable {
  private _size: bigint | null = null;
  constructor(private url: string) {}

  async size(): Promise<bigint> {
    if (this._size !== null) return this._size;
    const resp = await fetch(this.url, { method: 'HEAD' });
    if (!resp.ok) throw new Error(`HEAD failed: ${resp.status}`);
    const len = resp.headers.get('content-length');
    this._size = len ? BigInt(len) : 0n;
    return this._size;
  }

  async read(offset: bigint, size: bigint): Promise<Uint8Array> {
    const start = Number(offset);
    const end = start + Number(size) - 1;
    const resp = await fetch(this.url, {
      headers: { Range: `bytes=${start}-${end}` },
    });
    if (!resp.ok && resp.status !== 206) {
      throw new Error(`Range request failed: ${resp.status}`);
    }
    const buffer = await resp.arrayBuffer();
    return new Uint8Array(buffer);
  }
}

interface SubscriptionEntry {
  topic: string;
  callback: MessageCallback;
}

export class McapDataSource implements DataSource {
  readonly type = 'mcap' as const;

  private reader: McapIndexedReader | null = null;
  private source: File | string; // File for local, URL string for S3
  private topics: TopicInfo[] = [];
  private channelsByTopic = new Map<string, TypedMcapRecords['Channel']>();
  private schemasByChannel = new Map<number, TypedMcapRecords['Schema']>();
  private subscriptions = new Map<number, SubscriptionEntry>();
  private nextSubId = 1;
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private topicListeners = new Set<(t: TopicInfo[]) => void>();
  private _status: ConnectionStatus = 'disconnected';

  // Playback state
  private playbackState: PlaybackState = {
    isPlaying: false,
    currentTime: 0,
    startTime: 0,
    endTime: 0,
    speed: 1.0,
    loop: false,
  };
  private playTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly TICK_MS = 50; // playback resolution

  // Message cache: topic → messages sorted by logTime
  private messagesByTopic = new Map<string, TypedMcapRecords['Message'][]>();

  constructor(source: File | string) {
    this.source = source;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  private setStatus(status: ConnectionStatus) {
    this._status = status;
    this.statusListeners.forEach((fn) => fn(status));
  }

  async connect(): Promise<void> {
    this.setStatus('connecting');
    try {
      const readable =
        typeof this.source === 'string'
          ? new HttpReadable(this.source)
          : new BlobReadable(this.source);
      this.reader = await McapIndexedReader.Initialize({ readable });
      this.buildIndex();
      this.setStatus('connected');
      this.topicListeners.forEach((fn) => fn(this.topics));
    } catch (e) {
      this.setStatus('error');
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    this.stopPlayback();
    this.reader = null;
    this.topics = [];
    this.channelsByTopic.clear();
    this.schemasByChannel.clear();
    this.messagesByTopic.clear();
    this.subscriptions.clear();
    this.setStatus('disconnected');
  }

  private buildIndex(): void {
    if (!this.reader) return;

    // Index schemas
    for (const [id, schema] of this.reader.schemasById) {
      this.schemasByChannel.set(id, schema);
    }

    // Index channels → topics
    for (const [, channel] of this.reader.channelsById) {
      const schema = this.schemasByChannel.get(channel.schemaId);
      this.channelsByTopic.set(channel.topic, channel);
      this.topics.push({
        name: channel.topic,
        schemaName: schema?.name ?? 'unknown',
      });
    }

    // Set playback time range from statistics
    const stats = this.reader.statistics;
    if (stats) {
      const startNs = stats.messageStartTime;
      const endNs = stats.messageEndTime;
      this.playbackState = {
        ...this.playbackState,
        startTime: Number(startNs) / 1e6, // ns → ms
        endTime: Number(endNs) / 1e6,
        currentTime: Number(startNs) / 1e6,
      };
    }
  }

  getTopics(): TopicInfo[] {
    return [...this.topics];
  }

  subscribe(topic: string, callback: MessageCallback): Subscription {
    const id = this.nextSubId++;
    this.subscriptions.set(id, { topic, callback });

    return {
      topic,
      unsubscribe: () => {
        this.subscriptions.delete(id);
      },
    };
  }

  getPlaybackControls(): PlaybackControls {
    return {
      play: () => this.startPlayback(),
      pause: () => this.stopPlayback(),
      seek: (timeMs) => this.seek(timeMs),
      setSpeed: (speed) => {
        this.playbackState = { ...this.playbackState, speed };
      },
      setLoop: (loop) => {
        this.playbackState = { ...this.playbackState, loop };
      },
      state: this.playbackState,
    };
  }

  onStatusChange(callback: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  onTopicsChange(callback: (topics: TopicInfo[]) => void): () => void {
    this.topicListeners.add(callback);
    return () => this.topicListeners.delete(callback);
  }

  // ── Playback ───────────────────────────────────────────────────────────────

  private startPlayback(): void {
    if (this.playbackState.isPlaying) return;
    this.playbackState = { ...this.playbackState, isPlaying: true };
    this.scheduleTick();
  }

  private stopPlayback(): void {
    this.playbackState = { ...this.playbackState, isPlaying: false };
    if (this.playTimer) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
  }

  private scheduleTick(): void {
    if (!this.playbackState.isPlaying) return;
    this.playTimer = setTimeout(() => this.tick(), this.TICK_MS);
  }

  private async tick(): Promise<void> {
    if (!this.playbackState.isPlaying || !this.reader) return;

    const advanceMs = this.TICK_MS * this.playbackState.speed;
    const nextTime = this.playbackState.currentTime + advanceMs;

    if (nextTime >= this.playbackState.endTime) {
      if (this.playbackState.loop) {
        this.playbackState = {
          ...this.playbackState,
          currentTime: this.playbackState.startTime,
        };
      } else {
        this.stopPlayback();
        return;
      }
    } else {
      this.playbackState = { ...this.playbackState, currentTime: nextTime };
    }

    // Deliver messages in the time window
    await this.deliverMessages(
      this.playbackState.currentTime - advanceMs,
      this.playbackState.currentTime,
    );

    this.scheduleTick();
  }

  private async seek(timeMs: number): Promise<void> {
    const clamped = Math.max(
      this.playbackState.startTime,
      Math.min(timeMs, this.playbackState.endTime),
    );
    this.playbackState = { ...this.playbackState, currentTime: clamped };

    // Deliver the last message per subscribed topic at this time (latching)
    await this.deliverLatchedMessages(clamped);
  }

  private async deliverMessages(fromMs: number, toMs: number): Promise<void> {
    if (!this.reader) return;

    const startTime = BigInt(Math.round(fromMs * 1e6)); // ms → ns
    const endTime = BigInt(Math.round(toMs * 1e6));

    // Collect subscribed topics
    const subscribedTopics = new Set<string>();
    this.subscriptions.forEach((sub) => subscribedTopics.add(sub.topic));
    if (subscribedTopics.size === 0) return;

    for await (const msg of this.reader.readMessages({
      startTime,
      endTime,
      topics: [...subscribedTopics],
    })) {
      const channel = this.reader.channelsById.get(msg.channelId);
      if (!channel) continue;
      const schema = this.reader.schemasById.get(channel.schemaId);

      const event: MessageEvent = {
        topic: channel.topic,
        message: this.decodeMessage(msg.data, schema),
        timestamp: Number(msg.logTime) / 1e6,
        receiveTime: Number(msg.publishTime) / 1e6,
        schemaName: schema?.name ?? 'unknown',
      };

      this.subscriptions.forEach((sub) => {
        if (sub.topic === channel.topic) {
          sub.callback(event);
        }
      });
    }
  }

  private async deliverLatchedMessages(timeMs: number): Promise<void> {
    if (!this.reader) return;

    const endTime = BigInt(Math.round(timeMs * 1e6));
    const subscribedTopics = new Set<string>();
    this.subscriptions.forEach((sub) => subscribedTopics.add(sub.topic));
    if (subscribedTopics.size === 0) return;

    // Read messages up to seek point, keep only the last per topic
    const latched = new Map<string, MessageEvent>();

    for await (const msg of this.reader.readMessages({
      endTime,
      topics: [...subscribedTopics],
    })) {
      const channel = this.reader.channelsById.get(msg.channelId);
      if (!channel) continue;
      const schema = this.reader.schemasById.get(channel.schemaId);

      latched.set(channel.topic, {
        topic: channel.topic,
        message: this.decodeMessage(msg.data, schema),
        timestamp: Number(msg.logTime) / 1e6,
        receiveTime: Number(msg.publishTime) / 1e6,
        schemaName: schema?.name ?? 'unknown',
      });
    }

    // Deliver last message per topic
    latched.forEach((event) => {
      this.subscriptions.forEach((sub) => {
        if (sub.topic === event.topic) {
          sub.callback(event);
        }
      });
    });
  }

  private decodeMessage(
    data: Uint8Array,
    schema: TypedMcapRecords['Schema'] | undefined,
  ): unknown {
    // Try JSON decoding; fall back to raw bytes
    const encoding = schema?.encoding ?? '';
    if (encoding === 'json' || encoding === 'jsonschema') {
      try {
        return JSON.parse(new TextDecoder().decode(data));
      } catch {
        return data;
      }
    }
    // For protobuf/flatbuffer/cdr, return raw Uint8Array
    // Panels with schema-aware decoders handle these
    return data;
  }
}
