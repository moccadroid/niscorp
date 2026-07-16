// Charter check — "if it boots, it's coherent" as a script. Asserts the exact
// resolved set per role per SECTION (actions + data) against the live
// universes, runs the grammar corpus on synthetic charters, requires the
// verifier to pass relay's charter with zero errors/warnings, and prints the
// per-role closure. A viewer's dangling Edit targets are EXPECTED findings
// (shown, not hidden), not failures.
import type { ActionDefinition } from '@niscorp/nova';
import {
  CHARTER, ASSIGNMENTS, resolveRole, resolvePrincipal, verifyCharter, CharterError,
  dataUniverse, policyFor, type Charter,
} from '../charter';
import { CATALOG_DEFINITIONS } from '../nova/shell/actions';
import { scopeBehaviors, TABLES } from '../vex/scope';

const ids = Object.keys(CATALOG_DEFINITIONS);
const dataU = dataUniverse(TABLES);
const checks: [string, boolean][] = [];
const eq = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const actionsOf = (name: string): string[] => [...resolveRole(CHARTER, ids, name, 'actions')].sort();
const dataOf = (name: string): string[] => [...resolveRole(CHARTER, dataU, name, 'data')].sort();

// ── the exact resolved ACTION sets ──
const MEMBER = ['chrome.sidebar', 'chrome.topbar', 'confirm-delete', 'home', 'placeholder'].sort();
const VIEWER = [...MEMBER, 'crm.companies', 'crm.company.view', 'crm.contact.view', 'crm.contacts', 'crm.deal.view', 'crm.deals'].sort();
const SALES = [...VIEWER, 'assistant', 'crm.company.form', 'crm.contact.form', 'crm.deal.form', 'keys', 'tasks.form', 'tasks.manage'].sort();
const ADMIN = [...SALES, 'settings'].sort();

checks.push(['public = the lock screen alone', eq(actionsOf('public'), ['auth.login'])]);
checks.push([`member = chrome + home + placeholder + confirm-delete (${MEMBER.length})`, eq(actionsOf('member'), MEMBER)]);
checks.push([`viewer actions = member + lists + views (${VIEWER.length})`, eq(actionsOf('viewer'), VIEWER)]);
checks.push([`sales actions = viewer + forms + tasks + assistant + keys (${SALES.length})`, eq(actionsOf('sales'), SALES)]);
checks.push([`admin actions = sales + settings (${ADMIN.length})`, eq(actionsOf('admin'), ADMIN)]);
checks.push(['dev = the devtools pair', eq(actionsOf('dev'), ['devtools.dock', 'devtools.inspect'])]);
const USR1_EXPECTED = new Set([...SALES, ...actionsOf('dev')]).size;
checks.push([`usr_001 (sales + dev) = the union of both closures (${USR1_EXPECTED})`, resolvePrincipal(CHARTER, ids, [...ASSIGNMENTS['usr_001']!], 'actions').size === USR1_EXPECTED]);
checks.push(['admin does NOT imply devtools', !resolveRole(CHARTER, ids, 'admin', 'actions').has('devtools.dock')]);

// ── the exact resolved DATA sets — the SAME grammar, a second universe.
//    Verb leaves mirror vex's phases: read + write.{insert,update,delete};
//    `write` is a NAMESPACE, the umbrella is a glob (`tasks.write.*`). ──
const READS = TABLES.map((t) => `${t}.read`).sort();
const CRM = ['deals', 'contacts', 'companies'];
const SALES_WRITES = [...CRM.flatMap((t) => [`${t}.write.insert`, `${t}.write.update`]), 'tasks.write.insert', 'tasks.write.update', 'tasks.write.delete'].sort();
const ADMIN_WRITES = [...SALES_WRITES, ...CRM.map((t) => `${t}.write.delete`)].sort();
const SYSTEM_WRITES = [...CRM, 'tasks'].flatMap((t) => [`${t}.write.insert`, `${t}.write.update`, `${t}.write.delete`]).sort();
checks.push(['public data = nothing (no data section)', dataOf('public').length === 0]);
checks.push([`viewer data = every read, no write (${READS.length})`, eq(dataOf('viewer'), READS)]);
checks.push([`sales data = reads + CRM create/edit + full tasks (${READS.length + SALES_WRITES.length})`, eq(dataOf('sales'), [...READS, ...SALES_WRITES].sort())]);
checks.push(['sales holds deals.write.update but NOT deals.write.delete', dataOf('sales').includes('deals.write.update') && !dataOf('sales').includes('deals.write.delete')]);
checks.push([`admin data = sales + the CRM delete tier (${READS.length + ADMIN_WRITES.length})`, eq(dataOf('admin'), [...READS, ...ADMIN_WRITES].sort())]);
checks.push(['activities are read-only for everyone (no role grants any write leaf)', !dataOf('admin').some((g) => g.startsWith('activities.write')) && !dataOf('system').some((g) => g.startsWith('activities.write'))]);

