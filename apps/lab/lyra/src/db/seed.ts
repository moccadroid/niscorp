// Lyra's demo dataset — two studios that could not look less alike.
//
// The pair is the point. Lumen is a yoga studio: calm, morning-heavy, a few
// large classes. North Rock is a BJJ gym: evening-heavy, more sessions, smaller
// rooms, a competition team. They run the same deployment, the same actions and
// the same charter, and when the theming step lands they will not look remotely
// like the same product. Everything a check needs to prove tenancy — that
// Lumen's owner cannot see one North Rock member — lives in this file.
//
// Authored above, generated below. The named people and the weekly grid are
// written by hand because they are read; the term's worth of sessions, bookings
// and attendance is generated in SQL because nobody reads four hundred rows,
// they only need to be there, be plausible, and be identical every boot.

import { at, day, insert, raw, type Val } from './sql';

export const LUMEN = 'st_lumen';
export const NORTHROCK = 'st_northrock';

// ─── the studios ─────────────────────────────────────────────

const studios = insert(
  'studios',
  ['id', 'name', 'slug', 'kind', 'timezone', 'theme_id'],
  [
    [LUMEN, 'Lumen Yoga', 'lumen', 'yoga', 'Europe/Vienna', 'th_sand'],
    [NORTHROCK, 'North Rock BJJ', 'northrock', 'bjj', 'Europe/Vienna', 'th_charcoal'],
  ],
);

// ─── the looks ───────────────────────────────────────────────
//
// A theme is a token set, held as a row. Nothing else in the application
// changes when a studio wears one — no layout, no component, no query — because
// every colour in the kit already resolves through a custom property.
//
// Two studios, two looks, one deployment. That is the product claim, and this
// is the whole of what makes it true on the surface axis.
//
// A studio with `theme_id` NULL gets `{}`, which IS the stock palette — the
// path for "this studio never customised anything" is the same path as
// everything else, not a special case.
const themes = insert(
  'themes',
  ['id', 'name', 'tokens'],
  [
    [
      'th_sand',
      'Sand',
      // Warm and quiet: off-white grounds, ink softened towards brown, a clay
      // accent that carries dark text. What a yoga studio would pick.
      JSON.stringify({
        ground: '#fdfcfa',
        surface: '#ffffff',
        'surface-sunk': '#f5f1ea',
        ink: '#1c1917',
        'ink-soft': '#44403c',
        'ink-mute': '#78716c',
        'ink-faint': '#a8a29e',
        line: '#eae4da',
        'line-strong': '#ddd4c6',
        accent: '#c2703d',
        'accent-ink': '#ffffff',
        'accent-soft': '#f8ece3',
        'radius-lg': '20px',
      }),
    ],
    [
      'th_charcoal',
      'Charcoal',
      // Hard and dark, with the neon turned up — the accent reads as a light
      // source on a dark ground rather than a highlighter on paper. What a
      // fight gym would pick.
      JSON.stringify({
        ground: '#0c0c0d',
        surface: '#151517',
        'surface-sunk': '#1e1e21',
        ink: '#fafafa',
        'ink-soft': '#d4d4d8',
        'ink-mute': '#8b8b93',
        'ink-faint': '#5c5c63',
        line: '#26262a',
        'line-strong': '#38383e',
        accent: '#ccff00',
        'accent-ink': '#0c0c0d',
        'accent-soft': '#232a05',
        // ONE WORD INSTEAD OF FOUR HAND-MIXED BACKGROUNDS. This used to list
        // `calm-soft`, `warm-soft`, `alert-soft` and `good-soft` and could not
        // touch the foregrounds at all — so every badge sat at the light
        // theme's 700-level ink on a dark tint and failed contrast. `scheme`
        // swaps the whole tuned set, hues included.
        scheme: 'dark',
        'radius-lg': '10px',
      }),
    ],
  ],
);

// ─── people ──────────────────────────────────────────────────
//
// Email is the login identity: a magic link is the only way in, so the address
// is the account. Two studios, no shared humans — v1 is one studio per account
// (PLAN.md), and the seed does not quietly contradict the decision.

type Person = { id: string; email: string; name: string; phone: string };

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

