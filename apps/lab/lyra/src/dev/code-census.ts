// Code census — how much of this application is DATA and how much is CODE.
//
// The nisc thesis (AGENTS.md) is that everything the app does is data with a
// schema, and imperative TypeScript exists only at five edges: a renderer
// primitive, an endpoint, setup, authored data, or a check. This walks the real
// TypeScript AST — not a regex — classifies every top-level declaration, and
// reports what fell outside those five.
//
// Run: pnpm --filter lyra exec tsx src/dev/code-census.ts

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

// ─── what a declaration is ───────────────────────────────────

/** DATA is an authored artifact: an object or array literal, a Zod schema, a
 *  string table. CODE is a function body. The rest is scaffolding. */
type Kind = 'data' | 'code' | 'type' | 'import' | 'reexport';

/** A comment line, in any of the three syntaxes this codebase uses. */
const COMMENT = /^\s*(\/\/|\/\*|\*|--)/;

/** The five edges AGENTS.md licenses imperative TypeScript to live at, plus
 *  `unplaced` for code that is none of them — the discipline break. */
type Edge = 'primitive' | 'endpoint' | 'setup' | 'check' | 'authored-data' | 'unplaced';

type Decl = {
  file: string;
  name: string;
  kind: Kind;
  edge: Edge;
  lines: number;
  /** Arrow functions nested inside a data literal: authored data that computes. */
  embedded: number;
  /** The declared type annotation, when there is one — `ActionDefinition`,
   *  `LayoutNode`, `CacheEntry`. What the author asserted this IS, which beats
   *  every heuristic over filenames or literal shape. */
  declared: string;
};

type FileReport = {
  file: string;
  total: number;
  blank: number;
  comment: number;
  decls: Decl[];
  /** One entry per line, so every line lands in exactly one bucket. A comment
   *  inside a data literal is a comment, not a data line — counting a
   *  declaration's whole span would bill it twice. */
  tally: Record<string, number>;
  edge: Edge;
};

// ─── which edge a file sits at ───────────────────────────────
//
// Directory decides, because the layout IS the architecture here. A file that
// cannot be placed is the finding, so the fallback is `unplaced` rather than a
// guess.
const edgeOf = (file: string): Edge => {
  if (file.startsWith('dev/')) return 'check';
  if (file.startsWith('ui/')) return 'primitive';
  if (file.startsWith('server/')) return 'endpoint';
  if (file.startsWith('db/')) return 'setup';
  if (file === 'app/app.ts' || file === 'app/action-catalog.ts' || file === 'main.tsx') return 'setup';
  // Everything else under app/ is an artifact file. A FUNCTION declared in one
  // is at none of the five edges by definition — which is the whole point of
  // asking, so it must not fall through to something comfortable.
  return 'unplaced';
};

// Setup files inside an edge that is otherwise something else.
const SETUP_FILES = new Set(['ui/registry.ts', 'server/boot.ts', 'server/runtime.ts', 'server/serve.ts', 'db/sql.ts']);

// ─── reading a declaration ───────────────────────────────────

const unwrap = (node: ts.Expression): ts.Expression => {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return unwrap(node.expression);
  if (ts.isParenthesizedExpression(node)) return unwrap(node.expression);
  if (ts.isTypeAssertionExpression(node)) return unwrap(node.expression);
  return node;
};

/** A DATA FACTORY is a local arrow function whose whole body is an object or
 *  array literal — `const page = (children) => ({ component: 'Stack', … })`.
 *  Calling one produces an artifact, so the result is authored data and the
 *  factory is not imperative code. Without this every layout built through a
 *  wrapper reads as a function call and the census lies. */
const containsFunction = (node: ts.Node): boolean => {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(node, visit);
  return found;
};

