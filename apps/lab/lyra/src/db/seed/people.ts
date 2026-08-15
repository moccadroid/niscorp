// Everyone in the demo, who works where, who each studio knows, and who it
// only deals with.
import { day, insert, type Val } from '../sql';
import { LUMEN, NORTHROCK } from './studios';

// `email` is nullable and `born_on` optional for the same one reason: a child.
// See the column's own comment in db/schema/people.ts — NULL is how "no way in"
// is spelled, and it must never be the empty string.
type Person = { id: string; email: string | null; name: string; phone: string; bornOn?: string };

const LUMEN_PEOPLE: Person[] = [
  { id: 'p_maren', email: 'maren@lumen.studio', name: 'Maren Holt', phone: '+43 660 1010' },
  { id: 'p_ines', email: 'ines@lumen.studio', name: 'Ines Farkas', phone: '+43 660 1011' },
  { id: 'p_tobias', email: 'tobias@lumen.studio', name: 'Tobias Reiner', phone: '+43 660 1012' },
  { id: 'p_ava', email: 'ava.klein@example.com', name: 'Ava Klein', phone: '+43 660 2001' },
  { id: 'p_jonas', email: 'jonas.weber@example.com', name: 'Jonas Weber', phone: '+43 660 2002' },
  { id: 'p_lena', email: 'lena.gruber@example.com', name: 'Lena Gruber', phone: '+43 660 2003' },
  { id: 'p_mira', email: 'mira.sandoval@example.com', name: 'Mira Sandoval', phone: '+43 660 2004' },
  { id: 'p_felix', email: 'felix.baum@example.com', name: 'Felix Baum', phone: '+43 660 2005' },
  { id: 'p_sofia', email: 'sofia.reyes@example.com', name: 'Sofia Reyes', phone: '+43 660 2006' },
];

const NORTHROCK_PEOPLE: Person[] = [
  { id: 'p_dario', email: 'dario@northrock.gym', name: 'Dario Poletti', phone: '+43 660 3010' },
  { id: 'p_kaya', email: 'kaya@northrock.gym', name: 'Kaya Berger', phone: '+43 660 3011' },
  { id: 'p_omar', email: 'omar.haddad@example.com', name: 'Omar Haddad', phone: '+43 660 4001' },
  { id: 'p_nina', email: 'nina.vogel@example.com', name: 'Nina Vogel', phone: '+43 660 4002' },
  { id: 'p_ruben', email: 'ruben.marek@example.com', name: 'Ruben Marek', phone: '+43 660 4003' },
  { id: 'p_hana', email: 'hana.oksana@example.com', name: 'Hana Oksana', phone: '+43 660 4004' },
  { id: 'p_luca', email: 'luca.stein@example.com', name: 'Luca Stein', phone: '+43 660 4005' },
];

const ROBOTS: Person[] = [
  { id: 'p_auto_lumen', email: 'automation@lumen.studio', name: 'Lumen automations', phone: '' },
  { id: 'p_auto_northrock', email: 'automation@northrock.gym', name: 'North Rock automations', phone: '' },
];

const PROSPECTS: Person[] = [
  { id: 'p_priya', email: 'priya.anand@example.com', name: 'Priya Anand', phone: '+43 660 5001' },
  { id: 'p_tomv', email: 'tom.vogel@example.com', name: 'Tom Vogel', phone: '+43 660 5002' },
  { id: 'p_ida', email: 'ida.brandt@example.com', name: 'Ida Brandt', phone: '' },
  { id: 'p_rafi', email: 'rafi.osman@example.com', name: 'Rafi Osman', phone: '' },
  { id: 'p_mila', email: 'mila.sorge@example.com', name: 'Mila Sorge', phone: '+43 660 6001' },
];

// People the studio only DEALS with — the mat cleaner, the physio it refers
// to, a guest coach. Same directory, same search, same person record.
const OUTSIDERS: Person[] = [
  { id: 'p_bo', email: 'bo@bodhimats.at', name: 'Bo Lindqvist', phone: '+43 1 4402211' },
  { id: 'p_gretel', email: 'g.reiter@praxisneubau.at', name: 'Gretel Reiter', phone: '+43 1 5540099' },
  { id: 'p_wim', email: 'wim.declercq@example.com', name: 'Wim De Clercq', phone: '' },
];

