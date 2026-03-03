import { useDisplayStore, type DisplayConfig } from '@/stores/displayStore';
import { getDisplayTypes } from '@/displays/displayRegistry';

export default function DisplaySidebar() {
  const displays = useDisplayStore((s) => s.displays);
  const selectedId = useDisplayStore((s) => s.selectedId);
  const addDisplay = useDisplayStore((s) => s.addDisplay);
  const removeDisplay = useDisplayStore((s) => s.removeDisplay);
  const setSelected = useDisplayStore((s) => s.setSelected);
  const toggleVisible = useDisplayStore((s) => s.toggleVisible);

  const types = getDisplayTypes();

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-surface-1)' }}>
      {/* Header with Add button */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Displays
        </span>
        <div className="relative group">
          <button className="btn-primary text-xs px-2 py-0.5">+ Add</button>
          <div
            className="hidden group-hover:block absolute right-0 top-full mt-1 z-50 min-w-[140px] border rounded"
            style={{ background: 'var(--bg-surface-3)', borderColor: 'var(--border-default)' }}
          >
            {types.map((t) => (
              <button
                key={t}
                className="block w-full text-left text-xs px-3 py-1.5 hover:bg-[var(--accent-dim)]"
                style={{ color: 'var(--text-primary)' }}
                onClick={() => addDisplay(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Display list */}
      <div className="flex-1 overflow-y-auto">
        {displays.length === 0 && (
          <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            No displays added.
            <br />
            Click + Add to start.
          </div>
        )}
        {displays.map((d: DisplayConfig) => (
          <div
            key={d.id}
            className="flex items-center gap-2 px-3 py-1.5 cursor-pointer border-l-2"
            style={{
              borderLeftColor: selectedId === d.id ? 'var(--accent)' : 'transparent',
              background: selectedId === d.id ? 'var(--accent-dim)' : 'transparent',
            }}
            onClick={() => setSelected(d.id)}
          >
            <button
              className="text-xs w-4 h-4 flex items-center justify-center rounded"
              style={{
                color: d.visible ? 'var(--accent)' : 'var(--text-muted)',
              }}
              onClick={(e) => { e.stopPropagation(); toggleVisible(d.id); }}
              title={d.visible ? 'Hide' : 'Show'}
            >
              {d.visible ? '\u25C9' : '\u25CB'}
            </button>

            <div className="flex-1 min-w-0">
              <div className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                {d.type}
              </div>
              {d.topic && (
                <div className="text-xs mono truncate" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                  {d.topic}
                </div>
              )}
            </div>

            <button
              className="text-xs opacity-0 group-hover:opacity-100 hover:text-[var(--danger)]"
              style={{ color: 'var(--text-muted)' }}
              onClick={(e) => { e.stopPropagation(); removeDisplay(d.id); }}
              title="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
