// Is a package made of modules, and do they keep to their doors?
//
// Moss grew to twenty-eight files flat in `src/`, one of them a single
// function of 1,345 lines, because nothing said where a new thing goes: it
// went wherever it was needed, and reached for whatever it wanted
// (docs/plans/moss-refactor.md). This is the rule that was missing, as a
// build that fails.
//
// A MODULE is a directory under `src/` with an `index.ts`. For a package
// listed below this holds:
//
//   1. NOTHING FLAT. Only `index.ts` sits at the top of `src/`, whatever a
//      file's extension. The files that have not been moved yet are named in
//      `flat`; a file that is not there fails, and a name there with no file
//      fails too, so the list only gets shorter.
//   2. ONE DOOR. Code in one module imports another module as `../<module>`,
//      never a file inside it. The top `index.ts` is held to this like a
//      module: it imports doors.
//   3. DECLARED DEPENDENCIES. A module imports only the modules its entry in
//      `modules` names, and the table has no cycle. No module imports the top
//      of `src/`: the main entry imports the modules, not the other way.
//   4. THE CORE DOES NOT IMPORT A FEATURE. A feature (`features`) is a module
//      that owns none of the package's questions: it ships from an entry point
//      of its own and reaches the core through seams it is handed. So no
//      module that is not a feature names one in its dependencies, and no file
//      at the top of `src/` imports one, `index.ts` included: what the main
//      entry reaches would carry the feature with it.
//
// WHAT COUNTS AS AN IMPORT. Every way a file names another, for its code or
// for its types: `import` and `export … from`, `import x = require(…)`,
// `import(…)` as a call and as a type (`import('…').T`, `typeof import('…')`),
// `require(…)`, `declare module '…'`, and `/// <reference … />`. The first
// version read declarations and literal `import()` calls only, and a type
// taken with `import('../data/engine').Config` went round the door unseen.
//
// THREE RULES KEEP THE FOUR ABOVE FROM BEING WALKED AROUND:
//
//   5. EVERY FILE IS READ. A file under `src/` is `.ts` or `.tsx`. Anything
//      else (`.mts`, `.js`, `.json`, a link) fails: it would be a file the
//      rules above never looked inside.
//   6. THE PACKAGE IS REACHED BY A RELATIVE PATH. A name that is not relative
//      is a Node built-in or a package the `package.json` names under
//      `dependencies` or `peerDependencies`. So a file cannot import its own
//      package by name (`@niscorp/moss/integrations` from the core is the
//      feature, by another road), nor through an alias (`#data/engine`, a
//      `paths` entry), and a relative path does not leave `src/`.
//   7. EVERY IMPORT CAN BE READ. `import()` and `require()` take one string
//      written out. A path built while the program runs cannot be checked, so
//      it is refused, and so are `createRequire` and a `require` handed
//      around: each makes a loader nothing here can follow.
//
// AND ONE IS ABOUT WHAT A READER FINDS:
//
//   8. A DOOR SAYS WHAT IS BEHIND IT. The comment of a module's `index.ts`
//      names every file and every directory in the module. The style guide
//      said each door did. Seven of moss's fourteen did not, for 30 files
//      between them: a sentence about the code that nothing held.
//
// A file still flat may be imported by anything while it exists; that is what
// being in the middle of a move looks like. A module named in `finished` is no
// longer in the middle of it: everything it needs is a module, so a flat file
// it imports fails. Without that, the terminal side could go back to importing
// the server's files and rule 3 would not see it.
//
// WHAT THIS CANNOT SEE. It reads imports, not what is done with them.
//   - A module's door may export anything from inside it. That is what a door
//     is, and what it should export is a review's question (rules 3 and 4 of
//     "Changing a package": one owner, narrow inputs).
//   - Code that loads code without the words above: `eval`, `new Function`, a
//     file read and run, a worker started on a path.
//   - What another package hands back. A dependency that re-exported this
//     package's insides would carry them in; `check:packages` installs each
//     package alone, where such a cycle does not resolve.
//   - Whether what a door says of a file is so. It holds that the file's name
//     is in the door's comment, and reads no further.
//   - The table itself. A line added to `modules` is allowed by definition:
//     it is a diff somebody reads.
//
// The check tests itself on every run: each walkaround it was once open to is
// a small package in memory that must fail, beside a twin that must pass.
//
// A repo script, like check-fact-door. `pnpm check:modules`. Exits non-zero on
// any failure.