// ─── the children ────────────────────────────────────────────
//
// A parent with two enrolled kids, which is the shape a BJJ, karate or dance
// school lives on and the one the whole families plan is written for. Ava
// Klein already trains at Lumen; Emma and Tom are hers.
//
// NO EMAIL, AND THAT IS THE ASSERTION. These two rows are what prove a person
// can exist, appear on the roll and derive standing without any way in —
// `auth-check` mints against them and must get nothing back. A third child at
// North Rock would add no case; a SECOND child under one parent does, because
// it is what a scalar household id could not express and what the UNIQUE email
// constraint would have refused.
const CHILDREN: Person[] = [
  { id: 'p_emma', email: null, name: 'Emma Klein', phone: '', bornOn: '2017-04-12' },
  { id: 'p_tomk', email: null, name: 'Tom Klein', phone: '', bornOn: '2019-09-30' },
];

export const PEOPLE_SQL = insert(
  'people',
  ['id', 'email', 'name', 'phone', 'born_on'],
  [...LUMEN_PEOPLE, ...NORTHROCK_PEOPLE, ...PROSPECTS, ...OUTSIDERS, ...ROBOTS, ...CHILDREN].map(
    (p) => [p.id, p.email, p.name, p.phone, p.bornOn ?? null] satisfies Val[],
  ),
);

// ─── who may act for whom ────────────────────────────────────
//
// Ava guards both her children at Lumen. One guardian and two children, at one
// studio — the minimum that makes "the family's week" a question with more
// than one answer in it.
export const GUARDIANSHIPS_SQL = insert(
  'guardianships',
  ['id', 'studio_id', 'guardian_person_id', 'child_person_id'],
  [
    ['gd_ava_emma', LUMEN, 'p_ava', 'p_emma'],
    ['gd_ava_tomk', LUMEN, 'p_ava', 'p_tomk'],
  ],
);

// ─── who works where ─────────────────────────────────────────

export const STAFF_SQL = insert(
  'staff',
  ['id', 'studio_id', 'person_id', 'role', 'active'],
  [
    ['sf_maren', LUMEN, 'p_maren', 'owner', true],
    ['sf_ines', LUMEN, 'p_ines', 'desk', true],
    ['sf_tobias', LUMEN, 'p_tobias', 'instructor', true],
    ['sf_dario', NORTHROCK, 'p_dario', 'owner', true],
    ['sf_kaya', NORTHROCK, 'p_kaya', 'manager', true],

    ['sf_auto_lumen', LUMEN, 'p_auto_lumen', 'automation', true],
    ['sf_auto_northrock', NORTHROCK, 'p_auto_northrock', 'automation', true],
  ],
);

