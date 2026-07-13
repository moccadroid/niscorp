import { evaluate, validate } from '@niscorp/prism';
import { getApp } from '../boot';
import { streakFromDoneDays } from '../nova/chrome/topbar.prism';
import { activeData, check, fail, finish, isRecord, records, waitFor } from './harness';

// The mood palette and streak derivations: seed state (blush, streak 3),
// the streak transform against synthetic day sets, and the mood calming
// down as the overdue todos get completed through the real list UI.

const shiftDay = (today: string, days: number): string => {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const run = async (): Promise<never> => {
  const app = await getApp();
  const shell = app.shell;
  const topbarStats = (): Record<string, unknown> => {
    const stats = activeData(shell, 'chrome')['stats'];
    return isRecord(stats) ? stats : {};
  };
  const listTodos = (): Record<string, unknown>[] => records(activeData(shell, 'main')['todos']);

  await waitFor(() => activeData(shell, 'main')['loading'] === false);
  await waitFor(() => topbarStats()['mood'] === 'blush');
  check('seed mood is blush (3 overdue)', topbarStats()['mood'] === 'blush');
  check('mood label reads overloaded', topbarStats()['mood_label'] === 'overloaded');
  check('combo meter starts at 1 (one todo done today)', topbarStats()['done_today'] === 1);

  await waitFor(() => activeData(shell, 'chrome')['streak'] === 3);
  check('seed streak is 3 consecutive days', activeData(shell, 'chrome')['streak'] === 3);

  // ── The streak transform, against synthetic day sets ──────
  const parsed = validate(streakFromDoneDays);
  check('streak transform config validates', parsed.ok);
  if (parsed.ok) {
    const streakOf = (days: string[]): unknown =>
      evaluate(parsed.data, { reply: days.map((done_on) => ({ done_on })), today: app.today });
    check('no completions → streak 0', streakOf([]) === 0);
    check('newest completion older than yesterday → streak 0', streakOf([shiftDay(app.today, -3)]) === 0);
    check(
      'a gap stops the count (today, yesterday, then a hole) → 2',
      streakOf([app.today, shiftDay(app.today, -1), shiftDay(app.today, -3)]) === 2,
    );
    check(
      'a chain starting yesterday still counts → 2',
      streakOf([shiftDay(app.today, -1), shiftDay(app.today, -2)]) === 2,
    );
  }

  // ── Garden therapy: complete the overdue todos, watch the mood calm ──
  const overdueIds = listTodos()
    .filter((t) => t['overdue'] === true)
    .map((t) => t['todo_id']);
  check('the 3 overdue todos are on the list', overdueIds.length === 3);

  for (const id of overdueIds) {
    const before = listTodos().length;
    shell.dispatch({ type: 'ui:click', ref: 'row-complete', payload: id });
    await waitFor(() => listTodos().length === before - 1);
  }
  check('all overdue todos completed through the UI', listTodos().length === 5);

  await waitFor(() => topbarStats()['mood'] === 'butter');
  check('mood calmed from blush to butter (0 overdue, 5 open)', topbarStats()['mood'] === 'butter');
  check('mood label reads cozy', topbarStats()['mood_label'] === 'cozy');
  check('combo meter climbed to 4', topbarStats()['done_today'] === 4);
  check('streak unchanged at 3 (today already counted)', activeData(shell, 'chrome')['streak'] === 3);

  return finish('mood');
};

run().catch((err) => fail('mood', err));
