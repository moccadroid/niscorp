// Run: pnpm --filter lyra exec tsx src/dev/identity-sql-check.ts
//
// THE ONE QUERY THAT DOES NOT PASS THROUGH THE ENGINE, pinned.
//
// A vex read needs a compiled ScopePolicy; a policy compiles from roles; roles
// come from identity. The read that resolves a principal therefore cannot be
// authorised, because authorisation needs its answer. Every system has this, and
// `server/identity.ts` is this one's whole answer to it.
//
// That exception was licensed on a specific promise (docs/plans/lyra-identity.md
// Part 4): ONE row, on demand, for the principal presenting a token. Nothing in
// the type system holds anybody to that promise. `acl-check`, `scope-check`,
// `visibility-check` and `reachable-check` all reason about DECLARED vex
// entries — so identity, being hand-written SQL, is the one thing in this
// application none of them can see. That blindness is not hypothetical: it is
// the same blindness that let the entire roster be served to anonymous requests
// from the login screen for as long as it was there.
//
// So this check is the fence. It is what was chosen over a vex bootstrap policy
// (decision D4, option b): a policy not derived from roles would have been an
// authorisation bypass shaped like a VALUE, and values get passed to the wrong
// caller. An exception shaped like a FILE cannot be, and a file can be pinned.
//
// The rule is deliberately narrow and mechanical:
//   1. only the five identity tables may be named
//   2. no value may be spliced — every one is a placeholder
//   3. every lookup is pinned to a single row by a key
//   4. and the queries must actually run against the schema that exists
//
// Rule 4 is what a declared entry would have given for free: boot-time
// validation against the introspected schema. Executing them here recovers most
// of it — a renamed column fails in CI rather than at somebody's login.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { ok, report } from './assert';
import { runtime } from './world';

const FILE = 'src/server/identity.ts';

// Everything identity is allowed to know about. A studio, who works there, who
// it knows, and what it has installed. Adding to this list is a decision
// somebody makes in a diff — which is the entire point of the list existing.
const ALLOWED = new Set(['people', 'staff', 'studio_people', 'studios', 'studio_integrations']);

// ─── reading the SQL out of the source ───────────────────────

type Statement = { name: string; sql: string; spliced: boolean };

export const sqlIn = (text: string): Statement[] => {
  const source = ts.createSourceFile('identity.ts', text, ts.ScriptTarget.Latest, true);
  const found: Statement[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer !== undefined) {
      const init = n.initializer;
      // A plain template with no `${}` in it.
      if (ts.isNoSubstitutionTemplateLiteral(init) && /\bSELECT\b/i.test(init.text)) {
        found.push({ name: n.name.text, sql: init.text, spliced: false });
      }
      // One WITH `${}` in it — which for SQL is the finding, not the parse.
      if (ts.isTemplateExpression(init) && /\bSELECT\b/i.test(init.getText())) {
        found.push({ name: n.name.text, sql: init.getText(), spliced: true });
      }
      // An ARRAY of templates, which is how a two-statement DDL is written.
      if (ts.isArrayLiteralExpression(init)) {
        for (const el of init.elements) {
          if (ts.isNoSubstitutionTemplateLiteral(el) && /\bSELECT\b/i.test(el.text)) found.push({ name: n.name.text, sql: el.text, spliced: false });
          if (ts.isTemplateExpression(el) && /\bSELECT\b/i.test(el.getText())) found.push({ name: n.name.text, sql: el.getText(), spliced: true });
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(source, visit);
  return found;
};

/** Every table this statement reads from. Comments are stripped first, so a
 *  table named only inside a `--` line cannot smuggle itself past the list. */
export const tablesIn = (sql: string): string[] => {
  const bare = sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');
  return [...bare.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)/gi)].map((m) => (m[1] ?? '').toLowerCase());
};

/** Pinned to one row: a placeholder compared to a key, not a scan. */
export const isPinned = (sql: string): boolean => /\b(?:WHERE|AND)\s+[a-z_.]+\s*=\s*\$\d/i.test(sql);

/** A literal spliced where a value belongs — the thing sql-check polices
 *  everywhere else, asserted here too because this file is the one place no
 *  engine is watching. */
export const hasLiteralPredicate = (sql: string): boolean => /\b(?:WHERE|AND)\s+[a-z_.]+\s*=\s*'[^']*'/i.test(sql);

// ─── the falsifiable self-test ───────────────────────────────
//
// A rule that matches nothing passes trivially. Each known-bad sample below is
// a way this file could plausibly go wrong, and the rule has to catch every one
// before it is allowed to say anything about the real file.

