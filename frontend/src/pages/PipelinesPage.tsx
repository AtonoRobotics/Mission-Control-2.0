import { useState, useEffect } from 'react';
import { usePipelineStore, type Pipeline, type PipelineTemplate } from '@/stores/pipelineStore';

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
      Loading…
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
            ×
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
// Main Page
// ---------------------------------------------------------------------------

export default function PipelinesPage() {
  const {
    pipelines, pipelinesLoading, fetchPipelines,
    templates, templatesLoading, fetchTemplates,
    createPipeline, instantiateTemplate,
  } = usePipelineStore();

  const [showGallery, setShowGallery] = useState(false);

  useEffect(() => {
    fetchPipelines();
    fetchTemplates();
  }, [fetchPipelines, fetchTemplates]);

  const handleOpenPipeline = (graphId: string) => {
    // Task 10 will wire this to the pipeline editor
    console.log('Open pipeline:', graphId);
  };

  const handleSelectTemplate = async (templateId: string) => {
    await instantiateTemplate(templateId);
    setShowGallery(false);
  };

  const handleBlankCanvas = async () => {
    await createPipeline('Untitled Pipeline');
    setShowGallery(false);
  };

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
