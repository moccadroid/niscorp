// Run: pnpm --filter lyra exec tsx src/dev/held-state-check.ts
//
// WHAT THIS APPLICATION HOLDS IN MEMORY, and which kind of holding it is.
//
// The post-mortem in docs/plans/lyra-identity.md turns on one fact: nothing in
// this repo inspected module-level mutable state. `sql-check` polices HOW SQL is
// written and does it well; nothing policed who may hold its RESULTS, or for how
// long. So a resident copy of the population grew across three files, survived
// review by the people who had written the post-mortem about it, and was found
// by a reviewer reading a file for an unrelated reason.
//
// The discriminator is `assigned from a query result`. Four kinds of held state
// exist here and only ONE is a defect:
//
//   row-backed cache   — written inside a loader from rows. THE DEFECT.
//   authored constant  — a literal, never written again. Legitimate data.
//   late-bound singleton — `let x: T | undefined`, assigned once at boot.
//   bounded memo       — keyed by an argument over an authored key space
//                        (`DAY_FORMAT`, one formatter per IANA zone). Module
//                        level and mutable, and not a defect: its key space is
//                        bounded by a standard rather than by the population,
//                        and dropping it loses nothing.
//
// The fourth kind is the one the plan's Part 8.2 did not have, and without it a
// rule sharp enough to catch the directory also condemns a formatter cache.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { ok, report } from './assert';

type Kind = 'row-backed' | 'authored' | 'singleton' | 'memo';
type Finding = { file: string; name: string; kind: Kind; why: string };

// ─── the classifier, over one source file ────────────────────

const ASSIGN = new Set([
  ts.SyntaxKind.EqualsToken,
  // `x[k] ??= v` is an assignment, and it is the shape every memo in this
  // codebase is written in. Matching only `=` was the first bug this file's own
  // self-test caught: the rule found no writes at all and quietly classified a
  // formatter cache as inert authored data.
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
]);

/** Every identifier in this function whose value CAME FROM a query result.
 *
 *  "Assigned inside a function that queries" was the second bug the self-test
 *  caught: `boot()` both queries and assigns a driver singleton, and the coarse
 *  rule condemned the driver. The discriminator the plan actually names is
 *  `assigned FROM a query result`, so the value has to be traced, not the
 *  function it sits in. Two passes reach the row through `const r = await
 *  pool.query(...)` and then `for (const row of r.rows)`. */
const rowDerived = (fn: ts.Node): Set<string> => {
  const names = new Set<string>();
  const mentions = (n: ts.Node): boolean => {
    let hit = false;
    const visit = (x: ts.Node): void => {
      if (ts.isPropertyAccessExpression(x) && x.name.text === 'rows') hit = true;
      if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) && x.expression.name.text === 'query') hit = true;
      if (ts.isIdentifier(x) && names.has(x.text)) hit = true;
      ts.forEachChild(x, visit);
    };
    visit(n);
    return hit;
  };
  for (let pass = 0; pass < 3; pass += 1) {
    const visit = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer !== undefined && mentions(n.initializer)) names.add(n.name.text);
      if ((ts.isForOfStatement(n) || ts.isForInStatement(n)) && mentions(n.expression)) {
        const d = ts.isVariableDeclarationList(n.initializer) ? n.initializer.declarations[0] : undefined;
        if (d !== undefined && ts.isIdentifier(d.name)) names.add(d.name.text);
      }
      // A LOCAL FILLED FROM ROWS IS ITSELF ROWS. `loadDirectory` builds a plain
      // local in a loop and publishes it in one statement at the end, so the
      // module binding is never assigned from anything that mentions a row —
      // which is how the canonical example escaped this rule on its first
      // draft. Laundering rows through an intermediate must not launder them
      // past the check that exists to find them.
      if (ts.isBinaryExpression(n) && ASSIGN.has(n.operatorToken.kind) && mentions(n.right)) {
        const left = n.left;
        const root = ts.isPropertyAccessExpression(left) || ts.isElementAccessExpression(left) ? left.expression : left;
        if (ts.isIdentifier(root)) names.add(root.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(fn);
  }
  return names;
};

/** The nearest enclosing function-ish node, or undefined at module scope. */
const enclosingFunction = (node: ts.Node): ts.Node | undefined => {
  let cursor: ts.Node | undefined = node.parent;
  while (cursor !== undefined) {
    if (ts.isFunctionDeclaration(cursor) || ts.isArrowFunction(cursor) || ts.isFunctionExpression(cursor) || ts.isMethodDeclaration(cursor)) return cursor;
    cursor = cursor.parent;
  }
  return undefined;
};

