// ============================================================
// Asset Browser — left panel for the Scene Builder mode.
// Three tabs (Registry / NVIDIA / Upload) with search,
// collapsible grouped sections, and HTML5 drag-and-drop.
// Follows the same visual style as NodePalette.tsx.
// ============================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSceneStore, RegistryAsset, NvidiaAssetEntry } from '@/stores/sceneStore';

// ── Types ────────────────────────────────────────────────────

type TabId = 'registry' | 'nvidia' | 'upload';

interface DragPayload {
  id: string;
  source: 'registry' | 'nvidia';
  asset_type: string;
  label: string;
  path: string;
}

// ── Helpers ──────────────────────────────────────────────────

function basename(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

function inferFileType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'urdf') return 'urdf';
  if (['usd', 'usda', 'usdc'].includes(ext)) return 'usd';
  if (['obj', 'stl'].includes(ext)) return 'mesh';
  return 'other';
}

function groupRegistryAssets(
  assets: RegistryAsset[],
): { section: string; items: RegistryAsset[] }[] {
  const buckets: Record<string, RegistryAsset[]> = {
    Robots: [],
    Objects: [],
    Configs: [],
    Other: [],
  };
  for (const a of assets) {
    const ft = a.file_type;
    if (ft === 'urdf' || ft === 'robot_usd') {
      buckets.Robots.push(a);
    } else if (ft === 'usd' || ft === 'usda') {
      buckets.Objects.push(a);
    } else if (ft === 'curobo_yaml') {
      buckets.Configs.push(a);
    } else {
      buckets.Other.push(a);
    }
  }
  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([section, items]) => ({ section, items }));
}

const NVIDIA_CATEGORIES = [
  'environments',
  'robots',
  'objects',
  'sensors',
  'lighting',
] as const;

type NvidiaCategory = (typeof NVIDIA_CATEGORIES)[number];

const ACCEPTED_EXTENSIONS = '.usd,.usda,.usdc,.obj,.stl,.urdf';

// ── Component ────────────────────────────────────────────────

