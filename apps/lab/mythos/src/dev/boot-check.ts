import { getApp } from '../boot';
import { readEntries } from '../api/reads';
import { activeData, activeDefinition, check, componentNames, fail, finish, isRecord, records, waitFor } from './harness';

// Boot: schema+seed, engine+prewarm, one warm read end-to-end, the shell's
// initial canvases, and the kitchen-sink surface rendering every primitive.

const KIT = ['Surface', 'Stack', 'Text', 'Card', 'Button', 'Checkbox', 'Chip', 'Meter', 'Input', 'TextArea', 'Doodle', 'Confetti'];

const run = async (): Promise<never> => {
  const app = await getApp();

  const keys = await app.engine.cache.keys();
  check(
    'prewarm wrote one vex_cache row per read entry',
    keys.length === Object.keys(readEntries).length,
    `${keys.length} keys for ${Object.keys(readEntries).length} entries`,
  );

  const open = await app.engine.execute(
    { fingerprint: readEntries.todosOpen.fingerprint, context: { today: app.today } },
    { locked: true, scope: {} },
  );
  check('todosOpen is a warm cache hit', open.meta.cache.hit);
  const rows = records(open.result);
  check('todosOpen returns the 8 seeded open todos', rows.length === 8, `got ${rows.length}`);
  check('todosOpen flags the 3 overdue todos', rows.filter((r) => r['overdue'] === true).length === 3);
  const first = rows[0];
  check(
    'todosOpen rows carry formatted display fields',
    first !== undefined && typeof first['due_display'] === 'string' && first['due_display'] !== '',
  );

  // An unknown fingerprint must throw loudly (warm-only discipline).
  let novelThrew = false;
  try {
    await app.engine.execute({ fingerprint: 'todos/nonsense', context: {} }, { locked: true, scope: {} });
  } catch {
    novelThrew = true;
  }
  check('an unknown fingerprint throws instead of reaching an LLM', novelThrew);

  check('topbar mounted on the chrome canvas', activeDefinition(app.shell, 'chrome') === 'topbar');
  check('todo-list mounted on the main canvas', activeDefinition(app.shell, 'main') === 'todo-list');

  await waitFor(() => activeData(app.shell, 'main')['loading'] === false);
  const list = activeData(app.shell, 'main');
  check('todo-list loaded its todos through /api/query', records(list['todos']).length === 8);
  const stats = list['stats'];
  check('todo-list stats slot filled, mood is blush (3 overdue)', isRecord(stats) && stats['mood'] === 'blush');

  // Kit surface: every registered primitive actually renders.
  const sinkId = app.shell.push('main', 'kitchen-sink');
  const sink = app.shell.getRuntime(sinkId);
  const names = componentNames(sink?.render() ?? []);
  const missing = KIT.filter((name) => !names.has(name));
  check('kitchen-sink renders every kit primitive', missing.length === 0, `missing: ${missing.join(', ')}`);
  app.shell.pop('main');

  return finish('boot');
};

run().catch((err) => fail('boot', err));
