// QUESTIONS CHECK — the room's Q&A. Real websockets against the real boot.
//
//   1. everybody in the room has Q&A, as a tab; pressed, it places the form and
//      the person's own questions; a question sent is a row in the sender's
//      name, stamped by the engine — by the button, or Enter — and joins their
//      list on its own;
//   2. their own, and nobody else's: they edit it, they delete it; somebody
//      else's they cannot reach, whatever id they send;
//   3. a member replaying the speaker's read gets their own questions only —
//      never anybody else's — and the stage never sees them.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { questionDelete, questionEdit, questionsAll } from '@lyceum/app/vex/question.entries';
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
  type Row = { question_id: string; member_id: string; text: string };
  const rows = async (): Promise<Row[]> => (await runtime.db.query<Row>('SELECT question_id, member_id, text FROM questions ORDER BY sent_at')).rows;
  const openQa = async (phone: Terminal): Promise<boolean> => {
    await phone.shows('main', '"label":"Q&A"');
    phone.click('main', 'tab', 'questions.desk');
    return (await phone.shows('qa-form', 'a question for the speaker')) && (await phone.shows('qa-mine', 'Your questions'));
  };
  const send = async (phone: Terminal, text: string, by: 'button' | 'enter' = 'button'): Promise<void> => {
    phone.type('qa-form', 'draft', text);
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (by === 'enter') phone.key('qa-form', 'draft', 'Enter');
    else phone.click('qa-form', 'send');
  };
  const replay = async (token: string, fingerprint: string, context: Record<string, unknown>): Promise<{ status: number; body: string }> => {
    const response = await server.request('/api/vex', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ fingerprint, context }),
    });
    return { status: response.status, body: await response.text() };
  };

  // ── 1 ──
  const ada = await stepIn();
  check('everybody in the room has Q&A, as a tab', await ada.phone.shows('main', '"label":"Q&A"'));
  check('…pressed, it places two actions: the form, and their own questions', await openQa(ada.phone));
  await send(ada.phone, 'Is the model on stage the same one on my phone?');
  check('sent, the form says so', await ada.phone.shows('qa-form', 'Sent. The speaker has it.'));
  const first = (await rows())[0];
  check('it is a row, in the sender\'s name, stamped by the engine', first?.text === 'Is the model on stage the same one on my phone?' && first.member_id === ada.memberId);
  check('…and joins their list on its own', await ada.phone.shows('qa-mine', 'Is the model on stage the same one on my phone?'));
  await send(ada.phone, 'What does it cost to run?', 'enter');
  check('Enter in the field sends too', await waitUntil(() => ada.phone.showsNow('qa-mine', 'What does it cost to run?')));

  // ── 2 ──
  const cost = (await rows()).find((row) => row.text === 'What does it cost to run?');
  ada.phone.click('qa-mine', 'pick', cost?.question_id);
  check('a question pressed opens over the screen, its words in the field', await ada.phone.shows('overlay', '"value":"What does it cost to run?"'));
  ada.phone.type('overlay', 'draft', 'What does it cost to run for a room of a hundred?');
  await new Promise((resolve) => setTimeout(resolve, 100));
  ada.phone.click('overlay', 'save');
  check('saved: the sheet closes and the list shows the new words', (await waitUntil(() => !ada.phone.showsNow('overlay', 'Delete it'))) && (await ada.phone.shows('qa-mine', 'for a room of a hundred?')));
  ada.phone.click('qa-mine', 'pick', first?.question_id);
  await ada.phone.shows('overlay', 'Delete it');
  ada.phone.click('overlay', 'remove');
  check('deleted: it leaves their list', await waitUntil(() => !ada.phone.showsNow('qa-mine', 'Is the model on stage the same one')));
  check('…and the table', !(await rows()).some((row) => row.question_id === first?.question_id));

  const ben = await stepIn();
  await openQa(ben.phone);
  check('somebody else sees none of them in their list', await ben.phone.shows('qa-mine', 'You have not sent any.'));
  const adas = (await rows()).find((row) => row.member_id === ada.memberId);
  await replay(ben.token, questionEdit.fingerprint, { questionId: adas?.question_id, text: 'Forged' });
  await replay(ben.token, questionDelete.fingerprint, { questionId: adas?.question_id });
  const untouched = (await rows()).find((row) => row.question_id === adas?.question_id);
  check('…and cannot edit or delete one, whatever id they send', untouched?.text === 'What does it cost to run for a room of a hundred?');
  await send(ben.phone, 'Can I see the charter?');
  await ben.phone.shows('qa-mine', 'Can I see the charter?');

  // ── 3 ──
  const speakerToken = await mintSession(runtime.pool, 'speaker', 600_000);
  // The speaker's own read, replayed: the speaker gets the room's, a member only
  // their own — the reach is the role's, not the entry's.
  const asSpeaker = await replay(speakerToken, questionsAll.fingerprint, {});
  const asBen = await replay(ben.token, questionsAll.fingerprint, {});
  check(`the speaker's read answers the speaker with everybody's (${asSpeaker.status})`, asSpeaker.status === 200 && asSpeaker.body.includes('for a room of a hundred?') && asSpeaker.body.includes('Can I see the charter?'));
  check(`…and a member replaying it gets their own only — never anybody else's (${asBen.status})`, asBen.status === 200 && asBen.body.includes('Can I see the charter?') && !asBen.body.includes('for a room of a hundred?'));
  const stage = await connect(base, await mintSession(runtime.pool, 'stage', 60_000));
  const stageHello = await stage.hello();
  check('the stage holds nothing of Q&A', !stageHello.catalog.actions.some((id) => id.startsWith('questions.') || id === 'tools.questions'));

  for (const terminal of [ada.phone, ben.phone, stage]) terminal.close();
  httpServer.close();
  await close();
  finish();
};

await main();