import { readdirSync, readFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { join, posix, resolve } from 'node:path';
import ts from 'typescript';

const packages = resolve(import.meta.dirname, '..', 'packages');

type Shape = {
  // module → the modules it may import
  modules: Readonly<Record<string, readonly string[]>>;
  // files still at the top of src/, on their way into a module
  flat: readonly string[];
  // modules that import no flat file: all they need has been moved
  finished: readonly string[];
  // modules the core must not import: each ships from its own entry point
  features: readonly string[];
};

const PACKAGES: Readonly<Record<string, Shape>> = {
  moss: {
    modules: {
      runtime: [],
      protocol: [],
      feature: ['runtime'],
      identity: ['runtime', 'protocol'],
      manifest: ['identity', 'feature'],
      data: ['runtime', 'identity', 'manifest'],
      // What somebody is looking at. Not `identity` and not `feature`: who
      // somebody is, and what a feature lays around a shell's wire, reach it
      // as functions the server hands over.
      shells: ['runtime', 'protocol', 'manifest', 'data'],
      // Not `data`: what the feature reads and writes it hands over as entries
      // and replays through a seam, so it imports nothing of the data module.
      integrations: ['runtime', 'feature', 'manifest'],
      // How it reaches them live. Not `manifest`: what somebody holds is a
      // function it is handed, and so is where a session comes from.
      socket: ['runtime', 'protocol', 'identity', 'shells'],
      // How it reaches them as a page. Not `manifest` and not the server: a
      // page's path, and the three things a document asks a server, are types
      // written out in the module.
      documents: ['protocol', 'identity', 'shells'],
      // The wiring: it may import every core module, and no feature. Its
      // node.ts and vite.ts are entry points of their own (`./node`, `./vite`).
      server: ['runtime', 'protocol', 'feature', 'identity', 'manifest', 'data', 'shells', 'socket', 'documents'],
      // A committed write, minted into tide as a fact. A feature: it hears a
      // write through the seam it is handed, and imports nothing of `data`.
      tide: ['feature'],
      client: ['protocol'],
      terminal: ['client'],
    },
    flat: [],
    finished: ['runtime', 'protocol', 'feature', 'identity', 'manifest', 'data', 'shells', 'integrations', 'socket', 'documents', 'server', 'tide', 'client', 'terminal'],
    features: ['integrations', 'tide'],
  },
};

// ─── what a package is, as this check reads it ───────────────

type Source = {
  // the package's own name, and the packages its package.json lets it import
  name: string;
  dependencies: readonly string[];
  // every file under src/, by its path from src/ with forward slashes
  files: ReadonlyMap<string, string>;
  // what sits under src/ and is neither a file nor a directory: a link
  links: readonly string[];
};

// The extensions this check reads. A file with another is refused (rule 5).
const READ = /\.tsx?$/;

const fieldsOf = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {});

