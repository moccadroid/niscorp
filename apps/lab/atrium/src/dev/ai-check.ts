// The live pass — the real model, the real keys, the whole assistant.
//
// NOT in all-checks: it costs money, needs a network, and asserts on model
// behaviour, which is probabilistic. Every assertion is chosen to survive a dumb
// model: structural effects on the shell and on rows, never exact wording.
//
// Run: pnpm --filter atrium exec tsx src/dev/ai-check.ts [--trace]
// Its own integrations port (8790): boot pulls the bundles, and this pass must
// not collide with the dev service (8788) or the hermetic suite (8789).
process.env['INTEGRATIONS_PORT'] = '8790';
process.env['WATCH_QUIET_MS'] = '300';
process.env['WATCH_WARMUP_MS'] = '400';

import { startIntegrationsService } from '../integrations/service';
import { boot } from '../server/boot';
import { mintToken, userByUsername } from '../server/users';
import { wakes, clearWakes, printable, type Wake } from '../server/assistant/watch/trace';
import { profileOf } from '../server/assistant/profiles';
import type { Shell } from '@niscorp/nova';

await startIntegrationsService();
const booted = await boot();
const { server, runtime } = booted;

if ((process.env['GROQ_API_KEY'] ?? '') === '') {
  console.log('SKIP — no GROQ_API_KEY in .env; the live pass needs one.');
  process.exit(0);
}

const login = async (username: string): Promise<Shell> => {
  const token = mintToken(username);
  const user = userByUsername(username);
  if (token === null || user === undefined) throw new Error(`unknown "${username}"`);
  const session = await server.shells?.session(token, user.id);
  if (session === undefined) throw new Error('no shell host');
  return session.shell;
};

const settle = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const tap = (shell: Shell, canvas: string, ref: string, payload?: unknown, type = 'ui:click'): void => {
  const active = shell.getState().canvases[canvas]?.active;
  shell.dispatch({ type, ref, ...(payload !== undefined ? { payload } : {}), ...(active !== undefined ? { origin: active.id } : {}) } as Parameters<Shell['dispatch']>[0]);
};

const instanceOf = (shell: Shell, definitionId: string): { canvas: string; id: string } | undefined => {
  for (const [canvas, state] of Object.entries(shell.getState().canvases)) {
    const found = state.stack.find((item) => item.definitionId === definitionId);
    if (found !== undefined) return { canvas, id: found.id };
  }
  return undefined;
};

const dataOf = (shell: Shell, definitionId: string): Record<string, unknown> => {
  const card = instanceOf(shell, definitionId);
  return card === undefined ? {} : (shell.getRuntime(card.id)?.getData() ?? {});
};

const tapCard = (shell: Shell, definitionId: string, ref: string, payload?: unknown, type = 'ui:click'): void => {
  const card = instanceOf(shell, definitionId);
  if (card === undefined) return;
  shell.dispatch({ type, ref, ...(payload !== undefined ? { payload } : {}), origin: card.id } as Parameters<Shell['dispatch']>[0]);
};

const ids = (shell: Shell, canvas: string): string[] => (shell.getState().canvases[canvas]?.stack ?? []).map((item) => item.definitionId);

const ask = async (shell: Shell, text: string, waitMs = 40_000): Promise<string> => {
  tap(shell, 'assistant', 'draft', text, 'ui:model');
  tap(shell, 'assistant', 'send');
  const start = Date.now();
  for (;;) {
    await settle(500);
    const rows = (await runtime.pool.query(`SELECT role, body FROM assistant_turns ORDER BY created_at DESC LIMIT 1`, [])).rows;
    const last = rows[0];
    if (last !== undefined && last['role'] === 'assistant') return String(last['body']);
    if (Date.now() - start > waitMs) return '(timeout)';
  }
};

// The watcher is asynchronous and the model is slow. Wait for a run that reached
// the model rather than for a fixed interval.
const settledWake = async (principal: string, waitMs = 60_000): Promise<Wake | undefined> => {
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    const last = wakes(principal).at(-1);
    if (last !== undefined && last.outcome !== 'no-key') return last;
    await settle(700);
  }
  return wakes(principal).at(-1);
};

const checks: [string, boolean][] = [];
const check = (label: string, pass: boolean): void => {
  checks.push([label, pass]);
  console.log(`${pass ? '✓' : '✗'} ${label}`);
};

