// Is a package's public API what somebody decided it is?
//
// Moss's main entry exported 135 names, and 71 of them were imported by nothing
// outside the package: its insides had become its API one export at a time,
// each added because some file needed it (docs/plans/moss-refactor.md). Nothing
// made adding one a decision.
//
// So the names a package exports are a file in the repository: `api.txt`
// beside its `package.json`, one line per name per entry point. This check
// reads the entry points and compares. A name that is exported and not in the
// file fails, and so does a name in the file that is no longer exported: the
// file changes in the same diff as the export, where somebody reads it.
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
    './protocol': 'src/server/protocol.ts',
    './unverified': 'src/server/unverified.ts',
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
};

const lines: string[] = [];
let failed = false;
const ok = (label: string, passed: boolean, detail = ''): void => {
  lines.push(`[${passed ? 'pass' : 'fail'}] ${label}${detail === '' ? '' : ` — ${detail}`}`);
  if (!passed) failed = true;
};

// Every name an entry file exports. `export *` is refused: it makes the API
// whatever another file happens to export.
const exportedBy = (text: string): { names: string[]; stars: number } => {
  const source = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true);
  const names: string[] = [];
  let stars = 0;
  const exported = (node: ts.Node): boolean => ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause === undefined) stars += 1;
      else if (ts.isNamedExports(statement.exportClause)) for (const element of statement.exportClause.elements) names.push(element.name.text);
      else stars += 1;
      continue;
    }
    if (!exported(statement)) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
    } else if ((ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name !== undefined) {
      names.push(statement.name.text);
    }
  }
  return { names: [...new Set(names)].sort(), stars };
};

const write = process.argv.includes('--write');

for (const [name, entries] of Object.entries(ENTRIES)) {
  const root = join(packages, name);
  const declared = Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).exports ?? {}).filter((key) => key !== './package.json');
  const missing = declared.filter((key) => entries[key] === undefined);
  const extra = Object.keys(entries).filter((key) => !declared.includes(key));
  ok(`${name}: this check knows every entry point its package.json exports`, missing.length === 0 && extra.length === 0, [...missing.map((key) => `${key} is not listed here`), ...extra.map((key) => `${key} is no longer exported`)].join('; '));

  const now: string[] = [];
  for (const [entry, file] of Object.entries(entries)) {
    const { names, stars } = exportedBy(readFileSync(join(root, file), 'utf8'));
    ok(`${name} ${entry}: no \`export *\``, stars === 0, stars === 0 ? '' : `${file} re-exports everything from ${stars} file${stars === 1 ? '' : 's'}`);
    for (const exportedName of names) now.push(`${entry} ${exportedName}`);
  }
  now.sort();

  const recordFile = join(root, 'api.txt');
  if (write) {
    writeFileSync(recordFile, `${now.join('\n')}\n`);
    lines.push(`${name}: recorded ${now.length} names in api.txt`);
    continue;
  }
  const recorded = existsSync(recordFile) ? readFileSync(recordFile, 'utf8').split('\n').map((line) => line.trim()).filter((line) => line !== '') : [];
  const added = now.filter((line) => !recorded.includes(line));
  const removed = recorded.filter((line) => !now.includes(line));
  ok(
    `${name}: every exported name is in api.txt`,
    added.length === 0,
    added.length === 0 ? `${now.length} names` : `${added.slice(0, 8).join(', ')}${added.length > 8 ? `, and ${added.length - 8} more` : ''} — a new export is a decision: add it to api.txt in this change, or do not export it`,
  );
  ok(`${name}: api.txt names only what is exported`, removed.length === 0, removed.length === 0 ? '' : `${removed.slice(0, 8).join(', ')}${removed.length > 8 ? `, and ${removed.length - 8} more` : ''} — take ${removed.length === 1 ? 'it' : 'them'} out of api.txt in this change`);
}

for (const line of lines) console.log(line);
if (failed) process.exit(1);
