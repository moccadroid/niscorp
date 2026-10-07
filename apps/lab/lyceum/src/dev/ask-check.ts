// ASK CHECK — a question in words, from a screen, and the room watching it
// answered. The speaker asks on the controller (tools.ask); the stage, on the
// writer slide, shows the query being written as the engine saw it — what the
// model was shown, a draft that failed with the engine's own message, one that
// ran with the statement it compiled, the document, the name it was stored
// under. A phone given the ask (ask.records) asks the same and is answered by
// a replay. Real websockets against the real boot; the writer is the
// deterministic stand-in (LYCEUM_QUERY=fake), which tests its drafts through
// the real engine like the live one.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { TALKS } from '@lyceum/db/seed';
import { boot } from '@lyceum/server/boot';
import { check, connect, finish, giveAsk, waitUntil } from './harness';
import type { Terminal } from './harness';

const main = async (): Promise<void> => {
  const { server, runtime, close } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  const speaker = await connect(base, await mintSession(runtime.pool, 'speaker', 60_000));
  const stage = await connect(base, await mintSession(runtime.pool, 'stage', 60_000));
  const speakerHello = await speaker.hello();
  await stage.hello();

  // ── the vex talk, on the writer slide ──
  const vex = TALKS.find((talk) => talk.talkId === 'vex');
  const at = vex?.slides.findIndex((slide) => slide.slideId === 'slide.writer') ?? -1;
  check('the vex talk has the writer slide, with the ask as its tool', at >= 0 && (vex?.slides[at]?.tools ?? []).includes('tools.ask'));
  check('the speaker has the ask and the stage does not', speakerHello.catalog.actions.includes('tools.ask') && !speakerHello.catalog.actions.includes('ask.records'));
  await speaker.shows('main', '"canvasId":"controls"');
  speaker.click('head', 'talks');
  await speaker.shows('overlay', 'All talks');
  speaker.click('overlay', 'pick', 'vex');
  await waitUntil(() => !speaker.showsNow('overlay', 'All talks'));
  speaker.click('controls', 'all');
  await speaker.shows('overlay', 'All slides');
  speaker.click('overlay', 'pick', at);
  await waitUntil(() => !speaker.showsNow('overlay', 'All slides'));
  check('the writer slide is on the stage, with nothing asked yet', (await stage.shows('main', 'Watch it write one.')) && (await stage.shows('main', 'Nothing asked yet.')));
  check('...and the ask is on the controller', await speaker.shows('tools', 'Ask the records — the room watches it answered'));

  // ── the speaker asks ──
  speaker.type('tools', 'intent', 'How many people are in the room?');
  await new Promise((resolve) => setTimeout(resolve, 100));
  speaker.click('tools', 'ask');
  check('the answer opens over the controller as the query it is, written just now', (await speaker.shows('overlay', '"value":"Query"')) && (await speaker.shows('overlay', 'a model wrote this one')));
  check('the stage shows the question', await stage.shows('main', 'How many people are in the room?'));
  check('...what the model was shown: the tables this caller may read, and the line about them', (await stage.shows('main', 'The tables this caller may read: ')) && stage.showsNow('main', 'members') && stage.showsNow('main', 'identified by server-side scope values'));
  check('...a draft that failed, with the engine’s own message', (await stage.shows('main', 'members.nothing')) && stage.showsNow('main', '"ink":"alert"'));
  check('...a draft that ran, with the statement it compiled', (await stage.shows('main', 'runs · ')) && stage.showsNow('main', 'SELECT') && stage.showsNow('main', '"ink":"live"'));
  check('...and how it ended: written, and stored under its name', (await stage.shows('main', 'written · ')) && (await stage.shows('main', 'Stored under fp_')));
  const recorded = await runtime.db.query<{ how: string; fingerprint: string | null; member_id: string }>('SELECT how, fingerprint, member_id FROM queries ORDER BY run_at');
  check('the question is recorded as the speaker’s, generated, with a fingerprint', recorded.rows[0]?.how === 'generated' && (recorded.rows[0]?.fingerprint ?? '') !== '' && recorded.rows[0]?.member_id === 'speaker');
  check('...the fingerprint the stage shows', stage.showsNow('main', `Stored under ${recorded.rows[0]?.fingerprint ?? '\u0000'}`));

  // ── a phone, given the ask, asks the same ──
  const door = await connect(base);
  await door.shows('main', '"ref":"pick"');
  door.click('main', 'pick');
  const token = await door.session();
  door.close();
  const phone: Terminal = await connect(base, token);
  const hello = await phone.hello();
  await phone.shows('main', '"canvasId":"body"');
  check('a phone starts without the ask', !hello.catalog.actions.includes('ask.records') && (await phone.shows('body', 'Nothing here yet.')));
  await giveAsk(server, runtime.pool);
  check('given, the ask is a block on the phone', await phone.shows('body', 'Ask the records'));
  phone.type('body', 'intent', 'how many people are in the room');
  await new Promise((resolve) => setTimeout(resolve, 100));
  phone.click('body', 'ask');
  check('the same question from a phone opens the same query, replayed', (await phone.shows('overlay', '"value":"Query"')) && (await phone.shows('overlay', 'Replayed:')));
  const again = await runtime.db.query<{ how: string; fingerprint: string | null; member_id: string }>('SELECT how, fingerprint, member_id FROM queries ORDER BY run_at');
  check('...recorded as theirs, replayed, by the same fingerprint', again.rows[1]?.how === 'replayed' && again.rows[1]?.fingerprint === recorded.rows[0]?.fingerprint && again.rows[1]?.member_id === hello.principal);
  check('...and the stage still shows the speaker’s run, not the phone’s', stage.showsNow('main', 'written · '));

  // ── the speaker asks the same again: a replay, no model ──
  speaker.click('overlay', 'close');
  await waitUntil(() => !speaker.showsNow('overlay', '"value":"Query"'));
  speaker.type('tools', 'intent', 'How many people are in the room?');
  await new Promise((resolve) => setTimeout(resolve, 100));
  speaker.click('tools', 'ask');
  check('asked again, the stage says it was replayed, with no model', (await stage.shows('main', 'replayed · ')) && stage.showsNow('main', 'No model ran.'));

  // ── a question past the caller's clearance ──
  speaker.click('overlay', 'close');
  await waitUntil(() => !speaker.showsNow('overlay', '"value":"Query"'));
  speaker.type('tools', 'intent', 'Show me the login links');
  await new Promise((resolve) => setTimeout(resolve, 100));
  speaker.click('tools', 'ask');
  check('a question the caller’s permissions do not reach is refused, and the stage says so', (await stage.shows('main', 'refused · ')) && stage.showsNow('main', 'Your permissions do not reach that data.'));
  check('...and the controller says it too', await speaker.shows('tools', 'Your permissions do not reach that data.'));

  phone.close();
  speaker.close();
  stage.close();
  httpServer.close();
  await close();
  finish();
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
