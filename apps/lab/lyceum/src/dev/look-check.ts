// LOOK CHECK — one tree, two kits. Which kit paints a screen is a row (the
// room's look), read reactively by a marker on every screen; the terminal
// paints with the kit the marker names (src/ui/target.ts). So switching the
// whole room is one write by the speaker, and nothing announces it.
//
//   1. every screen carries the marker — a stranger at the door, a phone, the
//      projector, the controller — naming the poster;
//   2. the speaker's switch is a tool on "Everything is data", and pressing
//      Plain HTML changes every screen's marker, the trees otherwise the same;
//   3. the look is a closed set, held by the table: any other word is refused;
//   4. both kits implement exactly the grammar's components (the types say so;
//      this says it at runtime too, where a kit would be handed a tree).
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { SLIDES } from '@lyceum/db/seed';
import { boot } from '@lyceum/server/boot';
import { KIT_PROPS } from '@lyceum/ui/kit.props';
import { check, connect, finish, waitUntil } from './harness';
import type { Terminal } from './harness';

const main = async (): Promise<void> => {
  const { server, runtime, close } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  const stranger = await connect(base);
  await stranger.shows('main', 'Step in');
  const door = await connect(base);
  await door.shows('main', 'Step in');
  door.click('main', 'enter');
  const token = await door.session();
  door.close();
  const phone = await connect(base, token);
  await phone.hello();
  const stage = await connect(base, await mintSession(runtime.pool, 'stage', 60_000));
  const speaker = await connect(base, await mintSession(runtime.pool, 'speaker', 60_000));
  await stage.hello();
  await speaker.hello();
  const screens: Record<string, Terminal> = { 'a stranger at the door': stranger, 'a phone': phone, 'the projector': stage, 'the controller': speaker };
  const marks = (look: string): Promise<boolean[]> =>
    Promise.all(Object.values(screens).map((screen) => screen.shows('look', `"look":"${look}"`)));

  // ── 1 ──
  const poster = await marks('poster');
  for (const [index, name] of Object.keys(screens).entries()) check(`${name} carries the look marker, naming the poster`, poster[index] === true);

  // ── 2 ──
  const at = SLIDES.findIndex((slide) => slide.tools.includes('tools.look'));
  check(`the switch is a tool on a slide (${SLIDES[at]?.title ?? 'none'})`, at >= 0);
  for (let step = 0; step < at; step += 1) {
    const number = step + 2;
    speaker.click('controls', 'next');
    await speaker.shows('head', `slide ${number} of`);
  }
  check('...and it is on the controller there', await speaker.shows('tools', 'The look'));
  // The phone's card is still being written (the issuer); wait for it to settle.
  const settled = async (screen: Terminal, canvas: string): Promise<string> => {
    for (let last = screen.textOf(canvas); ; ) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const now = screen.textOf(canvas);
      if (now === last) return now;
      last = now;
    }
  };
  const before = await settled(phone, 'body');
  speaker.click('tools', 'look', 'plain');
  const plain = await marks('plain');
  for (const [index, name] of Object.keys(screens).entries()) check(`pressing Plain HTML: ${name} now names plain`, plain[index] === true);
  check('...and the switch marks the one in use', await waitUntil(() => speaker.showsNow('tools', '"ink":"highlight","label":"Plain HTML"')));
  check('...while the phone\'s own tree is the same tree — only the marker moved', (await settled(phone, 'body')) === before);
  speaker.click('tools', 'look', 'poster');
  check('pressing Poster brings every screen back', (await marks('poster')).every(Boolean));

  // ── 3 ──
  speaker.click('tools', 'look', 'purple');
  await new Promise((resolve) => setTimeout(resolve, 300));
  const row = (await runtime.db.query<{ look: string }>(`SELECT look FROM room`)).rows[0]?.look;
  check(`a word the table does not hold is refused: the room stays ${row ?? 'nothing'}`, row === 'poster');

  // ── 4 ──
  const { POSTER_KIT } = await import('@lyceum/ui/kit');
  const { PLAIN_KIT } = await import('@lyceum/ui/plain.kit');
  const grammar = Object.keys(KIT_PROPS.shape).sort().join();
  check('the poster kit implements exactly the grammar\'s components', Object.keys(POSTER_KIT).sort().join() === grammar);
  check('the plain kit implements exactly the grammar\'s components', Object.keys(PLAIN_KIT).sort().join() === grammar);

  for (const screen of Object.values(screens)) screen.close();
  httpServer.close();
  await close();
  finish();
};

await main();
