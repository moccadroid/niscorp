import type Stripe from 'stripe';
import type { IntegrationEnv, IntegrationStore } from '../../integration';
import { callLyra } from './lyra';
import { allAccounts, stripeSubscriptionFor } from './store';
import { stripeFor } from './client';

export type SweepOutcome = { studios: number; leaving: number; stopped: number; missing: number; failed: number };

const asEpochDay = (value: unknown): number | undefined => {
  const day = String(value ?? '').slice(0, 10);
  if (day === '') return undefined;
  // Midday UTC, not midnight: `cancel_at` is an instant, and midnight in one
  // zone is the previous evening in another.
  const at = Date.parse(`${day}T12:00:00Z`);
  return Number.isFinite(at) ? Math.floor(at / 1000) : undefined;
};

// Failures are counted, not thrown: one studio's Stripe being unreachable must
// not stop the next studio's, and the next sweep tries again.
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
    if (!answer.ok) continue;
    const rows = (answer.result as unknown as { subscription_id?: string; ends_on?: string }[] | undefined) ?? [];

    for (const row of rows) {
      outcome.leaving += 1;
      const at = asEpochDay(row.ends_on);
      const held = await stripeSubscriptionFor(db, account.studioId, String(row.subscription_id ?? ''));
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