// The automations are people too, as far as identity is concerned — that is
// the point. No magic link will ever be sent to these addresses; the address
// exists because the directory is keyed on people, and an automation that
// resolved through some other path would be an automation the charter does not
// govern.
const ROBOTS: Person[] = [
  { id: 'p_auto_lumen', email: 'automation@lumen.studio', name: 'Lumen automations', phone: '' },
  { id: 'p_auto_northrock', email: 'automation@northrock.gym', name: 'North Rock automations', phone: '' },
];

// PROSPECTS AND OUTSIDERS ARE PEOPLE, and that is the whole change. They used
// to be rows in a `leads` table with their own name/email/phone — a second
// class of human who could never become the first without being retyped.
// Their relationship to a studio is a membership at stage zero, or a
// connection; who they ARE is a row here, like everybody else.
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

const people = insert(
  'people',
  ['id', 'email', 'name', 'phone'],
  [...LUMEN_PEOPLE, ...NORTHROCK_PEOPLE, ...PROSPECTS, ...OUTSIDERS, ...ROBOTS].map((p) => [p.id, p.email, p.name, p.phone] satisfies Val[]),
);

// ─── who works where ─────────────────────────────────────────
//
// Maren owns Lumen and teaches; Ines runs the desk; Tobias teaches only. Dario
// owns North Rock and coaches; Kaya coaches and manages. An instructor who also
// trains holds BOTH a staff row and a membership — which is the case the
// "am I staff or a member" branch would get wrong if the data model had one
// table instead of two.

const staff = insert(
  'staff',
  ['id', 'studio_id', 'person_id', 'role', 'active'],
  [
    ['sf_maren', LUMEN, 'p_maren', 'owner', true],
    ['sf_ines', LUMEN, 'p_ines', 'desk', true],
    ['sf_tobias', LUMEN, 'p_tobias', 'instructor', true],
    ['sf_dario', NORTHROCK, 'p_dario', 'owner', true],
    ['sf_kaya', NORTHROCK, 'p_kaya', 'manager', true],

    // THE AUTOMATION PRINCIPAL, one per studio.
    //
    // A reflex is not a script with database access; it is somebody with a
    // charter role. Giving each studio's automations a staff row means they
    // arrive at the vex surface exactly as a person does — resolved through the
    // directory, scoped by `scope()`, refused by the same compiled policy.
    //
    // The consequence worth stating: Lumen's nightly job physically cannot
    // touch a North Rock row, and nothing in the automation code is what makes
    // that true. It is the same boundary a front desk stands behind.
    //
    // They hold no membership, so they never appear on a roll, and the
    // `automation` rung grants no actions at all — there is no shell to build.
    ['sf_auto_lumen', LUMEN, 'p_auto_lumen', 'automation', true],
    ['sf_auto_northrock', NORTHROCK, 'p_auto_northrock', 'automation', true],
  ],
);

// ─── memberships ─────────────────────────────────────────────
//
// Every status in the lifecycle appears at least once, because a screen that
// has only ever seen `active` is a screen nobody tested. Tobias and Kaya are
// staff who also train.

