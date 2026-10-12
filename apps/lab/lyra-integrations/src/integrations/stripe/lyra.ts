import type { IntegrationEnv } from '../../integration';

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
    return { ok: false, status: 0, result: undefined, message: String(err).slice(0, 200) };
  }
};

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

export const mailMember = async (
  env: IntegrationEnv,
  args: { studioId: string; personId: string; subject: string; body: string; source: string },
): Promise<boolean> => {
  if (args.personId === '') return false;
  const answer = await callLyra(env, {
    studioId: args.studioId,
    resource: 'automation',
    fingerprint: 'automation/queue-message',
    context: {
      personId: args.personId,
      // Empty on purpose: the host resolves the address.
      toAddress: '',
      subject: args.subject,
      body: args.body,
      source: args.source,
      // Consent gates marketing, and a member who opted out of news must still
      // be told their payment failed.
      marketing: false,
    },
  });
  return answer.ok;
};

export type Billable = {
  subscriptionId: string;
  planName: string;
  amount: number;
  currency: string;
  interval: 'day' | 'week' | 'month' | 'year';
  intervalCount: number;
  personId: string;
  personName: string;
  joiningFeeId: string;
};

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

export type Purchase = { kind: 'pass' | 'course' | 'one_off'; targetId: string; name: string; amount: number; currency: string };

export const purchaseFor = async (env: IntegrationEnv, studioId: string, kind: string, targetId: string): Promise<Purchase | undefined> => {
  if (targetId === '') return undefined;

  if (kind === 'course') {
    const answer = await callLyra(env, { studioId, resource: 'member', fingerprint: 'courses/price', context: { courseId: targetId } });
    const row = answer.result;
    if (!answer.ok || row === undefined || String(row['course_id'] ?? '') === '') return undefined;
    // Checked here and not only at enrolment: otherwise money is taken for a
    // course that filled while they were deciding.
    if (Number(row['seats_left'] ?? 0) <= 0) return undefined;
    return { kind: 'course', targetId, name: String(row['name'] ?? 'Course'), amount: Number(row['amount'] ?? 0), currency: String(row['currency'] ?? 'EUR') };
  }

  const answer = await callLyra(env, { studioId, resource: 'member', fingerprint: 'offerings/price', context: { offeringId: targetId } });
  const row = answer.result;
  if (!answer.ok || row === undefined || String(row['offering_id'] ?? '') === '') return undefined;
  // A recurring plan is refused: sold as a single payment it would be charged
  // once for something the studio bills every period. The kind is lyra's, not
  // the caller's, because it decides whether the purchase grants classes.
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

// Idempotent by lyra's constraints: `passes` is unique on (studio,
// purchase_ref) and `enrolments` on (course, person), so a redelivered
// checkout lands on the row the first delivery made.
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
        // Its own table, because it grants nothing: a joining fee recorded as a
        // pass would hand over a free class.
        fingerprint: 'purchases/record',
        context: { personId: args.personId, offeringId: args.targetId, paidVia: 'stripe', purchaseRef: args.purchaseRef },
      })
    : callLyra(env, {
        studioId: args.studioId,
        resource: 'member',
        fingerprint: 'passes/sell',
        context: { personId: args.personId, offeringId: args.targetId, paidVia: 'stripe', purchaseRef: args.purchaseRef },
      });

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
    interval: interval === 'day' || interval === 'week' || interval === 'year' ? interval : 'month',
    intervalCount: Math.max(1, Math.trunc(Number(row['interval_count'] ?? 1)) || 1),
    joiningFeeId: String(row['joining_fee_id'] ?? ''),
  };
};
