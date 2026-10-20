import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { envOf, isChoice, itemsOf, partsOf, readCatalog } from './catalog';
import type { EnvKey, EnvSpec, Item, Part, Picks } from './catalog';
import { agentsDoc, gitignoreLines, planDoc } from './docs';

export type CreateOptions = {
  dir: string;
  name: string;
  picks: Picks;
  // The values given for the keys the items ask for, by variable name. A key left out is written empty.
  env?: Readonly<Record<string, string>>;
  versions: Readonly<Record<string, string>>;
  // Depend on the nisc packages of the workspace the app is made in, for an app inside the nisc repository.
  workspace?: boolean;
  // YYYY-MM-DD
  today: string;
  templates?: string;
};

export type Created = {
  files: string[];
  kept: string[];
  extended: string[];
};

export const TEMPLATES = fileURLToPath(new URL('../templates', import.meta.url));

const TOKEN = 'nisc-template-app';
const SKIP = new Set(['node_modules', 'dist', 'out', '.turbo']);
const TEXT = new Set(['.ts', '.tsx', '.json', '.html', '.css', '.md']);
const KEEP_THEIRS = new Set(['README.md']);
const DEPENDENCIES = ['dependencies', 'devDependencies'] as const;

// npm's rule for a package name.
export const validName = (name: string): boolean => /^[a-z0-9][a-z0-9._-]*$/.test(name) && name.length <= 214;

const filesIn = (dir: string, base = ''): string[] =>
  existsSync(join(dir, base))
    ? readdirSync(join(dir, base), { withFileTypes: true }).flatMap((entry) => {
        if (SKIP.has(entry.name)) return [];
        const rel = base === '' ? entry.name : `${base}/${entry.name}`;
        return entry.isDirectory() ? filesIn(dir, rel) : [rel];
      })
    : [];

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

// An item's files, then its files for each other item the app is made of (`with/<other>/`).
const sourcesOf = (root: string, items: readonly Item[]): Map<string, { item: string; from: string }> => {
  const ids = new Set(items.map((item) => item.id));
  const sources = new Map<string, { item: string; from: string }>();
  for (const item of items) {
    const withDir = join(root, item.id, 'with');
    const others = existsSync(withDir) ? readdirSync(withDir) : [];
    for (const other of others) if (!existsSync(join(root, other, 'item.json'))) throw new Error(`create-nisc: ${item.id}/with/${other} is for "${other}", which is no item`);
    const dirs = [join(root, item.id, 'files'), ...others.filter((other) => ids.has(other)).map((other) => join(withDir, other))];
    for (const dir of dirs) {
      for (const rel of filesIn(dir)) {
        const there = sources.get(rel);
        if (there !== undefined) throw new Error(`create-nisc: ${rel} is written by both "${there.item}" and "${item.id}"`);
        sources.set(rel, { item: item.id, from: join(dir, rel) });
      }
    }
  }
  return sources;
};

const pin = (name: string, spec: string, options: CreateOptions): string => {
  if (!spec.startsWith('workspace:') || options.workspace === true) return spec;
  const version = options.versions[name];
  if (version === undefined) throw new Error(`create-nisc: the nisc release has no ${name} — the set it was given is incomplete`);
  return `^${version}`;
};

// The parts' package fragments as one manifest: fields in the order they come, then the scripts, then the
// dependencies sorted. Two parts that disagree about one field, script or dependency is a mistake in the templates.
const manifestOf = (parts: readonly Part[], options: CreateOptions): Record<string, unknown> => {
  const fields: Record<string, unknown> = {};
  const scripts: Record<string, string> = {};
  const deps: Record<(typeof DEPENDENCIES)[number], Record<string, string>> = { dependencies: {}, devDependencies: {} };
  const agree = (where: string, key: string, have: unknown, value: unknown): void => {
    if (have !== undefined && JSON.stringify(have) !== JSON.stringify(value)) throw new Error(`create-nisc: two items disagree about ${where} "${key}"`);
  };
  for (const fragment of parts.map((part) => part.package ?? {})) {
    for (const [key, value] of Object.entries(fragment)) {
      if (key === 'scripts' || key === 'dependencies' || key === 'devDependencies') {
        if (!isRecord(value)) throw new Error(`create-nisc: a package fragment's ${key} is not an object`);
        const into = key === 'scripts' ? scripts : deps[key];
        for (const [name, spec] of Object.entries(value)) {
          if (typeof spec !== 'string') throw new Error(`create-nisc: ${name} in ${key} is not a string`);
          agree(key, name, into[name], spec);
          into[name] = spec;
        }
      } else {
        agree('the package field', key, fields[key], value);
        fields[key] = value;
      }
    }
  }
  const sorted = (from: Record<string, string>): Record<string, string> =>
    Object.fromEntries(
      Object.keys(from)
        .sort()
        .map((name) => [name, pin(name, from[name] ?? '', options)]),
    );
  return {
    name: options.name,
    ...fields,
    ...(Object.keys(scripts).length > 0 ? { scripts } : {}),
    dependencies: sorted(deps.dependencies),
    devDependencies: sorted(deps.devDependencies),
  };
};

