// DECK CHECK — the talk's state is one row, and the projector follows it.
//
// The speaker's controller moves the deck; the stage — a different principal
// on a different device — shows the slide the row names, told by nothing but
// the write. The deck cannot be walked off either end. A live slide counts the
// room as it changes. Real websocket, real boot; the database underneath.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { SLIDES, buildSeedSql } from '@lyceum/db/seed';
import { CUE_TOOLS } from '@lyceum/app/actions/tools/cue.actions';
import { createCensus } from '@lyceum/server/census';
import { CHECKS } from './suite';
import { boot } from '@lyceum/server/boot';
import { check, connect, finish, waitUntil } from './harness';

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
  check(`every slide in the deck is an action the stage is granted${unheld.length === 0 ? '' : ` (missing: ${unheld.map((s) => s.slideId).join(', ')})`}`, unheld.length === 0);
  check('the speaker is granted no slide — the controller moves the deck, it does not show it', !SLIDES.some((slide) => speakerHello.catalog.actions.includes(slide.slideId)));
  const tools = SLIDES.flatMap((slide) => slide.tools);
  check('every slide\'s tools are actions the speaker is granted, and the stage is not', tools.every((toolId) => speakerHello.catalog.actions.includes(toolId) && !stageHello.catalog.actions.includes(toolId)));

  const total = SLIDES.length;
  const titleOf = (index: number): string => SLIDES[index]?.title ?? '';
  const onSlide = async (index: number): Promise<boolean> =>
    (await speaker.shows('head', `slide ${index + 1} of ${total}`)) && (await speaker.shows('head', titleOf(index))) && (await stage.shows('main', titleOf(index)));

  // What each tool says, so the tool region can be read: exactly a slide's
  // tools, in the slide's order — or, with none, that there are none.
  // A cue says its own title.
  const SAYS: Record<string, string> = {
    'assistant.thread': 'Built from',
    'tools.look': 'Renderers — the same trees',
    'tools.xray': 'X-ray — everybody’s own screen',
    ...Object.fromEntries(CUE_TOOLS.map((cue) => [cue.id, cue.title])),
  };
  const toolsAre = (expected: readonly string[]): Promise<boolean> =>
    waitUntil(() => {
      const shown = Object.keys(SAYS).filter((tool) => speaker.showsNow('tools', SAYS[tool] ?? '\u0000'));
      const order = [...shown].sort((a, b) => speaker.textOf('tools').indexOf(SAYS[a] ?? '') - speaker.textOf('tools').indexOf(SAYS[b] ?? ''));
      const none = speaker.showsNow('tools', 'Nothing to press on this slide');
      return expected.length === 0 ? none && shown.length === 0 : !none && JSON.stringify(order) === JSON.stringify(expected);
    });

  // ── the controller: four regions, on the speaker's screen only ──
  const regions = ['head', 'tools', 'notes', 'controls'];
  check('the controller places its four regions itself', await waitUntil(() => regions.every((region) => speaker.showsNow('main', `"canvasId":"${region}"`))));
  check('none of them exists for the stage', !['speaker.console', 'speaker.head', 'speaker.notes', 'speaker.controls'].some((id) => stageHello.catalog.actions.includes(id)));
  // (A slide without a tool says so rather than leave a hole — asserted per
  // slide in the walk below, where `toolsAre([])` wants the hatch.)
  check('the first slide has its tools on the controller', await toolsAre(SLIDES[0]?.tools ?? []));

  // ── the way in: the first slide's code and address, the strip's address ──
  check('the first slide carries the code to scan, saying the room\'s address', await stage.shows('main', '"name":"Qr"') && stage.showsNow('main', '"value":"http://localhost:8796"'));
  check('...and the address in words, for typing', stage.showsNow('main', 'localhost:8796'));
  check('the strip shows the address on every slide, for whoever arrives late', await stage.shows('strip', 'localhost:8796'));

  // ── the first slide, and no way back from it ──
  check('the stage and the controller open on the first slide', await onSlide(0));
  check('Next says which slide it goes to', await speaker.shows('controls', `2 · ${titleOf(1)} →`));
  check('Back on the first slide says so', await speaker.shows('controls', 'Start of the deck'));
  speaker.click('controls', 'back');
  check('back on the first slide stays there', await onSlide(0));

  // ── forward through the deck, and no way past its end ──
  for (let index = 1; index < total; index += 1) {
    speaker.click('controls', 'next');
    check(`next shows slide ${index + 1} on the stage (${titleOf(index)})`, await onSlide(index));
    check(`...and its notes on the controller`, await speaker.shows('notes', SLIDES[index]?.notes[0] ?? '\u0000'));
    if (SLIDES[index]?.slideId === 'slide.census') {
      const counted = await createCensus()();
      check(`...and the census is counted from the source (${counted.data} lines of data, ${counted.code} of code, ${counted.share}%, ${counted.checks} checks)`, counted.data > 0 && counted.code > 0 && counted.checks === CHECKS.length && (await stage.shows('main', `"value":${counted.data}`)) && stage.showsNow('main', `"value":${counted.share}`));
    }
    if (SLIDES[index]?.slideId === 'stage.register') check('...and the register carries the code to scan while the room arrives', await stage.shows('main', '"name":"Qr"') && stage.showsNow('main', '"value":"http://localhost:8796"'));
    check(`...and exactly its tools, in order (${(SLIDES[index]?.tools ?? []).join(', ') || 'none'})`, await toolsAre(SLIDES[index]?.tools ?? []));
  }
  speaker.click('controls', 'next');
  check('next on the last slide stays there', await onSlide(total - 1));
  check('Back says which slide it goes to', await speaker.shows('controls', `← ${total - 1} · ${titleOf(total - 2)}`));
  check('Next on the last slide says so', await speaker.shows('controls', 'End of the deck'));

  const row = await runtime.db.query<{ slide_id: string }>('SELECT slide_id FROM deck');
  check('the row is what the stage shows', row.rows[0]?.slide_id === SLIDES[total - 1]?.slideId);

  // ── all slides, over the controller: any slide, straight away ──
  const pick = async (position: number): Promise<void> => {
    speaker.click('controls', 'all');
    await speaker.shows('overlay', 'All slides');
    speaker.click('overlay', 'pick', position);
  };
  await pick(2);
  check('picking a slide from all slides puts it on the stage', await onSlide(2));
  check('...and the list closes', await waitUntil(() => !speaker.showsNow('overlay', 'All slides')));
  await pick(total - 1);
  check('...any slide, in any order', await onSlide(total - 1));
  await pick(total + 5);
  check('a pick past the end stays on the last slide', await onSlide(total - 1));
  speaker.click('controls', 'all');
  await speaker.shows('overlay', 'All slides');
  speaker.click('overlay', 'close');
  check('Close shuts the list and changes nothing', (await waitUntil(() => !speaker.showsNow('overlay', 'All slides'))) && (await onSlide(total - 1)));

  // ── a live slide follows the room ──
  speaker.click('controls', 'back');
  check('back shows the slide before it', await onSlide(total - 2));
  const live = SLIDES.findIndex((slide) => slide.slideId === 'stage.register');
  await pick(live);
  check('the register is on the stage', await onSlide(live));
  check('the register counts an empty room', await stage.shows('main', '"label":"Joined","value":0'));

  const stranger = await connect(base);
  await stranger.hello();
  stranger.click('main', 'enter');
  await stranger.session();
  check('somebody joining reaches the slide on the stage, unannounced', await stage.shows('main', '"label":"Joined","value":1'));

  // ── the seed converges the deck on a live database, and leaves the talk ──
  // A database from an older version of SLIDES: a renamed slide, two swapped,
  // one that is no longer in the deck — and on screen.
  const dataAt = SLIDES.findIndex((slide) => slide.slideId === 'slide.data');
  const clearanceAt = SLIDES.findIndex((slide) => slide.slideId === 'slide.clearance');
  await runtime.db.exec(`
    UPDATE slides SET title = 'An old title' WHERE slide_id = 'slide.title';
    UPDATE slides SET position = 100 WHERE slide_id = 'slide.data';
    UPDATE slides SET position = ${dataAt} WHERE slide_id = 'slide.clearance';
    UPDATE slides SET position = ${clearanceAt} WHERE slide_id = 'slide.data';
    INSERT INTO slides (slide_id, position, title) VALUES ('slide.gone', 99, 'Cut from the talk');
    UPDATE deck SET slide_id = 'slide.gone';
  `);
  const membersBefore = await runtime.db.query<{ n: number }>('SELECT count(*)::int AS n FROM members');
  await runtime.db.exec(buildSeedSql());
  await runtime.db.exec(buildSeedSql());
  const slides = await runtime.db.query<{ slide_id: string; title: string }>('SELECT slide_id, title FROM slides ORDER BY position');
  check(
    'a re-run seed puts the deck back to what SLIDES says — order, titles, nothing extra',
    JSON.stringify(slides.rows.map((r) => [r.slide_id, r.title])) === JSON.stringify(SLIDES.map((s) => [s.slideId, s.title])),
  );
  const deckRow = await runtime.db.query<{ slide_id: string }>('SELECT slide_id FROM deck');
  check('a deck left on a slide that was cut goes back to the first', deckRow.rows[0]?.slide_id === SLIDES[0]?.slideId);
  const membersAfter = await runtime.db.query<{ n: number }>('SELECT count(*)::int AS n FROM members');
  check('the room is left alone', membersBefore.rows[0]?.n === 1 && membersAfter.rows[0]?.n === 1);

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
