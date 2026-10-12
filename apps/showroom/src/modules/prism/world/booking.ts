import type { JsonObject } from '@niscorp/prism';

export type Session = {
  id: string;
  title: string;
  startAt: string;
  capacity: number;
  booked: number;
  price: number;
  instructor: [string, string];
};

// Not in time order, as a vendor might return it.
export const SESSIONS: readonly Session[] = [
  { id: 'ses_4431', title: 'Weekend long flow', startAt: '2026-10-03T10:00:00+02:00', capacity: 12, booked: 7, price: 2200, instructor: ['Theo', 'Berger'] },
  { id: 'ses_4417', title: 'Morning flow', startAt: '2026-09-28T07:30:00+02:00', capacity: 14, booked: 12, price: 1800, instructor: ['Theo', 'Berger'] },
  { id: 'ses_4418', title: 'Power hour', startAt: '2026-09-28T12:15:00+02:00', capacity: 16, booked: 9, price: 1800, instructor: ['Olivia', 'Stern'] },
  { id: 'ses_4425', title: 'Core & breath', startAt: '2026-09-30T18:00:00+02:00', capacity: 10, booked: 10, price: 1800, instructor: ['Olivia', 'Stern'] },
  { id: 'ses_4421', title: 'Evening stretch', startAt: '2026-09-29T19:00:00+02:00', capacity: 12, booked: 4, price: 1600, instructor: ['Theo', 'Berger'] },
];

export type Happenings = { extraBookings: Readonly<Record<string, number>>; cancelled: ReadonlySet<string> };

export const bookedOf = (s: Session, h: Happenings): number => s.booked + (h.extraBookings[s.id] ?? 0);

export const responseFor = (h: Happenings): JsonObject => ({
  data: {
    location: { id: 'loc_vie_01', display_name: 'Acme Studio', city: 'Vienna', tz: 'Europe/Vienna' },
    sessions: SESSIONS.map((s) => ({
      session_id: s.id,
      kind: 'class',
      status: h.cancelled.has(s.id) ? 'cancelled' : 'scheduled',
      attributes: {
        title: s.title,
        start_at: s.startAt,
        duration_min: 60,
        capacity: s.capacity,
        booked_count: bookedOf(s, h),
        waitlist_count: 0,
        price_cents: s.price,
        instructor: { given_name: s.instructor[0], family_name: s.instructor[1] },
      },
    })),
  },
  meta: { request_id: 'req_91c2f0', page: 1, per_page: 50, total: SESSIONS.length, api_version: '2024-11-01' },
});

export type Language = 'en' | 'de';

const WORDS: Record<Language, { locale: string; heading: string; teacher: string; full: string; one: string; many: string }> = {
  en: { locale: 'en-IE', heading: 'This week at {{studio}}', teacher: 'with {{name}}', full: 'Full', one: '1 spot left', many: '{{n}} spots left' },
  de: { locale: 'de-AT', heading: 'Diese Woche im {{studio}}', teacher: 'mit {{name}}', full: 'Ausgebucht', one: 'Noch 1 Platz', many: 'Noch {{n}} Plätze' },
};

const attr = (...path: string[]) => ({ $get: { from: { $var: 's' }, path: ['attributes', ...path] } });
const left = { $sub: [attr('capacity'), attr('booked_count')] };

export const configFor = (language: Language) => {
  const w = WORDS[language];
  return {
    heading: { $interpolate: { template: w.heading, values: { studio: { $ref: '$.data.location.display_name' } } } },
    classes: {
      $map: {
        over: {
          $sortBy: {
            over: {
              $filter: {
                over: { $ref: '$.data.sessions' },
                as: 's',
                when: { $neq: [{ $get: { from: { $var: 's' }, path: ['status'] } }, { $const: 'cancelled' }] },
              },
            },
            as: 's',
            by: attr('start_at'),
          },
        },
        as: 's',
        body: {
          name: attr('title'),
          when: {
            $localeDate: {
              value: attr('start_at'),
              locale: w.locale,
              options: { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' },
            },
          },
          teacher: { $interpolate: { template: w.teacher, values: { name: attr('instructor', 'given_name') } } },
          price: { $localeMoney: { value: attr('price_cents'), currency: 'EUR', locale: w.locale } },
          spots: {
            $case: {
              branches: [
                { when: { $lte: [left, { $const: 0 }] }, then: { $const: w.full } },
                { when: { $eq: [left, { $const: 1 }] }, then: { $const: w.one } },
              ],
              else: { $interpolate: { template: w.many, values: { n: left } } },
            },
          },
          status: {
            $case: {
              branches: [
                { when: { $lte: [left, { $const: 0 }] }, then: { $const: 'full' } },
                { when: { $lte: [left, { $const: 2 }] }, then: { $const: 'few' } },
              ],
              else: { $const: 'open' },
            },
          },
        },
      },
    },
  };
};
