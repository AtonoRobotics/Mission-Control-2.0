import React, { useState, useEffect, useRef, useCallback } from 'react';
import yaml from 'js-yaml';
import type { PipelineGraphJson } from '@/stores/pipelineStore';

interface YamlEditorProps {
  graphJson: PipelineGraphJson;
  onChange: (updated: PipelineGraphJson) => void;
  readOnly?: boolean;
}

const YamlEditor: React.FC<YamlEditorProps> = ({ graphJson, onChange, readOnly }) => {
  const [text, setText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExternalUpdate = useRef(false);

  // Sync from props when graphJson changes externally
  useEffect(() => {
    try {
      isExternalUpdate.current = true;
      const dumped = yaml.dump(graphJson, { indent: 2, lineWidth: 120, noRefs: true });
      setText(dumped);
      setParseError(null);
    } catch {
      // If dump fails, leave text as-is
    }
  }, [graphJson]);

  const handleChange = useCallback(
    (value: string) => {
      setText(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        try {
          const parsed = yaml.load(value) as PipelineGraphJson;
          if (parsed && typeof parsed === 'object') {
            setParseError(null);
            onChange(parsed);
          } else {
            setParseError('Parsed result is not a valid object');
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Invalid YAML';
          setParseError(msg);
        }
      }, 500);
    },
    [onChange]
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
        style={{
          flex: 1,
          width: '100%',
          resize: 'none',
          background: '#0d0d0d',
          color: '#e0e0e0',
          caretColor: '#ffaa00',
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
          fontSize: 13,
          lineHeight: 1.6,
          padding: 16,
          border: 'none',
          outline: 'none',
          boxSizing: 'border-box',
          tabSize: 2,
          opacity: readOnly ? 0.7 : 1,
        }}
      />
      {parseError && (
        <div
          style={{
            padding: '8px 16px',
            background: '#1a0000',
            color: '#ef4444',
            fontSize: 12,
            fontFamily: 'monospace',
            borderTop: '1px solid #331111',
            whiteSpace: 'pre-wrap',
            maxHeight: 80,
            overflowY: 'auto',
          }}
        >
          {parseError}
        </div>
      )}
    </div>
  );
};

export default YamlEditor;
