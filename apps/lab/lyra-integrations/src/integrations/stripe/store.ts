import type { IntegrationStore } from '../../integration';

// ── THE STORAGE THIS INTEGRATION BRINGS WITH IT ──────────────
//
// Per studio: which connected account is theirs.
//
// THIS IS THE ONE THING IN THIS REPO THAT CANNOT BE REGENERATED. Lyra's whole
// database is replayed from a seed on every boot, on purpose, because its schema
// is still moving. Belts' ranks are demo data. But Stripe mints `acct_…` once
// and keeps it forever, and there is no way to ask from their side which of your
// studios an account belongs to — so losing this mapping leaves a live, billable
// merchant account that nobody can reach, and an `account.updated` webhook
// arriving about a stranger.
//
// So it is Postgres, and it is migrated (`migrations/`), and the primary key is
// what refuses a second account for a studio rather than a handler remembering
// to check.
//
// NONE OF THIS IS EVER SENT TO LYRA (S4). Lyra's subscription row holds
// STANDING — status, how far the money reaches — and never learns a Stripe id.
// That split is what makes cash at the desk and a second provider the same
// mutation with a different caller rather than a rewrite.
//
// NOTHING OUTSIDE integrations/stripe IMPORTS THIS FILE, and separation-check asserts
// it: Belts holding rank data and this holding payment identifiers are in one
// process, and an import is the only thing that would join them.
export type ConnectedAccount = {
  studioId: string;
  accountId: string;
  studioName: string;
  country: string;
  createdAt: string;
};

// THE FALLBACK IS FOR CHECKS AND FOR THE MINUTE BEFORE `pnpm db:up`.
//
// Thirty-odd checks each boot an isolated world in-process; pointing them at a
// shared Postgres would make them order-dependent and flaky, and that isolation
// has caught most of the bugs in this build. A developer who has not started
// the database should also get a working service rather than a crash.
//
// It is NOT for a deployment, and the integration says so at boot rather than letting
// it be discovered when an account goes missing.
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

// ONE ACCOUNT PER STUDIO, and the database is what says so. `ON CONFLICT DO
// NOTHING` rather than an upsert: a second call is not a correction, it is a
// second live merchant account at a vendor — and because Stripe fixes the
// dashboard type at creation, the first cannot be repaired into the second. The
// caller finds out it lost by reading back what is actually there.
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

/** For the checks, and for a dev restart that wants a clean slate. */
export const forgetAccounts = async (db: IntegrationStore | undefined): Promise<void> => {
  if (db === undefined) {
    MEMORY.clear();
    return;
  }
  await db.query(`DELETE FROM ${db.table('accounts')}`);
};

/** Whether this integration is holding its data somewhere that survives a restart. */
export const storeIsDurable = (db: IntegrationStore | undefined): boolean => db !== undefined;

/**
 * Every studio this deployment has connected.
 *
 * The sweep needs it: "who is leaving" is a question per studio, and there is no
 * other list of which studios this integration acts for — lyra knows its own
 * tenants and this side knows only the ones that connected an account.
 */
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

// ── WHICH PROVIDER SUBSCRIPTION IS WHICH MEMBERSHIP ──────────
//
// The metadata carries lyra's ids TO Stripe, which is all a webhook needs: an
// event arrives holding the subscription it is about. Going the other way had no
// answer at all — given a membership in lyra that is leaving, there was nothing
// that could name the Stripe subscription to stop.
//
// So the mapping is recorded as events arrive. It is a CACHE and not a source:
// every row in it is rebuildable from Stripe, because every subscription there
// carries the metadata this was derived from.
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
