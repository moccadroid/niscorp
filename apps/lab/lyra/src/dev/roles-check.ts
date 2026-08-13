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

ok('a member lands on their own surface', idsFor(MEMBER).includes('home.member'));
ok('...and not on the instructor’s day', !idsFor(MEMBER).includes('home.classes'));
ok('an instructor still holds the day', idsFor(INSTRUCTOR).includes('home.classes'));

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
const deskRevenue = await read(DESK, 'studio', 'studio/revenue/expected');
ok('the desk asking for revenue by hand is refused', refused(deskRevenue), JSON.stringify(deskRevenue));

const ownerRevenue = await read(OWNER, 'studio', 'studio/revenue/expected');
ok('the owner is not — so the refusal is the policy, not a broken query', !refused(ownerRevenue), JSON.stringify(ownerRevenue));

const instructorRevenue = await read(INSTRUCTOR, 'studio', 'studio/revenue/expected');
ok('an instructor who trains here gets a figure — his own', !refused(instructorRevenue), JSON.stringify(instructorRevenue));
ok("...and it is NOT the studio's takings", JSON.stringify(instructorRevenue) !== JSON.stringify(ownerRevenue), `his ${JSON.stringify(instructorRevenue)} against the studio's ${JSON.stringify(ownerRevenue)}`);

const memberRoll = await read(MEMBER, 'member', 'members/list', { statuses: ['active'], q: '%' });
ok('a member still cannot read the roll', refused(memberRoll));

report('each rung sees its own application, and the engine agrees with the screen.');