const memberships = insert(
  'memberships',
  ['id', 'studio_id', 'person_id', 'status', 'source', 'joined_on', 'ended_on', 'notes'],
  [
    ['mb_ava', LUMEN, 'p_ava', 'active', 'referral', day(-420, LUMEN), null, ''],
    ['mb_jonas', LUMEN, 'p_jonas', 'active', 'website', day(-180, LUMEN), null, ''],
    ['mb_lena', LUMEN, 'p_lena', 'trialling', 'event', day(-9, LUMEN), null, 'Two-week trial, came from the Saturday open class.'],
    ['mb_mira', LUMEN, 'p_mira', 'paused', 'walk-in', day(-300, LUMEN), null, 'Paused until her shoulder clears — back in March.'],
    ['mb_felix', LUMEN, 'p_felix', 'lapsed', 'social', day(-600, LUMEN), day(-40, LUMEN), 'Card expired, no reply to two emails.'],
    ['mb_sofia', LUMEN, 'p_sofia', 'active', 'website', day(-75, LUMEN), null, ''],
    ['mb_tobias', LUMEN, 'p_tobias', 'active', 'other', day(-500, LUMEN), null, 'Teaches Wednesday and Friday.'],
    ['mb_omar', NORTHROCK, 'p_omar', 'active', 'referral', day(-800, NORTHROCK), null, 'Competition team.'],
    ['mb_nina', NORTHROCK, 'p_nina', 'active', 'walk-in', day(-210, NORTHROCK), null, ''],
    ['mb_ruben', NORTHROCK, 'p_ruben', 'active', 'website', day(-95, NORTHROCK), null, ''],
    ['mb_hana', NORTHROCK, 'p_hana', 'trialling', 'event', day(-4, NORTHROCK), null, 'First week. Zero grappling experience — flag for the fundamentals class.'],
    ['mb_luca', NORTHROCK, 'p_luca', 'cancelled', 'referral', day(-700, NORTHROCK), day(-120, NORTHROCK), 'Moved to Graz.'],
    ['mb_kaya', NORTHROCK, 'p_kaya', 'active', 'other', day(-900, NORTHROCK), null, ''],
  ],
);

// ─── plans ───────────────────────────────────────────────────

// The terms are DELIBERATELY UNEVEN. A seed where every plan is rolling with no
// notice makes a forecast that ignores both look correct — which is how the old
// figure survived while silently excluding annual members altogether.
const plans = insert(
  'plans',
  ['id', 'studio_id', 'name', 'price_cents', 'currency', 'interval', 'class_allowance', 'active', 'minimum_term_months', 'notice_days'],
  [
    // Rolling, a month's notice — the commonest shape.
    ['pl_lumen_unlimited', LUMEN, 'Unlimited', 11900, 'EUR', 'month', null, true, 0, 30],
    // Cancel any time: the plan a studio sells to hesitant people.
    ['pl_lumen_eight', LUMEN, 'Eight a month', 8900, 'EUR', 'month', 8, true, 0, 0],
    // Twelve months up front. Its monthly value is a twelfth of the price, and
    // it was missing from every revenue figure until now.
    ['pl_lumen_year', LUMEN, 'Unlimited, yearly', 119000, 'EUR', 'year', null, true, 12, 0],
    // Six-month commitment, two months' notice — the gym-contract shape.
    ['pl_nr_unlimited', NORTHROCK, 'Full mat', 13500, 'EUR', 'month', null, true, 6, 60],
    ['pl_nr_twice', NORTHROCK, 'Twice a week', 9500, 'EUR', 'month', 8, true, 3, 30],
  ],
);

// `price_cents` NULL means "whatever the plan says", which is almost everybody.
// `notice_given_on` set means somebody is on their way out — and the date they
// actually go is derived by the trigger, not written here.
// ─── enquiries ───────────────────────────────────────────────
//
// PEOPLE, WITH A MEMBERSHIP AT STAGE ZERO. These were a `leads` table carrying
// its own name, email and phone — a second copy of a human that could never
// become the first one without being retyped. They are people now, and their
// enquiry is the same row every member has, one status earlier.
//
// Ida is the payoff: she asked in person and booked a trial. The day she
// signs, ONE WORD CHANGES. Nothing is created, nothing is copied, and her
// source survives to answer "which channel produced this member".
const enquiries = insert(
  'memberships',
  ['id', 'studio_id', 'person_id', 'status', 'source', 'joined_on', 'ended_on', 'notes'],
  [
    ['mb_priya', LUMEN, 'p_priya', 'enquired', 'website', day(-2, LUMEN), null, 'Asked about beginner classes on a weekday evening.'],
    ['mb_tomv', LUMEN, 'p_tomv', 'enquired', 'referral', day(-9, LUMEN), null, 'Ava sent him. Rang Tuesday, wants to try Yin.'],
    ['mb_ida', LUMEN, 'p_ida', 'enquired', 'walk-in', day(-4, LUMEN), null, 'Came in off the street. Booked into Saturday.'],
    // Lost is an ENDED relationship, not a fourth kind of person — the same
    // shape as a member who cancelled, which is the point of folding these
    // together rather than giving prospects their own lifecycle.
    ['mb_rafi', LUMEN, 'p_rafi', 'cancelled', 'social', day(-40, LUMEN), day(-38, LUMEN), 'Price. Went to the studio on Hauptstrasse.'],
    ['mb_mila', NORTHROCK, 'p_mila', 'enquired', 'event', day(-1, NORTHROCK), null, 'Open mat day. Wants the fundamentals block.'],
  ],
);