// ── the trusted floor is a charter artifact too: `system` grants all reads
//    plus the full write namespace on the mutation-surface tables; its
//    compiled policy still has NO pipelines write phase — the deployed
//    engine default keeps the floor ──
checks.push([`system data = reads + the full write namespaces (${READS.length + SYSTEM_WRITES.length})`, eq(dataOf('system'), [...READS, ...SYSTEM_WRITES].sort())]);
checks.push(['system grants no actions (an engine principal, not a user)', actionsOf('system').length === 0]);
const systemPolicy = policyFor(new Set(dataOf('system')), scopeBehaviors);
const sysPipelines = systemPolicy.entities['pipelines'] as { read?: unknown; insert?: unknown; update?: unknown; delete?: unknown } | undefined;
checks.push(["system's compiled pipelines entity is read-only (no write phase of any kind)", sysPipelines?.read !== undefined && sysPipelines.insert === undefined && sysPipelines.update === undefined && sysPipelines.delete === undefined]);

// ── the compiled policy: charter grants → which vex phases exist. The
//    compiler emits SPECIFIC phases only (the charter already resolved the
//    umbrella as a glob); a granted phase carries the table's umbrella
//    behaviors plus its op's, and delete keeps matches only. ──
const viewerPolicy = policyFor(new Set(dataOf('viewer')), scopeBehaviors);
const salesPolicy = policyFor(new Set(dataOf('sales')), scopeBehaviors);
const adminPolicy = policyFor(new Set(dataOf('admin')), scopeBehaviors);
const phasesOf = (p: typeof salesPolicy, t: string) => p.entities[t] as { read?: unknown[]; insert?: unknown[]; update?: unknown[]; delete?: unknown[] } | undefined;
checks.push(["viewer's deals entity has a read phase and no write phase of any kind", phasesOf(viewerPolicy, 'deals')?.read !== undefined && phasesOf(viewerPolicy, 'deals')?.insert === undefined && phasesOf(viewerPolicy, 'deals')?.update === undefined && phasesOf(viewerPolicy, 'deals')?.delete === undefined]);
checks.push(["sales's deals entity has insert+update (rule-free — ownership never writer-derived), NO delete", Array.isArray(phasesOf(salesPolicy, 'deals')?.insert) && phasesOf(salesPolicy, 'deals')?.insert?.length === 0 && Array.isArray(phasesOf(salesPolicy, 'deals')?.update) && phasesOf(salesPolicy, 'deals')?.delete === undefined]);
checks.push(["admin's deals entity gains the delete phase", Array.isArray(phasesOf(adminPolicy, 'deals')?.delete)]);
checks.push(["tasks read carries the assignee filter (a granted behavior)", phasesOf(viewerPolicy, 'tasks')?.read?.length === 1]);
checks.push(["sales's tasks phases carry the umbrella behaviors (insert: set+match; delete: match only)", phasesOf(salesPolicy, 'tasks')?.insert?.length === 2 && phasesOf(salesPolicy, 'tasks')?.delete?.length === 1]);

// ── the grammar corpus, on synthetic charters (real sectioned grammar) ──
const defsFor = (xs: readonly string[]): Record<string, ActionDefinition> => Object.fromEntries(xs.map((id) => [id, { id }]));
const gids = ['a.one', 'a.two', 'b.one'];
const G: Charter = {
  base: ['a.*'],                                                    // bare array → actions sugar
  denyWins: { actions: { allow: ['a.*'], deny: ['a.two'] } },
  child: { extends: ['denyWins'], actions: ['a.two'] },
  muzzle: ['a.one'],
  narrowed: { extends: ['base'], without: ['muzzle'] },
};
checks.push(['glob * crosses dots', eq([...resolveRole(G, gids, 'base', 'actions')].sort(), ['a.one', 'a.two'])]);
checks.push(['deny wins within a role', eq([...resolveRole(G, gids, 'denyWins', 'actions')].sort(), ['a.one'])]);
checks.push(['denies do not inherit — a child may re-add', eq([...resolveRole(G, gids, 'child', 'actions')].sort(), ['a.one', 'a.two'])]);
checks.push(['without subtracts a resolved set', eq([...resolveRole(G, gids, 'narrowed', 'actions')].sort(), ['a.two'])]);

