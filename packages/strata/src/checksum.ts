import type { Migration } from './schema';

// ═══════════════════════════════════════════════════════════════
// What a migration DID, as a hash — the ledger's proof that the code still says
// what the database ran.
//
// Over the steps only. The description is prose: fixing a typo in it must not
// read as an edited migration. `dependsOn` orders, it does not act. The steps
// are the effect, and changing an applied step is the one thing that has to
// be refused — the database already holds the old effect.
//
// For the same reason a step's SQL is hashed without its full-line comments
// (`-- …` on a line of its own) and without trailing whitespace: a migration
// can carry its documentation verbatim, and rewording it is not an edit.
//
// WebCrypto (SHA-256), which Node ≥ 22 and every browser carry as
// `crypto.subtle` — the same primitive Prism fingerprints with, so strata runs
// unchanged in a server, a test and the showroom page.
// ═══════════════════════════════════════════════════════════════

// Sorted keys, recursively: the same value always serializes the same way,
// whatever order its object literal was written in.
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const effectOf = (sql: string): string =>
  sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

export const checksumOf = async (migration: Migration): Promise<string> => {
  const steps = migration.steps.map((step) => ({ ...step, sql: effectOf(step.sql) }));
  const bytes = new TextEncoder().encode(canonical(steps));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};
