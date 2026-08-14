// Run: pnpm --filter lyra exec tsx src/dev/reads-are-vex-check.ts
//
// READS ARE VEX. This check is the definition of done for unwinding the raw-SQL
// sprawl in `server/` — it was written FAILING, on purpose, against the tree as
// it stood, so that "finished" means this passes and nothing else. A green
// suite elsewhere proves no known rule broke; it never proved the architecture
// held, and it was reported as though it did. This is the rule that was
// missing.
//
// The law it asserts, in full:
//
//   1. Raw SQL may READ application data in exactly one file:
//      `server/identity.ts` — the pre-authorisation read (roles cannot be
//      fetched under a policy, because the policy is compiled from them) — and
//      only over the tables the identity ARTIFACT declares
//      (`app/vex/identity.entries.ts`). The artifact feeds this check: widening
//      the SQL means widening the declaration, in a diff somebody approves.
//
//   2. EVERYTHING ELSE GOES THROUGH THE ENGINE. Surfaces with no principal —
//      the sign-in credential, the mail provider's callback, the lab's
//      picker, the automations engine's own rows — execute seeded entries as
//      DECLARED charter roles (`credential`, `mailer`, `transport`,
//      `scheduler`) via `server.executeAs`: in-process, replay-only,
//      charter-bounded, reach-pinned. There is no doors list, because there
//      are no doors. The one exec exception is `server/runtime.ts`, the lab's
//      database BUILDER, which applies the declared schema artifacts (db/) —
//      creating the database is not reading it.
//
// And of the artifact itself:
//
//   4. The roles mapping is authored data whose every rung is a role the
//      charter defines — the assertion a function called `audienceOf` could
//      never carry.
//   5. The pre-authorisation entries are NEVER served: their fingerprints must
//      not appear in the registered index. A pre-auth read reachable from HTTP
//      is the bootstrap-policy hole D4 refused.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { evaluate } from '@niscorp/prism';
import { CHARTER } from '@lyra/app/charter/charter';
import { ENTRIES, MUTATION_ENTRIES } from '@lyra/app/vex';
import { IDENTITY_RUNGS, identityInstalled, identityPerson, identityRoles, identityStudio } from '@lyra/app/vex/identity.entries';
import { ok, report } from './assert';

// ─── the law's two lists ─────────────────────────────────────

const LICENSED = 'server/identity.ts';

// The database BUILDER: the one file allowed to call `exec`, applying the
// declared schema artifacts from db/. Creating the database is not reading it.
const BUILDER = 'server/runtime.ts';

// ─── finding raw query call sites ────────────────────────────

const rawCallsIn = (text: string): { query: number; exec: number } => {
  const source = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true);
  const calls = { query: 0, exec: 0 };
  const hit = (name: string): void => {
    if (name === 'query') calls.query += 1;
    if (name === 'exec') calls.exec += 1;
  };
  const visit = (n: ts.Node): void => {
    // CALLED OR NOT: `const q = pool.query` is a raw call site with extra
    // steps, and `pool['query']` is the same door with the name on a string.
    // Nothing in the swept trees touches a property by either name for any
    // other reason, so a bare reference is already an offence.
    if (ts.isPropertyAccessExpression(n)) hit(n.name.text);
    if (ts.isElementAccessExpression(n) && ts.isStringLiteral(n.argumentExpression)) hit(n.argumentExpression.text);
    ts.forEachChild(n, visit);
  };
  visit(source);
  return calls;
};
const queryCallsIn = (text: string): number => rawCallsIn(text).query;

/** The SQL strings in a file — template and string literals that look like
 *  statements — pulled off the AST so prose in TS comments ("compiles from
 *  roles") cannot masquerade as a table. */
const sqlStringsIn = (text: string): string[] => {
  const source = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (n: ts.Node): void => {
    if ((ts.isNoSubstitutionTemplateLiteral(n) || ts.isStringLiteral(n)) && /\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(n.text)) found.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(source);
  return found;
};

/** Every table a file's SQL reads from — SQL comments stripped first so a
 *  table named in a `--` line cannot smuggle itself past the pin. */
const tablesIn = (text: string): string[] => {
  const bare = sqlStringsIn(text)
    .map((sql) => sql.replace(/--[^\n]*/g, ' '))
    .join(' ')
    .replace(/\s+/g, ' ');
  return [...new Set([...bare.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)/gi)].map((m) => (m[1] ?? '').toLowerCase()))];
};

