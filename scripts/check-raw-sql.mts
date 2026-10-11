// Does a package above the engines run SQL of its own?
//
// nisc tells an application that its reads and writes are vex. This holds the
// packages to the same rule. Vex and strata are where SQL lives: one compiles
// and runs it, the other keeps the ledger of what ran. Every other package is
// swept, and every file in it that holds a call on a database pool or a
// statement is in the LEDGER below, with its exact numbers and why it is
// there. A file that is not in the ledger fails. A number that is off fails,
// in either direction: a statement taken out comes out of the ledger in the
// same change.
//
// Tide is swept, with its Postgres store in the ledger. Tide's engine holds no
// SQL: it reaches storage through the store contract. Listing the whole
// package as a place SQL lives would stop this check seeing a statement
// written into the engine.
//
// `pnpm check:raw-sql`. `--measure` prints what it finds and judges nothing.
// Exits non-zero on any failure.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const packages = resolve(import.meta.dirname, '..', 'packages');

// Where SQL lives. Not swept.
const ENGINES: readonly string[] = ['vex', 'strata'];

// ─── what is counted ─────────────────────────────────────────

type Found = { doors: number; statements: number; tables: number };

// Statements are told by their shape, keywords in capitals as every statement
// in these packages is written: a sentence that begins "Select a plan", or the
// word 'update' naming an operation, is not one. SQL written in lower case
// would slip past this count and still be caught at its door.
const STATEMENT = /^\s*(?:--[^\n]*\n\s*)*(?:SELECT\s|INSERT\s+INTO\s|UPDATE\s+\S+\s+SET\s|DELETE\s+FROM\s|WITH\s+\S+\s+AS\s)/;
const TABLE = /^\s*(?:--[^\n]*\n\s*)*(?:CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|EXTENSION|TYPE)\s|ALTER\s+TABLE\s|DROP\s+(?:TABLE|INDEX)\s)/;

// The names a pool goes by in these packages. A property called `query` on
// anything else is data (tide's `select.query`, a URL's `req.query`), and
// `exec` on anything else is a regular expression.
const POOLS = /(?:^|\.)(?:pool|tx|db|client)$/i;

// A template's text with each `${…}` stood in for by one word, so
// `UPDATE ${table} SET …` still reads as the statement it is.
const literalText = (node: ts.Node): string | undefined => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((span) => `x${span.literal.text}`).join('');
  return undefined;
};

// `tx.query({ table: 'task', where })` is tide's own store being asked for
// rows by description. It is handed an object, never SQL, and is not a door.
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
    // CALLED OR NOT, as lyra's check has it: `const q = pool.query` is the same
    // door with an extra step, and `pool['query']` is the same door with its
    // name on a string.
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

// ─── the ledger ──────────────────────────────────────────────
//
// `doors`: references to a pool's `query` or `exec`. `statements`: SQL that
// reads or writes rows. `tables`: SQL that makes or changes a table, which is
// how a strata sequence is written and is not what this check is about, but
// is counted so a new one is seen.
//
// `why` says which of four things a file is:
//   credential — runs before a principal exists, so there is no policy to run
//                under. This is the one kind that stays.
//   store      — an engine's own storage, in that engine's package: tide's
//                Postgres store. The engine is handed it and holds no SQL.
//   tables     — a strata sequence: what the owner of some tables migrates.
//                A row a migration writes beside its table (AGENTS.md, rule
//                17) is counted as a statement, and is part of the migration.
//   debt       — no reason. It goes through vex or it goes. NONE IS LEFT
//                (2026-10-11): the last four were the generation counter's.
//                The kind stays, so that a statement somebody argues in has
//                a name that says what it is.

type Entry = Found & { why: 'credential' | 'store' | 'debt' | 'tables'; note: string };

const LEDGER: Readonly<Record<string, Readonly<Record<string, Entry>>>> = {
  moss: {
    'identity/sessions.ts': { doors: 5, statements: 5, tables: 1, why: 'credential', note: 'the session credential: a token hash is looked up before anybody is signed in' },
    'data/tables.ts': { doors: 0, statements: 1, tables: 20, why: 'tables', note: "moss's own table sequence (`nisc.moss`): migrations that have run are history, checksummed in every ledger; the one statement is the generation pointer's seed row, a step of migration 1" },
    'data/migrate.ts': { doors: 1, statements: 0, tables: 0, why: 'tables', note: "hands the migration's own transaction to vex's adapter to read the schema" },
  },
  tide: {
    'store/postgres/store.ts': { doors: 4, statements: 4, tables: 0, why: 'store', note: "tide's Postgres store: the engine's own rows, behind the store contract: read, append, compare-and-set, remove" },
    'store/postgres/claim.ts': { doors: 3, statements: 3, tables: 0, why: 'store', note: "tide's Postgres store: the claim, the question whether a serial group is held, and the advisory lock the two run behind" },
    'store/postgres/tables.ts': { doors: 0, statements: 0, tables: 3, why: 'tables', note: "tide's own table sequence (`nisc.moss.tide`): the DDL that is migration 1, and the two columns migration 2 adds" },
  },
};

// ─── falsifiable: the sweep catches what it says it catches ──

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

// ─── the sweep ───────────────────────────────────────────────

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
