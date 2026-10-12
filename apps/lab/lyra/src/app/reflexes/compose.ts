import type { ReflexInput } from '@niscorp/tide';
import { bookingsOnDay, enquiredPerson, joinedSubscription, membersLapsedAway, outboxStuck, queueMessage, trialsDue } from '@lyra/app/vex/tide.entries';

export type AutomationRow = {
  id: string;
  moment: string;
  effect: string;
  enabled: boolean;
  run_at: string;
  days: number;
  subject: string;
  body: string;
};

export type Moment = {
  id: string;
  label: string;
  blurb: string;
  watched: boolean;
  // `anchor` is a prism template evaluated at fan-out with `$.fact` in scope,
  // so the selection re-reads the row the write committed.
  watch?: { entity: string; op: 'insert' | 'update' | 'delete'; anchor: Record<string, unknown> };
  daysLabel?: string;
  unitKey: string;
  fingerprint: string;
  context: (row: AutomationRow) => Record<string, unknown>;
  hasClass?: boolean;
  // The selection behind a marketing moment must carry the opt-in test; the row
  // it queues carries the flag that puts the unsubscribe footer on the wire.
  marketing?: boolean;
};

const dayOffset = (amount: number): Record<string, unknown> => ({
  $date: { value: { $dateAdd: { date: { $ref: '$.now' }, amount, unit: 'day' } }, format: 'YYYY-MM-DD' },
});

const FAR_FUTURE = '9999-12-31';

export const MOMENTS: readonly Moment[] = [
  {
    id: 'member.joined',
    label: 'somebody joins',
    blurb: 'The moment a subscription starts — the highest-value minute a studio has, and the one nothing used to notice.',
    watched: true,
    watch: { entity: 'subscriptions', op: 'insert', anchor: { subscriptionId: { $ref: '$.fact.row.id' } } },
    unitKey: 'subscription_id',
    fingerprint: joinedSubscription.fingerprint,
    context: () => ({}),
  },
  {
    id: 'enquiry.recorded',
    label: 'somebody enquires',
    blurb: 'The moment somebody new is written down. Replying within minutes is the difference between a member and a lost one.',
    watched: true,
    watch: { entity: 'studio_people', op: 'insert', anchor: { studioPersonId: { $ref: '$.fact.row.id' } } },
    unitKey: 'studio_person_id',
    fingerprint: enquiredPerson.fingerprint,
    context: () => ({}),
  },

  {
    id: 'trial.ending',
    label: 'a trial is about to run out',
    blurb: 'People whose free window closes within the next few days — while there is still time to ask them.',
    watched: false,
    daysLabel: 'Days of notice',
    unitKey: 'studio_person_id',
    fingerprint: trialsDue.fingerprint,
    context: (row) => ({ from: dayOffset(0), cutoff: dayOffset(row.days) }),
  },
  {
    id: 'member.quiet',
    label: 'somebody stops coming',
    blurb: 'Still paying, no class attended inside the window. The people a studio loses without noticing.',
    watched: false,
    daysLabel: 'Days without a visit',
    unitKey: 'subscription_id',
    fingerprint: membersLapsedAway.fingerprint,
    context: (row) => ({ cutoff: dayOffset(-row.days) }),
    marketing: true,
  },
  {
    id: 'class.tomorrow',
    label: "it is the day before somebody's class",
    blurb: 'One message per person per class, so forty reminders retry independently.',
    watched: false,
    unitKey: 'booking_id',
    fingerprint: bookingsOnDay.fingerprint,
    context: () => ({ day: dayOffset(1) }),
    hasClass: true,
  },
];

type Effect = {
  id: string;
  label: string;
  blurb: string;
  words?: { subject: string; body?: string; hint: string };
  fingerprint: string;
  input: (row: AutomationRow, moment: Moment) => Record<string, unknown>;
};

const withFacts = (text: string, moment: Moment): Record<string, unknown> | string => {
  if (moment.hasClass !== true) return text;
  return { $join: { parts: [text, ' (', { $ref: '$.row.class_name' }, ' at ', { $ref: '$.row.starts_at' }, ')'], sep: '' } };
};