// ─── the anchor: everyone each studio knows ──────────────────
//
// One row per (studio, human). What each of them IS — member, prospect, pass
// holder, contact — is never written here: it derives from the entitlements
// and tags seeded further down. See standing.ts.
export const STUDIO_PEOPLE_SQL = insert(
  'studio_people',
  // `marketing_ok` is the studio's own record of who said yes to being written
  // to about anything other than what they booked. TRUE for most and
  // deliberately FALSE for Jonas, who is the proof: an active member who has
  // stopped coming, which is exactly the shape "we have missed you" hunts for.
  // He is the one person it must not have. (Mira would not do — her plan is
  // paused, so no marketing selection wants her in the first place, and an
  // opt-out that changes nothing proves nothing.)
  ['id', 'studio_id', 'person_id', 'source', 'first_seen_on', 'trial_ends_on', 'notes', 'marketing_ok'],
  [
    ['sp_ava', LUMEN, 'p_ava', 'referral', day(-420, LUMEN), null, '', true],
    ['sp_jonas', LUMEN, 'p_jonas', 'website', day(-180, LUMEN), null, 'Asked not to be emailed about anything but his own classes.', false],
    // A live trial BESIDE a subscription: the desk's question during the window
    // is "will she stay", so trialling outranks active until it closes.
    ['sp_lena', LUMEN, 'p_lena', 'event', day(-9, LUMEN), day(4, LUMEN), 'Two-week trial, came from the Saturday open class.', true],
    ['sp_mira', LUMEN, 'p_mira', 'walk-in', day(-300, LUMEN), null, 'Paused until her shoulder clears — back in March.', true],
    ['sp_felix', LUMEN, 'p_felix', 'social', day(-600, LUMEN), day(-586, LUMEN), 'Trialled, never signed. No reply to two emails.', true],
    ['sp_sofia', LUMEN, 'p_sofia', 'website', day(-75, LUMEN), null, '', true],
    ['sp_tobias', LUMEN, 'p_tobias', 'other', day(-500, LUMEN), null, 'Teaches Wednesday and Friday.', true],
    ['sp_omar', NORTHROCK, 'p_omar', 'referral', day(-800, NORTHROCK), null, 'Competition team.', true],
    ['sp_nina', NORTHROCK, 'p_nina', 'walk-in', day(-210, NORTHROCK), null, '', true],
    ['sp_ruben', NORTHROCK, 'p_ruben', 'website', day(-95, NORTHROCK), null, '', true],
    // Trial closed yesterday and NO entitlement behind it — the person to talk
    // to today, derived as trial-over rather than stored by a job.
    ['sp_hana', NORTHROCK, 'p_hana', 'event', day(-22, NORTHROCK), day(-1, NORTHROCK), 'Trial ran out yesterday. Ask her about a plan.', true],
    ['sp_luca', NORTHROCK, 'p_luca', 'referral', day(-700, NORTHROCK), null, 'Moved to Graz.', true],
    ['sp_kaya', NORTHROCK, 'p_kaya', 'other', day(-900, NORTHROCK), null, '', true],

    // ── prospects: known, no entitlement yet ──
    ['sp_priya', LUMEN, 'p_priya', 'website', day(-2, LUMEN), null, 'Asked about beginner classes on a weekday evening.', true],
    // Tom Vogel: the canonical self-service subject. A live trial a week out
    // and NOTHING else — a fresh human standing exactly at the plan-choice
    // cliff. See docs/plans/lyra-model-overhaul.md Part 8; his arc is the test.
    ['sp_tomv', LUMEN, 'p_tomv', 'referral', day(-9, LUMEN), day(7, LUMEN), 'Ava sent him. Rang Tuesday, wants to try Yin.', true],
    ['sp_ida', LUMEN, 'p_ida', 'walk-in', day(-4, LUMEN), null, 'Came in off the street. Booked into Saturday.', true],
    // Lost is a relationship that produced nothing — the same anchor row,
    // holding only its history. Not a fourth kind of person.
    ['sp_rafi', LUMEN, 'p_rafi', 'social', day(-40, LUMEN), null, 'Price. Went to the studio on Hauptstrasse.', true],
    ['sp_mila', NORTHROCK, 'p_mila', 'event', day(-1, NORTHROCK), null, 'Open mat day. Wants the fundamentals block.', true],

    // ── the people a studio only DEALS with ──
    // The milkman case: an anchor row plus a contact tag, no entitlement ever.
    // He resolves as a principal now — the old directory dropped him entirely.
    ['sp_bo', LUMEN, 'p_bo', 'other', day(-370, LUMEN), null, '', true],
    ['sp_gretel_l', LUMEN, 'p_gretel', 'other', day(-500, LUMEN), null, '', true],
    ['sp_gretel_n', NORTHROCK, 'p_gretel', 'other', day(-450, NORTHROCK), null, '', true],
    ['sp_wim', NORTHROCK, 'p_wim', 'other', day(-30, NORTHROCK), null, '', true],

    // ── the children ──
    // ORDINARY ANCHOR ROWS, and that is the whole claim. A child is on the roll
    // the same way everybody else is; what differs is derived, never stored.
    // `marketing_ok` is FALSE for both — consent for a child's data is the
    // guardian's to give (GDPR Art. 8, 14 in AT), and nobody has asked Ava. It
    // is the correct default and the one that keeps a child out of every
    // marketing selection until a human decides otherwise.
    ['sp_emma', LUMEN, 'p_emma', 'referral', day(-200, LUMEN), null, 'Ava’s eldest. Tuesday and Thursday kids’ class.', false],
    ['sp_tomk', LUMEN, 'p_tomk', 'referral', day(-95, LUMEN), null, 'Ava’s youngest. Started in the little kids’ group.', false],
  ],
);

// ─── everybody else ──────────────────────────────────────────
export const CONNECTIONS_SQL = insert(
  'connections',
  ['studio_id', 'person_id', 'kind', 'company', 'notes'],
  [
    [LUMEN, 'p_bo', 'supplier', 'Bodhi Mats', 'Mat cleaning, every second Monday.'],
    [LUMEN, 'p_gretel', 'professional', 'Praxis Neubau', 'Physio we refer to. Takes members same-week.'],
    [NORTHROCK, 'p_gretel', 'professional', 'Praxis Neubau', 'Same physio. One human, two studios that know her.'],
    [NORTHROCK, 'p_wim', 'guest', '', 'Guest seminar in the autumn. Confirmed by email.'],
  ],
);
