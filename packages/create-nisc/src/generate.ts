import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentsDoc, gitignore, planDoc } from './docs';

// ═══════════════════════════════════════════════════════════════
// A new app, from a template — and nothing in it that the walkthrough did not
// decide or PLAN.md does not record.
//
// The templates (../templates) are real apps: members of the nisc repository's
// workspace, typechecked, built and checked by its CI like any other. What a
// new app gets is one of them, copied, with three things changed: its name, the
// `workspace:^` versions turned into the published set, and the two documents
// that only exist for a new app — PLAN.md (the decisions) and AGENTS.md (where
// the rules are).
// ═══════════════════════════════════════════════════════════════

// Where the shell runs (D1): on a server (moss), or in the page.
export type Posture = 'moss' | 'page';
// What draws the screen: React, or plain DOM.
export type Ui = 'react' | 'dom';

export type CreateOptions = {
  // where the app goes — must not exist, or be empty
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

export const TEMPLATES = fileURLToPath(new URL('../templates', import.meta.url));

export const templateOf = (posture: Posture, ui: Ui): string => `${posture === 'moss' ? 'moss' : 'shell'}-${ui}`;

// The token each template is named by — its package name, and wherever the
// name shows (the page title, the welcome screen).
const tokenOf = (template: string): string => `nisc-template-${template}`;

const SKIP = new Set(['node_modules', 'dist', 'out', '.turbo']);
const TEXT = new Set(['.ts', '.tsx', '.json', '.html', '.css', '.md']);

// npm's rule for a package name, as the app's directory will mostly be named.
export const validName = (name: string): boolean => /^[a-z0-9][a-z0-9._-]*$/.test(name) && name.length <= 214;

const filesIn = (dir: string, base = ''): string[] =>
  readdirSync(join(dir, base), { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const rel = base === '' ? entry.name : `${base}/${entry.name}`;
    return entry.isDirectory() ? filesIn(dir, rel) : [rel];
  });

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

// `workspace:^` → `^<the published version>`, for every dependency the
// template takes from the workspace. A version the set does not have is a
// broken set, not something to guess.
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

export const generate = (options: CreateOptions): string[] => {
  const template = templateOf(options.posture, options.ui);
  const source = join(TEMPLATES, template);
  if (!existsSync(source)) throw new Error(`create-nisc: no template "${template}"`);
  if (!validName(options.name)) throw new Error(`create-nisc: "${options.name}" is not a package name (lowercase letters, digits, - . _)`);
  if (existsSync(options.dir) && (!statSync(options.dir).isDirectory() || readdirSync(options.dir).length > 0)) {
    throw new Error(`create-nisc: ${options.dir} already exists and is not empty`);
  }
  mkdirSync(options.dir, { recursive: true });

  const token = tokenOf(template);
  const written: string[] = [];
  for (const rel of filesIn(source)) {
    const from = join(source, rel);
    const to = join(options.dir, rel);
    mkdirSync(join(to, '..'), { recursive: true });
    if (rel === 'package.json') {
      const manifest: unknown = JSON.parse(readFileSync(from, 'utf8'));
      if (!isRecord(manifest)) throw new Error(`create-nisc: ${template}/package.json is not an object`);
      const app = {
        ...manifest,
        name: options.name,
        dependencies: pinned(manifest['dependencies'], options.versions),
        devDependencies: pinned(manifest['devDependencies'], options.versions),
      };
      writeFileSync(to, `${JSON.stringify(app, null, 2)}\n`);
    } else if (TEXT.has(extname(rel))) {
      writeFileSync(to, readFileSync(from, 'utf8').split(token).join(options.name));
    } else {
      cpSync(from, to);
    }
    written.push(rel);
  }

  const facts = { name: options.name, posture: options.posture, ui: options.ui, today: options.today, nisc: options.versions['@niscorp/nisc'] ?? 'unknown' };
  writeFileSync(join(options.dir, 'AGENTS.md'), agentsDoc(facts));
  writeFileSync(join(options.dir, 'PLAN.md'), planDoc(facts));
  writeFileSync(join(options.dir, '.gitignore'), gitignore);
  return [...written, 'AGENTS.md', 'PLAN.md', '.gitignore'].sort();
};
