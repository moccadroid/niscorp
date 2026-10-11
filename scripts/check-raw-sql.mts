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
// TIDE IS SWEPT, with its Postgres store in the ledger (`store/postgres/`,
// the `@niscorp/tide/postgres` entry: three of its files), which was in moss
// until tide's hosting left it. Tide is an engine, and it is not listed with
// vex and strata, on purpose. Those two are SQL all the way through. Tide's
// engine holds none: it reaches storage through a contract of six
// capabilities, and is handed a store. Listing the whole package as a place
// SQL lives would stop this check seeing a statement written into the engine,
// which is the one thing about tide's SQL worth catching. So the store's
// numbers are held like any other file's, and a statement anywhere else in
// tide fails as a file outside the ledger.
//
// WHAT IS COUNTED, AND HOW IT IS TOLD.
//
//   A DOOR is a way to send text to a database.
//     - On a pool, by its name: `query`, `exec`, `execute` or `unsafe` on
//       something called `pool`, `tx`, `db`, `client`, `conn`, `sql` (the list
//       is `POOLS`), called or not. A name this file made from one (`const
//       conn = runtime.pool`) or wrote a pool's type on (`handle: PgPool`) is
//       one too.
//     - On anything else, by what it is handed: a call of one of those four,
//       or a tag named for one or for `sql`, that is handed text that reads as
//       SQL. The text may be a literal, a template, pieces joined by `+` or
//       `[…].join()`, a name of this file that holds one, or the `text` or
//       `sql` of an object.
//   A STATEMENT is text that reads or writes rows, and a TABLE is text that
//   makes or changes what holds them.
//     - In capitals, wherever it is written: `SELECT `, `INSERT INTO `,
//       `CREATE TABLE `.
//     - In any other case, where it is sent: handed to one of the calls or
//       tags above, to a function with `sql` in its name, or written as the
//       `sql` of an object (a strata step).
//     - A `.sql` file, statement by statement.
//
// The first version told a pool by four names and a statement by its
// capitals, and said so. `const conn = runtime.pool; conn.query('select …
// from sessions')` was neither, and counted as nothing.
//
// WHAT THIS CANNOT SEE. It reads text, one file at a time.
//   - A call under a name that says nothing (`handle.query(text)`, where
//     `handle` is not named, made or typed as a pool in that file), sending
//     text the file does not hold.
//   - A statement not in capitals that is not sent in the file that writes it:
//     kept in a constant there and sent from another file, or handed to a
//     function whose name says neither `query`, `exec`, `execute`, `unsafe`
//     nor `sql`. Where it is sent is then a door only if the first point
//     does not apply there too.
//   - Text that is no literal in a swept file: read from a file that is not
//     `.sql`, from the environment, or handed in by an app.
//   - Commands that are neither of the kinds above (`COPY`, `CALL`, `DO`,
//     `SET`, `LISTEN`): the call that sends one is a door, the text is not
//     counted.
//   - Anything outside `src/`.
// It can also count what is not SQL: a sentence that goes on like a statement
// ("select a plan from the list"), handed to something called `query`. Reword
// it, or name the call for what it does.
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

// A STATEMENT IN CAPITALS is told by how it begins, wherever it is written:
// that is how every statement in these packages is written. A sentence that
// begins "Select a plan", or the word 'update' naming an operation, is not one.
const LEAD = String.raw`^\s*(?:--[^\n]*\n\s*)*`;
const STATEMENT = new RegExp(String.raw`${LEAD}(?:SELECT\s|INSERT\s+INTO\s|UPDATE\s+\S+\s+SET\s|DELETE\s+FROM\s|WITH\s+\S+\s+AS\s|TRUNCATE\s|MERGE\s+INTO\s)`);
const MADE = 'TABLE|INDEX|EXTENSION|TYPE|VIEW|SCHEMA|SEQUENCE|FUNCTION|PROCEDURE|TRIGGER|POLICY|ROLE|DOMAIN|RULE';
const TABLE = new RegExp(String.raw`${LEAD}(?:(?:CREATE|ALTER|DROP)\s+(?:(?:OR\s+REPLACE|UNIQUE|TEMP|TEMPORARY|UNLOGGED|MATERIALIZED)\s+)*(?:${MADE})\s|(?:GRANT|REVOKE)\s[^;]*\sON\s)`);