// ─── everybody else ──────────────────────────────────────────
//
// Gretel is the case worth seeding: the same physio known to BOTH studios, one
// person row, two connections. Under the old shape she would have been two
// unrelated strings in two tables that never met.
const connections = insert(
  'connections',
  ['studio_id', 'person_id', 'kind', 'company', 'notes'],
  [
    [LUMEN, 'p_bo', 'supplier', 'Bodhi Mats', 'Mat cleaning, every second Monday.'],
    [LUMEN, 'p_gretel', 'professional', 'Praxis Neubau', 'Physio we refer to. Takes members same-week.'],
    [NORTHROCK, 'p_gretel', 'professional', 'Praxis Neubau', 'Same physio. One human, two studios that know her.'],
    [NORTHROCK, 'p_wim', 'guest', '', 'Guest seminar in the autumn. Confirmed by email.'],
  ],
);

const subscriptions = insert(
  'subscriptions',
  ['id', 'studio_id', 'membership_id', 'plan_id', 'status', 'started_on', 'ends_on', 'price_cents', 'notice_given_on'],
  [
    // A GRANDFATHERED RATE. Ava joined before the last price rise and pays €99
    // on a plan that now sells for €119. A forecast reading the price list
    // overstates her by €20 a month, every month, silently.
    ['sub_ava', LUMEN, 'mb_ava', 'pl_lumen_unlimited', 'active', day(-420, LUMEN), null, 9900, null],
    ['sub_jonas', LUMEN, 'mb_jonas', 'pl_lumen_eight', 'active', day(-180, LUMEN), null, null, null],
    ['sub_lena', LUMEN, 'mb_lena', 'pl_lumen_eight', 'active', day(-9, LUMEN), null, null, null],
    ['sub_mira', LUMEN, 'mb_mira', 'pl_lumen_unlimited', 'paused', day(-300, LUMEN), null, null, null],
    // On the annual plan, so worth €99.16 a month rather than €1190 — and inside
    // a twelve-month commitment, so that money is contracted rather than hoped for.
    ['sub_sofia', LUMEN, 'mb_sofia', 'pl_lumen_year', 'active', day(-75, LUMEN), null, null, null],
    // LEAVING. Notice given a week ago on a 30-day plan, so the studio keeps his
    // €119 for another three weeks and then does not. Revenue at risk is the
    // number a forecast exists to show.
    ['sub_tobias', LUMEN, 'mb_tobias', 'pl_lumen_unlimited', 'active', day(-500, LUMEN), null, null, day(-7, LUMEN)],
    ['sub_omar', NORTHROCK, 'mb_omar', 'pl_nr_unlimited', 'active', day(-800, NORTHROCK), null, null, null],
    ['sub_nina', NORTHROCK, 'mb_nina', 'pl_nr_unlimited', 'active', day(-210, NORTHROCK), null, null, null],
    // Signed six weeks ago on a three-month term: still committed.
    ['sub_ruben', NORTHROCK, 'mb_ruben', 'pl_nr_twice', 'active', day(-95, NORTHROCK), null, null, null],
    ['sub_hana', NORTHROCK, 'mb_hana', 'pl_nr_twice', 'active', day(-4, NORTHROCK), null, null, null],
    ['sub_kaya', NORTHROCK, 'mb_kaya', 'pl_nr_unlimited', 'active', day(-900, NORTHROCK), null, null, null],
  ],
);

// ─── programs ────────────────────────────────────────────────
//
// `colour` is a HUE name from the kit's identity scale, never a hex and never a
// status word. Competition used to be 'alert' — the same red as a failed
// payment — which drew a red edge in the calendar beside genuinely cancelled
// classes. A stream is an identity; it says nothing about how anything is going.
// `colour` is a TOKEN name, never a hex. A program that carried `#7C3AED` would
// be a colour decision living in the database, invisible to the theme — and the
// first thing to break when a studio changes its palette.