/** Every place this binding is MUTATED, anywhere in the file. */
const writesTo = (source: ts.SourceFile, name: string): ts.Node[] => {
  const writes: ts.Node[] = [];
  const isTarget = (e: ts.Expression): boolean => {
    const root = ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e) ? e.expression : e;
    return ts.isIdentifier(root) && root.text === name;
  };
  const visit = (n: ts.Node): void => {
    // x = ..., x[k] = ..., x.y = ...
    if (ts.isBinaryExpression(n) && ASSIGN.has(n.operatorToken.kind) && isTarget(n.left)) writes.push(n);
    // x.set(...), x.push(...), x.clear()
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ['set', 'push', 'clear', 'delete'].includes(n.expression.name.text) && isTarget(n.expression.expression)) {
      writes.push(n);
    }
    // delete x[k]
    if (ts.isDeleteExpression(n) && isTarget(n.expression)) writes.push(n);
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(source, visit);
  return writes;
};

/** Does this write take its value from a function ARGUMENT rather than a row? */
const fromArgument = (write: ts.Node, source: ts.SourceFile): boolean => {
  const fn = enclosingFunction(write);
  if (fn === undefined) return false;
  const params = new Set(
    (fn as ts.FunctionLikeDeclaration).parameters.flatMap((p) => (ts.isIdentifier(p.name) ? [p.name.text] : [])),
  );
  if (params.size === 0) return false;
  let uses = false;
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && params.has(n.text)) uses = true;
    ts.forEachChild(n, visit);
  };
  visit(write);
  void source;
  return uses;
};

export const heldStateIn = (text: string, file = 'inline.ts'): Finding[] => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const findings: Finding[] = [];

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    // Exported or not is irrelevant — what matters is that it outlives a request.
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      const name = decl.name.text;
      const isLet = (statement.declarationList.flags & ts.NodeFlags.Const) === 0;
      const writes = writesTo(source, name);

      if (writes.length === 0 && !isLet) continue; // a const literal nobody rewrites: authored data

      const inLoader = writes.some((w) => {
        const fn = enclosingFunction(w);
        if (fn === undefined) return false;
        const rows = rowDerived(fn);
        if (rows.size === 0) return false;
        // The VALUE has to come from the rows, not merely sit in the same
        // function as a query.
        let fromRows = false;
        const visit = (n: ts.Node): void => {
          if (ts.isIdentifier(n) && rows.has(n.text)) fromRows = true;
          if (ts.isPropertyAccessExpression(n) && n.name.text === 'rows') fromRows = true;
          ts.forEachChild(n, visit);
        };
        visit(w);
        return fromRows;
      });

      if (inLoader) {
        findings.push({ file, name, kind: 'row-backed', why: 'assigned inside a function that queries the database' });
        continue;
      }
      if (writes.length > 0 && writes.every((w) => fromArgument(w, source))) {
        findings.push({ file, name, kind: 'memo', why: 'keyed by an argument, not by a row' });
        continue;
      }
      if (isLet && writes.length > 0) {
        findings.push({ file, name, kind: 'singleton', why: 'assigned once, late — neither cache nor constant' });
        continue;
      }
      findings.push({ file, name, kind: 'authored', why: 'written, but never from a query result' });
    }
  }
  return findings;
};

// ─── the falsifiable self-test ───────────────────────────────
//
// A rule that matches nothing passes trivially. Following sql-check and
// separation-check: assert this catches a known-bad example, and does not flag
// the three known-good ones.

const BAD = `
const DIRECTORY: Record<string, unknown> = {};
export const load = async (pool: Pool): Promise<void> => {
  const result = await pool.query('SELECT id FROM people');
  for (const row of result.rows) DIRECTORY[String(row.id)] = row;
};
`;

// THE SHAPE THE REAL DEFECT WAS ACTUALLY WRITTEN IN, which the first draft of
// this rule missed: the rows go into a plain local, and the module binding is
// published in one statement at the end that mentions no row at all. A rule
// tested only against the obvious spelling is a rule that passes while the thing
// it was written for sits three lines away.
const BAD_LAUNDERED = `
let DIRECTORY: Record<string, unknown> = {};
export const load = async (pool: Pool): Promise<void> => {
  const result = await pool.query('SELECT id FROM people');
  const next: Record<string, unknown> = {};
  for (const row of result.rows) next[String(row.id)] = row;
  DIRECTORY = next;
};
`;

