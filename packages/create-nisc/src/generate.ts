import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentsDoc, gitignoreLines, planDoc } from './docs';

export type Posture = 'moss' | 'page';
export type Ui = 'react' | 'dom';

export type CreateOptions = {
  dir: string;
  name: string;
  posture: Posture;
  ui: Ui;
  versions: Readonly<Record<string, string>>;
  // YYYY-MM-DD
  today: string;
};

export type Created = {
  files: string[];
  kept: string[];
  extended: string[];
};

export const TEMPLATES = fileURLToPath(new URL('../templates', import.meta.url));

export const templateOf = (posture: Posture, ui: Ui): string => `${posture === 'moss' ? 'moss' : 'shell'}-${ui}`;

const tokenOf = (template: string): string => `nisc-template-${template}`;

const SKIP = new Set(['node_modules', 'dist', 'out', '.turbo']);
const TEXT = new Set(['.ts', '.tsx', '.json', '.html', '.css', '.md']);
const KEEP_THEIRS = new Set(['README.md']);

// npm's rule for a package name.
export const validName = (name: string): boolean => /^[a-z0-9][a-z0-9._-]*$/.test(name) && name.length <= 214;

const filesIn = (dir: string, base = ''): string[] =>
  readdirSync(join(dir, base), { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const rel = base === '' ? entry.name : `${base}/${entry.name}`;
    return entry.isDirectory() ? filesIn(dir, rel) : [rel];
  });

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

const pinned = (deps: unknown, versions: Readonly<Record<string, string>>): Record<string, string> => {
  if (!isRecord(deps)) return {};
  return Object.fromEntries(
    Object.entries(deps).map(([name, spec]): [string, string] => {
      if (typeof spec !== 'string') throw new Error(`create-nisc: ${name} has no version in the template`);
      if (!spec.startsWith('workspace:')) return [name, spec];
      const version = versions[name];
      if (version === undefined) throw new Error(`create-nisc: the nisc release has no ${name} — the set it was given is incomplete`);
      return [name, `^${version}`];
    }),
  );
};

export const generate = (options: CreateOptions): Created => {
  const template = templateOf(options.posture, options.ui);
  const source = join(TEMPLATES, template);
  if (!existsSync(source)) throw new Error(`create-nisc: no template "${template}"`);
  if (!validName(options.name)) throw new Error(`create-nisc: "${options.name}" is not a package name (lowercase letters, digits, - . _)`);
  if (existsSync(options.dir) && !statSync(options.dir).isDirectory()) throw new Error(`create-nisc: ${options.dir} is a file`);

  const token = tokenOf(template);
  const planned = new Map<string, string | Buffer>();
  for (const rel of filesIn(source)) {
    const from = join(source, rel);
    if (rel === 'package.json') {
      const manifest: unknown = JSON.parse(readFileSync(from, 'utf8'));
      if (!isRecord(manifest)) throw new Error(`create-nisc: ${template}/package.json is not an object`);
      const app = {
        ...manifest,
        name: options.name,
        dependencies: pinned(manifest['dependencies'], options.versions),
        devDependencies: pinned(manifest['devDependencies'], options.versions),
      };
      planned.set(rel, `${JSON.stringify(app, null, 2)}\n`);
    } else if (TEXT.has(extname(rel))) {
      planned.set(rel, readFileSync(from, 'utf8').split(token).join(options.name));
    } else {
      planned.set(rel, readFileSync(from));
    }
  }
  const facts = { name: options.name, posture: options.posture, ui: options.ui, today: options.today, nisc: options.versions['@niscorp/nisc'] ?? 'unknown' };
  planned.set('AGENTS.md', agentsDoc(facts));
  planned.set('PLAN.md', planDoc(facts));

  const there = (rel: string): boolean => existsSync(join(options.dir, rel));
  const kept = [...planned.keys()].filter((rel) => KEEP_THEIRS.has(rel) && there(rel));
  const collisions = [...planned.keys()].filter((rel) => !KEEP_THEIRS.has(rel) && there(rel)).sort();
  if (collisions.length > 0) {
    throw new Error(
      `create-nisc: ${options.dir} already has ${collisions.length === 1 ? 'a file' : 'files'} a new app would write — nothing was written:\n  ${collisions.join('\n  ')}\nMake the app in an empty folder, or in a subfolder of this one.`,
    );
  }
  for (const rel of kept) planned.delete(rel);

  const ignorePath = join(options.dir, '.gitignore');
  const theirs = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : undefined;
  const have = new Set((theirs ?? '').split('\n').map((line) => line.trim()));
  const missing = gitignoreLines.filter((line) => !have.has(line));
  const extended = theirs !== undefined && missing.length > 0 ? ['.gitignore'] : [];
  if (theirs === undefined) planned.set('.gitignore', `${gitignoreLines.join('\n')}\n`);
  else if (missing.length > 0) planned.set('.gitignore', `${theirs.replace(/\n*$/, '\n')}${missing.join('\n')}\n`);

  for (const [rel, content] of planned) {
    const to = join(options.dir, rel);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, content);
  }
  return { files: [...planned.keys()].filter((rel) => !extended.includes(rel)).sort(), kept, extended };
};