export default function AssetBrowser() {
  const [activeTab, setActiveTab] = useState<TabId>('registry');
  const [search, setSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Upload state
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Store
  const registryAssets = useSceneStore((s) => s.registryAssets);
  const registryAssetsLoading = useSceneStore((s) => s.registryAssetsLoading);
  const fetchRegistryAssets = useSceneStore((s) => s.fetchRegistryAssets);
  const nvidiaAssets = useSceneStore((s) => s.nvidiaAssets);
  const nvidiaAssetsLoading = useSceneStore((s) => s.nvidiaAssetsLoading);
  const fetchNvidiaAssets = useSceneStore((s) => s.fetchNvidiaAssets);
  const uploadAsset = useSceneStore((s) => s.uploadAsset);

  // Fetch on mount
  useEffect(() => {
    fetchRegistryAssets();
  }, [fetchRegistryAssets]);

  useEffect(() => {
    fetchNvidiaAssets();
  }, [fetchNvidiaAssets]);

  // Clear upload message after 4 seconds
  useEffect(() => {
    if (!uploadMsg) return;
    const t = setTimeout(() => setUploadMsg(null), 4000);
    return () => clearTimeout(t);
  }, [uploadMsg]);

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const q = search.toLowerCase().trim();

  // ── Drag handler (registry + nvidia) ──────────────────────

  const handleDragStart = useCallback(
    (e: React.DragEvent, payload: DragPayload) => {
      e.dataTransfer.setData('application/scene-asset', JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'copy';
    },
    [],
  );

  // ── Upload handler ────────────────────────────────────────

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      const inferredType = inferFileType(file.name);
      const result = await uploadAsset(file, inferredType);
      if (result) {
        setUploadMsg({ type: 'success', text: `Uploaded ${file.name}` });
      } else {
        setUploadMsg({ type: 'error', text: `Failed to upload ${file.name}` });
      }
    },
    [uploadAsset],
  );

  const handleDropUpload = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  // ── Filtered registry groups ──────────────────────────────

  const filteredRegistry = groupRegistryAssets(
    q
      ? registryAssets.filter(
          (a) =>
            basename(a.file_path).toLowerCase().includes(q) ||
            a.file_type.toLowerCase().includes(q),
        )
      : registryAssets,
  );

  // ── Filtered nvidia groups ────────────────────────────────

  const filteredNvidia: { section: string; items: NvidiaAssetEntry[] }[] = [];
  if (nvidiaAssets) {
    for (const cat of NVIDIA_CATEGORIES) {
      const entries = nvidiaAssets.categories[cat] ?? [];
      const filtered = q
        ? entries.filter(
            (e) =>
              e.label.toLowerCase().includes(q) ||
              (e.description && e.description.toLowerCase().includes(q)),
          )
        : entries;
      if (filtered.length > 0) {
        filteredNvidia.push({
          section: cat.charAt(0).toUpperCase() + cat.slice(1),
          items: filtered,
        });
      }
    }
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div
      style={{
        width: 240,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#111111',
        borderRight: '1px solid #1e1e1e',
        overflowY: 'auto',
        fontFamily: 'system-ui, sans-serif',
        height: '100%',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #2a2a2a',
          flexShrink: 0,
        }}
      >
        {(['registry', 'nvidia', 'upload'] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '6px 0',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #ffaa00' : '2px solid transparent',
              color: activeTab === tab ? '#ffaa00' : '#777',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {tab === 'registry' ? 'Registry' : tab === 'nvidia' ? 'NVIDIA' : 'Upload'}
          </button>
        ))}
      </div>

      {/* Search input (visible in registry + nvidia tabs) */}
      {activeTab !== 'upload' && (
        <div style={{ padding: '6px 6px 4px', flexShrink: 0 }}>
          <input
            type="text"
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: 3,
              color: '#ccc',
              fontSize: 10,
              padding: '4px 6px',
              outline: 'none',
            }}
          />
        </div>
      )}

      {/* ── Registry Tab ─────────────────────────────────────── */}
      {activeTab === 'registry' && (
        <>
          {registryAssetsLoading && (
            <div style={{ padding: 8, color: '#666', fontSize: 10 }}>Loading registry...</div>
          )}
          {!registryAssetsLoading && filteredRegistry.length === 0 && (
            <div style={{ padding: 8, color: '#555', fontSize: 10 }}>No assets found</div>
          )}
          {filteredRegistry.map(({ section, items }) => {
            const key = `reg_${section}`;
            const isOpen = !collapsedSections[key];
            return (
              <div key={key}>
                <SectionHeader
                  title={section}
                  count={items.length}
                  open={isOpen}
                  onToggle={() => toggleSection(key)}
                  accentColor="#ffaa00"
                />
                {isOpen &&
                  items.map((asset) => (
                    <RegistryItem
                      key={asset.file_id}
                      asset={asset}
                      onDragStart={handleDragStart}
                    />
                  ))}
              </div>
            );
          })}
        </>
      )}

      {/* ── NVIDIA Tab ───────────────────────────────────────── */}
      {activeTab === 'nvidia' && (
        <>
          {nvidiaAssetsLoading && (
            <div style={{ padding: 8, color: '#666', fontSize: 10 }}>Loading NVIDIA assets...</div>
          )}
          {!nvidiaAssetsLoading && filteredNvidia.length === 0 && (
            <div style={{ padding: 8, color: '#555', fontSize: 10 }}>No assets found</div>
          )}
          {filteredNvidia.map(({ section, items }) => {
            const key = `nv_${section}`;
            const isOpen = !collapsedSections[key];
            return (
              <div key={key}>
                <SectionHeader
                  title={section}
                  count={items.length}
                  open={isOpen}
                  onToggle={() => toggleSection(key)}
                  accentColor="#76b900"
                />
                {isOpen &&
                  items.map((entry) => (
                    <NvidiaItem
                      key={entry.id}
                      entry={entry}
                      category={section.toLowerCase() as NvidiaCategory}
                      onDragStart={handleDragStart}
                    />
                  ))}
              </div>
            );
          })}
        </>
      )}

      {/* ── Upload Tab ───────────────────────────────────────── */}
      {activeTab === 'upload' && (
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDropUpload}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? '#ffaa00' : '#333'}`,
              borderRadius: 6,
              padding: '24px 12px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragOver ? 'rgba(255,170,0,0.06)' : 'transparent',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <div style={{ fontSize: 20, color: '#555', marginBottom: 6 }}>{'\u2B06'}</div>
            <div style={{ fontSize: 10, color: '#888', lineHeight: 1.5 }}>
              Drop files here or click to browse
            </div>
            <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>
              .usd, .usda, .usdc, .obj, .stl, .urdf
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            style={{ display: 'none' }}
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {uploadMsg && (
            <div
              style={{
                fontSize: 10,
                padding: '4px 6px',
                borderRadius: 3,
                color: uploadMsg.type === 'success' ? '#76b900' : '#ff4444',
                background: uploadMsg.type === 'success' ? 'rgba(118,185,0,0.1)' : 'rgba(255,68,68,0.1)',
              }}
            >
              {uploadMsg.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  accentColor: string;
}

function SectionHeader({ title, count, open, onToggle, accentColor }: SectionHeaderProps) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 8px',
        cursor: 'pointer',
        background: '#171717',
        borderBottom: '1px solid #2a2a2a',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 8, color: '#666', width: 10 }}>
        {open ? '\u25BC' : '\u25B6'}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: accentColor,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {title}
      </span>
      <span
        style={{
          marginLeft: 'auto',
          fontSize: 8,
          color: '#555',
          background: '#1e1e1e',
          borderRadius: 8,
          padding: '0 4px',
        }}
      >
        {count}
      </span>
    </div>
  );
}

// ── Registry item ───────────────────────────────────────────

interface RegistryItemProps {
  asset: RegistryAsset;
  onDragStart: (e: React.DragEvent, payload: DragPayload) => void;
}

function RegistryItem({ asset, onDragStart }: RegistryItemProps) {
  const [hovered, setHovered] = useState(false);

  const handleDrag = useCallback(
    (e: React.DragEvent) => {
      onDragStart(e, {
        id: asset.file_id,
        source: 'registry',
        asset_type: asset.file_type,
        label: basename(asset.file_path),
        path: asset.file_path,
      });
    },
    [asset, onDragStart],
  );

  return (
    <div
      draggable
      onDragStart={handleDrag}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px 4px 12px',
        borderBottom: '1px solid #1e1e1e',
        cursor: 'grab',
        background: hovered ? 'rgba(255,170,0,0.08)' : 'transparent',
        transition: 'background 0.1s',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: hovered ? '#e0e0e0' : '#aaa',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          transition: 'color 0.1s',
        }}
      >
        {basename(asset.file_path)}
      </span>
      <span
        style={{
          fontSize: 8,
          color: '#555',
          background: '#1e1e1e',
          borderRadius: 3,
          padding: '1px 4px',
          flexShrink: 0,
        }}
      >
        {asset.file_type}
      </span>
    </div>
  );
}

// ── NVIDIA item ─────────────────────────────────────────────

interface NvidiaItemProps {
  entry: NvidiaAssetEntry;
  category: NvidiaCategory;
  onDragStart: (e: React.DragEvent, payload: DragPayload) => void;
}

function NvidiaItem({ entry, category, onDragStart }: NvidiaItemProps) {
  const [hovered, setHovered] = useState(false);

  const handleDrag = useCallback(
    (e: React.DragEvent) => {
      onDragStart(e, {
        id: entry.id,
        source: 'nvidia',
        asset_type: category,
        label: entry.label,
        path: entry.path,
      });
    },
    [entry, category, onDragStart],
  );

  return (
    <div
      draggable
      onDragStart={handleDrag}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        padding: '4px 8px 4px 12px',
        borderBottom: '1px solid #1e1e1e',
        cursor: 'grab',
        background: hovered ? 'rgba(118,185,0,0.08)' : 'transparent',
        transition: 'background 0.1s',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: hovered ? '#e0e0e0' : '#aaa',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          transition: 'color 0.1s',
        }}
      >
        {entry.label}
      </span>
      {entry.description && (
        <span
          style={{
            fontSize: 9,
            color: '#555',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.description}
        </span>
      )}
    </div>
  );
}
