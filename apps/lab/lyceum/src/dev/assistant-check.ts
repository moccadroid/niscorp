// ASSISTANT CHECK — one assistant on every device, built for each person by
// what the charter grants them. Real websockets against the real boot, with
// the deterministic stand-in turn (server/assistant/orchestrator.ts,
// LYCEUM_ASSISTANT=fake) calling the SAME tools the live one would; this
// checks the assembly, the tools and the proposals, not a model.
//
//   1. built from the declarations a person's grants select — shown to them;
//   2. what it can do follows: only the controller can automate;
//   3. a tool is bounded by what the person holds — Forms gets its rename opened,
//      pre-filled, and it opens over the screen; Records, asking the same, is not;
//   4. the open trigger carries exactly the keys the catalog declares openable.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { ACTIONS } from '@lyceum/app/action-catalog';
import { boot } from '@lyceum/server/boot';
import { OPENABLE_KEYS, offerableActions, prefillOf } from '@lyceum/server/assistant/tools';
import { assembleFor } from '@lyceum/server/assistant/declarations';
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
  // Written, then sent — by the button, or by Enter in the field.
  const say = async (phone: Terminal, canvas: string, message: string, by: 'button' | 'enter' = 'button'): Promise<void> => {
    phone.type(canvas, 'draft', message);
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (by === 'enter') phone.key(canvas, 'draft', 'Enter');
    else phone.click(canvas, 'send');
    await waitUntil(() => phone.showsNow(canvas, 'Thinking'));
    await waitUntil(() => !phone.showsNow(canvas, 'Thinking'));
  };

  // ── 1 + 2. somebody waiting: the room's assistant, no automation ──
  const waiting = await stepIn();
  check('everybody in the room has the assistant, as a tab', await openAssistant(waiting.phone));
  check('…built from the room declaration alone, before a department', waiting.phone.showsNow('body', 'Built from room ·'));
  check('…able to query and open, not to automate', waiting.phone.showsNow('body', 'it can query · open') && !waiting.phone.showsNow('body', 'automate'));
  await say(waiting.phone, 'body', 'End the talk in 30 minutes');
  check('asked to automate, it says it cannot — it has no such tool', await waiting.phone.shows('body', 'cannot set up automations'));
  check('…and nothing was proposed or saved', !waiting.phone.showsNow('body', 'Read it first') && (await runtime.db.query('SELECT 1 FROM timers')).rows.length === 0);
  await say(waiting.phone, 'body', 'How many people are in the room?', 'enter');
  check('Enter sends; the assistant runs a vex query, and it opens over the screen at once — no button in between', await waiting.phone.shows('overlay', '"value":"Vex query"'));
  check('…shown as the query it is: its intent, its shape, its fingerprint', waiting.phone.showsNow('overlay', 'How many people are in the room?') && waiting.phone.showsNow('overlay', 'Shape · number') && waiting.phone.showsNow('overlay', 'Fingerprint'));
  check('…and its result, replayed as the person', await waiting.phone.shows('overlay', '"label":"Result"'));
  check('the conversation keeps the query: under the turn, a button that opens it again', await waiting.phone.shows('body', 'Vex query · How many people are in the room?'));
  waiting.phone.click('overlay', 'close');
  await waitUntil(() => !waiting.phone.showsNow('overlay', '"value":"Vex query"'));
  waiting.phone.click('body', 'reopen');
  check('…pressed, the query opens again, replayed now', (await waiting.phone.shows('overlay', 'Shape · number')) && (await waiting.phone.shows('overlay', '"label":"Result"')));
  waiting.phone.click('overlay', 'close');
  await waitUntil(() => !waiting.phone.showsNow('overlay', '"value":"Vex query"'));
  check('every turn is kept: the conversation reads oldest first, the newest by the input', await waitUntil(() => {
    const tree = waiting.phone.textOf('body');
    const newest = tree.indexOf('How many people are in the room?');
    const older = tree.indexOf('End the talk in 30 minutes');
    return newest !== -1 && older !== -1 && older < newest;
  }));
  check('…and the field is empty again for the next message', waiting.phone.showsNow('body', '"name":"Field","props":{"area":"field","value":""'));
  for (const n of [1, 2, 3, 4]) await say(waiting.phone, 'body', `Who is number ${n}?`);
  check('the conversation shows the last five turns: the first has left the screen', await waitUntil(() => {
    const tree = waiting.phone.textOf('body');
    return tree.includes('Who is number 4?') && tree.includes('How many people are in the room?') && !tree.includes('End the talk in 30 minutes');
  }));

  // ── 3. bounded by what the person holds ──
  const formsPerson = await stepIn();
  formsPerson.phone.close();
  const forms = await place(formsPerson.memberId, formsPerson.token, 'forms');
  check('placed in Forms, their assistant is built from room and forms', (await openAssistant(forms)) && (await forms.shows('body', 'Built from room · forms')));
  await say(forms, 'body', 'Change my name to Ada Lovelace');
  check('Forms gets the rename opened over the screen at once, pre-filled — filing it is still theirs', (await forms.shows('overlay', '"value":"Ada Lovelace"')) && forms.showsNow('overlay', 'File the change'));
  check('…and the conversation keeps it, to open again', await forms.shows('body', 'Change your name to Ada Lovelace →'));
  forms.click('overlay', 'close');
  await waitUntil(() => !forms.showsNow('overlay', '"ref":"close"'));
  await say(forms, 'body', 'Show me my questions');
  check('an action with nothing to pre-fill opens too: their own questions, over the screen', await forms.shows('overlay', 'Your questions'));
  forms.click('overlay', 'close');
  await waitUntil(() => !forms.showsNow('overlay', '"ref":"close"'));

  const recordsPerson = await stepIn();
  recordsPerson.phone.close();
  const records = await place(recordsPerson.memberId, recordsPerson.token, 'records');
  await openAssistant(records);
  check('placed in Records, theirs is built from room and records', await records.shows('body', 'Built from room · records'));
  await say(records, 'body', 'Change my name to Ada Lovelace');
  check('Records, asking the same, gets no rename — they do not hold it', !records.showsNow('overlay', 'File the change') && !records.showsNow('body', 'Change your name to'));
  check('a history is its person\'s alone: Records sees their own turn, none of anybody else\'s', (await records.shows('body', '{"type":"text","value":"Change my name to Ada Lovelace"}')) && !records.showsNow('body', 'How many people are in the room?'));

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

  // ── what each assistant is grounded on, it may read ──
  // A declaration applies to whoever holds its action; its grounding reads run
  // as that person, and nothing swallows a refusal — so each must succeed.
  const speakerToken = await mintSession(runtime.pool, 'speaker', 60_000);
  const people = [
    { who: 'somebody waiting', token: waiting.token, actions: (await waiting.phone.hello()).catalog.actions },
    { who: 'Forms', token: formsPerson.token, actions: (await forms.hello()).catalog.actions },
    { who: 'Records', token: recordsPerson.token, actions: (await records.hello()).catalog.actions },
    { who: 'the speaker', token: speakerToken, actions: (await speaker.hello()).catalog.actions },
  ];
  for (const person of people) {
    for (const declaration of assembleFor(person.actions).from) {
      for (const ground of declaration.grounding) {
        const status = (
          await server.request('/api/vex', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${person.token}` },
            body: JSON.stringify({ fingerprint: ground.fingerprint, context: ground.context }),
          })
        ).status;
        check(`${person.who}: the ${declaration.id} assistant's grounding "${ground.fingerprint}" is theirs to read (${status})`, status === 200);
      }
    }
  }

  // ── what `open` may offer: the charter's actions, and only what a person asks for ──
  const held = ['assistant.thread', 'query.result', 'forms.rename', 'member.card', 'questions.send'];
  check('`open` offers what the charter gave them — not the assistant itself, not a result only a tool opens', JSON.stringify(offerableActions(held)) === JSON.stringify(['forms.rename', 'member.card', 'questions.send']));
  const undescribed = offerableActions(Object.keys(ACTIONS)).filter((id) => (ACTIONS[id]?.description ?? '') === '');
  check(`every action the assistant can open says what it is — a description to reason from${undescribed.length === 0 ? '' : ` (missing: ${undescribed.join(', ')})`}`, undescribed.length === 0);
  check('…and an action whose contract is empty, declared: openable with nothing to pre-fill', offerableActions(['questions.mine']).includes('questions.mine') && prefillOf('questions.mine').length === 0);
  check('…pre-filled only with what a person asks for: how the phone draws an action (tab, strip) is not offered', JSON.stringify(prefillOf('forms.rename').map((entry) => entry.key)) === JSON.stringify(['draft']) && prefillOf('member.card').length === 0);

  // ── 4. reopening from the conversation carries every key an opened action takes ──
  const trigger = ACTIONS['assistant.thread']?.triggers?.find((candidate) => 'ref' in candidate && candidate.ref === 'reopen');
  const pushed = trigger?.do[0];
  const target = pushed !== undefined && 'push' in pushed && typeof pushed.push === 'object' ? pushed.push : undefined;
  const keys = target !== undefined ? Object.keys(target.input ?? {}).filter((key) => key !== 'sheetTitle').sort() : [];
  const resultKeys = Object.keys(Reflect.get(Object(ACTIONS['query.result']?.input), 'properties') ?? {});
  const wanted = [...new Set([...OPENABLE_KEYS, ...resultKeys])].sort();
  check(`the reopen trigger carries exactly the pre-fill keys and a vex query's (${wanted.join(', ')})`, JSON.stringify(keys) === JSON.stringify(wanted));

  for (const phone of [waiting.phone, forms, records, speaker]) phone.close();
  httpServer.close();
  await close();
  finish();
};

await main();
