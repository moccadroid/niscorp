import type { Migration } from './schema';

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
  const steps = migration.steps.map((step) => (step.kind === 'sql' ? { ...step, sql: effectOf(step.sql) } : step));
  const bytes = new TextEncoder().encode(canonical(steps));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};
