import type Stripe from 'stripe';
import type { PackStore } from '../../pack';

// ═══════════════════════════════════════════════════════════════
// PRICES ARE LAZY AND CONTENT-ADDRESSED (S7).
//
// No sync loop. A loop between lyra's price list and Stripe's has to decide what
// happens when the two disagree, and every answer to that is wrong for somebody
// already paying: push lyra's list and you reprice existing subscribers, pull
// Stripe's and the studio's own screen stops being the truth.
//
// So a Price is materialised at CHECKOUT, addressed by what it is rather than by
// which plan asked for it. Ask for the same (account, amount, interval,
// currency) twice and get the same Price back. Edit a plan in lyra and the next
// checkout asks for a different four and gets a new Price — and everybody
// already subscribed keeps the one they signed on, which is exactly the rule
// lyra's own pricing screen states about retiring a plan.
//
// THE PLAN ID IS DELIBERATELY NOT IN THE KEY. Two plans at the same price on the
// same interval ARE the same price, and giving them separate Stripe objects
// would be inventing a distinction Stripe has no use for. What a member is on
// lives in lyra; what they are charged lives here.
// ═══════════════════════════════════════════════════════════════

export type PriceShape = { accountId: string; amount: number; currency: string; interval: 'month' | 'year' };

/**
 * The address. Pure, total, and the only place the shape becomes a string —
 * which is what makes it checkable without a network and without a database.
 *
 * Currency is lower-cased because Stripe's is: `EUR` and `eur` are one currency
 * and must not be two Prices.
 */
export const priceKey = (shape: PriceShape): string =>
  [shape.accountId, String(shape.amount), shape.currency.toLowerCase(), shape.interval].join(':');

export const priceFor = async (db: PackStore | undefined, key: string): Promise<string | undefined> => {
  if (db === undefined) return MEMORY.get(key);
  const result = await db.query<{ price_id: string }>(`SELECT price_id FROM ${db.table('prices')} WHERE price_key = $1`, [key]);
  return result.rows[0]?.price_id;
};

const MEMORY = new Map<string, string>();

const remember = async (db: PackStore | undefined, key: string, shape: PriceShape, priceId: string): Promise<string> => {
  if (db === undefined) {
    if (!MEMORY.has(key)) MEMORY.set(key, priceId);
    return MEMORY.get(key) ?? priceId;
  }
  // ON CONFLICT DO NOTHING and then read back: two checkouts on the same plan at
  // the same moment both create a Price at Stripe, and only one may be recorded.
  // The loser's Price is simply never used — an orphan object at a vendor is
  // cheap, and two rows claiming one address is not.
  await db.query(
    `INSERT INTO ${db.table('prices')} (price_key, account_id, price_id, amount, currency, interval)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (price_key) DO NOTHING`,
    [key, shape.accountId, priceId, shape.amount, shape.currency.toLowerCase(), shape.interval],
  );
  return (await priceFor(db, key)) ?? priceId;
};

/**
 * The Price for this shape, made if it does not exist.
 *
 * Created ON THE CONNECTED ACCOUNT — the studio is the merchant, so the product
 * and the price are the studio's, not the platform's. A Price on the platform
 * would charge the wrong party and settle to the wrong bank account.
 */
export const ensurePrice = async (stripe: Stripe, db: PackStore | undefined, shape: PriceShape, productName: string): Promise<string> => {
  const key = priceKey(shape);
  const held = await priceFor(db, key);
  if (held !== undefined) return held;

  const onAccount = { stripeAccount: shape.accountId };
  const product = await stripe.products.create({ name: productName }, onAccount);
  const price = await stripe.prices.create(
    {
      product: product.id,
      unit_amount: shape.amount,
      currency: shape.currency.toLowerCase(),
      recurring: { interval: shape.interval },
      // GROSS, as decided: lyra's `price_cents` is what a member pays, so the
      // tax is inside it rather than added at checkout.
      tax_behavior: 'inclusive',
    },
    onAccount,
  );
  return remember(db, key, shape, price.id);
};
