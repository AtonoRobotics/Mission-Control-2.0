import * as THREE from 'three';
import { Topic } from 'roslib';
import { getRos } from '@/ros/connection';
import { useDisplayStore, type DisplayConfig } from '@/stores/displayStore';
import { createDisplay } from './displayRegistry';
import type { DisplayPlugin } from './DisplayPlugin';

/**
 * Bridges Zustand display store ↔ Three.js scene ↔ ROS subscriptions.
 * Watches the store for adds/removes/visibility and manages plugin lifecycle.
 */
export class DisplayManager {
  private scene: THREE.Scene;
  private plugins = new Map<string, DisplayPlugin>();
  private subscriptions = new Map<string, Topic<any>>();
  private unsubStore: (() => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  start() {
    this.unsubStore = useDisplayStore.subscribe((state, prev) => {
      this.sync(state.displays, prev.displays);
    });
    // Initial sync
    this.sync(useDisplayStore.getState().displays, []);
  }

  stop() {
    this.unsubStore?.();
    for (const [id] of this.plugins) {
      this.removePlugin(id);
    }
    this.plugins.clear();
    this.subscriptions.clear();
  }

  /** Called each frame by SceneManager */
  update(dt: number) {
    for (const plugin of this.plugins.values()) {
      if (plugin.visible) plugin.onFrame(dt);
    }
  }

  private sync(current: DisplayConfig[], previous: DisplayConfig[]) {
    const currentIds = new Set(current.map((d) => d.id));
    const previousIds = new Set(previous.map((d) => d.id));

    // Added
    for (const config of current) {
      if (!previousIds.has(config.id)) {
        this.addPlugin(config);
      }
    }

    // Removed
    for (const prev of previous) {
      if (!currentIds.has(prev.id)) {
        this.removePlugin(prev.id);
      }
    }

    // Updated (visibility, topic, properties)
    for (const config of current) {
      const plugin = this.plugins.get(config.id);
      if (!plugin) continue;

      const prev = previous.find((p) => p.id === config.id);
      if (!prev) continue;

      if (config.visible !== prev.visible) {
        plugin.setVisible(config.visible);
      }

      if (config.topic !== prev.topic) {
        this.resubscribe(config.id, config.topic, plugin);
      }

      // Apply changed properties
      for (const [key, value] of Object.entries(config.properties)) {
        if (prev.properties[key] !== value) {
          plugin.setProperty(key, value);
        }
      }
    }
  }

  private addPlugin(config: DisplayConfig) {
    const plugin = createDisplay(config.type);
    if (!plugin) return;

    plugin.id = config.id;
    plugin.topic = config.topic;
    plugin.visible = config.visible;

    // Apply default properties from schema
    for (const prop of plugin.getPropertySchema()) {
      plugin.properties[prop.key] = config.properties[prop.key] ?? prop.default;
    }

    plugin.onAdd(this.scene);
    this.plugins.set(config.id, plugin);

    if (config.topic) {
      this.subscribe(config.id, config.topic, plugin);
    }
  }

  private removePlugin(id: string) {
    const plugin = this.plugins.get(id);
    if (plugin) {
      plugin.onRemove();
      this.plugins.delete(id);
    }
    this.unsubscribeTopic(id);
  }

  private subscribe(id: string, topicName: string, plugin: DisplayPlugin) {
    if (!topicName) return;
    const msgTypes = plugin.supportedMessageTypes;
    if (msgTypes.length === 0) return;

    const topic = new Topic({
      ros: getRos(),
      name: topicName,
      messageType: msgTypes[0],
    });

    topic.subscribe((msg: any) => {
      plugin.onMessage(msg);
    });

    this.subscriptions.set(id, topic);
  }

  private unsubscribeTopic(id: string) {
    const topic = this.subscriptions.get(id);
    if (topic) {
      topic.unsubscribe();
      this.subscriptions.delete(id);
    }
  }

  private resubscribe(id: string, newTopic: string, plugin: DisplayPlugin) {
    this.unsubscribeTopic(id);
    plugin.topic = newTopic;
    if (newTopic) {
      this.subscribe(id, newTopic, plugin);
    }
  }
}