const sourceOf = (root: string): Source => {
  const files = new Map<string, string>();
  const links: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${prefix}${entry.name}`;
      if (entry.isSymbolicLink()) links.push(path);
      else if (entry.isDirectory()) walk(join(dir, entry.name), `${path}/`);
      else files.set(path, READ.test(entry.name) ? readFileSync(join(dir, entry.name), 'utf8') : '');
    }
  };
  walk(join(root, 'src'), '');
  const manifest = fieldsOf(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')));
  return {
    name: typeof manifest['name'] === 'string' ? manifest['name'] : '',
    dependencies: [...Object.keys(fieldsOf(manifest['dependencies'])), ...Object.keys(fieldsOf(manifest['peerDependencies']))],
    files,
    links,
  };
};

// ─── what a file imports ─────────────────────────────────────

type Imports = {
  // every other file or package the file names, as written
  specifiers: string[];
  // every load this check cannot follow, as a few words saying which
  unreadable: string[];
};

const written = (node: ts.Node | undefined): string | undefined => (node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined);

// `import(…)`, `require(…)`, `module.require(…)`: a call that loads what its
// first argument names.
const loads = (callee: ts.Expression): boolean =>
  callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require') || (ts.isPropertyAccessExpression(callee) && callee.name.text === 'require');

const importsOf = (path: string, text: string): Imports => {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const specifiers: string[] = [];
  const unreadable: string[] = [];
  const take = (node: ts.Node | undefined, what: string): void => {
    const specifier = written(node);
    if (specifier === undefined) unreadable.push(`${what} of a path that is not written out`);
    else specifiers.push(specifier);
  };
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined) take(node.moduleSpecifier, 'an import');
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) take(node.moduleReference.expression, 'an `import =`');
    if (ts.isImportTypeNode(node)) take(ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined, 'an `import()` type');
    if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) specifiers.push(node.name.text);
    if (ts.isCallExpression(node) && loads(node.expression)) take(node.arguments[0], node.expression.kind === ts.SyntaxKind.ImportKeyword ? 'an `import()`' : 'a `require()`');
    if (ts.isIdentifier(node) && node.text === 'createRequire') unreadable.push('`createRequire`');
    // `require` anywhere but where it is called: handed on, or asked to resolve.
    if (ts.isIdentifier(node) && node.text === 'require') {
      const called = ts.isCallExpression(node.parent) && node.parent.expression === node;
      const member = ts.isPropertyAccessExpression(node.parent) && node.parent.name === node && ts.isCallExpression(node.parent.parent) && node.parent.parent.expression === node.parent;
      if (!called && !member) unreadable.push('`require` that is not called where it stands');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  // `/// <reference path="…" />` names a file; `types="…"` names a package.
  for (const reference of source.referencedFiles) specifiers.push(reference.fileName.startsWith('.') ? reference.fileName : `./${reference.fileName}`);
  for (const reference of source.typeReferenceDirectives) specifiers.push(reference.fileName);
  return { specifiers, unreadable: [...new Set(unreadable)] };
};

// `@scope/name/deep` and `name/deep` are the packages `@scope/name` and `name`.
const packageOf = (specifier: string): string =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/');

const cycleIn = (modules: Shape['modules']): string | undefined => {
  const visiting = new Set<string>();
  const done = new Set<string>();
  const walk = (name: string, path: readonly string[]): string | undefined => {
    if (done.has(name)) return undefined;
    if (visiting.has(name)) return [...path, name].join(' → ');
    visiting.add(name);
    for (const next of modules[name] ?? []) {
      const found = walk(next, [...path, name]);
      if (found !== undefined) return found;
    }
    visiting.delete(name);
    done.add(name);
    return undefined;
  };
  for (const name of Object.keys(modules)) {
    const found = walk(name, []);
    if (found !== undefined) return found;
  }
  return undefined;
};

// ─── the rules ───────────────────────────────────────────────

type Held = { label: string; passed: boolean; detail: string };

// `index`, with or without an extension: the file at the top of src/.
const TOP = /^index(\.[cm]?[jt]sx?)?$/;

const some = (found: readonly string[]): string => found.slice(0, 6).join('; ');

