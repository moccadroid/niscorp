import type Stripe from 'stripe';
import type { IntegrationEnv, IntegrationStore } from '../../integration';
import { callLyra } from './lyra';
import { allAccounts, stripeSubscriptionFor } from './store';
import { stripeFor } from './client';

// ═══════════════════════════════════════════════════════════════
// TELLING THE PROVIDER TO STOP.
//
// This closes S6, and until it existed the app told a member something untrue.
// They gave notice, the trigger computed the last day from the longer of their
// notice period and their minimum term, the screen said "your last day is the
// 14th" — and Stripe, which knew nothing about any of it, charged them again on
// the 1st. Forever. §312k requires the button to mean something, and it did not.
//
// WHY A SWEEP AND NOT AN EVENT. Lyra cannot call this service: the proxy is
// person-driven and inbound-only, and integration-declared effects are parked.
// So the direction is reversed — this asks lyra who is leaving rather than lyra
// announcing it. That is also why it is cheap to make it the RECONCILE pass at
// the same time: it is already the thing that runs on a timer and compares two
// systems.
//
// IT STATES A DATE, it does not fire an event. Setting `cancel_at` to the same
// day twice is the same subscription; there is no counter to double and no
// cursor to lose, which is the same discipline `subscriptions/assert` keeps in
// the other direction. So a sweep that runs twice, or crashes halfway, or races
// another one, costs nothing.
// ═══════════════════════════════════════════════════════════════

export type SweepOutcome = { studios: number; leaving: number; stopped: number; missing: number; failed: number };

const asEpochDay = (value: unknown): number | undefined => {
  const day = String(value ?? '').slice(0, 10);
  if (day === '') return undefined;
  // MIDDAY UTC, not midnight. `cancel_at` is an instant, and a date rendered as
  // midnight in one zone is the previous evening in another — which would end a
  // membership a day early for a studio west of us and a day late for one east.
  // Midday is the hour that is the same date everywhere anybody trades.
  const at = Date.parse(`${day}T12:00:00Z`);
  return Number.isFinite(at) ? Math.floor(at / 1000) : undefined;
};

/**
 * Every studio, every membership with a leaving date, told to stop on it.
 *
 * Failures are counted rather than thrown: one studio's Stripe being unreachable
 * must not stop the next studio's members from being let go, and the next sweep
 * will try again anyway.
 */
export const sweepLeaving = async (env: IntegrationEnv, db: IntegrationStore | undefined): Promise<SweepOutcome> => {
  const outcome: SweepOutcome = { studios: 0, leaving: 0, stopped: 0, missing: 0, failed: 0 };
  const stripe = stripeFor(env);
  if (stripe === undefined) return outcome;

  for (const account of await allAccounts(db)) {
    outcome.studios += 1;
    const answer = await callLyra(env, {
      studioId: account.studioId,
      resource: 'member',
      fingerprint: 'subscriptions/leaving',
      context: {},
    });
    // Lyra refusing or being down is an ordinary condition for a sweep: it will
    // run again. Nothing is claimed about the studio in the meantime.
    if (!answer.ok) continue;
    const rows = (answer.result as unknown as { subscription_id?: string; ends_on?: string }[] | undefined) ?? [];

    for (const row of rows) {
      outcome.leaving += 1;
      const at = asEpochDay(row.ends_on);
      const held = await stripeSubscriptionFor(db, account.studioId, String(row.subscription_id ?? ''));
      // NOTHING TO STOP is not a failure. A membership marked `stripe` that this
      // service has never seen an event for has no provider subscription behind
      // it — a hand-made row, or one from before this index existed. Counted, so
      // a deployment where that number is not zero can be looked at.
      if (held === undefined || at === undefined) {
        outcome.missing += 1;
        continue;
      }
      try {
        await stripe.subscriptions.update(held, { cancel_at: at }, { stripeAccount: account.accountId });
        outcome.stopped += 1;
      } catch {
        outcome.failed += 1;
      }
    }
  }
  return outcome;
};
