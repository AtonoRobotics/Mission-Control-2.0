/**
 * Data Source Info Panel — shows active data source details.
 * Connection status, topic count, bandwidth, uptime.
 */

import { useDataSource, useConnectionStatus, useTopics } from '@/data-source/hooks';

export default function DataSourceInfoPanel(props: any) {
  const ds = useDataSource();
  const status = useConnectionStatus();
  const topics = useTopics();
  const playback = ds.getPlaybackControls();

  const statusColor = status === 'connected' ? '#00cc66' : status === 'connecting' ? '#ff8800' : status === 'error' ? '#ff4444' : '#666';

  const row = (label: string, value: string | number, color?: string): React.ReactNode => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color: 'var(--text-tertiary, #666)', fontSize: 11 }}>{label}</span>
      <span style={{ color: color || 'var(--text-primary)', fontSize: 11, fontFamily: 'monospace' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '4px 8px', fontSize: 10, color: 'var(--text-tertiary, #666)', borderBottom: '1px solid var(--border-subtle, #333)' }}>DATA SOURCE</div>
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 12px' }}>
        {row('Type', ds.type.toUpperCase())}
        {row('Status', status, statusColor)}
        {row('Topics', topics.length)}

        {ds.type === 'live' && (
          <>
            {row('Protocol', 'rosbridge WebSocket')}
            {row('Port', import.meta.env.VITE_ROSBRIDGE_PORT || '9090')}
          </>
        )}

        {ds.type === 'mcap' && playback && (
          <>
            {row('Playback', playback.state.isPlaying ? 'Playing' : 'Paused', playback.state.isPlaying ? '#00cc66' : '#ff8800')}
            {row('Speed', `${playback.state.speed}x`)}
            {row('Loop', playback.state.loop ? 'On' : 'Off')}
            {row('Duration', `${((playback.state.endTime - playback.state.startTime) / 1000).toFixed(1)}s`)}
          </>
        )}

        <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-tertiary, #666)' }}>TOPICS BY SCHEMA</div>
        {Object.entries(
          topics.reduce<Record<string, number>>((acc, t) => {
            const schema = t.schemaName || 'unknown';
            acc[schema] = (acc[schema] || 0) + 1;
            return acc;
          }, {}),
        )
          .sort((a, b) => b[1] - a[1])
          .map(([schema, count]) => row(schema, count))}
      </div>
    </div>
  );
}