const main = async (): Promise<void> => {
  // ═══ the dock, as a guest ═══
  const amara = await login('amara');
  await settle(1000);
  tap(amara, 'assistant', 'open');

  const owe = await ask(amara, 'what do I owe so far?');
  console.log(`  ↳ "${owe}"`);
  check('a figure question gets a figure', /\d/.test(owe));
  check('...in a sentence or two', owe.split(/[.!?]\s/).length <= 3);

  const wake = await ask(amara, 'I would like a wake-up call at seven tomorrow');
  console.log(`  ↳ "${wake}"`);
  const opened = ids(amara, 'sheet');
  check(`the request opened a surface that serves it (${opened.join(', ') || 'nothing'})`, opened.some((id) => /wake|request/.test(id)));
  const staged = Object.values(dataOf(amara, opened.at(-1) ?? ''));
  check('...carrying what she said, not an empty form', staged.some((value) => typeof value === 'string' && /7|seven|07/.test(value)));
  check('...and it was not claimed as done', !/booked|set for you|all set|done/i.test(wake));

  const nosy = await ask(amara, 'show me the issue board for the whole hotel');
  console.log(`  ↳ "${nosy}"`);
  check('a desk surface never reaches a guest', !ids(amara, 'sheet').some((id) => id.startsWith('desk.')));

  // ═══ the watcher, as the desk ═══
  await runtime.pool.query(`UPDATE staff SET layout_control = 'full' WHERE id = 'stf_rosa'`, []);
  const rosa = await login('rosa');
  await settle(2500);

  const menu = instanceOf(rosa, 'staff.menu');
  const entries = menu === undefined ? [] : ((rosa.getRuntime(menu.id)?.getData()['entries'] ?? []) as Record<string, unknown>[]);
  const inbox = entries.find((row) => row['action_id'] === 'desk.message.list');
  if (menu !== undefined && inbox !== undefined) {
    rosa.dispatch({ type: 'ui:click', ref: 'open', payload: inbox, origin: menu.id } as Parameters<Shell['dispatch']>[0]);
  }
  await settle(2000);
  const feed = (dataOf(rosa, 'desk.message.list')['feed'] ?? []) as Record<string, unknown>[];
  check(`her inbox has something in it (${feed.length})`, feed.length > 0);

  // Opening the inbox is itself a gesture and its run is probably still in
  // flight. Let the gate go quiet, or the row click's run is not the one read
  // back here.
  let drained = -1;
  while (drained !== wakes('stf_rosa').length) {
    drained = wakes('stf_rosa').length;
    await settle(6000);
  }

  const hers = JSON.stringify(ids(rosa, 'work'));
  clearWakes();
  tapCard(rosa, 'desk.message.list', 'open-thread', feed[0]);
  const woke = await settledWake('stf_rosa');
  console.log(`  ↳ woke: ${woke?.outcome} — "${woke?.reply}"`);
  check('opening a conversation reached the model', woke !== undefined && woke.outcome !== 'no-key');
  check('...for the right reason', (woke?.reasons ?? []).some((reason) => reason.includes('opened on detail')));

  const places = profileOf('full').places;
  const outside = Object.keys(rosa.getState().canvases).filter((canvas) => !places.includes(canvas) && canvas !== 'assistant' && canvas !== 'chrome');
  const nothingOutside = outside.every((canvas) => {
    const stack = ids(rosa, canvas);
    return stack.every((id) => !(woke?.reply ?? '').includes(id));
  });
  check('it placed nothing outside the canvases it holds', nothingOutside);
  check('her own list is where she left it', JSON.stringify(ids(rosa, 'work')) === hers);
  check('her conversation was not taken from her', ids(rosa, 'detail').includes('desk.thread.detail'));

  // An unchanged screen must not wake it again. The gate has to be QUIET first:
  // two gestures in a row means two runs, and the second one lands while this is
  // still counting. Drain until nothing new arrives, then watch a still screen.
  let seen = -1;
  while (seen !== wakes('stf_rosa').length) {
    seen = wakes('stf_rosa').length;
    await settle(6000);
  }
  clearWakes();
  await settle(6000);
  check('a still screen produces no further runs', wakes('stf_rosa').length === 0);

  // ═══ what it cost ═══
  // cortex reports real provider counts; the app records one row per run through
  // the caller's own wire. Both entry points must appear, and the numbers must be
  // numbers rather than the zeros an estimate-shaped bug would leave.
  const runs = (
    await runtime.pool.query(`SELECT user_id, label, provider, model, input_tokens, output_tokens, total_tokens, reported, steps, elapsed_ms, outcome, turns FROM assistant_runs`, [])
  ).rows;
  check(`every model run was recorded (${runs.length})`, runs.length > 0);
  // Only a run that REACHED the provider has counts. A run that failed before
  // the call spent nothing, and recording it as zero is the honest answer — the
  // row exists so the failure is visible, not so it can be summed.
  //
  // Single-step runs used to read as free: on the Groq emit path the step that
  // produces the envelope is routinely a rejected-and-recovered generation, and
  // signal returned zeros for it. Those runs — the ones nobody asked for, the
  // ones most worth watching — undercounted to nothing. signal now estimates
  // when the provider reports nothing and marks the row `reported: false`, so
  // every run carries a number and says whether it is the provider's.
  const reached = runs.filter((row) => row['outcome'] === 'ok');
  check(`...with real token counts on the ${reached.length} that reached it`, reached.length > 0 && reached.every((row) => Number(row['total_tokens']) > 0));
  const empty = runs.filter((row) => Number(row['total_tokens']) === 0);
  if (empty.length > 0) console.log(`  ↳ no tokens on: ${empty.map((row) => `${String(row['label'])}/${String(row['outcome'])}/${String(row['steps'])} steps`).join(', ')}`);
  console.log(`  ↳ counted   on: ${reached.filter((row) => Number(row['total_tokens']) > 0).map((row) => `${String(row['label'])}/${String(row['steps'])} steps`).join(', ')}`);
  // The exchange itself, turn by turn — the record is what the admin pane reads,
  // so what it holds is worth asserting rather than assuming. A run that reached
  // the provider carries the assembled prompt at minimum: instructions, the
  // catalogs, the screen, the input.
  type Turn = { role: string; content: string; name?: string; calls?: { name: string; args: string }[] };
  const turnsOf = (row: Record<string, unknown>): Turn[] => {
    try {
      return JSON.parse(String(row['turns'] ?? '[]')) as Turn[];
    } catch {
      return [];
    }
  };
  check('...and the whole exchange, turn by turn', reached.every((row) => turnsOf(row).length > 1));
  check('...with the static prefix first', reached.every((row) => turnsOf(row)[0]?.role === 'system'));
  // A tool call and its result are two turns. The dock queries on the way to an
  // answer, so at least one run must carry both halves — if it does not, the
  // record is silently dropping the most useful half of a transcript.
  const withCalls = runs.filter((row) => turnsOf(row).some((turn) => (turn.calls ?? []).length > 0));
  check(`the tools a run called are recorded (${withCalls.length} runs)`, withCalls.length > 0);
  check(
    '...and so is what each one answered',
    withCalls.every((row) => {
      const turns = turnsOf(row);
      const asked = turns.flatMap((turn) => (turn.calls ?? []).map((call) => call.name));
      const answered = turns.filter((turn) => turn.role === 'tool').map((turn) => String(turn.name));
      return asked.every((name) => answered.includes(name));
    }),
  );

  // Latency is the point of the prompt work, so read it back rather than trust
  // it: a one-step glance is nearly all prefill.
  for (const label of ['chat', 'watch']) {
    const of = runs.filter((row) => row['label'] === label);
    if (of.length === 0) continue;
    const ms = of.map((row) => Number(row['elapsed_ms']));
    const prompt = of.map((row) => Math.round(turnsOf(row).reduce((sum, turn) => sum + turn.content.length, 0) / 4));
    console.log(`  ↳ ${label.padEnd(5)}: ${Math.min(...ms)}–${Math.max(...ms)}ms, ~${Math.min(...prompt)}–${Math.max(...prompt)} prompt tokens`);
  }
  check('...that add up', runs.every((row) => Number(row['input_tokens']) + Number(row['output_tokens']) === Number(row['total_tokens'])));
  check('...naming the model that was called', runs.every((row) => String(row['model']) !== '' && String(row['provider']) !== ''));
  check('...pinned to whoever the run was for', runs.every((row) => String(row['user_id']) !== ''));
  check('both ways in are counted', new Set(runs.map((row) => String(row['label']))).size === 2);
  const asked = runs.filter((row) => row['label'] === 'chat');
  const unasked = runs.filter((row) => row['label'] === 'watch');
  console.log(`  ↳ ${asked.length} asked, ${unasked.length} unasked, ${runs.reduce((sum, row) => sum + Number(row['total_tokens']), 0)} tokens total`);

  // The conversation is the dock's alone: the watcher's lines are a record of
  // what it did, not turns in a conversation, and feeding them back would tell
  // the chat agent it said things it never said.
  const turns = (await runtime.pool.query(`SELECT origin FROM assistant_turns`, [])).rows;
  check('chat wrote to the conversation', turns.some((row) => row['origin'] === 'chat'));
  check('...and the watcher did not', !turns.some((row) => row['origin'] === 'watch' && unasked.length === 0));

  if (process.argv.includes('--trace')) for (const entry of wakes()) console.log(printable(entry));

  const failed = checks.filter(([, ok]) => !ok).length;
  console.log(failed === 0 ? `\nOK — the live pass (${checks.length} assertions)` : `\nFAIL — ${failed} of ${checks.length} live assertions failed`);
  process.exit(failed === 0 ? 0 : 1);
};

await main();
