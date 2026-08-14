import { createTide } from '@niscorp/tide';
import type { Tide } from '@niscorp/tide';
import { evaluate } from '@niscorp/prism';
import { createTideStore } from '@niscorp/moss';
import type { MossServer } from '@niscorp/moss';
import { mutationEffect } from '@niscorp/vex';
import type { PgPool } from '@niscorp/vex';
import { MUTATION_ENTRIES } from '@lyra/app/vex';
import { MAIL_ATTEMPTS, STUCK_AFTER_MS, dispatchReflex, reflexesFor, sweepReflex } from '@lyra/app/reflexes/compose';
import type { AutomationRow } from '@lyra/app/reflexes/compose';
import { sendMail } from './mail/send';
import { unsubscribeUrl } from './unsubscribe';
import { mintDevToken } from '@niscorp/moss';

type Deps = { server: () => MossServer; now: () => number; pool: PgPool; base: () => string };

// PURE. A studio's robot IS `automation@<studioId>` — the id names the tenant,
// so minting the credential reads nothing, and the chain-trust comparison in
// app.ts (`userId === automationActor`) is exact instead of inferred. The
// principal resolves like any other: identity gives it the automation rung and
// its studio's scope, and the engine treats it as just another client.
const tokenFor = (studioId: string): string => mintDevToken(`automation@${studioId}`);

// One POST to the app's own surface. `as` carries the studio, so the identity
// travels with the work rather than being ambient. `chain` carries the run's
// position when an EFFECT is the caller — the bridge stamps it onto the facts
// it mints from this write, so the depth ceiling survives the trip through
// the database. Moss trusts the headers only because `facts.chain` (app.ts)
// vouches for the automation principal this token names.
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

// ASK THE SAME QUESTION THE AUTOMATION WOULD, AS THE AUTOMATION.
//
// Exported so the builder's rehearsal runs down the identical path a reflex
// does — same fingerprint, same principal, same compiled scope policy. That
// is the whole value of it: three of the moments this app used to ship named
// tables the automation rung cannot read, so they were REFUSED on every run,
// and the screen offering them had no way to know. Asking as somebody else —
// the operator, say — would have answered happily and proved nothing.
export const askAsAutomation = async (
  server: MossServer,
  studioId: string,
  fingerprint: string,
  context: Record<string, unknown>,
): Promise<unknown> => callVex({ server: () => server }, `automation@${studioId}`, fingerprint, context);

