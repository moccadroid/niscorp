import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { lendDatabase } from '../db';
import type { IntegrationDb } from '../db';
import { invoicesFor, recordDispute, recordInvoice, recordRefund } from '../integrations/stripe/ledger';
import { priceFor, priceKey, rememberPrice } from '../integrations/stripe/prices';
import { customerFor, rememberCustomer } from '../integrations/stripe/checkout';
import { accountFor, allAccounts, rememberAccount, rememberSubscription, stripeSubscriptionFor } from '../integrations/stripe/store';

let failed = 0;
const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`${condition ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail === '' ? '' : ` — ${detail}`}`);
  if (!condition) failed += 1;
};

const pg = new PGlite();
const db: IntegrationDb = {
  query: async (text, values) => (await pg.query(text, values as unknown[])) as never,
};

const dir = join(process.cwd(), 'migrations');
for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(dir, file), 'utf8');
  const up = sql.split(/--\s*Down Migration/i)[0] ?? '';
  await pg.exec(up.replace(/--\s*Up Migration/i, ''));
}

lendDatabase(db);
const store = { query: db.query, table: (name: string) => `stripe_${name}` };

try {
  await rememberAccount(store, { studioId: 'st_a', accountId: 'acct_a', studioName: 'Studio A', country: 'AT', createdAt: new Date().toISOString() });
  ok('a connected account survives a round trip through SQL', (await accountFor(store, 'st_a'))?.accountId === 'acct_a');
  await rememberAccount(store, { studioId: 'st_a', accountId: 'acct_second', studioName: 'Studio A', country: 'AT', createdAt: new Date().toISOString() });
  ok('...and a second account for one studio cannot happen', (await accountFor(store, 'st_a'))?.accountId === 'acct_a', 'the primary key refuses, not a handler');
  ok('...and the sweep can list them', (await allAccounts(store)).length === 1);

  const invoice = { invoiceId: 'in_1', accountId: 'acct_a', studioId: 'st_a', subscriptionId: 'sub_1', status: 'paid', amountCents: 8900, refundedCents: 0, currency: 'eur', disputed: false, invoicedOn: '2026-03-01', hostedUrl: 'https://invoice.stripe.test/in_1', pdfUrl: 'https://invoice.stripe.test/in_1.pdf' };
  await recordInvoice(store, invoice);
  await recordInvoice(store, invoice);
  ok('an invoice mirrors once, however many times it arrives', (await invoicesFor(store, 'st_a')).length === 1);

  await recordRefund(store, 'in_1', 2000);
  await recordDispute(store, 'in_1');
  await recordInvoice(store, invoice);
  const after = (await invoicesFor(store, 'st_a'))[0];
  ok('a refund is not forgotten by the next event about the same invoice', after?.refundedCents === 2000, `${String(after?.refundedCents)} — GREATEST, not EXCLUDED`);
  ok('...nor is a dispute', after?.disputed === true, 'OR, not EXCLUDED');
  ok('...and the document is kept', after?.pdfUrl === 'https://invoice.stripe.test/in_1.pdf', String(after?.pdfUrl));

  // `invoice.payment_failed` arrives without a document.
  await recordInvoice(store, { ...invoice, hostedUrl: '', pdfUrl: '' });
  const stillThere = (await invoicesFor(store, 'st_a'))[0];
  ok('...and an event with no document does not erase it', stillThere?.pdfUrl === 'https://invoice.stripe.test/in_1.pdf', String(stillThere?.pdfUrl));
  ok('...and it is the studio own', (await invoicesFor(store, 'st_b')).length === 0);

  const shape = { accountId: 'acct_a', amount: 8900, currency: 'EUR', interval: 'month' as const, intervalCount: 3 };
  await rememberPrice(store, priceKey(shape), shape, 'price_quarterly');
  ok('a price is addressed by what it is', (await priceFor(store, priceKey(shape))) === 'price_quarterly');
  ok('...including the interval count', (await priceFor(store, priceKey({ ...shape, intervalCount: 1 }))) === undefined, 'monthly and quarterly at one number are two prices');

  await rememberCustomer(store, { personId: 'p_1', studioId: 'st_a', accountId: 'acct_a', customerId: 'cus_1' });
  ok('a customer is keyed to a studio and a person', (await customerFor(store, 'st_a', 'p_1')) === 'cus_1');
  ok('...and the same human at another studio is another customer', (await customerFor(store, 'st_b', 'p_1')) === undefined, 'two merchants, two customers');

  await rememberSubscription(store, { studioId: 'st_a', subscriptionId: 'sub_1', accountId: 'acct_a', stripeSubscriptionId: 'sub_stripe_1' });
  await rememberSubscription(store, { studioId: 'st_a', subscriptionId: 'sub_1', accountId: 'acct_a', stripeSubscriptionId: 'sub_stripe_moved' });
  ok('a membership names one provider subscription', (await stripeSubscriptionFor(store, 'st_a', 'sub_1')) === 'sub_stripe_moved', 'the newest wins, so a re-created subscription is followed');
  ok('...and an unknown one names nothing', (await stripeSubscriptionFor(store, 'st_a', 'sub_none')) === undefined);
} finally {
  lendDatabase(undefined);
  await pg.close();
}

console.log(
  failed === 0
    ? '\n\x1b[32mOK — the SQL this service runs, run: mirrored monotonically, addressed by content, and scoped per studio.\x1b[0m'
    : `\n\x1b[31mFAIL — ${String(failed)} assertion(s).\x1b[0m`,
);
process.exit(failed === 0 ? 0 : 1);
