// Is a package's public API what somebody decided it is?
//
// Moss's main entry exported 135 names, and 71 of them were imported by nothing
// outside the package: its insides had become its API one export at a time,
// each added because some file needed it (docs/plans/moss-refactor.md). Nothing
// made adding one a decision.
//
// So what a package exports is a file in the repository: `api.txt` beside its
// `package.json`. This check reads the entry points and compares. Something
// exported that is not in the file fails, and so does a line in the file that
// is no longer exported: the file changes in the same diff as the export,
// where somebody reads it.
//
// WHAT A LINE IS.
//
//   `<entry> <name>`             a name the entry point exports
//   `<entry> <name>.<member>`    a member of it, one level down
//   `<entry> (<type>).<member>`  a member of a type no entry exports by name,
//                                which something this entry exports takes or
//                                answers
//
// Members are recorded because `MossServer` is one name and twenty things an
// app calls: adding the twenty-first is as much a decision as adding a name. A
// name has members when it is a type alias, an interface or a class whose type
// is an object, or a `const` that holds one. A union has none (it is several
// shapes), and neither has a function or a list. Only members THIS PACKAGE declares are
// recorded: what a type takes from another package or from the language
// (`Hono`'s methods on `MossServer`, an array's `length`) is that one's
// decision.
//
// THE THIRD FORM is for a type that is part of the API without being a name
// of it. `ShellHost.session` answers a `ShellSession`, `MossServer.socket` is
// a `SocketAccept`, `migrateTables` answers a `TablesReport`: an app calls
// their members, no entry exports the three names, and a member added to one
// moved no line. So for each exported name the check follows its signature:
// what a function takes and answers, the type of each member this package
// declares, through a union, a promise, a list or any other generic, and
// through an object written in place. Each type it meets that this package
// declares under a name, and that no entry of the package exports by that
// name, has its members recorded in brackets under that name, for each entry
// that reaches it. A type some entry does export has its lines there, once.
// Two types of one name reached from one entry are told apart by the file
// that declares each (`(Name@dir/file.ts)`).
//
// IT ASKS THE COMPILER, and does not read the entry file's syntax. The first
// version read the statements of the entry file, so `export const { a } = x`
// exported a name it did not count. Asked of the type checker, every form an
// export can be written in is a name: destructured, declared (`export declare
// const`), renamed, re-exported through any number of doors. Members are read
// off the type the name resolves to, wherever it is declared.
//
// FOUR FORMS ARE REFUSED, because each exports something this file could not
// list by name:
//
//   - `export *` and `export type *`: the API is whatever another file exports
//   - a namespace, however it is written or reached: `export namespace`,
//     `export * as ns`, `import * as ns` then `export { ns }`, or one of those
//     behind a door
//   - a default export and `export =`: a name the importer chooses
//   - an enum (rule 16 has none)
//
// IT NEEDS THE PACKAGES INSTALLED AND BUILT. A type that comes from another
// package of this repository is read from that package's `dist`. `pnpm verify`
// and CI build first; run alone on a tree that is not built, the check says
// which import did not resolve rather than report members that went missing.
//
// WHAT THIS CANNOT SEE.
//   - A signature. A member whose type changes, a function that gains a
//     parameter, a member that stops being optional: the name is the same and
//     no line moves.
//   - More than one level. `NiscRuntime.limits` is a line; what `limits`
//     holds is not. The same holds of a type in brackets: its members are
//     lines, and a type one of THEM takes or answers is not followed
//     (`ShellSession.attach` takes a `ShellConnection`, which has no lines).
//   - A type with no name of its own that is not written out in this
//     package: `Pick<Data, 'a'>`, `Omit<…>`, what a schema of another package
//     infers. Its members are computed, and there is no name to record them
//     under.
//   - What a type parameter is held to (`<E extends Env>`).
//   - A class's static members, and types added to somebody else's module
//     (`declare module`, `declare global`).
//   - Whether a name is a type or a value.
//   - That `ENTRIES` names the file each entry is built from. The keys are
//     held to `exports` in `package.json`; the file beside each key is
//     written here by hand, and the bundler's own configuration is not read.
//
// The check tests itself on every run: each form above is an entry point of a
// small package in memory that must fail, beside a twin that must pass.
//
// `pnpm check:api`. `--write` records what is exported now. Exits non-zero on
// any failure.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

