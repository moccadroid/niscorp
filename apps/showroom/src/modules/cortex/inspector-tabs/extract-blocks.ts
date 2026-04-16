// ═══════════════════════════════════════════════════════════
// extract-blocks — utilities for slicing `defineTool({...})`,
// `defineRule({...})`, etc. out of TypeScript source.
//
// Used by the Tools and Rules inspector tabs to show LIVE code
// from the demo/agent files (no hand-written facsimiles).
// ═══════════════════════════════════════════════════════════

export type ExtractedBlock = {
  id: string | undefined;  // the `id: '...'` value inside the call, if present
  source: string;          // full block text including the statement prefix
};

// Find the position of the matching `)` for the `(` at `openParen`,
// skipping over strings, template literals, and comments. Returns -1
// if no match.
const findMatchingCloseParen = (source: string, openParen: number): number => {
  let depth = 0;
  let inString: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let i = openParen;
  while (i < source.length) {
    const c = source[i];
    const c2 = source[i + 1];
    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && c2 === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inString !== null) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === inString) inString = null;
      i++;
      continue;
    }
    if (c === '/' && c2 === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === '/' && c2 === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = c;
      i++;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
};

// Find all `callName({...})` invocations in `source`. For each, capture
// the enclosing statement (including any `const X = ` / `export const X = `
// prefix on the same line) and extract the block's `id: '...'` field.
export const extractCalls = (source: string, callName: string): ExtractedBlock[] => {
  const results: ExtractedBlock[] = [];
  const re = new RegExp(`\\b${callName}\\s*\\(`, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const openParen = match.index + match[0].length - 1;
    const closeParen = findMatchingCloseParen(source, openParen);
    if (closeParen === -1) continue;

    // Include the full statement: walk back to the previous newline
    // so `export const xTool = defineTool(` is captured too.
    const lineStart = source.lastIndexOf('\n', match.index - 1) + 1;
    // Skip trailing `;` when present.
    const afterClose = closeParen + 1;
    const stopAt = source[afterClose] === ';' ? afterClose + 1 : afterClose;

    const blockText = source.slice(lineStart, stopAt);
    const idMatch = /\bid\s*:\s*['"`]([^'"`]+)['"`]/.exec(blockText);
    results.push({ id: idMatch?.[1], source: blockText });
  }
  return results;
};
