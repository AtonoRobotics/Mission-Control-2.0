import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { registerPanel } from '@/panels/panelRegistry';
import Viewport3D from '@/panels/Viewport3D/Viewport3D';
import DisplaySidebar from '@/panels/DisplaySidebar';
import TopicBrowser from '@/panels/TopicBrowser';
import PropertyEditor from '@/panels/PropertyEditor';
import RQTGraphPanel from '@/panels/RQTGraph/RQTGraphPanel';
import ActionGraphPanel from '@/panels/ActionGraph/ActionGraphPanel';
import { initDisplays } from '@/displays/init';
import { TFTreeManager } from '@/ros/tfTree';
import LoginPage from '@/pages/LoginPage';
import TopBar from '@/components/TopBar';
import Layout from '@/components/Layout';
import TimelineBar from '@/components/TimelineBar';
import { DataSourceProvider } from '@/data-source/DataSourceProvider';

// Pages → registered as panels
import OverviewPage from '@/pages/OverviewPage';
import FleetPage from '@/pages/FleetPage';
import AgentsPage from '@/pages/AgentsPage';
import InfraPage from '@/pages/InfraPage';
import RegistryPage from '@/pages/RegistryPage';
import PipelinesPage from '@/pages/PipelinesPage';
import OSMOPage from '@/pages/OSMOPage';
import RobotListPanel from '@/panels/robots/RobotListPanel';
import RobotConfigPanel from '@/panels/robots/RobotConfigPanel';
import RobotIsaacPanel from '@/panels/robots/RobotIsaacPanel';
import RobotRealPanel from '@/panels/robots/RobotRealPanel';
import RawMessagesPanel from '@/panels/RawMessages/RawMessagesPanel';
import PlotPanel from '@/panels/Plot/PlotPanel';
import LogViewerPanel from '@/panels/LogViewer/LogViewerPanel';
import DiagnosticsPanel from '@/panels/Diagnostics/DiagnosticsPanel';
import TablePanel from '@/panels/Table/TablePanel';
import StateTransitionsPanel from '@/panels/StateTransitions/StateTransitionsPanel';
import GaugePanel from '@/panels/Gauge/GaugePanel';
import IndicatorPanel from '@/panels/Indicator/IndicatorPanel';
import PublishPanel from '@/panels/Publish/PublishPanel';
import ServiceCallPanel from '@/panels/ServiceCall/ServiceCallPanel';
import ParametersPanel from '@/panels/Parameters/ParametersPanel';
import TeleopPanel from '@/panels/Teleop/TeleopPanel';
import ImagePanel from '@/panels/Image/ImagePanel';
import MapPanel from '@/panels/Map/MapPanel';
import UserScriptPanel from '@/panels/UserScript/UserScriptPanel';
import VariableSliderPanel from '@/panels/VariableSlider/VariableSliderPanel';
import MarkdownPanel from '@/panels/Markdown/MarkdownPanel';
import DataSourceInfoPanel from '@/panels/DataSourceInfo/DataSourceInfoPanel';
import ActionMonitorPanel from '@/panels/ActionMonitor/ActionMonitorPanel';
import LatencyMonitorPanel from '@/panels/LatencyMonitor/LatencyMonitorPanel';
import FrequencyMonitorPanel from '@/panels/FrequencyMonitor/FrequencyMonitorPanel';
import BagRecorderPanel from '@/panels/BagRecorder/BagRecorderPanel';
import McapBrowserPanel from '@/panels/McapBrowser/McapBrowserPanel';
import CloudSettingsPanel from '@/panels/CloudSettings/CloudSettingsPanel';
import TeamSettingsPanel from '@/panels/TeamSettings/TeamSettingsPanel';
import ProfileSettingsPanel from '@/panels/ProfileSettings/ProfileSettingsPanel';
import NotificationCenterPanel from '@/panels/NotificationCenter/NotificationCenterPanel';

