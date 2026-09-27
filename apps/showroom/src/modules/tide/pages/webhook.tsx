import { useCallback, useEffect, useState, type FC } from 'react';
import { PhoneStyles } from '@showroom/chrome/stage/phone';
import { Btn, Callout, Chip, Code, Grid, INK, Lead, MONO, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import { euros } from '../world/billing';
import { MINUTE, stamp } from '../world/ledger';
import { createWebhooks, naive, OPENS, outOfOrder, paid, PRICE, REFLEXES, resend, type Delivery, type Membership, type SideState, type TideSide, type Webhooks } from '../world/webhook';
import { Ledger, type Refused } from './ledger';
import { Act, Messages } from './phones';

// ═══════════════════════════════════════════════════════════
// The same webhook, twice — what a payment provider really sends, handled
// twice: by the usual handler (simulated here, labelled) and by tide (real).
//
// Payment providers deliver webhooks at least once and in no promised order.
// Press the provider's buttons and compare Olivia's view of Grace's
// membership, and Grace's inbox, on the two sides.
// ═══════════════════════════════════════════════════════════

const month = (n: number): string => `INV-2026-${String(3 + n).padStart(2, '0')}`;

// What should be true, from the provider's point of view: each distinct
// successful event is one payment; the status is the newest event's.
const truth = (deliveries: readonly Delivery[]): { payments: number; status: Membership['status'] } => {
  const unique = new Map(deliveries.map((d) => [d.event.id, d.event]));
  const events = [...unique.values()];
  const newest = [...events].sort((a, b) => b.created - a.created)[0];
  return {
    payments: events.filter((e) => e.type === 'invoice.payment_succeeded').length,
    status: newest === undefined ? 'none' : newest.type === 'invoice.payment_succeeded' ? 'active' : 'past_due',
  };
};

const STATUS: Record<Membership['status'], { text: string; tone: 'ok' | 'bad' | 'idle' }> = {
  none: { text: 'no membership yet', tone: 'idle' },
  active: { text: 'active', tone: 'ok' },
  past_due: { text: 'past due', tone: 'bad' },
};

const Dashboard: FC<{ side: SideState; expect: { payments: number; status: Membership['status'] } }> = ({ side, expect }) => {
  const m = side.membership;
  const counts = new Map<string, number>();
  for (const p of m.payments) counts.set(p.event, (counts.get(p.event) ?? 0) + 1);
  const twice = [...counts.values()].some((n) => n > 1);
  const statusWrong = m.status !== expect.status;
  return (
    <div style={{ border: `1px solid ${INK.line}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: '#fff' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: INK.faint, letterSpacing: 0.6 }}>OLIVIA’S DASHBOARD · MEMBERS</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 750 }}>Grace</span>
        <Chip tone={statusWrong ? 'bad' : STATUS[m.status].tone}>{STATUS[m.status].text}</Chip>
        {statusWrong && <span style={{ fontSize: 12, color: INK.bad }}>wrong — her newest payment succeeded</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: m.payments.length > expect.payments ? INK.bad : INK.text }}>{euros(m.payments.length * PRICE)}</span>
        <span style={{ fontSize: 12, color: INK.soft }}>
          recorded as paid · {euros(expect.payments * PRICE)} actually paid
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {m.payments.length === 0 && <div style={{ fontSize: 12, color: INK.faint }}>No payments recorded.</div>}
        {m.payments.map((p, i) => {
          const dup = m.payments.findIndex((x) => x.event === p.event) < i;
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '3px 8px', borderRadius: 7, background: dup ? INK.badWash : INK.wash }}>
              <span style={{ fontFamily: MONO, fontSize: 11 }}>{p.invoice}</span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: INK.faint }}>{p.event}</span>
              <span style={{ fontWeight: 650, color: dup ? INK.bad : INK.text }}>{dup ? 'recorded again' : euros(PRICE)}</span>
            </div>
          );
        })}
      </div>
      {twice && <Chip tone="bad">one event, processed twice</Chip>}
    </div>
  );
};

const inbox = (side: SideState) =>
  side.mails.map((m, i) => ({
    key: `${m.at}-${i}`,
    at: m.at,
    icon: '✉️',
    title: m.kind === 'receipt' ? `Receipt — ${m.invoice}, ${euros(PRICE)}` : 'Your card was declined — update it here',
    tone: m.kind === 'card-failed' ? ('bad' as const) : ('plain' as const),
  }));

export const SameWebhookTwice: FC = () => {
  const [hooks, setHooks] = useState<Webhooks>();
  const [tide, setTide] = useState<TideSide>();
  const [sent, setSent] = useState<readonly Delivery[]>([]);
  const [now, setNow] = useState(OPENS);
  const [invoices, setInvoices] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const h = await createWebhooks();
      const s = await h.state(OPENS);
      if (!live) return;
      setHooks(h);
      setTide(s);
      setSent([]);
      setNow(OPENS);
      setInvoices(0);
    })();
    return () => {
      live = false;
    };
  }, [epoch]);

  const deliver = useCallback(
    async (ds: readonly Delivery[], nextInvoices: number) => {
      if (hooks === undefined || busy) return;
      setBusy(true);
      let s = tide;
      for (const d of ds) s = await hooks.deliver(d);
      setTide(s);
      setSent((prev) => [...prev, ...ds]);
      setNow((ds[ds.length - 1]?.at ?? now) + 10 * MINUTE);
      setInvoices(nextInvoices);
      setBusy(false);
    },
    [hooks, tide, busy, now],
  );

  const lastNew = [...sent].reverse().find((d) => !d.retry);
  const expect = truth(sent);
  const naiveSide = naive(sent);
  const refused: readonly Refused[] = (tide?.intake ?? []).filter((i) => !i.accepted).map((i) => ({ at: i.at, what: `stripe ${i.event.id} ${i.event.type}`, why: 'duplicate — this event id was already ingested' }));
  const naiveWrong = naiveSide.membership.payments.length !== expect.payments || naiveSide.membership.status !== expect.status;
  const tideRight = tide !== undefined && tide.membership.payments.length === expect.payments && tide.membership.status === expect.status;

  return (
    <Page>
      <PhoneStyles />
      <Lead eyebrow="The same webhook, twice" title="The payment provider will send the same event twice, and old news late. Your app has to be right anyway.">
        When Grace pays, the payment provider tells Acme Studio with a <b>webhook</b> — an HTTP call to the studio’s server. Providers promise to
        deliver each event <i>at least once</i>, not exactly once, and not in order. Press the provider’s buttons and compare the two handlers: the
        usual one, which does what each call says the moment it arrives, and tide.
      </Lead>

      <Panel title="The payment provider" aside={<Chip tone="warn">simulated — sends events the way Stripe does</Chip>}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700 }}>{stamp(now)}</div>
          <span style={{ flex: 1 }} />
          <Btn kind="quiet" onClick={() => setEpoch((e) => e + 1)}>
            ↺ Start over
          </Btn>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Act primary busy={busy} label="Stripe sends payment_succeeded" hint={`Grace pays ${month(invoices)} — a new event`} onClick={() => void deliver([paid(month(invoices), now)], invoices + 1)} />
          <Act
            busy={busy}
            label="Stripe retries the same event"
            why={lastNew === undefined ? 'Nothing sent yet — the provider can only retry an event it sent.' : undefined}
            hint={lastNew === undefined ? undefined : `it didn’t hear “200 OK” in time, so it sends ${lastNew.event.id} again`}
            onClick={() => {
              if (lastNew !== undefined) void deliver([resend(lastNew, now)], invoices);
            }}
          />
          <Act
            busy={busy}
            label="Stripe sends events out of order"
            hint={`${month(invoices)}: the card failed, Grace fixed it, it succeeded — the failure arrives last`}
            onClick={() => void deliver(outOfOrder(month(invoices), now), invoices + 1)}
          />
        </div>
        <div style={{ border: `1px solid ${INK.line}`, borderRadius: 10, overflow: 'auto', maxHeight: 220 }}>
          {sent.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: 12.5, color: INK.faint }}>No webhooks yet.</div>
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  {['arrived', 'event id', 'type', 'invoice', 'happened at', ''].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '5px 8px', color: INK.faint, fontWeight: 600, fontSize: 11 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...sent].reverse().map((d, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${INK.line}` }}>
                    <td style={{ padding: '5px 8px', fontFamily: MONO, fontSize: 11 }}>{stamp(d.at)}</td>
                    <td style={{ padding: '5px 8px', fontFamily: MONO, fontSize: 11 }}>{d.event.id}</td>
                    <td style={{ padding: '5px 8px', fontFamily: MONO, fontSize: 11, color: d.event.type === 'invoice.payment_failed' ? INK.bad : INK.ok }}>{d.event.type}</td>
                    <td style={{ padding: '5px 8px', fontFamily: MONO, fontSize: 11 }}>{d.event.invoice}</td>
                    <td style={{ padding: '5px 8px', fontFamily: MONO, fontSize: 11 }}>{stamp(d.event.created)}</td>
                    <td style={{ padding: '5px 8px' }}>
                      {d.retry && <Chip tone="warn">same event again</Chip>}
                      {d.late && <Chip tone="warn">older, arrived late</Chip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>

      <Grid min={400}>
        <Panel title="The usual webhook handler" aside="simulated — does what each call says, as it arrives" tone={naiveWrong ? 'bad' : 'plain'}>
          <Grid min={220} gap={12}>
            <Dashboard side={naiveSide} expect={expect} />
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Messages who="Grace" status="Grace · Mail" notes={inbox(naiveSide)} tone={naiveWrong ? 'bad' : 'plain'} width={230} minHeight={220} empty="No mail." />
            </div>
          </Grid>
          <Code maxHeight={150}>{`app.post('/webhooks/stripe', (req) => {
  const e = req.body;
  if (e.type === 'invoice.payment_succeeded') {
    recordPayment(e);  sendReceipt(e);  setStatus('active');
  } else {
    setStatus('past_due');  sendCardFailed(e);
  }
});`}</Code>
          {naiveWrong && (
            <Callout tone="bad">
              {naiveSide.membership.payments.length > expect.payments && 'A retried event was processed again: the payment is recorded twice and Grace got a second receipt. '}
              {naiveSide.membership.status !== expect.status && 'An old failure arrived after the success and was applied anyway: Grace, who has paid, is past due and was told her card failed.'}
            </Callout>
          )}
        </Panel>

        <Panel title="tide" aside="four reflexes, the real engine" tone={tideRight && sent.length > 0 ? 'ok' : 'plain'}>
          {tide !== undefined && (
            <Grid min={220} gap={12}>
              <Dashboard side={tide} expect={expect} />
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Messages who="Grace" status="Grace · Mail" notes={inbox(tide)} tone={sent.length > 0 && tideRight ? 'ok' : 'plain'} width={230} minHeight={220} empty="No mail." />
              </div>
            </Grid>
          )}
          <Code maxHeight={150}>{`app.post('/webhooks/stripe', async (req) => {
  const e = parseStripeEvent(req.body);   // validate at the door
  await tide.ingest({ kind: 'signal', name: 'stripe',
    payload: e, dedupeKey: e.id, at: now });
  return 200;                              // the reflexes do the rest
});`}</Code>
          {refused.length > 0 && (
            <Callout tone="ok" title="The retry was refused at the door">
              The event id is the fact’s <Mono>dedupeKey</Mono>. The second delivery of the same id returned nothing from <Mono>ingest()</Mono> — no fact,
              so no run, so no second payment and no second receipt. It is listed under “Refused” in the ledger below.
            </Callout>
          )}
          {tide !== undefined && tide.ledger.runs.some((r) => r.reflexId === 'stripe.membership-status' && r.selected === 0) && (
            <Callout tone="ok" title="The late failure changed nothing">
              The status reflex asks the memberships table “is this event newer than what you already reflect?” The late failure isn’t, so it selected
              no row and did nothing — a run row that says <i>selected 0</i>, and no card-failed email.
            </Callout>
          )}
        </Panel>
      </Grid>

      <Ledger ledger={tide?.ledger} refused={refused} defaultOpen aside="the tide side — tinted rows came from the last click" />

      <Panel title="The four reflexes" aside="the webhook becomes a fact; everything after it is a reflex">
        <Grid min={300} gap={12}>
          {REFLEXES.map((r) => (
            <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 650 }}>{r.intent}</div>
              <Code maxHeight={220}>{JSON.stringify(r, null, 2)}</Code>
            </div>
          ))}
        </Grid>
      </Panel>

      <Grid min={300} gap={12}>
        <Callout tone="accent" title="Duplicates stop at the door">
          A webhook is ingested with the provider’s event id as its <Mono>dedupeKey</Mono>. A repeat is not an error — it is refused silently, and
          the provider gets its 200. Nothing downstream ever has to ask “have I seen this?”.
        </Callout>
        <Callout tone="accent" title="Order is a question about the data">
          Tide doesn’t sort events. The reflex that sets status selects the membership only if the event is newer than what it already reflects —
          so the newest event wins however the provider shuffles them, and a stale one is a recorded no-op.
        </Callout>
        <Callout tone="accent" title="Payments and status are separate reflexes">
          A late <i>successful</i> payment is still money in the bank, so recording payments has no ordering guard — only the dedupe. Status does. One
          reflex, one question: that is what lets each answer it correctly.
        </Callout>
      </Grid>
    </Page>
  );
};
