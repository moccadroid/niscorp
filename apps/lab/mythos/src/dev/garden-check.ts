import { getApp } from '../boot';
import { activeData, activeDefinition, check, fail, finish, isRecord, records, waitFor } from './harness';

// The garden twist: stages computed from the seed, bloom-on-click with the
// confetti spark, and replanting a bloom back into a sprout.

const run = async (): Promise<never> => {
  const app = await getApp();
  const shell = app.shell;
  const garden = (): Record<string, unknown>[] => records(activeData(shell, 'main')['garden']);
  const stageOf = (id: unknown): string => {
    const plot = garden().find((p) => p['todo_id'] === id);
    return typeof plot?.['stage'] === 'string' ? plot['stage'] : '';
  };

  shell.dispatch({ type: 'ui:click', ref: 'nav-garden' });
  check('the Garden tab swaps the main canvas', activeDefinition(shell, 'main') === 'todo-garden');

  await waitFor(() => activeData(shell, 'main')['loading'] === false);
  check('the garden shows all 12 seeded plots', garden().length === 12);

  const byStage = (stage: string): number => garden().filter((p) => p['stage'] === stage).length;
  check('4 blooms (done todos)', byStage('bloom') === 4, `got ${byStage('bloom')}`);
  check('3 wilting (overdue todos)', byStage('wilt') === 3, `got ${byStage('wilt')}`);
  check('5 sprouts (open todos)', byStage('sprout') === 5, `got ${byStage('sprout')}`);
  check(
    'is_bloom flags agree with stages',
    garden().every((p) => (p['is_bloom'] === true) === (p['stage'] === 'bloom')),
  );

  // ── Tap a sprout → it blooms, confetti sparks ─────────────
  const sprout = garden().find((p) => p['stage'] === 'sprout');
  check('a sprout is available to bloom', sprout !== undefined);
  if (isRecord(sprout)) {
    shell.dispatch({ type: 'ui:click', ref: 'plot-sprout', payload: sprout['todo_id'] });
    await waitFor(() => stageOf(sprout['todo_id']) === 'bloom');
    check('tapping a sprout blooms it', stageOf(sprout['todo_id']) === 'bloom');
    check('the bloom fired the confetti spark', activeData(shell, 'main')['spark'] === 1);
    const stats = activeData(shell, 'main')['stats'];
    check('stats re-read after the bloom (combo is 2)', isRecord(stats) && stats['done_today'] === 2);

    // ── Tap the bloom → it replants ─────────────────────────
    shell.dispatch({ type: 'ui:click', ref: 'plot-bloom', payload: sprout['todo_id'] });
    await waitFor(() => stageOf(sprout['todo_id']) === 'sprout');
    check('tapping a bloom replants it as a sprout', stageOf(sprout['todo_id']) === 'sprout');
    check('replanting does not spark confetti', activeData(shell, 'main')['spark'] === 1);
  }

  return finish('garden');
};

run().catch((err) => fail('garden', err));
