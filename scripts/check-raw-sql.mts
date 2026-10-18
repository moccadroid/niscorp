// Fails when a package other than vex and strata holds SQL outside the ledger below, or a different
// number of pool calls, statements or table statements than the ledger says, in either direction.
// `--measure` prints what it finds and judges nothing.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const packages = resolve(import.meta.dirname, '..', 'packages');

const ENGINES: readonly string[] = ['vex', 'strata'];

type Found = { doors: number; statements: number; tables: number };

// Statements are told by their shape, with keywords in capitals: a sentence beginning "Select a plan"
// is not one. SQL in lower case slips past this count and is still caught at its door.
const STATEMENT = /^\s*(?:--[^\n]*\n\s*)*(?:SELECT\s|INSERT\s+INTO\s|UPDATE\s+\S+\s+SET\s|DELETE\s+FROM\s|WITH\s+\S+\s+AS\s)/;
const TABLE = /^\s*(?:--[^\n]*\n\s*)*(?:CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|EXTENSION|TYPE)\s|ALTER\s+TABLE\s|DROP\s+(?:TABLE|INDEX)\s)/;

// A property called `query` on anything else is data (tide's `select.query`, a URL's `req.query`),
// and `exec` on anything else is a regular expression.
const POOLS = /(?:^|\.)(?:pool|tx|db|client)$/i;

// Each `${…}` is stood in for by one word, so `UPDATE ${table} SET …` still reads as a statement.
const literalText = (node: ts.Node): string | undefined => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((span) => `x${span.literal.text}`).join('');
  return undefined;
};

// `tx.query({ table: 'task', where })` asks tide's store for rows by description: an object, never SQL.
const asksAStore = (node: ts.Node): boolean => {
  const call = node.parent;
  if (call === undefined || !ts.isCallExpression(call) || call.expression !== node) return false;
  const first = call.arguments[0];
  return first !== undefined && ts.isObjectLiteralExpression(first);
};

