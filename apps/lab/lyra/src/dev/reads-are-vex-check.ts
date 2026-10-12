import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { evaluate } from '@niscorp/prism';
import { CHARTER } from '@lyra/app/charter/charter';
import { ENTRIES, MUTATION_ENTRIES } from '@lyra/app/vex';
import { IDENTITY_RUNGS, identityInstalled, identityPerson, identityRoles, identityStudio } from '@lyra/app/vex/identity.entries';
import { ok, report } from './assert';

const LICENSED = 'server/identity.ts';

const BUILDER = 'server/runtime.ts';

const rawCallsIn = (text: string): { query: number; exec: number } => {
  const source = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true);
  const calls = { query: 0, exec: 0 };
  const hit = (name: string): void => {
    if (name === 'query') calls.query += 1;
    if (name === 'exec') calls.exec += 1;
  };
  const visit = (n: ts.Node): void => {
    // A reference counts, called or not: `const q = pool.query` and
    // `pool['query']` reach the same method.
    if (ts.isPropertyAccessExpression(n)) hit(n.name.text);
    if (ts.isElementAccessExpression(n) && ts.isStringLiteral(n.argumentExpression)) hit(n.argumentExpression.text);
    ts.forEachChild(n, visit);
  };
  visit(source);
  return calls;
};
const queryCallsIn = (text: string): number => rawCallsIn(text).query;

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

const tablesIn = (text: string): string[] => {
  const bare = sqlStringsIn(text)
    .map((sql) => sql.replace(/--[^\n]*/g, ' '))
    .join(' ')
    .replace(/\s+/g, ' ');
  return [...new Set([...bare.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)/gi)].map((m) => (m[1] ?? '').toLowerCase()))];
};

const BAD = "export const themeFor = async (pool: PgPool) => { const r = await pool.query('SELECT tokens FROM themes'); return r.rows; };";
const ALIASED = "const q = pool.query; export const rows = async () => (await q('SELECT 1')).rows;";
const BRACKETED = "export const rows = async (pool: PgPool) => (await pool['query']('SELECT 1')).rows;";
const GOOD = "export const label = (s: string): string => s.trim();";
ok('the sweep sees a raw query', queryCallsIn(BAD) === 1, String(queryCallsIn(BAD)));
ok('...and one hidden behind an alias', queryCallsIn(ALIASED) === 1, 'a reference that is never called is still a door');
ok('...and one named on a string', queryCallsIn(BRACKETED) === 1, "pool['query'] is pool.query");
ok('...and does not hallucinate one', queryCallsIn(GOOD) === 0);
ok('...and reads the tables out of the SQL', tablesIn(BAD).join(',') === 'themes', tablesIn(BAD).join(','));

const rungs = Object.values(IDENTITY_RUNGS);
const charterRoles = new Set(Object.keys(CHARTER));
ok(
  'every rung the identity mapping can produce is a role the charter defines',
  rungs.every((rung) => charterRoles.has(rung)) && charterRoles.has('member'),
  rungs.filter((rung) => !charterRoles.has(rung)).join(', ') || `${rungs.length} rungs + member`,
);

const rolesFor = (staff_role: string | null, anchor_id: string | null): unknown =>
  (evaluate(identityRoles.mapping as never, { staff_role, anchor_id, studio_id: 'st_x', principal: 'p_x' } as never) as { roles: unknown }).roles;
ok('an instructor who trains wears both rungs', JSON.stringify(rolesFor('instructor', 'sp_1')) === '["instructor","member"]', JSON.stringify(rolesFor('instructor', 'sp_1')));
ok('...staff who do not train wear one', JSON.stringify(rolesFor('owner', null)) === '["owner"]', JSON.stringify(rolesFor('owner', null)));
ok('...an anchor alone is a member', JSON.stringify(rolesFor(null, 'sp_1')) === '["member"]', JSON.stringify(rolesFor(null, 'sp_1')));
ok('...and an unrecognised staff word resolves DOWN, never up', JSON.stringify(rolesFor('superuser', null)) === '["member"]', JSON.stringify(rolesFor('superuser', null)));

const served = new Set([...ENTRIES, ...MUTATION_ENTRIES].map((entry) => entry.fingerprint));
ok(`${identityRoles.fingerprint} is not reachable from HTTP`, !served.has(identityRoles.fingerprint), 'the pre-auth read on the wire is the hole D4 refused');
for (const ordinary of [identityPerson, identityStudio, identityInstalled]) {
  ok(`${ordinary.fingerprint} is served, at the identity reach`, served.has(ordinary.fingerprint) && ordinary.reach === 'identity', String(ordinary.reach));
}
for (const machineryRole of ['identity', 'credential', 'mailer', 'transport', 'scheduler']) {
  ok(
    `the ${machineryRole} role exists and is not a rung`,
    charterRoles.has(machineryRole) && !Object.values(IDENTITY_RUNGS).includes(machineryRole),
    'a wearable machinery role would hand its grants to a person',
  );
}

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

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });

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
  if (rel === LICENSED && calls.exec === 0) continue;
  if (rel === BUILDER && calls.query === 0) continue;
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
