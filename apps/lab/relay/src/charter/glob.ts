// One wildcard rule, no more: `*` matches any run of characters, including
// dots — `crm.*` matches `crm.deal.form`. No `**`, no braces, no regex. The
// day a pattern cannot be expressed, the answer is a better id, not a
// richer glob.
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toRegExp = (pattern: string): RegExp => new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);

export const matchGlob = (pattern: string, id: string): boolean => toRegExp(pattern).test(id);

// Every id the pattern list selects out of `ids`.
export const matchAll = (patterns: readonly string[], ids: readonly string[]): Set<string> => {
  const out = new Set<string>();
  for (const pattern of patterns) {
    const re = toRegExp(pattern);
    for (const id of ids) if (re.test(id)) out.add(id);
  }
  return out;
};