const packages = resolve(import.meta.dirname, '..', 'packages');

// package → entry point (as `exports` in its package.json spells it) → source file
const ENTRIES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  moss: {
    '.': 'src/index.ts',
    './node': 'src/server/node.ts',
    './vite': 'src/server/vite.ts',
    './integrations': 'src/integrations/index.ts',
    './tide': 'src/tide/index.ts',
    './client': 'src/client/index.ts',
    './client/node': 'src/client/node.ts',
    './terminal': 'src/terminal/index.ts',
    './terminal/react': 'src/terminal/react/index.ts',
    './terminal/react/server': 'src/terminal/react/server.ts',
    './terminal/vue': 'src/terminal/vue/index.ts',
    './terminal/vue/server': 'src/terminal/vue/server.ts',
    './terminal/dom': 'src/terminal/dom/index.ts',
    './terminal/dom/server': 'src/terminal/dom/server.ts',
    './terminal/tty': 'src/terminal/tty/index.ts',
    './terminal/ink': 'src/terminal/ink/index.ts',
  },
  // Tide joined when the moss refactor gave it a new entry point, `./postgres`.
  tide: {
    '.': 'src/index.ts',
    './agent': 'src/agent/index.ts',
    './testing': 'src/testing.ts',
    './postgres': 'src/store/postgres/index.ts',
  },
};

// ─── what an entry point exports ─────────────────────────────

// TypeScript's own file names: forward slashes, whatever the machine.
const slashed = (path: string): string => path.split('\\').join('/');

// `Promise<T>`, `Map<K, V>`, `T[]`: a generic with what it was given.
const isReference = (type: ts.Type): type is ts.TypeReference =>
  (type.flags & ts.TypeFlags.Object) !== 0 && 'target' in type && 'objectFlags' in type && typeof type.objectFlags === 'number' && (type.objectFlags & ts.ObjectFlags.Reference) !== 0;

type Described = {
  // `<entry> <name>` and `<entry> <name>.<member>`, sorted
  lines: string[];
  // what an entry exports that cannot be listed by name
  refused: string[];
  // imports the entries reach that resolve to nothing: the tree is not built
  unresolved: string[];
};

