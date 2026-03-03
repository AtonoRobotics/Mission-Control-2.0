/**
 * Action Monitor Panel — lists ROS2 action servers and goal states.
 * Displays goal status, feedback, and results.
 */

import { useState, useEffect, useRef } from 'react';
import { useDataSource, useTopics } from '@/data-source/hooks';
import type { MessageEvent } from '@/data-source/types';

interface GoalEntry {
  actionName: string;
  goalId: string;
  status: string;
  feedback?: unknown;
  result?: unknown;
  timestamp: number;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#ff8800',
  ACTIVE: '#4499ff',
  SUCCEEDED: '#00cc66',
  CANCELED: '#666',
  ABORTED: '#ff4444',
  UNKNOWN: '#666',
};

export default function ActionMonitorPanel(props: any) {
  const ds = useDataSource();
  const topics = useTopics();
  const [goals, setGoals] = useState<GoalEntry[]>([]);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const subsRef = useRef<Array<{ unsubscribe: () => void }>>([]);

  // Find action-related topics (contain /status, /_action/feedback, /_action/result)
  const actionTopics = topics.filter(
    (t) => t.name.includes('/_action/status') || t.name.includes('/action_status'),
  );

  useEffect(() => {
    subsRef.current.forEach((s) => s.unsubscribe());
    subsRef.current = [];

    // Subscribe to action status topics
    for (const t of actionTopics) {
      const sub = ds.subscribe(t.name, (event: MessageEvent) => {
        const msg = event.message as any;
        const statusList = msg?.status_list || msg?.goal_status_array || [];
        if (!Array.isArray(statusList)) return;

        setGoals((prev) => {
          const updated = [...prev];
          for (const s of statusList) {
            const goalId = s.goal_id?.id || s.goal_info?.goal_id?.uuid?.join(',') || 'unknown';
            const statusCode = s.status ?? s.goal_status ?? -1;
            const statusMap: Record<number, string> = { 0: 'PENDING', 1: 'ACTIVE', 2: 'ACTIVE', 3: 'SUCCEEDED', 4: 'ABORTED', 5: 'CANCELED', 6: 'CANCELED' };
            const status = statusMap[statusCode] || 'UNKNOWN';
            const actionName = t.name.replace(/\/_action\/status$/, '').replace(/\/action_status$/, '');

            const existing = updated.findIndex((g) => g.goalId === goalId);
            if (existing >= 0) {
              updated[existing] = { ...updated[existing], status, timestamp: event.timestamp };
            } else {
              updated.unshift({ actionName, goalId, status, timestamp: event.timestamp });
            }
          }
          return updated.slice(0, 50);
        });
      });
      subsRef.current.push(sub);
    }

    return () => {
      subsRef.current.forEach((s) => s.unsubscribe());
      subsRef.current = [];
    };
  }, [ds, actionTopics.length]);

  const filtered = goals.filter(
    (g) => !filter || g.actionName.includes(filter) || g.status.includes(filter.toUpperCase()),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--border-subtle, #333)', flexShrink: 0 }}>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter actions..."
          style={{ flex: 1, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle, #333)', borderRadius: 3, fontSize: 11, padding: '3px 6px' }}
        />
        <span style={{ fontSize: 10, color: 'var(--text-tertiary, #666)' }}>{filtered.length} goals</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 16, color: 'var(--text-tertiary, #666)', fontSize: 12 }}>
            {actionTopics.length === 0 ? 'No action servers detected' : 'No goals tracked yet'}
          </div>
        )}
        {filtered.map((g) => (
          <div key={g.goalId}>
            <div
              onClick={() => setExpandedGoalId(expandedGoalId === g.goalId ? null : g.goalId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 8px',
                cursor: 'pointer',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                fontSize: 11,
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: STATUS_COLORS[g.status] || '#666',
                flexShrink: 0,
              }} />
              <span style={{ color: 'var(--text-primary)', flex: 1 }}>{g.actionName}</span>
              <span style={{ color: STATUS_COLORS[g.status] || '#666', fontFamily: 'monospace', fontSize: 10 }}>{g.status}</span>
            </div>
            {expandedGoalId === g.goalId && (
              <div style={{ padding: '4px 8px 4px 24px', fontSize: 10, color: 'var(--text-tertiary, #666)', fontFamily: 'monospace' }}>
                Goal ID: {g.goalId}<br />
                Time: {new Date(g.timestamp).toLocaleTimeString()}
                {g.feedback != null && <><br />{'Feedback: ' + String(JSON.stringify(g.feedback))}</>}
                {g.result != null && <><br />{'Result: ' + String(JSON.stringify(g.result))}</>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
