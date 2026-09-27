// ASSISTANT CHECK — one assistant on every device, built for each person by
// what the charter grants them. Real websockets against the real boot, with
// the deterministic stand-in turn (server/assistant/orchestrator.ts,
// LYCEUM_ASSISTANT=fake) calling the SAME tools the live one would; this
// checks the assembly, the tools and the proposals, not a model.
//
//   1. built from the declarations a person's grants select — shown to them;
//   2. what it can do follows: only the controller can automate;
//   3. a tool is bounded by what the person holds — Forms is offered its rename,
//      pre-filled, and it opens over the screen; Records, asking the same, is not;
//   4. the open trigger carries exactly the keys the catalog declares openable.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { ACTIONS } from '@lyceum/app/action-catalog';
import { boot } from '@lyceum/server/boot';
import { OPENABLE_KEYS } from '@lyceum/server/assistant/tools';
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
  // Put somebody in a department the way assignment does — a row, then a new
  // identity — and reconnect them as it.
  const place = async (memberId: string, token: string, departmentId: string): Promise<Terminal> => {
    await runtime.db.query('UPDATE members SET department_id = $1 WHERE member_id = $2', [departmentId, memberId]);
    server.invalidateIdentity(memberId);
    const phone = await connect(base, token);
    await phone.hello();
    return phone;
  };
  const openAssistant = async (phone: Terminal): Promise<boolean> => {
    await phone.shows('tabs', 'Assistant');
    phone.clickIn('tabs', 'open', 'Assistant');
    return phone.shows('body', 'Built from');
  };
  const say = async (phone: Terminal, canvas: string, message: string): Promise<void> => {
    phone.type(canvas, 'draft', message);
    await new Promise((resolve) => setTimeout(resolve, 100));
    phone.click(canvas, 'ask');
    await waitUntil(() => !phone.showsNow(canvas, 'Thinking'));
  };

  // ── 1 + 2. somebody waiting: the room's assistant, no automation ──
  const waiting = await stepIn();
  check('everybody in the room has the assistant, as a tab', await openAssistant(waiting.phone));
  check('…built from the room declaration alone, before a department', waiting.phone.showsNow('body', 'Built from room ·'));
  check('…able to ask and open, not to automate', waiting.phone.showsNow('body', 'it can ask · open') && !waiting.phone.showsNow('body', 'automate'));
  await say(waiting.phone, 'body', 'End the talk in 30 minutes');
  check('asked to automate, it says it cannot — it has no such tool', await waiting.phone.shows('body', 'cannot set up automations'));
  check('…and nothing was proposed or saved', !waiting.phone.showsNow('body', 'Read it first') && (await runtime.db.query('SELECT 1 FROM timers')).rows.length === 0);
  await say(waiting.phone, 'body', 'How many people are in the room?');
  check('a question goes the ask\'s way, and the answer is shown', await waiting.phone.shows('body', 'The answer'));
  check('every turn is kept: the history shows both, newest first', await waitUntil(() => {
    const tree = waiting.phone.textOf('body');
    const newest = tree.lastIndexOf('How many people are in the room?');
    const older = tree.lastIndexOf('End the talk in 30 minutes');
    return newest !== -1 && older !== -1 && newest < older;
  }));

  // ── 3. bounded by what the person holds ──
  const formsPerson = await stepIn();
  formsPerson.phone.close();
  const forms = await place(formsPerson.memberId, formsPerson.token, 'forms');
  check('placed in Forms, their assistant is built from room and forms', (await openAssistant(forms)) && (await forms.shows('body', 'Built from room · forms')));
  await say(forms, 'body', 'Change my name to Ada Lovelace');
  check('Forms is offered the rename, as a button to press', await forms.shows('body', 'Change your name to Ada Lovelace'));
  forms.click('body', 'proposed');
  check('…which opens the rename over the screen, pre-filled', await forms.shows('overlay', '"value":"Ada Lovelace"'));

  const recordsPerson = await stepIn();
  recordsPerson.phone.close();
  const records = await place(recordsPerson.memberId, recordsPerson.token, 'records');
  await openAssistant(records);
  check('placed in Records, theirs is built from room and records', await records.shows('body', 'Built from room · records'));
  await say(records, 'body', 'Change my name to Ada Lovelace');
  check('Records, asking the same, is offered no rename — they do not hold it', !records.showsNow('body', 'Change your name to'));
  check('a history is its person\'s alone: Records sees their own turn, none of anybody else\'s', (await records.shows('body', '"message":"Change my name to Ada Lovelace"')) && !records.showsNow('body', 'How many people are in the room?'));

  // ── the controller's ──
  const speaker = await connect(base, await mintSession(runtime.pool, 'speaker', 60_000));
  await speaker.hello();
  check('the controller\'s assistant is built from the controller declaration, and can automate', (await speaker.shows('tools', 'Built from controller')) && speaker.showsNow('tools', 'automate'));

  // ── what it sees: the person's own screen, read off the live shell ──
  await say(speaker, 'tools', 'What is on my screen?');
  check('the speaker\'s assistant sees the slide on screen, from the controller\'s own canvases', await speaker.shows('tools', 'The talk is an application'));
  check('…and not its own bookkeeping', !speaker.showsNow('tools', 'THE CONVERSATION'));
  await say(forms, 'body', 'What is on my screen?');
  check('a phone\'s assistant sees that person\'s screen: their own card', await forms.shows('body', 'On your screen:'));
  const cardName = (await runtime.db.query<{ name: string }>('SELECT name FROM members WHERE member_id = $1', [formsPerson.memberId])).rows[0]?.name ?? '\u0000';
  check(`…with their name on it (${cardName})`, forms.textOf('body').includes(`On your screen:`) && forms.textOf('body').split('On your screen:')[1]?.includes(cardName) === true);

  // ── 4. the open trigger and the catalog agree ──
  const trigger = ACTIONS['assistant.thread']?.triggers?.find((candidate) => 'ref' in candidate && candidate.ref === 'proposed');
  const pushed = trigger?.do[0];
  const target = pushed !== undefined && 'push' in pushed && typeof pushed.push === 'object' ? pushed.push : undefined;
  const keys = target !== undefined ? Object.keys(target.input ?? {}).filter((key) => key !== 'sheetTitle').sort() : [];
  check(`the open trigger carries exactly the catalog's openable keys (${OPENABLE_KEYS.join(', ')})`, JSON.stringify(keys) === JSON.stringify(OPENABLE_KEYS));

  for (const phone of [waiting.phone, forms, records, speaker]) phone.close();
  httpServer.close();
  await close();
  finish();
};

await main();