const describe = (program: ts.Program, root: string, entries: Readonly<Record<string, string>>): Described => {
  const checker = program.getTypeChecker();
  const src = `${slashed(root).toLowerCase()}/src/`;
  const ours = (file: ts.SourceFile): boolean => slashed(file.fileName).toLowerCase().startsWith(src);

  // A member this package declares, or one no file declares (the keys of a
  // `Record<'a' | 'b', …>`). One that only another package or the language
  // declares is theirs.
  const declaredHere = (member: ts.Symbol): boolean => {
    const declarations = member.getDeclarations() ?? [];
    return declarations.length === 0 || declarations.some((declaration) => ours(declaration.getSourceFile()));
  };
  const membersOfType = (type: ts.Type): string[] =>
    (type.flags & ts.TypeFlags.Union) !== 0 || checker.isArrayLikeType(type)
      ? []
      : checker
          .getPropertiesOfType(type)
          .filter(declaredHere)
          .map((member) => member.getName());
  const membersOf = (symbol: ts.Symbol): string[] => {
    const asType = (symbol.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface | ts.SymbolFlags.Class)) !== 0 ? membersOfType(checker.getDeclaredTypeOfSymbol(symbol)) : [];
    const asValue = (symbol.flags & ts.SymbolFlags.Variable) !== 0 ? membersOfType(checker.getTypeOfSymbol(symbol)) : [];
    return [...new Set([...asType, ...asValue])];
  };

  // ── the types an exported signature refers to ──
  //
  // `ShellHost.session` answers a `ShellSession`, and no entry exports that
  // name: its members were lines of nothing, so one more was seen by nobody.

  // The type's own name, when this package declares it as a type alias, an
  // interface or a class.
  const namedHere = (type: ts.Type): ts.Symbol | undefined => {
    const symbol = type.aliasSymbol ?? type.getSymbol();
    const declared = (symbol?.getDeclarations() ?? []).some(
      (declaration) => (ts.isTypeAliasDeclaration(declaration) || ts.isInterfaceDeclaration(declaration) || ts.isClassDeclaration(declaration)) && ours(declaration.getSourceFile()),
    );
    return declared ? symbol : undefined;
  };
  // An object written in place in this package: `{ host: ShellHost }` as a
  // type, or as a value. It has no name, so what it holds is looked through.
  const writtenInPlace = (type: ts.Type): boolean => {
    const symbol = type.getSymbol();
    return (
      type.aliasSymbol === undefined &&
      symbol !== undefined &&
      (symbol.flags & (ts.SymbolFlags.TypeLiteral | ts.SymbolFlags.ObjectLiteral)) !== 0 &&
      (symbol.getDeclarations() ?? []).some((declaration) => ours(declaration.getSourceFile()))
    );
  };
  // Every named type of this package that `type` refers to: itself, or
  // through a union, a promise, a list or any other generic, a function's
  // parameters and what it answers, or an object written in place. A named
  // type is not looked inside: that would be a second level.
  const refer = (type: ts.Type, found: Map<ts.Symbol, ts.Type>, seen: Set<ts.Type>): void => {
    if (seen.has(type)) return;
    seen.add(type);
    // Named first: `A & { more }` under a name of its own is that name's, and
    // a union under a name has no members and is looked through.
    const named = namedHere(type);
    if (named !== undefined && membersOfType(type).length > 0) {
      found.set(named, type);
      return;
    }
    if (type.isUnionOrIntersection()) {
      for (const part of type.types) refer(part, found, seen);
      return;
    }
    for (const argument of type.aliasTypeArguments ?? []) refer(argument, found, seen);
    if (isReference(type)) for (const argument of checker.getTypeArguments(type)) refer(argument, found, seen);
    for (const signature of type.getCallSignatures()) {
      for (const parameter of signature.getParameters()) refer(checker.getTypeOfSymbol(parameter), found, seen);
      refer(signature.getReturnType(), found, seen);
    }
    if (writtenInPlace(type)) for (const property of checker.getPropertiesOfType(type)) refer(checker.getTypeOfSymbol(property), found, seen);
  };
  // What an exported name's own signature refers to: for a type, through each
  // member this package declares and through what it takes and answers when
  // it is a function; for a value, through its type.
  const referredBy = (symbol: ts.Symbol, found: Map<ts.Symbol, ts.Type>, seen: Set<ts.Type>): void => {
    const inside = (type: ts.Type): void => {
      if (type.isUnion()) for (const part of type.types) inside(part);
      for (const member of checker.getPropertiesOfType(type).filter(declaredHere)) refer(checker.getTypeOfSymbol(member), found, seen);
      for (const signature of type.getCallSignatures()) {
        for (const parameter of signature.getParameters()) refer(checker.getTypeOfSymbol(parameter), found, seen);
        refer(signature.getReturnType(), found, seen);
      }
    };
    if ((symbol.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface | ts.SymbolFlags.Class)) !== 0) inside(checker.getDeclaredTypeOfSymbol(symbol));
    if ((symbol.flags & (ts.SymbolFlags.Variable | ts.SymbolFlags.Function)) !== 0) inside(checker.getTypeOfSymbol(symbol));
  };
  // Where a type is declared, for the one case its name is not enough: two
  // types of one name reached from one entry.
  const declaredIn = (symbol: ts.Symbol): string => slashed(symbol.getDeclarations()?.[0]?.getSourceFile().fileName ?? '').slice(src.length);

  const lines: string[] = [];
  const refused: string[] = [];
  // What some entry of the package exports by name, and for each entry what
  // its exports refer to.
  const exportedByName = new Set<ts.Symbol>();
  const referredFrom = new Map<string, Map<ts.Symbol, ts.Type>>();
  for (const [entry, file] of Object.entries(entries)) {
    const source = program.getSourceFile(join(root, file));
    if (source === undefined) {
      refused.push(`${entry}: ${file} is not there`);
      continue;
    }
    const referred = new Map<ts.Symbol, ts.Type>();
    const seen = new Set<ts.Type>();
    referredFrom.set(entry, referred);
    for (const statement of source.statements) {
      if (ts.isExportDeclaration(statement) && statement.exportClause === undefined) refused.push(`${entry}: \`export *\` in ${file}`);
      if (ts.isExportAssignment(statement)) refused.push(`${entry}: ${statement.isExportEquals === true ? '`export =`' : 'a default export'} in ${file}`);
      if (ts.isNamespaceExportDeclaration(statement)) refused.push(`${entry}: \`export as namespace\` in ${file}`);
    }
    const module = checker.getSymbolAtLocation(source);
    for (const exported of module === undefined ? [] : checker.getExportsOfModule(module)) {
      const name = exported.getName();
      const target = (exported.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(exported) : exported;
      if (name === 'default' || name === 'export=') refused.push(`${entry}: a default export in ${file}`);
      else if (checker.isUnknownSymbol(target)) refused.push(`${entry}: ${name} resolves to nothing`);
      else if ((target.flags & ts.SymbolFlags.Module) !== 0) refused.push(`${entry}: ${name} is a namespace`);
      else if ((target.flags & ts.SymbolFlags.Enum) !== 0) refused.push(`${entry}: ${name} is an enum`);
      else {
        lines.push(`${entry} ${name}`, ...membersOf(target).map((member) => `${entry} ${name}.${member}`));
        exportedByName.add(target);
        referredBy(target, referred, seen);
      }
    }
  }
  // A type that an entry of the package exports by name has its lines already,
  // under that entry. Any other is recorded in brackets under its own name,
  // for each entry that reaches it: `. (ShellSession).attach`.
  for (const [entry, referred] of referredFrom) {
    const unexported = [...referred].filter(([symbol]) => !exportedByName.has(symbol));
    for (const [symbol, type] of unexported) {
      const twin = unexported.some(([other]) => other !== symbol && other.getName() === symbol.getName());
      const name = twin ? `${symbol.getName()}@${declaredIn(symbol)}` : symbol.getName();
      lines.push(...membersOfType(type).map((member) => `${entry} (${name}).${member}`));
    }
  }

  const unresolved: string[] = [];
  for (const file of program.getSourceFiles()) {
    if (!ours(file)) continue;
    for (const statement of file.statements) {
      if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) || statement.moduleSpecifier === undefined) continue;
      if (checker.getSymbolAtLocation(statement.moduleSpecifier) === undefined) unresolved.push(`${slashed(file.fileName).slice(src.length)} imports ${statement.moduleSpecifier.getText(file)}`);
    }
  }
  return { lines: [...new Set(lines)].sort(), refused: [...new Set(refused)], unresolved };
};

