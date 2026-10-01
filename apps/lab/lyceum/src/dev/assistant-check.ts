// ASSISTANT CHECK — one assistant on every device, built for each person by
// what the charter grants them. Real websockets against the real boot, with
// the deterministic stand-in turn (server/assistant/orchestrator.ts,
// LYCEUM_ASSISTANT=fake) calling the SAME tools the live one would; this
// checks the assembly, the tools and the proposals, not a model.
//
//   1. built from the declarations a person's grants select — shown to them;
//   2. what it can do follows: only the controller can automate;
//   3. a tool is bounded by what the person has — a member gets the question
//      form opened, pre-filled, over the screen; the speaker, asking the same,
//      does not;
//   4. the open trigger carries exactly the keys the catalog declares openable.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { ACTIONS } from '@lyceum/app/action-catalog';
import { boot } from '@lyceum/server/boot';
import { SLIDES } from '@lyceum/db/seed';
import { OPENABLE_KEYS, offerableActions, prefillOf } from '@lyceum/server/assistant/tools';
import { assembleFor } from '@lyceum/server/assistant/declarations';
import { check, connect, finish, giveAssistant, waitUntil } from './harness';
import type { Terminal } from './harness';

const main = async (): Promise<void> => {
  const { server, runtime, close } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  // Somebody joins — and, unless told not to, is given the assistant, as the
  // speaker gives it during the talk: a phone starts without one.
  const stepIn = async (given = true): Promise<{ phone: Terminal; memberId: string; token: string }> => {
    const door = await connect(base);
    await door.shows('main', '"ref":"pick"');
    door.click('main', 'pick');
    const token = await door.session();
    door.close();
    const phone = await connect(base, token);
    const hello = await phone.hello();
    await phone.shows('main', '"canvasId":"body"');
    if (given) await giveAssistant(server, runtime.pool);
    return { phone, memberId: hello.principal ?? '', token };
  };
  const openAssistant = async (phone: Terminal): Promise<boolean> => {
    await phone.shows('main', '"label":"Assistant"');
    return phone.shows('body', 'Can: ');
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
  const waiting = await stepIn(false);
  check('a phone starts without the assistant: nothing on its list yet', (await waiting.phone.shows('body', 'Nothing here yet.')) && !waiting.phone.showsNow('body', 'Can: '));
  await giveAssistant(server, runtime.pool);
  check('given by the speaker, the assistant is on their list', await openAssistant(waiting.phone));
  check('…with a member\'s tools: it can query, not automate', waiting.phone.showsNow('body', 'Can: query') && !waiting.phone.showsNow('body', 'automate'));
  check('…able to query and open, not to automate', waiting.phone.showsNow('body', 'Can: query · open') && !waiting.phone.showsNow('body', 'automate'));
  await say(waiting.phone, 'body', 'End the talk in 30 minutes');
  check('asked to automate, it says it cannot — it has no such tool', await waiting.phone.shows('body', 'cannot set up automations'));
  check('…and nothing was proposed or saved', !waiting.phone.showsNow('body', 'Read it first') && (await runtime.db.query('SELECT 1 FROM timers')).rows.length === 0);
  await say(waiting.phone, 'body', 'How many people are in the room?', 'enter');
  check('Enter sends; the assistant runs a vex query, and it opens over the screen at once — no button in between', await waiting.phone.shows('overlay', '"value":"Query"'));
  check('…shown as the query it is: its intent, its shape, its fingerprint', waiting.phone.showsNow('overlay', 'How many people are in the room?') && waiting.phone.showsNow('overlay', 'Shape · number') && waiting.phone.showsNow('overlay', 'Fingerprint'));
  check('…and its result, replayed as the person', await waiting.phone.shows('overlay', '"label":"Result"'));
  check('the conversation keeps the query: under the turn, a button that opens it again', await waiting.phone.shows('body', 'Query · How many people are in the room?'));
  waiting.phone.click('overlay', 'close');
  await waitUntil(() => !waiting.phone.showsNow('overlay', '"value":"Query"'));
  waiting.phone.click('body', 'reopen');
  check('…pressed, the query opens again, replayed now', (await waiting.phone.shows('overlay', 'Shape · number')) && (await waiting.phone.shows('overlay', '"label":"Result"')));
  waiting.phone.click('overlay', 'close');
  await waitUntil(() => !waiting.phone.showsNow('overlay', '"value":"Query"'));
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

  // ── 3. bounded by what the person has ──
  const asker = await stepIn();
  await openAssistant(asker.phone);
  await say(asker.phone, 'body', 'Send the speaker a question: Will the slides be online?');
  // The question form is not a member's until Q&A is installed (Acme, an
  // integration the speaker installs on stage): until then the assistant has
  // no form to open, and says so rather than inventing one.
  check('a member asking to send a question before Q&A is installed gets no form: there is none to open', (await waitUntil(() => /cannot open anything|not one of your actions/.test(asker.phone.textOf('body')))) && !asker.phone.showsNow('overlay', 'Your question'));
  check('a history is its person\'s alone: theirs has their own turns, none of anybody else\'s', asker.phone.showsNow('body', 'Will the slides be online?') && !asker.phone.showsNow('body', 'How many people are in the room?'));

  // ── the controller's ──
  const speaker = await connect(base, await mintSession(runtime.pool, 'speaker', 60_000));
  await speaker.hello();
  // To the timer slide, which brings the speaker's assistant to the controller.
  for (let step = 0; step < SLIDES.findIndex((slide) => slide.slideId === 'slide.timer'); step += 1) {
    speaker.click('controls', 'next');
    await speaker.shows('head', `slide ${step + 2} of`);
  }
  check('the controller\'s assistant can automate', (await speaker.shows('tools', 'Can: ')) && speaker.showsNow('tools', 'automate'));
  await say(speaker, 'tools', 'Send the speaker a question: Will the slides be online?');
  check('the speaker, asking the same, gets no form — the question form is not theirs', !speaker.showsNow('overlay', 'Your question') && !speaker.showsNow('tools', 'Your question:') && /cannot open anything|not one of your actions/.test(speaker.textOf('tools')));

  // ── what it sees: the person's own screen, read off the live shell ──
  await say(speaker, 'tools', 'What is on my screen?');
  check('the speaker\'s assistant sees the slide on screen, from the controller\'s own canvases', await speaker.shows('tools', 'share the controller screen'));
  check('…and not its own bookkeeping', !speaker.showsNow('tools', 'THE CONVERSATION'));
  await say(asker.phone, 'body', 'What is on my screen?');
  check('a phone\'s assistant sees that person\'s screen: their own phone', await asker.phone.shows('body', 'On your screen:'));
  const cardName = (await runtime.db.query<{ name: string }>('SELECT name FROM members WHERE member_id = $1', [asker.memberId])).rows[0]?.name ?? '\u0000';
  check(`…with their name on it (${cardName})`, asker.phone.textOf('body').includes(`On your screen:`) && asker.phone.textOf('body').split('On your screen:')[1]?.includes(cardName) === true);

  // ── what each assistant is grounded on, it may read ──
  // A declaration applies to everyone who has its action; its grounding reads run
  // as that person, and nothing swallows a refusal — so each must succeed.
  const speakerToken = await mintSession(runtime.pool, 'speaker', 60_000);
  const people = [
    { who: 'somebody waiting', token: waiting.token, actions: (await waiting.phone.hello()).catalog.actions },
    { who: 'a member', token: asker.token, actions: (await asker.phone.hello()).catalog.actions },
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
  const granted = ['assistant.thread', 'query.result', 'xray.switch', 'questions.send'];
  check('`open` offers what the charter gave them — not the assistant itself, not a result only a tool opens', JSON.stringify(offerableActions(granted)) === JSON.stringify(['xray.switch', 'questions.send']));
  const undescribed = offerableActions(Object.keys(ACTIONS)).filter((id) => (ACTIONS[id]?.description ?? '') === '');
  check(`every action the assistant can open says what it is — a description to reason from${undescribed.length === 0 ? '' : ` (missing: ${undescribed.join(', ')})`}`, undescribed.length === 0);
  check('…and an action whose contract is empty, declared: openable with nothing to pre-fill', offerableActions(['xray.switch']).includes('xray.switch') && prefillOf('xray.switch').length === 0);
  check('…pre-filled only with what its contract declares: a question takes its draft, nothing else', JSON.stringify(prefillOf('questions.send').map((entry) => entry.key)) === JSON.stringify(['draft']));

  // ── 4. reopening from the conversation carries every key an opened action takes ──
  const trigger = ACTIONS['assistant.thread']?.triggers?.find((candidate) => 'ref' in candidate && candidate.ref === 'reopen');
  const pushed = trigger?.do[0];
  const target = pushed !== undefined && 'push' in pushed && typeof pushed.push === 'object' ? pushed.push : undefined;
  const keys = target !== undefined ? Object.keys(target.input ?? {}).filter((key) => key !== 'sheetTitle').sort() : [];
  const resultKeys = Object.keys(Reflect.get(Object(ACTIONS['query.result']?.input), 'properties') ?? {});
  const wanted = [...new Set([...OPENABLE_KEYS, ...resultKeys])].sort();
  check(`the reopen trigger carries exactly the pre-fill keys and a vex query's (${wanted.join(', ')})`, JSON.stringify(keys) === JSON.stringify(wanted));

  for (const phone of [waiting.phone, asker.phone, speaker]) phone.close();
  httpServer.close();
  await close();
  finish();
};

await main();
