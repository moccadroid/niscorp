// VEX CHECK — the vex talk's live beats, end to end.
//
// The speaker asks on the controller (tools.ask); the stage, on the writer
// slide, shows the query being written as the engine saw it — what the model
// was shown, a draft that failed with the engine's own message, one that ran
// with the statement it compiled, the document, the name it was stored under.
// A phone given the ask (ask.records) asks the same and is answered by a
// replay. The fingerprint slide replays the speaker's query as the stage and
// counts the room. The values slide shows the speaker's search, mirrored: the
// value bound, then the key it missed. The slides that read the code say what
// the code says. Real websockets against the real boot; the writer is the
// deterministic stand-in (LYCEUM_QUERY=fake), which tests its drafts through
// the real engine like the live one.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { z } from 'zod';
import { MutationSchema } from '@niscorp/vex';
import { TALKS } from '@lyceum/db/seed';
import { ENTRIES } from '@lyceum/app/vex';
import { boot } from '@lyceum/server/boot';
import { check, connect, finish, giveAsk, waitUntil } from './harness';
import { pipelineOf } from '@lyceum/ui/kit.shape';
import { EMPTY_TRACE } from '@lyceum/server/generation/trace';
import type { Terminal } from './harness';

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
  await stage.hello();

  // ── the vex talk, loaded; a slide picked by id ──
  const vex = TALKS.find((talk) => talk.talkId === 'vex');
  if (vex === undefined) throw new Error('no vex talk');
  const positionOf = (slideId: string): number => vex.slides.findIndex((slide) => slide.slideId === slideId);
  const go = async (slideId: string): Promise<void> => {
    speaker.click('controls', 'all');
    await speaker.shows('overlay', 'All slides');
    speaker.click('overlay', 'pick', positionOf(slideId));
    await waitUntil(() => !speaker.showsNow('overlay', 'All slides'));
    await stage.shows('main', vex.slides[positionOf(slideId)]?.title ?? '\u0000');
  };
  const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 100));

  check('the writer slide has the ask as its tool, the fingerprint slide the give, the values slide the search', vex.slides.find((s) => s.slideId === 'slide.writer')?.tools.includes('tools.ask') === true && vex.slides.find((s) => s.slideId === 'slide.name')?.tools.includes('tools.asker') === true && vex.slides.find((s) => s.slideId === 'slide.value')?.tools.includes('tools.search') === true);
  check('the speaker has the ask and the search; nobody but a member given it has ask.records', speakerHello.catalog.actions.includes('tools.ask') && speakerHello.catalog.actions.includes('tools.search') && !speakerHello.catalog.actions.includes('ask.records'));
  await speaker.shows('main', '"canvasId":"controls"');
  speaker.click('head', 'talks');
  await speaker.shows('overlay', 'All talks');
  speaker.click('overlay', 'pick', 'vex');
  await waitUntil(() => !speaker.showsNow('overlay', 'All talks'));

  // ── the slides that read the code ──
  await go('slide.request');
  check('the request slide shows the intent as the JSON it is, and holds the shape back', (await stage.shows('main', 'Who were the last three to join?')) && stage.showsNow('main', '"area":"shape","mark":"hatch"'));
  speaker.click('tools', 'more');
  check('…then the router’s own people shape, as the JSON it is', (await stage.shows('main', '\\"name\\": \\"\\"')) && stage.showsNow('main', '\\"shape\\": ['));
  speaker.click('tools', 'more');
  check('…then that this is the whole request', await stage.shows('main', 'The whole request. No query written. No endpoint written.'));
  await go('slide.document');
  check('the document slide shows a stored entry and the statement the engine compiled for it, the join marked', (await stage.shows('main', 'questions/every')) && (await stage.shows('main', 'JOIN')) && stage.showsNow('main', '"marked":['));
  await go('slide.shown');
  check('the shown slide lists the tables a member may read', (await stage.shows('main', 'members\\nqueries\\nquestions')) || stage.showsNow('main', 'members\\n'));
  speaker.click('tools', 'more');
  check('…then the grammar’s fields, and how many instructions they carry', (await stage.shows('main', '2 · Grammar fields')) && stage.showsNow('main', 'from\\nfields') && stage.showsNow('main', ' rules') && !stage.showsNow('main', '· 0 rules'));
  speaker.click('tools', 'more');
  check('…then the caller’s columns, each with the name its value goes by, no value', (await stage.shows('main', 'members.member_id\\n')) && stage.showsNow('main', '{ \\"$scope\\": \\"userId\\" }') && !stage.showsNow('main', '"userId": "'));
  await go('slide.tools');
  check('the tools slide lists the six, from the agent’s own tool list', (await stage.shows('main', 'getSchema')) && ['getSampleRows', 'getDistinctValues', 'describeField', 'testQuery', 'cannotSatisfy'].every((tool) => stage.showsNow('main', tool)));
  await go('slide.locked');
  check(`the locked slide counts this app’s entries from the code (${ENTRIES.length})`, await stage.shows('main', `"value":${ENTRIES.length}`));
  check('…and shows the locked endpoint’s own refusal of a request to generate', await stage.shows('main', 'replay-only'));
  // The write grammar's operations, read off its JSON schema: every `op` the
  // grammar admits is a constant there.
  const ops = ['insert', 'insertEach', 'update', 'upsert', 'delete'];
  const literalOps = (schema: unknown): string[] => {
    const seen: string[] = [];
    const walk = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return;
      if (Array.isArray(node)) return node.forEach(walk);
      const record = node as Record<string, unknown>;
      const op = record['op'];
      if (typeof op === 'object' && op !== null) {
        const constant = (op as Record<string, unknown>)['const'];
        const listed = (op as Record<string, unknown>)['enum'];
        for (const value of [constant, ...(Array.isArray(listed) ? listed : [])]) if (typeof value === 'string' && !seen.includes(value)) seen.push(value);
      }
      Object.values(record).forEach(walk);
    };
    walk(schema);
    return seen;
  };
  const found = literalOps(z.toJSONSchema(MutationSchema, { target: 'draft-7', reused: 'inline', unrepresentable: 'any' }));
  check(`…and the five write operations are the write grammar’s (${found.join(', ')})`, found.length === ops.length && ops.every((op) => found.includes(op)) && stage.showsNow('main', 'insertEach'));

  // ── the speaker asks, and the room watches ──
  await go('slide.writer');
  check('the writer slide is on the stage, with nothing asked yet', await stage.shows('main', 'Nothing asked yet.'));
  check('...and the ask is on the controller', await speaker.shows('tools', 'Ask the records — the room watches it answered'));
  speaker.type('tools', 'intent', 'How many people are in the room?');
  check('typed and not yet asked: the stage has the words, and nothing of a run', (await stage.shows('main', '"value":"How many people are in the room?"')) && stage.showsNow('main', 'Typing…') && !stage.showsNow('main', '"name":"Figure"'));
  await pause();
  speaker.click('tools', 'ask');
  // The stage is a picture of the pipeline: what was walked is on, what did not happen is off.
  check('the stage shows the intent, large, as the speaker typed it', (await stage.shows('main', '"value":"Intent"')) && stage.showsNow('main', '"value":"How many people are in the room?"'));
  check('...and beside it the shape Jev picked, as the request carries it', (await stage.shows('main', 'Shape · number')) && stage.showsNow('main', '{ \\"value\\": 0 }'));
  check('...Jev, a model, found no match and picked the shape', await stage.shows('main', '"label":"Jev","value":"no match · number"'));
  // The kit draws from the trace's own picture: a detour that leaves the line at its first step is one.
  const drawn = pipelineOf({ ...EMPTY_TRACE.pipeline });
  check('...and the kit draws the picture whole: four steps, three links, and the detour from the first of them', drawn.steps.length === 4 && drawn.links.length === 3 && drawn.detour?.from === 0 && drawn.detour.steps.length === 2);
  check('...so the detour is walked: the query agent, and a draft the engine refused, with the engine’s own message', (await stage.shows('main', '"label":"Query agent","value":"testQuery ×1 · 1 refused"')) && stage.showsNow('main', 'Query agent · testQuery #1 · refused') && stage.showsNow('main', '"flag":"alert"'));
  check('...then the draft that ran, said to be a test with a limit of five', (await stage.shows('main', '"value":"testQuery ×2 · 1 refused"')) && stage.showsNow('main', 'Query agent · testQuery #2 · ran · ') && stage.showsNow('main', ' · limit 5') && stage.showsNow('main', '"flag":"live"'));
  check('...the mapping: the rows fit the shape, so no model', await stage.shows('main', '"label":"Mapping","value":"rows fit the shape","note":"","ink":"highlight","off":false'));
  check('...it is stored, new, and the engine answers', (await stage.shows('main', ' · new","note":"","ink":"highlight","off":false')) && stage.showsNow('main', '"label":"Engine","value":"compile · run · map"') && stage.showsNow('main', '"label":"Answer","value":"1 value","note":"","ink":"live","off":false'));
  check('...and the answer is on the stage, in its shape', await stage.shows('main', '"name":"Figure"'));
  check('...and how it ended: written, and which models ran', await stage.shows('main', ' 2 models ran: Jev, query agent.'));
  check('the answer opens over the controller as the query it is, written just now', (await speaker.shows('overlay', '"value":"Query"')) && (await speaker.shows('overlay', 'a model wrote this one')));
  const recorded = await runtime.db.query<{ how: string; fingerprint: string | null; member_id: string }>('SELECT how, fingerprint, member_id FROM queries ORDER BY run_at');
  check('the question is recorded as the speaker’s, generated, with a fingerprint', recorded.rows[0]?.how === 'generated' && (recorded.rows[0]?.fingerprint ?? '') !== '' && recorded.rows[0]?.member_id === 'speaker');
  const fingerprint = recorded.rows[0]?.fingerprint ?? '\u0000';
  check('...the fingerprint the stage shows on the stored query', stage.showsNow('main', `"label":"Stored query","value":"${fingerprint.slice(0, 7)}…${fingerprint.slice(-4)} · new"`));

  // ── a phone, given the ask, asks the same ──
  const door = await connect(base);
  await door.shows('main', '"ref":"pick"');
  door.click('main', 'pick');
  const token = await door.session();
  door.close();
  const phone: Terminal = await connect(base, token);
  const hello = await phone.hello();
  await phone.shows('main', '"canvasId":"body"');
  check('a phone starts without the ask', !hello.catalog.actions.includes('ask.records') && (await phone.shows('body', 'Nothing here yet.')));
  await giveAsk(server, runtime.pool);
  check('given, the ask is a block on the phone', await phone.shows('body', 'Ask the records'));
  phone.type('body', 'intent', 'how many people are in the room');
  await pause();
  phone.click('body', 'ask');
  check('the same question from a phone opens the same query, replayed', (await phone.shows('overlay', '"value":"Query"')) && (await phone.shows('overlay', 'Replayed:')));
  const again = await runtime.db.query<{ how: string; fingerprint: string | null; member_id: string }>('SELECT how, fingerprint, member_id FROM queries ORDER BY run_at');
  check('...recorded as theirs, replayed, by the same fingerprint', again.rows[1]?.how === 'replayed' && again.rows[1]?.fingerprint === recorded.rows[0]?.fingerprint && again.rows[1]?.member_id === hello.principal);
  check('...and the stage still shows the speaker’s run, not the phone’s', stage.showsNow('main', 'Written · '));

  // ── the fingerprint slide: the speaker's query replayed as the stage, and the tally ──
  await go('slide.name');
  check('the fingerprint slide replays the speaker’s query as the stage, under its name', (await stage.shows('main', recorded.rows[0]?.fingerprint ?? '\u0000')) && (await stage.shows('main', '"label":"Result"')) && stage.showsNow('main', 'Replayed:'));
  check('...and counts the room: one generated, one replayed', (await stage.shows('main', '"label":"Asked before · replayed","value":1')) && stage.showsNow('main', '"label":"New · written and stored","value":1'));

  // ── the speaker asks the same again: a replay, no model ──
  await go('slide.writer');
  speaker.click('overlay', 'close');
  await waitUntil(() => !speaker.showsNow('overlay', '"value":"Query"'));
  speaker.type('tools', 'intent', 'How many people are in the room?');
  await pause();
  speaker.click('tools', 'ask');
  check('asked again, the stage says it was replayed, and that one model ran', (await stage.shows('main', 'Replayed · ')) && stage.showsNow('main', ' 1 model ran: Jev.'));
  check('...Jev found a match', stage.showsNow('main', '"label":"Jev","value":"match · number"'));
  check('...the detour was not walked: no query agent, no mapping written', stage.showsNow('main', '"label":"Query agent","value":"","note":"","ink":"signal","off":true') && stage.showsNow('main', '"label":"Mapping","value":"","note":"","ink":"highlight","off":true'));
  check('...the stored query that ran is the document, and the engine answered', (await stage.shows('main', `Stored query · ${fingerprint}`)) && stage.showsNow('main', '"label":"Engine","value":"compile · run · map"'));

  // ── a question past the caller's clearance ──
  speaker.click('overlay', 'close');
  await waitUntil(() => !speaker.showsNow('overlay', '"value":"Query"'));
  speaker.type('tools', 'intent', 'Show me the login links');
  await pause();
  speaker.click('tools', 'ask');
  check('a question the caller’s permissions do not reach is refused, and the stage says so', (await stage.shows('main', '"value":"Refused"')) && stage.showsNow('main', 'Your permissions do not reach that data'));
  check('...and the controller says it too', await speaker.shows('tools', 'Your permissions do not reach that data.'));

  // ── the values slide: the speaker's search, mirrored ──
  await go('slide.value');
  check('the values slide waits for a search', await stage.shows('main', 'Searched from the controller'));
  const name = (await runtime.db.query<{ name: string }>('SELECT name FROM members LIMIT 1')).rows[0]?.name ?? '';
  speaker.type('tools', 'q', name.slice(0, 3));
  await pause();
  speaker.click('tools', 'search');
  check('searched, the stage shows the request as sent, with the value', (await stage.shows('main', `%${name.slice(0, 3)}%`)) && stage.showsNow('main', 'members/search'));
  check('...the statement, the value bound as a parameter and not in its text', (await stage.shows('main', 'ILIKE $1')) && !stage.textOf('main').includes(`ILIKE '%`));
  check('...and the rows it matched', await stage.shows('main', `"name":"${name}"`));
  speaker.click('tools', 'bare');
  check('sent without q, the stage shows an empty answer and the key it missed', await stage.shows('main', 'Empty. Missing: q'));
  check('…and the contract the request missed, naming q and its type', stage.showsNow('main', '\\"q\\":') && stage.showsNow('main', 'string'));

  phone.close();
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