// ─── the rules ───────────────────────────────────────────────

type Held = { label: string; passed: boolean; detail: string };

const few = (found: readonly string[]): string => `${found.slice(0, 8).join(', ')}${found.length > 8 ? `, and ${found.length - 8} more` : ''}`;
const isMember = (line: string): boolean => (line.split(' ')[1] ?? '').includes('.');
// `<entry> (<type>).<member>`: a member of a type no entry exports by name.
const isReached = (line: string): boolean => (line.split(' ')[1] ?? '').startsWith('(');

const judge = (described: Described, recorded: readonly string[]): Held[] => {
  const added = described.lines.filter((line) => !recorded.includes(line));
  const removed = recorded.filter((line) => !described.lines.includes(line));
  const reached = described.lines.filter(isReached);
  const members = described.lines.filter(isMember).length - reached.length;
  const reachedTypes = new Set(reached.map((line) => line.slice(0, line.indexOf(').')))).size;
  return [
    {
      label: 'every import its entries reach resolves',
      passed: described.unresolved.length === 0,
      detail: described.unresolved.length === 0 ? '' : `${few(described.unresolved)} — a type from another package is read from where it is installed and built: run \`pnpm install\` and \`pnpm build\` first`,
    },
    {
      label: 'every export is a name: no `export *`, no namespace, no default, no enum',
      passed: described.refused.length === 0,
      detail: described.refused.length === 0 ? '' : `${few(described.refused)} — export each thing by its name`,
    },
    {
      label: 'every exported name, and every member of one, is in api.txt',
      passed: added.length === 0,
      detail:
        added.length === 0
          ? `${described.lines.length - members - reached.length} names, ${members} members, and ${reached.length} members of ${reachedTypes} types reached and not exported by name (a type counted for each entry that reaches it)`
          : `${few(added)} — a new export is a decision: add it to api.txt in this change, or do not export it`,
    },
    { label: 'api.txt names only what is exported', passed: removed.length === 0, detail: removed.length === 0 ? '' : `${few(removed)} — take ${removed.length === 1 ? 'it' : 'them'} out of api.txt in this change` },
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
// One small package, in memory, compiled once. Each case is two entry points
// of it. `bad` must fail against `recorded`, and `good` must pass against it.
// Where `recorded` is left out, each is held against what it exports itself,
// so only a refusal can fail it: that is what a refused form is.

const FIXTURE = '/fixture';
const INNER = `
export type Server = { close: () => void; port: number };
export interface Seams { mount: () => void }
export const made = { one: 1, two: 2 };
export const plain = 1;
`;
const REACHED = `
export type Report = { ok: boolean };
export type Wide = Report & { more: number };
export type Host = { list: () => Promise<Report[]> };
export type Pages = { page: (path: string) => { found: Report } | undefined };
export const make = (): Report => ({ ok: true });
export const widen = (wide: Wide): number => wide.more;
`;
const SHARED: Readonly<Record<string, string>> = {
  'inner.ts': INNER,
  'grown.ts': INNER.replace('port: number', 'port: number; added: () => void').replace('mount: () => void', 'mount: () => void; added: () => void').replace('two: 2', 'two: 2, added: 3'),
  'door.ts': "export type { Server, Seams } from './inner';\nexport { made } from './inner';\n",
  'grown-door.ts': "export type { Server, Seams } from './grown';\nexport { made } from './grown';\n",
  'all-door.ts': "export * as everything from './inner';\n",
  // `Report` is exported by no entry. `make` answers one; `Host` answers a
  // promise of a list of them; `Pages` holds one inside an object written in
  // place; and `Wide` is an intersection under a name of its own.
  'reached.ts': REACHED,
  'reached-grown.ts': REACHED.replace('ok: boolean', 'ok: boolean; added: string'),
};

type Case = { what: string; bad: string; good: string; recorded?: readonly string[] };

const CASES: readonly Case[] = [
  {
    what: 'a destructured export',
    bad: "import * as inner from './inner';\nexport const { made, plain: renamed } = inner;\n",
    good: 'export {};\n',
    recorded: [],
  },
  { what: 'a declared export: `export declare const`', bad: 'export declare const hidden: number;\n', good: 'export {};\n', recorded: [] },
  { what: 'a namespace written in the entry', bad: 'export namespace internals {\n  export const x = 1;\n}\n', good: 'export const x = 1;\n' },
  { what: '`export * as`', bad: "export * as everything from './inner';\n", good: "export { made, plain } from './inner';\n" },
  { what: '`export *`', bad: "export * from './inner';\n", good: "export { made, plain } from './inner';\nexport type { Server, Seams } from './inner';\n" },
  { what: '`export type *`', bad: "export type * from './inner';\n", good: "export type { Server, Seams } from './inner';\n" },
  { what: 'a namespace imported whole and exported by name', bad: "import * as everything from './inner';\nexport { everything };\n", good: "import { made } from './inner';\nexport { made };\n" },
  { what: 'a namespace behind a door', bad: "export { everything } from './all-door';\n", good: "export { made } from './door';\n" },
  { what: '`export import x = require(…)`', bad: "export import everything = require('./inner');\n", good: "export { plain } from './inner';\n" },
  { what: 'a default export', bad: 'const everything = { a: 1 };\nexport default everything;\n', good: 'export const everything = { a: 1 };\n' },
  { what: 'a default export by renaming', bad: "export { made as default } from './inner';\n", good: "export { made as renamed } from './inner';\n" },
  { what: '`export =`', bad: 'const everything = { a: 1 };\nexport = everything;\n', good: 'export const everything = { a: 1 };\n' },
  { what: 'an enum', bad: 'export enum Kind {\n  One,\n  Two,\n}\n', good: "export type Kind = 'one' | 'two';\n" },
  {
    what: 'a member added to an exported type',
    bad: 'export type Server = { close: () => void; added: () => void };\n',
    good: 'export type Server = { close: () => void };\n',
    recorded: ['x Server', 'x Server.close'],
  },
  {
    what: 'a member taken off an exported type',
    bad: 'export type Server = { close: () => void };\n',
    good: 'export type Server = { close: () => void; port?: number };\n',
    recorded: ['x Server', 'x Server.close', 'x Server.port'],
  },
  {
    what: 'a member added to a type, an interface and a const that are declared behind a door',
    bad: "export type { Server, Seams } from './grown-door';\nexport { made } from './grown-door';\n",
    good: "export type { Server, Seams } from './door';\nexport { made } from './door';\n",
    recorded: ['x Seams', 'x Seams.mount', 'x Server', 'x Server.close', 'x Server.port', 'x made', 'x made.one', 'x made.two'],
  },
  {
    what: 'a member added beside what another package declares',
    bad: "export type Kept = Map<string, number> & { ours: true; added: true };\nexport type Many = string[];\nexport const LIST = ['a', 'b'] as const;\n",
    good: "export type Kept = Map<string, number> & { ours: true };\nexport type Many = string[];\nexport const LIST = ['a', 'b'] as const;\n",
    recorded: ['x Kept', 'x Kept.ours', 'x LIST', 'x Many'],
  },
  {
    what: 'a member added to a type an exported function answers, which no entry exports by name',
    bad: "export { make } from './reached-grown';\n",
    good: "export { make } from './reached';\n",
    recorded: ['x make', 'x (Report).ok'],
  },
  {
    what: 'a member added to a type an exported member answers a promise of a list of',
    bad: "export type { Host } from './reached-grown';\n",
    good: "export type { Host } from './reached';\n",
    recorded: ['x Host', 'x Host.list', 'x (Report).ok'],
  },
  {
    what: 'a member added to a type held by an object written in place',
    bad: "export type { Pages } from './reached-grown';\n",
    good: "export type { Pages } from './reached';\n",
    recorded: ['x Pages', 'x Pages.page', 'x (Report).ok'],
  },
  {
    what: 'a member added to an intersection, under its own name, that an exported function takes',
    bad: "export { widen } from './reached-grown';\n",
    good: "export { widen } from './reached';\n",
    recorded: ['x widen', 'x (Wide).more', 'x (Wide).ok'],
  },
  {
    what: 'a type recorded as an exported name, which the entry reaches and does not export',
    bad: "export { make } from './reached';\n",
    good: "export { make } from './reached';\nexport type { Report } from './reached';\n",
    recorded: ['x make', 'x Report', 'x Report.ok'],
  },
];

const fixtureProgram = (): ts.Program => {
  const files = new Map<string, string>(Object.entries(SHARED).map(([name, text]) => [`${FIXTURE}/src/${name}`, text]));
  for (const [index, one] of CASES.entries()) {
    files.set(`${FIXTURE}/src/bad-${index}.ts`, one.bad);
    files.set(`${FIXTURE}/src/good-${index}.ts`, one.good);
  }
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, noEmit: true, types: [] };
  const host = ts.createCompilerHost(options);
  const real = { fileExists: host.fileExists, readFile: host.readFile, getSourceFile: host.getSourceFile, directoryExists: host.directoryExists };
  host.fileExists = (name) => files.has(name) || real.fileExists(name);
  host.readFile = (name) => files.get(name) ?? real.readFile(name);
  host.directoryExists = (name) => [...files.keys()].some((file) => file.startsWith(`${name}/`)) || real.directoryExists?.(name) === true;
  host.getSourceFile = (name, version, onError, fresh) => {
    const text = files.get(name);
    return text === undefined ? real.getSourceFile(name, version, onError, fresh) : ts.createSourceFile(name, text, version, true);
  };
  return ts.createProgram({ rootNames: [...files.keys()], options, host });
};

const fixture = fixtureProgram();
const failing = (file: string, recorded: readonly string[] | undefined): string[] => {
  const described = describe(fixture, FIXTURE, { x: `src/${file}` });
  return judge(described, recorded ?? described.lines)
    .filter((held) => !held.passed)
    .map((held) => `${held.label}: ${held.detail}`);
};
for (const [index, one] of CASES.entries()) {
  const bad = failing(`bad-${index}.ts`, one.recorded);
  const good = failing(`good-${index}.ts`, one.recorded);
  ok(
    `self-test: fails on ${one.what}, and passes on its twin`,
    bad.length > 0 && good.length === 0,
    bad.length > 0 && good.length === 0 ? '' : `${bad.length > 0 ? '' : 'the bad one passed. '}${good.length === 0 ? '' : `the twin failed: ${good.join('; ')}`}`,
  );
}

// ─── the packages ────────────────────────────────────────────

const programOf = (root: string, entries: Readonly<Record<string, string>>): ts.Program => {
  const config = ts.parseJsonConfigFileContent(ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile).config, ts.sys, root);
  return ts.createProgram({ rootNames: Object.values(entries).map((file) => join(root, file)), options: { ...config.options, noEmit: true } });
};

