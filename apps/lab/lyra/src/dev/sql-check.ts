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
const schema = FILES.find((f) => f.path.endsWith('src/db/schema.ts'));
ok('the schema file is where it is expected', schema !== undefined, 'src/db/schema.ts');
const holes = [...(schema?.text ?? '').matchAll(/\$\{/g)].length;
ok('the DDL splices nothing in', holes === 0, holes > 0 ? `${holes} interpolation(s) in the schema` : 'a constant, as it should be');

const ticks = [...(schema?.text ?? '').matchAll(/`/g)].length;
ok('...and its template literals are balanced', ticks % 2 === 0, `${ticks} backticks`);

// ── no query is built by splicing ────────────────────────────
const SPLICED = /\.query(?:<[^>]*>)?\(\s*`[^`]*\$\{/gs;
// This file holds the counterexample below on purpose, so it excludes itself —
// the only exclusion, and it is named rather than pattern-matched.
// This file holds the counterexample below, so it excludes itself — the only
// exclusion, and named rather than pattern-matched.
const offenders = FILES.filter((f) => !f.path.endsWith('src/dev/sql-check.ts'))
  .filter((f) => new RegExp(SPLICED.source, 's').test(f.text))
  .map((f) => f.path);
ok(
  'no query is assembled with an interpolated value',
  offenders.length === 0,
  offenders.length > 0 ? `use $1 params: ${offenders.join(', ')}` : `${FILES.length} files clean`,
);

// Falsifiable: the assertion above passes trivially if the pattern matches
// nothing.
const BAD = "await db.query(`SELECT * FROM people WHERE id = '${id}'`)";
const GOOD = "await db.query(`SELECT * FROM people WHERE id = $1`, [id])";
ok('...and the rule catches a spliced query', new RegExp(SPLICED.source, 's').test(BAD));
ok('...without flagging a parameterised one', !new RegExp(SPLICED.source, 's').test(GOOD), 'params are the fix, not avoiding template literals');

report('SQL is written, not assembled — the schema is a constant and every value is a parameter.');
