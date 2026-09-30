// LOOK CHECK — one tree, three renderers. Which renderer draws a screen is a
// row per surface (the phones, the projector, the controller); the server
// puts it in each screen's frame (server/renderers.ts), and the terminal draws
// with the renderer the frame names (src/ui/target.ts). It is not an action:
// nobody's screen has it as something on it.
//
//   1. every screen's frame names DOM — a stranger at the door, a phone, the
//      projector, the controller — and no screen has a renderer action;
//   2. the speaker's switch is a tool on a slide; pressing React for the phones
//      moves the phones' frames and no other surface's, the trees otherwise
//      the same; the stage and the controller move on their own rows;
//   3. surfaces and renderers are closed sets, kept by the table: any other
//      word is refused;
//   4. every kit implements exactly the grammar's components (the types say
//      so; this says it at runtime too, where a kit would be handed a tree).
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
  await stranger.shows('main', '"ref":"pick"');
  const door = await connect(base);
  await door.shows('main', '"ref":"pick"');
  door.click('main', 'pick');
  const token = await door.session();
  door.close();
  const phone = await connect(base, token);
  await phone.hello();
  const stage = await connect(base, await mintSession(runtime.pool, 'stage', 60_000));
  const speaker = await connect(base, await mintSession(runtime.pool, 'speaker', 60_000));
  await stage.hello();
  await speaker.hello();
  const screens: { name: string; screen: Terminal; surface: string }[] = [
    { name: 'a stranger at the door', screen: stranger, surface: 'phones' },
    { name: 'a phone', screen: phone, surface: 'phones' },
    { name: 'the projector', screen: stage, surface: 'stage' },
    { name: 'the controller', screen: speaker, surface: 'controller' },
  ];
  const named = (screen: Terminal, renderer: string): Promise<boolean> => screen.shows('frame', `"look":"${renderer}"`);

  // ── 1 ──
  for (const { name, screen, surface } of screens) {
    check(`${name}: its frame names DOM (the ${surface})`, await named(screen, 'dom'));
    check('...and no action on it is about renderers', !(await screen.hello()).catalog.actions.some((id) => id.startsWith('look.')));
  }

  // ── 2 ──
  const at = SLIDES.findIndex((slide) => slide.tools.includes('tools.look'));
  check(`the switch is a tool on a slide (${SLIDES[at]?.title ?? 'none'})`, at >= 0);
  for (let step = 0; step < at; step += 1) {
    speaker.click('controls', 'next');
    await speaker.shows('head', `slide ${step + 2} of`);
  }
  check('...and it is on the controller there', await speaker.shows('tools', 'Renderers'));
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
  speaker.click('tools', 'renderer', { surface: 'phones', renderer: 'react' });
  check('pressing React for the phones: the stranger’s frame names react', await named(stranger, 'react'));
  check('...and the phone’s', await named(phone, 'react'));
  await new Promise((resolve) => setTimeout(resolve, 300));
  check('...the projector’s still names DOM', stage.showsNow('frame', '"look":"dom"'));
  check('...and so does the controller’s', speaker.showsNow('frame', '"look":"dom"'));
  check('...the switch marks React on the phones’ row', await waitUntil(() => speaker.showsNow('tools', '"area":"phones-react","ink":"highlight"')));
  check('...while the phone’s own tree is the same tree — only the frame moved', (await settled(phone, 'body')) === before);
  speaker.click('tools', 'renderer', { surface: 'stage', renderer: 'vue' });
  check('pressing Vue for the stage: the projector names vue', await named(stage, 'vue'));
  check('...while the phones stay on react', phone.showsNow('frame', '"look":"react"'));
  speaker.click('tools', 'renderer', { surface: 'controller', renderer: 'vue' });
  check('the controller switches itself', await named(speaker, 'vue'));
  for (const surface of ['phones', 'stage', 'controller']) speaker.click('tools', 'renderer', { surface, renderer: 'dom' });
  check('pressing DOM on each row brings every screen back', (await Promise.all(screens.map(({ screen }) => named(screen, 'dom')))).every(Boolean));

  // ── 3 ──
  const rows = async (): Promise<string> =>
    (await runtime.db.query<{ surface: string; renderer: string }>('SELECT surface, renderer FROM renderers ORDER BY position')).rows.map((row) => `${row.surface}:${row.renderer}`).join();
  speaker.click('tools', 'renderer', { surface: 'phones', renderer: 'purple' });
  speaker.click('tools', 'renderer', { surface: 'lobby', renderer: 'react' });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const after = await rows();
  check(`a word the table does not have is refused: ${after}`, after === 'phones:dom,stage:dom,controller:dom');

  // ── 4 ──
  const { POSTER_KIT } = await import('@lyceum/ui/kit');
  const { REACT_KIT } = await import('@lyceum/ui/react.kit');
  const { VUE_KIT } = await import('@lyceum/ui/vue.kit');
  const grammar = Object.keys(KIT_PROPS.shape).sort().join();
  check('the DOM kit implements exactly the grammar’s components', Object.keys(POSTER_KIT).sort().join() === grammar);
  check('the React kit implements exactly the grammar’s components', Object.keys(REACT_KIT).sort().join() === grammar);
  check('the Vue kit implements exactly the grammar’s components', Object.keys(VUE_KIT).sort().join() === grammar);

  for (const { screen } of screens) screen.close();
  httpServer.close();
  await close();
  finish();
};

await main();
