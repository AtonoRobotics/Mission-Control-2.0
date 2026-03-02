import { useRosBridgeStore } from '@/stores/rosBridgeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTFStore } from '@/stores/tfStore';

export default function Toolbar() {
  const rosStatus = useRosBridgeStore((s) => s.status);
  const fixedFrame = useSettingsStore((s) => s.fixedFrame);
  const setFixedFrame = useSettingsStore((s) => s.setFixedFrame);
  const frameList = useTFStore((s) => s.frameList);

  return (
    <div
      className="h-9 flex items-center gap-4 px-4 border-b"
      style={{ background: 'var(--bg-surface-1)', borderColor: 'var(--border-default)' }}
    >
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
        Mission Control
      </span>

      <div className="flex items-center gap-2 ml-4">
        <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Fixed Frame</label>
        <select
          className="input text-xs py-0.5"
          value={fixedFrame}
          onChange={(e) => setFixedFrame(e.target.value)}
        >
          {frameList.length === 0 && <option value="base_link">base_link</option>}
          {frameList.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span
            className={`status-dot ${rosStatus === 'connected' ? 'status-dot-live' : ''}`}
            style={{
              backgroundColor:
                rosStatus === 'connected' ? 'var(--success)' :
                rosStatus === 'connecting' ? 'var(--warning)' : 'var(--danger)',
            }}
          />
          <span className="text-xs mono" style={{ color: 'var(--text-secondary)' }}>
            {rosStatus}
          </span>
        </div>
      </div>
    </div>
  );
}
