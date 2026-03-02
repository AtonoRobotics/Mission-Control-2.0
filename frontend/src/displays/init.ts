import { registerDisplay } from './displayRegistry';
import { GridDisplay } from './GridDisplay';
import { AxesDisplay } from './AxesDisplay';
import { TFDisplay } from './TFDisplay';
import { MarkerDisplay } from './MarkerDisplay';
import { MarkerArrayDisplay } from './MarkerArrayDisplay';
import { RobotModelDisplay } from './RobotModelDisplay';
import { PointCloud2Display } from './PointCloud2Display';
import { LaserScanDisplay } from './LaserScanDisplay';
import { ImageDisplay } from './ImageDisplay';
import { PoseDisplay } from './PoseDisplay';
import { PathDisplay } from './PathDisplay';
import { OccupancyGridDisplay } from './OccupancyGridDisplay';

export function initDisplays() {
  registerDisplay('Grid', GridDisplay);
  registerDisplay('Axes', AxesDisplay);
  registerDisplay('TF', TFDisplay);
  registerDisplay('Marker', MarkerDisplay);
  registerDisplay('MarkerArray', MarkerArrayDisplay);
  registerDisplay('RobotModel', RobotModelDisplay);
  registerDisplay('PointCloud2', PointCloud2Display);
  registerDisplay('LaserScan', LaserScanDisplay);
  registerDisplay('Image', ImageDisplay);
  registerDisplay('Pose', PoseDisplay);
  registerDisplay('Path', PathDisplay);
  registerDisplay('OccupancyGrid', OccupancyGridDisplay);
}
