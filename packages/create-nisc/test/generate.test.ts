import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { completed, generate, readCatalog, TEMPLATES } from '../src';
import type { Created, Picks } from '../src';

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
  '@niscorp/signal': '0.4.9',
  '@niscorp/cortex': '0.4.10',
};
const TODAY = '2026-10-03';

const catalog = readCatalog(TEMPLATES);
const read = (dir: string, rel: string): string => readFileSync(join(dir, rel), 'utf8');

// Every app the questions can make: one answer to each, as long as every requirement holds.
const everyApp = (): Picks[] =>
  catalog.questions.reduce<Picks[]>(
    (apps, question) =>
      apps.flatMap((picks) =>
        catalog.items
          .filter((item) => item.answers === question.id)
          .map((item) => ({ ...picks, [question.id]: item.id }))
      ),
    [{}],
  ).filter((picks) => catalog.items.every((item) => !Object.values(picks).includes(item.id) || Object.entries(item.requires ?? {}).every(([question, wanted]) => picks[question] === wanted)));

const make = (picks: Picks, name: string, extra: Partial<Parameters<typeof generate>[0]> = {}): { dir: string; made: Created } => {
  const dir = join(scratch, name);
  return { dir, made: generate({ dir, name, picks, versions: SET, today: TODAY, ...extra }) };
};

describe('generate — every app the questions can make', () => {
  const apps = everyApp();

  it('the questions can make the four apps there always were', () => {
    const named = apps.map((picks) => catalog.questions.map((question) => picks[question.id]).join('+'));
    expect(named).toEqual(expect.arrayContaining(['classic+moss+react', 'classic+moss+dom', 'classic+page+react', 'classic+page+dom']));
  });

  it.each(apps.map((picks) => [Object.values(picks).join('-'), picks] as const))('%s: named, pinned, documented, and nothing of the repository left in it', (label, picks) => {
    const name = `app-${label}`;
    const { dir, made } = make(picks, name);
    const manifest = JSON.parse(read(dir, 'package.json')) as Record<string, unknown>;
    const text = JSON.stringify(manifest);
    expect(Object.keys(manifest).slice(0, 2)).toEqual(['name', 'private']);
    expect(manifest['name']).toBe(name);
    expect(text).not.toContain('workspace:');
    expect(text).toContain('"@niscorp/nova":"^0.4.4"');
    expect(text).toContain('"@niscorp/nisc":"^0.4.0"');
    expect(read(dir, 'AGENTS.md')).toContain('node_modules/@niscorp/nisc/AGENTS.md');
    expect(read(dir, 'index.html')).toContain(`<title>${name}</title>`);
    expect(read(dir, 'README.md')).toContain(`# ${name}`);
    for (const file of made.files) expect(read(dir, file), file).not.toContain('nisc-template-');
    expect(made.files).toEqual(expect.arrayContaining(['AGENTS.md', 'PLAN.md', '.gitignore', 'nisc.config.ts', 'strata.lock.json', 'src/dev/strata.ts', 'src/dev/all-checks.ts']));
    expect(read(dir, 'PLAN.md')).toContain('on nisc 0.4.0');
    expect(made.files.some((file) => file.startsWith('node_modules') || file.startsWith('dist/') || file.startsWith('out/'))).toBe(false);
  });

  it('PLAN.md says what was chosen, with its consequences, its decisions in order, and leaves the rest open', () => {
    const moss = read(make(completed(catalog, { shell: 'moss', kit: 'react' }), 'plan-moss').dir, 'PLAN.md');
    expect(moss).toContain('| D1 Posture | answered | **A moss server app.**');
    expect(moss.indexOf('| D2 ')).toBeLessThan(moss.indexOf('| D3 '));
    expect(moss.indexOf('| D4 ')).toBeLessThan(moss.indexOf('| D5 '));
    const page = read(make(completed(catalog, { shell: 'page', kit: 'dom' }), 'plan-page').dir, 'PLAN.md');
    expect(page).toContain('**the charter is not enforcement here.**');
    expect(page).toContain('| D2 Environment | **open** |');
    expect(page).toContain('plain DOM');
  });

  it('inside the nisc repository it depends on the packages next door', () => {
    const { dir } = make(completed(catalog, {}), 'in-workspace', { workspace: true });
    expect(read(dir, 'package.json')).toContain('"@niscorp/nova": "workspace:^"');
  });

  it('the defaults are a classic app behind moss, drawn with React', () => {
    expect(completed(catalog, {})).toEqual({ kind: 'classic', shell: 'moss', kit: 'react' });
  });
});

