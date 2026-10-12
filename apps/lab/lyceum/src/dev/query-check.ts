import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { queriesTally } from '@lyceum/app/vex/query.entries';
import { QUERY_SHAPES } from '@lyceum/app/vex/query.shapes';
import { answerLayout } from '@lyceum/app/actions/shared/answer.layouts';
import { boot } from '@lyceum/server/boot';
import { vexOver, wireAs } from '@lyceum/server/vex-over';
import { check, connect, finish, giveAssistant, waitUntil } from './harness';
import type { Terminal } from './harness';

type Query = { member_id: string; request: string; shape: string; how: string; fingerprint: string | null };

const main = async (): Promise<void> => {
  const { server, runtime, close } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  const stepIn = async (): Promise<{ phone: Terminal; memberId: string }> => {
    const door = await connect(base);
    await door.shows('main', '"ref":"pick"');
    door.click('main', 'pick');
    const token = await door.session();
    door.close();
    const phone = await connect(base, token);
    const hello = await phone.hello();
    await phone.shows('main', '"canvasId":"body"');
    await giveAssistant(server, runtime.pool);
    await phone.shows('main', '"label":"Assistant"');
    await phone.shows('body', 'Can: ');
    return { phone, memberId: hello.principal ?? '' };
  };

  const say = async (phone: Terminal, message: string): Promise<void> => {
    if (phone.showsNow('overlay', '"ref":"close"')) {
      phone.click('overlay', 'close');
      await waitUntil(() => !phone.showsNow('overlay', '"ref":"close"'));
    }
    phone.type('body', 'draft', message);
    await new Promise((resolve) => setTimeout(resolve, 100));
    phone.key('body', 'draft', 'Enter');
    await waitUntil(() => phone.showsNow('body', 'Thinking'));
    await waitUntil(() => !phone.showsNow('body', 'Thinking'));
  };

  const queries = async (): Promise<Query[]> =>
    (await runtime.db.query<Query>('SELECT member_id, request, shape, how, fingerprint FROM queries ORDER BY run_at, query_id')).rows;

  const stageToken = await mintSession(runtime.pool, 'stage', 600_000);
  const tally = async (): Promise<string> => JSON.stringify(await vexOver(wireAs(server, stageToken))(queriesTally.fingerprint));
  check(`before anybody queries, the tally is all zeros — ${await tally()}`, (await tally()) === JSON.stringify({ replayed: 0, generated: 0, refused: 0 }));

  await runtime.db.query("INSERT INTO login_links (token_hash, principal, expires_at) VALUES ('hash_that_must_not_leak', 'speaker', now() + interval '1 hour')");

  const ada = await stepIn();
  check('there is no query tab: vex is not something anybody talks to', !ada.phone.showsNow('main', '"label":"Query"'));
  await say(ada.phone, 'How many people are in the room?');
  check('the assistant runs a vex query, and it opens over the screen', await ada.phone.shows('overlay', '"value":"Query"'));
  check('…as the query it is: its intent, its shape, its fingerprint', ada.phone.showsNow('overlay', 'How many people are in the room?') && ada.phone.showsNow('overlay', 'Shape · number') && ada.phone.showsNow('overlay', 'Fingerprint'));
  check('…with its result, and that a model wrote it just now', (await ada.phone.shows('overlay', '"label":"Result"')) && ada.phone.showsNow('overlay', 'a model wrote this one'));
  const first = (await queries())[0];
  check('it is recorded as generated, with a fingerprint', first?.how === 'generated' && (first.fingerprint ?? '') !== '');
  check('…the fingerprint the screen shows', ada.phone.showsNow('overlay', `"text":"${first?.fingerprint ?? '\u0000'}"`));
  check('…in the caller\'s name, stamped by the engine', first?.member_id === ada.memberId);
  check('…in the shape the router picked (one number)', first?.shape === 'number');
  check('the tally counts it while other ways have none yet', (await tally()) === JSON.stringify({ replayed: 0, generated: 1, refused: 0 }));

  const ben = await stepIn();
  await say(ben.phone, 'how many people are in the room');
  check('the same intent from somebody else opens its query too', await ben.phone.shows('overlay', '"value":"Query"'));
  check('…and it says it was replayed', await ben.phone.shows('overlay', 'Replayed:'));
  const second = (await queries())[1];
  check('it is recorded as replayed', second?.how === 'replayed');
  check('…by the same fingerprint, no new one', second?.fingerprint === first?.fingerprint);
  check('…in the second person\'s name', second?.member_id === ben.memberId);
  check('the replay is a fresh result, not the first one cached', await ben.phone.shows('overlay', '"value":2'));

  await say(ben.phone, 'Show me the login links');
  const refusedQuery = (await queries())[2];
  check('an intent past the caller\'s clearance is refused, and recorded with no fingerprint', refusedQuery?.how === 'refused' && refusedQuery.fingerprint === null);
  check('…nothing opens over the screen', !ben.phone.showsNow('overlay', '"value":"Query"'));
  check('…and nothing of what it reached for reaches the phone', !ben.phone.textOf('body').includes('hash_that_must_not_leak') && !ben.phone.textOf('overlay').includes('hash_that_must_not_leak'));

  const counted = await tally();
  check(`the projector counts them — ${counted}`, counted === JSON.stringify({ replayed: 1, generated: 1, refused: 1 }));

  const branches = JSON.stringify(answerLayout({ kind: '$k', how: '$h', rows: '$r' }));
  for (const { kind } of QUERY_SHAPES) check(`the answer layout has a branch for "${kind}"`, branches.includes(JSON.stringify({ $eq: ['$k', kind] })));
  await say(ada.phone, 'How many questions has each person sent?');
  check('a count per group is shown with its own columns', await ada.phone.shows('overlay', '"label":"Group"'));

  ada.phone.close();
  ben.phone.close();
  httpServer.close();
  await close();
  finish();
};

await main();