const isDataFactory = (init: ts.Expression): boolean => {
  const node = unwrap(init);
  if (!ts.isArrowFunction(node)) return false;
  const body = ts.isParenthesizedExpression(node.body) ? unwrap(node.body.expression) : node.body;
  if (!ts.isObjectLiteralExpression(body) && !ts.isArrayLiteralExpression(body)) return false;
  // `functions(session) => ({ 'members.create': async () => … })` also returns a
  // literal, but it is an endpoint REGISTRY, not an artifact. A literal holding
  // functions is code wearing a literal's shape.
  return !containsFunction(body);
};

const factoriesIn = (source: ts.SourceFile): Set<string> => {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (decl.initializer !== undefined && isDataFactory(decl.initializer)) names.add(decl.name.getText());
    }
  }
  return names;
};

/** A call that produces authored data rather than doing work: `z.object(...)`,
 *  `defineApp({...})`, or a local data factory. Everything else computes. */
const isDataCall = (node: ts.CallExpression, factories: Set<string>): boolean => {
  const text = node.expression.getText();
  return text.startsWith('z.') || text === 'defineApp' || text.endsWith('.describe') || factories.has(text);
};

const kindOfInitializer = (init: ts.Expression, factories: Set<string>): Kind => {
  const node = unwrap(init);
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return isDataFactory(node) ? 'data' : 'code';
  if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) return 'data';
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return 'data';
  if (ts.isTemplateExpression(node)) return 'data';
  if (ts.isNewExpression(node)) return 'code';
  if (ts.isCallExpression(node)) return isDataCall(node, factories) ? 'data' : 'code';
  return 'data';
};

/** Arrow functions living inside an authored literal — `context: (row) => …` on
 *  a reflex moment, a `cell` renderer. Authored data that computes. */
const embeddedFnLines = (node: ts.Node, source: ts.SourceFile): number => {
  let lines = 0;
  const visit = (n: ts.Node): void => {
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
      const start = source.getLineAndCharacterOfPosition(n.getStart(source)).line;
      const end = source.getLineAndCharacterOfPosition(n.getEnd()).line;
      lines += end - start + 1;
      return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(node, visit);
  return lines;
};

const spanOf = (node: ts.Node, source: ts.SourceFile): number => {
  const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line;
  const end = source.getLineAndCharacterOfPosition(node.getEnd()).line;
  return end - start + 1;
};

const nameOf = (node: ts.Node): string => {
  if (ts.isVariableStatement(node)) {
    const first = node.declarationList.declarations[0];
    return first === undefined ? '?' : first.name.getText();
  }
  if (ts.isFunctionDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
    return node.name === undefined ? '?' : node.name.getText();
  }
  return ts.SyntaxKind[node.kind];
};

// ─── the walk ────────────────────────────────────────────────

const census = (path: string, rel: string): FileReport => {
  const text = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = text.split('\n');

  const blank = lines.filter((l) => l.trim() === '').length;
  const comment = lines.filter((l) => COMMENT.test(l)).length;

  const fileEdge = SETUP_FILES.has(rel) ? 'setup' : edgeOf(rel);
  const factories = factoriesIn(source);
  const decls: Decl[] = [];

  for (const statement of source.statements) {
    const span = spanOf(statement, source);
    const name = nameOf(statement);

    if (ts.isImportDeclaration(statement)) {
      decls.push({ file: rel, name, kind: 'import', edge: fileEdge, lines: span, embedded: 0, declared: '' });
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      decls.push({ file: rel, name, kind: 'reexport', edge: fileEdge, lines: span, embedded: 0, declared: '' });
      continue;
    }
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      decls.push({ file: rel, name, kind: 'type', edge: fileEdge, lines: span, embedded: 0, declared: '' });
      continue;
    }
    if (ts.isFunctionDeclaration(statement)) {
      decls.push({ file: rel, name, kind: 'code', edge: fileEdge, lines: span, embedded: 0, declared: '' });
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      const first = statement.declarationList.declarations[0];
      const init = first === undefined ? undefined : first.initializer;
      const kind = init === undefined ? 'data' : kindOfInitializer(init, factories);
      const embedded = kind === 'data' && init !== undefined ? embeddedFnLines(init, source) : 0;
      const declared = first !== undefined && first.type !== undefined ? first.type.getText().replace(/<.*|\[\]$/, '') : '';
      decls.push({ file: rel, name, kind, edge: kind === 'data' ? 'authored-data' : fileEdge, lines: span, embedded, declared });
      continue;
    }
    // A bare statement at module scope: a check's script body, a boot call.
    decls.push({ file: rel, name, kind: 'code', edge: fileEdge, lines: span, embedded: 0, declared: '' });
  }

  // Line-exact attribution: walk the file once, and give each line to the
  // innermost thing that owns it. Blank and comment win over everything, so a
  // 40-line literal with 8 comment lines counts as 32 data lines.
  const owner: string[] = new Array<string>(lines.length).fill('other');
  for (const decl of decls) {
    const statement = source.statements[decls.indexOf(decl)];
    if (statement === undefined) continue;
    const from = source.getLineAndCharacterOfPosition(statement.getStart(source)).line;
    const to = source.getLineAndCharacterOfPosition(statement.getEnd()).line;
    for (let i = from; i <= to && i < lines.length; i += 1) owner[i] = decl.kind;
  }
  const tally: Record<string, number> = {};
  lines.forEach((line, i) => {
    const bucket = line.trim() === '' ? 'blank' : COMMENT.test(line) ? 'comment' : (owner[i] ?? 'other');
    tally[bucket] = (tally[bucket] ?? 0) + 1;
  });

  return { file: rel, total: lines.length, blank, comment, decls, tally, edge: fileEdge };
};

