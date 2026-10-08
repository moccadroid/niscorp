// JSON SET OUT TO BE READ ON A SLIDE: a list or an object that fits the line
// stays on one line, spaced — `{ "name": "" }`, `[ "questions", "members" ]`
// — and one that does not opens over indented lines, each of them held to the
// same measure; so a document is a dozen lines rather than forty and fits its
// pane. An object with one key that does not fit keeps its key on the opening
// line — `{ "$map": {` … `} }` — so a document of wrappers (a mapping) is not
// a staircase. The words are the document's; only the whitespace is chosen. Used for
// the documents the slides show as written (vex.actions.ts) and for the
// drafts a trace keeps (server/generation/trace.ts). `glance` is how long a
// line may be: the default fits half a slide; a pane with the width asks for more.
const GLANCE = 56;
const INDENT = '  ';

const inline = (value: unknown): string => {
  if (Array.isArray(value)) return value.length === 0 ? '[]' : `[ ${value.map(inline).join(', ')} ]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value);
    return entries.length === 0 ? '{}' : `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${inline(item)}`).join(', ')} }`;
  }
  return JSON.stringify(value) ?? '';
};

// `used` is what already sits on the line before this value.
const lay = (value: unknown, depth: number, used: number, glance: number): string => {
  const flat = inline(value);
  if (typeof value !== 'object' || value === null || used + flat.length <= glance) return flat;
  const pad = INDENT.repeat(depth + 1);
  const close = INDENT.repeat(depth);
  if (Array.isArray(value)) return `[\n${value.map((item) => pad + lay(item, depth + 1, pad.length, glance)).join(',\n')}\n${close}]`;
  const entries = Object.entries(value);
  const only = entries.length === 1 ? entries[0] : undefined;
  if (only !== undefined && typeof only[1] === 'object' && only[1] !== null) {
    const lead = `{ ${JSON.stringify(only[0])}: `;
    return `${lead}${lay(only[1], depth, used + lead.length, glance)} }`;
  }
  const lines = entries.map(([key, item]) => {
    const lead = `${pad}${JSON.stringify(key)}: `;
    return lead + lay(item, depth + 1, lead.length, glance);
  });
  return `{\n${lines.join(',\n')}\n${close}}`;
};

export const compactJson = (value: unknown, glance = GLANCE): string => lay(value, 0, 0, glance);
