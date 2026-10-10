// Does a package above the engines run SQL of its own?
//
// nisc tells an application that its reads and writes are vex, and lyra is
// held to it by a check of its own (`apps/lab/lyra/src/dev/reads-are-vex-check.ts`:
// one raw statement in the whole app, "a count, not a negotiation"). Nothing
// held a PACKAGE to it. Moss said "reads are vex, writes are vex" in its design
// document and grew thirty-nine statements against its own tables, and no
// build went red, because the rule was checked in one app and nowhere else.
//
// This is that check, for the packages. Vex and strata are where SQL lives:
// one compiles and runs it, the other keeps the ledger of what ran. Every
// other package is swept, and every file in it that holds a door to the pool
// or a statement is in the LEDGER below, with its exact numbers and why it is
// there. A file that is not in the ledger fails. A number that is off fails,
// in either direction: a statement taken out has to come out of the ledger in
// the same change, so the count goes down in a diff somebody reads and never
// up without one.
//
// TIDE IS SWEPT, with one file in the ledger: its Postgres store
// (`store/postgres.ts`, the `@niscorp/tide/postgres` entry), which was in moss
// until tide's hosting left it. Tide is an engine, and it is not listed with
// vex and strata, on purpose. Those two are SQL all the way through. Tide's
// engine holds none: it reaches storage through a contract of six
// capabilities, and is handed a store. Listing the whole package as a place
// SQL lives would stop this check seeing a statement written into the engine,
// which is the one thing about tide's SQL worth catching. So the store's
// numbers are held like any other file's, and a statement anywhere else in
// tide fails as a file outside the ledger.
//
// A repo script, like check-fact-door: reading a package's source is a repo
// concern, not something a package ships.
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
// `why` says which of three things a file is:
//   credential — runs before a principal exists, so there is no policy to run
//                under. This is the one kind that stays.
//   store      — an engine's own storage, in that engine's package: tide's
//                Postgres store. The engine is handed it and holds no SQL.
//   debt       — no reason. It goes through vex or it goes.

type Entry = Found & { why: 'credential' | 'store' | 'debt' | 'tables'; note: string };

const LEDGER: Readonly<Record<string, Readonly<Record<string, Entry>>>> = {
  moss: {
    'identity/sessions.ts': { doors: 6, statements: 6, tables: 1, why: 'credential', note: 'the session credential: a token hash is looked up before anybody is signed in' },
    // `integrations/registry.ts` is not here any more. It held every statement
    // on `integrations` and `integration_actions`, sixteen of them, and each is
    // a vex entry now (`integrations/entries.ts`), replayed through the seam a
    // feature's own entries go through. The key-hash lookup went with the rest:
    // the policy those entries run under asks for no principal.
    'integrations/tables.ts': { doors: 0, statements: 0, tables: 1, why: 'tables', note: "the integrations feature's own table sequence: frame grants, read and written through vex" },
    'manifest/generation.ts': { doors: 3, statements: 4, tables: 1, why: 'debt', note: 'the generation counter' },
    'data/tables.ts': { doors: 0, statements: 0, tables: 16, why: 'tables', note: "moss's own table sequence, as it stood in integrations.ts: history, checksummed in every ledger; the sixteenth is the unique index on an integration's key hash, appended" },
    'data/migrate.ts': { doors: 1, statements: 0, tables: 0, why: 'tables', note: "hands the migration's own transaction to vex's adapter to read the schema" },
  },
  tide: {
    // Was `moss/tide.ts`, with six statements. The engine's own bookkeeping
    // goes through the pool and not through a host's write path: an engine
    // claiming its own task has no principal to run a policy for. The seventh
    // statement reads and writes no row: it is the advisory lock a serial
    // group is claimed behind, so two instances cannot both claim in it.
    'store/postgres.ts': { doors: 7, statements: 7, tables: 3, why: 'store', note: "tide's Postgres store: the engine's own rows, behind the store contract, and one advisory lock" },
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
