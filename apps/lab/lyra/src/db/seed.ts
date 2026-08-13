import { at, day, insert, raw, type Val } from './sql';
import { EFFECTS, MOMENTS } from '@lyra/app/reflexes/compose';
import { RECIPES } from '@lyra/app/reflexes/recipes';
import { GERMAN } from './phrases.de';

export const LUMEN = 'st_lumen';
export const NORTHROCK = 'st_northrock';

// ─── the vocabulary, projected ───────────────────────────────
//
// PROJECTED FROM THE SHIPPED CONSTANTS, never typed twice. A moment's
// behaviour is code — its `watch` anchor and its `context` are functions —
// but everything a SCREEN says about it is presentation, and presentation
// belongs in rows where a vex entry can join it and compose a sentence on
// the way out. This is the same move `themes` made, for the same reason.
//
// It is generated here rather than upserted at boot because this is where
// rows come from: the database is rebuilt from this file every start, so
// there is exactly one moment in the lifecycle where the projection could
// drift, and it does not exist.
const vocabulary = [
  insert(
    'automation_moments',
    ['id', 'phrase', 'blurb', 'watched', 'days_label', 'sort'],
    MOMENTS.map((moment, index) => [moment.id, moment.label, moment.blurb, moment.watch !== undefined, moment.daysLabel ?? '', index]),
  ),
  insert(
    'automation_effects',
    ['id', 'phrase', 'blurb', 'subject_label', 'body_label', 'message_hint', 'sort'],
    EFFECTS.map((effect, index) => [
      effect.id,
      effect.label,
      effect.blurb,
      effect.words?.subject ?? '',
      effect.words?.body ?? '',
      effect.words?.hint ?? '',
      index,
    ]),
  ),
  insert(
    'automation_recipes',
    ['id', 'title', 'why', 'icon', 'moment', 'effect', 'run_at', 'days', 'subject', 'body', 'sort'],
    RECIPES.map((recipe, index) => [
      recipe.id,
      recipe.title,
      recipe.why,
      recipe.icon,
      recipe.moment,
      recipe.effect,
      recipe.run_at,
      recipe.days,
      recipe.subject,
      recipe.body,
      index,
    ]),
  ),
].join('\n');

// ─── the studios ─────────────────────────────────────────────

// TWO STUDIOS IN VIENNA READING DIFFERENT LANGUAGES. Not a contrivance — it is
// the demo's whole point for i18n: one deployment, one set of actions, one set
// of rows, and two shells whose every word and every amount differ. Anything
// that leaks between them is a bug the seed makes visible.
// `reply_to` is the studio's OWN address, and it is seeded because a message
// that goes out with none is one a member cannot answer: mail leaves from the
// shared deployment domain wearing the studio's name, so the reply header is
// the only thing pointing home. An empty one is not a small gap — it is a
// reply landing at an address nobody reads.
const studios = insert(
  'studios',
  ['id', 'name', 'slug', 'kind', 'timezone', 'locale', 'theme_id', 'reply_to'],
  [
    [LUMEN, 'Lumen Yoga', 'lumen', 'yoga', 'Europe/Vienna', 'de-AT', 'th_sand', 'hallo@lumenyoga.at'],
    [NORTHROCK, 'North Rock BJJ', 'northrock', 'bjj', 'Europe/Vienna', 'en-GB', 'th_charcoal', 'hello@northrockbjj.at'],
  ],
);

// ─── the words ───────────────────────────────────────────────
//
// Keyed `de`: Vienna and Hamburg read the same sentences. What differs is the
// money and the dates, and `Intl` derives that from the studio's full tag —
// so Lumen's `de-AT` gets these words and Austrian formatting from one row set.
const phrases = insert(
  'phrases',
  ['locale', 'source', 'text'],
  Object.entries(GERMAN).map(([source, text]) => ['de', source, text]),
);

// ─── the looks ───────────────────────────────────────────────
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
        scheme: 'dark',
        'radius-lg': '10px',
      }),
    ],
  ],
);

// ─── people ──────────────────────────────────────────────────

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

const people = insert(
  'people',
  ['id', 'email', 'name', 'phone'],
  [...LUMEN_PEOPLE, ...NORTHROCK_PEOPLE, ...PROSPECTS, ...OUTSIDERS, ...ROBOTS].map((p) => [p.id, p.email, p.name, p.phone] satisfies Val[]),
);

// ─── who works where ─────────────────────────────────────────

const staff = insert(
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
const studioPeople = insert(
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
  ],
);

// ─── offerings ───────────────────────────────────────────────

