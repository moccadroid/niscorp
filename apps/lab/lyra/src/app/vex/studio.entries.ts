import type { CacheEntry, MutationEntry } from './index';
import { money } from '@lyra/app/prisms/format.prism';

const rowText = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: '' } } });
const rowNum = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: 0 } } });

export const studioCurrent: CacheEntry = {
  fingerprint: 'studio/current',
  intent: "The signed-in principal's own studio",
  shape: { studio_id: '', name: '', slug: '', kind: '', timezone: '', legal_form: '', legal_name: '', address: '', vat_id: '', reply_to: '', daily_mail_cap: 0, sending_domain: '', sending_domain_id: '', sending_domain_ok: false },
  dsl: {
    from: ['studios'],
    fields: [{ field: 'studios.id', as: 'studio_id' }, 'studios.name', 'studios.slug', 'studios.kind', 'studios.timezone', 'studios.legal_form', 'studios.legal_name', 'studios.address', 'studios.vat_id', 'studios.reply_to', 'studios.daily_mail_cap', 'studios.sending_domain', 'studios.sending_domain_id', 'studios.sending_domain_ok'],
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

export const studioSetReplyTo: MutationEntry = {
  fingerprint: 'studio/set-reply-to',
  intent: 'Set where replies go, and how much this studio may send in a day',
  mutation: {
    op: 'update',
    table: 'studios',
    set: { reply_to: { $context: 'replyTo' }, daily_mail_cap: { $context: 'dailyCap' } },
    // The engine ANDs the caller's own studio on: a forged id selects nothing.
    where: { eq: ['studios.id', { $context: 'studioId' }] },
  },
};

export const studioSetBusiness: MutationEntry = {
  fingerprint: 'studio/set-business',
  intent: 'Record the registered name, address and VAT number this studio trades under',
  mutation: {
    op: 'update',
    table: 'studios',
    set: { legal_name: { $context: 'legalName' }, address: { $context: 'address' }, vat_id: { $context: 'vatId' } },
    where: { eq: ['studios.id', { $context: 'studioId' }] },
  },
};

export const studioSetLegalForm: MutationEntry = {
  fingerprint: 'studio/set-legal-form',
  intent: 'Say whether this studio is a company or a sole trader',
  mutation: {
    op: 'update',
    table: 'studios',
    set: { legal_form: { $context: 'legalForm' } },
    where: { eq: ['studios.id', { $context: 'studioId' }] },
  },
};

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

// `sending` counts: a message in flight is spent whether or not it has landed.
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

// The join is LEFT (`theme_id` is nullable): a studio that names no theme
// answers nulls and the shell falls back to stock.
export const studioTheme: CacheEntry = {
  fingerprint: 'studio/theme',
  intent: "The session studio's look — name and tokens, stock when it names none",
  shape: { name: '', tokens: {} },
  dsl: {
    from: ['studios', 'themes'],
    fields: [{ field: 'themes.name', as: 'name' }, 'themes.tokens'],
    limit: 1,
  },
  mapping: {
    name: { $get: { from: { $ref: '$.result' }, path: ['name'], fallback: { $const: '' } } },
    tokens: { $get: { from: { $ref: '$.result' }, path: ['tokens'], fallback: { $const: {} } } },
  },
};