// ── a section is universe-blind: the SAME code resolves a data role ──
const D: Charter = { reader: { data: ['x.read'] }, writer: { extends: ['reader'], data: ['x.write'] } };
checks.push(['data section resolves in its own universe', eq([...resolveRole(D, ['x.read', 'x.write'], 'writer', 'data')].sort(), ['x.read', 'x.write'])]);

let cycled = false;
try {
  resolveRole({ a: { extends: ['b'] }, b: { extends: ['a'] } }, gids, 'a', 'actions');
} catch (e) {
  cycled = e instanceof CharterError;
}
checks.push(['cycles are an error', cycled]);

// ── the verifier's lints fire where they should (tables = [] for synthetics
//    with no data section) ──
const verify = (c: Charter, defs: Record<string, ActionDefinition>, assign?: Record<string, readonly string[]>) => verifyCharter(c, defs, [], assign);
const reallowed = verify({ ...G, orphanEater: ['*'] }, defsFor(gids)).warnings;
checks.push(['re-allow of an ancestor deny is flagged', verify(G, defsFor(gids)).warnings.some((w) => w.rule === 're-allow')]);
checks.push(['a dead deny is an ERROR', verify({ r: { actions: { allow: ['a.*'], deny: ['zz.*'] } } }, defsFor(gids)).errors.some((e) => e.rule === 'dead-deny')]);
checks.push(['a dead allow is a warning', verify({ r: ['zz.*'], all: ['*'] }, defsFor(gids)).warnings.some((w) => w.rule === 'dead-allow')]);
checks.push(['a dead DATA deny is an ERROR', verifyCharter({ r: { data: { allow: ['x.read'], deny: ['zz.write'] } } }, defsFor(gids), ['x']).errors.some((e) => e.rule === 'dead-deny')]);
checks.push(['top-level allow + an actions section is an ERROR (silent drop)', verify({ r: { allow: ['a.*'], actions: ['a.one'] }, all: ['*'] }, defsFor(gids)).errors.some((e) => e.rule === 'ambiguous-selection')]);
checks.push(['an orphan action is a warning', verify({ r: ['a.*'] }, defsFor(gids)).warnings.some((w) => w.rule === 'orphan')]);
checks.push(['a namespace id is an ERROR', verify({ r: ['*'] }, defsFor(['a', 'a.one'])).errors.some((e) => e.rule === 'leaves-only')]);
checks.push(['an assigned subtractive role is flagged', verify({ ...G, all: ['*'] }, defsFor(gids), { u1: ['muzzle'] }).warnings.some((w) => w.rule === 'subtractive-assigned')]);
checks.push(['no stray lint fired on the corpus charter', reallowed.every((w) => w.rule === 're-allow')]);

// ── relay's charter is coherent ──
const report = verifyCharter(CHARTER, CATALOG_DEFINITIONS, TABLES, ASSIGNMENTS);
checks.push([`relay charter: zero errors (got ${report.errors.length})`, report.errors.length === 0]);
checks.push([`relay charter: zero warnings (got ${report.warnings.length})`, report.warnings.length === 0]);

// ── closure: admin reaches everything it wires; narrower roles show their
//    dangling targets (ring 1 working, documented not hidden) ──
const closure = (r: string): { actions: string[]; issues: string[] } =>
  report.perRole.find((p) => p.role === r) ?? { actions: [], issues: [] };
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
console.log('\n── per-role (actions · data · closure issues) ──');
for (const entry of report.perRole) {
  console.log(`${entry.role} — ${entry.actions.length} actions, ${entry.data.length} data caps, ${entry.issues.length} closure issues`);
  for (const issue of entry.issues) console.log(`  · ${issue}`);
}
if (failed > 0) {
  console.log(`\nFAIL — ${failed} check(s).`);
  process.exit(1);
}
console.log('\nOK — the charter resolves per section, the grammar holds, and it compiles to a vex policy.');
