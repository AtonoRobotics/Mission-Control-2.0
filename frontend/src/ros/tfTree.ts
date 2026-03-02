import * as THREE from 'three';
import { Topic } from 'roslib';
import { getRos } from './connection';
import { useTFStore } from '@/stores/tfStore';
import { MSG } from './messageTypes';

export class TFTreeManager {
  private tfSub: Topic<any> | null = null;
  private tfStaticSub: Topic<any> | null = null;

  start() {
    const ros = getRos();

    this.tfSub = new Topic({
      ros,
      name: '/tf',
      messageType: MSG.TFMessage,
    });

    this.tfStaticSub = new Topic({
      ros,
      name: '/tf_static',
      messageType: MSG.TFMessage,
    });

    const handler = (msg: any) => {
      const transforms: any[] = msg.transforms || [];
      for (const t of transforms) {
        useTFStore.getState().updateFrame({
          frameId: t.child_frame_id,
          parentId: t.header.frame_id,
          translation: new THREE.Vector3(
            t.transform.translation.x,
            t.transform.translation.y,
            t.transform.translation.z,
          ),
          rotation: new THREE.Quaternion(
            t.transform.rotation.x,
            t.transform.rotation.y,
            t.transform.rotation.z,
            t.transform.rotation.w,
          ),
          timestamp: t.header.stamp.sec + t.header.stamp.nanosec * 1e-9,
        });
      }
    };

    this.tfSub.subscribe(handler);
    this.tfStaticSub.subscribe(handler);
  }

  stop() {
    this.tfSub?.unsubscribe();
    this.tfStaticSub?.unsubscribe();
  }
}