// ─── falsifiable self-tests ──────────────────────────────────

const BAD = "export const themeFor = async (pool: PgPool) => { const r = await pool.query('SELECT tokens FROM themes'); return r.rows; };";
const ALIASED = "const q = pool.query; export const rows = async () => (await q('SELECT 1')).rows;";
const BRACKETED = "export const rows = async (pool: PgPool) => (await pool['query']('SELECT 1')).rows;";
const GOOD = "export const label = (s: string): string => s.trim();";
ok('the sweep sees a raw query', queryCallsIn(BAD) === 1, String(queryCallsIn(BAD)));
ok('...and one hidden behind an alias', queryCallsIn(ALIASED) === 1, 'a reference that is never called is still a door');
ok('...and one named on a string', queryCallsIn(BRACKETED) === 1, "pool['query'] is pool.query");
ok('...and does not hallucinate one', queryCallsIn(GOOD) === 0);
ok('...and reads the tables out of the SQL', tablesIn(BAD).join(',') === 'themes', tablesIn(BAD).join(','));

// ─── 4: the rung table is authored data the charter can verify ──
const rungs = Object.values(IDENTITY_RUNGS);
const charterRoles = new Set(Object.keys(CHARTER));
ok(
  'every rung the identity mapping can produce is a role the charter defines',
  rungs.every((rung) => charterRoles.has(rung)) && charterRoles.has('member'),
  rungs.filter((rung) => !charterRoles.has(rung)).join(', ') || `${rungs.length} rungs + member`,
);

// ...and the mapping is genuinely executable data, asserted by executing it.
const rolesFor = (staff_role: string | null, anchor_id: string | null): unknown =>
  (evaluate(identityRoles.mapping as never, { staff_role, anchor_id, studio_id: 'st_x', principal: 'p_x' } as never) as { roles: unknown }).roles;
ok('an instructor who trains wears both rungs', JSON.stringify(rolesFor('instructor', 'sp_1')) === '["instructor","member"]', JSON.stringify(rolesFor('instructor', 'sp_1')));
ok('...staff who do not train wear one', JSON.stringify(rolesFor('owner', null)) === '["owner"]', JSON.stringify(rolesFor('owner', null)));
ok('...an anchor alone is a member', JSON.stringify(rolesFor(null, 'sp_1')) === '["member"]', JSON.stringify(rolesFor(null, 'sp_1')));
ok('...and an unrecognised staff word resolves DOWN, never up', JSON.stringify(rolesFor('superuser', null)) === '["member"]', JSON.stringify(rolesFor('superuser', null)));

// ─── 5: the pre-auth entries are never served ────────────────
const served = new Set([...ENTRIES, ...MUTATION_ENTRIES].map((entry) => entry.fingerprint));
ok(`${identityRoles.fingerprint} is not reachable from HTTP`, !served.has(identityRoles.fingerprint), 'the pre-auth read on the wire is the hole D4 refused');
for (const ordinary of [identityPerson, identityStudio, identityInstalled]) {
  ok(`${ordinary.fingerprint} is served, at the identity reach`, served.has(ordinary.fingerprint) && ordinary.reach === 'identity', String(ordinary.reach));
}
// The machinery roles exist and NOBODY may wear any of them: not a rung the
// mapping can produce, not a combination the app declares wearable.
for (const machineryRole of ['identity', 'credential', 'mailer', 'transport', 'scheduler']) {
  ok(
    `the ${machineryRole} role exists and is not a rung`,
    charterRoles.has(machineryRole) && !Object.values(IDENTITY_RUNGS).includes(machineryRole),
    'a wearable machinery role would hand its grants to a person',
  );
}

// ─── the roles the app can execute as, pinned ─────────────
//
// `executeAs` is strictly tighter than raw SQL only while the roles handed to
// it are the machinery roles. This walks every call site: a literal role must
// be one of the five, and the count of NON-literal sites is pinned to the two
// forwarding seams in app.ts — the lambdas handing `runAs` to the auth
// functions and to the dev-login roster, so those modules hold a narrow
// capability instead of the server. `executeAs(someVariable, ...)` cannot
// appear anywhere new without this check saying so in daylight.
const MACHINERY = ['identity', 'credential', 'mailer', 'transport', 'scheduler'];

