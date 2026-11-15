// Not a regular expression: one made from a pattern with many stars backtracks for as long as the id allows.
export const matchGlob = (pattern: string, id: string): boolean => {
  const parts = pattern.split('*');
  const first = parts[0] ?? '';
  if (parts.length === 1) return id === first;
  const last = parts[parts.length - 1] ?? '';
  if (id.length < first.length + last.length || !id.startsWith(first) || !id.endsWith(last)) return false;
  const middle = id.slice(first.length, id.length - last.length);
  let at = 0;
  for (const part of parts.slice(1, -1)) {
    const found = middle.indexOf(part, at);
    if (found < 0) return false;
    at = found + part.length;
  }
  return true;
};

export const matchAll = (patterns: readonly string[], ids: readonly string[]): Set<string> => {
  const out = new Set<string>();
  for (const pattern of patterns) for (const id of ids) if (matchGlob(pattern, id)) out.add(id);
  return out;
};
