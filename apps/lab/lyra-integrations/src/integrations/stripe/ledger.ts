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
  // WHERE THE DOCUMENT IS. Stripe issues the invoice — numbered and sequenced
  // under the studio's own identity — so this holds a pointer to it and never a
  // number or a copy of our own. Two systems both believing they own §11 UStG
  // numbering is the failure worth avoiding by not participating.
  hostedUrl: string;
  pdfUrl: string;
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
      // Same monotonic instinct: a later event that does not carry the document
      // must not erase the one we already had.
      hostedUrl: invoice.hostedUrl === '' ? (held?.hostedUrl ?? '') : invoice.hostedUrl,
      pdfUrl: invoice.pdfUrl === '' ? (held?.pdfUrl ?? '') : invoice.pdfUrl,
    });
    return;
  }
  await db.query(
    `INSERT INTO ${db.table('invoices')}
       (invoice_id, account_id, studio_id, subscription_id, status, amount_cents, refunded_cents, currency, disputed, invoiced_on, hosted_url, pdf_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (invoice_id) DO UPDATE SET
       status = EXCLUDED.status,
       amount_cents = EXCLUDED.amount_cents,
       refunded_cents = GREATEST(${db.table('invoices')}.refunded_cents, EXCLUDED.refunded_cents),
       disputed = ${db.table('invoices')}.disputed OR EXCLUDED.disputed,
       -- Kept unless the new event actually carries one, for the same reason
       -- the refund is GREATEST: an event that says nothing about the document
       -- is not an event saying there is none.
       hosted_url = CASE WHEN EXCLUDED.hosted_url = '' THEN ${db.table('invoices')}.hosted_url ELSE EXCLUDED.hosted_url END,
       pdf_url = CASE WHEN EXCLUDED.pdf_url = '' THEN ${db.table('invoices')}.pdf_url ELSE EXCLUDED.pdf_url END,
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
      invoice.hostedUrl,
      invoice.pdfUrl,
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

/** The mirror, filtered to the subscriptions a person holds. Same rows, same
 *  scoping — the studio is still the assertion's, and the subscription ids come
 *  from the host rather than from a body. */
export const invoicesForSubscriptions = async (
  db: IntegrationStore | undefined,
  studioId: string,
  subscriptionIds: readonly string[],
): Promise<MirroredInvoice[]> => {
  const wanted = new Set(subscriptionIds.filter((id) => id !== ''));
  if (wanted.size === 0) return [];
  return (await invoicesFor(db, studioId)).filter((invoice) => wanted.has(invoice.subscriptionId));
};

export const invoicesFor = async (db: IntegrationStore | undefined, studioId: string): Promise<MirroredInvoice[]> => {
  if (db === undefined) {
    return [...MEMORY.values()].filter((i) => i.studioId === studioId).sort((a, b) => b.invoicedOn.localeCompare(a.invoicedOn));
  }
  const rows = await db.query<Record<string, unknown>>(
    `SELECT invoice_id, account_id, studio_id, subscription_id, status, amount_cents, refunded_cents, currency, disputed, invoiced_on, hosted_url, pdf_url
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
    hostedUrl: String(row['hosted_url'] ?? ''),
    pdfUrl: String(row['pdf_url'] ?? ''),
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
export const ledgerRows = (invoices: readonly MirroredInvoice[], names: Readonly<Record<string, string>> = {}): Record<string, unknown>[] =>
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
      // BORROWED FOR THE RENDER, held nowhere. A studio reading its own money
      // needs to know whose it is; this service still keeps no column for a
      // person, and an unresolvable row says so rather than showing a raw id.
      person_name: names[invoice.subscriptionId] ?? '—',
      date_display: invoice.invoicedOn === '' ? '—' : invoice.invoicedOn,
      amount_display: money(invoice.amountCents),
      state_label: state.label,
      state_tone: state.tone,
      note: invoice.refundedCents > 0 ? `${money(invoice.refundedCents)} refunded` : '',
      // The PDF where there is one, the hosted page otherwise. A row with
      // neither draws no control at all rather than a link to nowhere.
      document_url: invoice.pdfUrl === '' ? invoice.hostedUrl : invoice.pdfUrl,
      // What the refund control hides on. A row, not a screen, decides — the
      // list is drawn from data and nothing branches on who is looking.
      refunded: invoice.refundedCents > 0 || invoice.disputed,
    };
  });
