import { useMemo, useState } from 'react';
import { useTopicStore, type TopicInfo } from '@/stores/topicStore';
import { useDisplayStore } from '@/stores/displayStore';

export default function TopicBrowser() {
  const topicMap = useTopicStore((s) => s.topics);
  const topics = useMemo(() => Array.from(topicMap.values()), [topicMap]);
  const addDisplay = useDisplayStore((s) => s.addDisplay);
  const updateDisplay = useDisplayStore((s) => s.updateDisplay);
  const [filter, setFilter] = useState('');

  const filtered = filter
    ? topics.filter(
        (t) =>
          t.name.toLowerCase().includes(filter.toLowerCase()) ||
          t.type.toLowerCase().includes(filter.toLowerCase()),
      )
    : topics;

  // Group by namespace
  const grouped = new Map<string, TopicInfo[]>();
  for (const t of filtered) {
    const parts = t.name.split('/');
    const ns = parts.length > 2 ? '/' + parts[1] : '/';
    const list = grouped.get(ns) || [];
    list.push(t);
    grouped.set(ns, list);
  }

  const addAsDisplay = (topic: TopicInfo) => {
    // Infer display type from message type
    const typeMap: Record<string, string> = {
      'visualization_msgs/msg/Marker': 'Marker',
      'visualization_msgs/msg/MarkerArray': 'MarkerArray',
      'sensor_msgs/msg/JointState': 'RobotModel',
      'tf2_msgs/msg/TFMessage': 'TF',
    };
    const displayType = typeMap[topic.type] || 'Marker';
    const id = addDisplay(displayType, topic.name);
    updateDisplay(id, { topic: topic.name });
  };

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-surface-1)' }}>
      <div
        className="px-3 py-2 border-b"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <input
          className="input w-full text-xs"
          placeholder="Filter topics..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {topics.length === 0 && (
          <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            No ROS topics found.
            <br />
            Check rosbridge connection.
          </div>
        )}

        {Array.from(grouped.entries()).map(([ns, items]) => (
          <div key={ns}>
            <div
              className="px-3 py-1 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)', background: 'var(--bg-surface-2)' }}
            >
              {ns}
            </div>
            {items.map((t) => (
              <div
                key={t.name}
                className="flex items-center gap-2 px-3 py-1 hover:bg-[var(--accent-dim)] cursor-pointer group"
                onClick={() => addAsDisplay(t)}
                title={`${t.name}\n${t.type}`}
              >
                <span
                  className="status-dot flex-shrink-0"
                  style={{
                    backgroundColor:
                      t.hz && t.hz > 0 ? 'var(--success)' : 'var(--text-muted)',
                    width: '6px',
                    height: '6px',
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs mono truncate" style={{ color: 'var(--text-primary)' }}>
                    {t.name.split('/').pop()}
                  </div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                    {t.type}
                  </div>
                </div>
                {t.hz !== null && (
                  <span className="text-xs mono" style={{ color: 'var(--text-secondary)' }}>
                    {t.hz.toFixed(0)}hz
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
