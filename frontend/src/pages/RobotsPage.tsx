import { useState, useEffect, useCallback, useRef } from 'react';
import Editor, { loader, type Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useRobotStore, type RobotFile } from '@/stores/robotStore';

// Use locally installed monaco-editor instead of CDN
loader.config({ monaco });

// Builder components
import ComponentTree from '@/components/builder/ComponentTree';
import ComponentPicker from '@/components/builder/ComponentPicker';
import PropertiesPanel from '@/components/builder/PropertiesPanel';
import BuilderPreview3D from '@/components/builder/BuilderPreview3D';
import MeshUploader from '@/components/builder/MeshUploader';
import { useComponentStore, type Component } from '@/stores/componentStore';
import { useBuilderStore, type TreeNode } from '@/stores/builderStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = 'configurator' | 'files';

type FileTabType = 'urdf' | 'curobo_yaml' | 'usd';

const FILE_TAB_META: Record<FileTabType, { label: string; language: string }> = {
  urdf:        { label: 'URDF',   language: 'xml' },
  curobo_yaml: { label: 'cuRobo', language: 'yaml' },
  usd:         { label: 'USD',    language: 'python' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'promoted': case 'complete': case 'connected': return 'var(--success)';
    case 'validated': case 'running': case 'connecting': return 'var(--warning)';
    case 'draft': case 'pending': return 'var(--accent)';
    case 'failed': case 'disconnected': return 'var(--danger)';
    default: return 'var(--text-muted)';
  }
}

function Spinner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      color: 'var(--text-muted)', fontSize: 12, padding: 24,
    }}>
      <div style={{
        width: 14, height: 14, border: '2px solid var(--border-default)',
        borderTopColor: 'var(--accent)', borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      Loading…
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      backgroundColor: statusColor(status), marginRight: 6, flexShrink: 0,
    }} />
  );
}

// ---------------------------------------------------------------------------
// Left Panel — Robot List (always visible)
// ---------------------------------------------------------------------------

