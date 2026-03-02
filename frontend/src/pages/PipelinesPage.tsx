import { useState, useEffect, useCallback } from 'react';
import { usePipelineStore, type Pipeline, type PipelineTemplate, type PipelineGraphJson } from '@/stores/pipelineStore';
import NodePalette from '@/components/pipeline/NodePalette';
import PipelineCanvas from '@/components/pipeline/PipelineCanvas';
import DetailDrawer from '@/components/pipeline/DetailDrawer';
import RunBar from '@/components/pipeline/RunBar';
import YamlEditor from '@/components/pipeline/YamlEditor';
import SceneCanvas from '@/components/pipeline/SceneCanvas';
import AssetBrowser from '@/components/pipeline/AssetBrowser';
import { useSceneStore } from '@/stores/sceneStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
      Loading...
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{
      padding: '64px 0', textAlign: 'center',
      color: 'var(--text-muted)', fontSize: 12,
    }}>
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline Card
// ---------------------------------------------------------------------------

function PipelineCard({
  pipeline,
  onOpen,
}: {
  pipeline: Pipeline;
  onOpen: (graphId: string) => void;
}) {
  const nodes = pipeline.graph_json?.nodes ?? [];
  const edges = pipeline.graph_json?.edges ?? [];
  const template = pipeline.graph_json?.template;

  return (
    <div
      className="panel"
      style={{ padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s' }}
      onClick={() => onOpen(pipeline.graph_id)}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = ''; }}
    >
      {/* Header row: name + template badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {pipeline.name}
        </span>
        {template ? (
          <span style={{
            fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
            background: 'var(--accent)', color: '#000', borderRadius: 99,
            padding: '2px 8px', lineHeight: '14px', flexShrink: 0,
          }}>
            {template}
          </span>
        ) : null}
      </div>

      {/* Description */}
      {pipeline.description && (
        <p style={{
          fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 8px',
          lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {pipeline.description}
        </p>
      )}

      {/* Stats row */}
      <div style={{
        display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-muted)',
      }}>
        <span>{nodes.length} nodes</span>
        <span>{edges.length} edges</span>
        <span>{fmtDate(pipeline.updated_at)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template Gallery Modal
// ---------------------------------------------------------------------------

function TemplateGallery({
  templates,
  loading,
  onSelectTemplate,
  onBlankCanvas,
  onClose,
}: {
  templates: PipelineTemplate[];
  loading: boolean;
  onSelectTemplate: (templateId: string) => void;
  onBlankCanvas: () => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg, 10px)', width: '90%', maxWidth: 700,
        maxHeight: '80vh', overflow: 'auto', padding: '20px 24px',
      }}>
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              New Pipeline
            </h2>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Choose a template or start from scratch
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 16, padding: '4px 8px',
            }}
          >
            x
          </button>
        </div>

        {loading && <Spinner />}

        {!loading && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}>
            {/* Blank Canvas card */}
            <div
              className="panel"
              style={{
                padding: '14px 16px', cursor: 'pointer', textAlign: 'center',
                transition: 'border-color 0.15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', minHeight: 100,
              }}
              onClick={onBlankCanvas}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = ''; }}
            >
              <span style={{ fontSize: 22, color: 'var(--text-muted)', lineHeight: 1 }}>+</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 6 }}>
                Blank Canvas
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                Start from scratch
              </span>
            </div>

            {/* Template cards */}
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="panel"
                style={{
                  padding: '14px 16px', cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onClick={() => onSelectTemplate(tpl.id)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = ''; }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {tpl.name}
                </span>
                <p style={{
                  fontSize: 10, color: 'var(--text-secondary)', margin: '4px 0 8px',
                  lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {tpl.description}
                </p>

                {/* Tags */}
                {tpl.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                    {tpl.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          fontSize: 9, padding: '1px 6px', borderRadius: 99,
                          background: 'rgba(255, 170, 0, 0.12)', color: 'var(--accent)',
                          fontWeight: 500,
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {tpl.node_count} nodes
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generate Scene Modal
// ---------------------------------------------------------------------------

function GenerateModal({ onClose }: { onClose: () => void }) {
  const { generateScene, generating, generateError } = useSceneStore();
  const [prompt, setPrompt] = useState('');
  const [taskType, setTaskType] = useState('manipulation');
  const [robotId, setRobotId] = useState('dobot_cr10');

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    await generateScene(prompt, taskType, robotId || undefined);
    if (!useSceneStore.getState().generateError) onClose();
  };

  const taskTypes = ['manipulation', 'navigation', 'inspection', 'data_collection'];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: '#1a1a1a', border: '1px solid #333', borderRadius: 8,
        padding: 24, width: 420, maxWidth: '90vw',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#fff' }}>
          Generate Scene
        </h3>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Prompt</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the scene... e.g. 'Pick and place task with table and 3 cubes'"
            rows={3}
            style={{
              width: '100%', background: '#0a0a0a', border: '1px solid #333',
              borderRadius: 4, padding: 8, color: '#eee', fontSize: 12,
              fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box',
            }}
            autoFocus
          />
        </label>

        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <label style={{ flex: 1 }}>
            <span style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Task Type</span>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              style={{
                width: '100%', background: '#0a0a0a', border: '1px solid #333',
                borderRadius: 4, padding: '6px 8px', color: '#eee', fontSize: 12,
              }}
            >
              {taskTypes.map((t) => (
                <option key={t} value={t}>{t.replace('_', ' ')}</option>
              ))}
            </select>
          </label>

          <label style={{ flex: 1 }}>
            <span style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Robot ID</span>
            <input
              value={robotId}
              onChange={(e) => setRobotId(e.target.value)}
              placeholder="e.g. dobot_cr10"
              style={{
                width: '100%', background: '#0a0a0a', border: '1px solid #333',
                borderRadius: 4, padding: '6px 8px', color: '#eee', fontSize: 12,
                boxSizing: 'border-box',
              }}
            />
          </label>
        </div>

        {generateError && (
          <div style={{ color: '#ff4444', fontSize: 11, marginBottom: 12, padding: '6px 8px', background: 'rgba(255,68,68,0.1)', borderRadius: 4 }}>
            {generateError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid #444', color: '#888',
              borderRadius: 4, padding: '6px 14px', fontSize: 11, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
            style={{
              background: 'var(--accent)', border: 'none', color: '#000',
              borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 600,
              cursor: generating || !prompt.trim() ? 'not-allowed' : 'pointer',
              opacity: generating || !prompt.trim() ? 0.5 : 1,
            }}
          >
            {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor Top Bar
// ---------------------------------------------------------------------------

type ViewMode = 'visual' | 'yaml' | 'scene';

function EditorTopBar({
  pipeline,
  viewMode,
  onSetViewMode,
  onBack,
  onRun,
  onGenerate,
  running,
}: {
  pipeline: Pipeline;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  onBack: () => void;
  onRun: () => void;
  onGenerate: () => void;
  running: boolean;
}) {
  const template = pipeline.graph_json?.template;

  const modeButton = (mode: ViewMode, label: string) => (
    <button
      onClick={() => onSetViewMode(mode)}
      style={{
        background: viewMode === mode ? 'var(--accent)' : 'transparent',
        color: viewMode === mode ? '#000' : 'var(--text-muted)',
        border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
        padding: '4px 10px', transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '8px 16px',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border-default)',
      flexShrink: 0, height: 44, boxSizing: 'border-box',
    }}>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', fontSize: 12, padding: '4px 8px', borderRadius: 4,
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
      >
        &larr; Pipelines
      </button>

      {/* Divider */}
      <div style={{ width: 1, height: 18, background: 'var(--border-default)' }} />

      {/* Pipeline name */}
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
        {pipeline.name}
      </span>

      {/* Template badge */}
      {template ? (
        <span style={{
          fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
          background: 'var(--accent)', color: '#000', borderRadius: 99,
          padding: '2px 8px', lineHeight: '14px',
        }}>
          {template}
        </span>
      ) : null}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* View mode segment control */}
      <div style={{
        display: 'flex', borderRadius: 4, overflow: 'hidden',
        border: '1px solid var(--border-default)',
      }}>
        {modeButton('visual', 'Visual')}
        {modeButton('scene', 'Scene')}
        {modeButton('yaml', 'YAML')}
      </div>

      {/* Generate button (scene mode only) */}
      {viewMode === 'scene' && (
        <button
          onClick={onGenerate}
          style={{
            background: 'transparent', border: '1px solid var(--accent)',
            color: 'var(--accent)', borderRadius: 4, cursor: 'pointer',
            fontSize: 10, fontWeight: 600, padding: '4px 10px',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255, 170, 0, 0.12)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          Generate
        </button>
      )}

      {/* Run button */}
      <button
        className="btn-primary"
        onClick={onRun}
        disabled={running}
        style={{
          fontSize: 11, padding: '5px 14px', flexShrink: 0,
          opacity: running ? 0.6 : 1, cursor: running ? 'not-allowed' : 'pointer',
        }}
      >
        {running ? 'Running...' : 'Run Pipeline'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline Editor (full 3-panel layout)
// ---------------------------------------------------------------------------

function PipelineEditor() {
  const {
    activePipeline,
    activePipelineLoading,
    activeRun,
    selectedNodeId,
    selectNode,
    clearActive,
    updatePipeline,
    startRun,
  } = usePipelineStore();

  const [viewMode, setViewMode] = useState<ViewMode>('visual');
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  const { sceneConfig, selectedPlacementId, selectPlacement, updatePlacement, addPlacement, removePlacement } = useSceneStore();

  const handleBack = useCallback(() => {
    clearActive();
  }, [clearActive]);

  const handleSetViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleRun = useCallback(async () => {
    if (!activePipeline) return;
    await startRun(activePipeline.graph_id);
  }, [activePipeline, startRun]);

  const handleGraphChange = useCallback((graphJson: PipelineGraphJson) => {
    if (!activePipeline) return;
    updatePipeline(activePipeline.graph_id, { graph_json: graphJson });
  }, [activePipeline, updatePipeline]);

  const handleConfigChange = useCallback((nodeId: string, config: Record<string, unknown>) => {
    if (!activePipeline) return;
    const graphJson = activePipeline.graph_json;
    const updatedNodes = graphJson.nodes.map((n) =>
      n.id === nodeId ? { ...n, config } : n,
    );
    const updatedGraph: PipelineGraphJson = { ...graphJson, nodes: updatedNodes };
    updatePipeline(activePipeline.graph_id, { graph_json: updatedGraph });
  }, [activePipeline, updatePipeline]);

  const handleCloseDrawer = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  if (activePipelineLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Spinner />
      </div>
    );
  }

  if (!activePipeline) return null;

  const graphJson = activePipeline.graph_json;
  const nodes = graphJson?.nodes ?? [];
  const nodeResults = activeRun?.node_results ?? {};
  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;
  const selectedNodeResult = selectedNodeId ? nodeResults[selectedNodeId] : undefined;
  const isRunning = activeRun != null && activeRun.status === 'running';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 48px)',
      overflow: 'hidden',
    }}>
      {/* Top bar */}
      <EditorTopBar
        pipeline={activePipeline}
        viewMode={viewMode}
        onSetViewMode={handleSetViewMode}
        onBack={handleBack}
        onRun={handleRun}
        onGenerate={() => setShowGenerateModal(true)}
        running={isRunning}
      />

      {showGenerateModal && (
        <GenerateModal onClose={() => setShowGenerateModal(false)} />
      )}

      {/* Main content area: palette + canvas/yaml + drawer */}
      <div style={{
        display: 'flex', flex: 1, overflow: 'hidden',
      }}>
        {/* Left panel: Node palette (visual) or Asset browser (scene) */}
        {viewMode === 'visual' && (
          <div style={{
            width: 240, flexShrink: 0, overflow: 'auto',
            borderRight: '1px solid var(--border-default)',
            background: 'var(--bg-surface)',
          }}>
            <NodePalette />
          </div>
        )}
        {viewMode === 'scene' && (
          <div style={{
            width: 240, flexShrink: 0, overflow: 'auto',
            borderRight: '1px solid var(--border-default)',
            background: 'var(--bg-surface)',
          }}>
            <AssetBrowser />
          </div>
        )}

        {/* Center: canvas, scene, or YAML editor */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {viewMode === 'visual' ? (
            <PipelineCanvas
              graphJson={graphJson}
              onGraphChange={handleGraphChange}
              onNodeSelect={selectNode}
              selectedNodeId={selectedNodeId}
              runNodeResults={nodeResults}
            />
          ) : viewMode === 'scene' ? (
            <SceneCanvas
              sceneConfig={sceneConfig}
              selectedPlacementId={selectedPlacementId}
              onSelectPlacement={selectPlacement}
              onUpdatePlacement={updatePlacement}
              onAddPlacement={addPlacement}
              onRemovePlacement={removePlacement}
            />
          ) : (
            <YamlEditor
              graphJson={graphJson}
              onChange={handleGraphChange}
            />
          )}
        </div>

        {/* Right panel: Detail drawer (when a node or scene placement is selected) */}
        {(selectedNode || (viewMode === 'scene' && selectedPlacementId)) && (
          <div style={{
            width: 320, flexShrink: 0, overflow: 'auto',
            borderLeft: '1px solid var(--border-default)',
            background: 'var(--bg-surface)',
          }}>
            <DetailDrawer
              node={selectedNode}
              nodeResult={selectedNodeResult}
              onConfigChange={handleConfigChange}
              onClose={handleCloseDrawer}
              scenePlacement={viewMode === 'scene' ? sceneConfig.placements.find(p => p.id === selectedPlacementId) ?? null : null}
              onUpdateScenePlacement={viewMode === 'scene' ? updatePlacement : undefined}
              onRemoveScenePlacement={viewMode === 'scene' ? (id: string) => { removePlacement(id); selectPlacement(null); } : undefined}
            />
          </div>
        )}
      </div>

      {/* Bottom: Run bar (when a run exists) */}
      {activeRun && (
        <RunBar run={activeRun} nodes={nodes} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function PipelinesPage() {
  const {
    pipelines, pipelinesLoading, fetchPipelines,
    templates, templatesLoading, fetchTemplates,
    createPipeline, instantiateTemplate,
    activePipeline, fetchPipeline,
  } = usePipelineStore();

  const [showGallery, setShowGallery] = useState(false);

  useEffect(() => {
    fetchPipelines();
    fetchTemplates();
  }, [fetchPipelines, fetchTemplates]);

  const handleOpenPipeline = useCallback((graphId: string) => {
    fetchPipeline(graphId);
  }, [fetchPipeline]);

  const handleSelectTemplate = useCallback(async (templateId: string) => {
    const pipeline = await instantiateTemplate(templateId);
    setShowGallery(false);
    // Auto-open the new pipeline in editor mode
    if (pipeline) {
      fetchPipeline(pipeline.graph_id);
    }
  }, [instantiateTemplate, fetchPipeline]);

  const handleBlankCanvas = useCallback(async () => {
    const pipeline = await createPipeline('Untitled Pipeline');
    setShowGallery(false);
    // Auto-open the new pipeline in editor mode
    if (pipeline) {
      fetchPipeline(pipeline.graph_id);
    }
  }, [createPipeline, fetchPipeline]);

  // --- Editor mode ---
  if (activePipeline) {
    return <PipelineEditor />;
  }

  // --- List mode ---
  return (
    <div style={{ padding: '20px 24px', color: 'var(--text-primary)' }}>
      {/* Page header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 20,
      }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Pipelines</h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Physical AI pipeline editor — build, train, evaluate, deploy
          </p>
        </div>
        <button
          className="btn-primary"
          style={{ fontSize: 11, padding: '5px 14px', flexShrink: 0 }}
          onClick={() => setShowGallery(true)}
        >
          + New Pipeline
        </button>
      </div>

      {/* Loading */}
      {pipelinesLoading && <Spinner />}

      {/* Empty state */}
      {!pipelinesLoading && pipelines.length === 0 && (
        <EmptyState label="No pipelines yet. Create one from a template to get started." />
      )}

      {/* Pipeline card grid */}
      {!pipelinesLoading && pipelines.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 12,
        }}>
          {pipelines.map((p) => (
            <PipelineCard key={p.graph_id} pipeline={p} onOpen={handleOpenPipeline} />
          ))}
        </div>
      )}

      {/* Template gallery modal */}
      {showGallery && (
        <TemplateGallery
          templates={templates}
          loading={templatesLoading}
          onSelectTemplate={handleSelectTemplate}
          onBlankCanvas={handleBlankCanvas}
          onClose={() => setShowGallery(false)}
        />
      )}
    </div>
  );
}
