// TIMER CHECK — the talk's opening minute and its last, end to end, with the
// deterministic timer writer (server/timing.ts, LYCEUM_TIMER=fake) and
// everything else real: the controller's assistant over a real websocket, the
// speaker's own vex write, tide on moss's durable store, the clock principal's
// write through the governed door, the stage following it.
//
//   1. the speaker asks for a timer and gets a DOCUMENT to read — a draft,
//      said as a length, with how the request was read; nothing in it says
//      who it runs as (saving stamps the clock);
//   2. Save anchors it AT THE PRESS, to the second, writes it as the speaker's
//      row and arms it; the controller counts down to it;
//   3. a timer that notifies opens its message over the controller of
//      whoever saved it — if they are connected; if not, tide's ledger says it
//      was not shown, and it is not shown later;
//   4. when tide reaches its instant, the closing slide is on the stage — no
//      model asked;
//   5. the clock can do those and nothing else;
//   6. a timer saved before a restart is loaded by the next boot, at the same
//      instant;
//   7. a request that can be read two ways is ASKED about; the reply comes
//      back to the writer with the conversation, and the draft follows from
//      both; a correction of a draft not yet saved ("I meant …") goes back
//      with it too.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { questionJudge } from '@lyceum/app/vex/question.entries';
import { occurrencesBetween, ReflexSchema } from '@niscorp/tide';
import { SLIDES } from '@lyceum/db/seed';
import { boot } from '@lyceum/server/boot';
import type { Booted } from '@lyceum/server/boot';
import { openDevDatabase } from '@lyceum/server/runtime';
import { vexOver, wireAs } from '@lyceum/server/vex-over';
import { check, connect, finish, waitUntil } from './harness';

