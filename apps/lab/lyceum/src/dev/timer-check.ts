// TIMER CHECK — the talk's opening minute and its last, end to end, with the
// deterministic timer writer (server/timing.ts, LYCEUM_TIMER=fake) and
// everything else real: the controller's assistant over a real websocket, the
// speaker's own vex write, tide on moss's durable store, the clock principal's
// write through the governed door, the stage following it.
//
//   1. the speaker asks for a timer and gets a DOCUMENT to read, run as the
//      clock whatever it said;
//   2. Save writes it as the speaker's row and arms it; the controller counts
//      down to it;
//   3. when tide reaches its instant, the closing slide is on the stage — no
//      model asked;
//   4. the clock can do that and nothing else;
//   5. a timer saved before a restart is loaded by the next boot.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { memberAssign } from '@lyceum/app/vex/member.entries';
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

const main = async (): Promise<void> => {
  const db = openDevDatabase();
  const first = await boot(db);
  const { base, close: unlisten } = listen(first);
  const closing = SLIDES.at(-1);

  const speaker = await connect(base, await mintSession(first.runtime.pool, 'speaker', 60_000));
  const stage = await connect(base, await mintSession(first.runtime.pool, 'stage', 60_000));
  await speaker.hello();
  await stage.hello();
  check('the first slide brings the assistant to the controller', await speaker.shows('tools', 'Assistant'));
  check('there is no timer yet', await speaker.shows('head', 'No timer'));

  // ── 1. asked for, and read ──
  speaker.type('tools', 'draft', 'End the talk in 30 minutes');
  await new Promise((resolve) => setTimeout(resolve, 100));
  speaker.click('tools', 'ask');
  check('the assistant answers with a document to read', await speaker.shows('tools', 'Read it first'));
  check('…a tide reflex that puts a slide on screen', speaker.showsNow('tools', 'deck.show'));
  check('…run as the clock, whatever it said', speaker.showsNow('tools', '\\"as\\": \\"clock\\"'));
  check('nothing is saved by being asked for', (await first.runtime.db.query('SELECT 1 FROM timers')).rows.length === 0);

  // ── 2. saved, and armed ──
  speaker.click('tools', 'save');
  check('Save says it is saved', await speaker.shows('tools', 'Saved'));
  const saved = (await first.runtime.db.query<Timer>('SELECT timer_id, reflex, saved_by, due_at::text FROM timers')).rows[0];
  check('it is a row: the reflex as a document', saved?.reflex.effect?.name === 'deck.show' && saved.reflex.as === 'clock');
  check('…saved as the speaker, stamped by the engine', saved?.saved_by === 'speaker');
  check('the controller counts down to it, with nobody announcing it', await speaker.shows('head', 'Countdown'));
  const due = Date.parse((saved?.due_at ?? '').replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
  check('it fires about thirty minutes from now', Math.abs(due - Date.now() - 30 * 60_000) < 2 * 60_000);

  // ── 3. tide reaches it ──
  for (let step = 0; step < 20; step += 1) await first.timing.tide.advance({ now: due + 60_000 });
  const deck = await first.runtime.db.query<{ slide_id: string }>("SELECT slide_id FROM deck WHERE deck_id = 'talk'");
  check(`when it fires, the closing slide is on (${closing?.slideId ?? ''})`, deck.rows[0]?.slide_id === closing?.slideId);
  check('…and the stage shows it', await stage.shows('main', closing?.title ?? '\u0000'));

  // ── 4. the clock can do that, and nothing else ──
  const clock = vexOver(wireAs(first.server, await mintSession(first.runtime.pool, 'clock', 60_000)));
  const refused = await clock(memberAssign.fingerprint, { memberId: 'anybody', departmentId: 'records', at: new Date().toISOString() }).then(
    () => false,
    () => true,
  );
  check('the clock is refused any write but the deck', refused);

  speaker.close();
  stage.close();
  unlisten();
  await first.close();

  // ── 5. a restart keeps it ──
  const second = await boot(db);
  check('the next boot loads the saved timer into tide', (await second.timing.reload()) === 1);
  await second.close();
  await db.close();
  finish();
};

await main();
