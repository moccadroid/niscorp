import { Fragment, useEffect, useState, type FC } from 'react';
import { PhoneFrame } from '@showroom/chrome/stage/phone';
import { Btn, Callout, Chip, Grid, INK, Lead, MONO, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import { localStamp, MEMBERS, runCron, runTide, SCENARIOS, type Delivery, type Scenario, type Side } from '../world/nights';
import { Ledger } from './ledger';

// ═══════════════════════════════════════════════════════════
// What breaks cron — the same nightly job, five weeks, two schedulers.
//
// Each scenario runs the week twice: once through a simulation of cron (labelled
// as such — it is written here), once through the real tide engine. The grid is
// what each member received each night; Grace's phone is what that looks like.
// Under it, the Ledger prints the rows the tide side left: the runs, the tasks,
// the reclaimed attempt after the crash.
// ═══════════════════════════════════════════════════════════

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const nightLabel = (night: string): string => {
  const d = new Date(`${night}T12:00:00Z`);
  return `${DOW[d.getUTCDay()] ?? ''} ${d.getUTCDate()}`;
};

const Cell: FC<{ ds: readonly Delivery[]; shown: boolean }> = ({ ds, shown }) => {
  const delivered = ds.filter((d) => d.dropped !== true);
  const dropped = ds.length - delivered.length;
  const late = delivered.some((d) => d.late === true);
  const n = delivered.length;
  const tone = !shown ? 'wait' : n === 1 ? (late ? 'late' : 'ok') : 'bad';
  const colors = {
    wait: { bg: INK.wash, fg: INK.line, border: INK.line },
    ok: { bg: '#d1fae5', fg: '#065f46', border: '#a7f3d0' },
    late: { bg: '#fef3c7', fg: '#92400e', border: '#fde68a' },
    bad: { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' },
  }[tone];
  return (
    <div
      title={!shown ? '' : dropped > 0 ? `${n} delivered · ${dropped} duplicate dropped by the provider` : `${n} email${n === 1 ? '' : 's'}${late ? ', late' : ''}`}
      style={{
        height: 30,
        borderRadius: 7,
        display: 'grid',
        placeItems: 'center',
        fontFamily: MONO,
        fontSize: 12,
        fontWeight: 700,
        background: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.border}`,
        transition: 'background 200ms',
        position: 'relative',
      }}
    >
      {!shown ? '' : n === 0 ? '—' : n === 1 ? (late ? 'late' : '✓') : `×${n}`}
      {shown && dropped > 0 && <span style={{ position: 'absolute', top: -6, right: -6, fontSize: 9, background: INK.accent, color: '#fff', borderRadius: 999, padding: '0 4px' }}>+{dropped}</span>}
    </div>
  );
};

const Outbox: FC<{ scenario: Scenario; side: Side | undefined; shown: number }> = ({ scenario, side, shown }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `58px repeat(${scenario.nights.length}, minmax(0, 1fr))`, gap: 5, alignItems: 'center' }}>
    <div />
    {scenario.nights.map((n, i) => (
      <div key={n} style={{ fontSize: 11, fontWeight: 650, color: i < shown ? INK.text : INK.faint, textAlign: 'center' }}>
        {nightLabel(n)}
        {(scenario.down ?? []).includes(n) ? <div style={{ fontSize: 9.5, color: INK.bad }}>down</div> : null}
      </div>
    ))}
    {MEMBERS.map((m) => (
      <Fragment key={m.id}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>
          {m.name}
        </div>
        {scenario.nights.map((n, i) => (
          <Cell key={`${m.id}-${n}`} shown={side !== undefined && i < shown} ds={(side?.deliveries ?? []).filter((d) => d.member === m.id && d.night === n)} />
        ))}
      </Fragment>
    ))}
  </div>
);

export const Inbox: FC<{ scenario: Scenario; side: Side | undefined; shown: number; tone: 'bad' | 'ok' }> = ({ scenario, side, shown, tone }) => {
  const visible = new Set(scenario.nights.slice(0, shown));
  const mail = (side?.deliveries ?? []).filter((d) => d.member === 'grace' && visible.has(d.night));
  const delivered = mail.filter((d) => d.dropped !== true).sort((a, b) => b.at - a.at);
  const dropped = mail.length - delivered.length;
  const expected = shown;
  const wrong = delivered.length !== expected;
  return (
    <PhoneFrame tone={shown === 0 ? 'plain' : wrong ? 'bad' : tone === 'ok' ? 'ok' : 'plain'} width={240} status="Grace · Mail" minHeight={300}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 17, fontWeight: 750, letterSpacing: -0.3 }}>Inbox</div>
        {delivered.length === 0 && <div style={{ fontSize: 12, color: INK.faint }}>Nothing yet.</div>}
        {delivered.map((d, i) => {
          const dup = delivered.some((x) => x.night === d.night && x.at < d.at);
          return (
            <div key={i} style={{ background: dup ? '#fef2f2' : '#fff', border: `1px solid ${dup ? '#fecaca' : '#eef0f3'}`, borderRadius: 10, padding: '7px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 10.5, color: INK.faint }}>
                <span style={{ fontWeight: 700, color: INK.text }}>Acme Studio</span>
                <span>{localStamp(d.at)}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{scenario.job.subject}</div>
              <div style={{ fontSize: 11, color: d.late === true ? INK.warn : INK.soft }}>
                for {nightLabel(d.night)}
                {d.late === true ? ' — sent late' : ''}
                {dup ? ' — again' : ''}
              </div>
            </div>
          );
        })}
        {dropped > 0 && (
          <div style={{ fontSize: 10.5, color: INK.accent, lineHeight: 1.4 }}>
            {dropped} retried send carried a key the provider had already seen — dropped, never delivered.
          </div>
        )}
      </div>
    </PhoneFrame>
  );
};

const Log: FC<{ side: Side | undefined; nights: readonly string[]; shown: number }> = ({ side, nights, shown }) => {
  const visible = new Set(nights.slice(0, shown));
  const lines = (side?.log ?? []).filter((l) => visible.has(l.night));
  return (
    <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, background: '#0f172a', color: '#cbd5e1', borderRadius: 10, padding: '8px 10px', minHeight: 60 }}>
      {lines.length === 0 ? (
        <span style={{ color: '#64748b' }}>…</span>
      ) : (
        lines.map((l, i) => (
          <div key={i} style={{ color: l.tone === 'bad' ? '#fca5a5' : l.tone === 'warn' ? '#fcd34d' : l.tone === 'ok' ? '#86efac' : '#94a3b8' }}>
            {l.text}
          </div>
        ))
      )}
    </div>
  );
};

export const BreaksCron: FC = () => {
  const [id, setId] = useState('crash');
  const scenario = SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
  const [cron, setCron] = useState<Side>();
  const [tide, setTide] = useState<Side>();
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (scenario === undefined) return;
    let live = true;
    setCron(undefined);
    setTide(undefined);
    setShown(0);
    setPlaying(false);
    setCron(runCron(scenario));
    void runTide(scenario).then((t) => live && setTide(t));
    return () => {
      live = false;
    };
  }, [scenario]);

  useEffect(() => {
    if (!playing || scenario === undefined) return;
    if (shown >= scenario.nights.length) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setShown((n) => n + 1), 650);
    return () => clearTimeout(timer);
  }, [playing, shown, scenario]);

  if (scenario === undefined) return null;
  const done = shown >= scenario.nights.length;
  const ready = cron !== undefined && tide !== undefined;

  return (
    <Page>
      <Lead eyebrow="What breaks cron" title="A job that runs every night is easy. Once a night, every night, is not.">
        Acme Studio emails its members every night at 02:30. Pick what goes wrong this week, then play it: the same job runs through cron — simulated
        on this page, the way cron behaves — and through tide, for real. Each square is one member on one night; one email is right.
      </Lead>

      <Panel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SCENARIOS.map((s) => (
            <Btn key={s.id} kind={s.id === scenario.id ? 'primary' : 'plain'} onClick={() => setId(s.id)}>
              {s.label}
            </Btn>
          ))}
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.6 }}>{scenario.story}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Btn
            kind="primary"
            disabled={!ready || playing}
            onClick={() => {
              if (done) setShown(0);
              setPlaying(true);
            }}
          >
            {!ready ? 'Running the week…' : done ? '↺ Play it again' : shown === 0 ? '▶ Play the week' : '▶ Continue'}
          </Btn>
          <Btn kind="quiet" disabled={!ready || done} onClick={() => setShown(scenario.nights.length)}>
            Show all nights
          </Btn>
          <span style={{ fontSize: 12, color: INK.faint }}>
            {shown} of {scenario.nights.length} nights
          </span>
        </div>
      </Panel>

      <Grid min={420}>
        <Panel tone={done ? 'bad' : 'plain'} title="cron" aside="simulated here — the wall clock, a supervisor, no memory">
          <Outbox scenario={scenario} side={cron} shown={shown} />
          <Grid min={220} gap={12}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Inbox scenario={scenario} side={cron} shown={shown} tone="bad" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Log side={cron} nights={scenario.nights} shown={shown} />
              {done && <Callout tone={scenario.id === 'ordinary' ? 'idle' : 'bad'}>{scenario.cron}</Callout>}
            </div>
          </Grid>
        </Panel>
        <Panel tone={done ? 'ok' : 'plain'} title="tide" aside="the real engine — runs and tasks are rows">
          <Outbox scenario={scenario} side={tide} shown={shown} />
          <Grid min={220} gap={12}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Inbox scenario={scenario} side={tide} shown={shown} tone="ok" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Log side={tide} nights={scenario.nights} shown={shown} />
              {done && <Callout tone="ok">{scenario.tide}</Callout>}
            </div>
          </Grid>
        </Panel>
      </Grid>

      <Ledger
        ledger={tide?.ledger}
        aside="the tide side’s rows for the whole week — one run per night, one task per member per night"
      />

      <Grid min={300} gap={12}>
        <Callout tone="accent" title="Why tide can’t double-send">
          Before an email goes out, tide writes a task row keyed by the run and the member — <Mono>(Tuesday, Grace)</Mono>. There is no path to the
          send that skips that row, so a restart finds the work already recorded instead of starting over.
        </Callout>
        <Callout tone="accent" title="Why daylight saving can’t bite">
          A run is named by the local <i>date</i>, <Mono>2026-03-29</Mono>, never by an instant. A clock change can move when that date’s run fires; it
          cannot make a date happen twice, or not at all.
        </Callout>
        <Callout tone="accent" title="Why downtime is a decision">
          What happens to missed nights is written on the automation — <Mono>catchUp: run</Mono>, <Mono>latest</Mono> or <Mono>skip</Mono> — and every
          night that was run late or skipped leaves a row saying so.
        </Callout>
      </Grid>

      <div style={{ fontSize: 12, color: INK.faint }}>
        <Chip mono>cron</Chip> here is a model, not a daemon: every minute it reads Vienna’s wall clock, and when it says 02:30 it runs the job; a
        crashed job is restarted from the top; nothing ticks while the server is down. That is how cron behaves.
      </div>
    </Page>
  );
};