// ─── discipline checks (rule 16 + the thesis) ────────────────

type Break = { file: string; line: number; what: string; detail: string; inChecks: boolean };

const RULES: { what: string; test: RegExp; skip?: RegExp }[] = [
  { what: 'any', test: /(:\s*any\b|<any>|as any\b)/ },
  { what: 'type assertion', test: /\bas\s+(?!const\b)[A-Z{(]/ },
  { what: 'non-null !', test: /[A-Za-z_\])]!\.|[A-Za-z_\])]!\s*[;,)\]]/ },
  { what: 'enum', test: /^\s*(export\s+)?enum\s/ },
  { what: 'class', test: /^\s*(export\s+)?(abstract\s+)?class\s/ },
  { what: 'default export', test: /^\s*export\s+default\b/ },
  { what: 'function declaration', test: /^\s*(export\s+)?function\s/ },
];

const disciplineBreaks = (path: string, rel: string): Break[] => {
  // The census names every banned construct in its own rule table, so scanning
  // itself reports its own regexes as violations.
  if (rel === 'dev/code-census.ts') return [];
  const lines = readFileSync(path, 'utf8').split('\n');
  const found: Break[] = [];
  const inChecks = rel.startsWith('dev/');
  lines.forEach((line, i) => {
    if (COMMENT.test(line)) return;
    for (const rule of RULES) {
      if (rule.test.test(line)) found.push({ file: rel, line: i + 1, what: rule.what, detail: line.trim().slice(0, 90), inChecks });
    }
  });
  return found;
};