// A STATEMENT IN ANY OTHER CASE begins the same way, and so does a sentence.
// It is counted where it is SENT (below), and nowhere else. A `select` has to
// go on as one, with a `from`, a call, `*`, a number or a parameter: "Select a
// plan" handed to a search is still a sentence.
const STATEMENT_SENT = new RegExp(String.raw`${LEAD}(?:SELECT\s+(?:[\s\S]*?\sFROM\s|[\w."]+\s*\(|\*|\d|\$)|INSERT\s+INTO\s|UPDATE\s+\S+\s+SET\s|DELETE\s+FROM\s|WITH\s+\S+\s+AS\s|TRUNCATE\s|MERGE\s+INTO\s)`, 'i');
const TABLE_SENT = new RegExp(TABLE.source, 'i');
const readsAsSql = (text: string | undefined): boolean => text !== undefined && (STATEMENT.test(text) || TABLE.test(text) || STATEMENT_SENT.test(text) || TABLE_SENT.test(text));

// WHAT SENDS TEXT TO A DATABASE, by the name it is called by: the four a
// driver's pool, client or transaction answers to.
const SENDS = /^(?:query|exec|execute|unsafe)$/;
// A function or a tag with `sql` in its name is handed SQL: a `sql` tag, and
// strata's `sqlSteps`, which sends nothing itself.
const HOLDS = /sql/i;

// The names a pool goes by. A property called `query` on anything else is data
// (tide's `select.query`, a URL's `req.query`), and `exec` on anything else is
// a regular expression: on another name a call is a door only when what it is
// handed reads as SQL.
const POOLS = /(?:^|\.)(?:pool|tx|trx|db|database|client|conn|connection|pg|pglite|sql)$/i;
// ...and the types one is written with, when the name says nothing.
const POOL_TYPES = /^(?:\w+\.)?\w*(?:Pool|PGlite|Queryable)\w*$/;

// A template's text with each `${…}` stood in for by one word, so
// `UPDATE ${table} SET …` still reads as the statement it is.
const literalText = (node: ts.Node): string | undefined => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((span) => `x${span.literal.text}`).join('');
  return undefined;
};

// What an expression is, once what is written round it is taken off.
const bare = (node: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node) || ts.isAwaitExpression(node) ? bare(node.expression) : node;

const named = (name: ts.PropertyName, pattern: RegExp): boolean => (ts.isIdentifier(name) || ts.isStringLiteral(name)) && pattern.test(name.text);

// The text a call is handed. pg takes `{ text, values }` and libsql `{ sql,
// args }` where the others take the text itself.
const handedTo = (argument: ts.Expression | undefined): ts.Expression | undefined => {
  if (argument === undefined || !ts.isObjectLiteralExpression(argument)) return argument;
  for (const property of argument.properties) if (ts.isPropertyAssignment(property) && named(property.name, /^(?:text|sql)$/)) return property.initializer;
  return undefined;
};

// `tx.query({ table: 'task', where })` is tide's own store being asked for
// rows by description. It is handed an object that holds no text, and is not
// a door.
const asksAStore = (node: ts.Node): boolean => {
  const call = node.parent;
  if (call === undefined || !ts.isCallExpression(call) || call.expression !== node) return false;
  const first = call.arguments[0];
  return first !== undefined && ts.isObjectLiteralExpression(first) && handedTo(first) === undefined;
};

// The last name of what is called, and what it is called on.
const lastName = (callee: ts.Expression): string | undefined => {
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return ts.isElementAccessExpression(callee) && ts.isStringLiteral(callee.argumentExpression) ? callee.argumentExpression.text : undefined;
};
const receiverOf = (callee: ts.Expression): ts.Expression | undefined => (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee) ? callee.expression : undefined);

// One place text is sent from. `door`: it is itself a way to the database, not
// only somewhere SQL is kept. `counted`: it is a pool's, counted by its name.
type Sent = { handed: ts.Expression | undefined; door: boolean; counted: boolean };

