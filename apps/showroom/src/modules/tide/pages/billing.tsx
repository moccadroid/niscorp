import { useCallback, useEffect, useState, type FC } from 'react';
import type { PreviewReport } from '@niscorp/tide';
import { Btn, Callout, Chip, Code, Grid, INK, Lead, MONO, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import { CHARGE, createBillingTide, DECLINED, euros, PLANS, RECEIPT, RUN_AT, runScript, type BillingTide, type Charge, type ScriptState, type TideState } from '../world/billing';
import { Ledger } from './ledger';

// ═══════════════════════════════════════════════════════════
// The billing run — preview it, run it, watch it fail well.
//
// The first of the month, 03:00 in Vienna. Step the clock and read the two
// payment dashboards side by side: a billing script (simulated here, the usual
// shape) and three tide reflexes (real). Same members, same gateway, same bad
// luck: Ada's card declines, and the gateway fails Linus twice before it works.
// Under the dashboards, the Ledger prints the rows tide wrote at each step.
// ═══════════════════════════════════════════════════════════

const MINUTE = 60_000;

type Stage = { label: string; clock: string; at: number; what: string };

const STAGES: readonly Stage[] = [
  { label: 'Preview', clock: '02:55', at: RUN_AT - 5 * MINUTE, what: 'Five minutes before the run. Ask each side what it is about to do.' },
  { label: 'Run it', clock: '03:00', at: RUN_AT + MINUTE, what: 'The run starts. Ada’s card declines; the gateway returns a 503 for Linus.' },
  { label: '+10 min', clock: '03:10', at: RUN_AT + 11 * MINUTE, what: 'Ten minutes later: the first retry. The gateway is still unwell.' },
  { label: '+20 min', clock: '03:30', at: RUN_AT + 31 * MINUTE, what: 'Half past: the second retry. The gateway has recovered.' },
];

const nameOf = (id: string): string => PLANS.find((p) => p.id === id)?.name ?? id;
const hhmm = (at: number): string => {
  const local = new Date(at + 2 * 3_600_000); // CEST on 1 April
  return local.toISOString().slice(11, 16);
};

const Dashboard: FC<{ charges: readonly Charge[] }> = ({ charges }) => {
  const real = charges.filter((c) => c.replay !== true);
  const collected = real.filter((c) => c.outcome === 'succeeded').reduce((sum, c) => sum + c.amount, 0);
  const owed = PLANS.filter((p) => p.id !== 'ada').reduce((sum, p) => sum + p.amount, 0);
  const twice = PLANS.filter((p) => real.filter((c) => c.member === p.id && c.outcome === 'succeeded').length > 1);
  const declines = real.filter((c) => c.outcome === 'declined').length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.6, color: collected > owed ? INK.bad : INK.text }}>{euros(collected)}</span>
        <span style={{ fontSize: 12, color: INK.soft }}>collected · {euros(owed)} is owed</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {twice.length > 0 && <Chip tone="bad">{twice.length} members charged more than once</Chip>}
        {declines > 1 && <Chip tone="bad">Ada’s card declined {declines}× — her bank is watching</Chip>}
        {real.length > 0 && twice.length === 0 && declines <= 1 && <Chip tone="ok">every member charged once</Chip>}
      </div>
      <div style={{ border: `1px solid ${INK.line}`, borderRadius: 10, overflow: 'auto', maxHeight: 280 }}>
        {charges.length === 0 ? (
          <div style={{ padding: '10px 12px', fontSize: 12.5, color: INK.faint }}>No charges.</div>
        ) : (
          charges.map((c, i) => {
            const dup = c.outcome === 'succeeded' && c.replay !== true && real.filter((x) => x.member === c.member && x.outcome === 'succeeded' && x.at < c.at).length > 0;
            return (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px 1fr auto auto',
                  gap: 8,
                  alignItems: 'center',
                  padding: '6px 10px',
                  fontSize: 12.5,
                  borderTop: i === 0 ? 'none' : `1px solid ${INK.line}`,
                  background: dup ? '#fef2f2' : 'transparent',
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: 11, color: INK.faint }}>{hhmm(c.at)}</span>
                <span style={{ fontWeight: 600 }}>
                  {nameOf(c.member)}
                  {dup && <span style={{ color: INK.bad, fontWeight: 700 }}> — again</span>}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11.5 }}>{euros(c.amount)}</span>
                {c.replay === true ? (
                  <Chip tone="accent">same key — not charged</Chip>
                ) : c.outcome === 'succeeded' ? (
                  <Chip tone="ok">succeeded</Chip>
                ) : c.outcome === 'declined' ? (
                  <Chip tone="warn">declined</Chip>
                ) : (
                  <Chip tone="bad">503</Chip>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export const Billing: FC = () => {
  const [stage, setStage] = useState(0);
  const [tide, setTide] = useState<BillingTide>();
  const [tideState, setTideState] = useState<TideState>();
  const [preview, setPreview] = useState<PreviewReport>();
  const [script, setScript] = useState<ScriptState>({ charges: [], lines: [] });
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      const t = await createBillingTide();
      const current = STAGES[0];
      if (current === undefined || !live) return;
      setTide(t);
      setStage(0);
      setScript(runScript(current.at));
      setPreview(await t.preview(RUN_AT + MINUTE));
      setTideState(await t.advanceTo(current.at));
    })();
    return () => {
      live = false;
    };
  }, [epoch]);

  const step = useCallback(async () => {
    const next = STAGES[stage + 1];
    if (tide === undefined || next === undefined) return;
    setStage(stage + 1);
    setScript(runScript(next.at));
    setTideState(await tide.advanceTo(next.at));
  }, [stage, tide]);

  const current = STAGES[stage] ?? STAGES[0];
  const nextStage = STAGES[stage + 1];
  const retrying = tideState?.tasks.find((t) => t.state === 'retrying');
  const told = (tideState?.mails ?? []).find((m) => m.kind === 'declined');

  return (
    <Page>
      <Lead eyebrow="The billing run" title="Show me who you’ll charge. Then charge each of them once — whatever the gateway does.">
        It is the first of the month and Acme Studio bills its six members at 03:00. Ada’s card will decline. The gateway will fail Linus twice
        before it works. Step the clock and compare the two payment dashboards: a billing script — simulated here, in its usual shape — and three
        tide reflexes, running for real.
      </Lead>

      <Panel>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>{current?.clock}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {STAGES.map((s, i) => (
              <Chip key={s.label} tone={i === stage ? 'accent' : i < stage ? 'ok' : 'idle'}>
                {i < stage ? '✓ ' : ''}
                {s.clock}
              </Chip>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          {nextStage !== undefined ? (
            <Btn kind="primary" disabled={tide === undefined} onClick={() => void step()}>
              {nextStage.label} → {nextStage.clock}
            </Btn>
          ) : (
            <Btn kind="quiet" onClick={() => setEpoch((e) => e + 1)}>
              ↺ Start over
            </Btn>
          )}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55 }}>{current?.what}</div>
      </Panel>

      <Grid min={400}>
        <Panel title="A billing script" aside="simulated — charge in a loop; any error fails the job; the scheduler retries it" tone={stage >= 2 ? 'bad' : 'plain'}>
          {stage === 0 ? (
            <Callout tone="idle" title="There is no preview">
              A script is its effects. The only way to learn what it would charge is to let it charge.
            </Callout>
          ) : (
            <>
              <Dashboard charges={script.charges} />
              <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, background: '#0f172a', color: '#cbd5e1', borderRadius: 10, padding: '8px 10px' }}>
                {script.lines.map((l, i) => (
                  <div key={i} style={{ color: l.bad ? '#fca5a5' : '#86efac' }}>
                    {hhmm(l.at)} {l.text}
                  </div>
                ))}
              </div>
              <Callout tone="bad">
                {stage === 1
                  ? 'A decline and a 503 look the same to the script: errors. So the whole job failed — and will run again, from the top.'
                  : 'Every retry re-ran the loop over everyone. Members who had already paid paid again; Ada’s card was hit on every attempt, and nobody told her anything.'}
              </Callout>
            </>
          )}
        </Panel>

        <Panel title="tide" aside="three reflexes, the real engine" tone={stage >= 3 ? 'ok' : 'plain'}>
          {stage === 0 ? (
            <>
              <Callout tone="accent" title="preview('billing.charge') — the real pipeline, nothing charged">
                The occurrence is computed, the members are selected, every template is filled — and the one function that leaves the building is
                stubbed. This is what 03:00 will do:
              </Callout>
              <div style={{ border: `1px solid ${INK.line}`, borderRadius: 10, overflow: 'hidden' }}>
                {(preview?.units ?? []).map((u, i) => {
                  const r = typeof u.render === 'object' && u.render !== null ? Object.fromEntries(Object.entries(u.render)) : {};
                  return (
                    <div key={u.unit} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: 13, borderTop: i === 0 ? 'none' : `1px solid ${INK.line}` }}>
                      <span style={{ fontWeight: 600 }}>{nameOf(u.unit)}</span>
                      <span style={{ fontFamily: MONO }}>{String(r['charge'] ?? '')}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 12.5, color: INK.soft }}>
                {preview?.selected ?? '…'} members selected for the {preview?.occurrence ?? ''} run. No run was created, no task, no charge.
              </div>
            </>
          ) : (
            <>
              <Dashboard charges={tideState?.charges ?? []} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {told !== undefined && (
                  <Callout tone="ok" title={`${hhmm(told.at)} · Ada gets an email: “Your card was declined — update it here”`}>
                    The decline was an answer, not an error: the charge reflex <b>returned</b> it and wrote a charge row, and a second reflex fired on
                    that row. Nothing retried it.
                  </Callout>
                )}
                {retrying !== undefined && (
                  <Callout tone="warn" title={`Linus: retrying — attempt ${retrying.attempt} failed`}>
                    A 503 is the only thing worth trying again, so the handler <b>threw</b>. Tide retries that one task on a backoff
                    {tideState?.nextDue === undefined ? '' : `, next at ${hhmm(tideState.nextDue)}`} — nobody else is touched, and the gateway gets the
                    same idempotency key every time.
                  </Callout>
                )}
                {stage >= 3 && retrying === undefined && (
                  <Callout tone="ok" title="Settled">
                    Six members, six charges, six emails — five receipts and one card-declined. Every attempt is a row in the ledger.
                  </Callout>
                )}
              </div>
            </>
          )}
        </Panel>
      </Grid>

      <Ledger ledger={tideState?.ledger} aside={stage === 0 ? 'empty — preview wrote nothing' : 'the tide side’s rows so far — watch Linus’s task count its attempts'} />

      <Panel title="The three reflexes" aside="data, not code — each one a row you can review, preview and diff">
        <Grid min={300} gap={12}>
          {[CHARGE, RECEIPT, DECLINED].map((r) => (
            <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 650 }}>{r.intent}</div>
              <Code maxHeight={230}>{JSON.stringify(r, null, 2)}</Code>
            </div>
          ))}
        </Grid>
        <div style={{ fontSize: 12.5, color: INK.soft, lineHeight: 1.55 }}>
          There is no procedure saying “charge, then if it worked send a receipt”. The charge writes a row; the other two reflexes fire on rows. A crash
          between any two steps loses nothing, because the step between them is in the database. The only rule a handler follows:{' '}
          <Mono>return</Mono> an answer, <Mono>throw</Mono> what is worth retrying.
        </div>
      </Panel>
    </Page>
  );
};