// A component that reaches for the app is a feature component in disguise
// (rule 2). A layout or action that formats is rule 9.
const architectureBreaks = (path: string, rel: string): Break[] => {
  const text = readFileSync(path, 'utf8');
  const found: Break[] = [];
  if (rel.startsWith('ui/')) {
    for (const [i, line] of text.split('\n').entries()) {
      if (/from '(\.\.\/)*(app|server|db)\//.test(line) || /@lyra\/(app|server|db)/.test(line)) {
        found.push({ file: rel, line: i + 1, what: 'component imports the app', detail: line.trim().slice(0, 90), inChecks: false });
      }
    }
  }
  if (rel.startsWith('app/actions/') || rel.startsWith('app/vex/')) {
    for (const [i, line] of text.split('\n').entries()) {
      if (COMMENT.test(line)) continue;
      if (/\bfetch\s*\(/.test(line)) found.push({ file: rel, line: i + 1, what: 'fetch outside an endpoint', detail: line.trim().slice(0, 90), inChecks: false });
      if (/\.toLocaleDateString|\.toFixed\(|Intl\.NumberFormat/.test(line)) {
        found.push({ file: rel, line: i + 1, what: 'formatting outside a prism', detail: line.trim().slice(0, 90), inChecks: false });
      }
    }
  }
  // A domain noun in a component name is a feature component in disguise (rule 2).
  if (rel.startsWith('ui/components/')) {
    const DOMAIN = /\b(Member|Class|Booking|Plan|Staff|Course|Studio|Invoice|Lead|Enrol)[A-Z]\w*/;
    for (const [i, line] of text.split('\n').entries()) {
      if (COMMENT.test(line)) continue;
      const hit = /^export const (\w+): NovaComponent/.exec(line);
      if (hit !== null && hit[1] !== undefined && DOMAIN.test(hit[1])) {
        found.push({ file: rel, line: i + 1, what: 'domain noun in a component name', detail: hit[1], inChecks: false });
      }
    }
  }
  return found;
};

// ─── collect ─────────────────────────────────────────────────

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });

const ROOT = 'src';
const files = walk(ROOT).sort();
const reports = files.map((f) => census(f, relative(ROOT, f).replace(/\\/g, '/')));
const breaks = files.flatMap((f) => {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  return [...disciplineBreaks(f, rel), ...architectureBreaks(f, rel)];
});

// ─── report ──────────────────────────────────────────────────

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;
const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;
const amber = (s: string): string => `\x1b[33m${s}\x1b[0m`;

const sum = (ns: number[]): number => ns.reduce((a, b) => a + b, 0);
const allDecls = reports.flatMap((r) => r.decls);

const tallied = (bucket: string): number => sum(reports.map((r) => r.tally[bucket] ?? 0));
const dataLines = tallied('data');
const codeLines = tallied('code');
const typeLines = tallied('type');
const importLines = tallied('import') + tallied('reexport');
const embedded = sum(allDecls.map((d) => d.embedded));

const totalLines = sum(reports.map((r) => r.total));
const commentLines = tallied('comment');
const blankLines = tallied('blank');
const otherLines = tallied('other');

// Every line lands in exactly one bucket, or the report is lying.
const counted = dataLines + codeLines + typeLines + importLines + commentLines + blankLines + otherLines;
if (counted !== totalLines) {
  console.error(`census: attributed ${counted} lines of ${totalLines} — the tally is wrong, do not trust this run.`);
  process.exit(1);
}

const pct = (n: number, of: number): string => `${((n / of) * 100).toFixed(1)}%`;
const row = (label: string, n: number, of: number): string => `  ${label.padEnd(26)} ${String(n).padStart(6)}  ${pct(n, of).padStart(6)}`;

console.log(`\n${bold('LYRA — CODE CENSUS')}`);
console.log(dim(`  ${files.length} files, ${totalLines} lines\n`));

console.log(bold('  What the lines are'));
console.log(row('authored data', dataLines, totalLines));
console.log(row('imperative code', codeLines, totalLines));
console.log(row('types', typeLines, totalLines));
console.log(row('imports', importLines, totalLines));
console.log(row('comments', commentLines, totalLines));
console.log(row('blank', blankLines, totalLines));
if (otherLines > 0) console.log(row('unattributed', otherLines, totalLines));

const substantive = dataLines + codeLines;
console.log(`\n${bold('  Data vs code')} ${dim('(ignoring imports, types, comments, blank)')}`);
console.log(row('authored data', dataLines, substantive));
console.log(row('imperative code', codeLines, substantive));
console.log(dim(`\n  ${embedded} of the data lines are arrow functions inside literals`));

// ── what the data actually IS ──
//
// Not all authored data is a nisc artifact. SQL DDL and demo fixtures are data
// in the plain sense and would flatter the ratio if left folded in, so they are
// counted apart from the nova/vex/charter surface the thesis is about.
console.log(`\n${bold('  What the data is')}`);
const dataIn = (test: (f: string) => boolean): number =>
  sum(reports.filter((r) => test(r.file)).map((r) => r.tally['data'] ?? 0));
