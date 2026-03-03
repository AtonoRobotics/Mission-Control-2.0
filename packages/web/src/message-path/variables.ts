/**
 * Layout Variable Resolution — resolve $variable references from layoutStore
 */

import { useMemo, useCallback } from 'react';
import { useLayoutStore } from '@/stores/layoutStore';
import { parseMessagePath, type MessagePath } from './parser';
import { evaluateMessagePath } from './evaluator';

/**
 * Resolve a message path string against a message, using layout variables.
 * Convenience function combining parse + evaluate + variable resolution.
 */
export function resolveMessagePath(pathStr: string, message: unknown): unknown {
  const path = parseMessagePath(pathStr);
  const variables = useLayoutStore.getState().variables;
  return evaluateMessagePath(path, message, variables as Record<string, unknown>);
}

/**
 * React hook: parse a path string and return a stable evaluator function.
 * Re-parses only when pathStr changes.
 */
export function useMessagePath(pathStr: string): {
  path: MessagePath | null;
  evaluate: (message: unknown) => unknown;
} {
  const path = useMemo<MessagePath | null>(() => {
    if (!pathStr) return null;
    try {
      return parseMessagePath(pathStr);
    } catch {
      return null;
    }
  }, [pathStr]);

  const evaluate = useCallback(
    (message: unknown): unknown => {
      if (!path) return undefined;
      const variables = useLayoutStore.getState().variables;
      return evaluateMessagePath(path, message, variables as Record<string, unknown>);
    },
    [path],
  );

  return { path, evaluate };
}

/**
 * Resolve a field path against a message. Supports both:
 * - Simple dot paths: "linear.x" (legacy)
 * - Full message path syntax: "position[0].@degrees" (new)
 *
 * If the field starts with '/' it's treated as a full message path.
 * Otherwise it's treated as a field-only path (topic omitted).
 */
export function resolveField(message: unknown, fieldPath: string, variables?: Record<string, unknown>): unknown {
  if (!fieldPath || message == null) return undefined;

  // Build a synthetic full path to leverage the parser
  const fullPath = fieldPath.includes('[') || fieldPath.includes('@') || fieldPath.includes('{') || fieldPath.includes('$')
    ? `/_synthetic.${fieldPath}`
    : `/_synthetic.${fieldPath}`;

  try {
    const path = parseMessagePath(fullPath);
    const vars = variables ?? useLayoutStore.getState().variables as Record<string, unknown>;
    return evaluateMessagePath(path, message, vars);
  } catch {
    // Fallback to simple dot-path resolution
    const parts = fieldPath.split('.');
    let cur: unknown = message;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
  }
}
