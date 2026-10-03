import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { generate } from '../src';
import type { Created, Posture, Ui } from '../src';

// What a new app is: one of the templates (themselves checked by CI as real
// apps), named, its versions pinned to a release set, and the two documents a
// new app has — nothing left over that only made sense in the repository, and
// nothing of anybody's overwritten.

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

const make = (posture: Posture, ui: Ui, name = `app-${posture}-${ui}`): { dir: string; made: Created } => {
  const dir = join(scratch, name);
  return { dir, made: generate({ dir, name, posture, ui, versions: SET, today: '2026-10-03' }) };
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
    const { dir, made } = make(posture, ui);
    const text = JSON.stringify(JSON.parse(read(dir, 'package.json')));
    expect(text).toContain(`"name":"app-${posture}-${ui}"`);
    expect(text).not.toContain('workspace:');
    expect(text).toContain('"@niscorp/nova":"^0.4.4"');
    expect(text).toContain('"@niscorp/cli":"^0.4.2"');
    expect(text).toContain('"private":true');
    // the rulebook its AGENTS.md points at is something it installs
    expect(text).toContain('"@niscorp/nisc":"^0.4.0"');
    expect(read(dir, 'AGENTS.md')).toContain('node_modules/@niscorp/nisc/AGENTS.md');
    // the name everywhere it shows, and the template's name nowhere
    expect(read(dir, 'index.html')).toContain(`<title>app-${posture}-${ui}</title>`);
    expect(read(dir, 'README.md')).toContain(`# app-${posture}-${ui}`);
    expect(read(dir, 'src/app/actions/surfaces/welcome.action.ts')).toContain(`name: 'app-${posture}-${ui}'`);
    for (const file of made.files) expect(read(dir, file), file).not.toContain('nisc-template-');
    // what the rulebook asks of every app
    expect(made.files).toEqual(
      expect.arrayContaining(['AGENTS.md', 'PLAN.md', '.gitignore', 'nisc.config.ts', 'strata.lock.json', 'src/dev/strata.ts', 'src/dev/artifacts-check.ts', 'src/dev/all-checks.ts']),
    );
    expect(read(dir, 'PLAN.md')).toContain('on nisc 0.4.0');
    expect(read(dir, '.gitignore')).toContain('node_modules/');
    // what never comes along
    expect(made.files.some((file) => file.startsWith('node_modules') || file.startsWith('dist/') || file.startsWith('out/'))).toBe(false);
    expect(made.kept).toEqual([]);
    expect(made.extended).toEqual([]);
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

describe('generate — a folder that already holds something', () => {
  it('a fresh repository (.git, a LICENSE) is fine: nothing of it is touched', () => {
    const dir = join(scratch, 'fresh-repo');
    mkdirSync(join(dir, '.git'), { recursive: true });
    writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(dir, 'LICENSE'), 'mine');
    const made = generate({ dir, name: 'fresh-repo', posture: 'page', ui: 'dom', versions: SET, today: '2026-10-03' });
    expect(made.files).toContain('package.json');
    expect(read(dir, 'LICENSE')).toBe('mine');
    expect(read(dir, '.git/HEAD')).toBe('ref: refs/heads/main\n');
  });

  it('their README is kept, and their .gitignore is added to rather than replaced', () => {
    const dir = join(scratch, 'has-readme');
    mkdirSync(dir);
    writeFileSync(join(dir, 'README.md'), '# theirs\n');
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n.idea/');
    const made = generate({ dir, name: 'has-readme', posture: 'moss', ui: 'react', versions: SET, today: '2026-10-03' });
    expect(made.kept).toEqual(['README.md']);
    expect(made.extended).toEqual(['.gitignore']);
    expect(read(dir, 'README.md')).toBe('# theirs\n');
    const ignore = read(dir, '.gitignore').split('\n');
    expect(ignore.slice(0, 2)).toEqual(['node_modules/', '.idea/']);
    expect(ignore.filter((line) => line === 'node_modules/')).toHaveLength(1);
    expect(ignore).toContain('dist/');
    expect(made.files).not.toContain('README.md');
  });

  it('a file a new app would write is already there: nothing is written, and it says which', () => {
    const dir = join(scratch, 'taken');
    mkdirSync(dir);
    writeFileSync(join(dir, 'package.json'), '{"name":"mine"}');
    writeFileSync(join(dir, 'PLAN.md'), 'my plan');
    expect(() => generate({ dir, name: 'taken', posture: 'moss', ui: 'react', versions: SET, today: '2026-10-03' })).toThrow(/already has files a new app would write — nothing was written:\n {2}PLAN\.md\n {2}package\.json/);
    expect(read(dir, 'package.json')).toBe('{"name":"mine"}');
    expect(read(dir, 'PLAN.md')).toBe('my plan');
    expect(readdirSync(dir).sort()).toEqual(['PLAN.md', 'package.json']);
  });
});

describe('generate — what it refuses, before writing anything', () => {
  it('a name npm would not take', () => {
    const dir = join(scratch, 'Bad Name');
    expect(() => generate({ dir, name: 'Bad Name', posture: 'moss', ui: 'react', versions: SET, today: '2026-10-03' })).toThrow(/not a package name/);
    expect(existsSync(dir)).toBe(false);
  });

  it('a release set that is missing a package the template needs — never a guess, and no half-made app', () => {
    const dir = join(scratch, 'short-set');
    const { '@niscorp/vex': _gone, ...short } = SET;
    expect(() => generate({ dir, name: 'short-set', posture: 'moss', ui: 'react', versions: short, today: '2026-10-03' })).toThrow(/no @niscorp\/vex/);
    expect(existsSync(dir)).toBe(false);
  });
});
