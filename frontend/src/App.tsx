import { useEffect } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import Sidebar from '@/components/Sidebar';
import { useNavStore } from '@/stores/navStore';
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

// Pages
import OverviewPage from '@/pages/OverviewPage';
import Viewer3DPage from '@/pages/Viewer3DPage';
import RQTGraphPage from '@/pages/RQTGraphPage';
import ActionGraphPage from '@/pages/ActionGraphPage';
import FleetPage from '@/pages/FleetPage';
import AgentsPage from '@/pages/AgentsPage';
import InfraPage from '@/pages/InfraPage';
import RegistryPage from '@/pages/RegistryPage';
import PipelinesPage from '@/pages/PipelinesPage';
import RobotsPage from '@/pages/RobotsPage';

// Register all panels (for the 3D viewer mosaic)
registerPanel({ id: 'viewport3d', title: '3D Viewport', component: Viewport3D });
registerPanel({ id: 'displays', title: 'Displays', component: DisplaySidebar });
registerPanel({ id: 'topics', title: 'Topics', component: TopicBrowser });
registerPanel({ id: 'properties', title: 'Properties', component: PropertyEditor });
registerPanel({ id: 'rqtGraph', title: 'RQT Graph', component: RQTGraphPanel });
registerPanel({ id: 'actionGraph', title: 'Action Graph', component: ActionGraphPanel });

// Register all display types
initDisplays();

const tfManager = new TFTreeManager();

const PAGE_COMPONENTS = {
  overview: OverviewPage,
  viewer3d: Viewer3DPage,
  rqtGraph: RQTGraphPage,
  actionGraph: ActionGraphPage,
  robots: RobotsPage,
  fleet: FleetPage,
  agents: AgentsPage,
  infrastructure: InfraPage,
  registry: RegistryPage,
  pipelines: PipelinesPage,
} as const;

export default function App() {
  const setStatus = useRosBridgeStore((s) => s.setStatus);
  const activePage = useNavStore((s) => s.activePage);

  useEffect(() => {
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
  }, [setStatus]);

  const PageComponent = PAGE_COMPONENTS[activePage] || OverviewPage;

  return (
    <div className="h-screen w-screen flex viewport-bg">
      <Sidebar />
      <div className="flex-1 min-w-0 min-h-0">
        <ErrorBoundary resetKey={activePage}>
          <PageComponent />
        </ErrorBoundary>
      </div>
    </div>
  );
}