const sqlIn = (text: string): Found => {
  const source = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true);
  const found: Found = { doors: 0, statements: 0, tables: 0 };
  const visit = (node: ts.Node): void => {
    // Called or not: `const q = pool.query` is the same door, and so is `pool['query']`.
    if (
      ts.isPropertyAccessExpression(node) &&
      (node.name.text === 'query' || node.name.text === 'exec') &&
      POOLS.test(node.expression.getText(source)) &&
      !asksAStore(node)
    ) {
      found.doors += 1;
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteral(node.argumentExpression) &&
      (node.argumentExpression.text === 'query' || node.argumentExpression.text === 'exec') &&
      POOLS.test(node.expression.getText(source)) &&
      !asksAStore(node)
    ) {
      found.doors += 1;
    }
    const literal = literalText(node);
    if (literal !== undefined) {
      if (STATEMENT.test(literal)) found.statements += 1;
      else if (TABLE.test(literal)) found.tables += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

// doors: references to a pool's `query` or `exec`. statements: SQL that reads or writes rows.
// tables: SQL that makes or changes a table, counted so that a new one is seen.

type Entry = Found & { why: 'credential' | 'store' | 'debt' | 'tables'; note: string };

const LEDGER: Readonly<Record<string, Readonly<Record<string, Entry>>>> = {
  moss: {
    'identity/sessions.ts': { doors: 5, statements: 5, tables: 1, why: 'credential', note: 'the session credential: a token hash is looked up before anybody is signed in' },
    'data/tables.ts': { doors: 0, statements: 1, tables: 24, why: 'tables', note: "moss's own table sequence (`nisc.moss`): migrations that have run are history, checksummed in every ledger; the one statement is the generation pointer's seed row, a step of migration 1" },
    'data/aging.ts': { doors: 2, statements: 2, tables: 0, why: 'store', note: "the sweep over what a person generated and nobody used for `runtime.artifactsUnusedMs`: vex keeps every statement to one principal's rows, and this one crosses them all, so it is raw, here and nowhere else" },
    'data/migrate.ts': { doors: 1, statements: 0, tables: 0, why: 'tables', note: "hands the migration's own transaction to vex's adapter to read the schema" },
  },
  tide: {
    'store/postgres/store.ts': { doors: 4, statements: 4, tables: 0, why: 'store', note: "tide's Postgres store: the engine's own rows, behind the store contract: read, append, compare-and-set, remove" },
    'store/postgres/claim.ts': { doors: 3, statements: 3, tables: 0, why: 'store', note: "tide's Postgres store: the claim, the question whether a serial group is held, and the advisory lock the two run behind" },
    'store/postgres/tables.ts': { doors: 0, statements: 0, tables: 3, why: 'tables', note: "tide's own table sequence (`nisc.moss.tide`): the DDL that is migration 1, and the two columns migration 2 adds" },
  },
};

const lines: string[] = [];
let failed = false;
const ok = (label: string, passed: boolean, detail = ''): void => {
  lines.push(`[${passed ? 'pass' : 'fail'}] ${label}${detail === '' ? '' : ` — ${detail}`}`);
  if (!passed) failed = true;
};

const BAD = "export const themeFor = async (pool: PgPool) => { const r = await pool.query('SELECT tokens FROM themes'); return r.rows; };";
const ALIASED = "const q = deps.pool.query; export const rows = async () => (await q(`SELECT 1 FROM ${'t'}`)).rows;";
const BRACKETED = "export const rows = async (pool: PgPool) => (await pool['query']('DELETE FROM sessions')).rows;";
const NOT_SQL =
  "const id = c.req.query('id'); const hit = PATTERN.exec(url); const what = step.select.query; const say = 'Select a plan'; const op: 'update' | 'delete' = 'update'; const [task] = await tx.query({ table: 'task' });";
const IN_A_TEMPLATE = 'const run = (table: string) => client.query(`UPDATE ${table} SET n = n + 1 WHERE id = $1`, [1]);';
const MAKES_A_TABLE = "const DDL = `CREATE TABLE things (id text PRIMARY KEY)`;";
ok('the sweep sees a raw query', sqlIn(BAD).doors === 1 && sqlIn(BAD).statements === 1, JSON.stringify(sqlIn(BAD)));
ok('...and one hidden behind an alias, with its SQL in a template', sqlIn(ALIASED).doors === 1 && sqlIn(ALIASED).statements === 1, JSON.stringify(sqlIn(ALIASED)));
ok('...and one named on a string', sqlIn(BRACKETED).doors === 1 && sqlIn(BRACKETED).statements === 1, JSON.stringify(sqlIn(BRACKETED)));
ok('...and one whose table is filled in', sqlIn(IN_A_TEMPLATE).doors === 1 && sqlIn(IN_A_TEMPLATE).statements === 1, JSON.stringify(sqlIn(IN_A_TEMPLATE)));
ok(
  "...and does not take a URL parameter, a regular expression, a data field, a sentence, an operation's name or tide's store for one",
  JSON.stringify(sqlIn(NOT_SQL)) === '{"doors":0,"statements":0,"tables":0}',
  JSON.stringify(sqlIn(NOT_SQL)),
);
ok('...and tells making a table from reading one', sqlIn(MAKES_A_TABLE).tables === 1 && sqlIn(MAKES_A_TABLE).statements === 0, JSON.stringify(sqlIn(MAKES_A_TABLE)));

const filesIn = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [join(dir, entry.name)] : [],
  );

const swept = readdirSync(packages, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !ENGINES.includes(entry.name))
  .map((entry) => entry.name)
  .sort();

const measured = new Map<string, Found>();
for (const name of swept) {
  const source = join(packages, name, 'src');
  let files: string[] = [];
  try {
    files = filesIn(source);
  } catch {
    continue; // a package with no src/ holds no SQL
  }
  for (const file of files) {
    const found = sqlIn(readFileSync(file, 'utf8'));
    if (found.doors + found.statements + found.tables === 0) continue;
    measured.set(`${name}/${relative(source, file).split(sep).join('/')}`, found);
  }
}

if (process.argv.includes('--measure')) {
  for (const [file, found] of [...measured].sort()) console.log(`${file}  doors ${found.doors}  statements ${found.statements}  tables ${found.tables}`);
  process.exit(0);
}

const ledger = new Map<string, Entry>();
for (const [name, files] of Object.entries(LEDGER)) for (const [file, entry] of Object.entries(files)) ledger.set(`${name}/${file}`, entry);

const strays = [...measured].filter(([file]) => !ledger.has(file));
ok(
  'no file outside the ledger holds SQL',
  strays.length === 0,
  strays.map(([file, found]) => `${file} (doors ${found.doors}, statements ${found.statements}, tables ${found.tables})`).join('; ') || `${swept.length} packages swept`,
);

for (const [file, entry] of [...ledger].sort()) {
  const found = measured.get(file) ?? { doors: 0, statements: 0, tables: 0 };
  const same = found.doors === entry.doors && found.statements === entry.statements && found.tables === entry.tables;
  const more = found.doors > entry.doors || found.statements > entry.statements || found.tables > entry.tables;
  ok(
    `${file} holds what the ledger says (${entry.why})`,
    same,
    same
      ? `doors ${entry.doors}, statements ${entry.statements}, tables ${entry.tables}`
      : `found doors ${found.doors}, statements ${found.statements}, tables ${found.tables}; the ledger says ${entry.doors}, ${entry.statements}, ${entry.tables} — ${
          more ? 'SQL was added: put it through vex, or argue the number in this file' : 'SQL was taken out: lower the number in this file in the same change'
        }`,
  );
}

const sum = (why: Entry['why'], pick: (entry: Entry) => number): number => [...ledger.values()].filter((entry) => entry.why === why).reduce((total, entry) => total + pick(entry), 0);
lines.push(
  `statements that read or write rows outside vex: ${sum('debt', (e) => e.statements)} with no reason, ${sum('store', (e) => e.statements)} in tide's own store, ${sum('credential', (e) => e.statements)} credential`,
);

for (const line of lines) console.log(line);
if (failed) process.exit(1);
