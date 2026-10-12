const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toRegExp = (pattern: string): RegExp => new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);

export const matchGlob = (pattern: string, id: string): boolean => toRegExp(pattern).test(id);

export const matchAll = (patterns: readonly string[], ids: readonly string[]): Set<string> => {
  const out = new Set<string>();
  for (const pattern of patterns) {
    const re = toRegExp(pattern);
    for (const id of ids) if (re.test(id)) out.add(id);
  }
  return out;
};