const programs = insert(
  'programs',
  ['id', 'studio_id', 'name', 'blurb', 'colour', 'active'],
  [
    ['pr_vinyasa', LUMEN, 'Vinyasa Flow', 'Breath-led, continuous movement. All levels.', 'violet', true],
    ['pr_yin', LUMEN, 'Yin & Restore', 'Long holds, props, quiet. Evenings.', 'teal', true],
    ['pr_beginners', LUMEN, 'Foundations', 'From nothing, at your own pace. Ask about the next beginners block.', 'amber', true],
    ['pr_gi', NORTHROCK, 'Gi', 'Traditional jiu-jitsu in the gi.', 'indigo', true],
    ['pr_nogi', NORTHROCK, 'No-Gi', 'Grappling without the jacket.', 'sky', true],
    ['pr_fundamentals', NORTHROCK, 'Fundamentals', 'Where everybody starts. Technique first, sparring when you are ready.', 'lime', true],
    ['pr_comp', NORTHROCK, 'Competition', 'For members preparing to compete. Ask a coach.', 'rose', true],
  ],
);

// ─── the weekly grid ─────────────────────────────────────────
//
// weekday: 0 = Sunday. Lumen's week is morning-heavy and thin; North Rock's is
// evening-heavy and dense. That asymmetry is deliberate — a schedule view that
// looks right for one and wrong for the other is a view that hardcoded a shape.

// ─── the blocks ──────────────────────────────────────────────
//
// What a program is NOT. "Foundations" is a stream that runs indefinitely;
// "Foundations — autumn block, six weeks from the 11th, twelve places" is a
// course. Both studios sell one, because both kinds of business do: the yoga
// studio runs beginner blocks, the gym runs an intake course.
//
// Dated deliberately relative to today, so the demo always has a block that is
// open and running rather than one that expired the week the seed was written.
const courses = insert(
  'courses',
  ['id', 'studio_id', 'program_id', 'name', 'blurb', 'starts_on', 'ends_on', 'capacity', 'price_cents'],
  [
    ['co_lumen_found', LUMEN, 'pr_beginners', 'Foundations — autumn block', 'Six weeks, from nothing. Every posture from the beginning, in a room where everybody else is new too.', day(3, LUMEN), day(3 + 35, LUMEN), 12, 12000],
    ['co_rock_intake', NORTHROCK, 'pr_fundamentals', 'Fundamentals intake', 'Four weeks of the basics before you step onto the main mat. No sparring.', day(2, NORTHROCK), day(2 + 21, NORTHROCK), 16, 9000],
  ],
);

const templates = insert(
  'class_templates',
  ['id', 'studio_id', 'program_id', 'name', 'weekday', 'starts_at', 'duration_mins', 'capacity', 'instructor_id', 'active'],
  [
    ['ct_l_mon_am', LUMEN, 'pr_vinyasa', 'Morning Flow', 1, '07:30', 60, 24, 'sf_maren', true],
    ['ct_l_tue_pm', LUMEN, 'pr_yin', 'Yin & Restore', 2, '19:00', 75, 18, 'sf_tobias', true],
    ['ct_l_wed_am', LUMEN, 'pr_vinyasa', 'Morning Flow', 3, '07:30', 60, 24, 'sf_tobias', true],
    ['ct_l_thu_pm', LUMEN, 'pr_beginners', 'Foundations', 4, '18:00', 60, 14, 'sf_maren', true],
    ['ct_l_fri_am', LUMEN, 'pr_vinyasa', 'Morning Flow', 5, '07:30', 60, 24, 'sf_tobias', true],
    ['ct_l_sat_am', LUMEN, 'pr_vinyasa', 'Saturday Open', 6, '09:30', 90, 30, 'sf_maren', true],

    ['ct_n_mon_pm', NORTHROCK, 'pr_gi', 'Gi', 1, '18:30', 90, 28, 'sf_dario', true],
    ['ct_n_mon_fund', NORTHROCK, 'pr_fundamentals', 'Fundamentals', 1, '17:15', 60, 16, 'sf_kaya', true],
    ['ct_n_tue_pm', NORTHROCK, 'pr_nogi', 'No-Gi', 2, '18:30', 90, 28, 'sf_kaya', true],
    ['ct_n_wed_pm', NORTHROCK, 'pr_gi', 'Gi', 3, '18:30', 90, 28, 'sf_dario', true],
    ['ct_n_wed_fund', NORTHROCK, 'pr_fundamentals', 'Fundamentals', 3, '17:15', 60, 16, 'sf_kaya', true],
    ['ct_n_thu_pm', NORTHROCK, 'pr_nogi', 'No-Gi', 4, '18:30', 90, 28, 'sf_kaya', true],
    ['ct_n_fri_pm', NORTHROCK, 'pr_gi', 'Open Mat', 5, '18:30', 120, 30, 'sf_dario', true],
    ['ct_n_sat_am', NORTHROCK, 'pr_comp', 'Competition', 6, '10:00', 120, 12, 'sf_dario', true],
  ],
);

