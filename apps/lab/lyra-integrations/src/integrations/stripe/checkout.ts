import type Stripe from 'stripe';
import type { IntegrationStore } from '../../integration';
import { ensurePrice } from './prices';

const MEMORY = new Map<string, string>();

const customerKey = (studioId: string, personId: string): string => `${studioId}:${personId}`;

export const customerFor = async (db: IntegrationStore | undefined, studioId: string, personId: string): Promise<string | undefined> => {
  if (db === undefined) return MEMORY.get(customerKey(studioId, personId));
  const result = await db.query<{ customer_id: string }>(
    `SELECT customer_id FROM ${db.table('customers')} WHERE studio_id = $1 AND person_id = $2`,
    [studioId, personId],
  );
  return result.rows[0]?.customer_id;
};

export const rememberCustomer = async (
  db: IntegrationStore | undefined,
  who: { personId: string; studioId: string; accountId: string; customerId: string },
): Promise<void> => {
  if (db === undefined) {
    MEMORY.set(customerKey(who.studioId, who.personId), who.customerId);
    return;
  }
  await db.query(
    `INSERT INTO ${db.table('customers')} (person_id, studio_id, account_id, customer_id)
     VALUES ($1, $2, $3, $4) ON CONFLICT (studio_id, person_id) DO NOTHING`,
    [who.personId, who.studioId, who.accountId, who.customerId],
  );
};

export const ensureCustomer = async (
  stripe: Stripe,
  db: IntegrationStore | undefined,
  who: { personId: string; studioId: string; accountId: string; email: string },
): Promise<string> => {
  const held = await customerFor(db, who.studioId, who.personId);
  if (held !== undefined) return held;

  const customer = await stripe.customers.create(
    {
      ...(who.email === '' ? {} : { email: who.email }),
      metadata: { person_id: who.personId, studio_id: who.studioId },
    },
    { stripeAccount: who.accountId },
  );

  if (db === undefined) {
    MEMORY.set(customerKey(who.studioId, who.personId), customer.id);
    return customer.id;
  }
  await rememberCustomer(db, { personId: who.personId, studioId: who.studioId, accountId: who.accountId, customerId: customer.id });
  return (await customerFor(db, who.studioId, who.personId)) ?? customer.id;
};

export type CheckoutArgs = {
  accountId: string;
  subscriptionId: string;
  personId: string;
  studioId: string;
  email: string;
  planName: string;
  amount: number;
  currency: string;
  interval: 'day' | 'week' | 'month' | 'year';
  intervalCount: number;
  joiningFee?: { name: string; amount: number };
  joiningFeeId: string;
  returnUrl: string;
};

export const createCheckout = async (stripe: Stripe, db: IntegrationStore | undefined, args: CheckoutArgs): Promise<{ url: string; sessionId: string }> => {
  const priceId = await ensurePrice(
    stripe,
    db,
    { accountId: args.accountId, amount: args.amount, currency: args.currency, interval: args.interval, intervalCount: args.intervalCount },
    args.planName,
  );
  const customerId = await ensureCustomer(stripe, db, {
    personId: args.personId,
    studioId: args.studioId,
    accountId: args.accountId,
    email: args.email,
  });

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      customer: customerId,
      // A subscription session takes one-time items beside the recurring one:
      // the joining fee is charged with the first payment and never again.
      line_items: [
        { price: priceId, quantity: 1 },
        ...(args.joiningFee === undefined
          ? []
          : [
              {
                quantity: 1,
                price_data: {
                  currency: args.currency.toLowerCase(),
                  unit_amount: args.joiningFee.amount,
                  product_data: { name: args.joiningFee.name },
                  tax_behavior: 'inclusive' as const,
                },
              },
            ]),
      ],
      success_url: args.returnUrl,
      cancel_url: args.returnUrl,
      automatic_tax: { enabled: true },
      // Required by automatic tax: the customer's address decides the rate.
      customer_update: { address: 'auto', name: 'auto' },
      subscription_data: {
        metadata: { subscription_id: args.subscriptionId, person_id: args.personId, studio_id: args.studioId },
      },
      // On the session too: the completed-checkout event is where the joining
      // fee is recorded, and the subscription's metadata does not carry it.
      metadata: {
        subscription_id: args.subscriptionId,
        person_id: args.personId,
        studio_id: args.studioId,
        ...(args.joiningFeeId === '' ? {} : { joining_fee_id: args.joiningFeeId }),
      },
    },
    { stripeAccount: args.accountId },
  );
  return { url: session.url ?? '', sessionId: session.id };
};

export type PurchaseArgs = {
  accountId: string;
  personId: string;
  studioId: string;
  email: string;
  kind: 'pass' | 'course' | 'one_off';
  targetId: string;
  name: string;
  amount: number;
  currency: string;
  returnUrl: string;
};

export const createPurchase = async (stripe: Stripe, db: IntegrationStore | undefined, args: PurchaseArgs): Promise<{ url: string; sessionId: string }> => {
  const customerId = await ensureCustomer(stripe, db, {
    personId: args.personId,
    studioId: args.studioId,
    accountId: args.accountId,
    email: args.email,
  });

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: args.currency.toLowerCase(),
            unit_amount: args.amount,
            product_data: { name: args.name },
            tax_behavior: 'inclusive',
          },
        },
      ],
      success_url: args.returnUrl,
      cancel_url: args.returnUrl,
      automatic_tax: { enabled: true },
      customer_update: { address: 'auto', name: 'auto' },
      metadata: { purchase_kind: args.kind, target_id: args.targetId, person_id: args.personId, studio_id: args.studioId },
    },
    { stripeAccount: args.accountId },
  );
  return { url: session.url ?? '', sessionId: session.id };
};