const GOOD_CONST = `const AUDIENCE_OF: Record<string, string> = { owner: 'owner', desk: 'desk' };`;

const GOOD_MEMO = `
const DAY_FORMAT: Record<string, Intl.DateTimeFormat> = {};
export const dayIn = (timezone: string): string =>
  (DAY_FORMAT[timezone] ??= new Intl.DateTimeFormat('en-CA', { timeZone: timezone })).format(new Date());
`;

const GOOD_SINGLETON = `
let driver: Driver | undefined;
export const start = (): void => { driver = createDriver(); };
`;

const kindOf = (src: string, name: string): Kind | undefined => heldStateIn(src).find((f) => f.name === name)?.kind;

ok('the rule catches a row-backed cache', kindOf(BAD, 'DIRECTORY') === 'row-backed', String(kindOf(BAD, 'DIRECTORY')));
ok('...including one laundered through a local first', kindOf(BAD_LAUNDERED, 'DIRECTORY') === 'row-backed', String(kindOf(BAD_LAUNDERED, 'DIRECTORY')));
ok('...and does not condemn an authored constant', kindOf(GOOD_CONST, 'AUDIENCE_OF') !== 'row-backed', String(kindOf(GOOD_CONST, 'AUDIENCE_OF')));
ok('...nor a memo keyed by an argument', kindOf(GOOD_MEMO, 'DAY_FORMAT') === 'memo', String(kindOf(GOOD_MEMO, 'DAY_FORMAT')));
ok('...nor a late-bound singleton', kindOf(GOOD_SINGLETON, 'driver') === 'singleton', String(kindOf(GOOD_SINGLETON, 'driver')));

// ─── the application, measured ───────────────────────────────

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });

const files = walk('src').filter((f) => !f.includes(`${'dev'}${'/'}`) && !f.includes('\\dev\\'));
const found = files.flatMap((f) => heldStateIn(readFileSync(f, 'utf8'), relative('src', f).replace(/\\/g, '/')));
const rowBacked = found.filter((f) => f.kind === 'row-backed');

// THE CACHES THE PLAN IS IN THE MIDDLE OF DELETING, named one by one rather than
// waved through as a count. A baseline that says "twelve is fine" is how this
// class comes back; a list that names each one is a list somebody has to shorten
// on purpose. Every entry here has a line in docs/plans/lyra-identity.md § 7.3.
const SCHEDULED = new Set(['DIRECTORY', 'BY_EMAIL', 'INSTALLED', 'AUTOMATION', 'TIMEZONES', 'COUNTRIES', 'LOCALES', 'CURRENCIES', 'BY_STUDIO', 'BY_LOCALE', 'THEMES', 'PHRASES']);

const unscheduled = rowBacked.filter((f) => !SCHEDULED.has(f.name));

console.log(`\n  held state outside dev/: ${found.length} bindings — ${rowBacked.length} row-backed, ${found.filter((f) => f.kind === 'memo').length} memo, ${found.filter((f) => f.kind === 'singleton').length} singleton, ${found.filter((f) => f.kind === 'authored').length} authored`);
for (const f of rowBacked) console.log(`    ${SCHEDULED.has(f.name) ? 'scheduled' : 'NEW      '}  ${f.file.padEnd(28)} ${f.name}`);

ok(
  'no row-backed cache exists that the plan has not already scheduled for deletion',
  unscheduled.length === 0,
  unscheduled.length === 0 ? `${rowBacked.length} known, all named in 7.3` : unscheduled.map((f) => `${f.file}:${f.name}`).join(', '),
);

// The list must SHRINK. An entry that no longer exists is progress; one that is
// still here is a debt somebody can see.
const stillHeld = new Set(rowBacked.map((f) => f.name));
const gone = [...SCHEDULED].filter((n) => !stillHeld.has(n));
console.log(`  ${gone.length} of ${SCHEDULED.size} scheduled caches are already gone${gone.length > 0 ? `: ${gone.join(', ')}` : ''}`);

ok('the identity path holds nothing of its own', heldStateIn(readFileSync('src/server/identity.ts', 'utf8')).filter((f) => f.kind === 'row-backed').length === 0, 'the seam that replaced the directory must not have grown one');

report('held state is classified rather than counted: the defect is a cache assigned from a query result, and the three legitimate kinds are named.');
