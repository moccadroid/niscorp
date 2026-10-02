// X-RAY CHECK — the screen, showing the actions it is made of.
//
//   1. before it is given, a phone's list has no X-ray;
//   2. the speaker's tool is on the X-ray slide; Give writes a grant per
//      member, and the X-ray is an action on every phone's list — not at the
//      door, which has nobody to give it to;
//   3. switched on, the phone's frame says so (the browser outlines every
//      action on the screen with its id); off again, it says so too;
//   4. an id tapped: that action opens over the screen as the document it is —
//      the action on the screen right now, whole (data, triggers, layout) —
//      the assistant, and the X-ray's own switch;
//   5. Take it back deletes the grants, and the X-ray is gone from the phones.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { SLIDES } from '@lyceum/db/seed';
import { boot } from '@lyceum/server/boot';
import { check, connect, finish, giveAssistant, waitUntil } from './harness';
import type { Terminal } from './harness';

// The ActionSlot on `main` whose action is `action`: its instance id, as a
// tapped tag reports it.
const instanceOf = (screen: Terminal, canvas: string, action: string): string | undefined => {
  const found = new RegExp(`"instanceId":"([^"]+)","canvasId":"${canvas}","definitionId":"${action.replace('.', '\\.')}"`).exec(screen.textOf(canvas));
  return found?.[1];
};

const main = async (): Promise<void> => {
  const { server, runtime, close } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  const join = async (): Promise<Terminal> => {
    const door = await connect(base);
    await door.shows('main', '"ref":"pick"');
    door.click('main', 'pick');
    const token = await door.session();
    door.close();
    const phone = await connect(base, token);
    await phone.hello();
    await phone.shows('main', '"canvasId":"body"');
    return phone;
  };
  const ada = await join();
  const ben = await join();
  // The assistant, given: the action the X-ray is tapped on further down.
  await giveAssistant(server, runtime.pool);
  await ada.shows('body', 'assistant.thread');
  await ben.shows('body', 'assistant.thread');
  const stranger = await connect(base);
  await stranger.shows('main', '"ref":"pick"');
  const speaker = await connect(base, await mintSession(runtime.pool, 'speaker', 60_000));
  await speaker.hello();

  // ── 1 ──
  check('before it is given, a phone’s list has no X-ray', !ada.showsNow('body', 'xray.switch'));
  check('...and its frame is not X-rayed', await ada.shows('frame', '"name":"Xray","props":{"on":false}'));

  // ── 2 ──
  const at = SLIDES.findIndex((slide) => slide.tools.includes('tools.xray'));
  check(`the X-ray tool is on a slide (${SLIDES[at]?.title ?? 'none'})`, at >= 0);
  for (let step = 0; step < at; step += 1) {
    speaker.click('controls', 'next');
    await speaker.shows('head', `slide ${step + 2} of`);
  }
  check('...and it is on the controller there', await speaker.shows('tools', 'Give everybody the X-ray'));
  await speaker.shows('tools', '"label":"Who has it, late joiners included","value":"Nobody"');
  speaker.click('tools', 'give');
  check('pressing Give: the X-ray is on the first phone’s list', await ada.shows('body', 'xray.switch'));
  check('...and on the second', await ben.shows('body', 'xray.switch'));
  check('...and the tool says everybody has it', await speaker.shows('tools', '"label":"Who has it, late joiners included","value":"Everybody"'));
  // Somebody who joins AFTER it was given has it too: it was given to
  // everybody (one row), not to the people in the room at that moment.
  const late = await join();
  check('somebody who joins later has the X-ray too', await late.shows('body', 'xray.switch'));
  check('...and the assistant, given before they came', await late.shows('body', 'assistant.thread'));
  check('the door has no X-ray: nobody there to give it to', !stranger.showsNow('main', 'X-ray'));

  // ── 3 ──
  ada.click('body', 'flip');
  check('switched on: the phone’s frame is X-rayed', await ada.shows('frame', '"name":"Xray","props":{"on":true}'));
  check('...and only the phone that switched it', ben.showsNow('frame', '"name":"Xray","props":{"on":false}'));

  // ── 4 ──
  const assistant = instanceOf(ada, 'body', 'assistant.thread');
  check(`the assistant is on the screen, as an action instance (${assistant ?? 'none'})`, assistant !== undefined);
  ada.publish('xray-open', { instance: assistant ?? '', action: 'assistant.thread' });
  check('an id tapped: that action opens over the screen', await ada.shows('overlay', 'assistant.thread'));
  check('...as the document it is: its data', await ada.shows('overlay', '\\"data\\"'));
  check('...its triggers and its layout too', ada.showsNow('overlay', '\\"triggers\\"') && ada.showsNow('overlay', '\\"layout\\"'));
  ada.click('overlay', 'close');
  await waitUntil(() => !ada.showsNow('overlay', '"ref":"close"'));
  // The X-ray is an action on the list like any other: its own id opens too.
  const switcher = instanceOf(ada, 'body', 'xray.switch');
  ada.publish('xray-open', { instance: switcher ?? '', action: 'xray.switch' });
  check(`...and so does the X-ray's own switch, another action on the list (${switcher ?? 'none'})`, switcher !== undefined && (await ada.shows('overlay', '\\"id\\": \\"xray.switch\\"')));
  ada.click('overlay', 'close');
  ada.click('body', 'flip');
  check('switched off again: the frame says so', await ada.shows('frame', '"name":"Xray","props":{"on":false}'));

  // ── 5 ──
  speaker.click('tools', 'take');
  check('Take it back: the X-ray is gone from the first phone', await waitUntil(() => !ada.showsNow('body', 'xray.switch')));
  check('...and from the second', await waitUntil(() => !ben.showsNow('body', 'xray.switch')));
  check('...and from the one who joined late', await waitUntil(() => !late.showsNow('body', 'xray.switch')));
  check('...and the tool says nobody has it', await speaker.shows('tools', '"label":"Who has it, late joiners included","value":"Nobody"'));
  // Taken back, it is not there for whoever joins next either.
  const later = await join();
  check('somebody who joins after it was taken back does not have it', !later.showsNow('body', 'xray.switch'));

  for (const screen of [ada, ben, late, later, stranger, speaker]) screen.close();
  httpServer.close();
  await close();
  finish();
};

await main();
