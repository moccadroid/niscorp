// Charter check — "if it boots, it's coherent" as a script. Asserts the
// exact resolved set per role against the live definition universe, runs
// the grammar corpus on synthetic charters, and requires the verifier to
// pass relay's charter with zero errors and zero warnings. The per-role
// closure report prints at the end — a viewer's dangling Edit targets are
// EXPECTED findings (shown, not hidden), not failures.
import type { ActionDefinition } from '@niscorp/nova';
import { CHARTER, ASSIGNMENTS, resolveRole, resolvePrincipal, verifyCharter, CharterError, type Charter } from '../charter';
import { CATALOG_DEFINITIONS } from '../nova/shell/actions';

const ids = Object.keys(CATALOG_DEFINITIONS);
const checks: [string, boolean][] = [];
const eq = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const role = (name: string): string[] => [...resolveRole(CHARTER, ids, name)].sort();

// ── the exact resolved sets ──
const MEMBER = ['chrome.sidebar', 'chrome.topbar', 'confirm-delete', 'home', 'placeholder'].sort();
const VIEWER = [...MEMBER, 'crm.companies', 'crm.company.view', 'crm.contact.view', 'crm.contacts', 'crm.deal.view', 'crm.deals'].sort();
const SALES = [...VIEWER, 'assistant', 'crm.company.form', 'crm.contact.form', 'crm.deal.form', 'keys', 'tasks.form', 'tasks.manage'].sort();
const ADMIN = [...SALES, 'settings'].sort();

checks.push(['public = the lock screen alone', eq(role('public'), ['auth.login'])]);
checks.push([`member = chrome + home + placeholder + confirm-delete (${MEMBER.length})`, eq(role('member'), MEMBER)]);
checks.push([`viewer = member + lists + views (${VIEWER.length})`, eq(role('viewer'), VIEWER)]);
checks.push([`sales = viewer + forms + tasks + assistant + keys (${SALES.length})`, eq(role('sales'), SALES)]);
checks.push([`admin = sales + settings (${ADMIN.length})`, eq(role('admin'), ADMIN)]);
checks.push(['dev = the devtools pair', eq(role('dev'), ['devtools.dock', 'devtools.inspect'])]);
checks.push(['usr_001 (sales + dev) = 20 actions', resolvePrincipal(CHARTER, ids, [...ASSIGNMENTS['usr_001']!]).size === 20]);
checks.push(['admin does NOT imply devtools', !resolveRole(CHARTER, ids, 'admin').has('devtools.dock')]);

// ── the grammar corpus, on synthetic charters ──
const defsFor = (xs: readonly string[]): Record<string, ActionDefinition> => Object.fromEntries(xs.map((id) => [id, { id }]));
const gids = ['a.one', 'a.two', 'b.one'];
const G: Charter = {
  base: ['a.*'],
  denyWins: { allow: ['a.*'], deny: ['a.two'] },
  child: { extends: ['denyWins'], allow: ['a.two'] },
  muzzle: ['a.one'],
  narrowed: { extends: ['base'], without: ['muzzle'] },
};
checks.push(['glob * crosses dots', eq([...resolveRole(G, gids, 'base')].sort(), ['a.one', 'a.two'])]);
checks.push(['deny wins within a role', eq([...resolveRole(G, gids, 'denyWins')].sort(), ['a.one'])]);
checks.push(['denies do not inherit — a child may re-add', eq([...resolveRole(G, gids, 'child')].sort(), ['a.one', 'a.two'])]);
checks.push(['without subtracts a resolved set', eq([...resolveRole(G, gids, 'narrowed')].sort(), ['a.two'])]);

let cycled = false;
try {
  resolveRole({ a: { extends: ['b'] }, b: { extends: ['a'] } }, gids, 'a');
} catch (e) {
  cycled = e instanceof CharterError;
}
checks.push(['cycles are an error', cycled]);

// ── the verifier's lints fire where they should ──
const reallowed = verifyCharter({ ...G, orphanEater: ['*'] }, defsFor(gids)).warnings;
checks.push(['re-allow of an ancestor deny is flagged', verifyCharter(G, defsFor(gids)).warnings.some((w) => w.rule === 're-allow')]);
checks.push(['a dead deny is an ERROR', verifyCharter({ r: { allow: ['a.*'], deny: ['zz.*'] } }, defsFor(gids)).errors.some((e) => e.rule === 'dead-deny')]);
checks.push(['a dead allow is a warning', verifyCharter({ r: ['zz.*'], all: ['*'] }, defsFor(gids)).warnings.some((w) => w.rule === 'dead-allow')]);
checks.push(['an orphan action is a warning', verifyCharter({ r: ['a.*'] }, defsFor(gids)).warnings.some((w) => w.rule === 'orphan')]);
checks.push(['a namespace id is an ERROR', verifyCharter({ r: ['*'] }, defsFor(['a', 'a.one'])).errors.some((e) => e.rule === 'leaves-only')]);
checks.push(['an assigned subtractive role is flagged', verifyCharter({ ...G, all: ['*'] }, defsFor(gids), { u1: ['muzzle'] }).warnings.some((w) => w.rule === 'subtractive-assigned')]);
checks.push(['no stray lint fired on the corpus charter', reallowed.every((w) => w.rule === 're-allow')]);

// ── relay's charter is coherent ──
const report = verifyCharter(CHARTER, CATALOG_DEFINITIONS, ASSIGNMENTS);
checks.push([`relay charter: zero errors (got ${report.errors.length})`, report.errors.length === 0]);
checks.push([`relay charter: zero warnings (got ${report.warnings.length})`, report.warnings.length === 0]);

// ── closure: admin reaches everything it wires; narrower roles show their
//    dangling targets (ring 1 working, documented not hidden) ──
const closure = (r: string): { granted: string[]; issues: string[] } => {
  const entry = report.perRole.find((p) => p.role === r);
  return entry ?? { granted: [], issues: [] };
};
checks.push([`admin closure is clean (got ${closure('admin').issues.length})`, closure('admin').issues.length === 0]);
checks.push(['viewer closure flags the contact form push', closure('viewer').issues.some((i) => i.includes('crm.contact.form'))]);
checks.push(['member closure flags the sidebar targets', closure('member').issues.some((i) => i.includes('crm.contacts'))]);

// ── report ──
let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
}
for (const issue of [...report.errors, ...report.warnings]) console.log(`  [${issue.level}] ${issue.rule}: ${issue.detail}`);
console.log('\n── per-role closure ──');
for (const entry of report.perRole) {
  console.log(`${entry.role} (${entry.granted.length} granted, ${entry.issues.length} closure issues)`);
  for (const issue of entry.issues) console.log(`  · ${issue}`);
}
if (failed > 0) {
  console.log(`\nFAIL — ${failed} check(s).`);
  process.exit(1);
}
console.log('\nOK — the charter resolves, the grammar holds, the verifier is sharp.');
