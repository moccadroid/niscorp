import { getApp } from '../boot';
import { activeData, activeDefinition, check, fail, finish, isRecord, records, renderActive, waitFor } from './harness';

// The write round-trips, driven through the real shell: create → announce →
// re-read; edit seeded from a row; complete; delete with confirm. Every
// mutation flows through a trigger → endpoint → todos-changed.

const run = async (): Promise<never> => {
  const app = await getApp();
  const shell = app.shell;
  const listTodos = (): Record<string, unknown>[] => records(activeData(shell, 'main')['todos']);

  await waitFor(() => activeData(shell, 'main')['loading'] === false);
  check('list starts with the 8 seeded open todos', listTodos().length === 8);

  // ── Create ────────────────────────────────────────────────
  shell.dispatch({ type: 'ui:click', ref: 'new-todo' });
  check('+ Plant opens the form on the overlay', activeDefinition(shell, 'overlay') === 'todo-form');

  renderActive(shell, 'overlay');
  shell.dispatch({ type: 'ui:model', ref: 'field-title', payload: 'Feed the sourdough starter' });
  shell.dispatch({ type: 'ui:model', ref: 'field-notes', payload: 'It has a name now. That is a problem.' });
  check('model bindings write the form data', activeData(shell, 'overlay')['title'] === 'Feed the sourdough starter');

  shell.dispatch({ type: 'ui:click', ref: 'save-create' });
  await waitFor(() => shell.getCanvasState('overlay').active === undefined);
  check('save closes the form', shell.getCanvasState('overlay').active === undefined);

  await waitFor(() => listTodos().length === 9);
  const created = listTodos().find((t) => t['title'] === 'Feed the sourdough starter');
  check('create → todos-changed → the list re-read shows the new todo', created !== undefined);
  check('the new todo was stamped with a bloom kind', isRecord(created) && typeof created['bloom'] === 'string' && created['bloom'] !== '');

  if (!isRecord(created)) return finish('todos');

  // ── Edit, seeded from the row ─────────────────────────────
  shell.dispatch({ type: 'ui:click', ref: 'row-edit', payload: created });
  renderActive(shell, 'overlay');
  const form = activeData(shell, 'overlay');
  check('✎ opens the form seeded with the row', activeDefinition(shell, 'overlay') === 'todo-form' && form['todo_id'] === created['todo_id'] && form['title'] === created['title']);

  shell.dispatch({ type: 'ui:model', ref: 'field-title', payload: 'Feed the sourdough starter twice' });
  shell.dispatch({ type: 'ui:click', ref: 'save-update' });
  await waitFor(() => shell.getCanvasState('overlay').active === undefined);
  await waitFor(() => listTodos().some((t) => t['title'] === 'Feed the sourdough starter twice'));
  check('edit round-trips through PUT and the re-read', listTodos().some((t) => t['title'] === 'Feed the sourdough starter twice'));

  // ── Complete ──────────────────────────────────────────────
  const before = listTodos().length;
  shell.dispatch({ type: 'ui:click', ref: 'row-complete', payload: created['todo_id'] });
  await waitFor(() => listTodos().length === before - 1);
  check('checking a row completes it and it leaves the patch', listTodos().length === before - 1);
  await waitFor(() => {
    const stats = activeData(shell, 'main')['stats'];
    return isRecord(stats) && stats['done_today'] === 2;
  });
  const stats = activeData(shell, 'main')['stats'];
  check('done-today combo ticked up to 2', isRecord(stats) && stats['done_today'] === 2);

  // ── Delete, with confirm ──────────────────────────────────
  const victim = listTodos().find((t) => t['title'] === 'Descale the kettle');
  check('a seeded row is available to delete', victim !== undefined);
  if (isRecord(victim)) {
    shell.dispatch({ type: 'ui:click', ref: 'row-delete', payload: victim });
    const confirm = activeData(shell, 'overlay');
    check('✕ opens the confirm overlay with the title', activeDefinition(shell, 'overlay') === 'todo-confirm-delete' && confirm['title'] === 'Descale the kettle');
    shell.dispatch({ type: 'ui:click', ref: 'confirm-delete' });
    await waitFor(() => listTodos().length === before - 2);
    check('confirm deletes the todo and the list re-reads', listTodos().length === before - 2);
    check('the confirm overlay closed itself', shell.getCanvasState('overlay').active === undefined);
  }

  return finish('todos');
};

run().catch((err) => fail('todos', err));