const GOOD = "const Q = `SELECT p.id FROM people p LEFT JOIN staff sf ON sf.person_id = p.id WHERE p.id = $1 LIMIT 1`;";
const BAD_TABLE = "const Q = `SELECT s.amount FROM people p JOIN subscriptions s ON s.person_id = p.id WHERE p.id = $1`;";
const BAD_UNPINNED = "const Q = `SELECT p.id FROM people p WHERE p.active`;";
const BAD_SPLICED = 'const Q = `SELECT p.id FROM people p WHERE p.id = ${principal}`;';
const BAD_LITERAL = "const Q = `SELECT p.id FROM people p WHERE p.studio_id = 'st_lumen'`;";
const BAD_COMMENT_SMUGGLE = "const Q = `SELECT p.id FROM people p -- FROM subscriptions\n WHERE p.id = $1`;";

const only = (src: string): Statement => sqlIn(src)[0] ?? { name: '?', sql: '', spliced: false };

ok('the rule reads SQL out of the source at all', sqlIn(GOOD).length === 1, `${sqlIn(GOOD).length} statements`);
ok('...and catches a table outside the identity set', tablesIn(only(BAD_TABLE).sql).some((t) => !ALLOWED.has(t)), tablesIn(only(BAD_TABLE).sql).join(', '));
ok('...and does not condemn the tables that ARE allowed', tablesIn(only(GOOD).sql).every((t) => ALLOWED.has(t)), tablesIn(only(GOOD).sql).join(', '));
ok('...and catches a read that is not pinned to one row', !isPinned(only(BAD_UNPINNED).sql));
ok('...and catches a value spliced into the SQL', only(BAD_SPLICED).spliced);
ok('...and catches a literal where a placeholder belongs', hasLiteralPredicate(only(BAD_LITERAL).sql));
ok(
  '...and a table hidden in a comment is not a table',
  !tablesIn(only(BAD_COMMENT_SMUGGLE).sql).includes('subscriptions'),
  'comments are stripped before the tables are read, or the list is decoration',
);

// ─── the real file ───────────────────────────────────────────

const statements = sqlIn(readFileSync(FILE, 'utf8'));
ok('the identity seam holds SQL, and this check found it', statements.length > 0, `${statements.length} statements in ${FILE}`);

const tables = [...new Set(statements.flatMap((s) => tablesIn(s.sql)))].sort();
const outside = tables.filter((t) => !ALLOWED.has(t));
ok(
  'identity reads the identity tables and nothing else',
  outside.length === 0,
  outside.length === 0 ? tables.join(', ') : `reaches ${outside.join(', ')} — a JOIN nobody authorised`,
);

ok('no value is spliced into it', statements.every((s) => !s.spliced), statements.filter((s) => s.spliced).map((s) => s.name).join(', '));
ok('...nor written as a literal predicate', statements.every((s) => !hasLiteralPredicate(s.sql)), 'a tenant id in quotes is a tenant boundary in a string');
ok(
  'every statement is pinned to one row by a key',
  statements.every((s) => isPinned(s.sql)),
  statements.filter((s) => !isPinned(s.sql)).map((s) => s.name).join(', ') || `${statements.length} pinned`,
);

// ─── and it runs against the schema that exists ──────────────
//
// The half a declared vex entry would have given for free. A column renamed
// under this file fails HERE, rather than on the next person to sign in.

const ran: string[] = [];
const failed: string[] = [];
for (const statement of statements) {
  try {
    await runtime.pool.query(statement.sql, ['__nobody__']);
    ran.push(statement.name);
  } catch (err) {
    failed.push(`${statement.name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
ok('every identity statement runs against the live schema', failed.length === 0, failed.length === 0 ? ran.join(', ') : failed.join(' | '));

// ─── and answers about ONE principal, never a population ─────
//
// The load-bearing invariant. Size was never what made the old directory a
// database; being LISTABLE was. A pinned query cannot be asked for everybody,
// and this is the assertion that says so out loud.
const { identityFor } = await import('@lyra/server/identity');
const nobody = await identityFor(runtime.pool, 'p_does_not_exist', () => undefined);
ok('an unresolvable principal is public, never a member', nobody.roles.join(',') === 'public', nobody.roles.join(','));
ok('...and carries no tenant', Object.keys(nobody.scope).length === 0, JSON.stringify(nobody.scope));

const one = await runtime.pool.query('SELECT id FROM people LIMIT 1');
const someone = String((one.rows[0] as { id?: unknown } | undefined)?.id ?? '');
const resolved = await identityFor(runtime.pool, someone, () => undefined);
ok('a real principal resolves to exactly themselves', resolved.roles.length > 0 && String(resolved.scope['studioId'] ?? '') !== '', JSON.stringify(resolved.roles));

report('the one unauthorised read is pinned: five tables, no splicing, one row by key, and it runs against the schema that exists.');