export const EFFECTS: readonly Effect[] = [
  {
    id: 'email',
    label: 'email them',
    blurb: 'Sent in your studio’s name. Every message is kept in the outbox, so you can see what went and what did not.',
    words: { subject: 'Subject', body: 'Message', hint: 'What they would receive. Your words, in your studio’s name.' },
    fingerprint: queueMessage.fingerprint,
    input: (row, moment) => ({
      personId: { $ref: '$.row.person_id' },
      // The anchor's resolved address, not `people.email`: for a child that is
      // NULL and this is their guardian's.
      toAddress: { $ref: '$.row.mail_to' },
      subject: row.subject,
      body: withFacts(row.body, moment),
      source: row.id,
      marketing: moment.marketing === true,
    }),
  },
];

export const selectionFor = (moment: Moment, row: AutomationRow): { fingerprint: string; context: Record<string, unknown> } => ({
  fingerprint: moment.fingerprint,
  // A watched moment's anchor refs (`$.fact.row.…`) resolve only at fan-out:
  // a rehearsal has no fact and must not run this selection.
  context: { ...moment.context(row), ...(moment.watch?.anchor ?? {}), horizon: FAR_FUTURE },
});

export const momentById = (id: string): Moment | undefined => MOMENTS.find((m) => m.id === id);
export const effectById = (id: string): Effect | undefined => EFFECTS.find((e) => e.id === id);

export const pairs = (momentId: string, effectId: string): boolean =>
  momentById(momentId) !== undefined && effectById(effectId) !== undefined;

export const nameOf = (row: { moment: string; effect: string }): string => {
  const m = momentById(row.moment);
  const e = effectById(row.effect);
  if (m === undefined || e === undefined) return `${row.moment} → ${row.effect}`;
  return `When ${m.label}, ${e.label}`;
};

export const reflexIdFor = (studioId: string, row: { id: string }): string => `${studioId}:${row.id}`;

// Tide counts attempts from 1, so the last is `MAIL_RETRIES + 1`. The effect
// needs it: on its last attempt it must not put the row back in the queue.
export const MAIL_RETRIES = 2;
export const MAIL_ATTEMPTS = MAIL_RETRIES + 1;

// Long enough that the sweep never races the dispatcher.
export const STUCK_AFTER_MS = 15 * 60_000;

// The dispatcher's write fact is delivered once: a process that dies mid-send,
// or a row put back by hand, has nothing left to wake it. The claim stops this
// sweep colliding with a dispatcher that is merely slow.
export const sweepReflex = (studioId: string, timezone: string): ReflexInput => ({
  id: `${studioId}:outbox-sweep`,
  intent: 'Send what never went out.',
  as: `automation@${studioId}`,
  on: { clock: { every: 'day', at: '04:00', tz: timezone } },
  select: {
    query: { fingerprint: outboxStuck.fingerprint, context: { stuckBefore: { $dateAdd: { date: { $ref: '$.now' }, amount: -15, unit: 'minute' } } } },
    mode: 'each',
    unitKey: 'message_id',
  },
  effect: {
    name: 'mail.send',
    input: {
      messageId: { $ref: '$.row.message_id' },
      to: { $ref: '$.row.to_address' },
      subject: { $ref: '$.row.subject' },
      body: { $ref: '$.row.body' },
      fromName: { $ref: '$.row.from_name' },
      fromBox: { $ref: '$.row.from_box' },
      replyTo: { $ref: '$.row.reply_to' },
      marketing: { $ref: '$.row.marketing' },
      personId: { $ref: '$.row.person_id' },
      studioId: { $ref: '$.row.studio_id' },
      suppressed: { $ref: '$.row.suppressed' },
      sendingDomain: { $ref: '$.row.sending_domain' },
      sendingDomainOk: { $ref: '$.row.sending_domain_ok' },
      dailyCap: { $ref: '$.row.daily_cap' },
    },
  },
  // No `catchUp: 'skip'`: after a missed night these rows are still waiting.
  policy: { retry: { max: MAIL_RETRIES, backoff: 'fixed', baseMs: 30_000 }, timeoutMs: 15_000, overlap: 'skip' },
  enabled: true,
});

