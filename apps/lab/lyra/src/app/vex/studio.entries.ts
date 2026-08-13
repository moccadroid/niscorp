import type { CacheEntry, MutationEntry } from './index';
import { money } from '@lyra/app/prisms/format.prism';

// ─── one row, or none ────────────────────────────────────────
const rowText = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: '' } } });
const rowNum = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: 0 } } });

export const studioCurrent: CacheEntry = {
  fingerprint: 'studio/current',
  intent: "The signed-in principal's own studio",
  shape: { studio_id: '', name: '', slug: '', kind: '', timezone: '', reply_to: '', daily_mail_cap: 0, sending_domain: '', sending_domain_id: '', sending_domain_ok: false },
  dsl: {
    from: ['studios'],
    fields: [{ field: 'studios.id', as: 'studio_id' }, 'studios.name', 'studios.slug', 'studios.kind', 'studios.timezone', 'studios.reply_to', 'studios.daily_mail_cap', 'studios.sending_domain', 'studios.sending_domain_id', 'studios.sending_domain_ok'],
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        studio_id: rowText('studio_id'),
        name: rowText('name'),
        slug: rowText('slug'),
        kind: rowText('kind'),
        timezone: rowText('timezone'),
        reply_to: rowText('reply_to'),
        daily_mail_cap: rowNum('daily_mail_cap'),
        sending_domain: rowText('sending_domain'),
        sending_domain_id: rowText('sending_domain_id'),
        sending_domain_ok: { $get: { from: { $var: 'r' }, path: ['sending_domain_ok'], fallback: { $const: false } } },
      },
    },
  },
};

export const membersActiveCount: CacheEntry = {
  fingerprint: 'studio/members/active-count',
  intent: 'How many live subscriptions this studio has on the books',
  shape: { total: 0 },
  dsl: {
    from: ['subscriptions'],
    aggregate: { total: { count: 'subscriptions.id' } },
    filter: { eq: ['subscriptions.status', 'active'] },
  },
  mapping: { $with: { let: { r: { $ref: '$.result' } }, value: { total: rowNum('total') } } },
};

// Turnout today. Counts check-ins rather than bookings on purpose: the question
// a desk asks at 6pm is who actually walked in.
export const checkInsTodayCount: CacheEntry = {
  fingerprint: 'studio/check-ins/today-count',
  intent: 'How many people have checked in at this studio today',
  shape: { total: 0 },
  dsl: {
    from: ['check_ins'],
    aggregate: { total: { count: 'check_ins.id' } },
    filter: { eq: ['check_ins.held_on', { $scope: 'today' }] },
  },
  mapping: { $with: { let: { r: { $ref: '$.result' } }, value: { total: rowNum('total') } } },
};

// ── WHERE A REPLY GOES ───────────────────────────────────────
//
// The one setting that decides whether a member can answer their studio.
// Mail leaves from a shared deployment domain wearing the studio's name, so
// this header is the only thing pointing home: with it blank a reply lands at
// an address nobody reads. Its own fingerprint because it is its own decision
// — not a corner of the appearance form.
export const studioSetReplyTo: MutationEntry = {
  fingerprint: 'studio/set-reply-to',
  intent: 'Set where replies go, and how much this studio may send in a day',
  mutation: {
    op: 'update',
    table: 'studios',
    set: { reply_to: { $context: 'replyTo' }, daily_mail_cap: { $context: 'dailyCap' } },
    // The engine ANDs the caller's own studio onto this, so a forged id
    // selects nothing — the same shape the theme and locale writes take.
    where: { eq: ['studios.id', { $context: 'studioId' }] },
  },
};

// The provider's answer, written down: which domain this studio asked for, the
// id it was given, and whether the DNS has landed. Set by the settings screen
// after the provider has spoken — never guessed here.
export const studioSetDomain: MutationEntry = {
  fingerprint: 'studio/set-domain',
  intent: 'Record this studio’s own sending domain and whether it is verified',
  mutation: {
    op: 'update',
    table: 'studios',
    set: {
      sending_domain: { $context: 'domain' },
      sending_domain_id: { $context: 'domainId' },
      sending_domain_ok: { $context: 'verified' },
    },
    where: { eq: ['studios.id', { $context: 'studioId' }] },
  },
};

// HOW MUCH THIS STUDIO HAS ALREADY SENT TODAY. Counted from the outbox rather
// than kept in a counter, so it cannot drift: `created_on` is the studio's own
// day (the column's default), and `sending` counts because a message in flight
// has been spent whether or not it has landed yet.
export const outboxSentToday: CacheEntry = {
  fingerprint: 'automation/sent-today',
  intent: 'How many messages this studio has sent today',
  shape: { total: 0 },
  dsl: {
    from: ['outbox'],
    aggregate: { total: { count: 'outbox.id' } },
    filter: { and: [{ eq: ['outbox.created_on', { $context: 'today' }] }, { in: ['outbox.state', ['sent', 'sending']] }] },
  },
  mapping: { $with: { let: { r: { $ref: '$.result' } }, value: { total: rowNum('total') } } },
};
