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

// ── PUTTING A NAME TO A ROW ──────────────────────────────────
//
// The money screen was a list of amounts and dates with nobody attached: "€89.00
// · Disputed" and no way to tell whose. This service holds no names by design
// (S4) — the mirror keys on lyra's subscription id — so the names are borrowed
// for the length of one render and stored nowhere.
//
// One call for the whole page rather than one per row, and the host answers with
// only the people this studio knows, because the assertion says which studio.
export const namesForSubscriptions = async (
  env: IntegrationEnv,
  studioId: string,
  subscriptionIds: readonly string[],
): Promise<Record<string, string>> => {
  const wanted = [...new Set(subscriptionIds.filter((id) => id !== ''))];
  if (wanted.length === 0) return {};
  const answer = await callLyra(env, {
    studioId,
    resource: 'member',
    fingerprint: 'subscriptions/names',
    context: { subscriptionIds: wanted },
  });
  const rows = (answer.result as unknown as { subscription_id?: string; person_name?: string }[] | undefined) ?? [];
  const named: Record<string, string> = {};
  for (const row of rows) named[String(row.subscription_id ?? '')] = String(row.person_name ?? '');
  return named;
};

/** Which subscriptions a person holds, so their own invoices can be found. The
 *  mirror keys on the subscription, and a panel is opened on a PERSON — this is
 *  the one hop between the two, made by the host that knows both. */
export const subscriptionsOfPerson = async (env: IntegrationEnv, studioId: string, personId: string): Promise<string[]> => {
  if (personId === '') return [];
  const answer = await callLyra(env, {
    studioId,
    resource: 'member',
    fingerprint: 'subscriptions/of-person',
    context: { personId },
  });
  const rows = (answer.result as unknown as { subscription_id?: string }[] | undefined) ?? [];
  return rows.map((row) => String(row.subscription_id ?? '')).filter((id) => id !== '');
};

// ── BUYING ONE THING, ONCE ───────────────────────────────────
//
// A subscription is a standing this integration restates. A pass and a course
// seat are the other shape: a price, paid once, and an entitlement that must not
// exist until the money does. Until these read a price, exactly one of the three
// things a studio sells could be bought through the app — a drop-in at €18 and a
// course block at €240 had no path to any money but cash at the desk.
//
// THE AMOUNT IS LYRA'S, ALWAYS. A caller names WHICH thing; a caller who could
// also name its price would be naming their own price.
export type Purchase = { kind: 'pass' | 'course' | 'one_off'; targetId: string; name: string; amount: number; currency: string };

/**
 * What one purchasable thing costs at this studio.
 *
 * The studio is the assertion's, never the caller's, so an id from somebody
 * else's price list resolves to nothing rather than to their price. Retired
 * offerings and full courses answer nothing too, and both refusals are lyra's
 * own — made by the same reads its screens use.
 */
export const purchaseFor = async (env: IntegrationEnv, studioId: string, kind: string, targetId: string): Promise<Purchase | undefined> => {
  if (targetId === '') return undefined;

  if (kind === 'course') {
    const answer = await callLyra(env, { studioId, resource: 'member', fingerprint: 'courses/price', context: { courseId: targetId } });
    const row = answer.result;
    if (!answer.ok || row === undefined || String(row['course_id'] ?? '') === '') return undefined;
    // A SEAT HAS TO EXIST BEFORE IT IS SOLD. Checked here and not only at
    // enrolment, because the alternative is taking somebody's money for a block
    // that filled while they were deciding.
    if (Number(row['seats_left'] ?? 0) <= 0) return undefined;
    return { kind: 'course', targetId, name: String(row['name'] ?? 'Course'), amount: Number(row['amount'] ?? 0), currency: String(row['currency'] ?? 'EUR') };
  }

  const answer = await callLyra(env, { studioId, resource: 'member', fingerprint: 'offerings/price', context: { offeringId: targetId } });
  const row = answer.result;
  if (!answer.ok || row === undefined || String(row['offering_id'] ?? '') === '') return undefined;
  // A PASS OR A ONE-OFF, and NOT a recurring plan. A plan has its own path —
  // `subscriptions/billable` and a subscription-mode checkout — and selling one
  // as a single payment would charge a member once for something the studio
  // meant to bill forever.
  //
  // The KIND is read from lyra rather than taken from the caller, which matters
  // because it decides which table the thing lands on: a caller who could say
  // "this pass is a one-off" would be choosing whether their purchase grants
  // classes.
  const kindHere = String(row['kind'] ?? '');
  if (kindHere !== 'pass' && kindHere !== 'one_off') return undefined;
  return {
    kind: kindHere,
    targetId,
    name: String(row['name'] ?? 'Pass'),
    amount: Number(row['amount'] ?? 0),
    currency: String(row['currency'] ?? 'EUR'),
  };
};

/**
 * Hand the entitlement over, now that it has been paid for.
 *
 * The ONLY inserts this integration makes, and they are inserts rather than
 * assertions because there was nothing to assert onto: a pass that existed
 * before the money would be a pass somebody could spend without paying.
 *
 * IDEMPOTENT BY CONSTRAINT, not by care here — `passes` is unique on
 * (studio, purchase_ref) and `enrolments` on (course, person). A redelivered
 * checkout lands on the row the first delivery made.
 */
export const grantPurchase = async (
  env: IntegrationEnv,
  args: { studioId: string; personId: string; kind: string; targetId: string; purchaseRef: string },
): Promise<LyraCall> =>
  args.kind === 'course'
    ? callLyra(env, {
        studioId: args.studioId,
        resource: 'member',
        fingerprint: 'enrolments/enrol',
        context: { personId: args.personId, courseId: args.targetId, paidVia: 'stripe' },
      })
    : args.kind === 'one_off'
    ? callLyra(env, {
        studioId: args.studioId,
        resource: 'member',
        // ITS OWN TABLE, because it grants nothing. A joining fee recorded as a
        // pass would hand somebody a free class for paying to join.
        fingerprint: 'purchases/record',
        context: { personId: args.personId, offeringId: args.targetId, paidVia: 'stripe', purchaseRef: args.purchaseRef },
      })
    : callLyra(env, {
        studioId: args.studioId,
        resource: 'member',
        fingerprint: 'passes/sell',
        context: { personId: args.personId, offeringId: args.targetId, paidVia: 'stripe', purchaseRef: args.purchaseRef },
      });

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
