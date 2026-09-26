// DECK CHECK — the talk's state is one row, and the projector follows it.
//
// The speaker's controller moves the deck; the stage — a different principal
// on a different device — shows the slide the row names, told by nothing but
// the write. The deck cannot be walked off either end. A live slide counts the
// room as it changes. Real websocket, real boot; the database underneath.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { SLIDES } from '@lyceum/db/seed';
import { boot } from '@lyceum/server/boot';
import { check, connect, finish } from './harness';

const main = async (): Promise<void> => {
  const { server, runtime, close } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  const speaker = await connect(base, await mintSession(runtime.pool, 'speaker', 60_000));
  const stage = await connect(base, await mintSession(runtime.pool, 'stage', 60_000));
  const speakerHello = await speaker.hello();
  const stageHello = await stage.hello();

  // ── the deck's rows and the charter agree ──
  const unheld = SLIDES.filter((slide) => !stageHello.catalog.actions.includes(slide.slideId));
  check(`every slide in the deck is an action the stage holds${unheld.length === 0 ? '' : ` (missing: ${unheld.map((s) => s.slideId).join(', ')})`}`, unheld.length === 0);
  check('the speaker holds no slide — the controller moves the deck, it does not show it', !SLIDES.some((slide) => speakerHello.catalog.actions.includes(slide.slideId)));

  const total = SLIDES.length;
  const titleOf = (index: number): string => SLIDES[index]?.title ?? '';
  const onSlide = async (index: number): Promise<boolean> =>
    (await speaker.shows('main', `Slide ${index + 1} / ${total} — ${titleOf(index)}`)) && (await stage.shows('main', titleOf(index)));

  // ── the first slide, and no way back from it ──
  check('the stage and the controller open on the first slide', await onSlide(0));
  speaker.click('main', 'back');
  check('back on the first slide stays there', await onSlide(0));

  // ── forward through the deck, and no way past its end ──
  for (let index = 1; index < total; index += 1) {
    speaker.click('main', 'next');
    check(`next shows slide ${index + 1} on the stage (${titleOf(index)})`, await onSlide(index));
  }
  speaker.click('main', 'next');
  check('next on the last slide stays there', await onSlide(total - 1));

  const row = await runtime.db.query<{ slide_id: string }>('SELECT slide_id FROM deck');
  check('the row holds what the stage shows', row.rows[0]?.slide_id === SLIDES[total - 1]?.slideId);

  // ── a live slide follows the room ──
  const live = SLIDES.findIndex((slide) => slide.slideId === 'slide.live');
  speaker.click('main', 'back');
  check('back shows the slide before it', await onSlide(live));
  check('the live slide counts an empty room', await stage.shows('main', '0 in the room'));

  const stranger = await connect(base);
  await stranger.hello();
  stranger.click('main', 'enter');
  await stranger.session();
  check('somebody stepping in reaches the slide on the stage, unannounced', await stage.shows('main', '1 in the room'));

  stranger.close();
  speaker.close();
  stage.close();
  httpServer.close();
  await close();
  finish();
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