const judge = (shape: Shape, source: Source): Held[] => {
  const paths = [...source.files.keys()];
  const flatNow = paths.filter((path) => !path.includes('/') && path !== 'index.ts');
  const directories = [...new Set(paths.filter((path) => path.includes('/')).map((path) => path.slice(0, path.indexOf('/'))))];
  const isDirectory = (target: string): boolean => paths.some((path) => path.startsWith(`${target}/`));

  const deep: string[] = [];
  const undeclaredUse: string[] = [];
  const flatUse: string[] = [];
  const topUse: string[] = [];
  const foreign: string[] = [];
  const unreadable: string[] = [];

  const relative = (file: string, specifier: string): void => {
    const target = posix.normalize(posix.join(posix.dirname(file), specifier)).replace(/\/$/, '');
    if (target === '..' || target.startsWith('../')) {
      foreign.push(`${file} imports ${specifier}, which is outside src/`);
      return;
    }
    const parts = target.split('/');
    const other = parts[0] ?? '';
    const directory = file.includes('/') ? file.slice(0, file.indexOf('/')) : undefined;
    const top = target === '.' || (parts.length === 1 && TOP.test(target) && !isDirectory(target));
    const inner = parts.length > 1 && !(parts.length === 2 && parts[1] === 'index');

    // A FILE AT THE TOP OF src/: it imports doors, and no feature.
    if (directory === undefined) {
      if (top) return;
      if (shape.features.includes(other)) topUse.push(`${file} imports ${specifier}`);
      if (inner) deep.push(`${file} imports ${target}`);
      return;
    }

    // A FILE IN A MODULE.
    if (top) {
      undeclaredUse.push(`${file} imports the top of src/`);
      return;
    }
    if (other === directory) return;
    // Still flat: importable by anything until it moves, but not by a module
    // that needs nothing flat any more.
    if (parts.length === 1 && !isDirectory(target)) {
      if (shape.finished.includes(directory)) flatUse.push(`${file} imports ${other}`);
      return;
    }
    if (!(shape.modules[directory] ?? []).includes(other)) undeclaredUse.push(`${file} imports ${other}`);
    if (inner) deep.push(`${file} imports ${target}`);
  };

  for (const [file, text] of source.files) {
    if (!READ.test(file)) continue;
    const imports = importsOf(file, text);
    for (const what of imports.unreadable) unreadable.push(`${file} has ${what}`);
    for (const specifier of imports.specifiers) {
      if (specifier.startsWith('.')) relative(file, specifier);
      else if (isBuiltin(specifier)) continue;
      else if (packageOf(specifier) === source.name) foreign.push(`${file} imports ${specifier}: its own package, by name`);
      else if (!source.dependencies.includes(packageOf(specifier))) foreign.push(`${file} imports ${specifier}, which package.json does not name`);
    }
  }

  const unlisted = flatNow.filter((file) => !shape.flat.includes(file));
  const gone = shape.flat.filter((file) => !flatNow.includes(file));
  const unread = [...paths.filter((path) => !READ.test(path)), ...source.links.map((link) => `${link} (a link)`)];
  const undeclared = directories.filter((directory) => shape.modules[directory] === undefined);
  const doorless = directories.filter((directory) => !source.files.has(`${directory}/index.ts`));
  // A DOOR SAYS WHAT IS BEHIND IT: each file and each directory that sits in a
  // module beside its index.ts is named in that file's comments.
  const unnamed = directories.flatMap((directory) => {
    const said = (source.files.get(`${directory}/index.ts`) ?? '')
      .split('\n')
      .filter((line) => line.trimStart().startsWith('//'))
      .join('\n');
    const behind = new Set(paths.filter((path) => path.startsWith(`${directory}/`)).map((path) => path.slice(directory.length + 1).split('/')[0] ?? ''));
    return [...behind].filter((name) => name !== 'index.ts' && !said.includes(name)).map((name) => `${directory}/index.ts does not name ${name}`);
  });
  const unknown = [
    ...Object.entries(shape.modules).flatMap(([module, needs]) => needs.filter((need) => shape.modules[need] === undefined).map((need) => `${module} names ${need}`)),
    ...shape.finished.filter((module) => shape.modules[module] === undefined).map((module) => `finished names ${module}`),
    ...shape.features.filter((module) => shape.modules[module] === undefined).map((module) => `features names ${module}`),
  ];
  const cycle = cycleIn(shape.modules);
  // THE CORE DOES NOT IMPORT A FEATURE: not by a module's declared
  // dependencies, and not from a file at the top of src/ (which may otherwise
  // import any door).
  const coreNames = Object.entries(shape.modules)
    .filter(([module]) => !shape.features.includes(module))
    .flatMap(([module, needs]) => needs.filter((need) => shape.features.includes(need)).map((need) => `${module} declares ${need}`));
  const feature = [...coreNames, ...topUse];

  return [
    { label: 'no new file at the top of src/', passed: unlisted.length === 0, detail: unlisted.length === 0 ? `${flatNow.length} still to move` : `${unlisted.join(', ')} — put it in the module whose question it answers` },
    { label: 'the list of flat files names only files that are there', passed: gone.length === 0, detail: gone.length === 0 ? '' : `${gone.join(', ')} moved: take ${gone.length === 1 ? 'it' : 'them'} off the list in this file` },
    { label: 'every file in src/ is one this check reads (.ts, .tsx)', passed: unread.length === 0, detail: unread.length === 0 ? `${paths.length} files` : some(unread) },
    { label: 'every directory in src/ is a declared module', passed: undeclared.length === 0, detail: undeclared.join(', ') },
    { label: 'every module has an index.ts', passed: doorless.length === 0, detail: doorless.join(', ') },
    { label: "a module's door names every file behind it", passed: unnamed.length === 0, detail: some(unnamed) },
    { label: 'every dependency named is a module', passed: unknown.length === 0, detail: unknown.join('; ') },
    { label: 'the modules have no cycle', passed: cycle === undefined, detail: cycle ?? `${Object.keys(shape.modules).length} modules` },
    { label: 'a module, and the top of src/, imports a module by its door', passed: deep.length === 0, detail: some(deep) },
    { label: 'a module imports only the modules it declares', passed: undeclaredUse.length === 0, detail: some(undeclaredUse) },
    { label: 'a finished module imports no file still flat', passed: flatUse.length === 0, detail: flatUse.length === 0 ? shape.finished.join(', ') : some(flatUse) },
    { label: 'the core does not import a feature', passed: feature.length === 0, detail: feature.length === 0 ? shape.features.join(', ') : some(feature) },
    { label: 'the package is imported by a relative path, and other packages are ones package.json names', passed: foreign.length === 0, detail: some(foreign) },
    { label: 'every import is one this check can read', passed: unreadable.length === 0, detail: some(unreadable) },
  ];
};

