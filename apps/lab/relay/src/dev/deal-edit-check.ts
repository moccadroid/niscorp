// Deal edit round-trip. Opens the deal workspace for a real open deal, clicks
// Edit (which seeds the form from the RAW record — value is the number, stage is
// the stage_id), changes the value + stage, saves (deal.update), and asserts the
// record re-read reflects the new value AS A NUMBER and the new stage. Run:
//   pnpm --filter relay exec tsx src/dev/deal-edit-check.ts
import { shell } from '../nova/shell';
import { getVexRuntime } from '../vex/runtime';

const settle = (ms = 220): Promise<void> => new Promise((r) => setTimeout(r, ms));
const modalRt = (): ReturnType<typeof shell.getRuntime> => {
  const a = shell.getCanvasState('modal').active;
  return a !== undefined ? shell.getRuntime(a.id) : undefined;
};
const modalId = (): string | undefined => modalRt()?.definition.id;
const modalData = (): Record<string, unknown> => (modalRt()?.getData() ?? {}) as Record<string, unknown>;

const main = async (): Promise<void> => {
  const rt = await getVexRuntime();
  const checks: [string, boolean][] = [];

  const deal = (await rt.db.query("SELECT id, stage_id, value FROM deals WHERE status='open' LIMIT 1")).rows[0] as { id: string; stage_id: string; value: unknown };
  // A different in-progress stage to move it to.
  const otherStage = (await rt.db.query("SELECT id, name FROM stages WHERE win_probability > 0 AND win_probability < 100 AND id <> $1 ORDER BY position LIMIT 1", [deal.stage_id])).rows[0] as { id: string; name: string };

  // Open the deal workspace.
  shell.dispatch({ type: 'ui:click', ref: 'nav-pipeline' });
  await settle(320);
  shell.dispatch({ type: 'ui:click', ref: 'card', payload: deal.id });
  await settle(300);
  checks.push([`deal workspace opened (got ${String(modalId())})`, modalId() === 'deal']);
  const rec = (modalData()['view'] as Record<string, unknown>)?.['record'] as Record<string, unknown>;
  checks.push([`record value is a number (got ${typeof rec?.['value']} ${String(rec?.['value'])})`, typeof rec?.['value'] === 'number']);
  checks.push([`record carries the raw stage_id (got ${String(rec?.['stage_id'])})`, rec?.['stage_id'] === deal.stage_id]);

  // Click Edit → the deal form (edit mode: saveFn=deal.update) stacks on the
  // modal canvas, seeded raw from the record.
  shell.dispatch({ type: 'ui:click', ref: 'edit' });
  await settle(300);
  checks.push([`Edit opens the deal form (got ${String(modalId())})`, modalId() === 'deal.form']);
  checks.push([`form is in edit mode (saveFn=${String(modalData()['saveFn'])})`, modalData()['saveFn'] === 'deal.update']);
  const seeded = modalData();
  checks.push([`form seeded value as a number (got ${typeof seeded['value']} ${String(seeded['value'])})`, typeof seeded['value'] === 'number' && seeded['value'] === rec['value']]);
  checks.push([`form seeded the stage_id (so the Stage select pre-selects, got ${String(seeded['stage'])})`, seeded['stage'] === deal.stage_id]);

  // Change value + stage, then save.
  const newValue = 73737;
  modalRt()?.setData({ ...seeded, value: newValue, stage: otherStage.id });
  shell.dispatch({ type: 'ui:click', ref: 'confirm' });
  await settle(360);
  // Save now REPLACES the form with the deal workspace for the saved id (unified
  // create/edit post-success), rather than popping.
  checks.push([`save returns to the deal workspace (got ${String(modalId())})`, modalId() === 'deal']);

  // The DB row reflects the edit, value still numeric.
  const after = (await rt.db.query('SELECT value, stage_id FROM deals WHERE id = $1', [deal.id])).rows[0] as { value: unknown; stage_id: string };
  checks.push([`DB value updated to the new number (got ${typeof after.value} ${String(after.value)})`, Number(after.value) === newValue]);
  checks.push([`DB stage moved (got ${after.stage_id})`, after.stage_id === otherStage.id]);

  // The re-read record (deals-changed → loadRecord) shows the new value as a number.
  const rec2 = (modalData()['view'] as Record<string, unknown>)?.['record'] as Record<string, unknown>;
  checks.push([`re-read record value is the new number (got ${typeof rec2?.['value']} ${String(rec2?.['value'])})`, rec2?.['value'] === newValue]);
  checks.push([`value_display is formatted off it (got ${String(rec2?.['value_display'])})`, typeof rec2?.['value_display'] === 'string' && String(rec2?.['value_display']).startsWith('$')]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — deal edit round-trips; value is a number, formatting is separate.' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
