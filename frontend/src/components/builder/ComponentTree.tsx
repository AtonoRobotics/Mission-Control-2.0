import { useState } from 'react';
import { useComponentStore, type Component } from '@/stores/componentStore';
import { type TreeNode } from '@/stores/builderStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComponentTreeProps {
  tree: TreeNode[];
  onSelect: (componentId: string) => void;
  onAddAt: (attachPoint: string) => void;
  onRemove: (componentId: string) => void;
  selectedId: string | null;
}

interface TreeNodeRowProps {
  node: TreeNode;
  component: Component | undefined;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddAt: (attachPoint: string) => void;
  onRemove: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function approvalIcon(status: string): string {
  switch (status) {
    case 'approved': return '\u2713';
    case 'rejected': return '\u2717';
    default: return '\u25CB';
  }
}

function approvalColor(status: string): string {
  switch (status) {
    case 'approved': return 'var(--success, #4caf50)';
    case 'rejected': return 'var(--danger, #f44)';
    default: return 'var(--accent, #ffaa00)';
  }
}

// ---------------------------------------------------------------------------
// TreeNodeRow
// ---------------------------------------------------------------------------

function TreeNodeRow({
  node, component, depth, selectedId, onSelect, onAddAt, onRemove,
}: TreeNodeRowProps) {
  const isSelected = selectedId === node.component_id;
  const mass = component?.physics?.mass_kg;

  return (
    <div
      onClick={() => onSelect(node.component_id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onRemove(node.component_id);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        paddingLeft: 8 + depth * 16,
        cursor: 'pointer',
        borderRadius: 4,
        background: isSelected ? 'rgba(255, 170, 0, 0.12)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--accent, #ffaa00)' : '2px solid transparent',
        fontSize: 12,
        transition: 'background 0.15s',
      }}
    >
      {/* Approval status icon */}
      <span style={{
        color: approvalColor(component?.approval_status ?? 'pending_hit'),
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0,
        width: 14,
        textAlign: 'center',
      }}>
        {approvalIcon(component?.approval_status ?? 'pending_hit')}
      </span>

      {/* Name */}
      <span style={{
        color: 'var(--text-primary)',
        fontWeight: isSelected ? 600 : 400,
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {component?.name ?? node.component_id.slice(0, 8)}
      </span>

      {/* Mass badge */}
      {mass != null && (
        <span style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          background: 'var(--bg-surface, #1a1a1a)',
          padding: '1px 6px',
          borderRadius: 8,
          flexShrink: 0,
        }}>
          {mass}kg
        </span>
      )}

      {/* Add child button */}
      <button
        onClick={(e) => { e.stopPropagation(); onAddAt(node.component_id); }}
        style={{
          background: 'none',
          border: '1px solid var(--border-default)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          borderRadius: 4,
          width: 18,
          height: 18,
          fontSize: 12,
          lineHeight: '16px',
          padding: 0,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Add component"
      >
        +
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ComponentTree
// ---------------------------------------------------------------------------

export default function ComponentTree({
  tree, onSelect, onAddAt, onRemove, selectedId,
}: ComponentTreeProps) {
  const { components } = useComponentStore();

  const componentMap = new Map(
    components.map((c) => [c.component_id, c])
  );

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 10px',
        borderBottom: '1px solid var(--border-default)',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        <span>Component Tree</span>
      </div>

      {/* Tree body */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '4px 0',
      }}>
        {tree.length === 0 ? (
          <div style={{
            padding: '24px 12px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 12,
          }}>
            No components yet. Click + to add.
          </div>
        ) : (
          tree.map((node, i) => (
            <TreeNodeRow
              key={node.component_id}
              node={node}
              component={componentMap.get(node.component_id)}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddAt={onAddAt}
              onRemove={onRemove}
            />
          ))
        )}
      </div>
    </div>
  );
}
