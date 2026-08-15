import type Stripe from 'stripe';
import type { IntegrationStore } from '../../integration';
import { ensurePrice } from './prices';

// ═══════════════════════════════════════════════════════════════
// TAKING THE MONEY.
//
// DIRECT CHARGES: the studio is the merchant. The customer, the product, the
// price and the subscription all live on the CONNECTED account, the payment
// appears on the member's statement as the studio, and the money settles to the
// studio's own bank. The platform is not in the flow — which is the shape
// Stripe's own guidance gives for SaaS, and the reason `fees_collector` is
// `stripe` rather than us invoicing anybody.
//
// WHAT THIS SERVICE KNOWS ABOUT A MEMBER is a person id, a subscription id and
// an email. Not a name, not an address — lyra hands over identifiers at the
// wire and this side has no column for a person (S4).
// ═══════════════════════════════════════════════════════════════

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

/** The row, written. Its own function so the SQL has a caller a check can reach
 *  without creating a customer at a vendor first. */
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

/**
 * The member's customer on this studio's account, made once.
 *
 * Keyed on (studio, person) rather than person alone: the same human at two
 * studios is two customers, because they are two merchants. Collapsing them
 * would put one studio's payment method on another studio's account.
 */
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
      // The identifiers lyra will send back in an assertion. They are what make
      // a webhook about this customer resolvable without this service keeping a
      // second index.
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
  returnUrl: string;
};

/**
 * A Checkout Session for a subscription, on the studio's account.
 *
 * The Price is materialised here if this is the first time anybody bought this
 * shape (prices.ts) — which is what makes a plan edit in lyra cost nothing until
 * somebody actually checks out.
 *
 * THE METADATA IS THE WIRE HOME. Everything this integration needs to assert a standing
 * back to lyra — WHICH subscription (the assert key), who it is about, whose
 * studio — travels on the provider's subscription so a webhook arriving later
 * resolves without a lookup that could be stale. The two halves of this
 * contract — what is stamped here, what `assert` is keyed on — change together
 * or not at all; billing-check proves the loop.
 */
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
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: args.returnUrl,
      cancel_url: args.returnUrl,
      // STRIPE TAX COMPUTES IT; WE DO NOT. Lyra's `price_cents` is GROSS — what
      // a member actually pays — and the Price carries `tax_behavior:
      // 'inclusive'`, so the VAT is found INSIDE that number rather than added
      // on top. A member in Vienna sees €89, not €89 plus twenty percent.
      //
      // The alternative was lyra growing tax columns and every money display,
      // every forecast sum and every retention figure having to say whether it
      // meant gross or net. This keeps the app's number the number.
      //
      // It needs the studio to be registered for tax where it trades — Stripe
      // refuses the session otherwise, and the message says so rather than
      // silently charging the wrong amount.
      automatic_tax: { enabled: true },
      // Required by automatic tax for a subscription: Stripe has to know where
      // the customer is to know which rate applies, and asks at checkout.
      customer_update: { address: 'auto', name: 'auto' },
      subscription_data: {
        metadata: { subscription_id: args.subscriptionId, person_id: args.personId, studio_id: args.studioId },
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

/**
 * A Checkout Session for ONE payment — a pass, a drop-in, a course block.
 *
 * `mode: 'payment'` rather than `'subscription'`, and that word is the whole
 * difference: no Price is materialised and nothing recurs. The amount is inline
 * because it is bought once — content-addressing a Price (prices.ts) exists so
 * that everybody on a recurring plan keeps the one they signed on, and a single
 * payment has nobody to keep anything for.
 *
 * NOTHING IS GRANTED HERE. The session is an intention to pay; the pass appears
 * when `checkout.session.completed` arrives and not one moment earlier. A member
 * who closes the tab at the card form has bought nothing, which is the only
 * arrangement where an unpaid entitlement cannot exist.
 *
 * THE METADATA IS THE WIRE HOME, exactly as it is for a subscription — but on
 * the SESSION, because there is no subscription object to hang it on. What the
 * webhook needs to grant the right thing to the right person at the right
 * studio travels with the payment.
 */
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
            // GROSS, as everywhere else in this integration: lyra's price is
            // what a member pays, so the tax is found inside it rather than
            // added at the card form.
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
