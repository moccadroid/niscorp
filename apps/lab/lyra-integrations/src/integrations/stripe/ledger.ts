import type { IntegrationStore } from '../../integration';

// ── THE LEDGER MIRROR (S4) ───────────────────────────────────
//
// Lyra's subscription row holds STANDING — active, and how far the money
// reaches. It never learns a Stripe id. Individual invoices, what was refunded,
// what is disputed: all of that is this service's own mirror, read by this
// integration's own screens.
//
// That split is what makes cash at the desk and a second provider the same
// change rather than a rewrite — they write the same standing through the same
// mutation, and neither has to reproduce an invoice history that was never
// lyra's to hold.
//
// A MIRROR, NOT A SOURCE. Stripe is the truth; this is what we were told, kept
// so a studio can read its own money without calling a vendor on every page
// load. Anything here disagreeing with Stripe is this table being stale, and the
// fix is a redelivery rather than a reconciliation.

export type MirroredInvoice = {
  invoiceId: string;
  accountId: string;
  studioId: string;
  subscriptionId: string;
  status: string;
  amountCents: number;
  refundedCents: number;
  currency: string;
  disputed: boolean;
  invoicedOn: string;
};

// The same fallback the rest of this integration keeps, for the same reason: the checks
// boot an isolated world in-process, and a developer before `pnpm db:up` should
// get a working service rather than a screen that cannot explain itself.
const MEMORY = new Map<string, MirroredInvoice>();

export const recordInvoice = async (db: IntegrationStore | undefined, invoice: MirroredInvoice): Promise<void> => {
  if (db === undefined) {
    const held = MEMORY.get(invoice.invoiceId);
    MEMORY.set(invoice.invoiceId, {
      ...invoice,
      // Same monotonic rules as the SQL below — a refund and a dispute are
      // facts that do not un-happen because a later event did not mention them.
      refundedCents: Math.max(held?.refundedCents ?? 0, invoice.refundedCents),
      disputed: (held?.disputed ?? false) || invoice.disputed,
    });
    return;
  }
  await db.query(
    `INSERT INTO ${db.table('invoices')}
       (invoice_id, account_id, studio_id, subscription_id, status, amount_cents, refunded_cents, currency, disputed, invoiced_on)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (invoice_id) DO UPDATE SET
       status = EXCLUDED.status,
       amount_cents = EXCLUDED.amount_cents,
       refunded_cents = GREATEST(${db.table('invoices')}.refunded_cents, EXCLUDED.refunded_cents),
       disputed = ${db.table('invoices')}.disputed OR EXCLUDED.disputed,
       updated_at = now()`,
    [
      invoice.invoiceId,
      invoice.accountId,
      invoice.studioId,
      invoice.subscriptionId,
      invoice.status,
      invoice.amountCents,
      invoice.refundedCents,
      invoice.currency,
      invoice.disputed,
      invoice.invoicedOn === '' ? null : invoice.invoicedOn,
    ],
  );
};

/** Mark money given back, without needing the rest of the invoice. */
export const recordRefund = async (db: IntegrationStore | undefined, invoiceId: string, refundedCents: number): Promise<void> => {
  if (db === undefined) {
    const held = MEMORY.get(invoiceId);
    if (held !== undefined) MEMORY.set(invoiceId, { ...held, refundedCents: Math.max(held.refundedCents, refundedCents) });
    return;
  }
  await db.query(
    `UPDATE ${db.table('invoices')} SET refunded_cents = GREATEST(refunded_cents, $2), updated_at = now() WHERE invoice_id = $1`,
    [invoiceId, refundedCents],
  );
};

export const recordDispute = async (db: IntegrationStore | undefined, invoiceId: string): Promise<void> => {
  if (db === undefined) {
    const held = MEMORY.get(invoiceId);
    if (held !== undefined) MEMORY.set(invoiceId, { ...held, disputed: true });
    return;
  }
  await db.query(`UPDATE ${db.table('invoices')} SET disputed = true, updated_at = now() WHERE invoice_id = $1`, [invoiceId]);
};

export const invoicesFor = async (db: IntegrationStore | undefined, studioId: string): Promise<MirroredInvoice[]> => {
  if (db === undefined) {
    return [...MEMORY.values()].filter((i) => i.studioId === studioId).sort((a, b) => b.invoicedOn.localeCompare(a.invoicedOn));
  }
  const rows = await db.query<Record<string, unknown>>(
    `SELECT invoice_id, account_id, studio_id, subscription_id, status, amount_cents, refunded_cents, currency, disputed, invoiced_on
       FROM ${db.table('invoices')} WHERE studio_id = $1 ORDER BY invoiced_on DESC NULLS LAST LIMIT 100`,
    [studioId],
  );
  return rows.rows.map((row) => ({
    invoiceId: String(row['invoice_id']),
    accountId: String(row['account_id']),
    studioId: String(row['studio_id']),
    subscriptionId: String(row['subscription_id'] ?? ''),
    status: String(row['status']),
    amountCents: Number(row['amount_cents'] ?? 0),
    refundedCents: Number(row['refunded_cents'] ?? 0),
    currency: String(row['currency'] ?? 'eur'),
    disputed: row['disputed'] === true,
    invoicedOn: String(row['invoiced_on'] ?? '').slice(0, 10),
  }));
};

const SYMBOL: Record<string, string> = { eur: '€', usd: '$', gbp: '£' };

/**
 * The rows a screen shows.
 *
 * The words are made HERE, not in lyra. The host's kit knows how to paint a
 * badge; it does not know what "uncollectible" means, and teaching it would be
 * teaching an app about a payment provider.
 */
export const ledgerRows = (invoices: readonly MirroredInvoice[]): Record<string, unknown>[] =>
  invoices.map((invoice) => {
    const symbol = SYMBOL[invoice.currency.toLowerCase()] ?? `${invoice.currency.toUpperCase()} `;
    const money = (cents: number): string => `${symbol}${(cents / 100).toFixed(2)}`;
    // Order matters: a disputed invoice that was also refunded is a DISPUTE,
    // because that is the one somebody has to do something about.
    const state = invoice.disputed
      ? { label: 'Disputed', tone: 'alert' }
      : invoice.refundedCents > 0
        ? { label: 'Refunded', tone: 'warn' }
        : invoice.status === 'paid'
          ? { label: 'Paid', tone: 'good' }
          : invoice.status === 'open'
            ? { label: 'Unpaid', tone: 'warn' }
            : { label: invoice.status, tone: 'neutral' };
    return {
      invoice_id: invoice.invoiceId,
      date_display: invoice.invoicedOn === '' ? '—' : invoice.invoicedOn,
      amount_display: money(invoice.amountCents),
      state_label: state.label,
      state_tone: state.tone,
      note: invoice.refundedCents > 0 ? `${money(invoice.refundedCents)} refunded` : '',
    };
  });