const lines: string[] = [];
let failed = false;
const ok = (label: string, passed: boolean, detail = ''): void => {
  lines.push(`[${passed ? 'pass' : 'fail'}] ${label}${detail === '' ? '' : ` — ${detail}`}`);
  if (!passed) failed = true;
};

// ─── falsifiable: the check fails on what it says it fails on ─
//
// One small package, in memory: `low` under `high`, and a feature beside
// them. Each case adds files to it. `bad` must fail the rule named and `good`,
// the same thing done by the rules, must pass every rule.

const FIXTURE_SHAPE: Shape = { modules: { low: [], high: ['low'], extra: ['low'] }, flat: [], finished: ['low', 'high', 'extra'], features: ['extra'] };
const FIXTURE: Readonly<Record<string, string>> = {
  'index.ts': "export { high } from './high';\n",
  'low/index.ts': "// ./low.ts is the module. A case may add ./f.ts, ./f.tsx, ./t.ts or ./flat.ts beside it.\nexport { low } from './low';\nexport type { Low } from './low';\n",
  'low/low.ts': 'export type Low = { n: number };\nexport const low = (): Low => ({ n: 1 });\n',
  'high/index.ts': "// ./high.ts is the module. A case may add ./f.ts, ./t.ts or ./t.d.ts beside it.\nexport { high } from './high';\n",
  'high/high.ts': "import { low } from '../low';\nexport const high = (): number => low().n;\n",
  'extra/index.ts': "import { low } from '../low';\nexport const extra = (): number => low().n;\n",
};

const DOOR = 'a module, and the top of src/, imports a module by its door';
const DECLARED = 'a module imports only the modules it declares';
const FEATURE = 'the core does not import a feature';
const READS = 'every file in src/ is one this check reads (.ts, .tsx)';
const FLAT = 'no new file at the top of src/';
const RELATIVE = 'the package is imported by a relative path, and other packages are ones package.json names';
const READABLE = 'every import is one this check can read';
const NAMED = "a module's door names every file behind it";

type Case = { what: string; fails: string; bad: Readonly<Record<string, string>>; good: Readonly<Record<string, string>> };

