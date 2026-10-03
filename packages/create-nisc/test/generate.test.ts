import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { generate } from '../src';
import type { Posture, Ui } from '../src';

// What a new app is: one of the templates (themselves checked by CI as real
// apps), named, its versions pinned to the released set, and the two documents
// a new app has — and nothing left over that only made sense in the repository.

const scratch = mkdtempSync(join(tmpdir(), 'create-nisc-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const SET = {
  '@niscorp/nisc': '0.4.0',
  '@niscorp/charter': '0.4.1',
  '@niscorp/cli': '0.4.2',
  '@niscorp/moss': '0.4.3',
  '@niscorp/nova': '0.4.4',
  '@niscorp/prism': '0.4.5',
  '@niscorp/strata': '0.4.6',
  '@niscorp/tide': '0.4.7',
  '@niscorp/vex': '0.4.8',
};

const make = (posture: Posture, ui: Ui, name = `app-${posture}-${ui}`): { dir: string; files: string[] } => {
  const dir = join(scratch, name);
  return { dir, files: generate({ dir, name, posture, ui, versions: SET, today: '2026-10-03' }) };
};

const read = (dir: string, rel: string): string => readFileSync(join(dir, rel), 'utf8');

describe('generate — every template', () => {
  const kinds: [Posture, Ui][] = [
    ['moss', 'react'],
    ['moss', 'dom'],
    ['page', 'react'],
    ['page', 'dom'],
  ];

  it.each(kinds)('%s + %s: named, pinned, documented, and nothing of the repository left in it', (posture, ui) => {
    const { dir, files } = make(posture, ui);
    const manifest: unknown = JSON.parse(read(dir, 'package.json'));
    const text = JSON.stringify(manifest);
    expect(text).toContain(`"name":"app-${posture}-${ui}"`);
    expect(text).not.toContain('workspace:');
    expect(text).toContain('"@niscorp/nova":"^0.4.4"');
    expect(text).toContain('"@niscorp/cli":"^0.4.2"');
    expect(text).toContain('"private":true');
    // the name everywhere it shows, and the template's name nowhere
    expect(read(dir, 'index.html')).toContain(`<title>app-${posture}-${ui}</title>`);
    expect(read(dir, 'src/app/actions/surfaces/welcome.action.ts')).toContain(`name: 'app-${posture}-${ui}'`);
    for (const file of files) {
      if (!file.endsWith('.png')) expect(read(dir, file), file).not.toContain('nisc-template-');
    }
    // what only a new app has
    expect(files).toEqual(expect.arrayContaining(['AGENTS.md', 'PLAN.md', '.gitignore', 'nisc.config.ts']));
    expect(read(dir, 'AGENTS.md')).toContain('node_modules/@niscorp/nisc/AGENTS.md');
    expect(read(dir, 'PLAN.md')).toContain('on nisc 0.4.0');
    // what never comes along
    expect(files.some((file) => file.startsWith('node_modules') || file.startsWith('dist/'))).toBe(false);
  });

  it('PLAN.md says which posture was chosen, with its consequences, and leaves the rest open', () => {
    const moss = read(make('moss', 'react', 'plan-moss').dir, 'PLAN.md');
    expect(moss).toContain('| D1 Posture | answered | **A moss server app.**');
    expect(moss).toContain('| D3 Reads | **open** |');
    expect(moss).toContain('| D4 Writes | **open** |');
    const page = read(make('page', 'dom', 'plan-page').dir, 'PLAN.md');
    expect(page).toContain('**the charter is not enforcement here.**');
    expect(page).toContain('| D2 Environment | **open** |');
    expect(page).toContain('plain DOM');
  });
});

describe('generate — what it refuses', () => {
  it('a directory that already holds something', () => {
    const dir = join(scratch, 'taken');
    mkdirSync(dir);
    writeFileSync(join(dir, 'keep.txt'), 'mine');
    expect(() => generate({ dir, name: 'taken', posture: 'moss', ui: 'react', versions: SET, today: '2026-10-03' })).toThrow(/not empty/);
    expect(read(dir, 'keep.txt')).toBe('mine');
  });

  it('a name npm would not take', () => {
    const dir = join(scratch, 'Bad Name');
    expect(() => generate({ dir, name: 'Bad Name', posture: 'moss', ui: 'react', versions: SET, today: '2026-10-03' })).toThrow(/not a package name/);
  });

  it('a release set that is missing a package the template needs — never a guess', () => {
    const dir = join(scratch, 'short-set');
    const { '@niscorp/vex': _gone, ...short } = SET;
    expect(() => generate({ dir, name: 'short-set', posture: 'moss', ui: 'react', versions: short, today: '2026-10-03' })).toThrow(/no @niscorp\/vex/);
    expect(existsSync(join(dir, 'PLAN.md'))).toBe(false);
  });
});
