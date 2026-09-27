import { useEffect, useState, type FC } from 'react';
import { PhoneStyles } from '@showroom/chrome/stage/phone';
import { Callout, Chip, Code, Grid, INK, Lead, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import { BOOKED, createNight, DIGEST, REMINDERS, type Night, type NightState } from '../world/digest';
import { hhmm } from '../world/ledger';
import { Ledger } from './ledger';
import { Act, Messages } from './phones';

// ═══════════════════════════════════════════════════════════
// Tonight's digest for Olivia — many runs' worth of work, one summary.
//
// Pick whose SMS the gateway times out for tonight, and the night re-runs:
// six reminders go out at 21:00, the failures are retried once at 21:05, and
// when the last task lands the run settles. Tide writes that settlement down
// as a fact with the counts in it, and a second reflex emails Olivia from it.
// Then retry a failed one by hand and watch the digest NOT go out again.
//
// REAL: both reflexes, the engine, retry(), the ledger. SIMULATED and
// labelled: the SMS gateway and Olivia's mailer.
// ═══════════════════════════════════════════════════════════

export const TonightsDigest: FC = () => {
  const [failing, setFailing] = useState<ReadonlySet<string>>(new Set(['linus']));
  const [night, setNight] = useState<Night>();
  const [state, setState] = useState<NightState>();
  const [busy, setBusy] = useState(false);
  const [retries, setRetries] = useState(0);

  // Every change to the gateway re-runs the whole night from scratch.
  useEffect(() => {
    let live = true;
    void createNight(failing).then((n) => {
      if (!live) return;
      setNight(n);
      setState(n.state());
      setRetries(0);
    });
    return () => {
      live = false;
    };
  }, [failing]);

  const toggle = (id: string) =>
    setFailing((f) => {
      const next = new Set(f);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const retry = async (member: string) => {
    if (night === undefined || busy) return;
    setBusy(true);
    setState(await night.retry(member));
    setRetries((r) => r + 1);
    setBusy(false);
  };

  const failedTask = (member: string) => state?.ledger.tasks.find((t) => t.reflexId === REMINDERS.id && t.unit === member && t.state === 'failed');
  const run = state?.ledger.runs.find((r) => r.reflexId === REMINDERS.id);

  return (
    <Page>
      <PhoneStyles />
      <Lead eyebrow="Tonight’s digest" title="Six reminders go out tonight. Olivia gets one email about all of them — once.">
        At 21:00 Acme Studio texts every member booked into tomorrow’s Core & breath. Olivia, the owner, wants one line in her inbox when that’s
        done: how many went, how many didn’t. Nobody writes “am I the last one?” code for this — when tide finishes a <b>run</b> (one firing of a
        reflex), it writes a fact with the counts, and a second reflex answers that fact.
      </Lead>

      <Panel title="Tonight, the SMS gateway times out for…" aside={<Chip tone="warn">simulated gateway — pick whose texts fail</Chip>}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {BOOKED.map((m) => {
            const on = failing.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                style={{
                  font: 'inherit',
                  fontSize: 12.5,
                  fontWeight: 650,
                  padding: '5px 12px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  border: `1px solid ${on ? '#fecaca' : INK.line}`,
                  background: on ? INK.badWash : '#fff',
                  color: on ? INK.bad : INK.soft,
                }}
              >
                {on ? '✕ ' : '✓ '}
                {m.name}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 12.5, color: INK.soft }}>
          Each click re-runs the night from 20:55. A timeout is worth one more try, so the reminder reflex retries it once, five minutes later —
          then the task is <b>failed</b>, and the run can settle.
        </div>
      </Panel>

      <Grid min={300} gap={18}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Messages
            who="Olivia"
            status="Olivia · Mail"
            width={270}
            minHeight={220}
            tone={(state?.digests.length ?? 0) === 1 ? 'ok' : 'bad'}
            empty="No digest yet."
            notes={(state?.digests ?? []).map((d, i) => ({ key: `${d.at}-${i}`, at: d.at, icon: '📊', title: 'Tonight’s reminders', body: d.text, tone: d.failed > 0 ? 'warn' : 'plain' }))}
          />
          <div style={{ fontSize: 12, color: INK.soft, textAlign: 'center', maxWidth: 270 }}>
            {(state?.digests.length ?? 0) === 1 ? 'One digest, sent when the last reminder landed.' : ''}
            {retries > 0 && ' A retry re-settled the run — and did not send it again.'}
          </div>
        </div>

        <Panel title="The reminders" aside={run === undefined ? '' : `run ${run.id} · ${run.state} · ${run.done}/${run.total} done${run.failed > 0 ? ` · ${run.failed} failed` : ''}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {BOOKED.map((m) => {
              const mine = (state?.sms ?? []).filter((s) => s.member === m.id);
              const ok = mine.find((s) => s.ok);
              const task = failedTask(m.id);
              return (
                <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', gap: 10, alignItems: 'center', padding: '6px 10px', border: `1px solid ${INK.line}`, borderRadius: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{m.name}</span>
                  <span style={{ fontSize: 12, color: ok !== undefined ? INK.ok : INK.bad }}>
                    {ok !== undefined
                      ? `💬 sent at ${hhmm(ok.at)}${mine.length > 1 ? ` (after ${mine.length - 1} timeout${mine.length > 2 ? 's' : ''})` : ''}`
                      : mine.length === 0
                        ? '…'
                        : `timed out ${mine.length}× (${mine.map((s) => hhmm(s.at)).join(', ')}) — failed`}
                  </span>
                  {task !== undefined ? (
                    <Act busy={busy} label="Retry at 22:00" hint="the gateway is back" onClick={() => void retry(m.id)} />
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      </Grid>

      <Ledger ledger={state?.ledger} defaultOpen aside="look for the fact the run minted when it settled — the counts are on it" />

      <Grid min={340}>
        <Panel title="The reminder reflex">
          <Code maxHeight={300}>{JSON.stringify(REMINDERS, null, 2)}</Code>
        </Panel>
        <Panel title="The digest reflex" aside="it fires on the other one’s runs">
          <Code maxHeight={300}>{JSON.stringify(DIGEST, null, 2)}</Code>
        </Panel>
      </Grid>

      <Grid min={300} gap={12}>
        <Callout tone="accent" title="Fan-in is a fact">
          Tide keeps count of its own fan-out, so it is the only thing that knows when the last of six tasks has landed. It says so by writing a
          fact — <Mono>{'{ kind: "run", stats: { total, done, failed } }'}</Mono> — and <Mono>on: {'{ fact: { run: "reminders.nightly" } }'}</Mono> is
          an ordinary trigger. No barrier, no counter in a handler.
        </Callout>
        <Callout tone="accent" title="Retry doesn’t re-announce">
          <Mono>retry(taskId)</Mono> reopens a failed task and rewinds its run, which then settles a second time. The run row remembers it already
          announced itself (<Mono>drained</Mono>), so Olivia is not emailed twice — the digest that said “1 failed” stays the only one.
        </Callout>
        <Callout tone="accent" title="Throw what is worth retrying">
          The gateway handler <b>throws</b> on a timeout, so tide retries it on the reflex’s backoff and then parks it as <i>failed</i> — terminal,
          visible, and counted in the digest. Nothing is silently dropped, and nothing retries forever.
        </Callout>
      </Grid>
    </Page>
  );
};
