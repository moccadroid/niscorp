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
import { CHARTER } from '@lyceum/app/charter/charter';
import { DEPARTMENTS, SLIDES } from '@lyceum/db/seed';
import { boot } from '@lyceum/server/boot';
import { check, connect, finish, waitUntil } from './harness';

// Each department's own tool — the one action its clearance adds.
const TOOL: Record<string, string> = { records: 'records.register', forms: 'forms.rename', inquiries: 'inquiries.desk', archive: 'archive.log' };

const main = async (): Promise<void> => {
  // ── the charter and the departments agree: a department_id IS a role ──
  for (const department of DEPARTMENTS) check(`department "${department.departmentId}" is a charter role`, CHARTER[department.departmentId] !== undefined);

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

  // ── the same person, reconnected as themselves: not yet assigned ──
  const member = await connect(base, memberToken);
  const memberHello = await member.hello();
  const memberId = memberHello.principal ?? '';
  check(`they are now a principal of their own (${memberId})`, memberId.startsWith('m_'));
  check('they get the ID card', memberHello.catalog.actions.includes('member.card'));
  check('no department badge exists for them yet', !memberHello.catalog.actions.includes('department.badge'));
  check('no department tool exists for them yet', !Object.values(TOOL).some((tool) => memberHello.catalog.actions.includes(tool)));
  check('their card says they are not yet assigned', await member.shows('main', 'Not yet assigned'));

  // ── the speaker and the stage, signed in with the same credential ──
  const speaker = await connect(base, await mintSession(runtime.pool, 'speaker', 60_000));
  const speakerHello = await speaker.hello();
  check('the speaker gets the controller', speakerHello.catalog.actions.includes('speaker.console'));
  check('the speaker gets nothing of the room', !speakerHello.catalog.actions.includes('member.card'));
  check('the controller counts the room', await speaker.shows('main', '1 in the room · 0 assigned'));
  check('the first slide needs no tool: the controller has none', await waitUntil(() => !speaker.showsNow('tools', 'Assign the room')));

  const stage = await connect(base, await mintSession(runtime.pool, 'stage', 60_000));
  const stageHello = await stage.hello();
  check('the stage gets the register and no controls', stageHello.catalog.actions.includes('stage.register') && !stageHello.catalog.actions.includes('speaker.console'));
  check('the stage opens on the first slide', await stage.shows('main', 'The talk is an application'));
  speaker.click('main', 'next');
  check('next moves the stage to the register', await stage.shows('main', 'The register'));
  check('the register shows the newcomer', await stage.shows('main', 'Newcomer'));

  // ── the assignment slide brings its tool to the controller ──
  const assignmentAt = SLIDES.findIndex((slide) => slide.slideId === 'slide.assignment');
  speaker.click('main', 'pick', assignmentAt);
  check('picking the assignment slide puts it on the stage', await stage.shows('main', 'Assignment'));
  check('...and its tool on the controller', await speaker.shows('tools', 'Assign the room'));

  // ── the assignment ──
  const sessionsBefore = member.sessionsSeen();
  speaker.click('tools', 'assign');

  check('the member\'s open phone receives its department', await member.shows('badge', 'Your department'));
  check('their card now names the department', await member.shows('main', 'Department of '));
  check('the phone never reconnected', member.isOpen());
  check('no second sign-in was needed', member.sessionsSeen() === sessionsBefore);

  const placed = await runtime.db.query<{ department_id: string | null }>('SELECT department_id FROM members WHERE member_id = $1', [memberId]);
  const departmentId = placed.rows[0]?.department_id ?? null;
  const department = DEPARTMENTS.find((candidate) => candidate.departmentId === departmentId);
  check(`the database put them in a real department (${String(departmentId)})`, department !== undefined);
  check(`the phone shows the department the database says (${department?.name ?? ''})`, department !== undefined && member.showsNow('badge', department.name));
  const tool = TOOL[departmentId ?? ''] ?? '';
  const desk = await waitUntil(() => member.showsNow('desk', department?.name ?? '\u0000'));
  check(`their department's own tool is on their phone (${tool})`, desk);

  check('the controller counts them assigned', await speaker.shows('main', '1 in the room · 1 assigned'));

  // ── unassigning, for testing: the same re-role, backwards ──
  speaker.click('tools', 'unassign');
  check('unassigning takes the department off the open phone', await member.shows('main', 'Not yet assigned'));
  check('...and the badge with it', await waitUntil(() => !member.showsNow('badge', 'Your department')));
  check('...and the department tool', await waitUntil(() => (member.showsNow('desk', 'Records') || member.showsNow('desk', 'Forms') || member.showsNow('desk', 'Inquiries') || member.showsNow('desk', 'Archive')) === false));
  check('the phone never reconnected for that either', member.isOpen() && member.sessionsSeen() === sessionsBefore);
  const unplaced = await runtime.db.query<{ department_id: string | null }>('SELECT department_id FROM members WHERE member_id = $1', [memberId]);
  check('the database has them unassigned', unplaced.rows[0]?.department_id === null);
  speaker.click('tools', 'assign');
  check('and the room can be assigned again', await member.shows('badge', 'Your department'));

  // ── leaving the slide takes its tool with it ──
  speaker.click('main', 'pick', 1);
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