// The course slots. Same table, same generator — a course's weeks ARE a weekly
// rule that happens to stop, which is the whole reason `courses` did not need a
// second kind of schedule.
//
// `generate_sessions` fires on these inserts and bounds itself by the dates, so
// the block's classes appear on the calendar without anything else running.
const courseTemplates = insert(
  'class_templates',
  ['id', 'studio_id', 'program_id', 'course_id', 'name', 'weekday', 'starts_at', 'duration_mins', 'capacity', 'instructor_id', 'starts_on', 'ends_on', 'active'],
  [
    ['ct_l_found_block', LUMEN, 'pr_beginners', 'co_lumen_found', 'Foundations block', 6, '11:00', 75, 12, 'sf_maren', day(3, LUMEN), day(3 + 35, LUMEN), true],
    ['ct_n_intake_block', NORTHROCK, 'pr_fundamentals', 'co_rock_intake', 'Intake', 2, '17:15', 60, 16, 'sf_kaya', day(2, NORTHROCK), day(2 + 21, NORTHROCK), true],
  ],
);

// ─── generated: a term of sessions ───────────────────────────
//
// Every template, every matching weekday, eight weeks back and three forward.
// The history is long on purpose: peak-hour and trend reporting has nothing to
// say about a fortnight, and a demo whose charts are three bars wide sells
// nothing.
// Done in SQL rather than in node so the sessions land on the same clock as
// the studio clock and the column defaults — see `sql.ts` for why that is not a
// detail. `week_key` and `hour_key` are denormalised here because vex has no
// date functions and reporting groups on a column (PLAN.md).
const sessions = /* sql */ `
  INSERT INTO class_sessions
    (id, studio_id, template_id, program_id, name, held_on, starts_at, duration_mins, capacity, instructor_id, status, week_key, hour_key)
  SELECT
    t.id || ':' || to_char(gs.d, 'YYYYMMDD'),
    t.studio_id, t.id, t.program_id, t.name,
    gs.d::date, t.starts_at, t.duration_mins, t.capacity, t.instructor_id,
    'scheduled',
    to_char(gs.d, 'IYYY"-W"IW'),
    split_part(t.starts_at, ':', 1)::int
  FROM class_templates t
  CROSS JOIN generate_series(studio_today(t.studio_id) - 56, studio_today(t.studio_id) + 21, '1 day'::interval) AS gs(d)
  WHERE t.active
    AND EXTRACT(DOW FROM gs.d) = t.weekday
    -- Bounded slots keep their bounds here too. Backfilling eight weeks of
    -- history for a course that starts on Friday would put classes on the
    -- calendar from before the block was sold — and the demo would show a
    -- six-week course with fourteen weeks of sessions.
    AND (t.starts_on IS NULL OR gs.d >= t.starts_on)
    AND (t.ends_on IS NULL OR gs.d <= t.ends_on)
  ON CONFLICT (id) DO NOTHING;
`;