const sqlIn = (text: string, path = 'x.ts'): Found => {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const found: Found = { doors: 0, statements: 0, tables: 0 };
  const all: ts.Node[] = [];
  const collect = (node: ts.Node): void => {
    all.push(node);
    ts.forEachChild(node, collect);
  };
  collect(source);

  // WHAT A NAME HOLDS IN THIS FILE: everything a variable of that name is made
  // with. Scope is not followed: a name is looked up wherever it is declared.
  const bound = new Map<string, ts.Expression[]>();
  for (const node of all) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) bound.set(node.name.text, [...(bound.get(node.name.text) ?? []), node.initializer]);
  }

  // A POOL UNDER ANOTHER NAME: made from one (`const conn = runtime.pool`,
  // `const { pool: conn } = runtime`), or written with a pool's type
  // (`handle: PgPool`). Asked until no name is added, so a name made from such
  // a name is one too.
  const aliases = new Set<string>();
  const isPool = (expression: ts.Expression): boolean => {
    const receiver = bare(expression);
    return POOLS.test(receiver.getText(source)) || (ts.isIdentifier(receiver) && aliases.has(receiver.text));
  };
  for (let before = -1; before !== aliases.size; ) {
    before = aliases.size;
    for (const node of all) {
      if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && ts.isIdentifier(node.name)) {
        if (node.type !== undefined && POOL_TYPES.test(node.type.getText(source))) aliases.add(node.name.text);
        if (node.initializer !== undefined && isPool(node.initializer)) aliases.add(node.name.text);
      }
      if (ts.isBindingElement(node) && ts.isIdentifier(node.name) && named(node.propertyName ?? node.name, POOLS)) aliases.add(node.name.text);
    }
  }
  // A pool's door taken off it by name (`const { query } = pool`). It is
  // counted where it is taken, and so not again where it is called.
  const takenOffAPool = (node: ts.BindingElement): boolean =>
    named(node.propertyName ?? node.name, SENDS) && ts.isVariableDeclaration(node.parent.parent) && node.parent.parent.initializer !== undefined && isPool(node.parent.parent.initializer);
  const taken = new Set<string>();
  for (const node of all) if (ts.isBindingElement(node) && ts.isIdentifier(node.name) && takenOffAPool(node)) taken.add(node.name.text);

  // THE TEXT AN EXPRESSION COMES TO, as far as this file says: a literal, a
  // template, pieces joined by `+` or `[…].join()`, and a name that holds one.
  // What the file does not say is stood in for by one word.
  const textOf = (node: ts.Node, depth = 0): string | undefined => {
    const literal = literalText(node);
    if (literal !== undefined || depth > 4) return literal;
    if (ts.isParenthesizedExpression(node)) return textOf(node.expression, depth);
    if (ts.isIdentifier(node)) {
      const made = bound.get(node.text)?.[0];
      return made === undefined ? undefined : textOf(made, depth + 1);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = textOf(node.left, depth);
      const right = textOf(node.right, depth);
      return left === undefined && right === undefined ? undefined : `${left ?? 'x'}${right ?? 'x'}`;
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'join' && ts.isArrayLiteralExpression(node.expression.expression)) {
      const between = node.arguments[0] === undefined ? ',' : (literalText(node.arguments[0]) ?? ' ');
      return node.expression.expression.elements.map((element) => textOf(element, depth) ?? 'x').join(between);
    }
    return undefined;
  };
  // Where the text handed over is written: through a name, and down both
  // sides of a `? :`.
  const rootsOf = (expression: ts.Expression, depth = 0): ts.Expression[] => {
    const root = bare(expression);
    if (depth > 4) return [];
    if (ts.isIdentifier(root)) return (bound.get(root.text) ?? []).flatMap((made) => rootsOf(made, depth + 1));
    if (ts.isConditionalExpression(root)) return [...rootsOf(root.whenTrue, depth + 1), ...rootsOf(root.whenFalse, depth + 1)];
    return [root];
  };

  const sentBy = (node: ts.Node): Sent | undefined => {
    if (ts.isTaggedTemplateExpression(node)) {
      const tag = lastName(bare(node.tag));
      return tag !== undefined && (SENDS.test(tag) || HOLDS.test(tag)) ? { handed: node.template, door: true, counted: false } : undefined;
    }
    if (!ts.isCallExpression(node)) return undefined;
    const callee = bare(node.expression);
    const name = lastName(callee);
    const receiver = receiverOf(callee);
    if (name === undefined) return undefined;
    // `pool.query.call(pool, text)`: the same call, its receiver said twice.
    if ((name === 'call' || name === 'apply') && receiver !== undefined) {
      const inner = bare(receiver);
      const innerReceiver = receiverOf(inner);
      const second = node.arguments[1];
      const first = second !== undefined && ts.isArrayLiteralExpression(second) ? second.elements[0] : second;
      return SENDS.test(lastName(inner) ?? '') ? { handed: handedTo(first), door: true, counted: innerReceiver !== undefined && isPool(innerReceiver) } : undefined;
    }
    if (SENDS.test(name)) {
      if (receiver !== undefined && ts.isRegularExpressionLiteral(bare(receiver))) return undefined;
      const byName = receiver === undefined ? ts.isIdentifier(callee) && taken.has(callee.text) : isPool(receiver) && !asksAStore(node.expression);
      return { handed: handedTo(node.arguments[0]), door: true, counted: byName };
    }
    return HOLDS.test(name) ? { handed: handedTo(node.arguments[0]), door: false, counted: false } : undefined;
  };

  const counted = new Set<ts.Node>();
  const sent = new Set<ts.Expression>();
  for (const node of all) {
    // A POOL'S DOOR, CALLED OR NOT, as lyra's check has it: `const q =
    // pool.query` is the same door with an extra step, `pool['query']` is the
    // same door with its name on a string, and `const { query } = pool` is the
    // same door taken off it.
    if (ts.isPropertyAccessExpression(node) && SENDS.test(node.name.text) && isPool(node.expression) && !asksAStore(node)) found.doors += 1;
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) && SENDS.test(node.argumentExpression.text) && isPool(node.expression) && !asksAStore(node)) found.doors += 1;
    if (ts.isBindingElement(node) && takenOffAPool(node)) found.doors += 1;

    // A DOOR UNDER ANY OTHER NAME: a call or a tag that is handed SQL.
    const sender = sentBy(node);
    if (sender?.handed !== undefined) {
      const roots = rootsOf(sender.handed);
      for (const root of roots) sent.add(root);
      if (sender.door && !sender.counted && roots.some((root) => readsAsSql(textOf(root)))) found.doors += 1;
    }
    // A strata step and a libsql statement: `{ sql: '…' }`, wherever it is.
    if (ts.isPropertyAssignment(node) && named(node.name, /^sql$/)) for (const root of rootsOf(node.initializer)) sent.add(root);

    const literal = literalText(node);
    if (literal === undefined) continue;
    if (STATEMENT.test(literal)) found.statements += 1;
    else if (TABLE.test(literal)) found.tables += 1;
    else continue;
    counted.add(node);
  }

  // WHAT IS SENT AND WAS NOT COUNTED BY ITS CAPITALS: a statement in another
  // case, or one built from pieces, counted once for the whole of it.
  const holdsCounted = (node: ts.Node): boolean => counted.has(node) || ts.forEachChild(node, holdsCounted) === true;
  for (const root of sent) {
    const whole = holdsCounted(root) ? undefined : textOf(root);
    if (whole === undefined) continue;
    if (STATEMENT_SENT.test(whole)) found.statements += 1;
    else if (TABLE_SENT.test(whole)) found.tables += 1;
  }
  return found;
};

