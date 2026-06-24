// Row ⋯ menu actions (Edit + Delete-with-confirm) across contacts, deals and the
// company cascade. Drives the lists headlessly with REAL row payloads (the Table
// passes the whole row to menu items), opens the edit form / confirm dialog, and
// proves the writes land in PGlite and the lists re-read. Run:
//   pnpm --filter relay exec tsx src/dev/row-actions-check.ts
import { shell } from '../nova/shell';
import { getVexRuntime } from '../vex/runtime';

const settle = (ms = 220): Promise<void> => new Promise((r) => setTimeout(r, ms));
const mainData = (): Record<string, unknown> => {
  const a = shell.getCanvasState('main').active;
  return (a !== undefined ? shell.getRuntime(a.id)?.getData() : {}) as Record<string, unknown>;
};
const rows = (): Record<string, unknown>[] => (mainData()['rows'] ?? []) as Record<string, unknown>[];
const modalRt = (): ReturnType<typeof shell.getRuntime> => {
  const a = shell.getCanvasState('modal').active;
  return a !== undefined ? shell.getRuntime(a.id) : undefined;
};
const modalId = (): string | undefined => modalRt()?.definition.id;
const modalData = (): Record<string, unknown> => (modalRt()?.getData() ?? {}) as Record<string, unknown>;

const main = async (): Promise<void> => {
  const rt = await getVexRuntime();
  const checks: [string, boolean][] = [];

  // ── Contacts: row → Edit seeds the form (incl. phone, which the table doesn't show) ──
  shell.dispatch({ type: 'ui:click', ref: 'nav-contacts' });
  await settle(320);
  const c0 = rows().find((r) => String(r['phone'] ?? '') !== '') ?? rows()[0];
  shell.dispatch({ type: 'ui:click', ref: 'row-edit', payload: c0 });
  await settle(260);
  checks.push([`contact Edit opens the form (got ${String(modalId())})`, modalId() === 'contact.form']);
  const cf = modalData();
  checks.push([`form seeded id/name/phone/company from the row`, cf['id'] === c0['contact_id'] && cf['name'] === c0['name'] && cf['phone'] === c0['phone'] && cf['company'] === (c0['company'] as Record<string, unknown>)['company_id']]);
  shell.dispatch({ type: 'ui:click', ref: 'cancel' });
  await settle(120);

  // ── Contacts: row → Delete asks first, then deletes on confirm ──
  const cDel = rows()[1];
  const beforeC = rows().length;
  shell.dispatch({ type: 'ui:click', ref: 'row-delete', payload: cDel });
  await settle(220);
  checks.push([`contact Delete opens the confirm dialog (got ${String(modalId())})`, modalId() === 'confirm-delete']);
  checks.push([`confirm shows the contact's name (got ${String(modalData()['label'])})`, modalData()['label'] === cDel['name']]);
  checks.push([`nothing deleted yet (still ${rows().length})`, rows().length === beforeC]);
  shell.dispatch({ type: 'ui:click', ref: 'confirm' }); // the dialog's Delete
  await settle(360);
  const goneC = (await rt.db.query('SELECT count(*)::int AS n FROM contacts WHERE id = $1', [cDel['contact_id']])).rows[0] as { n: number };
  checks.push([`contact row deleted from PGlite (rows with id: ${goneC.n})`, goneC.n === 0]);
  checks.push([`list re-read shrank (${beforeC} → ${rows().length})`, rows().length === beforeC - 1]);
  checks.push([`confirm dialog closed`, shell.getCanvasState('modal').active === undefined]);

  // ── Deals: row → Edit seeds raw value (number) + stage_id + raw close_date ──
  shell.dispatch({ type: 'ui:click', ref: 'nav-deals' });
  await settle(320);
  const d0 = rows().find((r) => typeof r['value'] === 'number') ?? rows()[0];
  shell.dispatch({ type: 'ui:click', ref: 'row-edit', payload: d0 });
  await settle(260);
  checks.push([`deal Edit opens the form (got ${String(modalId())})`, modalId() === 'deal.form']);
  const df = modalData();
  checks.push([`deal form seeded value as a number + stage_id + raw close_date`, typeof df['value'] === 'number' && df['value'] === d0['value'] && df['stage'] === d0['stage_id'] && df['close_date'] === d0['close_date'] && df['company'] === d0['company_id']]);
  shell.dispatch({ type: 'ui:click', ref: 'cancel' });
  await settle(120);

  // ── Deals: row → Delete cascades the line items ──
  const dDel = rows()[0];
  const dId = dDel['deal_id'] as string;
  const liBefore = (await rt.db.query('SELECT count(*)::int AS n FROM deal_products WHERE deal_id = $1', [dId])).rows[0] as { n: number };
  shell.dispatch({ type: 'ui:click', ref: 'row-delete', payload: dDel });
  await settle(220);
  checks.push([`deal Delete opens the confirm dialog (label ${String(modalData()['label'])})`, modalId() === 'confirm-delete' && modalData()['label'] === dDel['title']]);
  shell.dispatch({ type: 'ui:click', ref: 'confirm' });
  await settle(360);
  const goneD = (await rt.db.query('SELECT count(*)::int AS n FROM deals WHERE id = $1', [dId])).rows[0] as { n: number };
  const goneLI = (await rt.db.query('SELECT count(*)::int AS n FROM deal_products WHERE deal_id = $1', [dId])).rows[0] as { n: number };
  checks.push([`deal deleted (rows with id: ${goneD.n})`, goneD.n === 0]);
  checks.push([`its ${liBefore.n} line item(s) cascaded away (now ${goneLI.n})`, goneLI.n === 0]);

  // ── Company delete cascades its contacts + deals ──
  shell.dispatch({ type: 'ui:click', ref: 'nav-companies' });
  await settle(320);
  // pick a company that has both contacts and deals
  const withChildren = (await rt.db.query(`
    SELECT c.id FROM companies c
    WHERE EXISTS (SELECT 1 FROM contacts ct WHERE ct.company_id = c.id)
      AND EXISTS (SELECT 1 FROM deals d WHERE d.company_id = c.id)
    LIMIT 1`)).rows[0] as { id: string };
  const coRow = rows().find((r) => r['company_id'] === withChildren.id);
  const kidsBefore = (await rt.db.query('SELECT (SELECT count(*) FROM contacts WHERE company_id=$1)::int AS c, (SELECT count(*) FROM deals WHERE company_id=$1)::int AS d', [withChildren.id])).rows[0] as { c: number; d: number };
  shell.dispatch({ type: 'ui:click', ref: 'row-delete', payload: coRow });
  await settle(220);
  shell.dispatch({ type: 'ui:click', ref: 'confirm' });
  await settle(380);
  const after = (await rt.db.query('SELECT (SELECT count(*) FROM companies WHERE id=$1)::int AS co, (SELECT count(*) FROM contacts WHERE company_id=$1)::int AS c, (SELECT count(*) FROM deals WHERE company_id=$1)::int AS d', [withChildren.id])).rows[0] as { co: number; c: number; d: number };
  checks.push([`company had ${kidsBefore.c} contacts + ${kidsBefore.d} deals`, kidsBefore.c > 0 && kidsBefore.d > 0]);
  checks.push([`company + its contacts + its deals all gone (co=${after.co} c=${after.c} d=${after.d})`, after.co === 0 && after.c === 0 && after.d === 0]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — row Edit seeds from the row; Delete confirms then writes; FKs cascade.' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
