// SQL THAT IS NOT SPLICED TOGETHER.
//
// Two failures, one rule.
//
// THE ONE THAT COST TIME. `db/schema.ts` holds the whole DDL in one template
// literal. Every edit to it goes through a script, and a script that writes a
// stray backtick or a stray `${` produces a file TypeScript parses as something
// else entirely — once as 14,827 lines. `tsc` catches the version that fails to
// parse; it does NOT catch a `${...}` that happens to be a valid expression,
// which silently rewrites the schema.
//
// THE ONE THAT MATTERS MORE. Application SQL with a value interpolated into it
// is an injection, whatever the value looks like today. Vex closes this for
// everything on the wire — the grammar takes `$context`, never a fragment — so
// the only place it can appear is server code and dev checks talking to the
// database directly. This is the guard for those.
//
// Dev checks are held to it too, deliberately: `clock-check` builds two studios
// by splicing ids into DDL, and while none of that is user input, a check is
// the one place a habit gets learned and then copied into a server file.
//
// Run: pnpm --filter lyra exec tsx src/dev/sql-check.ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ok, report } from './world';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
  });

const FILES = walk('src').map((path) => ({ path: path.replace(/\\/g, '/'), text: readFileSync(path, 'utf8') }));
ok('there is source to check', FILES.length > 20, `${FILES.length} files`);

// ── the schema is a constant ─────────────────────────────────
//
// No interpolation at all. It describes tables; there is nothing about it that
// varies at runtime, so anything that looks like a hole in it IS one.
const schema = FILES.find((f) => f.path.endsWith('src/db/schema.ts'));
ok('the schema file is where it is expected', schema !== undefined, 'src/db/schema.ts');
const holes = [...(schema?.text ?? '').matchAll(/\$\{/g)].length;
ok('the DDL splices nothing in', holes === 0, holes > 0 ? `${holes} interpolation(s) in the schema` : 'a constant, as it should be');

// Backticks come in pairs. An odd count means a literal ran on into the code
// after it — the exact shape of the 14,827-line file.
const ticks = [...(schema?.text ?? '').matchAll(/`/g)].length;
ok('...and its template literals are balanced', ticks % 2 === 0, `${ticks} backticks`);

// ── no query is built by splicing ────────────────────────────
//
// Matched on the CALL rather than on every template literal: a template
// literal in a comment or a label is fine, and `.query(`…${x}`…)` is the
// shape that reaches a database.
const SPLICED = /\.query(?:<[^>]*>)?\(\s*`[^`]*\$\{/gs;
// This file holds the counterexample below on purpose, so it excludes itself —
// the only exclusion, and it is named rather than pattern-matched.
const offenders = FILES.filter((f) => !f.path.endsWith('src/dev/sql-check.ts'))
  .filter((f) => new RegExp(SPLICED.source, 's').test(f.text))
  .map((f) => f.path);
ok(
  'no query is assembled with an interpolated value',
  offenders.length === 0,
  offenders.length > 0 ? `use $1 params: ${offenders.join(', ')}` : `${FILES.length} files clean`,
);

// FALSIFIABLE. The assertion above passes trivially if the pattern matches
// nothing, so prove it fires on the shape it is meant to catch — and does not
// fire on the parameterised version of the same query.
const BAD = "await db.query(`SELECT * FROM people WHERE id = '${id}'`)";
const GOOD = "await db.query(`SELECT * FROM people WHERE id = $1`, [id])";
ok('...and the rule catches a spliced query', new RegExp(SPLICED.source, 's').test(BAD));
ok('...without flagging a parameterised one', !new RegExp(SPLICED.source, 's').test(GOOD), 'params are the fix, not avoiding template literals');

report('SQL is written, not assembled — the schema is a constant and every value is a parameter.');