function RobotListPanel() {
  const { robots, loading, error, selectedRobotId, fetchRobots, selectRobot } = useRobotStore();

  useEffect(() => { fetchRobots(); }, [fetchRobots]);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    robot_id: '', name: '', manufacturer: '', model: '',
    dof: '', payload_kg: '', reach_mm: '',
  });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const body = {
        robot_id: form.robot_id,
        name: form.name,
        manufacturer: form.manufacturer || null,
        model: form.model || null,
        dof: form.dof ? parseInt(form.dof) : null,
        payload_kg: form.payload_kg ? parseFloat(form.payload_kg) : null,
        reach_mm: form.reach_mm ? parseFloat(form.reach_mm) : null,
      };
      const res = await fetch('/mc/api/registry/robots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchRobots();
      const created = await res.json();
      selectRobot(created.robot_id);
      setShowCreate(false);
      setForm({ robot_id: '', name: '', manufacturer: '', model: '', dof: '', payload_kg: '', reach_mm: '' });
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: 'var(--bg-primary, #0a0a0a)',
      borderRight: '1px solid var(--border-default)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          Robots
        </span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            background: 'none', border: 'none', color: 'var(--accent, #ffaa00)',
            cursor: 'pointer', fontSize: 14, padding: '0 4px', lineHeight: 1,
          }}
        >
          +
        </button>
      </div>

      {/* Create form (inline) */}
      {showCreate && (
        <div style={{
          padding: '8px 10px', borderBottom: '1px solid var(--border-default)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {[
            { key: 'robot_id', placeholder: 'robot_id (e.g. dobot_cr10)' },
            { key: 'name', placeholder: 'Name' },
            { key: 'manufacturer', placeholder: 'Manufacturer' },
          ].map(({ key, placeholder }) => (
            <input
              key={key}
              value={form[key as keyof typeof form]}
              placeholder={placeholder}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              style={{
                background: 'var(--bg-surface, #1a1a1a)',
                border: '1px solid var(--border-default)',
                borderRadius: 3, color: 'var(--text-primary)',
                fontSize: 10, padding: '4px 8px', outline: 'none',
              }}
            />
          ))}
          <button
            onClick={handleCreate}
            disabled={saving || !form.robot_id || !form.name}
            style={{
              background: 'var(--accent, #ffaa00)', border: 'none', color: '#000',
              padding: '4px 0', borderRadius: 3, fontSize: 10, cursor: 'pointer',
              fontWeight: 600, opacity: saving || !form.robot_id || !form.name ? 0.4 : 1,
            }}
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}

      {/* Robot list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {error && (
          <div style={{ padding: '8px 10px', fontSize: 10, color: 'var(--danger)' }}>{error}</div>
        )}
        {loading && <Spinner />}
        {!loading && robots.length === 0 && (
          <div style={{ padding: '24px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            No robots registered
          </div>
        )}
        {robots.map((r) => (
          <button
            key={r.robot_id}
            onClick={() => selectRobot(r.robot_id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '10px 12px',
              background: selectedRobotId === r.robot_id ? 'rgba(255, 170, 0, 0.06)' : 'transparent',
              borderLeft: selectedRobotId === r.robot_id
                ? '2px solid var(--accent, #ffaa00)' : '2px solid transparent',
              borderBottom: '1px solid var(--border-default)',
              border: 'none',
              borderLeftStyle: 'solid',
              borderLeftWidth: 2,
              borderLeftColor: selectedRobotId === r.robot_id ? 'var(--accent, #ffaa00)' : 'transparent',
              borderBottomWidth: 1,
              borderBottomStyle: 'solid',
              borderBottomColor: 'var(--border-default)',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            <div style={{
              fontSize: 12, fontWeight: 600,
              color: selectedRobotId === r.robot_id ? 'var(--accent, #ffaa00)' : 'var(--text-primary)',
            }}>
              {r.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {r.manufacturer || r.model || r.robot_id}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {r.dof && (
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{r.dof} DOF</span>
              )}
              {r.payload_kg && (
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{r.payload_kg}kg</span>
              )}
              {r.reach_mm && (
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{r.reach_mm}mm</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Configurator View — component tree + 3D preview + properties + build bar
// ---------------------------------------------------------------------------

function ConfiguratorView() {
  const { selectedRobotId, robots } = useRobotStore();
  const robot = robots.find((r) => r.robot_id === selectedRobotId);
  const { components, fetchComponents, approveComponent, rejectComponent } = useComponentStore();
  const {
    configurations, selectedConfigId, building, buildResult,
    fetchConfigurations, createConfiguration, selectConfiguration, buildConfiguration,
    fetchPackages,
  } = useBuilderStore();

  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAttachPoint, setPickerAttachPoint] = useState<string>('');
  const [meshUploadOpen, setMeshUploadOpen] = useState(false);
  const [meshUploadComponentId, setMeshUploadComponentId] = useState<string>('');
  const [propsCollapsed, setPropsCollapsed] = useState(false);

  useEffect(() => {
    fetchComponents();
    fetchPackages();
    if (selectedRobotId) {
      fetchConfigurations(selectedRobotId);
    }
  }, [selectedRobotId, fetchComponents, fetchPackages, fetchConfigurations]);

  if (!selectedRobotId || !robot) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: 13,
      }}>
        Select a robot from the list to configure
      </div>
    );
  }

  const handleAddAt = (attachPoint: string) => {
    setPickerAttachPoint(attachPoint);
    setPickerOpen(true);
  };

  const handlePickComponent = (comp: Component) => {
    const node: TreeNode = {
      component_id: comp.component_id,
      attach_to: pickerAttachPoint || 'ee_flange',
      joint_config: { type: 'fixed' },
    };
    setTree((prev) => [...prev, node]);
  };

  const handleRemoveComponent = (componentId: string) => {
    setTree((prev) => prev.filter((n) => n.component_id !== componentId));
    if (selectedComponentId === componentId) setSelectedComponentId(null);
  };

  const handleApprove = async (id: string) => { await approveComponent(id, 'operator'); };
  const handleReject = async (id: string) => { await rejectComponent(id, 'operator'); };

  const handleBuild = async () => {
    if (!selectedConfigId) return;
    await buildConfiguration(selectedConfigId);
  };

  const handleCreateConfig = async () => {
    const name = prompt('Configuration name:');
    if (!name) return;
    await createConfiguration(selectedRobotId, { name, base_type: 'standing' } as any);
  };

  const totalMass = tree.reduce((sum, node) => {
    const comp = components.find((c) => c.component_id === node.component_id);
    return sum + (comp?.physics?.mass_kg ?? 0);
  }, 0);

  const maxPayload = robot.payload_kg ?? 0;
  const overWeight = maxPayload > 0 && totalMass > maxPayload;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Main area: Component Tree + 3D Preview */}
      <div style={{ flex: 1, display: 'flex', gap: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Component Tree (280px) */}
        <div style={{
          width: 280, flexShrink: 0,
          background: 'var(--bg-primary, #0a0a0a)',
          borderRight: '1px solid var(--border-default)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <ComponentTree
            tree={tree}
            selectedId={selectedComponentId}
            onSelect={setSelectedComponentId}
            onAddAt={handleAddAt}
            onRemove={handleRemoveComponent}
          />
          {/* Add root button */}
          <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-default)' }}>
            <button
              onClick={() => handleAddAt('ee_flange')}
              style={{
                width: '100%', padding: '6px 0',
                background: 'rgba(255, 170, 0, 0.08)',
                border: '1px dashed var(--accent, #ffaa00)',
                borderRadius: 4, color: 'var(--accent, #ffaa00)',
                fontSize: 11, cursor: 'pointer',
              }}
            >
              + Add Component
            </button>
          </div>
        </div>

        {/* 3D Preview (flex) */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <BuilderPreview3D tree={tree} selectedId={selectedComponentId} />
        </div>
      </div>

      {/* Properties Panel (collapsible, bottom) */}
      <div style={{
        borderTop: '1px solid var(--border-default)',
        background: 'var(--bg-primary, #0a0a0a)',
        overflow: 'hidden',
        transition: 'height 0.2s ease',
        height: propsCollapsed ? 28 : 200,
        flexShrink: 0,
      }}>
        {/* Collapse toggle */}
        <button
          onClick={() => setPropsCollapsed(!propsCollapsed)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '4px 12px', background: 'none', border: 'none',
            borderBottom: propsCollapsed ? 'none' : '1px solid var(--border-default)',
            cursor: 'pointer',
          }}
        >
          <span style={{
            fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Properties
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {propsCollapsed ? '▲' : '▼'}
          </span>
        </button>
        {!propsCollapsed && (
          <div style={{ height: 'calc(100% - 28px)', overflow: 'auto' }}>
            <PropertiesPanel
              componentId={selectedComponentId}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          </div>
        )}
      </div>

      {/* Bottom Bar: Build + payload summary */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderTop: '1px solid var(--border-default)',
        background: 'var(--bg-surface-1, #111)',
        flexShrink: 0,
      }}>
        {/* Left: payload summary */}
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-secondary)', alignItems: 'center' }}>
          <span>Components: <strong style={{ color: 'var(--text-primary)' }}>{tree.length}</strong></span>
          <span>
            Payload:{' '}
            <strong style={{ color: overWeight ? 'var(--danger, #f44)' : 'var(--text-primary)' }}>
              {totalMass.toFixed(2)} kg
            </strong>
            {maxPayload > 0 && (
              <span style={{ color: 'var(--text-muted)' }}> / {maxPayload} kg</span>
            )}
          </span>
          {/* Payload progress bar */}
          {maxPayload > 0 && (
            <div style={{
              width: 80, height: 4, borderRadius: 2,
              background: 'var(--bg-surface-3, #2a2a2a)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, (totalMass / maxPayload) * 100)}%`,
                background: overWeight ? 'var(--danger, #f44)' : 'var(--accent, #ffaa00)',
                borderRadius: 2,
                transition: 'width 0.2s',
              }} />
            </div>
          )}
          {configurations.length > 0 && (
            <span>
              Config: <strong style={{ color: 'var(--accent, #ffaa00)' }}>
                {configurations.find((c) => c.config_id === selectedConfigId)?.name ?? 'none'}
              </strong>
            </span>
          )}
        </div>

        {/* Right: actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleCreateConfig}
            style={{
              background: 'var(--bg-surface, #1a1a1a)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)',
              padding: '5px 12px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
            }}
          >
            New Config
          </button>
          <button
            onClick={handleBuild}
            disabled={!selectedConfigId || building}
            style={{
              background: !selectedConfigId || building ? 'var(--bg-surface, #1a1a1a)' : 'var(--accent, #ffaa00)',
              border: 'none',
              color: !selectedConfigId || building ? 'var(--text-muted)' : '#000',
              padding: '5px 16px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
              fontWeight: 600,
              opacity: !selectedConfigId || building ? 0.5 : 1,
            }}
          >
            {building ? 'Building...' : 'Build All Configs'}
          </button>
        </div>
      </div>

      {/* Build result banner */}
      {buildResult && (
        <div style={{
          padding: '6px 12px',
          background: buildResult.status === 'built'
            ? 'rgba(76, 175, 80, 0.08)' : 'rgba(255, 68, 68, 0.08)',
          border: `1px solid ${buildResult.status === 'built'
            ? 'rgba(76, 175, 80, 0.25)' : 'rgba(255, 68, 68, 0.25)'}`,
          fontSize: 10,
          color: buildResult.status === 'built' ? 'var(--success, #4caf50)' : 'var(--danger, #f44)',
          flexShrink: 0,
        }}>
          {buildResult.status === 'built' ? (
            <span>Build complete. Files: {Object.keys(buildResult.generated_files).join(', ') || 'pending'}</span>
          ) : (
            <div>
              <strong>Build failed: </strong>
              {buildResult.errors.join('; ')}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <ComponentPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickComponent}
      />
      <MeshUploader
        open={meshUploadOpen}
        onClose={() => setMeshUploadOpen(false)}
        componentId={meshUploadComponentId}
        onUploadComplete={() => fetchComponents()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Files View — Monaco editor for URDF/cuRobo/USD
// ---------------------------------------------------------------------------

function defineAmberTheme(monacoInstance: Monaco) {
  monacoInstance.editor.defineTheme('mc-amber', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b6b6b', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ffaa00' },
      { token: 'string', foreground: 'c8a050' },
      { token: 'number', foreground: 'e8b060' },
      { token: 'tag', foreground: 'ffaa00' },
      { token: 'attribute.name', foreground: 'c89040' },
      { token: 'attribute.value', foreground: 'c8a050' },
      { token: 'delimiter', foreground: '888888' },
      { token: 'type', foreground: 'e8b060' },
    ],
    colors: {
      'editor.background': '#0a0a0a',
      'editor.foreground': '#d4d4d4',
      'editor.lineHighlightBackground': '#1a1a1a',
      'editor.selectionBackground': '#ffaa0030',
      'editorCursor.foreground': '#ffaa00',
      'editorLineNumber.foreground': '#444444',
      'editorLineNumber.activeForeground': '#ffaa00',
      'editorIndentGuide.background': '#1a1a1a',
      'editor.selectionHighlightBackground': '#ffaa0018',
      'editorWidget.background': '#111111',
      'editorWidget.border': '#2a2a2a',
      'input.background': '#111111',
      'input.border': '#2a2a2a',
      'input.foreground': '#d4d4d4',
    },
  });
}

function FilesView() {
  const {
    selectedRobotId, robots, robotFiles, robotFilesLoading,
    fileHistory, fileHistoryLoading,
    fetchRobotFiles, fetchFileHistory, restoreFileVersion,
  } = useRobotStore();

  const robot = robots.find((r) => r.robot_id === selectedRobotId);

  const [activeFileType, setActiveFileType] = useState<FileTabType>('urdf');
  const [editing, setEditing] = useState(false);
  const [editorContent, setEditorContent] = useState<string>('');
  const [savedContent, setSavedContent] = useState<string>('');
  const [contentLoading, setContentLoading] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const activeFileRef = useRef<RobotFile | null>(null);

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [viewingOldVersion, setViewingOldVersion] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const isDirty = editorContent !== savedContent;
  const activeFile = robotFiles.find((f) => f.file_type === activeFileType) || null;
  activeFileRef.current = activeFile;

  const loadFileContent = useCallback(async (file: RobotFile | null) => {
    if (!file) {
      setEditorContent('');
      setSavedContent('');
      return;
    }
    setContentLoading(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/mc/api/registry/files/${file.file_id}/content`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const content = data.content || '';
      setEditorContent(content);
      setSavedContent(content);
    } catch {
      setEditorContent('// Failed to load file content');
      setSavedContent('');
    } finally {
      setContentLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFileContent(activeFile);
    setSelectedVersionId(null);
    setViewingOldVersion(false);
    if (activeFile) fetchFileHistory(activeFile.file_id);
  }, [activeFile?.file_id, loadFileContent, fetchFileHistory]);

  const handleSave = async () => {
    const file = activeFileRef.current;
    if (!file || !isDirty || !selectedRobotId) return;
    setSavingContent(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/mc/api/registry/files/${file.file_id}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editorContent }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedContent(editorContent);
      setSaveMsg('Saved');
      setEditing(false);
      setTimeout(() => setSaveMsg(null), 2000);
      await fetchRobotFiles(selectedRobotId);
    } catch (e) {
      setSaveMsg(`Error: ${e instanceof Error ? e.message : 'Save failed'}`);
    } finally {
      setSavingContent(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedVersionId || !selectedRobotId) return;
    setRestoring(true);
    const result = await restoreFileVersion(selectedVersionId);
    if (result) {
      setSaveMsg('Version restored');
      setTimeout(() => setSaveMsg(null), 2000);
      setSelectedVersionId(null);
      setViewingOldVersion(false);
      await fetchRobotFiles(selectedRobotId);
    } else {
      setSaveMsg('Error: Restore failed');
    }
    setRestoring(false);
  };

  const handleVersionSelect = async (fileId: string | null) => {
    if (!fileId || fileId === activeFile?.file_id) {
      setSelectedVersionId(null);
      setViewingOldVersion(false);
      if (activeFile) loadFileContent(activeFile);
      return;
    }
    setSelectedVersionId(fileId);
    setViewingOldVersion(true);
    setEditing(false);
    setContentLoading(true);
    try {
      const res = await fetch(`/mc/api/registry/files/${fileId}/content`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEditorContent(data.content || '');
    } catch {
      setEditorContent('// Failed to load version content');
    } finally {
      setContentLoading(false);
    }
  };

  const [generating, setGenerating] = useState(false);
  const handleGenerate = async () => {
    if (!selectedRobotId) return;
    setGenerating(true);
    try {
      const res = await fetch(`/mc/api/registry/robots/${selectedRobotId}/generate-files`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchRobotFiles(selectedRobotId);
    } catch {
      // silently fail
    } finally {
      setGenerating(false);
    }
  };

  if (!selectedRobotId || !robot) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: 13,
      }}>
        Select a robot to view config files
      </div>
    );
  }

  // No files yet
  if (!robotFilesLoading && robotFiles.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          No config files generated yet for {robot.name}
        </div>
        <button
          className="btn-primary"
          onClick={handleGenerate}
          disabled={generating}
          style={{ padding: '6px 20px', fontSize: 11 }}
        >
          {generating ? 'Generating…' : 'Generate Config Files'}
        </button>
      </div>
    );
  }

  if (robotFilesLoading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>;
  }

  const fileMeta = FILE_TAB_META[activeFileType];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Top bar: robot info + edit controls */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px', flexShrink: 0,
        borderBottom: '1px solid var(--border-default)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {robot.name}
          </span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {robot.robot_id}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {saveMsg && (
            <span style={{
              fontSize: 10,
              color: saveMsg.startsWith('Error') ? 'var(--danger)' : 'var(--success)',
            }}>
              {saveMsg}
            </span>
          )}
          {viewingOldVersion ? (
            <>
              <span style={{ fontSize: 10, color: 'var(--warning)' }}>Viewing old version</span>
              <button className="btn-primary" onClick={handleRestore} disabled={restoring}
                style={{ padding: '4px 14px', fontSize: 10 }}>
                {restoring ? 'Restoring…' : 'Restore'}
              </button>
              <button className="btn-secondary" onClick={() => handleVersionSelect(null)}
                style={{ padding: '4px 12px', fontSize: 10 }}>
                Back to Latest
              </button>
            </>
          ) : editing ? (
            <>
              <button className="btn-secondary" onClick={() => { setEditorContent(savedContent); setEditing(false); }}
                style={{ padding: '4px 12px', fontSize: 10 }}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSave}
                disabled={!isDirty || savingContent || contentLoading}
                style={{ padding: '4px 14px', fontSize: 10, opacity: isDirty ? 1 : 0.4 }}>
                {savingContent ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : (
            <button className="btn-secondary" onClick={() => setEditing(true)}
              disabled={!activeFile} style={{ padding: '4px 12px', fontSize: 10 }}>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* File type sub-tabs */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--border-default)',
        flexShrink: 0,
      }}>
        {(Object.entries(FILE_TAB_META) as [FileTabType, { label: string }][]).map(([type, meta]) => {
          const isActive = activeFileType === type;
          const hasFile = robotFiles.some((f) => f.file_type === type);
          const isThisDirty = isActive && isDirty;
          return (
            <button
              key={type}
              onClick={() => {
                if (editing && isDirty) return;
                setActiveFileType(type);
              }}
              style={{
                background: isActive ? 'var(--bg-surface-2)' : 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                color: isActive ? 'var(--accent)' : hasFile ? 'var(--text-secondary)' : 'var(--text-muted)',
                cursor: (editing && isDirty && !isActive) ? 'not-allowed' : 'pointer',
                fontSize: 11,
                fontWeight: isActive ? 600 : 400,
                padding: '6px 16px',
                fontFamily: 'var(--font-mono)',
                transition: 'color 0.15s, border-color 0.15s',
                opacity: (editing && isDirty && !isActive) ? 0.3 : hasFile ? 1 : 0.5,
              }}
            >
              {meta.label}{isThisDirty ? ' *' : ''}
            </button>
          );
        })}
      </div>

      {/* Editor or read-only view */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {editing ? (
          <div style={{ flex: 1, minHeight: 0 }}>
            {contentLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Spinner />
              </div>
            ) : (
              <Editor
                key={activeFile?.file_id}
                height="100%"
                language={fileMeta.language}
                value={editorContent}
                theme="mc-amber"
                beforeMount={defineAmberTheme}
                onChange={(value) => setEditorContent(value ?? '')}
                loading={<Spinner />}
                options={{
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                  renderLineHighlight: 'line',
                  padding: { top: 8, bottom: 8 },
                  wordWrap: 'on',
                  tabSize: 2,
                  automaticLayout: true,
                }}
              />
            )}
          </div>
        ) : (
          <div style={{
            flex: 1, overflow: 'auto', background: '#0a0a0a',
          }}>
            {contentLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Spinner />
              </div>
            ) : !activeFile ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: 'var(--text-muted)', fontSize: 12,
              }}>
                No {fileMeta.label} file for this robot.
              </div>
            ) : (
              <pre style={{
                margin: 0, padding: 12,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 12, lineHeight: 1.6,
                color: '#d4d4d4', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {editorContent}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* File path footer with version history */}
      {activeFile && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '3px 8px', fontSize: 10, color: 'var(--text-muted)',
          borderTop: '1px solid var(--border-default)', flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{activeFile.file_path}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {fileHistory.length > 1 ? (
              <select
                value={selectedVersionId || activeFile.file_id}
                onChange={(e) => handleVersionSelect(
                  e.target.value === activeFile.file_id ? null : e.target.value
                )}
                disabled={editing}
                style={{
                  background: 'var(--bg-surface-2)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 3, fontSize: 10, padding: '2px 4px',
                  fontFamily: 'var(--font-mono)',
                  cursor: editing ? 'not-allowed' : 'pointer',
                  opacity: editing ? 0.4 : 1,
                }}
              >
                {fileHistory.map((h, i) => (
                  <option key={h.file_id} value={h.file_id}>
                    v{h.version} — {fmtDate(h.created_at)}{i === 0 ? ' (latest)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ fontFamily: 'var(--font-mono)' }}>v{activeFile.version}</span>
            )}
            <StatusDot status={activeFile.status} />
            <span>{activeFile.status}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RobotsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('configurator');
  const { selectedRobotId, fetchRobotFiles } = useRobotStore();

  // Load robot files when switching to files view
  useEffect(() => {
    if (viewMode === 'files' && selectedRobotId) {
      fetchRobotFiles(selectedRobotId);
    }
  }, [viewMode, selectedRobotId, fetchRobotFiles]);

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-base)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{
            margin: 0, fontSize: 16, fontWeight: 600,
            color: 'var(--text-primary)', letterSpacing: 0.3,
          }}>
            Robots
          </h1>
          {selectedRobotId && (
            <span style={{
              fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)',
              padding: '2px 10px', borderRadius: 3,
              background: 'rgba(255, 170, 0, 0.1)',
            }}>
              {selectedRobotId}
            </span>
          )}
        </div>

        {/* View mode toggle */}
        <div style={{ display: 'flex', gap: 2 }}>
          {([
            { id: 'configurator' as ViewMode, label: 'Configurator' },
            { id: 'files' as ViewMode, label: 'Config Files' },
          ]).map((v) => (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id)}
              style={{
                background: viewMode === v.id ? 'rgba(255, 170, 0, 0.1)' : 'transparent',
                border: '1px solid',
                borderColor: viewMode === v.id ? 'var(--accent, #ffaa00)' : 'var(--border-default)',
                color: viewMode === v.id ? 'var(--accent, #ffaa00)' : 'var(--text-secondary)',
                padding: '4px 14px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
                fontWeight: viewMode === v.id ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content: left panel + right area */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <RobotListPanel />
        {viewMode === 'configurator' && <ConfiguratorView />}
        {viewMode === 'files' && <FilesView />}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
