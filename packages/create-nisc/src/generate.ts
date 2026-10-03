import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentsDoc, gitignoreLines, planDoc } from './docs';

// ═══════════════════════════════════════════════════════════════
// A new app, from a template — and nothing in it that the walkthrough did not
// decide or PLAN.md does not record.
//
// The templates (../templates) are real apps: members of the nisc repository's
// workspace, typechecked, built and checked by its CI like any other. What a
// new app gets is one of them, copied, with three things changed: its name, the
// `workspace:^` versions turned into the released set the template was checked
// against, and the two documents that only exist for a new app — PLAN.md (the
// decisions) and AGENTS.md (where the rules are).
//
// It never overwrites. A folder that already holds something is fine — a fresh
// repository's .git, a LICENSE — as long as nothing it would write is there
// already; if anything is, it writes nothing at all and says which files.
// ═══════════════════════════════════════════════════════════════

// Where the shell runs (D1): on a server (moss), or in the page.
export type Posture = 'moss' | 'page';
// What draws the screen: React, or plain DOM.
export type Ui = 'react' | 'dom';

export type CreateOptions = {
  // where the app goes
  dir: string;
  // its package name
  name: string;
  posture: Posture;
  ui: Ui;
  // the @niscorp versions to depend on: package name → version
  versions: Readonly<Record<string, string>>;
  // the day it was made (PLAN.md), as YYYY-MM-DD
  today: string;
};

export type Created = {
  // every file written, relative to the app
  files: string[];
  // files that were already there and were left as they were
  kept: string[];
  // files that were already there and were added to
  extended: string[];
};

export const TEMPLATES = fileURLToPath(new URL('../templates', import.meta.url));

export const templateOf = (posture: Posture, ui: Ui): string => `${posture === 'moss' ? 'moss' : 'shell'}-${ui}`;

// The token each template is named by — its package name, and wherever the
// name shows (the page title, the welcome screen, its README).
const tokenOf = (template: string): string => `nisc-template-${template}`;

const SKIP = new Set(['node_modules', 'dist', 'out', '.turbo']);
const TEXT = new Set(['.ts', '.tsx', '.json', '.html', '.css', '.md']);
// A file of the app's own that an existing folder may already have, and keeps.
const KEEP_THEIRS = new Set(['README.md']);

// npm's rule for a package name, as the app's directory will mostly be named.
export const validName = (name: string): boolean => /^[a-z0-9][a-z0-9._-]*$/.test(name) && name.length <= 214;

const filesIn = (dir: string, base = ''): string[] =>
  readdirSync(join(dir, base), { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const rel = base === '' ? entry.name : `${base}/${entry.name}`;
    return entry.isDirectory() ? filesIn(dir, rel) : [rel];
  });

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

// `workspace:^` → `^<the released version>`, for every dependency the template
// takes from the workspace. A version the set does not have is a broken set,
// not something to guess.
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

  // ── everything it would write, worked out before anything is written ──
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

  // ── what is already there ──
  const there = (rel: string): boolean => existsSync(join(options.dir, rel));
  const kept = [...planned.keys()].filter((rel) => KEEP_THEIRS.has(rel) && there(rel));
  const collisions = [...planned.keys()].filter((rel) => !KEEP_THEIRS.has(rel) && there(rel)).sort();
  if (collisions.length > 0) {
    throw new Error(
      `create-nisc: ${options.dir} already has ${collisions.length === 1 ? 'a file' : 'files'} a new app would write — nothing was written:\n  ${collisions.join('\n  ')}\nMake the app in an empty folder, or in a subfolder of this one.`,
    );
  }
  for (const rel of kept) planned.delete(rel);

  // .gitignore is the one file that is added to: theirs, plus what is missing.
  const ignorePath = join(options.dir, '.gitignore');
  const theirs = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : undefined;
  const have = new Set((theirs ?? '').split('\n').map((line) => line.trim()));
  const missing = gitignoreLines.filter((line) => !have.has(line));
  const extended = theirs !== undefined && missing.length > 0 ? ['.gitignore'] : [];
  if (theirs === undefined) planned.set('.gitignore', `${gitignoreLines.join('\n')}\n`);
  else if (missing.length > 0) planned.set('.gitignore', `${theirs.replace(/\n*$/, '\n')}${missing.join('\n')}\n`);

  // ── only now ──
  for (const [rel, content] of planned) {
    const to = join(options.dir, rel);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, content);
  }
  return { files: [...planned.keys()].filter((rel) => !extended.includes(rel)).sort(), kept, extended };
};