// The terms are deliberately UNEVEN: a seed where every plan is rolling with no
// notice makes a forecast that ignores both look correct. The pass rows are
// what the old model could not say at all — €18, one class, not a member.
const offerings = insert(
  'offerings',
  ['id', 'studio_id', 'name', 'kind', 'price_cents', 'currency', 'interval', 'class_allowance', 'active', 'minimum_term_months', 'notice_days', 'credits', 'valid_days'],
  [
    // Rolling, a month's notice — the commonest shape.
    ['pl_lumen_unlimited', LUMEN, 'Unlimited', 'recurring', 11900, 'EUR', 'month', null, true, 0, 30, null, null],
    // Cancel any time: the plan a studio sells to hesitant people.
    ['pl_lumen_eight', LUMEN, 'Eight a month', 'recurring', 8900, 'EUR', 'month', 8, true, 0, 0, null, null],
    // Twelve months up front, so its monthly value is a twelfth of the price.
    ['pl_lumen_year', LUMEN, 'Unlimited, yearly', 'recurring', 119000, 'EUR', 'year', null, true, 12, 0, null, null],
    // Six-month commitment, two months' notice — the gym-contract shape.
    ['pl_nr_unlimited', NORTHROCK, 'Full mat', 'recurring', 13500, 'EUR', 'month', null, true, 6, 60, null, null],
    ['pl_nr_twice', NORTHROCK, 'Twice a week', 'recurring', 9500, 'EUR', 'month', 8, true, 3, 30, null, null],

    // A drop-in IS a pass with one credit — no third kind, no special case.
    ['of_lumen_dropin', LUMEN, 'Single class', 'pass', 1800, 'EUR', 'month', null, true, 0, 0, 1, null],
    ['of_lumen_ten', LUMEN, 'Ten classes', 'pass', 15500, 'EUR', 'month', null, true, 0, 0, 10, 180],
    ['of_nr_dropin', NORTHROCK, 'Open mat drop-in', 'pass', 1500, 'EUR', 'month', null, true, 0, 0, 1, null],
  ],
);

// ─── everybody else ──────────────────────────────────────────
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
  ['id', 'studio_id', 'person_id', 'offering_id', 'status', 'started_on', 'ends_on', 'price_cents'],
  [
    // A grandfathered rate: she pays €99 on a plan that now sells for €119, so
    // a forecast reading the price list overstates her by €20 every month.
    ['sub_ava', LUMEN, 'p_ava', 'pl_lumen_unlimited', 'active', day(-420, LUMEN), null, 9900],
    ['sub_jonas', LUMEN, 'p_jonas', 'pl_lumen_eight', 'active', day(-180, LUMEN), null, null],
    ['sub_lena', LUMEN, 'p_lena', 'pl_lumen_eight', 'active', day(-9, LUMEN), null, null],
    ['sub_mira', LUMEN, 'p_mira', 'pl_lumen_unlimited', 'paused', day(-300, LUMEN), null, null],
    // On the annual plan, so worth €99.16 a month rather than €1190 — and inside
    // a twelve-month commitment, so that money is contracted rather than hoped for.
    ['sub_sofia', LUMEN, 'p_sofia', 'pl_lumen_year', 'active', day(-75, LUMEN), null, null],
    // Leaving: notice a week ago on a 30-day plan, so the studio keeps his €119
    // for another three weeks and then does not.
    ['sub_tobias', LUMEN, 'p_tobias', 'pl_lumen_unlimited', 'active', day(-500, LUMEN), null, null],
    ['sub_omar', NORTHROCK, 'p_omar', 'pl_nr_unlimited', 'active', day(-800, NORTHROCK), null, null],
    ['sub_nina', NORTHROCK, 'p_nina', 'pl_nr_unlimited', 'active', day(-210, NORTHROCK), null, null],
    // Signed six weeks ago on a three-month term: still committed.
    ['sub_ruben', NORTHROCK, 'p_ruben', 'pl_nr_twice', 'active', day(-95, NORTHROCK), null, null],
    ['sub_kaya', NORTHROCK, 'p_kaya', 'pl_nr_unlimited', 'active', day(-900, NORTHROCK), null, null],
    // Luca left: a CANCELLED subscription is what "past member" derives from.
    // His leaving date comes from the notice ledger below, like everybody's.
    ['sub_luca', NORTHROCK, 'p_luca', 'pl_nr_unlimited', 'cancelled', day(-700, NORTHROCK), null, null],
  ],
);

// ─── passes ──────────────────────────────────────────────────