// ── THE ONE EFFECT THAT IS NOT A WRITE ───────────────────────
//
// Every other effect in this registry is a vex mutation replayed. This one
// leaves the building: it hands a composed message to the mail transport and
// then records what happened — which it does through vex, as the same
// automation principal, so the write is scoped and observed like any other.
//
// THE ORDER IS THE DESIGN. Claim, send, record:
//
//   CLAIM first, because tide retries and the dangerous case is not a failure
//   — it is a send that succeeded and whose acknowledgement never arrived. The
//   claim answers with no row when somebody already took it, and this stops.
//
//   RECORD always, including when the send threw, because a row left saying
//   `sending` is a message nobody will ever look at again. The only path that
//   can still strand one is the process dying mid-send; that wants a sweep,
//   and it is not this.
//
// A retryable failure puts the row BACK to `queued` and throws — the throw is
// what tells tide to use the retry policy the reflex already carries, and the
// state is what lets the next attempt win the claim again.
const mailEffect = (deps: Deps, as: string | undefined) => ({
  writes: ['outbox'],
  run: async (input: unknown, ctx: import('@niscorp/tide').TideCtx) => {
    if (as === undefined) throw new Error('tide: mail ran with no identity');
    const row = (input ?? {}) as Record<string, unknown>;
    const messageId = String(row['messageId'] ?? '');
    if (messageId === '') throw new Error('tide: mail ran with no message');
    const chain = { cause: `task:${ctx.taskId}`, depth: ctx.depth };

    // An UPDATE answers with the rows it changed. None means the WHERE found
    // no queued row under this studio's scope — already claimed, already sent,
    // or not ours — and every one of those is a reason not to send.
    const claimed = await callVex(
      deps,
      as,
      'outbox/claim',
      { messageId, claimedAt: new Date(deps.now()).toISOString(), abandonedBefore: new Date(deps.now() - STUCK_AFTER_MS).toISOString() },
      chain,
    );
    const changed = claimed !== null && typeof claimed === 'object' && 'result' in claimed ? (claimed as { result: unknown }).result : null;
    if (Array.isArray(changed) && changed.length === 0) return { sent: false, reason: 'already taken' };

    // ── WHAT MARKETING MAIL CARRIES THAT OTHER MAIL DOES NOT ──
    //
    // A footer somebody can click, and the headers a mailbox provider reads:
    // Gmail and Yahoo surface their own one-click control from these, and mail
    // sent in volume without them is mail that lands in spam. Both are added
    // HERE rather than written into the studio's words, because a studio
    // composing its own opt-out is a studio that can forget to.
    //
    // A class reminder gets neither. It is not marketing, and an unsubscribe
    // link on a booking confirmation teaches people to expect one everywhere.
    const marketing = row['marketing'] === true || row['marketing'] === 'true';
    const link = marketing ? unsubscribeUrl(deps.base(), String(row['studioId'] ?? ''), String(row['personId'] ?? '')) : '';
    const body = String(row['body'] ?? '');

    // A DEAD ADDRESS, OR SOMEBODY WHO REPORTED US. Either way the provider has
    // already told us, and sending again is how a shared sending domain loses
    // its reputation for every studio on it at once.
    if (row['suppressed'] === true || row['suppressed'] === 'true') {
      await callVex(deps, as, 'outbox/record-failed', { messageId, failedReason: 'this address bounced or reported us — not written to again' }, chain);
      return { sent: false, reason: 'suppressed' };
    }

    // ── THE CEILING ──────────────────────────────────────────
    //
    // Asked AFTER the claim, so a message counted against the cap is one that
    // was genuinely about to go, and BEFORE the send, so the cap is a limit
    // rather than a report. The count comes from the outbox itself (there is
    // no counter to drift) and it includes this row, which is why the
    // comparison is `>` and not `>=`.
    //
    // A capped message FAILS rather than waiting: a reminder about tomorrow's
    // class delivered the day after tomorrow is worse than one that visibly
    // did not go, and a studio that hit its ceiling has something to see.
    const cap = Number(row['dailyCap'] ?? 0);
    if (cap > 0) {
      const counted = await callVex(deps, as, 'automation/sent-today', { today: new Date(deps.now()).toISOString().slice(0, 10) }, chain);
      const total = Number(((counted as { result?: { total?: unknown } } | null)?.result?.total ?? 0));
      if (total > cap) {
        await callVex(deps, as, 'outbox/record-failed', { messageId, failedReason: `this studio's daily limit of ${cap} messages was reached` }, chain);
        return { sent: false, reason: 'daily cap reached' };
      }
    }

    // NO WAY OUT, NO MESSAGE. A deployment with no signing seed cannot mint a
    // link that will ever verify, so marketing mail would go out carrying an
    // opt-out that answers "not one we recognise" — worse than none, because
    // it is a promise. The row says so and stops; it is a configuration
    // problem, so it reads like one rather than like a delivery failure.
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
      // The row's own id: the provider refuses a duplicate of it, and the
      // claim above refused one before that.
      // A STUDIO'S OWN DOMAIN, only once the provider has verified it. An
      // unverified one is not a sender, it is an intention.
      ...(row['sendingDomainOk'] === true || row['sendingDomainOk'] === 'true' ? { fromDomain: String(row['sendingDomain'] ?? '') } : {}),
      key: messageId,
    }).catch((error: unknown) => ({ ok: false, reason: String(error).slice(0, 200), retry: true }) as const);

    if (sent.ok) {
      await callVex(deps, as, 'outbox/record-sent', { messageId, providerMessageId: sent.id, sentAt: new Date(deps.now()).toISOString() }, chain);
      return { sent: true, id: sent.id };
    }

    // WORTH ANOTHER GO, AND THERE IS ANOTHER GO TO HAVE. Both halves matter:
    // requeueing on the LAST attempt would leave the row `queued` with nobody
    // left to read it — the insert fact that woke this is long consumed, so
    // nothing would ever pick it up again and a studio would see "Not sent"
    // forever. A message that has run out of attempts has failed, and the row
    // has to say so.
    if (sent.retry && ctx.attempt < MAIL_ATTEMPTS) {
      await callVex(deps, as, 'outbox/requeue', { messageId, failedReason: sent.reason }, chain);
      throw new Error(`mail: ${sent.reason}`);
    }

    const reason = sent.retry ? `${sent.reason} (gave up after ${ctx.attempt} attempts)` : sent.reason;
    await callVex(deps, as, 'outbox/record-failed', { messageId, failedReason: reason }, chain);
    return { sent: false, reason };
  },
});

