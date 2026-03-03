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
import { startTopicPolling, stopTopicPolling } from '@/ros/topicPoller';
import { connect, getStatus, onStatusChange } from '@/ros/connection';
import { useRosBridgeStore } from '@/stores/rosBridgeStore';
import LoginPage from '@/pages/LoginPage';
import TopBar from '@/components/TopBar';
import Layout from '@/components/Layout';

// Pages → registered as panels
import OverviewPage from '@/pages/OverviewPage';
import FleetPage from '@/pages/FleetPage';
import AgentsPage from '@/pages/AgentsPage';
import InfraPage from '@/pages/InfraPage';
import RegistryPage from '@/pages/RegistryPage';
import PipelinesPage from '@/pages/PipelinesPage';
import RobotListPanel from '@/panels/robots/RobotListPanel';
import RobotConfigPanel from '@/panels/robots/RobotConfigPanel';
import RobotIsaacPanel from '@/panels/robots/RobotIsaacPanel';
import RobotRealPanel from '@/panels/robots/RobotRealPanel';

// Register all panels
registerPanel({ id: 'viewport3d', title: '3D Viewport', category: '3d-spatial', component: Viewport3D, platforms: ['web', 'desktop'] });
registerPanel({ id: 'displays', title: 'Displays', category: '3d-spatial', component: DisplaySidebar, platforms: ['web', 'desktop'] });
registerPanel({ id: 'topics', title: 'Topics', category: 'ros2-inspect', component: TopicBrowser, platforms: ['web', 'desktop'] });
registerPanel({ id: 'properties', title: 'Properties', category: 'utility', component: PropertyEditor, platforms: ['web', 'desktop'] });
registerPanel({ id: 'rqtGraph', title: 'ROS Graph', category: 'ros2-inspect', component: RQTGraphPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'actionGraph', title: 'Action Graph', category: 'ros2-inspect', component: ActionGraphPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'overview', title: 'Overview', category: 'infrastructure', component: OverviewPage, platforms: ['web', 'desktop', 'ios'] });
registerPanel({ id: 'fleet', title: 'Fleet', category: 'infrastructure', component: FleetPage, platforms: ['web', 'desktop'] });
registerPanel({ id: 'agents', title: 'Agents', category: 'infrastructure', component: AgentsPage, platforms: ['web', 'desktop'] });
registerPanel({ id: 'infra', title: 'Infrastructure', category: 'infrastructure', component: InfraPage, platforms: ['web', 'desktop'] });
registerPanel({ id: 'registry', title: 'Registry', category: 'project', component: RegistryPage, platforms: ['web', 'desktop'] });
registerPanel({ id: 'pipelines', title: 'Pipelines', category: 'project', component: PipelinesPage, platforms: ['web', 'desktop'] });
registerPanel({ id: 'robot-list', title: 'Robot List', category: 'ros2-control', component: RobotListPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'robot-config', title: 'Robot Config', category: 'ros2-control', component: RobotConfigPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'robot-isaac', title: 'Isaac Pipeline', category: 'isaac', component: RobotIsaacPanel, platforms: ['web', 'desktop'] });
registerPanel({ id: 'robot-real', title: 'Real Robot', category: 'ros2-control', component: RobotRealPanel, platforms: ['web', 'desktop'] });

// Register all display types
initDisplays();

const tfManager = new TFTreeManager();

export default function App() {
  const setStatus = useRosBridgeStore((s) => s.setStatus);
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

  useEffect(() => {
    if (!isAuthenticated) return;

    connect();
    setStatus(getStatus());
    const unsub = onStatusChange(setStatus);
    tfManager.start();
    startTopicPolling(3000);

    return () => {
      unsub();
      tfManager.stop();
      stopTopicPolling();
    };
  }, [setStatus, isAuthenticated]);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="h-screen w-screen flex flex-col viewport-bg">
      <TopBar />
      <div className="flex-1 min-w-0 min-h-0">
        <Layout />
      </div>
    </div>
  );
}
