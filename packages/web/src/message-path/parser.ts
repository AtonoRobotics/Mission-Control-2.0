/**
 * Message Path Parser — lexer + recursive descent parser
 * Syntax: /topic.field.subfield[0]{filter==val}.@transform
 */

// ── AST Types ────────────────────────────────────────────────────────────────

export type ASTNode =
  | { type: 'field'; name: string }
  | { type: 'index'; value: number | { variable: string } }
  | { type: 'slice'; start: number; end: number }
  | { type: 'filter'; field: string; op: '==' | '!=' | '>' | '<'; value: string | number | { variable: string } }
  | { type: 'transform'; name: string };

export interface MessagePath {
  topic: string;
  parts: ASTNode[];
}

// ── Parser ───────────────────────────────────────────────────────────────────

export function parseMessagePath(input: string): MessagePath {
  let pos = 0;

  function peek(): string { return input[pos] ?? ''; }
  function advance(): string { return input[pos++] ?? ''; }
  function match(ch: string): boolean {
    if (peek() === ch) { pos++; return true; }
    return false;
  }

  // Read identifier chars (alphanumeric + underscore)
  function readIdent(): string {
    let s = '';
    while (pos < input.length && /[\w]/.test(input[pos])) s += advance();
    return s;
  }

  // Read an integer (possibly negative)
  function readInt(): number {
    let s = '';
    if (peek() === '-') s += advance();
    while (pos < input.length && /\d/.test(input[pos])) s += advance();
    return parseInt(s, 10);
  }

  // Parse topic: /some/topic/name (everything up to first . [ { or end)
  function parseTopic(): string {
    if (peek() !== '/') throw new Error(`Expected '/' at position ${pos}`);
    let topic = '';
    while (pos < input.length && !['.', '[', '{'].includes(input[pos])) {
      topic += advance();
    }
    return topic;
  }

  // Parse parts after topic
  function parseParts(): ASTNode[] {
    const parts: ASTNode[] = [];

    while (pos < input.length) {
      if (match('.')) {
        // Transform: .@name
        if (peek() === '@') {
          advance(); // skip @
          parts.push({ type: 'transform', name: readIdent() });
        } else {
          // Field access
          parts.push({ type: 'field', name: readIdent() });
        }
      } else if (match('[')) {
        // Variable index: [$varName]
        if (peek() === '$') {
          advance(); // skip $
          const varName = readIdent();
          parts.push({ type: 'index', value: { variable: varName } });
          match(']');
        } else {
          // Numeric index or slice
          const start = readInt();
          if (peek() === ':') {
            advance(); // skip :
            const end = readInt();
            parts.push({ type: 'slice', start, end });
          } else {
            parts.push({ type: 'index', value: start });
          }
          match(']');
        }
      } else if (match('{')) {
        // Filter: {field==value} or {field==$var}
        const field = readIdent();
        let op: '==' | '!=' | '>' | '<' = '==';
        if (input[pos] === '=' && input[pos + 1] === '=') { op = '=='; pos += 2; }
        else if (input[pos] === '!' && input[pos + 1] === '=') { op = '!='; pos += 2; }
        else if (input[pos] === '>') { op = '>'; pos++; }
        else if (input[pos] === '<') { op = '<'; pos++; }

        let value: string | number | { variable: string };
        // Skip optional quotes
        if (peek() === '"') {
          advance();
          let s = '';
          while (pos < input.length && input[pos] !== '"') s += advance();
          match('"');
          value = s;
        } else if (peek() === '$') {
          advance();
          value = { variable: readIdent() };
        } else if (/[-\d]/.test(peek())) {
          value = readInt();
        } else {
          value = readIdent();
        }
        parts.push({ type: 'filter', field, op, value });
        match('}');
      } else {
        // Unknown char — skip
        advance();
      }
    }

    return parts;
  }

  const topic = parseTopic();
  const parts = parseParts();

  return { topic, parts };
}
