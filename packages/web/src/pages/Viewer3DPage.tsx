import Toolbar from '@/components/Toolbar';
import Layout from '@/components/Layout';
import StatusBar from '@/components/StatusBar';

export default function Viewer3DPage() {
  return (
    <div className="h-full flex flex-col">
      <Toolbar />
      <div className="flex-1 min-h-0">
        <Layout />
      </div>
      <StatusBar />
    </div>
  );
}
