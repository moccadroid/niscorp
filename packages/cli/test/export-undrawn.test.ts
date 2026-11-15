import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NISC } from './nisc';

const MOSS_ROUTES = join(import.meta.dirname, 'fixtures', 'moss-routes');
const SLOW = 60_000;

let scratch = '';
let app = '';

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'nisc-undrawn-'));
  app = join(scratch, 'app');
  cpSync(join(MOSS_ROUTES, 'built'), join(app, 'built'), { recursive: true });
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'nisc-fixture-undrawn', private: true, type: 'module' }));
  writeFileSync(
    join(app, 'nisc.config.ts'),
    `import { project as drawn } from ${JSON.stringify(pathToFileURL(join(MOSS_ROUTES, 'nisc.config.ts')).href)};\nexport const project = { ...drawn, draw: () => { throw new Error('this draw fails'); } };\n`,
  );
});

afterEach(() => rmSync(scratch, { recursive: true, force: true }));

const exportWith = (args: readonly string[], env: Record<string, string> = {}): { code: number | null; out: string } => {
  const result = spawnSync(process.execPath, [...NISC, 'export', '--skip-bundle', '--root', app, '--out', join(scratch, 'site'), ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: result.status, out: `${result.stdout}\n${result.stderr}` };
};

describe('nisc export — a path that could not be drawn is said apart from one that wants a server', () => {
  it('without --allow-live: it is named as not drawn, and --allow-live is not offered for it', () => {
    const { code, out } = exportWith([]);
    expect(out).toContain('nisc: 1 of 1 paths could not be drawn (see the table): it would go out as the template, empty until its terminal connects (/).');
    expect(out).not.toContain('cannot be a file alone');
    expect(out).not.toContain('--allow-live');
    expect(code).toBe(1);
  }, SLOW);

  it('a drawn path that wants a server is named as before, with --allow-live offered', () => {
    writeFileSync(join(app, 'nisc.config.ts'), `export { project } from ${JSON.stringify(pathToFileURL(join(MOSS_ROUTES, 'nisc.config.ts')).href)};\n`);
    const { code, out } = exportWith([], { NISC_FIXTURE_LIVE: '1' });
    expect(out).toContain('nisc: 1 of 1 paths cannot be a file alone (/).\n      Nothing was written. With a server beside the files they still work: `nisc export --allow-live`.');
    expect(out).not.toContain('could not be drawn');
    expect(code).toBe(1);
  }, SLOW);

  it('with --allow-live: it is written as today, and the command says it was written undrawn', () => {
    const { code, out } = exportWith(['--allow-live']);
    expect(out).toContain('nisc: / could not be drawn — written as the template; it shows nothing until its terminal connects.');
    expect(code).toBe(0);
  }, SLOW);
});
