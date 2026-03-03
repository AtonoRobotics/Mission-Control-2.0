import * as THREE from 'three';
import { DisplayPlugin, type PropertyDef } from './DisplayPlugin';
import { useTFStore } from '@/stores/tfStore';
import { MSG } from '@/ros/messageTypes';

export class TFDisplay extends DisplayPlugin {
  readonly type = 'TF';
  readonly supportedMessageTypes = [MSG.TFMessage];
  private frameObjects = new Map<string, THREE.Group>();

  constructor() {
    super();
    this.properties = { axesLength: 0.3, showLabels: true };
  }

  onMessage() {}

  onFrame() {
    const frames = useTFStore.getState().frames;
    for (const [frameId, frame] of frames) {
      let group = this.frameObjects.get(frameId);
      if (!group) {
        group = new THREE.Group();
        group.add(new THREE.AxesHelper(this.properties.axesLength));
        this.root.add(group);
        this.frameObjects.set(frameId, group);
      }
      group.position.copy(frame.translation);
      group.quaternion.copy(frame.rotation);
    }
  }

  getPropertySchema(): PropertyDef[] {
    return [
      { key: 'axesLength', label: 'Axes Length', type: 'number', default: 0.3, min: 0.05, max: 2, step: 0.05 },
      { key: 'showLabels', label: 'Show Labels', type: 'boolean', default: true },
    ];
  }

  dispose() {
    this.frameObjects.clear();
    super.dispose();
  }
}
