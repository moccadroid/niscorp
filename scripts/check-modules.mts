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
//   1. NOTHING FLAT. Only `index.ts` sits at the top of `src/`. The files that
//      have not been moved yet are named in `flat`; a file that is not there
//      fails, and a name there with no file fails too, so the list only gets
//      shorter.
//   2. ONE DOOR. Code in one module imports another module as `../<module>`,
//      never a file inside it.
//   3. DECLARED DEPENDENCIES. A module imports only the modules its entry in
//      `modules` names, and the table has no cycle.
//   4. THE CORE DOES NOT IMPORT A FEATURE. A feature (`features`) is a module
//      that owns none of the package's questions: it ships from an entry point
//      of its own and reaches the core through seams it is handed. So no
//      module that is not a feature names one in its dependencies, and no file
//      at the top of `src/` imports one, `index.ts` included: what the main
//      entry reaches would carry the feature with it.
//
// A file still flat may be imported by anything while it exists; that is what
// being in the middle of a move looks like. A module named in `finished` is no
// longer in the middle of it: everything it needs is a module, so a flat file
// it imports fails. Without that, the terminal side could go back to importing
// the server's files and rule 3 would not see it.
//
// A repo script, like check-fact-door. `pnpm check:modules`. Exits non-zero on
// any failure.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
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
      manifest: ['runtime', 'identity', 'feature'],
      data: ['runtime', 'identity', 'manifest'],
      integrations: ['runtime', 'feature', 'manifest', 'data'],
      client: ['protocol'],
      terminal: ['client'],
    },
    flat: [
      'document.ts',
      'driver.ts',
      'fabric.ts',
      'liveness.ts',
      'node.ts',
      'pages.ts',
      'server.ts',
      'shells.ts',
      'socket.ts',
      'tide.ts',
      'vite.ts',
    ],
    finished: ['runtime', 'protocol', 'feature', 'identity', 'manifest', 'data', 'integrations', 'client', 'terminal'],
    features: ['integrations'],
  },
};

const lines: string[] = [];
let failed = false;
const ok = (label: string, passed: boolean, detail = ''): void => {
  lines.push(`[${passed ? 'pass' : 'fail'}] ${label}${detail === '' ? '' : ` — ${detail}`}`);
  if (!passed) failed = true;
};

const filesIn = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [join(dir, entry.name)] : [],
  );

// Every relative module specifier a file imports or re-exports from.
const importsOf = (text: string): string[] => {
  const source = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] !== undefined && ts.isStringLiteral(node.arguments[0])) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found.filter((specifier) => specifier.startsWith('.'));
};

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

for (const [name, shape] of Object.entries(PACKAGES)) {
  const src = join(packages, name, 'src');
  const top = readdirSync(src, { withFileTypes: true });
  const flatNow = top.filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && entry.name !== 'index.ts').map((entry) => entry.name);
  const directories = top.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  const unlisted = flatNow.filter((file) => !shape.flat.includes(file));
  ok(`${name}: no new file at the top of src/`, unlisted.length === 0, unlisted.length === 0 ? `${flatNow.length} still to move` : `${unlisted.join(', ')} — put it in the module whose question it answers`);
  const gone = shape.flat.filter((file) => !flatNow.includes(file));
  ok(`${name}: the list of flat files names only files that are there`, gone.length === 0, gone.length === 0 ? '' : `${gone.join(', ')} moved: take ${gone.length === 1 ? 'it' : 'them'} off the list in this file`);

  const undeclared = directories.filter((directory) => shape.modules[directory] === undefined);
  ok(`${name}: every directory in src/ is a declared module`, undeclared.length === 0, undeclared.join(', '));
  const doorless = directories.filter((directory) => !existsSync(join(src, directory, 'index.ts')));
  ok(`${name}: every module has an index.ts`, doorless.length === 0, doorless.join(', '));
  const unknown = [
    ...Object.entries(shape.modules).flatMap(([module, needs]) => needs.filter((need) => shape.modules[need] === undefined).map((need) => `${module} names ${need}`)),
    ...shape.finished.filter((module) => shape.modules[module] === undefined).map((module) => `finished names ${module}`),
    ...shape.features.filter((module) => shape.modules[module] === undefined).map((module) => `features names ${module}`),
  ];
  ok(`${name}: every dependency named is a module`, unknown.length === 0, unknown.join('; '));
  const cycle = cycleIn(shape.modules);
  ok(`${name}: the modules have no cycle`, cycle === undefined, cycle ?? `${Object.keys(shape.modules).length} modules`);

  const deep: string[] = [];
  const undeclaredUse: string[] = [];
  const flatUse: string[] = [];
  for (const directory of directories) {
    const allowed = shape.modules[directory] ?? [];
    for (const file of filesIn(join(src, directory))) {
      for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
        const target = resolve(dirname(file), specifier);
        const parts = relative(src, target).split(sep);
        const other = parts[0] ?? '';
        if (other === '' || other === '..' || other === directory) continue;
        const here = relative(src, file).split(sep).join('/');
        // Still flat: importable by anything until it moves — but not by a
        // module that needs nothing flat any more.
        if (parts.length === 1 && !(existsSync(target) && statSync(target).isDirectory())) {
          if (shape.finished.includes(directory)) flatUse.push(`${here} imports ${other}`);
          continue;
        }
        if (!allowed.includes(other)) undeclaredUse.push(`${here} imports ${other}`);
        if (parts.length > 1 && !(parts.length === 2 && parts[1] === 'index')) deep.push(`${here} imports ${parts.join('/')}`);
      }
    }
  }
  ok(`${name}: a module imports another by its door`, deep.length === 0, deep.slice(0, 6).join('; '));
  ok(`${name}: a module imports only the modules it declares`, undeclaredUse.length === 0, undeclaredUse.slice(0, 6).join('; '));
  ok(`${name}: a finished module imports no file still flat`, flatUse.length === 0, flatUse.length === 0 ? shape.finished.join(', ') : flatUse.slice(0, 6).join('; '));

  // THE CORE DOES NOT IMPORT A FEATURE: not by a module's declared
  // dependencies, and not from a file at the top of src/ (which may otherwise
  // import anything while it waits to be moved).
  const coreNames = Object.entries(shape.modules)
    .filter(([module]) => !shape.features.includes(module))
    .flatMap(([module, needs]) => needs.filter((need) => shape.features.includes(need)).map((need) => `${module} declares ${need}`));
  const topUse: string[] = [];
  for (const entry of top) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
    for (const specifier of importsOf(readFileSync(join(src, entry.name), 'utf8'))) {
      const module = relative(src, resolve(src, specifier)).split(sep)[0] ?? '';
      if (shape.features.includes(module)) topUse.push(`${entry.name} imports ${specifier}`);
    }
  }
  ok(
    `${name}: the core does not import a feature`,
    coreNames.length === 0 && topUse.length === 0,
    coreNames.length === 0 && topUse.length === 0 ? shape.features.join(', ') : [...coreNames, ...topUse].slice(0, 6).join('; '),
  );
}

for (const line of lines) console.log(line);
if (failed) process.exit(1);
