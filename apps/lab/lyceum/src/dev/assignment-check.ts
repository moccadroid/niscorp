// ASSIGNMENT CHECK — the claim the whole talk stands on: a role change reaches
// a phone that is already connected, with no reload and no second sign-in —
// and changes what exists on it.
//
// Everything here goes through a REAL websocket against the real boot: a
// stranger steps in and receives a session; the speaker and the stage are
// signed in with the same credential; the speaker takes the deck to the
// assignment slide, whose tool appears on the controller, and assigns the
// room; the member's socket — opened before the assignment, never reconnected
// — receives its department, and its department's own tool. The database is
// the ground truth underneath.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { z } from 'zod';
import { ACTIONS } from '@lyceum/app/action-catalog';
import { CHARTER } from '@lyceum/app/charter/charter';
import { DEPARTMENTS, SLIDES } from '@lyceum/db/seed';
import { boot } from '@lyceum/server/boot';
import { check, connect, finish, waitUntil } from './harness';

// Each department's own tool — the one action its clearance adds.
const TOOL: Record<string, string> = { records: 'records.register', forms: 'forms.rename', inquiries: 'inquiries.desk', archive: 'archive.log' };
// …and the name it wears as a tab on the phone.
const TAB: Record<string, string> = { records: 'Register', forms: 'Rename', inquiries: 'Inquire', archive: 'Archive' };
// The ink of the tab labelled `label` on the tabs canvas — `ink` marks the
// one whose action is open in the body.
const tabInk = (tree: string, label: string): unknown => {
  const find = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = find(child);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    if (typeof node !== 'object' || node === null) return undefined;
    const props: unknown = 'props' in node ? node.props : undefined;
    if (typeof props === 'object' && props !== null && 'label' in props && props.label === label && 'ink' in props) return props.ink;
    return 'children' in node ? find(node.children) : undefined;
  };
  return find(JSON.parse(tree === '' ? '[]' : tree));
};
const anyToolTab =(showsNow: (canvas: string, text: string) => boolean): boolean => Object.values(TAB).some((label) => showsNow('tabs', label));

