import type { IntegrationStore } from '../../integration';

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
  hostedUrl: string;
  pdfUrl: string;
};

const MEMORY = new Map<string, MirroredInvoice>();

export const recordInvoice = async (db: IntegrationStore | undefined, invoice: MirroredInvoice): Promise<void> => {
  if (db === undefined) {
    const held = MEMORY.get(invoice.invoiceId);
    MEMORY.set(invoice.invoiceId, {
      ...invoice,
      // As in the SQL below: a refund and a dispute are not undone by a later
      // event that does not mention them.
      refundedCents: Math.max(held?.refundedCents ?? 0, invoice.refundedCents),
      disputed: (held?.disputed ?? false) || invoice.disputed,
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

export const ledgerRows = (invoices: readonly MirroredInvoice[], names: Readonly<Record<string, string>> = {}): Record<string, unknown>[] =>
  invoices.map((invoice) => {
    const symbol = SYMBOL[invoice.currency.toLowerCase()] ?? `${invoice.currency.toUpperCase()} `;
    const money = (cents: number): string => `${symbol}${(cents / 100).toFixed(2)}`;
    // Disputed comes first: an invoice that is disputed and refunded shows as
    // a dispute, because that is the one somebody has to act on.
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
      person_name: names[invoice.subscriptionId] ?? '—',
      date_display: invoice.invoicedOn === '' ? '—' : invoice.invoicedOn,
      amount_display: money(invoice.amountCents),
      state_label: state.label,
      state_tone: state.tone,
      note: invoice.refundedCents > 0 ? `${money(invoice.refundedCents)} refunded` : '',
      document_url: invoice.pdfUrl === '' ? invoice.hostedUrl : invoice.pdfUrl,
      // What the refund control hides on.
      refunded: invoice.refundedCents > 0 || invoice.disputed,
    };
  });


export const payoutRows = (payouts: readonly { id: string; amount: number; currency: string; status: string; arrivesOn: string }[]): Record<string, unknown>[] =>
  payouts.map((payout) => {
    const symbol = SYMBOL[payout.currency.toLowerCase()] ?? `${payout.currency.toUpperCase()} `;
    const state =
      payout.status === 'paid'
        ? { label: 'Arrived', tone: 'good' }
        : payout.status === 'in_transit'
          ? { label: 'On its way', tone: 'calm' }
          : payout.status === 'failed' || payout.status === 'canceled'
            ? { label: 'Did not arrive', tone: 'alert' }
            : { label: 'Scheduled', tone: 'neutral' };
    return {
      payout_id: payout.id,
      amount_display: `${symbol}${(payout.amount / 100).toFixed(2)}`,
      state_label: state.label,
      state_tone: state.tone,
      arrives_display: payout.arrivesOn,
    };
  });
