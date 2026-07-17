// Task management end-to-end. Drives the Tasks screen + deal modal headlessly:
// the scope tabs match the DB, the inline checkbox completes/reopens (task.setDone),
// the row ⋯ menu edits (task.update) and deletes (task.delete behind the confirm),
// and a deal's task completes from the workspace. Run:
//   pnpm --filter relay exec tsx src/dev/task-mgmt-check.ts
import { shell, runtime } from './check-shell';
import { todayStr } from '@relay/app/data/date';

const settle = (ms = 240): Promise<void> => new Promise((r) => setTimeout(r, ms));
const mainData = (): Record<string, unknown> => {
  const a = shell.getCanvasState('main').active;
  return (a !== undefined ? shell.getRuntime(a.id)?.getData() : {}) as Record<string, unknown>;
};
const rows = (): Record<string, unknown>[] => (mainData()['rows'] ?? []) as Record<string, unknown>[];
const mainId = (): string | undefined => {
  const a = shell.getCanvasState('main').active;
  return a !== undefined ? shell.getRuntime(a.id)?.definition.id : undefined;
};
const modalRt = (): ReturnType<typeof shell.getRuntime> => {
  const a = shell.getCanvasState('modal').active;
  return a !== undefined ? shell.getRuntime(a.id) : undefined;
};
const modalId = (): string | undefined => modalRt()?.definition.id;
const modalData = (): Record<string, unknown> => (modalRt()?.getData() ?? {}) as Record<string, unknown>;

const main = async (): Promise<void> => {
  const checks: [string, boolean][] = [];
  const count = async (sql: string, p: unknown[] = []): Promise<number> => ((await runtime.db.query(sql, p)).rows[0] as { n: number }).n;
  const me = "assignee_id='usr_001'";
  const tab = async (scope: string): Promise<void> => {
    shell.dispatch({ type: 'ui:click', ref: 'tab', payload: scope });
    await settle(260);
  };

  shell.dispatch({ type: 'ui:click', ref: 'nav-tasks' });
  await settle(340);

  // ── Scope tabs match the DB ──
  await tab('open');
  checks.push([`Open tab = my not-done (${rows().length})`, rows().length === (await count(`SELECT count(*)::int n FROM tasks WHERE ${me} AND done=false`))]);
  await tab('done');
  checks.push([`Done tab = my done (${rows().length})`, rows().length === (await count(`SELECT count(*)::int n FROM tasks WHERE ${me} AND done=true`))]);
  await tab('all');
  checks.push([`All tab = all mine (${rows().length})`, rows().length === (await count(`SELECT count(*)::int n FROM tasks WHERE ${me}`))]);
  await tab('overdue');
  const overdueOk = rows().length === (await count(`SELECT count(*)::int n FROM tasks WHERE ${me} AND done=false AND due_date < $1`, [todayStr()])) && rows().length > 0;
  checks.push([`Overdue tab = not-done & past ${todayStr()} (${rows().length})`, overdueOk]);

  // ── Inline complete: check off an open task → it leaves the Open list, lands done ──
  await tab('open');
  const openBefore = rows().length;
  const t = rows()[0];
  const tId = t['task_id'] as string;
  shell.dispatch({ type: 'ui:click', ref: 'toggle', payload: { id: tId, done: true } });
  await settle(360);
  checks.push([`completing persists done=true`, (await count('SELECT count(*)::int n FROM tasks WHERE id=$1 AND done=true', [tId])) === 1]);
  checks.push([`it left the Open list (${openBefore} → ${rows().length})`, rows().length === openBefore - 1 && !rows().some((r) => r['task_id'] === tId)]);

  // ── Reopen from the Done tab ──
  await tab('done');
  checks.push([`it shows on the Done tab now`, rows().some((r) => r['task_id'] === tId)]);
  shell.dispatch({ type: 'ui:click', ref: 'toggle', payload: { id: tId, done: false } });
  await settle(360);
  checks.push([`reopening persists done=false`, (await count('SELECT count(*)::int n FROM tasks WHERE id=$1 AND done=false', [tId])) === 1]);

  // ── Edit a task from the row ⋯ menu (seeded from the row, saves the new title) ──
  await tab('open');
  const er = rows()[0];
  shell.dispatch({ type: 'ui:click', ref: 'row-edit', payload: er });
  await settle(280);
  checks.push([`Edit opens the form (got ${String(modalId())})`, modalId() === 'tasks.form']);
  checks.push([`form seeded id/title/raw due from the row`, modalData()['id'] === er['task_id'] && modalData()['title'] === er['title'] && modalData()['due'] === er['due_date']]);
  modalRt()?.setData({ ...modalData(), title: 'Renamed by check' });
  shell.dispatch({ type: 'ui:click', ref: 'confirm' });
  await settle(360);
  checks.push([`save updated the title in PGlite`, (await count("SELECT count(*)::int n FROM tasks WHERE id=$1 AND title='Renamed by check'", [er['task_id']])) === 1]);

  // ── Delete a task (confirm first, then it's gone) ──
  const dr = rows()[1];
  const dId = dr['task_id'] as string;
  shell.dispatch({ type: 'ui:click', ref: 'row-delete', payload: dr });
  await settle(240);
  checks.push([`Delete opens the confirm dialog (label ${String(modalData()['label'])})`, modalId() === 'confirm-delete' && modalData()['label'] === dr['title']]);
  shell.dispatch({ type: 'ui:click', ref: 'confirm' });
  await settle(360);
  checks.push([`task deleted from PGlite`, (await count('SELECT count(*)::int n FROM tasks WHERE id=$1', [dId])) === 0]);

  // ── Complete a deal's task from the workspace ──
  const dealWithTask = (await runtime.db.query("SELECT deal_id, id AS task_id FROM tasks WHERE done=false AND deal_id IS NOT NULL LIMIT 1")).rows[0] as { deal_id: string; task_id: string };
  shell.dispatch({ type: 'ui:click', ref: 'nav-pipeline' });
  await settle(320);
  shell.dispatch({ type: 'ui:click', ref: 'card', payload: dealWithTask.deal_id });
  await settle(320);
  checks.push([`deal workspace drilled on main (got ${String(mainId())})`, mainId() === 'crm.deal.view']);
  shell.dispatch({ type: 'ui:click', ref: 'complete-task', payload: dealWithTask.task_id });
  await settle(360);
  checks.push([`deal task completed from the workspace`, (await count('SELECT count(*)::int n FROM tasks WHERE id=$1 AND done=true', [dealWithTask.task_id])) === 1]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — tasks: scope tabs, inline complete/reopen, edit, delete, and complete-from-deal all persist.' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