describe('generate — a folder that already holds something', () => {
  it('a fresh repository (.git, a LICENSE) is fine: nothing of it is touched', () => {
    const dir = join(scratch, 'fresh-repo');
    mkdirSync(join(dir, '.git'), { recursive: true });
    writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(dir, 'LICENSE'), 'mine');
    const made = generate({ dir, name: 'fresh-repo', picks: completed(catalog, { shell: 'page', kit: 'dom' }), versions: SET, today: TODAY });
    expect(made.files).toContain('package.json');
    expect(read(dir, 'LICENSE')).toBe('mine');
    expect(read(dir, '.git/HEAD')).toBe('ref: refs/heads/main\n');
  });

  it('their README is kept, and their .gitignore is added to rather than replaced', () => {
    const dir = join(scratch, 'has-readme');
    mkdirSync(dir);
    writeFileSync(join(dir, 'README.md'), '# theirs\n');
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n.idea/');
    const made = generate({ dir, name: 'has-readme', picks: completed(catalog, {}), versions: SET, today: TODAY });
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
    expect(() => generate({ dir, name: 'taken', picks: completed(catalog, {}), versions: SET, today: TODAY })).toThrow(/already has files a new app would write — nothing was written:\n {2}PLAN\.md\n {2}package\.json/);
    expect(read(dir, 'package.json')).toBe('{"name":"mine"}');
    expect(read(dir, 'PLAN.md')).toBe('my plan');
    expect(readdirSync(dir).sort()).toEqual(['PLAN.md', 'package.json']);
  });
});

describe('generate — what it refuses, before writing anything', () => {
  it('a name npm would not take', () => {
    const dir = join(scratch, 'Bad Name');
    expect(() => generate({ dir, name: 'Bad Name', picks: completed(catalog, {}), versions: SET, today: TODAY })).toThrow(/not a package name/);
    expect(existsSync(dir)).toBe(false);
  });

  it('a release set that is missing a package an item needs — never a guess, and no half-made app', () => {
    const dir = join(scratch, 'short-set');
    const { '@niscorp/vex': _gone, ...short } = SET;
    expect(() => generate({ dir, name: 'short-set', picks: completed(catalog, {}), versions: short, today: TODAY })).toThrow(/no @niscorp\/vex/);
    expect(existsSync(dir)).toBe(false);
  });

  it('a question left unanswered', () => {
    expect(() => generate({ dir: join(scratch, 'half'), name: 'half', picks: { shell: 'moss' }, versions: SET, today: TODAY })).toThrow(/has no answer/);
  });
});