const listen = (booted: Booted): { base: string; close: () => void } => {
  const httpServer = serve({ fetch: booted.server.fetch, port: 0 });
  attachSocket(httpServer, booted.server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return { base: `ws://127.0.0.1:${address.port}`, close: () => httpServer.close() };
};

type Timer = { timer_id: string; reflex: { as?: string; effect?: { name?: string } }; saved_by: string; due_at: string };
// What tide's ledger says came of a timer's run: the effect's output, as its
// fields (JSONB keeps no key order, so a string would compare the storage).
const outputOf = async (booted: Booted, timerId: string): Promise<string> => {
  const output: unknown = (await booted.runtime.db.query<{ output: unknown }>('SELECT w.output FROM tide_work w JOIN tide_run r ON r.id = w.run_id WHERE r.reflex_id = $1', [timerId])).rows[0]?.output;
  return typeof output === 'object' && output !== null ? Object.entries(output).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${String(value)}`).join(' ') : '';
};
const instantOf = (value: string): number => Date.parse(value.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));

const main = async (): Promise<void> => {
  const db = openDevDatabase();
  const first = await boot(db);
  const { base, close: unlisten } = listen(first);
  const closing = SLIDES.at(-1);

  const speaker = await connect(base, await mintSession(first.runtime.pool, 'speaker', 60_000));
  const stage = await connect(base, await mintSession(first.runtime.pool, 'stage', 60_000));
  await speaker.hello();
  await stage.hello();
  // To the timer slide: it brings the speaker's assistant to the controller.
  const timerAt = SLIDES.findIndex((slide) => slide.slideId === 'slide.timer');
  for (let step = 0; step < timerAt; step += 1) {
    speaker.click('controls', 'next');
    await speaker.shows('head', `slide ${step + 2} of`);
  }
  check('the timer slide brings the assistant to the controller', await speaker.shows('tools', 'Can: '));
  check('…the speaker\'s assistant, able to automate', speaker.showsNow('tools', 'automate'));
  check('there is no timer yet', await speaker.shows('head', 'No timer'));

  // ── 1. asked for, and read ──
  speaker.type('tools', 'draft', 'Show the last slide in 30 minutes');
  await new Promise((resolve) => setTimeout(resolve, 100));
  speaker.click('tools', 'send');
  check('the assistant answers with a document to read', await speaker.shows('tools', 'Read it first'));
  check('…whose time is a length, counted from the press', speaker.showsNow('tools', '30 min after you save') && speaker.showsNow('tools', '\\"timer\\"'));
  check('…a tide reflex that puts a slide on screen', speaker.showsNow('tools', 'deck.show'));
  check('…with how the request was read', speaker.showsNow('tools', 'How I read it: A length of time: 30 minutes.'));
  check('…and nothing in it says who it runs as — saving stamps that', !speaker.showsNow('tools', '\\"as\\"'));
  check('nothing is saved by being asked for', (await first.runtime.db.query('SELECT 1 FROM timers')).rows.length === 0);

  // ── 2. saved, and armed — anchored at the press ──
  // Time spent reading does not come off it.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const pressed = Date.now();
  speaker.click('tools', 'save');
  check('Save says it is saved', await speaker.shows('tools', 'Saved'));
  check('…and the proposal is done with: it leaves the screen', await waitUntil(() => !speaker.showsNow('tools', 'Read it first')));
  check('…and the history says what came of it — once', (await speaker.shows('tools', 'Saved · runs at')) && speaker.textOf('tools').split('Saved').length === 2);
  const saved = (await first.runtime.db.query<Timer>('SELECT timer_id, reflex, saved_by, due_at::text FROM timers')).rows[0];
  check('it is a row: the reflex as a document', saved?.reflex.effect?.name === 'deck.show' && saved.reflex.as === 'clock');
  check('…a stored reflex, with the timer fixed to a clock — never a timer', ReflexSchema.safeParse(saved?.reflex).success);
  check('…saved as the speaker, stamped by the engine', saved?.saved_by === 'speaker');
  check('the controller counts down to it, with nobody announcing it', await speaker.shows('head', 'Countdown'));
  const due = instantOf(saved?.due_at ?? '');
  const lateBy = due - (pressed + 30 * 60_000);
  check(`it fires thirty minutes after the press, to the second (${lateBy} ms)`, lateBy >= 0 && lateBy < 1_000);

  // ── 3. a timer that notifies — asked for, saved and fired while the
  // closing one still counts down (once that fires, the deck has moved on and
  // the controller holds that slide's tools) ──
  speaker.type('tools', 'draft', 'A timer for 2 minutes');
  await new Promise((resolve) => setTimeout(resolve, 100));
  speaker.click('tools', 'send');
  check('a timer with nothing to show notifies', (await speaker.shows('tools', 'Read it first')) && speaker.showsNow('tools', '\\"notify\\"'));
  speaker.click('tools', 'save');
  check('…saved', await waitUntil(() => !speaker.showsNow('tools', 'Read it first')));
  const notifying = (await first.runtime.db.query<Timer>("SELECT timer_id, reflex, saved_by, due_at::text FROM timers WHERE reflex->'effect'->>'name' = 'notify'")).rows[0];
  check('…a row like any timer', notifying !== undefined);
  check('the controller counts down to the newest timer', await speaker.shows('head', 'Countdown'));
  check('nothing is over the controller yet', !speaker.showsNow('overlay', 'Time is up.'));
  for (let step = 0; step < 20; step += 1) await first.timing.tide.advance({ now: instantOf(notifying?.due_at ?? '') + 1_000 });
  check('when it fires, its message opens over the controller of whoever saved it', await speaker.shows('overlay', 'Time is up.'));
  check("…and tide's ledger says it was shown, to the speaker", (await outputOf(first, notifying?.timer_id ?? '')) === 'shown=true to=speaker');
  speaker.click('overlay', 'close');
  check('…and Close takes it away', await waitUntil(() => !speaker.showsNow('overlay', 'Time is up.')));

  // ── 3b. read two ways: asked about, and the reply comes back with the conversation ──
  speaker.type('tools', 'draft', 'Remind me to drink water at 9');
  await new Promise((resolve) => setTimeout(resolve, 100));
  speaker.click('tools', 'send');
  check('a request that can be read two ways is asked about', await speaker.shows('tools', 'In the morning or in the evening?'));
  check('…and nothing is proposed', !speaker.showsNow('tools', 'Read it first'));
  const askedTurn = (await first.runtime.db.query<{ asked: string | null; writer_reasoning: string | null }>("SELECT writer_answer->>'question' AS asked, writer_reasoning FROM assistant_turns WHERE message = 'Remind me to drink water at 9'")).rows[0];
  check('…the turn keeps what was asked, and why', askedTurn?.asked === 'In the morning or in the evening?' && (askedTurn.writer_reasoning ?? '') !== '');
  speaker.type('tools', 'draft', 'In the evening, at 9');
  await new Promise((resolve) => setTimeout(resolve, 100));
  speaker.click('tools', 'send');
  check('the reply goes back with the conversation: the draft is the first request, answered', (await speaker.shows('tools', 'Read it first')) && speaker.showsNow('tools', 'drink water'));

  // ── 3b'. a correction of a draft not yet saved goes back with it ──
  speaker.type('tools', 'draft', 'Nah, I meant put up the last slide');
  await new Promise((resolve) => setTimeout(resolve, 100));
  speaker.click('tools', 'send');
  check('a correction of an unsaved draft is read with it: the same time, the closing slide instead', (await speaker.shows('tools', 'How I read it: A correction')) && speaker.showsNow('tools', 'deck.show') && speaker.showsNow('tools', '1 min after you save'));
  const correctionTurn = (await first.runtime.db.query<{ effect: string | null }>("SELECT writer_answer->'effect'->>'name' AS effect FROM assistant_turns WHERE message = 'Nah, I meant put up the last slide'")).rows[0];
  check('…and the turn keeps the new draft', correctionTurn?.effect === 'deck.show');

  speaker.type('tools', 'draft', 'Set a timer for 3 minutes');
  await new Promise((resolve) => setTimeout(resolve, 100));
  speaker.click('tools', 'send');
  check('a new request is read on its own words: it is not about the water', (await speaker.shows('tools', 'Time is up.')) && !speaker.showsNow('tools', 'Notify: Remind me'));

  // ── 3c. nobody at the controller: not shown, and not shown later ──
  speaker.click('tools', 'save');
  check('…saved', await waitUntil(() => !speaker.showsNow('tools', 'Read it first')));
  const unseen = (await first.runtime.db.query<Timer>("SELECT timer_id, reflex, saved_by, due_at::text FROM timers WHERE reflex->'effect'->>'name' = 'notify' ORDER BY saved_at DESC LIMIT 1")).rows[0];
  speaker.close();
  check('the speaker leaves (their shell stays, with no terminal)', await waitUntil(() => (first.server.shells?.list() ?? []).some((shell) => shell.principal === 'speaker' && shell.connections === 0)));
  for (let step = 0; step < 20; step += 1) await first.timing.tide.advance({ now: instantOf(unseen?.due_at ?? '') + 1_000 });
  check("when it fires with nobody there, tide's ledger says it was not shown", (await outputOf(first, unseen?.timer_id ?? '')) === 'shown=false to=speaker why=they were not connected');
  const back = await connect(base, await mintSession(first.runtime.pool, 'speaker', 60_000));
  await back.hello();
  check('…and coming back, it is not waiting for them', (await back.shows('head', 'Countdown')) && !back.showsNow('overlay', 'Time is up.'));

  // ── 4. tide reaches the closing one ──
  for (let step = 0; step < 20; step += 1) await first.timing.tide.advance({ now: due + 60_000 });
  const deck = await first.runtime.db.query<{ slide_id: string }>("SELECT slide_id FROM deck WHERE deck_id = 'talk'");
  check(`when it fires, the closing slide is on (${closing?.slideId ?? ''})`, deck.rows[0]?.slide_id === closing?.slideId);
  check('…and the stage shows it', await stage.shows('main', closing?.title ?? '\u0000'));

  // ── 5. the clock can do those, and nothing else ──
  const clock = vexOver(wireAs(first.server, await mintSession(first.runtime.pool, 'clock', 60_000)));
  const refused = await clock(questionJudge.fingerprint, { questionId: 'anything', text: 'Forged', appropriate: true, score: 1 }).then(
    () => false,
    () => true,
  );
  check("the clock is refused a write it was not granted (a question's verdict)", refused);

  back.close();
  stage.close();
  unlisten();
  await first.close();

  // ── 6. a restart keeps it — at the same instant ──
  const second = await boot(db);
  check('the next boot loads the saved timers into tide (the closing one, two that notify)', (await second.timing.reload()) === 3);
  const stored = ReflexSchema.parse(saved?.reflex);
  const after = 'clock' in stored.on ? occurrencesBetween(stored.on.clock, pressed, pressed + 3_600_000, 1)[0]?.at : undefined;
  check('…and what it loads names the instant the press fixed', after === due);

  // ── 7. a timer is held to the deck as it stands, not as the source had it ──
  // A slide cut from the deck: the saved timer naming it is not loaded.
  await db.query("UPDATE deck SET slide_id = (SELECT slide_id FROM slides ORDER BY position LIMIT 1) WHERE deck_id = 'talk'");
  await db.query('DELETE FROM slide_notes WHERE slide_id = $1', [closing?.slideId ?? '']);
  await db.query('DELETE FROM slide_tools WHERE slide_id = $1', [closing?.slideId ?? '']);
  await db.query('DELETE FROM slides WHERE slide_id = $1', [closing?.slideId ?? '']);
  check('a saved timer naming a slide cut from the deck is not loaded — the others still are', (await second.timing.reload()) === 2);
  await second.close();
  await db.close();
  finish();
};

await main();