export const dispatchReflex = (studioId: string): ReflexInput => ({
  id: `${studioId}:outbox-dispatch`,
  intent: 'Send what the automations queued.',
  as: `automation@${studioId}`,
  on: { fact: { entity: 'outbox', op: 'insert' } },
  select: {
    query: {
      fingerprint: 'automation/outbox-queued',
      context: { messageId: { $ref: '$.fact.row.id' } },
    },
    mode: 'each',
    unitKey: 'message_id',
  },
  effect: {
    name: 'mail.send',
    input: {
      messageId: { $ref: '$.row.message_id' },
      to: { $ref: '$.row.to_address' },
      subject: { $ref: '$.row.subject' },
      body: { $ref: '$.row.body' },
      fromName: { $ref: '$.row.from_name' },
      fromBox: { $ref: '$.row.from_box' },
      replyTo: { $ref: '$.row.reply_to' },
      marketing: { $ref: '$.row.marketing' },
      personId: { $ref: '$.row.person_id' },
      studioId: { $ref: '$.row.studio_id' },
      suppressed: { $ref: '$.row.suppressed' },
      sendingDomain: { $ref: '$.row.sending_domain' },
      sendingDomainOk: { $ref: '$.row.sending_domain_ok' },
      dailyCap: { $ref: '$.row.daily_cap' },
    },
  },
  policy: { retry: { max: MAIL_RETRIES, backoff: 'fixed', baseMs: 30_000 }, timeoutMs: 15_000, overlap: 'skip' },
  enabled: true,
});

// The effect re-asks the audience question when the mail is written, so
// somebody who opted out after the sheet was drawn is not reached. It arms on
// any insert: `campaigns/pending` answers only for `state = 'sending'`.
export const campaignReflex = (studioId: string): ReflexInput => ({
  id: `${studioId}:campaign-fanout`,
  intent: 'Turn what the studio decided to say into mail for the people it reaches.',
  as: `automation@${studioId}`,
  on: { fact: { entity: 'campaigns', op: 'insert' } },
  select: {
    query: { fingerprint: 'campaigns/pending', context: { campaignId: { $ref: '$.fact.row.id' } } },
    mode: 'each',
    unitKey: 'campaign_id',
  },
  effect: {
    name: 'campaign.fanOut',
    input: {
      campaignId: { $ref: '$.row.campaign_id' },
      studioId: { $ref: '$.row.studio_id' },
      audience: { $ref: '$.row.audience' },
      audienceDays: { $ref: '$.row.audience_days' },
      excluded: { $ref: '$.row.excluded' },
      subject: { $ref: '$.row.subject' },
      body: { $ref: '$.row.body' },
      dailyCap: { $ref: '$.row.daily_cap' },
    },
  },
  // A retry is safe: the fan-out inserts ON CONFLICT DO NOTHING against
  // `outbox_campaign_person`, so a second run mails nobody twice.
  policy: { retry: { max: MAIL_RETRIES, backoff: 'fixed', baseMs: 30_000 }, timeoutMs: 30_000, overlap: 'skip' },
  enabled: true,
});

export const reflexesFor = (studioId: string, timezone: string, rows: readonly AutomationRow[] = []): ReflexInput[] => {
  const as = `automation@${studioId}`;
  const reflexes: ReflexInput[] = [];

  for (const row of rows) {
    const moment = momentById(row.moment);
    const effect = effectById(row.effect);
    if (moment === undefined || effect === undefined) continue;

    reflexes.push({
      id: reflexIdFor(studioId, row),
      intent: `${nameOf(row)}.`,
      as,
      on: moment.watch !== undefined ? { fact: { entity: moment.watch.entity, op: moment.watch.op } } : { clock: { every: 'day', at: row.run_at, tz: timezone } },
      params: { days: row.days },
      select: {
        query: selectionFor(moment, row),
        mode: 'each',
        unitKey: moment.unitKey,
      },
      effect: { name: effect.fingerprint, input: effect.input(row, moment) },
      // Clocks only: a night missed while the process was down must not
      // produce yesterday's reminders at noon.
      policy: { retry: { max: 2, backoff: 'fixed', baseMs: 30_000 }, timeoutMs: 15_000, overlap: 'skip', ...(moment.watch === undefined ? { catchUp: 'skip' as const } : {}) },
      enabled: row.enabled,
    });
  }

  return reflexes;
};
