// Run: pnpm --filter lyra exec tsx src/dev/scope-check.ts
import { CAST } from '@lyra/db/seed';
import { asPrincipal, ok, report, runtime } from './world';

// The roll's reads carry a SEEK as well as a search: `after`/`afterId` are the
// last row on screen, and empty means the first page. Defaulted here for the
// same reason `q: '%'` is passed everywhere — a read that omits a context key
// its filter compares against matches nothing, quietly.
const read = (email: string, resource: string, fingerprint: string, context: Record<string, unknown> = {}): Promise<unknown> =>
  asPrincipal(email, `/api/${resource}/vex`, { fingerprint, context: { after: '', afterId: '', ...context } });

const refused = (value: unknown): boolean => value !== null && typeof value === 'object' && !Array.isArray(value) && 'status' in value;

const today = new Date().toISOString().slice(0, 10);

// ── the reads answer at all ──
const lumenStudio = await read(CAST.lumen.owner, 'studio', 'studio/current');
ok('a studio read answers', typeof lumenStudio === 'object' && lumenStudio !== null);
ok('...with the caller’s own studio', JSON.stringify(lumenStudio).includes('Lumen Yoga'));

const nrStudio = await read(CAST.northrock.owner, 'studio', 'studio/current');
ok('the other studio gets its own row from the same fingerprint', JSON.stringify(nrStudio).includes('North Rock'));
ok('...and not the first one', !JSON.stringify(nrStudio).includes('Lumen'));

// ── the roll, lensed ──
// The lens is a CONTEXT VALUE, not a fingerprint: one read, nine answers.
const lumenPeople = await read(CAST.lumen.owner, 'member', 'people/list', { q: '%', lens: 'everyone' });
const nrPeople = await read(CAST.northrock.owner, 'member', 'people/list', { q: '%', lens: 'everyone' });
const lumenText = JSON.stringify(lumenPeople);
const nrText = JSON.stringify(nrPeople);

ok('Lumen sees its own people', lumenText.includes('Ava Klein'));
ok('...and NOT North Rock’s', !lumenText.includes('Omar Haddad'));
ok('North Rock sees its own', nrText.includes('Omar Haddad'));
ok('...and NOT Lumen’s', !nrText.includes('Ava Klein'));

const totals = await runtime.db.query<{ n: number }>(`SELECT count(*) n FROM studio_people`);
const dbTotal = Number(totals.rows[0]?.n ?? 0);
const seen = (Array.isArray(lumenPeople) ? lumenPeople.length : 0) + (Array.isArray(nrPeople) ? nrPeople.length : 0);
ok('between them they see everyone exactly once', seen === dbTotal, `${seen} of ${dbTotal}`);

// The standing is DERIVED per row, on the engine's own day — a prospect and
// the milkman appear on the roll wearing the truth, not a stored category.
ok('a prospect appears with derived standing', lumenText.includes('Priya Anand') && /Priya Anand[^}]*Prospect/.test(lumenText), 'Priya derives as a prospect');
ok('...and the milkman resolves as a contact', lumenText.includes('Bo Lindqvist') && /Bo Lindqvist[^}]*Contact/.test(lumenText), 'a supplier is somebody the studio deals with');

// The members lens carries only people with a live or paused subscription.
const lumenMembers = await read(CAST.lumen.owner, 'member', 'people/list', { q: '%', lens: 'members' });
const membersText = JSON.stringify(lumenMembers);
ok('the members lens holds the subscribed', membersText.includes('Ava Klein'));
ok('...and not the prospect', !membersText.includes('Priya Anand'));
ok('...and not the supplier', !membersText.includes('Bo Lindqvist'));

// ── the forged request ──
const forged = await read(CAST.lumen.owner, 'member', 'people/list', { q: '%', lens: 'everyone', studioId: 'st_northrock' });
const forgedText = JSON.stringify(forged);
ok('a forged studioId does not cross the boundary', !forgedText.includes('Omar Haddad'), 'context.studioId was ignored');
ok('...and does not empty the caller’s own answer either', forgedText.includes('Ava Klein'));

// ── a fingerprint that does not exist ──
const unknown = await read(CAST.lumen.owner, 'member', 'people/list/does-not-exist');
ok('an unknown fingerprint is refused, not generated', refused(unknown), JSON.stringify(unknown));

// ── a lens that does not exist ──
// The lens moved from the fingerprint into the context, so this is the new
// shape of the same question: naming a lens is CHOOSING from the nine arms,
// never writing a filter. An invented one guards no arm and selects nobody —
// it cannot widen the answer, which is the property the split used to hold.
const invented = await read(CAST.lumen.owner, 'member', 'people/list', { q: '%', lens: 'everyone-including-north-rock' });
ok('an invented lens selects nobody', Array.isArray(invented) && invented.length === 0, JSON.stringify(invented).slice(0, 120));

// ── the aggregates ──
const count = await read(CAST.lumen.owner, 'studio', 'studio/members/active-count');
const dbActive = await runtime.db.query<{ n: number }>("SELECT count(*) n FROM subscriptions WHERE studio_id='st_lumen' AND status = 'active'");
ok('the active count is scoped too', JSON.stringify(count).includes(String(dbActive.rows[0]?.n ?? -1)), JSON.stringify(count));

// ── the timetable ──
const sessions = await read(CAST.lumen.owner, 'schedule', 'schedule/today', { today });
const nrSessions = await read(CAST.northrock.owner, 'schedule', 'schedule/today', { today });
ok('today’s classes come back', Array.isArray(sessions));
// "1 von 12" at a German studio, "1 of 12" at an English one. The claim is
// that the MAPPING composed it — a number, a word, a number — not that the word
// is English. Asserting the spelling made this fail the day a studio was seeded
// de-AT, which was the feature working.
ok('...formatted on the way out, not in a component', /\d+\s+\p{L}+\s+\d+/u.test(JSON.stringify(sessions)), JSON.stringify(sessions).slice(0, 120));
ok('...and each studio gets only its own', JSON.stringify(sessions) !== JSON.stringify(nrSessions));

const memberSees = await read(CAST.lumen.member, 'member', 'people/list', { q: '%', lens: 'everyone' });
ok('a member cannot read the roll', refused(memberSees), JSON.stringify(memberSees).slice(0, 100));

// ── the standing/revenue boundary ──
// The desk derives standing off the anchor's own mirrors (schema.ts), so the
// members lens answers without any grant on `subscriptions` — the boolean the
// desk always had, without the row it never did.
const deskRoll = await read(CAST.lumen.desk, 'member', 'people/list', { q: '%', lens: 'members' });
ok('the desk reads the members lens — standing lives on the anchor', Array.isArray(deskRoll) && JSON.stringify(deskRoll).includes('Ava Klein'), JSON.stringify(deskRoll).slice(0, 100));
const deskRevenue = await read(CAST.lumen.desk, 'member', 'subscriptions/for-member', { personId: 'p_ava' });
ok('...while a subscription READ is still refused', refused(deskRevenue), JSON.stringify(deskRevenue).slice(0, 100));

report('the tenant boundary is engine-side, a forged request cannot cross it, and standing derives without the revenue grant.');
