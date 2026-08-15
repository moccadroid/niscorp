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
// One fragment per subject (db/schema/), composed in dependency order by the
// barrel. Every one of them is held to what the single file was held to.
const SCHEMA_DIR = 'src/db/schema/';
const fragments = FILES.filter((f) => f.path.includes(SCHEMA_DIR) && !f.path.endsWith('/index.ts'));
const barrel = FILES.find((f) => f.path.endsWith(`${SCHEMA_DIR}index.ts`));
ok('the schema is where it is expected', barrel !== undefined && fragments.length > 0, `${fragments.length} fragments + a barrel`);

const holes = fragments.flatMap((f) => [...f.text.matchAll(/\$\{/g)].map(() => f.path));
ok('no fragment splices anything in', holes.length === 0, holes.length > 0 ? `${holes.length} interpolation(s): ${[...new Set(holes)].join(', ')}` : 'constants, as they should be');

const unbalanced = fragments.filter((f) => [...f.text.matchAll(/`/g)].length % 2 !== 0);
ok('...and their template literals are balanced', unbalanced.length === 0, unbalanced.map((f) => f.path).join(', ') || `${fragments.length} fragments`);

// A fragment nobody composes is a table that does not exist — and it would fail
// silently, at boot, as a missing relation somewhere else entirely.
const orphans = fragments.filter((f) => {
  const name = f.path.slice(f.path.lastIndexOf('/') + 1, -3);
  return !(barrel?.text ?? '').includes(`from './${name}'`);
});
ok('every fragment is composed into the DDL', orphans.length === 0, orphans.map((f) => f.path).join(', ') || 'the barrel imports all of them');

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
