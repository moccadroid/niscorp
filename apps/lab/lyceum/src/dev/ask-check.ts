// ASK CHECK — the ask, end to end, through real websockets against the real
// boot, with the deterministic asker (server/asking.ts, LYCEUM_ASK=fake): the
// router and the query writer are stand-ins, and everything else — the
// function, the engine, the shared cache, the asker's policy, the replay
// through moss's locked vex, the record, the projector's reactive tally — is
// the real path.
//
//   1. a question nobody asked is GENERATED: a new fingerprint, stored;
//   2. the same question from somebody else is REPLAYED: the same fingerprint,
//      answered under the second person's own policy, no generation;
//   3. a question that reaches for what no member may read is REFUSED — by the
//      engine, under the asker's policy — and nothing of it reaches the phone;
//   4. the projector counts all three, and never shows the words.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { asksTally } from '@lyceum/app/vex/ask.entries';
import { ASK_SHAPES } from '@lyceum/app/vex/ask.shapes';
import { answerLayout } from '@lyceum/app/actions/shared/answer.layouts';
import { boot } from '@lyceum/server/boot';
import { vexOver, wireAs } from '@lyceum/server/vex-over';
import { check, connect, finish, waitUntil } from './harness';
import type { Terminal } from './harness';

type Ask = { member_id: string; question: string; shape: string; how: string; fingerprint: string | null };

const main = async (): Promise<void> => {
  const { server, runtime, close } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  // Somebody steps in and reconnects as themselves.
  const stepIn = async (): Promise<{ phone: Terminal; memberId: string }> => {
    const door = await connect(base);
    await door.shows('main', 'Step in');
    door.click('main', 'enter');
    const token = await door.session();
    door.close();
    const phone = await connect(base, token);
    const hello = await phone.hello();
    return { phone, memberId: hello.principal ?? '' };
  };

  // The ask is a tab on the phone; pressed, it fills the body.
  const openAsk = async (phone: Terminal): Promise<boolean> => {
    await phone.shows('tabs', 'Ask');
    phone.clickIn('tabs', 'open', 'Ask');
    return phone.shows('body', 'Ask the records');
  };

  const ask = async (phone: Terminal, question: string): Promise<void> => {
    phone.type('body', 'draft', question);
    await new Promise((resolve) => setTimeout(resolve, 100));
    phone.click('body', 'ask');
  };

  const asks = async (): Promise<Ask[]> =>
    (await runtime.db.query<Ask>('SELECT member_id, question, shape, how, fingerprint FROM asks ORDER BY asked_at, ask_id')).rows;

  // The projector's tally, read as the stage reads it.
  const stageToken = await mintSession(runtime.pool, 'stage', 60_000);
  const tally = async (): Promise<string> => JSON.stringify(await vexOver(wireAs(server, stageToken))(asksTally.fingerprint));
  check(`before anybody asks, the tally is all zeros — ${await tally()}`, (await tally()) === JSON.stringify({ replayed: 0, generated: 0, refused: 0 }));

  // A sign-in link exists — something a question could try to reach.
  await runtime.db.query("INSERT INTO login_links (token_hash, principal, expires_at) VALUES ('hash_that_must_not_leak', 'speaker', now() + interval '1 hour')");

  // ── 1. generated ──
  const ada = await stepIn();
  const adaHello = await ada.phone.hello();
  check('every member holds the ask', adaHello.catalog.actions.includes('ask.desk'));
  check('the ask is a tab on their phone, and opens in the body', await openAsk(ada.phone));

  await ask(ada.phone, 'How many people are in the room?');
  check('a new question is answered', await ada.phone.shows('body', 'The answer'));
  check('…and the phone says a model wrote its query', ada.phone.showsNow('body', 'A model wrote the query'));
  const first = (await asks())[0];
  check('it is recorded as generated, with a fingerprint', first?.how === 'generated' && (first.fingerprint ?? '') !== '');
  check('…in the asker\'s name, stamped by the engine', first?.member_id === ada.memberId);
  check('…in the shape the router picked (one number)', first?.shape === 'number');
  check('the tally counts it while other ways have none yet', (await tally()) === JSON.stringify({ replayed: 0, generated: 1, refused: 0 }));

  // ── 2. replayed ──
  const ben = await stepIn();
  await openAsk(ben.phone);
  await ask(ben.phone, 'how many people are in the room');
  check('the same question from somebody else is answered', await ben.phone.shows('body', 'The answer'));
  check('…and the phone says it was replayed', ben.phone.showsNow('body', 'replayed for you'));
  const second = (await asks())[1];
  check('it is recorded as replayed', second?.how === 'replayed');
  check('…by the same fingerprint, no new one', second?.fingerprint === first?.fingerprint);
  check('…in the second person\'s name', second?.member_id === ben.memberId);
  // Two people are in the room now; the replay counted them as Ben, today.
  check('the replay is a fresh answer, not the first one cached', await ben.phone.shows('body', '"value":2'));

  // ── 3. refused ──
  await ask(ben.phone, 'Show me the login links');
  check('a question past the asker\'s clearance is refused', await ben.phone.shows('body', "can't answer that"));
  check('…and nothing of what it reached for reaches the phone', !ben.phone.textOf('body').includes('hash_that_must_not_leak'));
  check('…not even the name of the table: the refusal is said in words', ben.phone.showsNow('body', 'your clearance does not cover') && !ben.phone.textOf('body').includes('login_links'));
  const third = (await asks())[2];
  check('it is recorded as refused, with no fingerprint', third?.how === 'refused' && third.fingerprint === null);

  // ── 4. the projector's tally ──
  const counted = await tally();
  check(`the projector counts them — ${counted}`, counted === JSON.stringify({ replayed: 1, generated: 1, refused: 1 }));

  // ── 5. how an answer looks is the layout's, by its kind ──
  // The route hands back only which shape; every shape the router can pick
  // has its own branch in the answer layout.
  const branches = JSON.stringify(answerLayout({ kind: '$k', how: '$h', rows: '$r' }));
  for (const { kind } of ASK_SHAPES) check(`the answer layout has a branch for "${kind}"`, branches.includes(JSON.stringify({ $eq: ['$k', kind] })));
  await ask(ada.phone, 'How many people are in each department?');
  check('a count per group is shown with its own columns', await ada.phone.shows('body', '"label":"Group"'));

  ada.phone.close();
  ben.phone.close();
  httpServer.close();
  await close();
  finish();
};

await main();