const CASES: readonly Case[] = [
  {
    what: "a type taken round a door: `import('../low/low').Low`",
    fails: DOOR,
    bad: { 'high/t.ts': "export type T = import('../low/low').Low;\n" },
    good: { 'high/t.ts': "export type T = import('../low').Low;\n" },
  },
  {
    what: "a module's inner file as a type: `typeof import('../low/low')`",
    fails: DOOR,
    bad: { 'high/t.ts': "export type T = typeof import('../low/low');\n" },
    good: { 'high/t.ts': "export type T = typeof import('../low');\n" },
  },
  {
    what: "a module the table does not give, as a type: `import('../high').…` from low",
    fails: DECLARED,
    bad: { 'low/t.ts': "export type T = typeof import('../high');\n" },
    good: { 'low/t.ts': "export type T = typeof import('./low');\n" },
  },
  {
    what: "the core importing a feature by the package's own name",
    fails: RELATIVE,
    bad: { 'high/f.ts': "export { extra } from '@fixture/pkg/extra';\n" },
    good: { 'high/f.ts': "export { z } from 'zod';\n" },
  },
  {
    what: "a module importing the package's main entry by name",
    fails: RELATIVE,
    bad: { 'low/f.ts': "import type { high } from '@fixture/pkg';\nexport type H = typeof high;\n" },
    good: { 'low/f.ts': "import type { low } from './low';\nexport type L = typeof low;\n" },
  },
  {
    what: 'an alias into the package: `#high/high`',
    fails: RELATIVE,
    bad: { 'low/f.ts': "export { high } from '#high/high';\n" },
    good: { 'low/f.ts': "export { readFileSync } from 'fs';\nexport { join } from 'node:path';\n" },
  },
  {
    what: 'a package that package.json does not name',
    fails: RELATIVE,
    bad: { 'low/f.ts': "export { something } from 'left-out';\n" },
    good: { 'low/f.ts': "export { z } from 'zod/v4';\n" },
  },
  {
    what: 'a relative path that leaves src/',
    fails: RELATIVE,
    bad: { 'high/f.ts': "export { high } from '../../dist/index.js';\n" },
    good: { 'high/f.ts': "export { high } from './high';\n" },
  },
  { what: 'a .mts file at the top of src/', fails: FLAT, bad: { 'flat.mts': 'export const flat = 1;\n' }, good: { 'low/flat.ts': 'export const flat = 1;\n' } },
  {
    what: "a .mts file in a module, importing another's inner file",
    fails: READS,
    bad: { 'high/f.mts': "export { low } from '../low/low';\n" },
    good: { 'high/f.ts': "export { low } from '../low';\n" },
  },
  {
    what: 'a .js file in a module, importing a module the table does not give',
    fails: READS,
    bad: { 'low/f.js': "export { high } from '../high';\n" },
    good: { 'low/f.tsx': "export { low } from './low';\n" },
  },
  { what: 'a file that is not source at the top of src/', fails: READS, bad: { 'notes.json': '{}\n' }, good: {} },
  {
    what: "a declaration file in a module, importing another's inner file",
    fails: DOOR,
    bad: { 'high/t.d.ts': "export type T = import('../low/low').Low;\n" },
    good: { 'high/t.d.ts': "export type T = import('../low').Low;\n" },
  },
  {
    what: "the top index.ts importing a module's inner file",
    fails: DOOR,
    bad: { 'index.ts': "export { high } from './high/high';\n" },
    good: { 'index.ts': "export { high } from './high/index';\n" },
  },
  {
    what: 'the top index.ts importing a feature',
    fails: FEATURE,
    bad: { 'index.ts': "export { high } from './high';\nexport { extra } from './extra';\n" },
    good: { 'index.ts': "export { high } from './high';\nexport { low } from './low';\n" },
  },
  {
    what: "a module importing the top of src/: `from '..'`",
    fails: DECLARED,
    bad: { 'low/f.ts': "export { high } from '..';\n" },
    good: { 'low/f.ts': "export { low } from '.';\n" },
  },
  {
    what: "`require('../low/low')`",
    fails: DOOR,
    bad: { 'high/f.ts': "export const inner: unknown = require('../low/low');\n" },
    good: { 'high/f.ts': "export const door: unknown = require('../low');\n" },
  },
  {
    what: "`import x = require('../low/low')`",
    fails: DOOR,
    bad: { 'high/f.ts': "import inner = require('../low/low');\nexport const x: unknown = inner;\n" },
    good: { 'high/f.ts': "import door = require('../low');\nexport const x: unknown = door;\n" },
  },
  {
    what: '`createRequire`',
    fails: READABLE,
    bad: { 'high/f.ts': "import { createRequire } from 'node:module';\nexport const inner: unknown = createRequire(import.meta.url)('../low/low');\n" },
    good: { 'high/f.ts': "import { isBuiltin } from 'node:module';\nexport const builtIn = isBuiltin('fs');\n" },
  },
  {
    what: 'a `require` handed on under another name',
    fails: READABLE,
    bad: { 'high/f.ts': "const load = require;\nexport const inner: unknown = load('../low/low');\n" },
    good: { 'high/f.ts': "export const required = 'require';\n" },
  },
  {
    what: '`import()` of a path built while the program runs',
    fails: READABLE,
    bad: { 'high/f.ts': "const inner = ['..', 'low', 'low'].join('/');\nexport const load = (): Promise<unknown> => import(inner);\n" },
    good: { 'high/f.ts': "export const load = (): Promise<unknown> => import('../low');\n" },
  },
  {
    what: "`import()` of an inner file, written as a template: import(`../low/low`)",
    fails: DOOR,
    bad: { 'high/f.ts': 'export const load = (): Promise<unknown> => import(`../low/low`);\n' },
    good: { 'high/f.ts': 'export const load = (): Promise<unknown> => import(`../low`);\n' },
  },
  {
    what: "another module's inner file, named for its types: `declare module '../low/low'`",
    fails: DOOR,
    bad: { 'high/f.ts': "declare module '../low/low' {\n  type More = number;\n}\nexport const x = 1;\n" },
    good: { 'high/f.ts': "declare module '../low' {\n  type More = number;\n}\nexport const x = 1;\n" },
  },
  {
    what: "another module's inner file, by `/// <reference path>`",
    fails: DOOR,
    bad: { 'high/f.ts': '/// <reference path="../low/low.ts" />\nexport const x = 1;\n' },
    good: { 'high/f.ts': '/// <reference path="./high.ts" />\nexport const x = 1;\n' },
  },
];

