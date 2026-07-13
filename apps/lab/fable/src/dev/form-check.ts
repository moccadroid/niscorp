// The form's public contract. Proves the one-form-two-modes convention
// (bare = create, seeded = edit), that cancel never writes, and that every
// action's declared `input` is a subset of its `data` keys (rule 11 / review
// item 3), mechanically. Run: pnpm --filter fable check:form
import { getVexRuntime } from '../vex/runtime';
import { SEED_COUNTS } from '../vex/seed';
import { shell, ACTIONS } from '../nova/shell';

const settle = (ms = 300): Promise<void> => new Promise((r) => setTimeout(r, ms));
const active = (canvas: string): { id: string } | undefined => shell.getCanvasState(canvas).active;
const dataOf = (canvas: string): Record<string, unknown> | undefined => {
  const a = active(canvas);
  return a !== undefined ? shell.getRuntime(a.id)?.getData() : undefined;
};
const rows = (): Record<string, unknown>[] => {
  const r = dataOf('main')?.['rows'];
  return Array.isArray(r) ? (r as Record<string, unknown>[]) : [];
};

const main = async (): Promise<void> => {
  await getVexRuntime();
  await settle(500);
  const checks: [string, boolean][] = [];

  // Every declared `input` is a JSON Schema whose properties ⊆ data keys.
  for (const action of Object.values(ACTIONS)) {
    if (action.input === undefined) continue;
    const props: unknown = action.input['properties'];
    const declared = props !== null && typeof props === 'object' ? Object.keys(props) : [];
    const dataKeys = Object.keys(action.data ?? {});
    const extras = declared.filter((k) => !dataKeys.includes(k));
    checks.push([`${action.id}: input ⊆ data (${declared.length} declared${extras.length > 0 ? `, extras: ${extras.join(',')}` : ''})`, declared.length > 0 && extras.length === 0]);
  }

  // Bare = create mode, with the definition's defaults.
  shell.dispatch({ type: 'ui:click', ref: 'new' });
  await settle(150);
  const bare = dataOf('modal');
  checks.push([
    `bare form = create defaults`,
    bare?.['modalTitle'] === 'New todo' && bare?.['confirmLabel'] === 'Create' && bare?.['id'] === '' && bare?.['priority'] === 'medium',
  ]);
  shell.dispatch({ type: 'ui:click', ref: 'cancel' });
  await settle(150);
  checks.push([`cancel closes without writing (open=${rows().length})`, active('modal') === undefined && rows().length === SEED_COUNTS.open]);

  // Seeded = edit mode: raw values round-trip into the fields.
  const seedRow = rows().find((r) => r['title'] === 'Renew the domain');
  shell.dispatch({ type: 'ui:click', ref: 'row-edit', payload: seedRow });
  await settle(150);
  const seeded = dataOf('modal');
  checks.push([`seeded form = edit mode`, seeded?.['modalTitle'] === 'Edit todo' && seeded?.['confirmLabel'] === 'Save']);
  checks.push([`raw id/title seeded`, seeded?.['id'] === seedRow?.['todo_id'] && seeded?.['title'] === 'Renew the domain']);
  checks.push([`raw ISO date seeded (got "${String(seeded?.['due'])}")`, /^\d{4}-\d{2}-\d{2}$/.test(String(seeded?.['due']))]);
  checks.push([`raw priority seeded (got "${String(seeded?.['priority'])}")`, seeded?.['priority'] === 'high']);
  shell.dispatch({ type: 'ui:click', ref: 'cancel' });
  await settle(150);
  checks.push([`edit cancel writes nothing`, rows().find((r) => r['title'] === 'Renew the domain') !== undefined]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '[pass]' : '[fail]'} ${label}`);
  }
  console.log(ok ? '\nOK — one form, two modes, honest input contracts.' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
