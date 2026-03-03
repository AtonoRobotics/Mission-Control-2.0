import { MarkerDisplay } from './MarkerDisplay';
import { MSG } from '@/ros/messageTypes';

export class MarkerArrayDisplay extends MarkerDisplay {
  override readonly type = 'MarkerArray';
  override readonly supportedMessageTypes = [MSG.MarkerArray];

  override onMessage(msg: any) {
    for (const marker of msg.markers || []) {
      super.onMessage(marker);
    }
  }
}
