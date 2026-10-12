import type { IntegrationStore } from '../../integration';

// Cannot be regenerated: Stripe mints `acct_…` once and cannot be asked which
// studio it belongs to. A lost row is a live merchant account nobody can reach.
export type ConnectedAccount = {
  studioId: string;
  accountId: string;
  studioName: string;
  country: string;
  createdAt: string;
};

const MEMORY = new Map<string, ConnectedAccount>();

const ROW = (row: Record<string, unknown>): ConnectedAccount => ({
  studioId: String(row['studio_id']),
  accountId: String(row['account_id']),
  studioName: String(row['studio_name'] ?? ''),
  country: String(row['country'] ?? ''),
  createdAt: String(row['created_at'] ?? ''),
});

export const accountFor = async (db: IntegrationStore | undefined, studioId: string): Promise<ConnectedAccount | undefined> => {
  if (db === undefined) return MEMORY.get(studioId);
  const result = await db.query<Record<string, unknown>>(`SELECT * FROM ${db.table('accounts')} WHERE studio_id = $1`, [studioId]);
  const row = result.rows[0];
  return row === undefined ? undefined : ROW(row);
};

// `DO NOTHING`, not an upsert: a second call carries a second live merchant
// account, not a correction. The caller reads back the one that is held.
export const rememberAccount = async (db: IntegrationStore | undefined, account: ConnectedAccount): Promise<ConnectedAccount> => {
  if (db === undefined) {
    if (!MEMORY.has(account.studioId)) MEMORY.set(account.studioId, account);
    return MEMORY.get(account.studioId) ?? account;
  }
  await db.query(
    `INSERT INTO ${db.table('accounts')} (studio_id, account_id, studio_name, country)
     VALUES ($1, $2, $3, $4) ON CONFLICT (studio_id) DO NOTHING`,
    [account.studioId, account.accountId, account.studioName, account.country],
  );
  return (await accountFor(db, account.studioId)) ?? account;
};

export const forgetAccounts = async (db: IntegrationStore | undefined): Promise<void> => {
  if (db === undefined) {
    MEMORY.clear();
    return;
  }
  await db.query(`DELETE FROM ${db.table('accounts')}`);
};

export const storeIsDurable = (db: IntegrationStore | undefined): boolean => db !== undefined;

export const allAccounts = async (db: IntegrationStore | undefined): Promise<ConnectedAccount[]> => {
  if (db === undefined) return [...MEMORY.values()];
  const rows = await db.query<Record<string, unknown>>(
    `SELECT studio_id, account_id, studio_name, country, created_at FROM ${db.table('accounts')} ORDER BY created_at`,
  );
  return rows.rows.map((row) => ({
    studioId: String(row['studio_id']),
    accountId: String(row['account_id']),
    studioName: String(row['studio_name'] ?? ''),
    country: String(row['country'] ?? ''),
    createdAt: String(row['created_at'] ?? ''),
  }));
};

const SUBSCRIPTION_MEMORY = new Map<string, string>();
const subKey = (studioId: string, subscriptionId: string): string => `${studioId}:${subscriptionId}`;

export const rememberSubscription = async (
  db: IntegrationStore | undefined,
  args: { studioId: string; subscriptionId: string; accountId: string; stripeSubscriptionId: string },
): Promise<void> => {
  if (args.subscriptionId === '' || args.stripeSubscriptionId === '') return;
  if (db === undefined) {
    SUBSCRIPTION_MEMORY.set(subKey(args.studioId, args.subscriptionId), args.stripeSubscriptionId);
    return;
  }
  await db.query(
    `INSERT INTO ${db.table('subscriptions')} (studio_id, subscription_id, account_id, stripe_subscription_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (studio_id, subscription_id) DO UPDATE SET stripe_subscription_id = EXCLUDED.stripe_subscription_id`,
    [args.studioId, args.subscriptionId, args.accountId, args.stripeSubscriptionId],
  );
};

export const stripeSubscriptionFor = async (
  db: IntegrationStore | undefined,
  studioId: string,
  subscriptionId: string,
): Promise<string | undefined> => {
  if (db === undefined) return SUBSCRIPTION_MEMORY.get(subKey(studioId, subscriptionId));
  const rows = await db.query<{ stripe_subscription_id: string }>(
    `SELECT stripe_subscription_id FROM ${db.table('subscriptions')} WHERE studio_id = $1 AND subscription_id = $2`,
    [studioId, subscriptionId],
  );
  return rows.rows[0]?.stripe_subscription_id;
};
