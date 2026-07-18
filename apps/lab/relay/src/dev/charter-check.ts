// Charter check — "if it boots, it's coherent" for RELAY'S DOCUMENTS. The
// engine's grammar corpus lives with the engine (packages/charter/test);
// this check asserts the exact resolved set per role per SECTION against
// relay's live universes, the compiled vex policies, and a clean verifier
// report — printing the per-role closure. A viewer's dangling Edit targets
// are EXPECTED findings (shown, not hidden), not failures.
import { resolveRole, resolvePrincipal, verifyCharter } from '@niscorp/charter';
import { auditClosure, verifyVariants } from '@niscorp/moss';
import { scopeGrants, createScopePolicy } from '@niscorp/vex';
import { CHARTER, ASSIGNMENTS } from '@relay/app/charter';
import { CATALOG_DEFINITIONS } from '@relay/app/action-catalog';
import { LAYOUT_VARIANTS } from '@relay/app/layout-variants';
import { scopeBehaviors } from '@relay/app/vex/behaviors';
import { TABLES } from '@relay/db/schema';

const ids = Object.keys(CATALOG_DEFINITIONS);
const dataU = scopeGrants(TABLES);
const layoutU = Object.keys(LAYOUT_VARIANTS);
const checks: [string, boolean][] = [];
const eq = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const resolvedActions = (name: string): string[] => [...resolveRole(CHARTER, ids, name, 'actions')].sort();
const resolvedData = (name: string): string[] => [...resolveRole(CHARTER, dataU, name, 'data')].sort();

// ── the exact resolved ACTION sets ──
const MEMBER = ['chrome.sidebar', 'chrome.topbar', 'confirm-delete', 'home', 'placeholder'].sort();
const VIEWER = [...MEMBER, 'crm.companies', 'crm.company.view', 'crm.contact.view', 'crm.contacts', 'crm.deal.view', 'crm.deals'].sort();
const SALES = [...VIEWER, 'assistant', 'crm.company.form', 'crm.contact.form', 'crm.deal.form', 'tasks.form', 'tasks.manage'].sort();
const ADMIN = [...SALES, 'settings'].sort();

checks.push(['public = the lock screen alone', eq(resolvedActions('public'), ['auth.login'])]);
checks.push([`member = chrome + home + placeholder + confirm-delete (${MEMBER.length})`, eq(resolvedActions('member'), MEMBER)]);
checks.push([`viewer actions = member + lists + views (${VIEWER.length})`, eq(resolvedActions('viewer'), VIEWER)]);
checks.push([`sales actions = viewer + forms + tasks + assistant (${SALES.length})`, eq(resolvedActions('sales'), SALES)]);
checks.push([`admin actions = sales + settings (${ADMIN.length})`, eq(resolvedActions('admin'), ADMIN)]);
checks.push(['dev = the devtools pair', eq(resolvedActions('dev'), ['devtools.dock', 'devtools.inspect'])]);
const USR1_EXPECTED = new Set([...SALES, ...resolvedActions('dev')]).size;
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
checks.push(['public data = nothing (no data section)', resolvedData('public').length === 0]);
checks.push([`viewer data = every read, no write (${READS.length})`, eq(resolvedData('viewer'), READS)]);
checks.push([`sales data = reads + CRM create/edit + full tasks (${READS.length + SALES_WRITES.length})`, eq(resolvedData('sales'), [...READS, ...SALES_WRITES].sort())]);
checks.push(['sales holds deals.write.update but NOT deals.write.delete', resolvedData('sales').includes('deals.write.update') && !resolvedData('sales').includes('deals.write.delete')]);
checks.push([`admin data = sales + the CRM delete tier (${READS.length + ADMIN_WRITES.length})`, eq(resolvedData('admin'), [...READS, ...ADMIN_WRITES].sort())]);
checks.push(['activities are read-only for everyone (no role grants any write leaf)', !resolvedData('admin').some((g) => g.startsWith('activities.write')) && !resolvedData('system').some((g) => g.startsWith('activities.write'))]);

