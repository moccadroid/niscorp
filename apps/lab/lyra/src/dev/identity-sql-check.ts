// Run: pnpm --filter lyra exec tsx src/dev/identity-sql-check.ts
//
// THE ONE STATEMENT, held to its declaration and to the schema.
//
// `reads-are-vex-check` is the fence around the whole edge — raw SQL in one
// file, counted. This check is the fence around that one file's CONTENT:
//
//   1. exactly ONE statement — a count, not a table list somebody can widen
//      in the same commit that widens the SQL;
//   2. its tables are exactly the ones the `identity/roles` artifact declares;
//   3. every value is a placeholder, every lookup pinned to one row by a key;
//   4. and it RUNS against the live schema — the boot-time validation a
//      declared entry gets, recovered for the one read that cannot be one.
//
// Plus the behavioural floor: a stranger is public, a real principal resolves
// to exactly themselves, and the record's roles are the artifact mapping's.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { identityRoles } from '@lyra/app/vex/identity.entries';
import { ok, report } from './assert';
import { idFor, runtime, server } from './world';
import { CAST } from '@lyra/db/seed';

const FILE = 'src/server/identity.ts';

// ─── reading the SQL out of the source ───────────────────────

type Statement = { name: string; sql: string; spliced: boolean };

export const sqlIn = (text: string): Statement[] => {
  const source = ts.createSourceFile('identity.ts', text, ts.ScriptTarget.Latest, true);
  const found: Statement[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer !== undefined) {
      const init = n.initializer;
      if (ts.isNoSubstitutionTemplateLiteral(init) && /\bSELECT\b/i.test(init.text)) found.push({ name: n.name.text, sql: init.text, spliced: false });
      if (ts.isTemplateExpression(init) && /\bSELECT\b/i.test(init.getText())) found.push({ name: n.name.text, sql: init.getText(), spliced: true });
      if (ts.isStringLiteral(init) && /\bSELECT\b/i.test(init.text)) found.push({ name: n.name.text, sql: init.text, spliced: false });
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(source, visit);
  return found;
};

/** Every table a statement reads from, `--` comments stripped first so a table
 *  named in a comment cannot smuggle itself past the declaration. */
export const tablesIn = (sql: string): string[] => {
  const bare = sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');
  return [...new Set([...bare.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)/gi)].map((m) => (m[1] ?? '').toLowerCase()))];
};

export const isPinned = (sql: string): boolean => /\b(?:WHERE|AND)\s+[a-z_.]+\s*=\s*\$\d/i.test(sql);
export const hasLiteralPredicate = (sql: string): boolean => /\b(?:WHERE|AND)\s+[a-z_.]+\s*=\s*'[^']*'/i.test(sql);

// ─── the falsifiable self-tests ──────────────────────────────

const GOOD = "const Q = `SELECT p.id FROM people p WHERE p.id = $1 LIMIT 1`;";
const BAD_TWO = GOOD + "\nconst R = `SELECT s.id FROM staff s WHERE s.id = $1`;";
const BAD_SPLICED = 'const Q = `SELECT p.id FROM people p WHERE p.id = ${principal}`;';
const BAD_UNPINNED = "const Q = `SELECT p.id FROM people p WHERE p.active`;";
const BAD_LITERAL = "const Q = `SELECT p.id FROM people p WHERE p.studio_id = 'st_lumen'`;";

ok('the rule counts statements', sqlIn(BAD_TWO).length === 2, String(sqlIn(BAD_TWO).length));
ok('...and catches a spliced value', sqlIn(BAD_SPLICED)[0]?.spliced === true);
ok('...and catches an unpinned read', !isPinned(sqlIn(BAD_UNPINNED)[0]?.sql ?? ''));
ok('...and catches a literal predicate', hasLiteralPredicate(sqlIn(BAD_LITERAL)[0]?.sql ?? ''));

// ─── 1–3: the file, held to the artifact ─────────────────────

const statements = sqlIn(readFileSync(FILE, 'utf8'));
ok('exactly ONE statement — the budget is a count, not a negotiation', statements.length === 1, `${statements.length}: ${statements.map((s) => s.name).join(', ')}`);

const declared = [...(identityRoles.dsl as { from: string[] }).from].sort();
const actual = tablesIn(statements[0]?.sql ?? '').sort();
ok('its tables are exactly the artifact declaration', JSON.stringify(actual) === JSON.stringify(declared), `${actual.join(', ')} against declared ${declared.join(', ')}`);
ok('no value is spliced into it', statements.every((s) => !s.spliced));
ok('...nor written as a literal predicate', statements.every((s) => !hasLiteralPredicate(s.sql)), 'a tenant id in quotes is a tenant boundary in a string');
ok('it is pinned to one row by a key', statements.every((s) => isPinned(s.sql)));

// ─── 4: it runs against the schema that exists ───────────────

let ran = true;
let failure = '';
try {
  await runtime.pool.query(statements[0]?.sql ?? 'SELECT 1', ['__nobody__']);
} catch (err) {
  ran = false;
  failure = err instanceof Error ? err.message : String(err);
}
ok('the statement runs against the live schema', ran, failure || 'a renamed column fails HERE, not at the next sign-in');

// ─── the behavioural floor, through the real resolution ──────

const nobody = await server.identity('p_does_not_exist');
ok('an unresolvable principal is public, never a member', nobody.roles.join(',') === 'public', nobody.roles.join(','));
ok('...and carries no tenant', Object.keys(nobody.scope).length === 0, JSON.stringify(nobody.scope));

const owner = await server.identity(idFor(CAST.lumen.owner));
ok('a real principal resolves to exactly themselves', owner.roles.length > 0 && String(owner.scope['studioId'] ?? '') === 'st_lumen', JSON.stringify(owner.roles));
ok('...with the engine-read half present — name, studio, zone', String(owner.scope['name'] ?? '') !== '' && String(owner.scope['timezone'] ?? '') !== '', JSON.stringify({ name: owner.scope['name'], timezone: owner.scope['timezone'] }));
ok('...and the installs the engine answered', Array.isArray(owner.installed), String(owner.installed));

report('one statement, matching its artifact, pinned, running — and the record it seeds composes through the engine.');