const main = async (): Promise<void> => {
  // ── the charter and the departments agree: a department_id IS a role ──
  for (const department of DEPARTMENTS) check(`department "${department.departmentId}" is a charter role`, CHARTER[department.departmentId] !== undefined);

  // ── the phone's tab list and the actions that can be tabs agree ──
  // The phone lists its candidates by hand (the order is authored); an action
  // renders as a tab by declaring `tab` in its input. Two places, so they are
  // held to each other: a new tool that can be a tab and is not on the phone —
  // or a listed tab that cannot render as one — is red here.
  const listed = z.array(z.object({ action: z.string() })).parse(ACTIONS['member.phone']?.data?.['tabs']).map((tab) => tab.action);
  const tabbable = Object.values(ACTIONS)
    .filter((action) => z.object({ properties: z.object({ tab: z.unknown() }) }).safeParse(action.input).success)
    .map((action) => action.id);
  for (const id of tabbable) check(`"${id}" can be a tab, and the phone lists it`, listed.includes(id));
  for (const id of listed) check(`the phone's tab "${id}" is an action that renders as one`, tabbable.includes(id));

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
  // The door, and the room's look marker — which shows nothing and reads one
  // word (room.look; the look check). Nothing of the application besides.
  check(`the door is all that exists for them, beside the look marker (${strangerHello.catalog.actions.join(', ')})`, [...strangerHello.catalog.actions].sort().join() === 'door.join,room.look');
  check('the door renders', await stranger.shows('main', 'Step in'));

  // ── stepping in grants a real session ──
  stranger.click('main', 'enter');
  const memberToken = await stranger.session();
  check('stepping in hands the terminal a session', memberToken.startsWith('st_'));
  stranger.close();

  // ── the same person, reconnected as themselves: not yet assigned ──
  const member = await connect(base, memberToken);
  const memberHello = await member.hello();
  const memberId = memberHello.principal ?? '';
  check(`they are now a principal of their own (${memberId})`, memberId.startsWith('m_'));
  check('they get the ID card', memberHello.catalog.actions.includes('member.card'));
  check('no department tool exists for them yet', !Object.values(TOOL).some((tool) => memberHello.catalog.actions.includes(tool)));
  check('their card says they are not yet assigned', await member.shows('body', 'Not yet assigned'));
  check('…and the line across the top says they are waiting', await member.shows('self', 'Waiting'));
  check('their tabs are what they hold: the card, Q&A and the assistant, no tool', (await member.shows('tabs', 'Card')) && member.showsNow('tabs', 'Q&A') && member.showsNow('tabs', 'Assistant') && !anyToolTab(member.showsNow));

  // ── the Ministry issues their ID card, onto the phone that is open ──
  const issued = await waitUntil(() => !member.showsNow('body', 'being issued') && !member.showsNow('body', 'pending'));
  const card = await runtime.db.query<{ name: string; title: string | null; quirk: string | null }>('SELECT name, title, quirk FROM members WHERE member_id = $1', [memberId]);
  const issuedName = card.rows[0]?.name ?? '';
  check(`their ID card is issued: a name, a title, a line on file (${issuedName})`, issued && !issuedName.startsWith('Newcomer') && (card.rows[0]?.title ?? '') !== '' && (card.rows[0]?.quirk ?? '') !== '');
  check('the card on their phone shows what the database says', member.showsNow('body', card.rows[0]?.title ?? '\u0000'));

  // ── the speaker and the stage, signed in with the same credential ──
  const speaker = await connect(base, await mintSession(runtime.pool, 'speaker', 60_000));
  const speakerHello = await speaker.hello();
  check('the speaker gets the controller', speakerHello.catalog.actions.includes('speaker.console'));
  check('the speaker gets nothing of the room', !speakerHello.catalog.actions.includes('member.card'));
  check('the controller counts the room', await speaker.shows('head', '1 in the room · 0 assigned'));
  check('the first slide needs no tool: the controller has none', await waitUntil(() => !speaker.showsNow('tools', 'Assign the room')));

  const stage = await connect(base, await mintSession(runtime.pool, 'stage', 60_000));
  const stageHello = await stage.hello();
  check('the stage gets the register and no controls', stageHello.catalog.actions.includes('stage.register') && !stageHello.catalog.actions.includes('speaker.console'));
  check('the stage opens on the first slide', await stage.shows('main', 'The talk is an application'));
  speaker.click('controls', 'next');
  check('next moves the stage to the register', await stage.shows('main', 'The register'));
  check('the register shows them by their issued name', await stage.shows('main', issuedName));

  // ── the assignment slide brings its tool to the controller ──
  const assignmentAt = SLIDES.findIndex((slide) => slide.slideId === 'slide.assignment');
  speaker.click('controls', 'all');
  check('all slides open over the controller', await speaker.shows('overlay', 'All slides'));
  speaker.click('overlay', 'pick', assignmentAt);
  check('picking the assignment slide puts it on the stage', await stage.shows('main', 'Assignment'));
  check('...and closes the list', await waitUntil(() => !speaker.showsNow('overlay', 'All slides')));
  check('...and its tool on the controller', await speaker.shows('tools', 'Assign the room'));

  // ── the assignment ──
  const sessionsBefore = member.sessionsSeen();
  speaker.click('tools', 'assign');

  check('the member\'s open phone receives its department', await waitUntil(() => !member.showsNow('self', 'Waiting')));
  check('the phone never reconnected', member.isOpen());
  check('no second sign-in was needed', member.sessionsSeen() === sessionsBefore);

  const placed = await runtime.db.query<{ department_id: string | null }>('SELECT department_id FROM members WHERE member_id = $1', [memberId]);
  const departmentId = placed.rows[0]?.department_id ?? null;
  const department = DEPARTMENTS.find((candidate) => candidate.departmentId === departmentId);
  check(`the database put them in a real department (${String(departmentId)})`, department !== undefined);
  check(`the line across the top names the department the database says (${department?.name ?? ''})`, department !== undefined && (await member.shows('self', department.name)));
  check('their card names it, with its clearance in plain words', department !== undefined && (await member.shows('body', department.remit)));
  const tool = TOOL[departmentId ?? ''] ?? '';
  const tab = TAB[departmentId ?? ''] ?? '\u0000';
  check(`their department's own tool arrives as a tab (${tab})`, await member.shows('tabs', tab));
  member.clickIn('tabs', 'open', tab);
  check(`…and pressing it opens the tool, alone, in the body (${tool})`, await waitUntil(() => !member.showsNow('body', 'ID card') && member.showsNow('body', department?.name ?? '\u0000')));
  check('…and its tab is the one marked open, the card\'s no longer', await waitUntil(() => tabInk(member.textOf('tabs'), tab) === 'ink' && tabInk(member.textOf('tabs'), 'Card') === 'paper'));

  check('the controller counts them assigned', await speaker.shows('head', '1 in the room · 1 assigned'));

  // ── unassigning, for testing: the same re-role, backwards ──
  speaker.click('tools', 'unassign');
  check('unassigning takes the department off the open phone', await member.shows('self', 'Waiting'));
  check('...and its tab with it', await waitUntil(() => !anyToolTab(member.showsNow)));
  check('...and the body is back to the card', await member.shows('body', 'Not yet assigned'));
  check('the phone never reconnected for that either', member.isOpen() && member.sessionsSeen() === sessionsBefore);
  const unplaced = await runtime.db.query<{ department_id: string | null }>('SELECT department_id FROM members WHERE member_id = $1', [memberId]);
  check('the database has them unassigned', unplaced.rows[0]?.department_id === null);
  speaker.click('tools', 'assign');
  check('and the room can be assigned again', await waitUntil(() => !member.showsNow('self', 'Waiting') && anyToolTab(member.showsNow)));

  // ── leaving the slide takes its tool with it ──
  speaker.click('controls', 'all');
  await speaker.shows('overlay', 'All slides');
  speaker.click('overlay', 'pick', 1);
  check('on the register, the controller has no assignment tool', await waitUntil(() => !speaker.showsNow('tools', 'Assign the room')));
  const final = await runtime.db.query<{ department_id: string | null }>('SELECT department_id FROM members WHERE member_id = $1', [memberId]);
  const finalName = DEPARTMENTS.find((candidate) => candidate.departmentId === final.rows[0]?.department_id)?.name ?? '\u0000';
  check(`the register on the stage shows their department (${finalName})`, await stage.shows('main', finalName));

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