// ── the trusted floor is a charter artifact too ──
checks.push([`system data = reads + the full write namespaces (${READS.length + SYSTEM_WRITES.length})`, eq(resolvedData('system'), [...READS, ...SYSTEM_WRITES].sort())]);
checks.push(['system grants no actions (an engine principal, not a user)', resolvedActions('system').length === 0]);
const systemPolicy = createScopePolicy(new Set(resolvedData('system')), scopeBehaviors);
const sysPipelines = systemPolicy.entities['pipelines'] as { read?: unknown; insert?: unknown; update?: unknown; delete?: unknown } | undefined;
checks.push(["system's compiled pipelines entity is read-only (no write phase of any kind)", sysPipelines?.read !== undefined && sysPipelines.insert === undefined && sysPipelines.update === undefined && sysPipelines.delete === undefined]);

// ── the compiled policies: grants → which vex phases exist ──
const viewerPolicy = createScopePolicy(new Set(resolvedData('viewer')), scopeBehaviors);
const salesPolicy = createScopePolicy(new Set(resolvedData('sales')), scopeBehaviors);
const adminPolicy = createScopePolicy(new Set(resolvedData('admin')), scopeBehaviors);
const phases = (p: typeof salesPolicy, t: string) => p.entities[t] as { read?: unknown[]; insert?: unknown[]; update?: unknown[]; delete?: unknown[] } | undefined;
checks.push(["viewer's deals entity has a read phase and no write phase of any kind", phases(viewerPolicy, 'deals')?.read !== undefined && phases(viewerPolicy, 'deals')?.insert === undefined && phases(viewerPolicy, 'deals')?.update === undefined && phases(viewerPolicy, 'deals')?.delete === undefined]);
checks.push(["sales's deals entity has insert+update (rule-free — ownership never writer-derived), NO delete", Array.isArray(phases(salesPolicy, 'deals')?.insert) && phases(salesPolicy, 'deals')?.insert?.length === 0 && Array.isArray(phases(salesPolicy, 'deals')?.update) && phases(salesPolicy, 'deals')?.delete === undefined]);
checks.push(["admin's deals entity gains the delete phase", Array.isArray(phases(adminPolicy, 'deals')?.delete)]);
checks.push(["tasks read carries the assignee filter (a granted behavior)", phases(viewerPolicy, 'tasks')?.read?.length === 1]);
checks.push(["sales's tasks phases carry the umbrella behaviors (insert: set+match; delete: match only)", phases(salesPolicy, 'tasks')?.insert?.length === 2 && phases(salesPolicy, 'tasks')?.delete?.length === 1]);

// ── the exact resolved LAYOUT sets — ring 2, a third universe. The base
//    is the FLOOR; variants enrich upward as grants, so `extends` composes
//    them like every other capability — no deny-it-back anywhere ──
const resolvedLayouts = (name: string): string[] => [...resolveRole(CHARTER, layoutU, name, 'layouts')].sort();
checks.push(['viewer holds no variant — the floor is not an id (ring 2)', resolvedLayouts('viewer').length === 0]);
checks.push(['sales holds the full topbar (the write-path chrome rides with the write grants)', eq(resolvedLayouts('sales'), ['chrome.topbar.full'])]);
checks.push(['admin inherits it through extends (variants compose like capabilities)', eq(resolvedLayouts('admin'), ['chrome.topbar.full'])]);
checks.push(['member and public hold no variants', resolvedLayouts('member').length === 0 && resolvedLayouts('public').length === 0]);
checks.push([
  'ring-2 documents are coherent (every variant reshapes a shipped action; one variant per action per wearer)',
  verifyVariants({ charter: CHARTER, assignments: ASSIGNMENTS, actions: CATALOG_DEFINITIONS, layouts: LAYOUT_VARIANTS }).length === 0,
]);

// ── relay's charter is coherent — same verify the shell and server boot on ──
const report = verifyCharter(CHARTER, { actions: ids, data: dataU, layouts: layoutU }, ASSIGNMENTS, auditClosure(CATALOG_DEFINITIONS, LAYOUT_VARIANTS));
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