// Ida walked in off the street and bought a single class for Saturday — the
// backbone of a yoga studio's trade, and the person the old schema literally
// could not represent without lying about a membership.
const passes = insert(
  'passes',
  ['id', 'studio_id', 'person_id', 'offering_id', 'credits_total', 'paid_via', 'purchased_on'],
  [['pass_ida', LUMEN, 'p_ida', 'of_lumen_dropin', 1, 'manual', day(-4, LUMEN)]],
);

// ─── programs ────────────────────────────────────────────────

// Tobias is leaving. The notice is a ROW now, not a column somebody set: the
// ledger derives `subscriptions.notice_given_on`, and the terms trigger derives
// the day he actually goes from that. Seeding the column directly would leave a
// leaving date nothing backed — and a withdrawal with nothing to withdraw.
// Luca's notice is history: given five months ago, run out, the subscription
// cancelled — which is what his "Left" standing derives from.
const notices = insert(
  'subscription_notices',
  ['studio_id', 'subscription_id', 'given_on'],
  [
    [LUMEN, 'sub_tobias', day(-7, LUMEN)],
    [NORTHROCK, 'sub_luca', day(-150, NORTHROCK)],
  ],
);

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

// ─── the blocks ──────────────────────────────────────────────
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

const courseTemplates = insert(
  'class_templates',
  ['id', 'studio_id', 'program_id', 'course_id', 'name', 'weekday', 'starts_at', 'duration_mins', 'capacity', 'instructor_id', 'starts_on', 'ends_on', 'active'],
  [
    ['ct_l_found_block', LUMEN, 'pr_beginners', 'co_lumen_found', 'Foundations block', 6, '11:00', 75, 12, 'sf_maren', day(3, LUMEN), day(3 + 35, LUMEN), true],
    ['ct_n_intake_block', NORTHROCK, 'pr_fundamentals', 'co_rock_intake', 'Intake', 2, '17:15', 60, 16, 'sf_kaya', day(2, NORTHROCK), day(2 + 21, NORTHROCK), true],
  ],
);

// ─── generated: a term of sessions ───────────────────────────
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
// Whoever holds a live subscription books — the entitlement, not a category,
// is what puts somebody in class.
const bookings = /* sql */ `
  INSERT INTO bookings (id, studio_id, session_id, person_id, status, booked_at)
  SELECT
    'bk_' || substr(md5(m.person_id || s.id), 1, 16),
    s.studio_id, s.id, m.person_id,
    'booked',
    (s.held_on - 3)::timestamptz + interval '11 hours'
  FROM class_sessions s
  JOIN (SELECT DISTINCT studio_id, person_id FROM subscriptions WHERE status = 'active') m
    ON m.studio_id = s.studio_id
  WHERE s.status = 'scheduled'
    AND s.held_on BETWEEN studio_today(s.studio_id) - 56 AND studio_today(s.studio_id) + 7
    AND ((('x' || substr(md5(m.person_id || s.id), 1, 7))::bit(28)::int) % 100) < 34;
`;

const todayClass = /* sql */ `
  INSERT INTO class_sessions (id, studio_id, program_id, name, held_on, starts_at, duration_mins, capacity, instructor_id, status, week_key, hour_key)
  SELECT 'cs_today_lumen', 'st_lumen', 'pr_vinyasa', 'Open Practice', studio_today('${LUMEN}'), '12:00', 60, 12, NULL, 'scheduled',
         to_char(studio_today('${LUMEN}'), 'IYYY"-W"IW'), 12
  WHERE NOT EXISTS (SELECT 1 FROM class_sessions WHERE id = 'cs_today_lumen');

  INSERT INTO bookings (id, studio_id, session_id, person_id, status, booked_at)
  SELECT 'bk_today_ava', 'st_lumen', 'cs_today_lumen', 'p_ava', 'booked', now()
  WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE id = 'bk_today_ava');
`;
const checkIns = /* sql */ `
  INSERT INTO check_ins (id, studio_id, person_id, session_id, happened_at, held_on, hour_key, method)
  SELECT
    'ci_' || substr(md5('att' || b.id), 1, 16),
    b.studio_id, b.person_id, b.session_id,
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
const walkIn = insert(
  'check_ins',
  ['id', 'studio_id', 'person_id', 'session_id', 'happened_at', 'held_on', 'hour_key', 'method'],
  [['ci_hana_walkin', NORTHROCK, 'p_hana', null, at(-2, 17, 9, NORTHROCK), day(-2, NORTHROCK), 17, 'desk']],
);

const bookedCounts = '';

const attendance = /* sql */ `
  UPDATE bookings b
  SET attended = EXISTS (SELECT 1 FROM check_ins c WHERE c.session_id = b.session_id AND c.person_id = b.person_id);
