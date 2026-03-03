/**
 * Message Path Evaluator — resolve parsed paths against ROS messages
 */

import type { MessagePath, ASTNode } from './parser';
import { applyTransform } from './transforms';

/**
 * Evaluate a parsed message path against a ROS message.
 * Returns the resolved value, or undefined if any step fails.
 */
export function evaluateMessagePath(
  path: MessagePath,
  message: unknown,
  variables?: Record<string, unknown>,
): unknown {
  let current: unknown = message;

  for (const part of path.parts) {
    if (current == null) return undefined;

    switch (part.type) {
      case 'field': {
        if (typeof current !== 'object') return undefined;
        const obj = current as Record<string, unknown>;
        if (!(part.name in obj)) return undefined;
        current = obj[part.name];
        break;
      }

      case 'index': {
        if (!Array.isArray(current)) return undefined;
        let idx: number;
        if (typeof part.value === 'number') {
          idx = part.value;
        } else {
          // Variable reference
          const resolved = variables?.[part.value.variable];
          if (typeof resolved !== 'number') return undefined;
          idx = resolved;
        }
        if (idx < 0) idx += current.length;
        if (idx < 0 || idx >= current.length) return undefined;
        current = current[idx];
        break;
      }

      case 'slice': {
        if (!Array.isArray(current)) return undefined;
        current = current.slice(part.start, part.end);
        break;
      }

      case 'filter': {
        if (!Array.isArray(current)) return undefined;
        let filterVal = part.value;
        if (typeof filterVal === 'object' && 'variable' in filterVal) {
          const resolved = variables?.[filterVal.variable];
          if (resolved == null) return undefined;
          filterVal = resolved as string | number;
        }
        current = current.filter((item) => {
          if (typeof item !== 'object' || item == null) return false;
          const fieldVal = (item as Record<string, unknown>)[part.field];
          switch (part.op) {
            case '==': return fieldVal === filterVal;
            case '!=': return fieldVal !== filterVal;
            case '>': return (fieldVal as number) > (filterVal as number);
            case '<': return (fieldVal as number) < (filterVal as number);
            default: return false;
          }
        });
        // If filter returns single item, unwrap
        if (Array.isArray(current) && current.length === 1) {
          current = current[0];
        }
        break;
      }

      case 'transform': {
        current = applyTransform(part.name, current);
        break;
      }

      default:
        return undefined;
    }
  }

  return current;
}
