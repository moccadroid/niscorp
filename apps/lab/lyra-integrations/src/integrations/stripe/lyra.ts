import type { IntegrationEnv } from '../../integration';

// ── THE SECOND DIRECTION: this integration acting as ITSELF ──
//
// Reads through the proxy travel as the PERSON driving, and that is right for a
// screen. This is the other half: work nobody asked for — a webhook arriving at
// three in the morning, a checkout resolving what to charge — where there is no
// person, so the integration presents its OWN key and names the studio it is acting
// for.
//
// The key is long-lived and the deployment issued it (moss mints at
// registration, shows it once, stores only the hash). `x-nisc-acts-for` names
// the studio; lyra resolves that to a per-(integration, studio) principal on
// the integration's own charter rung, and from there nothing is special — same
// compiled policy, same engine-stamped scope, no privileged path.
//
// WHICH IS WHY A FINGERPRINT OUTSIDE THE RUNG SIMPLY FAILS. This function can
// name anything; the charter decides what answers.

export type LyraCall = { ok: boolean; status: number; result: Record<string, unknown> | undefined; message: string };

export const callLyra = async (
  env: IntegrationEnv,
  args: { studioId: string; resource: string; fingerprint: string; context: Record<string, unknown> },
): Promise<LyraCall> => {
  const key = env('STRIPE_KEY');
  const base = env('LYRA_BASE').replace(/\/$/, '');
  if (key === '' || base === '') {
    return { ok: false, status: 0, result: undefined, message: 'This deployment has no lyra key or address for the payments integration.' };
  }
  try {
    const response = await fetch(`${base}/api/${args.resource}/vex`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'x-nisc-acts-for': args.studioId },
      body: JSON.stringify({ fingerprint: args.fingerprint, context: args.context }),
    });
    const body = (await response.json().catch(() => ({}))) as { result?: unknown; message?: unknown };
    return {
      ok: response.ok,
      status: response.status,
      result: (body.result ?? undefined) as Record<string, unknown> | undefined,
      message: String(body.message ?? ''),
    };
  } catch (err) {
    // Lyra being unreachable is an ordinary condition for an integration: the caller
    // says so and claims nothing about the studio.
    return { ok: false, status: 0, result: undefined, message: String(err).slice(0, 200) };
  }
};

// ── TELLING THE STUDIO SOMETHING ─────────────────────────────
//
// Onto the desk's follow-up list, which is a place somebody actually looks —
// not an email nobody reads and not a status only this service can see.
//
// `automation/notify` is a PUBLISHED interface: the fingerprint name is
// somebody else's contract, the same one the belts integration posts through, and the
// only write the shared integration rung has ever held. This integration reaches it on
// its own rung, which also grants it.
//
// The person is named because a follow-up reading "a payment failed" with nobody
// attached is a note somebody has to research before they can act on it.
// `source` is load-bearing rather than a label: lyra's follow-up table is unique
// on (studio, source, person, day), so it is what decides whether a second
// notice about the same person today is a duplicate to collapse or a different
// thing to file. Callers name it deliberately.
export const notifyDesk = async (
  env: IntegrationEnv,
  args: { studioId: string; personId: string | null; subject: string; body: string; source?: string },
): Promise<boolean> => {
  const answer = await callLyra(env, {
    studioId: args.studioId,
    resource: 'automation',
    fingerprint: 'automation/notify',
    context: { personId: args.personId, kind: args.source ?? 'integration', subject: args.subject, body: args.body },
  });
  return answer.ok;
};

export type Billable = {
  // THE CONTRACT'S KEY. Checkout stamps it into the provider's metadata and
  // `assert` is keyed on it — a person may hold more than one subscription,
  // and a webhook must never guess which one it is about.
  subscriptionId: string;
  planName: string;
  amount: number;
  currency: string;
  // A UNIT AND A COUNT. Quarterly is ('month', 3) — lyra's price list says so
  // and Stripe's Price takes exactly this pair, so nothing in between gets to
  // have an opinion about which periods exist.
  interval: 'day' | 'week' | 'month' | 'year';
  intervalCount: number;
  personId: string;
  personName: string;
};

/** What a person should be charged — the numbers, not the words a screen shows. */
export const billableFor = async (env: IntegrationEnv, studioId: string, personId: string): Promise<Billable | undefined> => {
  const answer = await callLyra(env, {
    studioId,
    resource: 'member',
    fingerprint: 'subscriptions/billable',
    context: { personId },
  });
  const row = answer.result;
  if (!answer.ok || row === undefined || Number(row['amount'] ?? 0) <= 0) return undefined;
  const interval = String(row['interval'] ?? 'month');
  return {
    subscriptionId: String(row['subscription_id'] ?? ''),
    planName: String(row['plan_name'] ?? 'Membership'),
    amount: Number(row['amount']),
    currency: String(row['currency'] ?? 'EUR'),
    personId: String(row['person_id'] ?? ''),
    personName: String(row['person_name'] ?? ''),
    // FOUR WORDS, and they are Stripe's own — lyra's CHECK constraint allows
    // exactly this set, so anything else is a bug upstream. Still narrowed
    // rather than trusted: an unrecognised unit falling through to 'month' is
    // the one defaulting that is safe here, because month is also the column's
    // default and so is what the row would have meant.
    interval: interval === 'day' || interval === 'week' || interval === 'year' ? interval : 'month',
    // A count that did not arrive is one, which is what every period meant
    // before lyra could say otherwise. Floored at 1: Stripe refuses zero, and a
    // zero here would mean a price nobody could be charged on.
    intervalCount: Math.max(1, Math.trunc(Number(row['interval_count'] ?? 1)) || 1),
  };
};
