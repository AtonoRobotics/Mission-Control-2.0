/**
 * Markdown Panel — render Markdown text in a panel.
 * Uses safe text rendering (no dangerouslySetInnerHTML).
 */

import { useState, useMemo } from 'react';

interface MarkdownNode {
  type: 'h1' | 'h2' | 'h3' | 'li' | 'p' | 'code';
  text: string;
}

function parseMarkdown(md: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  for (const line of md.split('\n')) {
    if (line.startsWith('### ')) nodes.push({ type: 'h3', text: line.slice(4) });
    else if (line.startsWith('## ')) nodes.push({ type: 'h2', text: line.slice(3) });
    else if (line.startsWith('# ')) nodes.push({ type: 'h1', text: line.slice(2) });
    else if (line.startsWith('- ')) nodes.push({ type: 'li', text: line.slice(2) });
    else if (line.startsWith('`') && line.endsWith('`')) nodes.push({ type: 'code', text: line.slice(1, -1) });
    else if (line.trim()) nodes.push({ type: 'p', text: line });
  }
  return nodes;
}

const STYLES: Record<string, React.CSSProperties> = {
  h1: { color: 'var(--accent)', fontSize: 18, fontWeight: 700, margin: '16px 0 8px' },
  h2: { color: 'var(--text-primary)', fontSize: 15, fontWeight: 600, margin: '12px 0 4px' },
  h3: { color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, margin: '8px 0 4px' },
  li: { color: 'var(--text-secondary)', fontSize: 13, marginLeft: 16, lineHeight: 1.6 },
  p: { color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, margin: '4px 0' },
  code: { color: '#a5d6a7', fontSize: 11, fontFamily: 'monospace', background: 'var(--bg-surface-2)', padding: '2px 6px', borderRadius: 3, display: 'inline-block', margin: '2px 0' },
};

export default function MarkdownPanel(props: any) {
  const { config = {}, onConfigChange = () => {} } = props;
  const content = (config.content as string) || '# Markdown Panel\n\nEdit this content in settings.\n\n- Use markdown syntax\n- Headings, lists, paragraphs';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);

  const nodes = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--border-subtle, #333)', flexShrink: 0 }}>
        <span style={{ flex: 1, fontSize: 10, color: 'var(--text-tertiary, #666)' }}>MARKDOWN</span>
        <button
          onClick={() => {
            if (editing) { onConfigChange({ ...config, content: draft }); }
            else { setDraft(content); }
            setEditing(!editing);
          }}
          style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle, #333)', color: 'var(--text-secondary)', borderRadius: 3, fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}
        >
          {editing ? 'Save' : 'Edit'}
        </button>
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          style={{ flex: 1, background: 'var(--bg-base, #0a0a0a)', color: 'var(--text-primary)', border: 'none', fontFamily: 'monospace', fontSize: 12, padding: 12, resize: 'none', outline: 'none' }}
        />
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {nodes.map((node, i) => {
            const Tag = node.type === 'li' ? 'li' : node.type === 'code' ? 'code' : 'div';
            return <Tag key={i} style={STYLES[node.type]}>{node.type === 'li' ? `• ${node.text}` : node.text}</Tag>;
          })}
        </div>
      )}
    </div>
  );
}