const executeAsRolesIn = (text: string): { literals: string[]; dynamic: number } => {
  const source = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true);
  const found: { literals: string[]; dynamic: number } = { literals: [], dynamic: 0 };
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '';
      if (name === 'executeAs' || name === 'runAs') {
        const first = n.arguments[0];
        if (first !== undefined && ts.isStringLiteral(first)) found.literals.push(first.text);
        else found.dynamic += 1;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(source);
  return found;
};

const AS_OWNER = "await server.executeAs('owner', 'people/roster', {});";
const AS_FORWARD = "const f = (role: string) => server.executeAs(role, 'x', {});";
ok('the role walk sees a literal', executeAsRolesIn(AS_OWNER).literals.join(',') === 'owner');
ok('...and a variable as dynamic', executeAsRolesIn(AS_FORWARD).dynamic === 1);

// ─── 1–3: the sweep ──────────────────────────────────────────

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });

// The UI, the schema artifacts and the entry point are swept too: a pool in
// the browser tree or a db/ file that started CALLING instead of declaring
// would be exactly the kind of quiet door this law exists to refuse.
const files = [...walk('src/server'), ...walk('src/app'), ...walk('src/ui'), ...walk('src/db'), 'src/main.tsx'];
const offenders: string[] = [];
const roleLiterals: string[] = [];
let dynamicRoleSites = 0;
for (const file of files) {
  const rel = relative('src', file).replace(/\\/g, '/');
  const text = readFileSync(file, 'utf8');
  const roles = executeAsRolesIn(text);
  roleLiterals.push(...roles.literals.map((role) => `${rel}: ${role}`));
  dynamicRoleSites += roles.dynamic;
  const calls = rawCallsIn(text);
  if (calls.query === 0 && calls.exec === 0) continue;
  if (rel === LICENSED && calls.exec === 0) continue; // pinned below, not exempted
  if (rel === BUILDER && calls.query === 0) continue; // exec-only: the schema apply
  offenders.push(`${rel} (${calls.query} query, ${calls.exec} exec)`);
}

const offRole = roleLiterals.filter((site) => !MACHINERY.includes(site.slice(site.indexOf(': ') + 2)));
ok(
  'every role the app executes as is a machinery role',
  offRole.length === 0,
  offRole.join(', ') || `${roleLiterals.length} call sites, all literal machinery roles`,
);
ok(
  'and exactly two call sites take their role from a variable — the forwarding seams in app.ts',
  dynamicRoleSites === 2,
  `${dynamicRoleSites} dynamic site(s) — a third one is a new place a role name can travel`,
);

console.log(`\n  ${files.length} files swept — 1 licensed read, 1 schema builder, ${offenders.length} offenders`);
for (const offender of offenders) console.log(`    MUST BECOME ENTRIES OR DIE  ${offender}`);

ok(
  'raw SQL touches the database from exactly one licensed file and one schema builder',
  offenders.length === 0,
  offenders.length === 0 ? 'server/identity.ts, server/runtime.ts, and nowhere else' : `${offenders.length} files bypass the engine`,
);

// ─── 1: and that one file IS one statement inside its declaration ──
//
// The budget is a COUNT. Widening the SQL means editing this check in the
// same diff, in daylight — not widening a constant beside the SQL.
const licensedText = readFileSync(join('src', LICENSED), 'utf8');
ok('the licensed file holds exactly ONE statement', sqlStringsIn(licensedText).length === 1, `${sqlStringsIn(licensedText).length} statements`);
const declaredTables = [...(identityRoles.dsl as { from: string[] }).from].sort();
const licensedTables = tablesIn(licensedText).sort();
ok(
  'the licensed read touches exactly the tables the artifact declares',
  JSON.stringify(licensedTables) === JSON.stringify(declaredTables),
  `${licensedTables.join(', ')} against declared ${declaredTables.join(', ')}`,
);

report('reads are vex: one licensed pre-auth read pinned to its artifact, one schema builder applying declared DDL, and an engine for everything else.');
