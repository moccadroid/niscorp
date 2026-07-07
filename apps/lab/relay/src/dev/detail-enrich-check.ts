// Detail enrichment: the contact and company profiles now carry related records
// + an activity feed, like the deal workspace. This proves each new read returns
// the RIGHT rows (a shape-cache collision would silently serve another query's
// plan) by cross-checking the loaded slots against PGlite. Run:
//   pnpm --filter relay exec tsx src/dev/detail-enrich-check.ts
import { shell } from '../nova/shell';
import { getVexRuntime } from '../vex/runtime';

const settle = (ms = 300): Promise<void> => new Promise((r) => setTimeout(r, ms));
const detailRt = (): ReturnType<typeof shell.getRuntime> => {
  const a = shell.getCanvasState('main').active;
  return a !== undefined ? shell.getRuntime(a.id) : undefined;
};
const view = (): Record<string, unknown> => ((detailRt()?.getData() ?? {}) as Record<string, unknown>);
const openContact = async (id: string): Promise<void> => {
  shell.dispatch({ type: 'ui:click', ref: 'row', payload: id });
  await settle(340);
};

const main = async (): Promise<void> => {
  const rt = await getVexRuntime();
  const checks: [string, boolean][] = [];
  const one = async (sql: string): Promise<string | undefined> => ((await rt.db.query(sql)).rows[0] as { id: string } | undefined)?.id;
  const count = async (sql: string, p: unknown[]): Promise<number> => ((await rt.db.query(sql, p)).rows[0] as { n: number }).n;

  // Invariant: a contact's activity is its REAL deal touchpoints — every activity
  // with a contact is on a deal where that contact is the primary (not a random
  // company bystander). So "a contact has activity" implies "they're on that deal".
  const strays = await count(`SELECT count(*)::int AS n FROM activities a JOIN deals d ON d.id = a.deal_id WHERE a.contact_id IS NOT NULL AND a.contact_id <> d.primary_contact_id`, []);
  checks.push([`activity↔contact is the deal's primary contact, never a bystander (strays: ${strays})`, strays === 0]);

  shell.dispatch({ type: 'ui:click', ref: 'nav-contacts' });
  await settle(320);

  // ── Activity slot: the contact with the most activity ──
  const cAct = await one(`SELECT contact_id AS id FROM activities WHERE contact_id IS NOT NULL GROUP BY contact_id ORDER BY count(*) DESC LIMIT 1`);
  await openContact(cAct!);
  checks.push([`contact opened on main (got ${String(detailRt()?.definition.id)})`, detailRt()?.definition.id === 'contact']);
  const acts = (view()['activity'] ?? []) as Record<string, unknown>[];
  const dbActs = await count('SELECT count(*)::int AS n FROM activities WHERE contact_id=$1', [cAct]);
  checks.push([`activity matches the DB (${acts.length} = min(${dbActs},12)) and is non-empty`, acts.length === Math.min(dbActs, 12) && acts.length > 0]);
  checks.push([`activity rows carry body + tone (the contact-shape, not the deal one)`, 'body' in (acts[0] ?? {}) && typeof acts[0]?.['tone'] === 'string']);
  // The contact had activity → it's on a deal where they're primary, so the Deals
  // slot (now ANY status) must show that deal: a closed-deal activity is never
  // sourceless. And deals/tasks slots equal the DB for this same contact.
  const aDeals = (view()['deals'] ?? []) as unknown[];
  const aTasks = (view()['tasks'] ?? []) as unknown[];
  checks.push([`its deals slot (any status) equals the DB and is non-empty — the activity's source is visible`, aDeals.length === (await count('SELECT count(*)::int AS n FROM deals WHERE primary_contact_id=$1', [cAct])) && aDeals.length > 0]);
  checks.push([`its tasks slot equals the DB`, aTasks.length === (await count('SELECT count(*)::int AS n FROM tasks WHERE contact_id=$1 AND done=false', [cAct]))]);

  // ── Deals slot: the contact who is primary on the most deals (any status) ──
  const cDeal = await one(`SELECT primary_contact_id AS id FROM deals WHERE primary_contact_id IS NOT NULL GROUP BY primary_contact_id ORDER BY count(*) DESC LIMIT 1`);
  await openContact(cDeal!);
  const deals = (view()['deals'] ?? []) as Record<string, unknown>[];
  const dbDeals = await count('SELECT count(*)::int AS n FROM deals WHERE primary_contact_id=$1', [cDeal]);
  checks.push([`deals (any status) match the DB (${deals.length} = ${dbDeals}) and is non-empty`, deals.length === dbDeals && deals.length > 0]);
  checks.push([`deal rows carry value_display + stage + a status tone`, typeof deals[0]?.['value_display'] === 'string' && 'stage' in (deals[0] ?? {}) && typeof deals[0]?.['tone'] === 'string']);
  // The status badge binds `tone` from data — make sure that resolves to a real
  // tone and doesn't trip a schema/render error.
  const errs: string[] = [];
  const walkErr = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(walkErr);
    if (x === null || typeof x !== 'object') return;
    const n = x as { type?: string; name?: string; message?: string; children?: unknown };
    if (n.type === 'error') errs.push(`${n.name ?? '?'}: ${n.message ?? ''}`);
    if (n.children !== undefined) walkErr(n.children);
  };
  walkErr(shell.flattenRenderTree(shell.getCanvasRenderTree('main')));
  checks.push([`contact panel renders with no error nodes (${errs.join('; ') || 'none'})`, errs.length === 0]);

  // ── Tasks slot: the contact with the most open tasks ──
  const cTask = await one(`SELECT contact_id AS id FROM tasks WHERE contact_id IS NOT NULL AND done=false GROUP BY contact_id ORDER BY count(*) DESC LIMIT 1`);
  await openContact(cTask!);
  const tasks = (view()['tasks'] ?? []) as Record<string, unknown>[];
  const dbTasks = await count('SELECT count(*)::int AS n FROM tasks WHERE contact_id=$1 AND done=false', [cTask]);
  checks.push([`open tasks match the DB (${tasks.length} = min(${dbTasks},20)) and is non-empty`, tasks.length === Math.min(dbTasks, 20) && tasks.length > 0]);

  // ── Company profile: People + Open deals (no activity feed — activity lives on
  // deals/contacts, not the account; a company feed only duplicates the deals'). ──
  const company = await one(`SELECT id FROM companies WHERE EXISTS (SELECT 1 FROM deals d WHERE d.company_id = companies.id AND d.status='open') LIMIT 1`);
  shell.dispatch({ type: 'ui:click', ref: 'nav-companies' });
  await settle(320);
  shell.dispatch({ type: 'ui:click', ref: 'row', payload: company });
  await settle(340);
  checks.push([`company opened on main (got ${String(detailRt()?.definition.id)})`, detailRt()?.definition.id === 'company']);
  const coDeals = (view()['deals'] ?? []) as Record<string, unknown>[];
  const dbCoDeals = await count("SELECT count(*)::int AS n FROM deals WHERE company_id=$1 AND status='open'", [company]);
  checks.push([`company open deals match the DB (${coDeals.length} = ${dbCoDeals})`, coDeals.length === dbCoDeals && coDeals.length > 0]);
  checks.push([`company panel has no activity slot`, view()['activity'] === undefined]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — contact + company profiles load their related records; distinct shapes, no collisions.' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
