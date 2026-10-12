import type Stripe from 'stripe';
import type { IntegrationStore } from '../../integration';

export type PriceShape = { accountId: string; amount: number; currency: string; interval: 'day' | 'week' | 'month' | 'year'; intervalCount: number };

// The key holds the whole shape. Without the count, monthly and quarterly at
// one amount would address one Price and bill every quarterly subscriber monthly.
export const priceKey = (shape: PriceShape): string =>
  [shape.accountId, String(shape.amount), shape.currency.toLowerCase(), shape.interval, String(shape.intervalCount)].join(':');

export const priceFor = async (db: IntegrationStore | undefined, key: string): Promise<string | undefined> => {
  if (db === undefined) return MEMORY.get(key);
  const result = await db.query<{ price_id: string }>(`SELECT price_id FROM ${db.table('prices')} WHERE price_key = $1`, [key]);
  return result.rows[0]?.price_id;
};

const MEMORY = new Map<string, string>();

export const rememberPrice = async (db: IntegrationStore | undefined, key: string, shape: PriceShape, priceId: string): Promise<string> => {
  if (db === undefined) {
    if (!MEMORY.has(key)) MEMORY.set(key, priceId);
    return MEMORY.get(key) ?? priceId;
  }
  // Two checkouts on one plan at the same moment both create a Price at Stripe.
  // One is recorded and read back; the other is never used.
  await db.query(
    `INSERT INTO ${db.table('prices')} (price_key, account_id, price_id, amount, currency, interval, interval_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (price_key) DO NOTHING`,
    [key, shape.accountId, priceId, shape.amount, shape.currency.toLowerCase(), shape.interval, shape.intervalCount],
  );
  return (await priceFor(db, key)) ?? priceId;
};

export const ensurePrice = async (stripe: Stripe, db: IntegrationStore | undefined, shape: PriceShape, productName: string): Promise<string> => {
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
      recurring: { interval: shape.interval, interval_count: shape.intervalCount },
      // Gross: lyra's `price_cents` is what a member pays, tax included.
      tax_behavior: 'inclusive',
    },
    onAccount,
  );
  return rememberPrice(db, key, shape, price.id);
};
