import { createTide } from '@niscorp/tide';
import type { Tide } from '@niscorp/tide';
import { createTideStore } from '@niscorp/tide/postgres';
import { evaluate } from '@niscorp/prism';
import type { MossServer } from '@niscorp/moss';
import { mutationEffect } from '@niscorp/vex';
import type { PgPool } from '@niscorp/vex';
import { MUTATION_ENTRIES } from '@lyra/app/vex';
import { MAIL_ATTEMPTS, STUCK_AFTER_MS, campaignReflex, dispatchReflex, reflexesFor, sweepReflex } from '@lyra/app/reflexes/compose';
import { RESOLVE_PAGE } from '@lyra/app/vex/campaign.entries';
import type { AutomationRow } from '@lyra/app/reflexes/compose';
import { sendMail } from './mail/send';
import { unsubscribeUrl } from './unsubscribe';
import { mintDevToken } from '@niscorp/moss';

type Deps = { server: () => MossServer; now: () => number; pool: PgPool; base: () => string };

const tokenFor = (studioId: string): string => mintDevToken(`automation@${studioId}`);

const callVex = async (deps: { server: () => MossServer }, as: string, fingerprint: string, context: Record<string, unknown>, chain?: { cause: string; depth: number }): Promise<unknown> => {
  const studioId = as.slice(as.indexOf('@') + 1);
  const response = await deps.server().fetch(
    new Request('http://lyra/api/automation/vex', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tokenFor(studioId)}`,
        ...(chain !== undefined ? { 'x-tide-cause': chain.cause, 'x-tide-depth': String(chain.depth) } : {}),
      },
      body: JSON.stringify({ fingerprint, context }),
    }),
  );
  if (!response.ok) {
    const detail: unknown = await response.json().catch(() => null);
    const message = detail !== null && typeof detail === 'object' && 'message' in detail ? String((detail as { message: unknown }).message) : `refused (${response.status})`;
    throw new Error(`${fingerprint}: ${message}`);
  }
  return response.json();
};

export const askAsAutomation = async (
  server: MossServer,
  studioId: string,
  fingerprint: string,
  context: Record<string, unknown>,
): Promise<unknown> => callVex({ server: () => server }, `automation@${studioId}`, fingerprint, context);

// Claim, send, record, in that order. Tide retries, and the claim is what stops
// a second send when the first succeeded and its acknowledgement never arrived.
// A retryable failure puts the row back to `queued` and throws: the throw makes
// tide retry, and the state lets the next attempt win the claim.
const mailEffect = (deps: Deps, as: string | undefined) => ({
  writes: ['outbox'],
  run: async (input: unknown, ctx: import('@niscorp/tide').TideCtx) => {
    if (as === undefined) throw new Error('tide: mail ran with no identity');
    const row = (input ?? {}) as Record<string, unknown>;
    const messageId = String(row['messageId'] ?? '');
    if (messageId === '') throw new Error('tide: mail ran with no message');
    const chain = { cause: `task:${ctx.taskId}`, depth: ctx.depth };

    const claimed = await callVex(
      deps,
      as,
      'outbox/claim',
      { messageId, claimedAt: new Date(deps.now()).toISOString(), abandonedBefore: new Date(deps.now() - STUCK_AFTER_MS).toISOString() },
      chain,
    );
    const changed = claimed !== null && typeof claimed === 'object' && 'result' in claimed ? (claimed as { result: unknown }).result : null;
    if (Array.isArray(changed) && changed.length === 0) return { sent: false, reason: 'already taken' };

    const marketing = row['marketing'] === true || row['marketing'] === 'true';
    const link = marketing ? unsubscribeUrl(deps.base(), String(row['studioId'] ?? ''), String(row['personId'] ?? '')) : '';
    const body = String(row['body'] ?? '');

    if (row['suppressed'] === true || row['suppressed'] === 'true') {
      await callVex(deps, as, 'outbox/record-failed', { messageId, failedReason: 'this address bounced or reported us — not written to again' }, chain);
      return { sent: false, reason: 'suppressed' };
    }

    // The count comes from the outbox and includes this row, already claimed,
    // which is why the comparison is `>` and not `>=`. A capped message fails
    // rather than waits: a late reminder is worse than one that visibly did not go.
    const cap = Number(row['dailyCap'] ?? 0);
    if (cap > 0) {
      const counted = await callVex(deps, as, 'automation/sent-today', { today: new Date(deps.now()).toISOString().slice(0, 10) }, chain);
      const total = Number(((counted as { result?: { total?: unknown } } | null)?.result?.total ?? 0));
      if (total > cap) {
        await callVex(deps, as, 'outbox/record-failed', { messageId, failedReason: `this studio's daily limit of ${cap} messages was reached` }, chain);
        return { sent: false, reason: 'daily cap reached' };
      }
    }

    if (marketing && link === '') {
      await callVex(deps, as, 'outbox/record-failed', { messageId, failedReason: 'no unsubscribe secret configured — marketing mail needs a working opt-out' }, chain);
      return { sent: false, reason: 'no unsubscribe secret configured' };
    }

    const sent = await sendMail({
      to: String(row['to'] ?? ''),
      fromName: String(row['fromName'] ?? ''),
      fromBox: String(row['fromBox'] ?? ''),
      replyTo: String(row['replyTo'] ?? ''),
      subject: String(row['subject'] ?? ''),
      text: link === '' ? body : `${body}\n\n—\nIf you would rather not hear from us: ${link}`,
      ...(link === ''
        ? {}
        : { headers: { 'List-Unsubscribe': `<${link}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
      ...(row['sendingDomainOk'] === true || row['sendingDomainOk'] === 'true' ? { fromDomain: String(row['sendingDomain'] ?? '') } : {}),
      key: messageId,
    }).catch((error: unknown) => ({ ok: false, reason: String(error).slice(0, 200), retry: true }) as const);

    if (sent.ok) {
      await callVex(deps, as, 'outbox/record-sent', { messageId, providerMessageId: sent.id, sentAt: new Date(deps.now()).toISOString() }, chain);
      return { sent: true, id: sent.id };
    }

    // Not requeued on the last attempt: the insert fact that woke this task is
    // consumed, so nothing would ever pick a `queued` row up again.
    if (sent.retry && ctx.attempt < MAIL_ATTEMPTS) {
      await callVex(deps, as, 'outbox/requeue', { messageId, failedReason: sent.reason }, chain);
      throw new Error(`mail: ${sent.reason}`);
    }

    const reason = sent.retry ? `${sent.reason} (gave up after ${ctx.attempt} attempts)` : sent.reason;
    await callVex(deps, as, 'outbox/record-failed', { messageId, failedReason: reason }, chain);
    return { sent: false, reason };
  },
});

const campaignEffect = (deps: Deps, as: string | undefined) => ({
  writes: ['outbox', 'campaigns'],
  run: async (input: unknown, ctx: import('@niscorp/tide').TideCtx) => {
    if (as === undefined) throw new Error('tide: a campaign ran with no identity');
    const row = (input ?? {}) as Record<string, unknown>;
    const campaignId = String(row['campaignId'] ?? '');
    if (campaignId === '') throw new Error('tide: a campaign ran with no campaign');
    const chain = { cause: `task:${ctx.taskId}`, depth: ctx.depth };

    const excluded = Array.isArray(row['excluded']) ? row['excluded'].map((id) => String(id)) : [];
    const days = Number(row['audienceDays'] ?? 0);
    const cutoff = new Date(deps.now() - Math.max(days, 0) * 86_400_000).toISOString().slice(0, 10);

    const question = {
      audience: String(row['audience'] ?? ''),
      cutoff,
      // Absent rather than empty: the entry's exclusion is an optional key,
      // and an empty list is not a filter.
      ...(excluded.length === 0 ? {} : { except: excluded }),
    };

    const refuse = async (reason: string): Promise<{ queued: number; reason: string }> => {
      await callVex(deps, as, 'campaigns/refuse', { campaignId, reason }, chain);
      return { queued: 0, reason };
    };

    const counted = await callVex(deps, as, 'campaigns/audience-writable', question, chain);
    const total = Number((counted as { result?: { ok?: unknown } } | null)?.result?.ok ?? 0);

    if (total === 0) return refuse('nobody in this list can be written to');

    const cap = Number(row['dailyCap'] ?? 0);
    if (cap > 0) {
      const sent = await callVex(deps, as, 'automation/sent-today', { today: new Date(deps.now()).toISOString().slice(0, 10) }, chain);
      const used = Number((sent as { result?: { total?: unknown } } | null)?.result?.total ?? 0);
      const left = cap - used;
      if (total > left) return refuse(`this needed ${total} messages — today's ceiling of ${cap} had room for ${left}`);
    }

    // Paged: the engine gives every read without a limit a limit of its own, and
    // one read would silently drop the rest of the audience. The cursor is
    // `person_id`, which the entry sorts by and which is unique.
    let after = '';
    let queued = 0;
    for (;;) {
      const answered = await callVex(deps, as, 'campaigns/audience-resolve', { ...question, ...(after === '' ? {} : { after }) }, chain);
      const resolved = answered !== null && typeof answered === 'object' && 'result' in answered ? (answered as { result: unknown }).result : answered;
      const page = (Array.isArray(resolved) ? resolved : []) as { person_id?: unknown; to_address?: unknown }[];
      if (page.length === 0) break;

      await callVex(
        deps,
        as,
        'campaigns/fan-out',
        {
          recipients: page.map((r) => ({ person_id: String(r.person_id ?? ''), to_address: String(r.to_address ?? '') })),
          campaignId,
          subject: String(row['subject'] ?? ''),
          body: String(row['body'] ?? ''),
          source: 'campaign',
        },
        chain,
      );

      queued += page.length;
      after = String(page[page.length - 1]?.person_id ?? '');
      if (page.length < RESOLVE_PAGE) break;
    }

    await callVex(deps, as, 'campaigns/stamp-sent', { campaignId, queuedCount: queued, sentAt: new Date(deps.now()).toISOString() }, chain);
    return { queued };
  },
});

export const wireTide = (deps: Deps): Tide => {
  const effects = (as: string | undefined) => ({
    'mail.send': mailEffect(deps, as),
    'campaign.fanOut': campaignEffect(deps, as),
    ...Object.fromEntries(
      MUTATION_ENTRIES.map((entry) => [
        entry.fingerprint,
        {
          writes: [...new Set(mutationEffect(entry.mutation).map((effect) => effect.table))],
          run: async (input: unknown, ctx: import('@niscorp/tide').TideCtx) => {
            if (as === undefined) throw new Error('tide: an effect ran with no identity');
            return callVex(deps, as, entry.fingerprint, (input ?? {}) as Record<string, unknown>, { cause: `task:${ctx.taskId}`, depth: ctx.depth });
          },
        },
      ]),
    ),
  });

  return createTide({
    store: createTideStore(deps.pool),

    storeUnwatchedWrites: false,

    transform: (config, source) => evaluate(config, source as never),

    select: async (query, ctx) => {
      const spec = query as { fingerprint: string; context?: Record<string, unknown> };
      const as = typeof ctx.actor === 'string' ? ctx.actor : '';
      if (as === '') throw new Error('tide: a selection ran with no identity');

      const body = await callVex(deps, as, spec.fingerprint, spec.context ?? {});
      const rows = body !== null && typeof body === 'object' && 'result' in body ? (body as { result: unknown }).result : body;
      if (!Array.isArray(rows)) throw new Error(`tide: ${spec.fingerprint} did not answer with rows`);
      return rows as Record<string, unknown>[];
    },

    effects,

    actor: (as) => as,
  });
};

export const reflexesForEveryStudio = (studios: { id: string; timezone: string }[], rows: readonly (AutomationRow & { studio_id: string })[]) =>
  studios.flatMap((studio) => [
    // Infrastructure, loaded per studio because a fact is stamped with the
    // studio's own robot and can only wake that studio's reflexes.
    dispatchReflex(studio.id),
    sweepReflex(studio.id, studio.timezone),
    campaignReflex(studio.id),
    ...reflexesFor(
      studio.id,
      studio.timezone,
      rows.filter((row) => row.studio_id === studio.id),
    ),
  ]);
