import { day, insert, type Val } from '../sql';
import { LUMEN, NORTHROCK } from './studios';

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

const OUTSIDERS: Person[] = [
  { id: 'p_bo', email: 'bo@bodhimats.at', name: 'Bo Lindqvist', phone: '+43 1 4402211' },
  { id: 'p_gretel', email: 'g.reiter@praxisneubau.at', name: 'Gretel Reiter', phone: '+43 1 5540099' },
  { id: 'p_wim', email: 'wim.declercq@example.com', name: 'Wim De Clercq', phone: '' },
];

// No email on purpose: `auth-check` mints against these two and must get
// nothing back. Two children under one parent, because that is what a scalar
// household id cannot express and a UNIQUE email constraint would refuse.
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

export const GUARDIANSHIPS_SQL = insert(
  'guardianships',
  ['id', 'studio_id', 'guardian_person_id', 'child_person_id'],
  [
    ['gd_ava_emma', LUMEN, 'p_ava', 'p_emma'],
    ['gd_ava_tomk', LUMEN, 'p_ava', 'p_tomk'],
  ],
);

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

export const STUDIO_PEOPLE_SQL = insert(
  'studio_people',
  // `marketing_ok` is false for Jonas on purpose: an active member who has
  // stopped coming is who "we have missed you" selects, and he is the one
  // person it must not reach.
  ['id', 'studio_id', 'person_id', 'source', 'first_seen_on', 'trial_ends_on', 'notes', 'marketing_ok'],
  [
    ['sp_ava', LUMEN, 'p_ava', 'referral', day(-420, LUMEN), null, '', true],
    ['sp_jonas', LUMEN, 'p_jonas', 'website', day(-180, LUMEN), null, 'Asked not to be emailed about anything but his own classes.', false],
    ['sp_lena', LUMEN, 'p_lena', 'event', day(-9, LUMEN), day(4, LUMEN), 'Two-week trial, came from the Saturday open class.', true],
    ['sp_mira', LUMEN, 'p_mira', 'walk-in', day(-300, LUMEN), null, 'Paused until her shoulder clears — back in March.', true],
    ['sp_felix', LUMEN, 'p_felix', 'social', day(-600, LUMEN), day(-586, LUMEN), 'Trialled, never signed. No reply to two emails.', true],
    ['sp_sofia', LUMEN, 'p_sofia', 'website', day(-75, LUMEN), null, '', true],
    ['sp_tobias', LUMEN, 'p_tobias', 'other', day(-500, LUMEN), null, 'Teaches Wednesday and Friday.', true],
    ['sp_omar', NORTHROCK, 'p_omar', 'referral', day(-800, NORTHROCK), null, 'Competition team.', true],
    ['sp_nina', NORTHROCK, 'p_nina', 'walk-in', day(-210, NORTHROCK), null, '', true],
    ['sp_ruben', NORTHROCK, 'p_ruben', 'website', day(-95, NORTHROCK), null, '', true],
    ['sp_hana', NORTHROCK, 'p_hana', 'event', day(-22, NORTHROCK), day(-1, NORTHROCK), 'Trial ran out yesterday. Ask her about a plan.', true],
    ['sp_luca', NORTHROCK, 'p_luca', 'referral', day(-700, NORTHROCK), null, 'Moved to Graz.', true],
    ['sp_kaya', NORTHROCK, 'p_kaya', 'other', day(-900, NORTHROCK), null, '', true],

    ['sp_priya', LUMEN, 'p_priya', 'website', day(-2, LUMEN), null, 'Asked about beginner classes on a weekday evening.', true],
    ['sp_tomv', LUMEN, 'p_tomv', 'referral', day(-9, LUMEN), day(7, LUMEN), 'Ava sent him. Rang Tuesday, wants to try Yin.', true],
    ['sp_ida', LUMEN, 'p_ida', 'walk-in', day(-4, LUMEN), null, 'Came in off the street. Booked into Saturday.', true],
    ['sp_rafi', LUMEN, 'p_rafi', 'social', day(-40, LUMEN), null, 'Price. Went to the studio on Hauptstrasse.', true],
    ['sp_mila', NORTHROCK, 'p_mila', 'event', day(-1, NORTHROCK), null, 'Open mat day. Wants the fundamentals block.', true],

    ['sp_bo', LUMEN, 'p_bo', 'other', day(-370, LUMEN), null, '', true],
    ['sp_gretel_l', LUMEN, 'p_gretel', 'other', day(-500, LUMEN), null, '', true],
    ['sp_gretel_n', NORTHROCK, 'p_gretel', 'other', day(-450, NORTHROCK), null, '', true],
    ['sp_wim', NORTHROCK, 'p_wim', 'other', day(-30, NORTHROCK), null, '', true],

    // `marketing_ok` is false for both children: consent for a child's data is
    // the guardian's to give (GDPR Art. 8, 14 in AT), and nobody has asked Ava.
    ['sp_emma', LUMEN, 'p_emma', 'referral', day(-200, LUMEN), null, 'Ava’s eldest. Tuesday and Thursday kids’ class.', false],
    ['sp_tomk', LUMEN, 'p_tomk', 'referral', day(-95, LUMEN), null, 'Ava’s youngest. Started in the little kids’ group.', false],
  ],
);

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
