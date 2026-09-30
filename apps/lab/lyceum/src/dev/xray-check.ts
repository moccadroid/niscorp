// X-RAY CHECK — giving everybody an action, and taking it back, is rows.
//
//   1. before anything is given, a phone has nothing over its body;
//   2. the speaker's tool is on the X-ray slide; Give writes a grant per
//      member, and the X-ray button is on every phone — not on the door, which
//      has no member row to give it to;
//   3. pressed, it opens the person's own screen as data: the actions on it,
//      their canvases, and their data — their own card, nobody else's;
//   4. Take it back deletes the grants, and the button is gone from the phones.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { SLIDES } from '@lyceum/db/seed';
import { boot } from '@lyceum/server/boot';
import { check, connect, finish } from './harness';
import type { Terminal } from './harness';

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
    await phone.shows('body', 'member.card');
    return phone;
  };
  const ada = await join();
  const ben = await join();
  const stranger = await connect(base);
  await stranger.shows('main', 'Step in');
  const speaker = await connect(base, await mintSession(runtime.pool, 'speaker', 60_000));
  await speaker.hello();

  // ── 1 ──
  check('before anything is given, a phone has nothing over its body', !ada.showsNow('given', 'xray.button'));

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
  check('pressing Give: the X-ray is on the first phone', await ada.shows('given', 'X-ray'));
  check('...and on the second', await ben.shows('given', 'X-ray'));
  check('...and the tool counts both', await speaker.shows('tools', '"label":"People who have it","value":2'));
  const grants = (await runtime.db.query<{ n: number }>("SELECT count(*)::int AS n FROM grants WHERE role = 'xray'")).rows[0]?.n;
  check(`...as one grant row each (${String(grants)})`, grants === 2);
  check('the door has no X-ray: nobody there to give it to', !stranger.showsNow('main', 'X-ray'));

  // ── 3 ──
  ada.click('given', 'open');
  check('pressed, the X-ray opens over the screen', await ada.shows('overlay', 'Your screen, as data'));
  check('...listing the actions on it and their canvases', await ada.shows('overlay', 'body · member.card'));
  check('...with their data, as JSON', await ada.shows('overlay', '\\"member_id\\"'));
  const ids = (await runtime.db.query<{ member_id: string }>('SELECT member_id FROM members ORDER BY joined_at, member_id')).rows.map((row) => row.member_id);
  const seen = ada.textOf('overlay');
  check('...their own card, not anybody else’s', ids.length === 2 && ids.filter((id) => seen.includes(id)).length === 1);

  // ── 4 ──
  speaker.click('tools', 'take');
  check('Take it back: the X-ray is gone from the first phone', await waitGone(ada));
  check('...and from the second', await waitGone(ben));
  check('...and the tool counts nobody', await speaker.shows('tools', '"label":"People who have it","value":0'));

  for (const screen of [ada, ben, stranger, speaker]) screen.close();
  httpServer.close();
  await close();
  finish();
};

// Gone: the given canvas stops showing the button, within a few seconds.
const waitGone = async (screen: Terminal): Promise<boolean> => {
  for (let tries = 0; tries < 200; tries += 1) {
    if (!screen.showsNow('given', 'X-ray')) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
};

await main();
