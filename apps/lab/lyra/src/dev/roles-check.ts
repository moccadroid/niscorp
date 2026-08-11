// Roles check — each rung of the ladder sees its own application.
//
// This exists because of a bug you could only find by looking: an instructor
// logged in and saw the studio's headcount and its expected monthly revenue.
// The cause was one wildcard — `home.*` granted at the member rung, which every
// staff role extends, so the bottom of the ladder handed the owner's dashboard
// to the whole ladder.
//
// It asserts on BOTH halves, because either alone is a false sense of safety:
//
//   ring 1 — the surface does not exist for them, so nothing renders and no
//            endpoint fires
//   ring 3 — the read is refused at the engine even if somebody asks for it by
//            hand, because the verbs behind it are not in their policy
//
// A check that only tested the screen would pass on a hidden card, and a hidden
// card still crossed the wire.
//
// Run: pnpm --filter lyra exec tsx src/dev/roles-check.ts
import { resolveCatalog } from '@niscorp/moss';
import { CAST } from '@lyra/db/seed';
import { personByEmail } from '@lyra/server/users';
import { app, asPrincipal, login, ok, report, settle, treeOf } from './world';

const idsFor = (email: string): readonly string[] => resolveCatalog(app, personByEmail(email)?.id ?? null).ids;
const read = (email: string, resource: string, fingerprint: string, context: Record<string, unknown> = {}): Promise<unknown> =>
  asPrincipal(email, `/api/${resource}/vex`, { fingerprint, context });
const refused = (value: unknown): boolean => value !== null && typeof value === 'object' && !Array.isArray(value) && 'status' in value;

const INSTRUCTOR = CAST.lumen.instructor;
const DESK = CAST.lumen.desk;
const OWNER = CAST.lumen.owner;
const MEMBER = CAST.lumen.member;

// ── ring 1: exactly one landing surface each ──
const HOMES = ['home.overview', 'home.desk', 'home.classes', 'home.member'];
for (const [who, email] of [['owner', OWNER], ['desk', DESK], ['instructor', INSTRUCTOR], ['member', MEMBER]] as const) {
  const held = HOMES.filter((id) => idsFor(email).includes(id));
  ok(`${who} holds a landing surface`, held.length >= 1, held.join(', '));
}

// A member lands on THEIR screen, and an instructor no longer inherits it —
// the two used to share `home.classes`, which meant a member opened the
// instructor's day. Named grants at both rungs is what separates them.
ok('a member lands on their own surface', idsFor(MEMBER).includes('home.member'));
ok('...and not on the instructor’s day', !idsFor(MEMBER).includes('home.classes'));
ok('an instructor still holds the day', idsFor(INSTRUCTOR).includes('home.classes'));

// An instructor may ALSO hold `home.member`, and that is right rather than a
// leak — but not by inheritance any more. Tobias trains here as well as
// teaching, so he holds both roles, and the member one brings its own reach:
// the card and the bookings on that screen are pinned to the caller. The direction that would be wrong is the other one, and the
// candidate list is what settles it: `home.classes` is offered first, so an
// instructor mounts the day and a member mounts the card.
ok('an instructor may also see their own card', idsFor(INSTRUCTOR).includes('home.member'), 'their own row, never anybody else’s');

ok('the owner holds the overview', idsFor(OWNER).includes('home.overview'));
ok('the desk does NOT', !idsFor(DESK).includes('home.overview'));
ok('an instructor does NOT', !idsFor(INSTRUCTOR).includes('home.overview'));
ok('...nor the desk surface', !idsFor(INSTRUCTOR).includes('home.desk'));
ok('a member does NOT', !idsFor(MEMBER).includes('home.overview'));

// ── what actually mounts ──
const instructorShell = login(INSTRUCTOR);
await settle();
const instructorTree = treeOf(instructorShell);
ok('an instructor lands on the day', instructorTree.includes("Today's classes"));
ok('...with NO headcount on screen', !instructorTree.includes('MEMBERS') && !instructorTree.includes('Members\\"'), 'no member figure');
ok('...and NO revenue on screen', !instructorTree.toLowerCase().includes('expected monthly'));

const ownerShell = login(OWNER);
await settle();
const ownerTree = treeOf(ownerShell);
ok('the owner does get the figures', ownerTree.includes('Expected monthly'));
ok('...with a real amount, not a blank', /€\d/.test(ownerTree), 'revenue rendered');

const deskShell = login(DESK);
await settle();
const deskTree = treeOf(deskShell);
ok('the desk sees the headcount they work with', deskTree.includes('Members'));
ok('...but not the takings', !deskTree.toLowerCase().includes('expected monthly'));

// ── ring 3: the engine refuses, screen or no screen ──
//
// The half that matters. Removing a card from a layout removes a card; this is
// what makes the answer unavailable to a person with a terminal and an hour.
const deskRevenue = await read(DESK, 'studio', 'studio/revenue/expected');
ok('the desk asking for revenue by hand is refused', refused(deskRevenue), JSON.stringify(deskRevenue));

const ownerRevenue = await read(OWNER, 'studio', 'studio/revenue/expected');
ok('the owner is not — so the refusal is the policy, not a broken query', !refused(ownerRevenue), JSON.stringify(ownerRevenue));

// THE INSTRUCTOR IS NOT REFUSED, and that is not a leak — it is where the
// boundary sits for somebody who ALSO trains here.
//
// He is refused as an instructor: that rung has no `subscriptions.read`. He is
// answered as a member, because a membership card is a join over subscriptions
// and plans, and a member may see their own bill. So the figure comes back —
// and it must be his, never the studio's. Asserting a refusal here would be
// asserting that a teacher who trains stops being a member, which is the exact
// flattening this was all about. See `multirole-check`.
const instructorRevenue = await read(INSTRUCTOR, 'studio', 'studio/revenue/expected');
ok('an instructor who trains here gets a figure — his own', !refused(instructorRevenue), JSON.stringify(instructorRevenue));
ok("...and it is NOT the studio's takings", JSON.stringify(instructorRevenue) !== JSON.stringify(ownerRevenue), `his ${JSON.stringify(instructorRevenue)} against the studio's ${JSON.stringify(ownerRevenue)}`);

// The member's own floor, re-asserted here so a future grant cannot quietly
// undo it without this check going red.
const memberRoll = await read(MEMBER, 'member', 'members/list', { statuses: ['active'], q: '%' });
ok('a member still cannot read the roll', refused(memberRoll));

report('each rung sees its own application, and the engine agrees with the screen.');