`;

const memberDiary = /* sql */ `
  INSERT INTO bookings (studio_id, session_id, person_id)
  SELECT '${LUMEN}', cs.id, 'p_ava'
  FROM class_sessions cs
  WHERE cs.studio_id = '${LUMEN}'
    AND cs.held_on > studio_today(cs.studio_id)
    AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.session_id = cs.id AND b.person_id = 'p_ava')
  ORDER BY cs.held_on ASC, cs.starts_at ASC
  LIMIT 2;
`;

const enrolments = /* sql */ `
  INSERT INTO enrolments (studio_id, course_id, person_id)
  VALUES ('st_lumen', 'co_lumen_found', 'p_jonas');
`;

const automations = insert(
  'automations',
  ['id', 'studio_id', 'moment', 'effect', 'run_at', 'days', 'subject', 'body'],
  // FIVE ROWS, ONE PER MOMENT, and every one of them is checked end to end in
  // `tide-check`: fired against this data, and asserted on who it reached and
  // what it said. There were seven, and one of them — `au_rock_trial`, on
  // `trial.ended` — selected nobody on any day of this dataset, so it had
  // never sent anything and nothing would have noticed.
  [
    // WATCHED. Fires within a minute of somebody signing, which is the whole
    // reason "somebody joins" is worth automating rather than reading off a
    // list — and, since overlap no longer governs distinct events, it greets
    // all three people who join during an intro night rather than the first.
    ['au_lumen_welcome', LUMEN, 'member.joined', 'email', '09:00', 7, 'Welcome to Lumen', 'We are glad you are here. Come a few minutes early to your first class and somebody will show you around.'],
    // WATCHED. The other minute that decays: somebody asked, and is waiting.
    ['au_lumen_enquiry', LUMEN, 'enquiry.recorded', 'email', '09:00', 7, 'Thanks for getting in touch', 'Thanks for asking about training with us. Come in any time this week and try a class — no charge, no commitment.'],
    // SCHEDULED, with a window: the trial conversation before it closes rather
    // than after somebody notices it did.
    // Three days, not seven, and the number is load-bearing for the check: the
    // seeded trial has four days left, so this selects NOBODY today and Lena
    // once the window opens. A window that cannot be observed closing is a
    // number nobody has tested.
    ['au_lumen_trial', LUMEN, 'trial.ending', 'email', '09:00', 3, 'Your trial is nearly up', 'We would love to keep you on the mat — come and talk to us about a plan.'],
    // SCHEDULED, the money one. Still paying, stopped coming.
    ['au_lumen_quiet', LUMEN, 'member.quiet', 'email', '08:00', 7, 'We have missed you', 'It has been a while. Nothing has changed and your place is still here.'],
    // SCHEDULED, and the fan-out shape: one message per BOOKING, so forty
    // reminders retry independently rather than as one batch that half-fails.
    ['au_lumen_remind', LUMEN, 'class.tomorrow', 'email', '18:00', 7, 'See you tomorrow', 'You are booked in.'],

    // North Rock runs its own, differently worded — two studios, one
    // deployment, and neither can see the other's ledger.
    //
    // The welcome is here ON PURPOSE and not as decoration: both studios now
    // poll the same table with the same question, which is the arrangement
    // that used to have a competitor's automation email your member. The
    // check asserts it does not.
    ['au_rock_welcome', NORTHROCK, 'member.joined', 'email', '09:00', 7, 'Welcome to North Rock', 'First week matters more than the next ten. Come early and somebody will pair you up.'],
    ['au_rock_class', NORTHROCK, 'class.tomorrow', 'email', '17:00', 7, 'Training tomorrow', 'See you on the mat.'],
  ],
);

export const buildSeedSql = (): string =>
  [vocabulary, themes, phrases, studios, people, staff, studioPeople, offerings, subscriptions, passes, notices, programs, courses, templates, courseTemplates, sessions, cancellation, bookings, bookedCounts, checkIns, walkIn, todayClass, attendance, memberDiary, enrolments, automations, connections].join('\n');

export const CAST = {
  lumen: { studio: LUMEN, owner: 'maren@lumen.studio', desk: 'ines@lumen.studio', instructor: 'tobias@lumen.studio', member: 'ava.klein@example.com' },
  northrock: { studio: NORTHROCK, owner: 'dario@northrock.gym', manager: 'kaya@northrock.gym', member: 'omar.haddad@example.com' },
} as const;
