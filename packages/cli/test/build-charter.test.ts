import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NISC } from './nisc';

const MOSS_ROUTES = join(import.meta.dirname, 'fixtures', 'moss-routes');
const SLOW = 60_000;
const HEADING = 'nisc: the charter has what it does not read as written — the app runs, and what it lists does not apply:';

const build = (env: Record<string, string> = {}): { code: number | null; out: string } => {
  const result = spawnSync(process.execPath, [...NISC, 'build', '--skip-bundle', '--root', MOSS_ROUTES], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: result.status, out: result.stdout };
};

describe('nisc build — what the charter does not read is said after the route table', () => {
  it('a misspelt key is named under the charter heading, and the build still passes', () => {
    const { code, out } = build({ NISC_FIXTURE_CHARTER: 'misspelt' });
    const table = out.indexOf('●  server');
    const heading = out.indexOf(HEADING);
    expect(table).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(table);
    expect(out.slice(heading)).toContain('\n  role "public" has the key "denny", which the charter does not read: what it lists does not apply');
    expect(code).toBe(0);
  }, SLOW);

  it('a charter that reads every key says nothing', () => {
    const { code, out } = build();
    expect(out).not.toContain(HEADING);
    expect(code).toBe(0);
  }, SLOW);
});