const buckets: [string, number][] = [
  ['vex entries (queries/writes)', dataIn((f) => f.startsWith('app/vex/'))],
  ['actions + layouts + prisms', dataIn((f) => f.startsWith('app/actions/'))],
  ['charter, nav, reflexes', dataIn((f) => /^app\/(charter|nav|reflexes|prisms|shell)\//.test(f))],
  ['component prop schemas (ui/)', dataIn((f) => f.startsWith('ui/'))],
  ['SQL schema (db/schema/)', dataIn((f) => f.startsWith('db/schema/'))],
  ['demo fixtures (db/seed/)', dataIn((f) => f.startsWith('db/seed/'))],
  ['other', 0],
];
const named = sum(buckets.map(([, n]) => n));
buckets[buckets.length - 1] = ['other', dataLines - named];
for (const [label, n] of buckets) if (n > 0) console.log(row(label, n, dataLines));

const niscArtifacts = sum(
  buckets.filter(([l]) => !l.startsWith('SQL') && !l.startsWith('demo')).map(([, n]) => n),
);
const nonFixture = niscArtifacts + codeLines;
console.log(`\n${dim('  Excluding SQL and fixtures, the app itself is')} ${bold(pct(niscArtifacts, nonFixture))} ${dim('data.')}`);

// THE MEASURE THAT ACTUALLY TESTS THE THESIS.
//
// A ratio over the whole tree mostly measures how big the component kit is — a
// rich kit of domain-blind primitives is the thesis working, and it drags the
// number down. What the thesis claims is narrower: the APPLICATION layer, the
// part that says what this product does, is data and not code. Everything under
// app/ except the manifest is exactly that layer.
const appLayer = (bucket: string): number =>
  sum(reports.filter((r) => r.file.startsWith('app/') && !SETUP_FILES.has(r.file) && r.file !== 'app/app.ts' && r.file !== 'app/action-catalog.ts').map((r) => r.tally[bucket] ?? 0));
const layerData = appLayer('data');
const layerCode = appLayer('code');
console.log(`\n${bold('  The application layer')} ${dim('(app/ — what this product DOES)')}`);
console.log(row('authored data', layerData, layerData + layerCode));
console.log(row('imperative code', layerCode, layerData + layerCode));

// ── where the code lives ──
console.log(`\n${bold('  Where the imperative code lives')}`);
const EDGES: Edge[] = ['primitive', 'endpoint', 'setup', 'check', 'unplaced'];
const LABEL: Record<Edge, string> = {
  primitive: 'renderer primitives (ui/)',
  endpoint: 'endpoints (server/)',
  setup: 'setup + fixtures',
  check: 'checks (dev/)',
  'authored-data': 'authored data',
  unplaced: 'unnamed by the five',
};
for (const edge of EDGES) {
  const n = sum(reports.filter((r) => r.edge === edge).map((r) => r.tally['code'] ?? 0));
  if (n === 0) continue;
  const label = LABEL[edge];
  console.log(edge === 'unplaced' ? amber(row(label, n, codeLines)) : row(label, n, codeLines));
}

// Code in an artifact file is outside the five edges by definition. That is not
// automatically a break — the thesis names three specific ones (a React feature
// component, a fetch-and-massage helper, an inline formatter) and a selector
// over an authored table is none of them. Listed so a human judges it.
const unplacedFiles = new Set(reports.filter((r) => r.edge === 'unplaced').map((r) => r.file));
const unplaced = allDecls.filter((d) => d.kind === 'code' && unplacedFiles.has(d.file));
if (unplaced.length > 0) {
  console.log(`\n${amber('  Functions in artifact files')} ${dim('— judge each; a selector over an authored table is fine')}`);
  for (const d of unplaced.sort((a, b) => b.lines - a.lines).slice(0, 12)) {
    console.log(`    ${d.file}  ${dim(`${d.name} (${d.lines} lines)`)}`);
  }
}

// ── the artifact surface ──
console.log(`\n${bold('  The authored surface')}`);
const countDecl = (test: (d: Decl) => boolean): number => allDecls.filter(test).length;
const artifacts: [string, number][] = [
  ['action definitions', countDecl((d) => d.declared === 'ActionDefinition')],
  ['layouts', countDecl((d) => d.declared === 'LayoutNode')],
  ['prism configs', countDecl((d) => /\.prism\.ts$/.test(d.file) && d.kind === 'data')],
  ['vex entries', countDecl((d) => d.file.startsWith('app/vex/') && d.kind === 'data' && d.file.endsWith('entries.ts'))],
  ['input schemas (rule 14)', countDecl((d) => d.name.endsWith('InputSchema'))],
];
for (const [label, n] of artifacts) console.log(`  ${label.padEnd(26)} ${String(n).padStart(6)}`);

// ── discipline ──
console.log(`\n${bold('  Discipline (rule 16 + the thesis)')}`);
if (breaks.length === 0) {
  console.log(green('  ✓ no breaks'));
} else {
  const byWhat = new Map<string, Break[]>();
  for (const b of breaks) byWhat.set(b.what, [...(byWhat.get(b.what) ?? []), b]);
  for (const [what, list] of [...byWhat.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const app = list.filter((b) => !b.inChecks);
    const split = app.length === list.length ? '' : dim(`  (${app.length} in the app, ${list.length - app.length} in checks)`);
    console.log(amber(`  ${String(list.length).padStart(3)} × ${what}`) + split);
    for (const b of (app.length > 0 ? app : list).slice(0, 4)) console.log(dim(`        ${b.file}:${b.line}  ${b.detail}`));
    const shown = Math.min(4, (app.length > 0 ? app : list).length);
    if (list.length > shown) console.log(dim(`        …and ${list.length - shown} more`));
  }
}

// ── grade ──
//
// The scale is this file's, not the specification's — AGENTS.md states the
// thesis and names the five edges but sets no ratio. What it can measure without
// judgement is the two hard rules: code outside the five edges, and rule 16.
// Graded on the APPLICATION layer, not the whole tree: a rich kit of
// domain-blind primitives is the thesis succeeding, and grading the tree-wide
// ratio would mark it down for that.
const dataShare = layerData / (layerData + layerCode);
const unplacedLines = sum(reports.filter((r) => r.edge === 'unplaced').map((r) => r.tally['code'] ?? 0));
const appBreaks = breaks.filter((b) => !b.inChecks).length;
const grade =
  dataShare >= 0.95 && appBreaks === 0 ? 'A'
  : dataShare >= 0.95 && appBreaks < 50 ? 'A−'
  : dataShare >= 0.85 ? 'B+'
  : dataShare >= 0.7 ? 'B'
  : 'C';

console.log(`\n${bold('  Verdict')}`);
console.log(`  ${pct(layerData, layerData + layerCode)} of the application layer is authored data.`);
console.log(`  ${unplacedLines} lines of code sit in artifact files, unnamed by the five edges.`);
console.log(`  ${breaks.length} rule-16 break(s) — ${appBreaks} of them in the app, the rest in checks.`);
console.log(`\n  ${bold(`Grade: ${grade}`)} ${dim('(this file\'s scale; AGENTS.md sets no ratio)')}\n`);

// ── what the app weighs once it is data on a wire ────────────
//
// Booted behind a flag: it needs the manifest, and the AST pass above does not.
if (process.argv.includes('--wire')) {
  const { CATALOG_DEFINITIONS } = await import('@lyra/app/action-catalog');
  const { ENTRIES, MUTATION_ENTRIES } = await import('@lyra/app/vex');
  const { CHARTER } = await import('@lyra/app/charter/charter');
  const { AREAS } = await import('@lyra/app/nav/sections');
  const { RESOURCES } = await import('@lyra/app/vex/resources');
  const { scopeBehaviors } = await import('@lyra/app/vex/behaviors');
  const { MOMENTS, EFFECTS } = await import('@lyra/app/reflexes/compose');
  const { RECIPES } = await import('@lyra/app/reflexes/recipes');

  const asJson = (v: unknown): string =>
    JSON.stringify(v, (_k, val) => (typeof val === 'function' ? '<fn>' : val)) ?? '';

  // No tokenizer is installed, so this is bounded rather than measured.
  // Minified JSON runs ~36% punctuation, which is why the prose heuristic of
  // 4 chars/token reads low; BPE merges common runs (`","`, `":{"`) but not
  // arbitrary ones. 2.4–2.9 chars/token brackets it for this shape of payload.
  const tokens = (s: string): [number, number] => [Math.round(s.length / 2.9), Math.round(s.length / 2.4)];

  const parts: [string, unknown][] = [
    ['action definitions', CATALOG_DEFINITIONS],
    ['vex read entries', ENTRIES],
    ['vex mutation entries', MUTATION_ENTRIES],
    ['charter', CHARTER],
    ['scope behaviors', scopeBehaviors],
    ['vex resources', RESOURCES],
    ['nav taxonomy', AREAS],
    ['automation moments + effects', [MOMENTS, EFFECTS]],
    ['automation recipes', RECIPES],
  ];

  console.log(bold('  The app as a payload'));
  console.log(dim('    artifact                        chars     ~tokens'));
  let chars = 0;
  for (const [name, value] of parts) {
    const s = asJson(value);
    chars += s.length;
    const [lo, hi] = tokens(s);
    console.log(`    ${name.padEnd(28)} ${String(s.length).padStart(8)}  ${`${lo}–${hi}`.padStart(13)}`);
  }
  const [lo, hi] = tokens('x'.repeat(chars));
  console.log(`    ${bold('TOTAL'.padEnd(28))} ${String(chars).padStart(8)}  ${bold(`${lo}–${hi}`.padStart(13))}`);
  console.log(dim(`\n    ${(chars / 1024).toFixed(0)} KB minified\n`));
}

// ── every file holding imperative code, so the total is auditable ──
if (process.argv.includes('--code')) {
  console.log(bold('  Every file with imperative code'));
  const withCode = reports.filter((r) => (r.tally['code'] ?? 0) > 0);
  const ORDER: Edge[] = ['primitive', 'endpoint', 'setup', 'unplaced', 'check'];
  let running = 0;
  for (const edge of ORDER) {
    const here = withCode.filter((r) => r.edge === edge).sort((a, b) => (b.tally['code'] ?? 0) - (a.tally['code'] ?? 0));
    if (here.length === 0) continue;
    const total = sum(here.map((r) => r.tally['code'] ?? 0));
    console.log(`\n  ${bold(LABEL[edge])} ${dim(`— ${total} lines, ${here.length} files`)}`);
    for (const r of here) {
      running += r.tally['code'] ?? 0;
      console.log(`    ${String(r.tally['code'] ?? 0).padStart(5)}  ${r.file}`);
    }
  }
  console.log(dim(`\n  ${running} lines across ${withCode.length} files\n`));
}

// ── per directory, so every number above is auditable ──
if (process.argv.includes('--by-dir')) {
  console.log(bold('  By directory'));
  const dirOf = (f: string): string => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '.');
  const dirs = [...new Set(allDecls.map((d) => dirOf(d.file)))].sort();
  console.log(dim('    dir'.padEnd(42) + 'data    code'));
  for (const dir of dirs) {
    const dLines = sum(reports.filter((r) => dirOf(r.file) === dir).map((r) => r.tally["data"] ?? 0));
    const cLines = sum(reports.filter((r) => dirOf(r.file) === dir).map((r) => r.tally["code"] ?? 0));
    if (dLines + cLines === 0) continue;
    console.log(`    ${dir.padEnd(38)} ${String(dLines).padStart(6)}  ${String(cLines).padStart(6)}`);
  }
  console.log('');
}