// One cancelled class, so the schedule has to render a hole rather than a
// gap. Next Tuesday at Lumen — Tobias is away.
const cancellation = /* sql */ `
  UPDATE class_sessions SET status = 'cancelled'
  WHERE template_id = 'ct_l_tue_pm'
    AND held_on > studio_today('${LUMEN}')
    AND held_on <= studio_today('${LUMEN}') + 7;
`;

// ─── generated: bookings and attendance ──────────────────────
//
// Deterministic, not random: the md5 of (membership, session) decides, so the
// same rows appear on every boot and a check asserting a count means something.
// Only active-ish memberships book, only past sessions get attendance, and the
// show rate is deliberately short of 100% — a studio that cannot see its
// no-shows cannot see its retention problem.
const bookings = /* sql */ `
  INSERT INTO bookings (id, studio_id, session_id, membership_id, status, booked_at)
  SELECT
    'bk_' || substr(md5(m.id || s.id), 1, 16),
    s.studio_id, s.id, m.id,
    'booked',
    (s.held_on - 3)::timestamptz + interval '11 hours'
  FROM class_sessions s
  JOIN memberships m ON m.studio_id = s.studio_id
  WHERE m.status IN ('active', 'trialling')
    AND s.status = 'scheduled'
    AND s.held_on BETWEEN studio_today(s.studio_id) - 56 AND studio_today(s.studio_id) + 7
    AND ((('x' || substr(md5(m.id || s.id), 1, 7))::bit(28)::int) % 100) < 34;
`;

// A CLASS TODAY, GUARANTEED.
//
// The desk's whole screen is "who is arriving right now", and the check that
// covers it needs a session today with somebody booked into it. That was left
// to the weekly grid happening to teach on whatever weekday the check ran —
// which held until a Sunday, when Lumen teaches nothing and the assertion
// read "none — the seed shifted".
//
// An invariant a check depends on belongs in the seed, not in the calendar's
// good manners. This is a one-off — a session with no template behind it, the
// same shape a workshop has — so it exists on any day of the week.
const todayClass = /* sql */ `
  INSERT INTO class_sessions (id, studio_id, program_id, name, held_on, starts_at, duration_mins, capacity, instructor_id, status, week_key, hour_key)
  SELECT 'cs_today_lumen', 'st_lumen', 'pr_vinyasa', 'Open Practice', studio_today('${LUMEN}'), '12:00', 60, 12, NULL, 'scheduled',
         to_char(studio_today('${LUMEN}'), 'IYYY"-W"IW'), 12
  WHERE NOT EXISTS (SELECT 1 FROM class_sessions WHERE id = 'cs_today_lumen');

  INSERT INTO bookings (id, studio_id, session_id, membership_id, status, booked_at)
  SELECT 'bk_today_ava', 'st_lumen', 'cs_today_lumen', 'mb_ava', 'booked', now()
  WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE id = 'bk_today_ava');
`;
const checkIns = /* sql */ `
  INSERT INTO check_ins (id, studio_id, membership_id, session_id, happened_at, held_on, hour_key, method)
  SELECT
    'ci_' || substr(md5('att' || b.id), 1, 16),
    b.studio_id, b.membership_id, b.session_id,
    s.held_on::timestamptz + (s.starts_at || ':00')::time - interval '6 minutes',
    s.held_on,
    s.hour_key,
    CASE WHEN ((('x' || substr(md5('m' || b.id), 1, 7))::bit(28)::int) % 100) < 70 THEN 'kiosk' ELSE 'desk' END
  FROM bookings b
  JOIN class_sessions s ON s.id = b.session_id
  WHERE s.held_on < studio_today(s.studio_id)
    AND ((('x' || substr(md5('att' || b.id), 1, 7))::bit(28)::int) % 100) < 82;
`;

// ─── one authored beat ───────────────────────────────────────
//
// Hana walked in on Tuesday with no booking and no experience. A walk-in check
// -in with no session is the case the "attendance means a booking" shortcut
// gets wrong, so it is in the seed from the first day rather than found later.
const walkIn = insert(
  'check_ins',
  ['id', 'studio_id', 'membership_id', 'session_id', 'happened_at', 'held_on', 'hour_key', 'method'],
  [['ci_hana_walkin', NORTHROCK, 'mb_hana', null, at(-2, 17, 9, NORTHROCK), day(-2, NORTHROCK), 17, 'desk']],
);