// A `.sql` file is SQL, whatever reads it: each statement in it is counted.
const sqlInFile = (text: string): Found => {
  const found: Found = { doors: 0, statements: 0, tables: 0 };
  for (const chunk of text.split(';')) {
    if (TABLE_SENT.test(chunk)) found.tables += 1;
    else if (chunk.trim() !== '') found.statements += 1;
  }
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
    'identity/sessions.ts': { doors: 6, statements: 6, tables: 1, why: 'credential', note: 'the session credential: a token hash is looked up before anybody is signed in' },
    // `integrations/registry.ts` is not here any more. It held every statement
    // on `integrations` and `integration_actions`, sixteen of them, and each is
    // a vex entry now (`integrations/entries.ts`), replayed through the seam a
    // feature's own entries go through. The key-hash lookup went with the rest:
    // the policy those entries run under asks for no principal.
    'integrations/tables.ts': { doors: 0, statements: 0, tables: 1, why: 'tables', note: "the integrations feature's own table sequence: frame grants, read and written through vex" },
    // `manifest/generation.ts` is not here any more. It held the last four
    // statements with no reason. Three read and moved the generation counter,
    // and are two vex entries now (`data/pointer.ts`), replayed the way a
    // feature's own are. The fourth was the counter's seed row, which is a
    // step of migration 1: it is declared with that migration now, and is the
    // one statement counted below.
    'data/tables.ts': { doors: 0, statements: 1, tables: 17, why: 'tables', note: "moss's own table sequence, as it stood in integrations.ts: history, checksummed in every ledger; the sixteenth is the unique index on an integration's key hash, appended; the seventeenth and the one statement are the generation pointer's table and its seed row, the last two steps of migration 1, declared here and not beside the code that polls" },
    'data/migrate.ts': { doors: 1, statements: 0, tables: 0, why: 'tables', note: "hands the migration's own transaction to vex's adapter to read the schema" },
  },
  tide: {
    // Was `moss/tide.ts`, with six statements. The engine's own bookkeeping
    // goes through the pool and not through a host's write path: an engine
    // claiming its own task has no principal to run a policy for. The seventh
    // statement reads and writes no row: it is the advisory lock a serial
    // group is claimed behind, so two instances cannot both claim in it.
    // It was one file, `store/postgres.ts`, with 7 doors, 7 statements and 3
    // tables. It is a directory of six now, and the same numbers are in three
    // of them.
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

// WHAT THE FIRST VERSION COUNTED AS NOTHING, each beside a twin that IS
// nothing: the same shape, and no SQL. `[doors, statements, tables]`.
type Case = { what: string; sql: string; counts: readonly [number, number, number]; twin: string };
const CASES: readonly Case[] = [
  {
    what: 'a pool under another name, sending a statement in lower case',
    sql: "const conn = runtime.pool; const rows = await conn.query('select token from sessions');",
    counts: [1, 1, 0],
    twin: "const link = runtime.wire; const rows = await link.query('token');",
  },
  {
    what: 'a pool under another name, sending text this file does not hold',
    sql: 'const handle = runtime.pool; export const run = (text: string) => handle.query(text);',
    counts: [1, 0, 0],
    twin: 'const index = runtime.search; export const run = (text: string) => index.query(text);',
  },
  {
    what: 'a pool taken off its owner under another name',
    sql: 'const { pool: handle } = runtime; export const run = (text: string) => handle.execute(text);',
    counts: [1, 0, 0],
    twin: 'const { tool: handle } = runtime; export const run = (text: string) => handle.execute(text);',
  },
  {
    what: 'a client passed in under another name, with its type written',
    sql: 'export const run = (handle: PgPool, text: string) => handle.query(text);',
    counts: [1, 0, 0],
    twin: 'export const run = (handle: SearchIndex, text: string) => handle.query(text);',
  },
  {
    what: "a pool's `query` taken off it",
    sql: "const { query } = pool; export const run = () => query('select 1 from sessions');",
    counts: [1, 1, 0],
    twin: "const { query } = route; export const run = (text: string) => query(text);",
  },
  {
    what: '`.execute(` under any name',
    sql: "export const run = (handle: Handle) => handle.execute('select 1 from sessions');",
    counts: [1, 1, 0],
    twin: 'export const run = (tool: Tool) => tool.execute(parsed.data);',
  },
  {
    what: '`.exec(` under any name',
    sql: "export const run = (handle: Handle) => handle.exec('delete from sessions');",
    counts: [1, 1, 0],
    twin: "const hit = /select a plan from the list/.exec('select a plan from the list');",
  },
  {
    what: '`.unsafe(`',
    sql: "export const run = (handle: Handle) => handle.unsafe('truncate sessions');",
    counts: [1, 1, 0],
    twin: "export const run = (handle: Handle) => handle.unsafe('at your own risk');",
  },
  {
    what: 'a `sql` tag',
    sql: 'export const run = (id: string) => sql`select * from sessions where id = ${id}`;',
    counts: [1, 1, 0],
    twin: 'export const say = (name: string) => t`Select a plan from the list, ${name}`;',
  },
  {
    what: 'a statement built with `+`',
    sql: "export const run = (handle: Handle, columns: string) => handle.query('select ' + columns + ' from sessions');",
    counts: [1, 1, 0],
    twin: "export const run = (handle: Handle, word: string) => handle.query('select ' + word);",
  },
  {
    what: 'a statement joined from a list',
    sql: "export const run = (handle: Handle) => handle.query(['select token', 'from sessions'].join(' '));",
    counts: [1, 1, 0],
    twin: "export const run = (handle: Handle) => handle.query(['token', 'sessions'].join(' '));",
  },
  {
    what: 'a statement kept in a variable',
    sql: "const text = 'delete from sessions'; export const run = (handle: Handle) => handle.query(text);",
    counts: [1, 1, 0],
    twin: "const text = 'delete from sessions'; export const run = (handle: Handle) => handle.show(text);",
  },
  {
    what: 'a statement on either side of a `? :`',
    sql: "const text = all ? 'select * from sessions' : 'select 1'; export const run = (handle: Handle) => handle.query(text);",
    counts: [1, 2, 0],
    twin: "const text = all ? 'everything' : 'one'; export const run = (handle: Handle) => handle.query(text);",
  },
  {
    what: "a statement as an object's `text`",
    sql: "export const run = () => pool.query({ text: 'select 1 from sessions', values: [] });",
    counts: [1, 1, 0],
    twin: "export const label = { text: 'Delete from the list' };",
  },
  {
    what: 'a statement in sentence case',
    sql: "export const run = (handle: Handle) => handle.query('Select token From sessions');",
    counts: [1, 1, 0],
    twin: "export const run = (index: Index) => index.query('Select a plan');",
  },
  {
    what: "a pool's door reached with `.call`",
    sql: "export const run = (handle: Handle) => handle.query.call(handle, 'select 1 from sessions');",
    counts: [1, 1, 0],
    twin: "export const run = (handle: Handle) => handle.query.call(handle, 'sessions');",
  },
  {
    what: 'a table made in lower case',
    sql: "export const run = (handle: Handle) => handle.query('create table things (id text primary key)');",
    counts: [1, 0, 1],
    twin: "export const run = (handle: Handle) => handle.query('create a table of things');",
  },
  {
    what: 'a strata step in lower case',
    sql: "export const STEPS = [{ kind: 'sql', sql: 'alter table things add column n integer' }];",
    counts: [0, 0, 1],
    twin: "export const STEPS = [{ kind: 'note', note: 'alter table things add column n integer' }];",
  },
  {
    what: 'a view, a function and a grant, which the first list of what is made left out',
    sql: "const A = 'CREATE OR REPLACE VIEW v AS SELECT 1'; const B = 'CREATE FUNCTION f() RETURNS int'; const C = 'GRANT SELECT ON things TO reader'; const D = 'TRUNCATE things';",
    counts: [0, 1, 3],
    twin: "const A = 'CREATE A VIEW OF THE ROOM'; const B = 'GRANT THEM NOTHING'; const C = 'Truncate the text';",
  },
];
for (const one of CASES) {
  const seen = sqlIn(one.sql);
  const twin = sqlIn(one.twin);
  const caught = seen.doors === one.counts[0] && seen.statements === one.counts[1] && seen.tables === one.counts[2];
  const quiet = twin.doors + twin.statements + twin.tables === 0;
  ok(`...and ${one.what}, and not its twin`, caught && quiet, caught && quiet ? '' : `${caught ? '' : `saw ${JSON.stringify(seen)}, wanted ${JSON.stringify(one.counts)}. `}${quiet ? '' : `the twin counted: ${JSON.stringify(twin)}`}`);
}
const FILE = sqlInFile('create table things (id text);\ninsert into things values (1);\n');
ok('...and a .sql file, statement by statement', FILE.tables === 1 && FILE.statements === 1, JSON.stringify(FILE));

// ─── the sweep ───────────────────────────────────────────────

// Every file of code under `src/`, whatever its extension, and every `.sql`.
// The first version read `.ts` and `.tsx`, so a statement in a `.mts` or a
// `.js` file was in a file nothing opened.
const CODE = /\.[cm]?[jt]sx?$/;
const filesIn = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? filesIn(join(dir, entry.name)) : CODE.test(entry.name) || entry.name.endsWith('.sql') ? [join(dir, entry.name)] : []));

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
    const text = readFileSync(file, 'utf8');
    const found = file.endsWith('.sql') ? sqlInFile(text) : sqlIn(text, file);
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
