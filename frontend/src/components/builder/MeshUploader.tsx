import { useState, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MeshUploaderProps {
  open: boolean;
  onClose: () => void;
  componentId: string;
  onUploadComplete: (fileId: string, meshType: 'visual' | 'collision' | 'source') => void;
}

const ACCEPTED_EXTENSIONS = '.stl,.step,.stp,.obj,.dae,.fbx,.iges,.igs';

// ---------------------------------------------------------------------------
// MeshUploader
// ---------------------------------------------------------------------------

export default function MeshUploader({
  open, onClose, componentId, onUploadComplete,
}: MeshUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [meshType, setMeshType] = useState<'visual' | 'collision' | 'source'>('visual');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('component_id', componentId);
      formData.append('mesh_type', meshType);

      const res = await fetch('/mc/api/components/mesh/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Upload failed (HTTP ${res.status})`);
      }

      const result = await res.json();
      onUploadComplete(result.file_id, meshType);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-primary, #0a0a0a)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg, 8px)',
          width: 420,
          padding: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            Upload Mesh
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 16,
            }}
          >
            &times;
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: '2px dashed var(--border-default)',
            borderRadius: 6,
            padding: '28px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            marginBottom: 14,
            transition: 'border-color 0.2s',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            style={{ display: 'none' }}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                {file.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Drag &amp; drop or click to select
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                STL, STEP, OBJ, DAE, FBX, IGES
              </div>
            </div>
          )}
        </div>

        {/* Mesh type selector */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Mesh Type
          </label>
          <select
            value={meshType}
            onChange={(e) => setMeshType(e.target.value as 'visual' | 'collision' | 'source')}
            style={{
              background: 'var(--bg-surface, #1a1a1a)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontSize: 12,
              padding: '6px 10px',
              width: '100%',
            }}
          >
            <option value="visual">Visual Mesh</option>
            <option value="collision">Collision Mesh</option>
            <option value="source">Source CAD</option>
          </select>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '8px 10px', marginBottom: 14,
            background: 'rgba(255, 68, 68, 0.08)',
            border: '1px solid rgba(255, 68, 68, 0.25)',
            borderRadius: 4,
            color: 'var(--danger, #f44)',
            fontSize: 11,
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-surface, #1a1a1a)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)',
              padding: '6px 14px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            style={{
              background: !file || uploading ? 'var(--bg-surface, #1a1a1a)' : 'var(--accent, #ffaa00)',
              border: 'none',
              color: !file || uploading ? 'var(--text-muted)' : '#000',
              padding: '6px 14px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
              fontWeight: 600,
              opacity: !file || uploading ? 0.5 : 1,
            }}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