// Register all panels
registerPanel({ id: 'viewport3d', title: '3D Viewport', category: '3d-spatial', component: Viewport3D, platforms: ['web', 'desktop'] });
registerPanel({ id: 'displays', title: 'Displays', category: '3d-spatial', component: DisplaySidebar, platforms: ['web', 'desktop'] });
registerPanel({ id: 'topics', title: 'Topics', category: 'ros2-inspect', component: TopicBrowser, platforms: ['web', 'desktop'] });
registerPanel({ id: 'properties', title: 'Properties', category: 'utility', component: PropertyEditor, platforms: ['web', 'desktop'] });
registerPanel({ id: 'rqtGraph', title: 'ROS Graph', category: 'ros2-inspect', component: RQTGraphPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'actionGraph', title: 'Action Graph', category: 'ros2-inspect', component: ActionGraphPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'overview', title: 'Overview', category: 'infrastructure', component: OverviewPage, platforms: ['web', 'desktop', 'ios'] });
registerPanel({ id: 'fleet-status', title: 'Fleet Status', category: 'infrastructure', component: FleetPage, platforms: ['web', 'desktop'] });
registerPanel({ id: 'agent-monitor', title: 'Agent Monitor', category: 'infrastructure', component: AgentsPage, platforms: ['web', 'desktop'] });
registerPanel({ id: 'compute-monitor', title: 'Compute Monitor', category: 'infrastructure', component: InfraPage, platforms: ['web', 'desktop'] });
registerPanel({ id: 'registry-browser', title: 'Registry Browser', category: 'project', component: RegistryPage, platforms: ['web', 'desktop'] });
registerPanel({ id: 'pipeline-builder', title: 'Pipeline Builder', category: 'project', component: PipelinesPage, platforms: ['web', 'desktop'] });
registerPanel({ id: 'osmo-workflows', title: 'OSMO Workflows', category: 'project', component: OSMOPage, platforms: ['web', 'desktop'] });
registerPanel({ id: 'robot-list', title: 'Robot List', category: 'ros2-control', component: RobotListPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'robot-config', title: 'Robot Config', category: 'ros2-control', component: RobotConfigPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'robot-isaac', title: 'Isaac Pipeline', category: 'isaac', component: RobotIsaacPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'robot-real', title: 'Real Robot', category: 'ros2-control', component: RobotRealPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'raw-messages', title: 'Raw Messages', category: 'data', component: RawMessagesPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'plot', title: 'Plot', category: 'data', component: PlotPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'log-viewer', title: 'Log Viewer', category: 'ros2-inspect', component: LogViewerPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'diagnostics', title: 'Diagnostics', category: 'diagnostics', component: DiagnosticsPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'table', title: 'Table', category: 'data', component: TablePanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'state-transitions', title: 'State Transitions', category: 'data', component: StateTransitionsPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'gauge', title: 'Gauge', category: 'data', component: GaugePanel, platforms: ['web', 'desktop', 'ios'] });
registerPanel({ id: 'indicator', title: 'Indicator', category: 'data', component: IndicatorPanel, platforms: ['web', 'desktop', 'ios'] });
registerPanel({ id: 'publish', title: 'Publish', category: 'ros2-control', component: PublishPanel, platforms: ['web', 'desktop'], requiresLiveData: true });
registerPanel({ id: 'service-call', title: 'Service Call', category: 'ros2-control', component: ServiceCallPanel, platforms: ['web', 'desktop'], requiresLiveData: true });
registerPanel({ id: 'parameters', title: 'Parameters', category: 'ros2-inspect', component: ParametersPanel, platforms: ['web', 'desktop'], requiresLiveData: true });
registerPanel({ id: 'teleop', title: 'Teleop', category: 'ros2-control', component: TeleopPanel, platforms: ['web', 'desktop', 'ios'], requiresLiveData: true });
registerPanel({ id: 'image', title: 'Image', category: 'sensors', component: ImagePanel, platforms: ['web', 'desktop', 'ios'] });
registerPanel({ id: 'map', title: 'Map', category: 'sensors', component: MapPanel, platforms: ['web', 'desktop', 'ios'] });
registerPanel({ id: 'user-script', title: 'User Script', category: 'utility', component: UserScriptPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'variable-slider', title: 'Variable Slider', category: 'utility', component: VariableSliderPanel, platforms: ['web', 'desktop', 'ios'] });
registerPanel({ id: 'markdown', title: 'Markdown', category: 'utility', component: MarkdownPanel, platforms: ['web', 'desktop', 'ios'] });
registerPanel({ id: 'data-source-info', title: 'Data Source Info', category: 'utility', component: DataSourceInfoPanel, platforms: ['web', 'desktop', 'ios'] });
registerPanel({ id: 'action-monitor', title: 'Action Monitor', category: 'ros2-inspect', component: ActionMonitorPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'latency-monitor', title: 'Latency Monitor', category: 'diagnostics', component: LatencyMonitorPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'frequency-monitor', title: 'Frequency Monitor', category: 'diagnostics', component: FrequencyMonitorPanel, platforms: ['web', 'desktop', 'ios'] });
registerPanel({ id: 'bag-recorder', title: 'Bag Recorder', category: 'recording', component: BagRecorderPanel, platforms: ['web', 'desktop'], requiresLiveData: true });
registerPanel({ id: 'mcap-browser', title: 'MCAP Browser', category: 'recording', component: McapBrowserPanel, platforms: ['web', 'desktop', 'ios'] });
registerPanel({ id: 'cloud-settings', title: 'Cloud Settings', category: 'infrastructure', component: CloudSettingsPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'team-settings', title: 'Team Settings', category: 'infrastructure', component: TeamSettingsPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'profile-settings', title: 'Profile', category: 'infrastructure', component: ProfileSettingsPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'notifications', title: 'Notifications', category: 'infrastructure', component: NotificationCenterPanel, platforms: ['web', 'desktop', 'ios'] });

// Register all display types
initDisplays();

const tfManager = new TFTreeManager();

export default function App() {
  const { isAuthenticated, fetchMe } = useAuthStore();

  // Handle OAuth callback query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      useAuthStore.getState().handleOAuthCallback(accessToken, refreshToken);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Verify existing token on mount
  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // TF tree lifecycle (runs alongside DataSourceProvider)
  useEffect(() => {
    if (!isAuthenticated) return;
    tfManager.start();
    return () => tfManager.stop();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <DataSourceProvider>
      <div className="h-screen w-screen flex flex-col viewport-bg">
        <TopBar />
        <div className="flex-1 min-w-0 min-h-0">
          <Layout />
        </div>
        <TimelineBar />
      </div>
    </DataSourceProvider>
  );
}