export const wireTide = (deps: Deps): Tide => {
  const effects = (as: string | undefined) => ({
    'mail.send': mailEffect(deps, as),
    ...Object.fromEntries(
      MUTATION_ENTRIES.map((entry) => [
        entry.fingerprint,
        {
          // DERIVED, never declared: the tables this effect writes fall out
          // of its own mutation definition, so the flow graph's cycle
          // refusal sees the truth. A blind edge in the load report now
          // genuinely means "something bypassed vex".
          writes: [...new Set(mutationEffect(entry.mutation).map((effect) => effect.table))],
          run: async (input: unknown, ctx: import('@niscorp/tide').TideCtx) => {
            if (as === undefined) throw new Error('tide: an effect ran with no identity');
            // The write this performs comes back as facts (the vex bridge);
            // forwarding the task and depth is what keeps that re-entry ON
            // the chain instead of starting a fresh one.
            return callVex(deps, as, entry.fingerprint, (input ?? {}) as Record<string, unknown>, { cause: `task:${ctx.taskId}`, depth: ctx.depth });
          },
        },
      ]),
    ),
  });

  return createTide({
    store: createTideStore(deps.pool),

    // EVERY COMMITTED WRITE IN THIS APP MINTS A FACT (app.ts, the bridge), and
    // three (entity, op) pairs are watched. Every booking, check-in, note and
    // payment was paying for an awaited INSERT into `tide_fact` for a row no
    // reflex could ever match — on the hot path of the click that caused it,
    // and swept a week later having been read by nobody.
    //
    // Lyra's audit trail is its own tables, not tide's ledger: `outbox` says
    // what was sent, `notifications` what was told, `tide_run` how each
    // automation ran. What is given up is `ledger.facts()` meaning "every
    // write this app committed", which nothing here has ever asked it.
    storeUnwatchedWrites: false,

    transform: (config, source) => evaluate(config, source as never),

    select: async (query, ctx) => {
      const spec = query as { fingerprint: string; context?: Record<string, unknown> };
      const as = typeof ctx.actor === 'string' ? ctx.actor : '';
      if (as === '') throw new Error('tide: a selection ran with no identity');

      const body = await callVex(deps, as, spec.fingerprint, spec.context ?? {});
      // The vex surface answers `{ result, meta }`, not a bare array — reading
      // the envelope as the rows yields ZERO rows rather than an error, which is
      // a reflex that silently never fires.
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
    // NOT ONE OF THE STUDIO'S AUTOMATIONS — infrastructure, per studio because
    // a fact is stamped with the studio's own robot and can only wake that
    // studio's reflexes. It exists for a studio that has set up nothing at all:
    // the day they arm their first automation, the thing that sends is already
    // standing.
    dispatchReflex(studio.id),
    sweepReflex(studio.id, studio.timezone),
    ...reflexesFor(
      studio.id,
      studio.timezone,
      rows.filter((row) => row.studio_id === studio.id),
    ),
  ]);
