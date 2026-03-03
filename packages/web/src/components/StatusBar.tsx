import { useDisplayStore } from '@/stores/displayStore';
import { useRosBridgeStore } from '@/stores/rosBridgeStore';

export default function StatusBar() {
  const displayCount = useDisplayStore((s) => s.displays.filter((d) => d.visible).length);
  const rosStatus = useRosBridgeStore((s) => s.status);

  return (
    <div
      className="h-6 flex items-center gap-4 px-4 text-xs border-t"
      style={{
        background: 'var(--bg-surface-1)',
        borderColor: 'var(--border-default)',
        color: 'var(--text-muted)',
      }}
    >
      <span>Displays: {displayCount}</span>
      <span className="mono">ROS: {rosStatus}</span>
      <span className="ml-auto mono">MC v0.1.0</span>
    </div>
  );
}