const DOOR_CASE: Case = {
  what: 'a file its module\'s door does not name',
  fails: NAMED,
  bad: { 'low/more.ts': 'export const more = 1;\n' },
  good: { 'low/more.ts': 'export const more = 1;\n', 'low/index.ts': "// ./low.ts is the module, and ./more.ts is one more.\nexport { low } from './low';\n" },
};

const fixtureOf = (added: Readonly<Record<string, string>>, links: readonly string[] = []): Source => ({
  name: '@fixture/pkg',
  dependencies: ['zod'],
  files: new Map(Object.entries({ ...FIXTURE, ...added })),
  links,
});
const failing = (held: readonly Held[]): string[] => held.filter((one) => !one.passed).map((one) => one.label);

ok('self-test: the package the cases are built on passes every rule', failing(judge(FIXTURE_SHAPE, fixtureOf({}))).length === 0, failing(judge(FIXTURE_SHAPE, fixtureOf({}))).join('; '));
for (const one of [...CASES, DOOR_CASE]) {
  const bad = failing(judge(FIXTURE_SHAPE, fixtureOf(one.bad)));
  const good = failing(judge(FIXTURE_SHAPE, fixtureOf(one.good)));
  const caught = bad.includes(one.fails);
  ok(
    `self-test: fails on ${one.what}, and passes on its twin`,
    caught && good.length === 0,
    caught && good.length === 0 ? '' : `${caught ? '' : `the bad one did not fail "${one.fails}" (it failed: ${bad.join('; ') || 'nothing'}). `}${good.length === 0 ? '' : `the twin failed: ${good.join('; ')}`}`,
  );
}
const linked = failing(judge(FIXTURE_SHAPE, fixtureOf({}, ['high/low'])));
ok('self-test: fails on a link inside a module', linked.includes(READS), linked.join('; '));

// ─── the packages ────────────────────────────────────────────

for (const [name, shape] of Object.entries(PACKAGES)) {
  for (const held of judge(shape, sourceOf(join(packages, name)))) ok(`${name}: ${held.label}`, held.passed, held.detail);
}

for (const line of lines) console.log(line);
if (failed) process.exit(1);
