// X-RAY CHECK — the screen, showing the actions it is made of.
//
//   1. before it is given, a phone's bar has no X-ray, and switching it on is
//      refused;
//   2. the speaker's tool is on the X-ray slide; Give writes a grant per
//      member, and the X-ray is a switch on every phone's bar — not at the
//      door, which has nobody to give it to;
//   3. switched on, the phone's frame says so (the browser outlines every
//      action on the screen with its id); off again, it says so too;
//   4. an id tapped: that action opens over the screen as the document it is —
//      the action on the screen right now, whole (data, triggers, layout), and
//      after the phone opens Q&A, Q&A's actions;
//   5. Take it back deletes the grants, and the switch is gone from the phones.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { SLIDES } from '@lyceum/db/seed';
import { boot } from '@lyceum/server/boot';
import { check, connect, finish, waitUntil } from './harness';
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
    await door.shows('main', 'Step in');
    door.click('main', 'enter');
    const token = await door.session();
    door.close();
    const phone = await connect(base, token);
    await phone.hello();
    await phone.shows('main', '"label":"Assistant"');
    return phone;
  };
  const ada = await join();
  const ben = await join();
  const stranger = await connect(base);
  await stranger.shows('main', 'Step in');
  const speaker = await connect(base, await mintSession(runtime.pool, 'speaker', 60_000));
  await speaker.hello();

  // ── 1 ──
  check('before it is given, a phone’s bar has no X-ray', !ada.showsNow('main', '"label":"X-ray"'));
  check('...and its frame is not X-rayed', await ada.shows('frame', '"name":"Xray","props":{"on":false}'));

  // ── 2 ──
  const at = SLIDES.findIndex((slide) => slide.tools.includes('tools.xray'));
  check(`the X-ray tool is on a slide (${SLIDES[at]?.title ?? 'none'})`, at >= 0);
  for (let step = 0; step < at; step += 1) {
    speaker.click('controls', 'next');
    await speaker.shows('head', `slide ${step + 2} of`);
  }
  check('...and it is on the controller there', await speaker.shows('tools', 'Give everybody the X-ray'));
  // The tool reads who has joined as it mounts; give it that moment.
  await speaker.shows('tools', 'People who have it');
  await new Promise((resolve) => setTimeout(resolve, 300));
  speaker.click('tools', 'give');
  check('pressing Give: the X-ray is a switch on the first phone’s bar', await ada.shows('main', '"label":"X-ray"'));
  check('...and on the second', await ben.shows('main', '"label":"X-ray"'));
  check('...and the tool counts both', await speaker.shows('tools', '"label":"People who have it","value":2'));
  check('the door has no X-ray: nobody there to give it to', !stranger.showsNow('main', 'X-ray'));

  // ── 3 ──
  ada.click('main', 'xray');
  check('switched on: the phone’s frame is X-rayed', await ada.shows('frame', '"name":"Xray","props":{"on":true}'));
  check('...and only the phone that switched it', ben.showsNow('frame', '"name":"Xray","props":{"on":false}'));

  // ── 4 ──
  const card = instanceOf(ada, 'body', 'member.card');
  check(`the card is on the screen, as an action instance (${card ?? 'none'})`, card !== undefined);
  ada.publish('xray-open', { instance: card ?? '', action: 'member.card' });
  check('an id tapped: that action opens over the screen', await ada.shows('overlay', 'member.card'));
  check('...as the document it is: its data', await ada.shows('overlay', '\\"member_id\\"'));
  check('...its triggers and its layout too', ada.showsNow('overlay', '\\"triggers\\"') && ada.showsNow('overlay', '\\"layout\\"'));
  ada.click('overlay', 'close');
  await waitUntil(() => !ada.showsNow('overlay', 'member.card'));
  ada.click('main', 'tab', 'questions.desk');
  await ada.shows('qa-form', 'questions.send');
  const form = instanceOf(ada, 'qa-form', 'questions.send');
  check(`after opening Q&A, its form is on the screen instead (${form ?? 'none'})`, form !== undefined && instanceOf(ada, 'body', 'member.card') === undefined);
  ada.publish('xray-open', { instance: form ?? '', action: 'questions.send' });
  check('...and tapping its id shows the form’s document', await ada.shows('overlay', '\\"id\\": \\"questions.send\\"'));
  ada.click('overlay', 'close');
  ada.click('main', 'xray');
  check('switched off again: the frame says so', await ada.shows('frame', '"name":"Xray","props":{"on":false}'));

  // ── 5 ──
  speaker.click('tools', 'take');
  check('Take it back: the switch is gone from the first phone', await waitUntil(() => !ada.showsNow('main', '"label":"X-ray"')));
  check('...and from the second', await waitUntil(() => !ben.showsNow('main', '"label":"X-ray"')));
  check('...and the tool counts nobody', await speaker.shows('tools', '"label":"People who have it","value":0'));

  for (const screen of [ada, ben, stranger, speaker]) screen.close();
  httpServer.close();
  await close();
  finish();
};

await main();
