// QUESTIONS CHECK — the room's Q&A. Real websockets against the real boot.
//
//   1. everybody in the room has Q&A, as a tab; a question sent is a row in the
//      sender's name, stamped by the engine — by the button, or Enter;
//   2. the speaker's controller lists it on the last slide, with its sender,
//      on its own — a reactive read, nobody announcing it;
//   3. nobody else reads them: a member replaying the controller's read is
//      refused, and the stage never sees them.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { SLIDES } from '@lyceum/db/seed';
import { questionsAll } from '@lyceum/app/vex/question.entries';
import { boot } from '@lyceum/server/boot';
import { check, connect, finish, waitUntil } from './harness';
import type { Terminal } from './harness';

const main = async (): Promise<void> => {
  const { server, runtime, close } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  const stepIn = async (): Promise<{ phone: Terminal; memberId: string; token: string }> => {
    const door = await connect(base);
    await door.shows('main', 'Step in');
    door.click('main', 'enter');
    const token = await door.session();
    door.close();
    const phone = await connect(base, token);
    const hello = await phone.hello();
    return { phone, memberId: hello.principal ?? '', token };
  };
  const rows = async (): Promise<{ member_id: string; text: string }[]> =>
    (await runtime.db.query<{ member_id: string; text: string }>('SELECT member_id, text FROM questions ORDER BY sent_at')).rows;

  // ── 1 ──
  const ada = await stepIn();
  check('everybody in the room has Q&A, as a tab', await ada.phone.shows('tabs', 'Q&A'));
  ada.phone.clickIn('tabs', 'open', 'Q&A');
  check('…which opens in the body', await ada.phone.shows('body', 'a question for the speaker'));
  ada.phone.type('body', 'draft', 'Is the model on stage the same one on my phone?');
  await new Promise((resolve) => setTimeout(resolve, 100));
  ada.phone.click('body', 'send');
  check('sent, the phone says so', await ada.phone.shows('body', 'Sent. The speaker has it.'));
  const first = (await rows())[0];
  check('it is a row, in the sender\'s name, stamped by the engine', first?.text === 'Is the model on stage the same one on my phone?' && first.member_id === ada.memberId);
  ada.phone.type('body', 'draft', 'What does it cost to run?');
  await new Promise((resolve) => setTimeout(resolve, 100));
  ada.phone.key('body', 'draft', 'Enter');
  let sentByEnter = false;
  for (let tries = 0; tries < 80 && !sentByEnter; tries += 1) {
    sentByEnter = (await rows()).length === 2;
    if (!sentByEnter) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  check('Enter in the field sends too', sentByEnter);

  // ── 2 ──
  const speaker = await connect(base, await mintSession(runtime.pool, 'speaker', 60_000));
  await speaker.hello();
  const last = SLIDES.findIndex((slide) => slide.tools.includes('tools.questions'));
  check(`the controller's Q&A is a tool on a slide (${SLIDES[last]?.title ?? 'none'})`, last >= 0);
  for (let step = 0; step < last; step += 1) {
    speaker.click('controls', 'next');
    await speaker.shows('head', `slide ${step + 2} of`);
  }
  check('…and it lists the questions, each with its sender', await speaker.shows('tools', 'What does it cost to run?'));
  const name = (await runtime.db.query<{ name: string }>('SELECT name FROM members WHERE member_id = $1', [ada.memberId])).rows[0]?.name ?? '\u0000';
  check(`…the sender by name (${name})`, speaker.showsNow('tools', name));
  const ben = await stepIn();
  ben.phone.clickIn('tabs', 'open', 'Q&A');
  await ben.phone.shows('body', 'a question for the speaker');
  ben.phone.type('body', 'draft', 'Can I see the charter?');
  await new Promise((resolve) => setTimeout(resolve, 100));
  ben.phone.click('body', 'send');
  check('a question sent later reaches the open controller on its own', await speaker.shows('tools', 'Can I see the charter?'));

  // ── 3 ──
  // The same read, replayed as the speaker and as a member: the speaker is
  // answered, the member refused by policy (not by a query that fails for
  // everybody).
  const replay = async (token: string): Promise<string> => {
    const response = await server.request('/api/vex', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ fingerprint: questionsAll.fingerprint, context: {} }),
    });
    return `${response.status} ${(await response.text()).slice(0, 160)}`;
  };
  const asSpeaker = await replay(await mintSession(runtime.pool, 'speaker', 60_000));
  const asMember = await replay(ben.token);
  check(`the controller's read answers the speaker (${asSpeaker.slice(0, 3)}) and refuses a member by policy (${asMember})`, asSpeaker.startsWith('200') && asMember.includes('"error":"scope_denied"'));
  const stage = await connect(base, await mintSession(runtime.pool, 'stage', 60_000));
  const stageHello = await stage.hello();
  check('the stage holds nothing of Q&A', !stageHello.catalog.actions.some((id) => id.startsWith('questions.') || id === 'tools.questions'));

  for (const terminal of [ada.phone, ben.phone, speaker, stage]) terminal.close();
  httpServer.close();
  await close();
  finish();
};

await main();