const envValue = (name: string, options: CreateOptions): string => {
  const value = (options.env?.[name] ?? '').trim();
  if (/\s/.test(value)) throw new Error(`create-nisc: the value given for ${name} has a space or a line break in it`);
  return value;
};

// `.env` with the values given, `.env.example` with the names alone. A choice keeps its value in both: it is not a
// secret, and it says which keys follow.
const envFiles = (specs: readonly EnvSpec[], options: CreateOptions): { env: string; example: string; assigned: string[] } => {
  const env: string[] = [];
  const example: string[] = [];
  const assigned: string[] = [];
  const key = (spec: EnvKey): void => {
    const comment = `# ${spec.message}${spec.required === true ? ' (required)' : ''}`;
    const line = `${spec.name}=${envValue(spec.name, options)}`;
    env.push(comment, line);
    example.push(comment, `${spec.name}=`);
    assigned.push(line);
  };
  for (const spec of specs) {
    if (!isChoice(spec)) {
      key(spec);
      continue;
    }
    const value = envValue(spec.choose, options) || (spec.options[0]?.value ?? '');
    const option = spec.options.find((candidate) => candidate.value === value);
    if (option === undefined) throw new Error(`create-nisc: ${spec.choose} is one of ${spec.options.map((candidate) => candidate.value).join(', ')} — not "${value}"`);
    const comment = `# ${spec.message} (${spec.options.map((candidate) => candidate.value).join(' | ')})`;
    env.push(comment, `${spec.choose}=${value}`);
    example.push(comment, `${spec.choose}=${value}`);
    assigned.push(`${spec.choose}=${value}`);
    for (const inner of option.keys ?? []) key(inner);
  }
  return { env: `${env.join('\n')}\n`, example: `${example.join('\n')}\n`, assigned };
};

export const generate = (options: CreateOptions): Created => {
  const catalog = readCatalog(options.templates ?? TEMPLATES);
  const items = itemsOf(catalog, options.picks);
  const parts = partsOf(items);
  if (!validName(options.name)) throw new Error(`create-nisc: "${options.name}" is not a package name (lowercase letters, digits, - . _)`);
  if (existsSync(options.dir) && !statSync(options.dir).isDirectory()) throw new Error(`create-nisc: ${options.dir} is a file`);

  const planned = new Map<string, string | Buffer>();
  for (const [rel, { from }] of sourcesOf(catalog.root, items)) {
    planned.set(rel, TEXT.has(extname(rel)) ? readFileSync(from, 'utf8').split(TOKEN).join(options.name) : readFileSync(from));
  }
  planned.set('package.json', `${JSON.stringify(manifestOf(parts, options), null, 2)}\n`);

  const sections = items.flatMap((item) => {
    const path = join(catalog.root, item.id, 'agents-section.md');
    return existsSync(path) ? [readFileSync(path, 'utf8').split(TOKEN).join(options.name)] : [];
  });
  const facts = { name: options.name, today: options.today, nisc: options.versions['@niscorp/nisc'] ?? 'unknown', parts, agents: sections };
  planned.set('AGENTS.md', agentsDoc(facts));
  planned.set('PLAN.md', planDoc(facts));

  const specs = envOf(items);
  const envs = specs.length > 0 ? envFiles(specs, options) : undefined;
  if (envs !== undefined) planned.set('.env.example', envs.example);

  const there = (rel: string): boolean => existsSync(join(options.dir, rel));
  const kept = [...planned.keys()].filter((rel) => KEEP_THEIRS.has(rel) && there(rel));
  const collisions = [...planned.keys()].filter((rel) => !KEEP_THEIRS.has(rel) && there(rel)).sort();
  if (collisions.length > 0) {
    throw new Error(
      `create-nisc: ${options.dir} already has ${collisions.length === 1 ? 'a file' : 'files'} a new app would write — nothing was written:\n  ${collisions.join('\n  ')}\nMake the app in an empty folder, or in a subfolder of this one.`,
    );
  }
  for (const rel of kept) planned.delete(rel);

  // A .gitignore or .env that is there is added to, never replaced: what it holds is theirs.
  const extended: string[] = [];
  const addTo = (rel: string, fresh: string, lines: readonly string[], has: (line: string, theirs: ReadonlySet<string>) => boolean): void => {
    const path = join(options.dir, rel);
    if (!existsSync(path)) {
      planned.set(rel, fresh);
      return;
    }
    const theirs = readFileSync(path, 'utf8');
    const have = new Set(theirs.split('\n').map((line) => line.trim()));
    const missing = lines.filter((line) => !has(line, have));
    if (missing.length === 0) return;
    planned.set(rel, `${theirs.replace(/\n*$/, '\n')}${missing.join('\n')}\n`);
    extended.push(rel);
  };
  addTo('.gitignore', `${gitignoreLines.join('\n')}\n`, gitignoreLines, (line, have) => have.has(line));
  if (envs !== undefined) {
    const named = (line: string): string => line.slice(0, line.indexOf('=') + 1);
    addTo('.env', envs.env, envs.assigned, (line, have) => [...have].some((theirs) => theirs.startsWith(named(line))));
  }

  for (const [rel, content] of planned) {
    const to = join(options.dir, rel);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, content);
  }
  return { files: [...planned.keys()].filter((rel) => !extended.includes(rel)).sort(), kept, extended };
};