// The counter caches, computed once the bookings and check-ins exist. From here
// on it is the writes' job to keep them true (see schema.ts).
// booked_count needs no backfill — the trigger maintained it as the bookings
// landed. Kept as a no-op comment rather than a redundant UPDATE, because a
// backfill that runs anyway is a backfill nobody notices has stopped working.
const bookedCounts = '';

const attendance = /* sql */ `
  UPDATE bookings b
  SET attended = EXISTS (SELECT 1 FROM check_ins c WHERE c.session_id = b.session_id AND c.membership_id = b.membership_id);
`;

// A member with classes already in their diary, so the member-facing screens
// have something to show on the first look.
//
// Written straight into `bookings` — which is the only table now. It used to go
// through `member_bookings` so the mirror trigger would create the operational
// row, back when a member's bookings lived in two places at once.
//
// Chosen by query rather than by id: the two soonest future sessions Ava is
// not already booked into, so this survives the calendar moving.
const memberDiary = /* sql */ `
  INSERT INTO bookings (studio_id, session_id, membership_id)
  SELECT '${LUMEN}', cs.id, 'mb_ava'
  FROM class_sessions cs
  WHERE cs.studio_id = '${LUMEN}'
    AND cs.held_on > studio_today(cs.studio_id)
    AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.session_id = cs.id AND b.membership_id = 'mb_ava')
  ORDER BY cs.held_on ASC, cs.starts_at ASC
  LIMIT 2;
`;

// One member already in the block, so the course screens have a cohort and the
// fan-out is exercised on every boot. Written as an ENROLMENT, not as six
// bookings — the trigger makes the bookings, which is the whole claim.
const enrolments = /* sql */ `
  INSERT INTO enrolments (studio_id, course_id, membership_id, person_id)
  VALUES ('st_lumen', 'co_lumen_found', 'mb_jonas', 'p_jonas');
`;

// The automations each studio starts with. Rows now, so the screen can create,
// change and remove them — which it could not do while they were constants.
// The automations each studio starts with — as COMPOSITIONS now, not as
// templates. Note the third Lumen row: warn people a week before their trial
// lapses. It needed no new fingerprint; it was two things that already existed
// and could not be said together.
const automations = insert(
  'automations',
  ['id', 'studio_id', 'audience', 'effect', 'run_at', 'trial_days', 'subject', 'body'],
  [
    ['au_lumen_lapse', LUMEN, 'trials.ending', 'trial.lapse', '03:00', 14, '', ''],
    ['au_lumen_remind', LUMEN, 'classes.tomorrow', 'message', '18:00', 14, 'See you tomorrow', 'You are booked in.'],
    ['au_lumen_warn', LUMEN, 'trials.ending', 'message', '09:00', 7, 'Your trial is nearly up', 'Come and talk to us about a plan — we would love to keep you.'],
    ['au_rock_lapse', NORTHROCK, 'trials.ending', 'trial.lapse', '04:00', 21, '', ''],
    ['au_rock_remind', NORTHROCK, 'classes.tomorrow', 'message', '17:00', 21, 'Training tomorrow', 'See you on the mat.'],
  ],
);

export const buildSeedSql = (): string =>
  [themes, studios, people, staff, memberships, plans, subscriptions, programs, courses, templates, courseTemplates, sessions, cancellation, bookings, bookedCounts, checkIns, walkIn, todayClass, attendance, memberDiary, enrolments, automations, enquiries, connections].join('\n');

// The seeded directory, for `inputs` and `scope` — who exists, and where.
// Boot reads this back out of the database rather than trusting this file
// (see server/users.ts); it is exported for the checks, which need names.
export const CAST = {
  lumen: { studio: LUMEN, owner: 'maren@lumen.studio', desk: 'ines@lumen.studio', instructor: 'tobias@lumen.studio', member: 'ava.klein@example.com' },
  northrock: { studio: NORTHROCK, owner: 'dario@northrock.gym', manager: 'kaya@northrock.gym', member: 'omar.haddad@example.com' },
} as const;
