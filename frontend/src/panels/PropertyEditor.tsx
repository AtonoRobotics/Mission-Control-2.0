import { useMemo } from 'react';
import { useDisplayStore } from '@/stores/displayStore';
import { useTopicStore } from '@/stores/topicStore';
import { getDisplayConstructor } from '@/displays/displayRegistry';
import type { PropertyDef } from '@/displays/DisplayPlugin';

// Cache property schemas by display type to avoid instantiating plugins during render
const schemaCache = new Map<string, PropertyDef[]>();

function getSchema(type: string): PropertyDef[] {
  if (schemaCache.has(type)) return schemaCache.get(type)!;
  const Ctor = getDisplayConstructor(type);
  if (!Ctor) return [];
  try {
    const instance = new Ctor();
    const schema = instance.getPropertySchema();
    instance.dispose();
    schemaCache.set(type, schema);
    return schema;
  } catch {
    return [];
  }
}

export default function PropertyEditor() {
  const selectedId = useDisplayStore((s) => s.selectedId);
  const displays = useDisplayStore((s) => s.displays);
  const updateDisplay = useDisplayStore((s) => s.updateDisplay);
  const topicMap = useTopicStore((s) => s.topics);
  const topics = useMemo(() => Array.from(topicMap.values()), [topicMap]);

  const display = displays.find((d) => d.id === selectedId);

  if (!display) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-surface-1)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Select a display to edit properties
        </span>
      </div>
    );
  }

  const schema = getSchema(display.type);

  const setProperty = (key: string, value: any) => {
    updateDisplay(display.id, {
      properties: { ...display.properties, [key]: value },
    });
  };

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-surface-1)' }}>
      <div
        className="px-3 py-2 border-b flex items-center gap-2"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
          {display.type}
        </span>
        <span className="text-xs mono" style={{ color: 'var(--text-muted)' }}>
          {display.id}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {/* Topic selector */}
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
            Topic
          </label>
          <select
            className="input w-full text-xs"
            value={display.topic}
            onChange={(e) => updateDisplay(display.id, { topic: e.target.value })}
          >
            <option value="">-- none --</option>
            {topics.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.type})
              </option>
            ))}
          </select>
        </div>

        {/* Property fields from schema */}
        {schema.map((prop) => {
          const value = display.properties[prop.key] ?? prop.default;

          return (
            <div key={prop.key}>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                {prop.label}
              </label>

              {prop.type === 'boolean' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!value}
                    onChange={(e) => setProperty(prop.key, e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
                    {value ? 'On' : 'Off'}
                  </span>
                </label>
              )}

              {prop.type === 'number' && (
                <input
                  type="number"
                  className="input w-full text-xs"
                  value={value}
                  min={prop.min}
                  max={prop.max}
                  step={prop.step ?? 0.1}
                  onChange={(e) => setProperty(prop.key, parseFloat(e.target.value))}
                />
              )}

              {prop.type === 'string' && (
                <input
                  type="text"
                  className="input w-full text-xs"
                  value={value}
                  onChange={(e) => setProperty(prop.key, e.target.value)}
                />
              )}

              {prop.type === 'color' && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={value}
                    onChange={(e) => setProperty(prop.key, e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-0"
                    style={{ background: 'transparent' }}
                  />
                  <span className="text-xs mono" style={{ color: 'var(--text-muted)' }}>
                    {value}
                  </span>
                </div>
              )}

              {prop.type === 'select' && (
                <select
                  className="input w-full text-xs"
                  value={value}
                  onChange={(e) => setProperty(prop.key, e.target.value)}
                >
                  {prop.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