const exportsOf = (manifest: unknown): string[] =>
  typeof manifest === 'object' && manifest !== null && 'exports' in manifest && typeof manifest.exports === 'object' && manifest.exports !== null ? Object.keys(manifest.exports) : [];

const write = process.argv.includes('--write');

for (const [name, entries] of Object.entries(ENTRIES)) {
  const root = join(packages, name);
  const declared = exportsOf(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))).filter((key) => key !== './package.json');
  const missing = declared.filter((key) => entries[key] === undefined);
  const extra = Object.keys(entries).filter((key) => !declared.includes(key));
  ok(`${name}: this check knows every entry point its package.json exports`, missing.length === 0 && extra.length === 0, [...missing.map((key) => `${key} is not listed here`), ...extra.map((key) => `${key} is no longer exported`)].join('; '));

  const described = describe(programOf(root, entries), root, entries);
  const recordFile = join(root, 'api.txt');
  if (write) {
    writeFileSync(recordFile, `${described.lines.join('\n')}\n`);
    lines.push(`${name}: recorded ${described.lines.length} lines in api.txt`);
  }
  const recorded = existsSync(recordFile)
    ? readFileSync(recordFile, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
    : [];
  for (const held of judge(described, recorded)) ok(`${name}: ${held.label}`, held.passed, held.detail);
}

for (const line of lines) console.log(line);
if (failed) process.exit(1);
