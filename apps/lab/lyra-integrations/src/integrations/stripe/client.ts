import Stripe from 'stripe';
import type { IntegrationEnv } from '../../integration';

// Stripe's v2 API answers 400 to a request with no version header.
const API_VERSION = '2026-07-29.dahlia';

export const stripeFor = (env: IntegrationEnv): Stripe | undefined => {
  const secret = env('STRIPE_SECRET');
  if (secret === '') return undefined;
  return new Stripe(secret, { apiVersion: API_VERSION as Stripe.LatestApiVersion });
};

// `dashboard` is immutable: changing it means a new account object, which in
// live would strand the studio. Stripe refuses `application` losses with
// `stripe` fees, so the two responsibilities are set together.
export type OnboardArgs = { studioName: string; country: string; entityType: 'company' | 'individual'; email?: string };

export const createConnectedAccount = async (stripe: Stripe, args: OnboardArgs): Promise<string> => {
  const account = await stripe.v2.core.accounts.create({
    display_name: args.studioName,
    ...(args.email !== undefined && args.email !== '' ? { contact_email: args.email } : {}),
    identity: { country: args.country.toLowerCase(), entity_type: args.entityType },
    configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
    defaults: { responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' } },
    dashboard: 'none',
  } as Parameters<typeof stripe.v2.core.accounts.create>[0]);
  return account.id;
};

export const createOnboardingLink = async (stripe: Stripe, accountId: string, returnUrl: string): Promise<string> => {
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: returnUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
  return link.url;
};

export type AccountState = 'ready' | 'needs_info' | 'in_review';

export const accountStanding = async (
  stripe: Stripe,
  accountId: string,
): Promise<{ state: AccountState; ready: boolean; detail: string; actionable: number }> => {
  // The v2 `include` is a repeated key: comma-joined, the whole call answers 400.
  const account = (await stripe.rawRequest(
    'GET',
    `/v2/core/accounts/${accountId}?include=requirements&include=configuration.merchant`,
    undefined,
    { apiVersion: '2026-07-29.dahlia' },
  )) as unknown as {
    configuration?: { merchant?: { capabilities?: { card_payments?: { status?: string } } } };
    requirements?: { entries?: { awaiting_action_from?: string }[] };
  };

  const status = account.configuration?.merchant?.capabilities?.card_payments?.status ?? 'unknown';
  const entries = account.requirements?.entries ?? [];
  const actionable = entries.filter((e) => e.awaiting_action_from === 'user').length;

  if (status === 'active') return { state: 'ready', ready: true, detail: 'Ready to take payments.', actionable: 0 };
  if (actionable > 0)
    return {
      state: 'needs_info',
      ready: false,
      detail: `Stripe needs ${actionable === 1 ? 'one more detail' : `${actionable} more details`} from this studio before it can take payments.`,
      actionable,
    };
  return { state: 'in_review', ready: false, detail: 'Stripe is reviewing what you sent — nothing to do right now. This can take a little while.', actionable: 0 };
};

const PORTAL_HEADLINE = 'Manage your membership payments';

export const ensurePortalConfiguration = async (stripe: Stripe, accountId: string): Promise<string> => {
  const onAccount = { stripeAccount: accountId };
  const held = await stripe.billingPortal.configurations.list({ limit: 100 }, onAccount);
  const found = held.data.find((c) => c.business_profile?.headline === PORTAL_HEADLINE);
  if (found !== undefined) return found.id;

  const made = await stripe.billingPortal.configurations.create(
    {
      business_profile: { headline: PORTAL_HEADLINE },
      features: {
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
        customer_update: { enabled: true, allowed_updates: ['address', 'email', 'name', 'phone'] },
        // Off: Stripe knows nothing of a membership's minimum term and notice
        // period, so a portal cancel would end the money on a date nobody agreed.
        subscription_cancel: { enabled: false },
        // Off: a plan switched here would move the money without moving the
        // plan in lyra.
        subscription_update: { enabled: false },
      },
    },
    onAccount,
  );
  return made.id;
};

export const createPortalSession = async (
  stripe: Stripe,
  accountId: string,
  customerId: string,
  returnUrl: string,
): Promise<string> => {
  const configuration = await ensurePortalConfiguration(stripe, accountId);
  const session = await stripe.billingPortal.sessions.create(
    { customer: customerId, configuration, return_url: returnUrl },
    { stripeAccount: accountId },
  );
  return session.url;
};


// Refunds the whole charge. The ledger is written by the `charge.refunded`
// webhook, not here, as for a refund made in Stripe's dashboard.
export const refundInvoice = async (stripe: Stripe, accountId: string, invoiceId: string): Promise<{ refunded: number }> => {
  const onAccount = { stripeAccount: accountId };
  const invoice = (await stripe.invoices.retrieve(invoiceId, {}, onAccount)) as unknown as { charge?: string; payments?: { data?: { payment?: { charge?: string } }[] } };
  // The charge is under `payments` on newer API versions and a bare field on
  // older ones.
  const charge = invoice.payments?.data?.[0]?.payment?.charge ?? invoice.charge ?? '';
  if (charge === '') throw new Error('this invoice has no payment to refund');
  const refund = await stripe.refunds.create({ charge }, onAccount);
  return { refunded: refund.amount };
};


export const notReadyToCharge = async (stripe: Stripe, accountId: string): Promise<string | undefined> => {
  try {
    const standing = await accountStanding(stripe, accountId);
    if (!standing.ready) {
      return 'This studio cannot take payments yet — its details are still with Stripe. An owner can check progress on the Stripe screen.';
    }
    const registrations = await stripe.tax.registrations.list({ status: 'active', limit: 1 }, { stripeAccount: accountId });
    if (registrations.data.length === 0) {
      return 'This studio is not set up for tax yet, so a payment cannot be taken. An owner needs to add a tax registration before members can pay.';
    }
    return undefined;
  } catch {
    // A pre-flight that could not run does not block the checkout: the real
    // call that follows fails on its own if something is wrong.
    return undefined;
  }
};


export type Money = { amount: number; currency: string };
export type Payout = { id: string; amount: number; currency: string; status: string; arrivesOn: string };

export const balanceFor = async (stripe: Stripe, accountId: string): Promise<{ pending: Money[]; available: Money[] }> => {
  const balance = await stripe.balance.retrieve({}, { stripeAccount: accountId });
  const shape = (rows: { amount: number; currency: string }[]): Money[] =>
    rows.map((row) => ({ amount: row.amount, currency: row.currency }));
  return { pending: shape(balance.pending ?? []), available: shape(balance.available ?? []) };
};

export const payoutsFor = async (stripe: Stripe, accountId: string): Promise<Payout[]> => {
  const payouts = await stripe.payouts.list({ limit: 12 }, { stripeAccount: accountId });
  return payouts.data.map((payout) => ({
    id: payout.id,
    amount: payout.amount,
    currency: payout.currency,
    status: payout.status,
    arrivesOn: new Date(payout.arrival_date * 1000).toISOString().slice(0, 10),
  }));
};
