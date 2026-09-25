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
import { z } from 'zod';
import { CHARTER } from '@lyceum/app/charter/charter';
import { HOUSES } from '@lyceum/db/seed';
import { boot } from '@lyceum/server/boot';

const results: { label: string; ok: boolean }[] = [];
const check = (label: string, ok: boolean): void => {
  results.push({ label, ok });
  console.log(`${ok ? '[pass]' : '[fail]'} ${label}`);
};

const MessageSchema = z.looseObject({ type: z.string() });
const HelloSchema = z.object({ type: z.literal('hello'), principal: z.string().nullable(), catalog: z.object({ actions: z.array(z.string()) }) });
const SessionSchema = z.object({ type: z.literal('session'), token: z.string() });
const RenderSchema = z.object({ type: z.literal('render'), canvas: z.string(), tree: z.unknown() });

type Terminal = {
  hello: () => Promise<z.infer<typeof HelloSchema>>;
  // Resolves when the newest tree on `canvas` contains `text`.
  shows: (canvas: string, text: string) => Promise<boolean>;
  showsNow: (canvas: string, text: string) => boolean;
  session: () => Promise<string>;
  click: (canvas: string, ref: string) => void;
  sessionsSeen: () => number;
  isOpen: () => boolean;
  close: () => void;
};

const WAIT_MS = 8000;

const waitUntil = async (condition: () => boolean): Promise<boolean> => {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return condition();
};

const connect = (base: string, token?: string): Promise<Terminal> =>
  new Promise((resolveTerminal, reject) => {
    const socket = new WebSocket(`${base}/socket${token === undefined ? '' : `?token=${encodeURIComponent(token)}`}`);
    const trees = new Map<string, string>();
    let hello: z.infer<typeof HelloSchema> | undefined;
    const sessions: string[] = [];
    let open = false;

    socket.addEventListener('message', (event) => {
      const message = MessageSchema.parse(JSON.parse(String(event.data)));
      const asHello = HelloSchema.safeParse(message);
      if (asHello.success) hello = asHello.data;
      const asSession = SessionSchema.safeParse(message);
      if (asSession.success) sessions.push(asSession.data.token);
      const asRender = RenderSchema.safeParse(message);
      if (asRender.success) trees.set(asRender.data.canvas, JSON.stringify(asRender.data.tree));
    });
    socket.addEventListener('close', () => {
      open = false;
    });
    socket.addEventListener('error', () => reject(new Error('socket error')));
    socket.addEventListener('open', () => {
      open = true;
      resolveTerminal({
        hello: async () => {
          await waitUntil(() => hello !== undefined);
          if (hello === undefined) throw new Error('no hello');
          return hello;
        },
        shows: (canvas, text) => waitUntil(() => (trees.get(canvas) ?? '').includes(text)),
        showsNow: (canvas, text) => (trees.get(canvas) ?? '').includes(text),
        session: async () => {
          await waitUntil(() => sessions.length > 0);
          const [first] = sessions;
          if (first === undefined) throw new Error('no session granted');
          return first;
        },
        click: (canvas, ref) => socket.send(JSON.stringify({ type: 'event', canvas, event: { type: 'ui:click', ref } })),
        sessionsSeen: () => sessions.length,
        isOpen: () => open,
        close: () => socket.close(),
      });
    });
  });

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

  const failed = results.filter((result) => !result.ok).length;
  console.log(failed === 0 ? `OK — ${results.length} assertions` : `FAIL — ${failed} of ${results.length} assertions`);
  process.exit(failed === 0 ? 0 : 1);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
