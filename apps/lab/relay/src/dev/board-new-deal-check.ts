// Repro: does a freshly created OPEN deal appear on the Kanban board?
// Navigate to the board, snapshot its cards, create a deal over the WIRE
// (the same fingerprint replay the deal form sends, as alex), announce
// `deals-changed` (the board listens), then re-read its cards + columns and
// assert the new deal is there and lands in a column.
// Run: pnpm --filter relay exec tsx src/dev/board-new-deal-check.ts
import { shell, wire, runtime } from './check-shell';
import { dealUpsert } from '@relay/app/vex/deals.entries';

const settle = (ms = 250): Promise<void> => new Promise((r) => setTimeout(r, ms));
const mainData = (): Record<string, unknown> | undefined => {
  const a = shell.getCanvasState('main').active;
  return a !== undefined ? shell.getRuntime(a.id)?.getData() : undefined;
};
const board = (): { stages?: Record<string, unknown>[]; deals?: Record<string, unknown>[] } =>
  (mainData() ?? {}) as { stages?: Record<string, unknown>[]; deals?: Record<string, unknown>[] };
const modalData = (): Record<string, unknown> | undefined => {
  const a = shell.getCanvasState('modal').active;
  return a !== undefined ? shell.getRuntime(a.id)?.getData() : undefined;
};

const main = async (): Promise<void> => {
  const checks: [string, boolean][] = [];

  shell.dispatch({ type: 'ui:click', ref: 'nav-pipeline' });
  await settle(320);
  const before = board().deals ?? [];
  const colsBefore = board().stages ?? [];
  console.log(`board: ${before.length} cards, ${colsBefore.length} columns: ${colsBefore.map((c) => `${String(c['stage'])}×${String(c['count'])}`).join(', ')}`);

  // A real company + the 'Lead' stage (which already has open deals → a column).
  const co = (await runtime.db.query('SELECT id, name FROM companies LIMIT 1')).rows[0] as { id: string; name: string };
  const stg = (await runtime.db.query("SELECT id, name FROM stages WHERE name='Lead' LIMIT 1")).rows[0] as { id: string; name: string };
  const res = await wire('/api/deals/vex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fingerprint: dealUpsert.fingerprint,
      context: { title: 'Board Repro Deal', company_id: co.id, stage_id: stg.id, primary_contact_id: null, value: 4242, close_date: null },
    }),
  });
  const created = ((await res.json()) as { result?: Record<string, unknown> }).result ?? {};
  console.log(`created deal ${String(created['id']).slice(0, 8)}… status=${String(created['status'])} stage=${stg.name} company=${co.name}`);

  // Announce the change the way the deal form does on create; the board re-reads.
  shell.publish('deals-changed');
  await settle(350);
  const after = board().deals ?? [];
  const colsAfter = board().stages ?? [];
  const mine = after.find((d) => d['deal_id'] === created['id']);
  const leadCol = colsAfter.find((c) => c['stage'] === stg.name);

  checks.push([`card count grew (${before.length} → ${after.length})`, after.length === before.length + 1]);
  checks.push([`the new deal is in the board cards`, mine !== undefined]);
  checks.push([`its stage name is set (got ${String(mine?.['stage'])})`, mine?.['stage'] === stg.name]);
  checks.push([`a column exists for that stage (so the card renders)`, leadCol !== undefined]);
  checks.push([`value is a number (got ${typeof mine?.['value']} ${String(mine?.['value'])})`, typeof mine?.['value'] === 'number' && mine?.['value'] === 4242]);
  checks.push([`value_display is formatted (got ${String(mine?.['value_display'])})`, typeof mine?.['value_display'] === 'string' && String(mine?.['value_display']).startsWith('$')]);

  // The deal form's Stage picker must only offer in-progress pipeline stages — never
  // the terminal Closed Won/Lost (an open deal there would have no board column).
  shell.publish('new');
  await settle(280);
  const opts = (modalData()?.['stageOptions'] ?? []) as Record<string, unknown>[];
  const names = opts.map((o) => String(o['name']));
  checks.push([`Stage picker lists the 4 pipeline stages (got ${names.join(', ')})`, names.length === 4]);
  checks.push([`Stage picker excludes the terminal stages`, !names.includes('Closed Won') && !names.includes('Closed Lost')]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — a new open deal appears on the board.' : '\nFAIL — new deal missing from the board.');
  process.exit(ok ? 0 : 1);
};
void main();