// A catalog of its own, to hold the rules every item is read by.
describe('items — how a catalog is put together', () => {
  const root = join(scratch, 'catalog');
  const put = (rel: string, content: unknown): void => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), typeof content === 'string' ? content : JSON.stringify(content));
  };
  put('questions.json', [{ id: 'shape', message: 'Which shape?' }, { id: 'colour', message: 'Which colour?' }]);
  put('always/item.json', { id: 'always', package: { private: true, devDependencies: { tsx: '^4' } } });
  put('always/files/README.md', '# nisc-template-app\n');
  put('square/item.json', { id: 'square', answers: 'shape', label: 'Square', default: true, package: { scripts: { dev: 'square' } } });
  put('square/files/shape.txt', 'square');
  put('round/item.json', {
    id: 'round',
    answers: 'shape',
    label: 'Round',
    requires: { colour: 'red' },
    package: { scripts: { dev: 'round' } },
    env: [
      { name: 'ROUND_KEY', message: 'The round key', required: true },
      { choose: 'GLAZE', message: 'A glaze?', options: [{ value: 'matte', label: 'Matte', keys: [{ name: 'MATTE_KEY', message: 'The matte key' }] }, { value: 'none', label: 'None' }] },
    ],
  });
  put('round/files/shape.txt', 'round');
  put('red/item.json', { id: 'red', answers: 'colour', label: 'Red', default: true, package: { dependencies: { zod: '^4' } } });
  put('red/with/round/red-round.txt', 'only red and round');
  put('blue/item.json', { id: 'blue', answers: 'colour', label: 'Blue' });

  const at = (name: string): string => join(scratch, 'from-catalog', name);
  const build = (name: string, picks: Picks, env?: Record<string, string>): Created =>
    generate({ dir: at(name), name, picks, versions: SET, today: TODAY, templates: root, ...(env !== undefined ? { env } : {}) });

  it('an item’s files, its files for another item only beside that item, and the package fragments merged in one manifest', () => {
    const square = build('square-red', { shape: 'square', colour: 'red' });
    expect(square.files).not.toContain('red-round.txt');
    const round = build('round-red', { shape: 'round', colour: 'red' });
    expect(round.files).toContain('red-round.txt');
    expect(read(at('round-red'), 'shape.txt')).toBe('round');
    expect(read(at('round-red'), 'README.md')).toBe('# round-red\n');
    expect(JSON.parse(read(at('round-red'), 'package.json'))).toEqual({ name: 'round-red', private: true, scripts: { dev: 'round' }, dependencies: { zod: '^4' }, devDependencies: { tsx: '^4' } });
  });

  it('a requirement holds: round is red, so blue and round together is refused', () => {
    expect(() => build('round-blue', { shape: 'round', colour: 'blue' })).toThrow(/"round" needs "red"/);
    expect(completed(readCatalog(root), { shape: 'round' })).toEqual({ shape: 'round', colour: 'red' });
  });

  it('the keys an item asks for: .env holds what was given, .env.example the names alone, a choice its value in both', () => {
    build('keys', { shape: 'round', colour: 'red' }, { ROUND_KEY: 'r-123', GLAZE: 'matte', MATTE_KEY: ' m-9 ' });
    expect(read(at('keys'), '.env')).toBe('# The round key (required)\nROUND_KEY=r-123\n# A glaze? (matte | none)\nGLAZE=matte\n# The matte key\nMATTE_KEY=m-9\n');
    expect(read(at('keys'), '.env.example')).toBe('# The round key (required)\nROUND_KEY=\n# A glaze? (matte | none)\nGLAZE=matte\n# The matte key\nMATTE_KEY=\n');
  });

  it('an .env that is there keeps what it holds and gains what it lacks', () => {
    mkdirSync(at('kept-env'), { recursive: true });
    writeFileSync(join(at('kept-env'), '.env'), 'ROUND_KEY=mine\n');
    const made = build('kept-env', { shape: 'round', colour: 'red' }, { ROUND_KEY: 'theirs', GLAZE: 'none' });
    expect(made.extended).toContain('.env');
    expect(read(at('kept-env'), '.env')).toBe('ROUND_KEY=mine\nGLAZE=none\n');
  });

  it('two items writing one file is a mistake in the templates, said before anything is written', () => {
    put('blue/with/round/shape.txt', 'blue');
    put('round/item.json', { id: 'round', answers: 'shape', label: 'Round' });
    expect(() => build('clash', { shape: 'round', colour: 'blue' })).toThrow(/shape\.txt is written by both "round" and "blue"/);
    expect(existsSync(at('clash'))).toBe(false);
  });
});
