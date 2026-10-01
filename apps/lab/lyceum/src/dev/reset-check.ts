// RESET CHECK — the talk, put back to how it starts.
//
//   1. a talk leaves things behind: two people joined, were given the
//      assistant, one sent a question; the deck moved; the phones are drawn by
//      React;
//   2. the controller's menu has Reset; it asks first, and No changes nothing;
//   3. Yes: nobody has joined, nothing they wrote is left, nothing is given,
//      the renderers are DOM, the deck is on its first slide — and the stage
//      shows it;
//   4. the phones are at the join screen again, as nobody;
//   5. the staff are who they were: the speaker still has the controller.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { SLIDES } from '@lyceum/db/seed';
import { questionSend } from '@lyceum/app/vex/question.entries';
import { setRenderer } from '@lyceum/app/vex/renderer.entries';
import { boot } from '@lyceum/server/boot';
import { check, connect, finish, giveAssistant, waitUntil } from './harness';
import type { Terminal } from './harness';

const main = async (): Promise<void> => {
  const { server, runtime, close } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  const replay = async (token: string, fingerprint: string, context: Record<string, unknown>): Promise<number> =>
    (await server.request('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ fingerprint, context }) })).status;
  const count = async (sql: string): Promise<number> => (await runtime.db.query(sql)).rows.length;
  const join = async (): Promise<{ phone: Terminal; token: string }> => {
    const door = await connect(base);
    await door.shows('main', '"ref":"pick"');
    door.click('main', 'pick');
    const token = await door.session();
    door.close();
    const phone = await connect(base, token);
    await phone.hello();
    await phone.shows('main', '"canvasId":"body"');
    return { phone, token };
  };

  // ── 1 ──
  const ada = await join();
  const ben = await join();
  const speakerToken = await mintSession(runtime.pool, 'speaker', 600_000);
  const speaker = await connect(base, speakerToken);
  await speaker.hello();
  const stage = await connect(base, await mintSession(runtime.pool, 'stage', 600_000));
  await stage.hello();
  await giveAssistant(server, runtime.pool);
  await ada.phone.shows('body', 'Can: ');
  await replay(ada.token, questionSend.fingerprint, { text: 'Will this survive a reset?' });
  await replay(speakerToken, setRenderer.fingerprint, { surface: 'phones', renderer: 'react' });
  for (const step of [2, 3]) {
    speaker.click('controls', 'next');
    await speaker.shows('head', `slide ${step} of`);
  }
  const staffGrants = await count("SELECT 1 FROM grants WHERE principal IN ('speaker', 'stage', 'kit', 'moderator', 'clock')");
  check(
    'a talk leaves things behind: two people, a question, two grants, the phones on React, the deck on slide 3',
    (await count('SELECT 1 FROM members')) === 2 &&
      (await count('SELECT 1 FROM questions')) === 1 &&
      (await count("SELECT 1 FROM grants WHERE role = 'assistant'")) === 2 &&
      (await count("SELECT 1 FROM renderers WHERE renderer = 'react'")) === 1 &&
      speaker.showsNow('head', 'slide 3 of'),
  );

  // ── 2 ──
  check('the controller’s menu has Reset', speaker.showsNow('head', '"name":"Menu"') && speaker.showsNow('head', '"ref":"reset"'));
  speaker.click('head', 'reset');
  check('...which asks first', await speaker.shows('overlay', 'Yes, reset'));
  speaker.click('overlay', 'no');
  await waitUntil(() => !speaker.showsNow('overlay', 'Yes, reset'));
  check('No changes nothing', (await count('SELECT 1 FROM members')) === 2 && (await count('SELECT 1 FROM questions')) === 1 && speaker.showsNow('head', 'slide 3 of'));

  // ── 3 ──
  speaker.click('head', 'reset');
  await speaker.shows('overlay', 'Yes, reset');
  speaker.click('overlay', 'yes');
  let joined = await count('SELECT 1 FROM members');
  for (let i = 0; i < 200 && joined > 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    joined = await count('SELECT 1 FROM members');
  }
  check('Yes: nobody has joined', joined === 0);
  // The reset is one function, a write after another: let it finish.
  await waitUntil(() => !speaker.showsNow('overlay', 'Yes, reset'));
  check('...nothing they wrote is left', (await count('SELECT 1 FROM questions')) === 0 && (await count('SELECT 1 FROM question_verdicts')) === 0 && (await count('SELECT 1 FROM assistant_turns')) === 0);
  check('...nothing is given: only the staff have roles', (await count('SELECT 1 FROM grants')) === staffGrants);
  check('...the renderers are DOM', (await count("SELECT 1 FROM renderers WHERE renderer <> 'dom'")) === 0);
  check('...the deck is on its first slide, on the controller', await speaker.shows('head', 'slide 1 of'));
  check('...and on the stage', await stage.shows('main', SLIDES[0]?.title ?? '\u0000'));
  check('...and the controller counts nobody', await speaker.shows('head', 'Controller · 0 joined'));

  // ── 4 ──
  check('the first phone is at the join screen again', await ada.phone.shows('main', '"ref":"pick"'));
  check('...and the second', await ben.phone.shows('main', '"ref":"pick"'));
  check('...as nobody: what they could write, they cannot', (await replay(ada.token, questionSend.fingerprint, { text: 'after the reset' })) >= 400);

  // ── 5 ──
  check('the speaker still has the controller', speaker.showsNow('controls', '"ref":"next"'));

  ada.phone.close();
  ben.phone.close();
  speaker.close();
  stage.close();
  httpServer.close();
  await close();
  finish();
};

void main();
