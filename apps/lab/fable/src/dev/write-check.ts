// Writes. Proves the full round-trip for every write: create → announce →
// re-read, complete/reopen via the inline checkbox, edit seeded from the row,
// and delete behind the confirm dialog. Run: pnpm --filter fable check:write
import { getVexRuntime } from '../vex/runtime';
import { SEED_COUNTS } from '../vex/seed';
import { shell } from '../nova/shell';

const settle = (ms = 300): Promise<void> => new Promise((r) => setTimeout(r, ms));
const active = (canvas: string): { id: string } | undefined => shell.getCanvasState(canvas).active;
const actionOn = (canvas: string): string | undefined => {
  const a = active(canvas);
  return a !== undefined ? shell.getRuntime(a.id)?.definition.id : undefined;
};
const dataOf = (canvas: string): Record<string, unknown> | undefined => {
  const a = active(canvas);
  return a !== undefined ? shell.getRuntime(a.id)?.getData() : undefined;
};
const rows = (): Record<string, unknown>[] => {
  const r = dataOf('main')?.['rows'];
  return Array.isArray(r) ? (r as Record<string, unknown>[]) : [];
};
const stats = (): Record<string, unknown> => {
  const s = dataOf('main')?.['stats'];
  return s !== null && typeof s === 'object' ? (s as Record<string, unknown>) : {};
};
const byTitle = (title: string): Record<string, unknown> | undefined => rows().find((r) => r['title'] === title);

// Find the `ui:model` ref bound to a data key in the modal's render tree —
// the same wire the real inputs dispatch on.
const modelRef = (key: string): string | undefined => {
  let found: string | undefined;
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x === null || typeof x !== 'object') return;
    const node = x as { model?: { ref?: string; path?: string }; children?: unknown };
    const path = node.model?.path;
    if (typeof path === 'string' && (path === key || path.endsWith(`.${key}`)) && typeof node.model?.ref === 'string') {
      found = node.model.ref;
    }
    if (node.children !== undefined) walk(node.children);
  };
  walk(shell.flattenRenderTree(shell.getCanvasRenderTree('modal')));
  return found;
};
const typeInto = (key: string, value: string): boolean => {
  const ref = modelRef(key);
  if (ref === undefined) return false;
  shell.dispatch({ type: 'ui:model', ref, payload: value });
  return true;
};

const main = async (): Promise<void> => {
  await getVexRuntime();
  await settle(500);
  const checks: [string, boolean][] = [];

  // ── Create ──
  shell.dispatch({ type: 'ui:click', ref: 'new' });
  await settle(150);
  checks.push([`+ New opens the form on the modal canvas`, actionOn('modal') === 'todo.form']);
  checks.push([`bare form is create mode`, dataOf('modal')?.['confirmLabel'] === 'Create' && dataOf('modal')?.['id'] === '']);
  const typed = typeInto('title', 'Feed the cat') && typeInto('priority', 'high');
  checks.push([`form fields are model-bound`, typed]);
  shell.dispatch({ type: 'ui:click', ref: 'confirm' });
  await settle(500);
  checks.push([`save closes the modal`, active('modal') === undefined]);
  const created = byTitle('Feed the cat');
  checks.push([`todos-changed re-read shows the new row`, created !== undefined]);
  checks.push([`new row round-trips priority (got ${String(created?.['priority'])})`, created?.['priority'] === 'high']);
  checks.push([`stats re-read after create (open=${String(stats()['open'])})`, Number(stats()['open']) === SEED_COUNTS.open + 1]);

  // ── Complete via the inline checkbox ──
  const id = created?.['todo_id'];
  shell.dispatch({ type: 'ui:click', ref: 'toggle', payload: { id, done: true } });
  await settle(500);
  checks.push([`completing removes it from Open`, byTitle('Feed the cat') === undefined]);
  checks.push([`stats moved (open=${String(stats()['open'])}, done=${String(stats()['done'])})`, Number(stats()['open']) === SEED_COUNTS.open && Number(stats()['done']) === SEED_COUNTS.done + 1]);
  shell.dispatch({ type: 'ui:click', ref: 'tab', payload: 'done' });
  await settle();
  checks.push([`it shows under Done, most recent first`, rows()[0]?.['title'] === 'Feed the cat']);

  // ── Reopen from the Done tab ──
  shell.dispatch({ type: 'ui:click', ref: 'toggle', payload: { id, done: false } });
  await settle(500);
  checks.push([`reopening removes it from Done`, byTitle('Feed the cat') === undefined]);
  shell.dispatch({ type: 'ui:click', ref: 'tab', payload: 'open' });
  await settle();
  checks.push([`it is back under Open`, byTitle('Feed the cat') !== undefined]);

  // ── Edit, seeded from the row ──
  shell.dispatch({ type: 'ui:click', ref: 'row-edit', payload: byTitle('Feed the cat') });
  await settle(150);
  checks.push([`row ⋯ Edit opens the form seeded`, actionOn('modal') === 'todo.form' && dataOf('modal')?.['title'] === 'Feed the cat' && dataOf('modal')?.['confirmLabel'] === 'Save']);
  typeInto('title', 'Feed the cat twice');
  shell.dispatch({ type: 'ui:click', ref: 'confirm' });
  await settle(500);
  checks.push([`edit round-trips (row renamed, count unchanged)`, byTitle('Feed the cat twice') !== undefined && byTitle('Feed the cat') === undefined && Number(stats()['open']) === SEED_COUNTS.open + 1]);

  // ── Delete behind the confirm ──
  shell.dispatch({ type: 'ui:click', ref: 'row-delete', payload: byTitle('Feed the cat twice') });
  await settle(150);
  checks.push([`row ⋯ Delete asks first`, actionOn('modal') === 'confirm-delete' && dataOf('modal')?.['label'] === 'Feed the cat twice']);
  shell.dispatch({ type: 'ui:click', ref: 'confirm' });
  await settle(500);
  checks.push([`confirm deletes and closes`, active('modal') === undefined && byTitle('Feed the cat twice') === undefined]);
  checks.push([`stats back to seed (open=${String(stats()['open'])})`, Number(stats()['open']) === SEED_COUNTS.open]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '[pass]' : '[fail]'} ${label}`);
  }
  console.log(ok ? '\nOK — create, complete, reopen, edit and delete all round-trip through todos-changed.' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
