import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { TALKS, buildSeedSql } from '@lyceum/db/seed';
import type { Talk } from '@lyceum/db/talks';
import { CUE_TOOLS } from '@lyceum/app/actions/tools/cue.actions';
import { createCensus } from '@lyceum/server/census';
import { CHECKS } from './suite';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { strataSlide } from '@lyceum/app/actions/slide/later.actions';
import { boot } from '@lyceum/server/boot';
import { check, connect, finish, waitUntil } from './harness';
import type { Terminal } from './harness';

// The slides that carry the code to scan: the register, in either talk.
const REGISTERS = ['stage.register', 'slide.joined'];

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

  const every = TALKS.flatMap((talk) => talk.slides);
  const unheld = every.filter((slide) => !stageHello.catalog.actions.includes(slide.slideId));
  check(`every slide of every talk is an action the stage is granted${unheld.length === 0 ? '' : ` (missing: ${unheld.map((s) => s.slideId).join(', ')})`}`, unheld.length === 0);
  check('the speaker is granted no slide — the controller moves the deck, it does not show it', !every.some((slide) => speakerHello.catalog.actions.includes(slide.slideId)));
  const tools = every.flatMap((slide) => slide.tools);
  check('every slide\'s tools are actions the speaker is granted', tools.every((toolId) => speakerHello.catalog.actions.includes(toolId)));
  check('the controller\'s own tools (tools.*) are not the stage\'s', tools.filter((toolId) => toolId.startsWith('tools.')).every((toolId) => !stageHello.catalog.actions.includes(toolId)));
  check('a slide is in one talk', new Set(every.map((slide) => slide.slideId)).size === every.length);

  const SAYS: Record<string, string> = {
    'assistant.thread': 'Can: ',
    'tools.look': 'Which renderer draws',
    'tools.xray': 'X-ray — everybody’s own screen',
    'tools.integrations': 'Integrations — somebody else’s screen',
    'tools.applause': 'Applause — somebody else’s screen',
    'tools.button': 'The button — an action only some people have',
    'tools.assistant': 'The assistant — on everybody’s phone',
    'tools.asker': 'The ask — on everybody’s phone',
    'tools.ask': 'Ask the records — the room watches it answered',
    'tools.search': 'Search the room — a value in the request',
    'tools.step': 'This slide, in steps',
    'tools.form-ask': 'Ask the model for a layout',
    'tools.screens-give': 'The framework bar — on everybody’s phone',
    'tools.form-broken': 'A layout with two mistakes',
    'tools.form-type': 'Type into the projector’s form',
    'tools.questions-give': 'The Q&A on everybody’s phone',
    'tools.questions-show': 'Put a question on the screen',
    ...Object.fromEntries(CUE_TOOLS.map((cue) => [cue.id, cue.title])),
  };
  const toolsAre = (expected: readonly string[]): Promise<boolean> =>
    waitUntil(() => {
      const shown = Object.keys(SAYS).filter((tool) => speaker.showsNow('tools', SAYS[tool] ?? '\u0000'));
      const order = [...shown].sort((a, b) => speaker.textOf('tools').indexOf(SAYS[a] ?? '') - speaker.textOf('tools').indexOf(SAYS[b] ?? ''));
      const none = speaker.showsNow('tools', 'Nothing to press on this slide');
      return expected.length === 0 ? none && shown.length === 0 : !none && JSON.stringify(order) === JSON.stringify(expected);
    });

  const regions = ['head', 'tools', 'notes', 'controls'];
  check('the controller places its four regions itself', await waitUntil(() => regions.every((region) => speaker.showsNow('main', `"canvasId":"${region}"`))));
  check('none of them exists for the stage', !['speaker.console', 'speaker.head', 'speaker.notes', 'speaker.controls'].some((id) => stageHello.catalog.actions.includes(id)));
  const [first] = TALKS;
  if (first === undefined) throw new Error('no talks');
  check('the first slide has its tools on the controller', await toolsAre(first.slides[0]?.tools ?? []));

  check('the first slide carries the code to scan, saying the room\'s address', await stage.shows('main', '"name":"Qr"') && stage.showsNow('main', '"value":"http://localhost:8796"'));
  check('...and the address in words, for typing', stage.showsNow('main', 'localhost:8796'));
  check('the strip shows the address on every slide, for whoever arrives late', await stage.shows('strip', 'localhost:8796'));

  const pick = async (position: number): Promise<void> => {
    speaker.click('controls', 'all');
    await speaker.shows('overlay', 'All slides');
    speaker.click('overlay', 'pick', position);
    await waitUntil(() => !speaker.showsNow('overlay', 'All slides'));
  };

  // ── one talk, walked end to end ──
  const walk = async (talk: Talk): Promise<void> => {
    const total = talk.slides.length;
    const titleOf = (index: number): string => talk.slides[index]?.title ?? '';
    const onSlide = async (index: number): Promise<boolean> =>
      (await speaker.shows('head', `slide ${index + 1} of ${total}`)) && (await speaker.shows('head', titleOf(index))) && (await stage.shows('main', titleOf(index)));

    check(`${talk.talkId}: the head names the talk`, await speaker.shows('head', talk.title));
    check(`${talk.talkId}: the stage and the controller open on the first slide`, await onSlide(0));
    check('Next says which slide it goes to', await speaker.shows('controls', `2 · ${titleOf(1)} →`));
    check('Back on the first slide says so', await speaker.shows('controls', 'Start of the deck'));
    speaker.click('controls', 'back');
    check('back on the first slide stays there', await onSlide(0));

    // ── forward through the deck, and no way past its end ──
    for (let index = 1; index < total; index += 1) {
      speaker.click('controls', 'next');
      check(`next shows slide ${index + 1} on the stage (${titleOf(index)})`, await onSlide(index));
      check(`...and its notes on the controller`, await speaker.shows('notes', talk.slides[index]?.notes[0] ?? '\u0000'));
      if (talk.slides[index]?.slideId === 'slide.census') {
        const counted = await createCensus()();
        check(`...and the census is counted from the source (${counted.data} lines of data, ${counted.code} of code, ${counted.share}%, ${counted.checks} checks)`, counted.data > 0 && counted.code > 0 && counted.checks === CHECKS.length && (await stage.shows('main', `"value":${counted.data}`)) && stage.showsNow('main', `"value":${counted.share}`));
      }
      if (REGISTERS.includes(talk.slides[index]?.slideId ?? '')) check('...and the register carries the code to scan while the room arrives', await stage.shows('main', '"name":"Qr"') && stage.showsNow('main', '"value":"http://localhost:8796"'));
      check(`...and exactly its tools, in order (${(talk.slides[index]?.tools ?? []).join(', ') || 'none'})`, await toolsAre(talk.slides[index]?.tools ?? []));
    }
    speaker.click('controls', 'next');
    check('next on the last slide stays there', await onSlide(total - 1));
    check('Back says which slide it goes to', await speaker.shows('controls', `← ${total - 1} · ${titleOf(total - 2)}`));
    check('Next on the last slide says so', await speaker.shows('controls', 'End of the deck'));

    const row = await runtime.db.query<{ talk_id: string; slide_id: string }>('SELECT talk_id, slide_id FROM deck');
    check('the row is what the stage shows, talk and slide', row.rows[0]?.slide_id === talk.slides[total - 1]?.slideId && row.rows[0]?.talk_id === talk.talkId);

    await pick(2);
    check(`${talk.talkId}: picking a slide from all slides puts it on the stage, and the list closes`, await onSlide(2));
    await pick(total - 1);
    check('...any slide, in any order', await onSlide(total - 1));
    await pick(total + 5);
    check('a pick past the end stays on the last slide', await onSlide(total - 1));
    speaker.click('controls', 'all');
    await speaker.shows('overlay', 'All slides');
    check(`${talk.talkId}: all slides lists this talk's slides and no other's`, talk.slides.every((slide) => speaker.showsNow('overlay', slide.title)) && !TALKS.filter((other) => other !== talk).some((other) => other.slides.some((slide) => !talk.slides.some((own) => own.title.includes(slide.title)) && speaker.showsNow('overlay', slide.title))));
    speaker.click('overlay', 'close');
    check(`${talk.talkId}: Close shuts the list and changes nothing`, (await waitUntil(() => !speaker.showsNow('overlay', 'All slides'))) && (await onSlide(total - 1)));

    speaker.click('controls', 'back');
    check('back shows the slide before it', await onSlide(total - 2));
  };

  const load = async (talk: Talk): Promise<void> => {
    speaker.click('head', 'talks');
    await speaker.shows('overlay', 'All talks');
    check('All talks lists every talk', TALKS.every((each) => speaker.showsNow('overlay', each.title)));
    speaker.click('overlay', 'pick', talk.talkId);
    check(`picking "${talk.title}" closes the list`, await waitUntil(() => !speaker.showsNow('overlay', 'All talks')));
  };

  for (const [index, talk] of TALKS.entries()) {
    if (index > 0) await load(talk);
    await walk(talk);
  }

  const last = TALKS.find((talk) => talk.slides.some((slide) => REGISTERS.includes(slide.slideId)));
  if (last === undefined) throw new Error('no talk has the register');
  await load(last);
  const live = last.slides.findIndex((slide) => REGISTERS.includes(slide.slideId));
  await pick(live);
  check('the register is on the stage', await stage.shows('main', last.slides[live]?.title ?? '\u0000'));
  check('the register counts an empty room', await stage.shows('main', '"label":"Joined","value":0'));

  const stranger: Terminal = await connect(base);
  await stranger.hello();
  stranger.click('main', 'pick');
  await stranger.session();
  check('somebody joining reaches the slide on the stage, unannounced', await stage.shows('main', '"label":"Joined","value":1'));

  const dataAt = first.slides.findIndex((slide) => slide.slideId === 'slide.data');
  const xrayAt = first.slides.findIndex((slide) => slide.slideId === 'slide.xray');
  await runtime.db.exec(`
    UPDATE slides SET title = 'An old title' WHERE slide_id = 'slide.title';
    UPDATE slides SET position = 100 WHERE slide_id = 'slide.data';
    UPDATE slides SET position = ${dataAt} WHERE slide_id = 'slide.xray';
    UPDATE slides SET position = ${xrayAt} WHERE slide_id = 'slide.data';
    INSERT INTO slides (slide_id, talk_id, position, title) VALUES ('slide.gone', '${last.talkId}', 99, 'Cut from the talk');
    UPDATE deck SET slide_id = 'slide.gone';
  `);
  const membersBefore = await runtime.db.query<{ n: number }>('SELECT count(*)::int AS n FROM members');
  await runtime.db.exec(buildSeedSql());
  await runtime.db.exec(buildSeedSql());
  const slides = await runtime.db.query<{ talk_id: string; slide_id: string; title: string }>('SELECT s.talk_id, s.slide_id, s.title FROM slides s JOIN talks t ON t.talk_id = s.talk_id ORDER BY t.position, s.position');
  check(
    'a re-run seed puts every deck back to what the data says — talks, order, titles, nothing extra',
    JSON.stringify(slides.rows.map((r) => [r.talk_id, r.slide_id, r.title])) === JSON.stringify(TALKS.flatMap((talk) => talk.slides.map((s) => [talk.talkId, s.slideId, s.title]))),
  );
  const deckRow = await runtime.db.query<{ talk_id: string; slide_id: string }>('SELECT talk_id, slide_id FROM deck');
  check('a deck left on a slide that was cut goes back to the first slide of the talk that is on', deckRow.rows[0]?.talk_id === last.talkId && deckRow.rows[0]?.slide_id === last.slides[0]?.slideId);
  const membersAfter = await runtime.db.query<{ n: number }>('SELECT count(*)::int AS n FROM members');
  check('the room is left alone', membersBefore.rows[0]?.n === 1 && membersAfter.rows[0]?.n === 1);

  const lock = z.object({ grammar: z.record(z.string(), z.number()) }).parse(JSON.parse(readFileSync(new URL('../../strata.lock.json', import.meta.url), 'utf8')));
  const listed = z.array(z.object({ n: z.number(), what: z.string() })).parse(strataSlide.data?.['migrations'] ?? []);
  check(`the Strata slide lists every migration of the kit's grammar (${listed.length})`, listed.length > 0 && listed.length === lock.grammar['lyceum.kit']);

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
