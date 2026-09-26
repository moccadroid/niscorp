// SORTING CHECK — the claim the whole talk stands on: a role change reaches a
// phone that is already connected, with no reload and no second sign-in.
//
// Everything here goes through a REAL websocket against the real boot: a
// stranger steps in and receives a session; the speaker and the stage are
// signed in with the same credential; the speaker sorts the room; and the
// member's socket — the one opened before the sorting, never reconnected —
// receives its house. The database is the ground truth underneath.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { CHARTER } from '@lyceum/app/charter/charter';
import { HOUSES } from '@lyceum/db/seed';
import { boot } from '@lyceum/server/boot';
import { check, connect, finish, waitUntil } from './harness';

const main = async (): Promise<void> => {
  // ── the charter and the houses agree: a house_id IS a role ──
  for (const house of HOUSES) check(`house "${house.houseId}" is a charter role`, CHARTER[house.houseId] !== undefined);

  const { server, runtime, close } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  // ── a stranger arrives: the door is the whole application ──
  const stranger = await connect(base);
  const strangerHello = await stranger.hello();
  check('an anonymous connection is the public principal', strangerHello.principal === null);
  check(`the door is all that exists for them (${strangerHello.catalog.actions.join(', ')})`, strangerHello.catalog.actions.join() === 'door.join');
  check('the door renders', await stranger.shows('main', 'Step in'));

  // ── stepping in grants a real session ──
  stranger.click('main', 'enter');
  const memberToken = await stranger.session();
  check('stepping in hands the terminal a session', memberToken.startsWith('st_'));
  stranger.close();

  // ── the same person, reconnected as themselves: unsorted ──
  const member = await connect(base, memberToken);
  const memberHello = await member.hello();
  const memberId = memberHello.principal ?? '';
  check(`they are now a principal of their own (${memberId})`, memberId.startsWith('m_'));
  check('they hold the member card', memberHello.catalog.actions.includes('member.card'));
  check('the house crest does not exist for them yet', !memberHello.catalog.actions.includes('house.crest'));
  check('their card says they are not yet sorted', await member.shows('main', 'Not yet sorted'));

  // ── the speaker and the stage, signed in with the same credential ──
  const speaker = await connect(base, await mintSession(runtime.pool, 'speaker', 60_000));
  const speakerHello = await speaker.hello();
  check('the speaker holds the controller', speakerHello.catalog.actions.includes('speaker.console'));
  check('the speaker holds nothing of the room', !speakerHello.catalog.actions.includes('member.card'));
  check('the controller counts the room', await speaker.shows('main', '1 joined · 0 sorted'));

  const stage = await connect(base, await mintSession(runtime.pool, 'stage', 60_000));
  const stageHello = await stage.hello();
  check('the stage holds the roster and no controls', stageHello.catalog.actions.includes('stage.roster') && !stageHello.catalog.actions.includes('speaker.console'));
  // The projector is the deck now: it opens on the first slide, and the room
  // is the slide after it.
  check('the stage opens on the first slide', await stage.shows('main', 'The talk is an application'));
  speaker.click('main', 'next');
  check('the controller moves the stage to the room', await stage.shows('main', 'The room'));
  check('the roster shows the newcomer', await stage.shows('main', 'Newcomer'));

  // ── the sorting ──
  const sessionsBefore = member.sessionsSeen();
  speaker.click('main', 'sort');

  check('the member\'s open phone receives its house', await member.shows('house', 'You belong to the'));
  check('their card now names the house', await member.shows('main', 'House '));
  check('the phone never reconnected', member.isOpen());
  check('no second sign-in was needed', member.sessionsSeen() === sessionsBefore);

  const placed = await runtime.db.query<{ house_id: string | null }>('SELECT house_id FROM members WHERE member_id = $1', [memberId]);
  const houseId = placed.rows[0]?.house_id ?? null;
  check(`the database placed them in a real house (${String(houseId)})`, houseId !== null && HOUSES.some((house) => house.houseId === houseId));
  const houseName = HOUSES.find((house) => house.houseId === houseId)?.name ?? '';
  check(`the phone shows the house the database holds (${houseName})`, houseName !== '' && member.showsNow('house', houseName));

  check('the controller counts them sorted', await speaker.shows('main', '1 joined · 1 sorted'));
  check('the stage shows their house', await stage.shows('main', houseName));

  // ── a second sorting has nobody left to place ──
  const secondSort = await waitUntil(() => speaker.showsNow('main', 'Sort the room'));
  check('the controller is ready again', secondSort);

  member.close();
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
