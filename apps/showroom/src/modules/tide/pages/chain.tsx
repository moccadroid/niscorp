import { useCallback, useEffect, useState, type FC } from 'react';
import type { Fact, Run, Task } from '@niscorp/tide';
import { PhoneStyles } from '@showroom/chrome/stage/phone';
import { Btn, Callout, Chip, Code, Grid, INK, Lead, MONO, Mono, Page, Panel, type Tone } from '@showroom/chrome/stage/ui';
import { AFTER, CLASS, createChain, PEOPLE, REFLEXES, STARTS, TWO_HOURS_BEFORE, type Chain, type ChainState, type PushKind } from '../world/chain';
import { hhmm, stamp } from '../world/ledger';
import { brief, Ledger } from './ledger';
import { Act, Messages } from './phones';

// ═══════════════════════════════════════════════════════════
// One booking, a chain of events — make things happen to Power hour and
// watch each consequence arrive as its own row.
//
// There is no workflow here, no "on booking: confirm, wait, remind, wait,
// ask". Seven small reflexes each answer one fact, and some of them make
// facts of their own. Every hop is in the ledger.
//
// REAL: the seven reflexes and the engine. SIMULATED and labelled: the
// booking table (the page writes it and pushes a fact per write — the host's
// job) and the push service, which records instead of sending.
// ═══════════════════════════════════════════════════════════

const ICON: Record<PushKind, string> = { confirmed: '✅', promoted: '🎉', reminder: '⏰', feedback: '⭐', cancelled: '↩️', waitlisted: '⏳' };

// One hop, readable: what kind of row, and what it says.
type Hop = { id: string; kind: 'fact' | 'run' | 'task'; text: string; tone: Tone };

const seq = (id: string): number => Number(id.replace(/^\D+_/, '')) || 0;

const factHop = (f: Fact): Hop => ({
  id: f.id,
  kind: 'fact',
  tone: f.notBefore !== undefined && f.deliveredAt === undefined ? 'warn' : 'accent',
  text:
    f.kind === 'write'
      ? `${f.entity ?? ''}.${f.op ?? ''} — ${brief(f.row, 50)}`
      : f.kind === 'signal'
        ? `signal ${f.name ?? ''} for ${brief(f.payload, 30)}${f.notBefore === undefined ? '' : ` · waits till ${hhmm(f.notBefore)}`}`
        : f.kind === 'run'
          ? `${f.reflex ?? ''} settled (${f.stats?.done ?? 0}/${f.stats?.total ?? 0})`
          : `run now → ${f.target ?? ''}`,
});
const runHop = (r: Run): Hop => ({
  id: r.id,
  kind: 'run',
  tone: r.selected === 0 ? 'warn' : 'idle',
  text: `${r.reflexId}${r.selected === 0 ? ' — selected nobody, so nothing to do' : ''}`,
});
const taskHop = (t: Task): Hop => ({ id: t.id, kind: 'task', tone: t.state === 'done' ? 'ok' : t.state === 'failed' ? 'bad' : 'warn', text: `${t.reflexId} · ${t.unit === '' ? 'the fact’s row' : t.unit} · ${t.state} — ${brief(t.output, 40)}` });

const hopsBetween = (before: ChainState | undefined, after: ChainState): readonly Hop[] => {
  const old = new Set(before === undefined ? [] : [...before.ledger.facts, ...before.ledger.runs, ...before.ledger.tasks].map((r) => r.id));
  const hops = [
    ...after.ledger.facts.filter((f) => f.kind !== 'run').map(factHop),
    ...after.ledger.runs.map(runHop),
    ...after.ledger.tasks.map(taskHop),
  ].filter((h) => !old.has(h.id));
  // A delayed fact that has just come due is part of this click's story too.
  const woke = after.ledger.facts.filter((f) => f.notBefore !== undefined && f.deliveredAt !== undefined && before?.ledger.facts.find((x) => x.id === f.id)?.deliveredAt === undefined && old.has(f.id));
  return [...woke.map((f) => ({ ...factHop(f), text: `${factHop(f).text.replace(/ · waits till .*/, '')} — came due` })), ...hops].sort((a, b) => seq(a.id) - seq(b.id));
};

const KIND_TONE: Record<Hop['kind'], Tone> = { fact: 'accent', run: 'idle', task: 'ok' };

export const OneBookingChain: FC = () => {
  const [chain, setChain] = useState<Chain>();
  const [state, setState] = useState<ChainState>();
  const [last, setLast] = useState<{ label: string; hops: readonly Hop[]; pushes: number }>();
  const [epoch, setEpoch] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const c = await createChain();
      const s = await c.state();
      if (!live) return;
      setChain(c);
      setState(s);
      setLast(undefined);
    })();
    return () => {
      live = false;
    };
  }, [epoch]);

  const act = useCallback(
    async (label: string, go: (c: Chain) => Promise<ChainState>) => {
      if (chain === undefined || busy) return;
      setBusy(true);
      const before = state;
      const after = await go(chain);
      setState(after);
      setLast({ label, hops: hopsBetween(before, after), pushes: before?.pushes.length ?? 0 });
      setBusy(false);
    },
    [chain, state, busy],
  );

  if (state === undefined) return null;
  const started = state.now >= STARTS;
  const where = (m: string): 'booked' | 'waiting' | 'none' => (state.booked.includes(m) ? 'booked' : state.waitlist.includes(m) ? 'waiting' : 'none');
  const bookWhy = (m: string): string | undefined =>
    started ? 'The class has started — booking is closed.' : where(m) === 'booked' ? `${PEOPLE[m]} is already booked.` : where(m) === 'waiting' ? `${PEOPLE[m]} is already on the waitlist.` : undefined;
  const cancelWhy = (m: string): string | undefined =>
    started ? 'The class has started.' : where(m) === 'none' ? `${PEOPLE[m]} has nothing to cancel — book first.` : undefined;
  const freshPush = new Set(state.pushes.slice(last?.pushes ?? state.pushes.length).map((p, i) => `${p.at}-${(last?.pushes ?? 0) + i}`));
  const notesFor = (m: string) =>
    state.pushes
      .map((p, i) => ({ p, key: `${p.at}-${i}` }))
      .filter(({ p }) => p.member === m)
      .map(({ p, key }) => ({ key, at: p.at, icon: ICON[p.kind], title: p.text, body: `from ${p.reflex}` }));

  return (
    <Page>
      <PhoneStyles />
      <Lead eyebrow="One booking, a chain of events" title="Mia books a class. Five messages follow — and nobody wrote the sequence down.">
        Power hour is on Monday at 12:15 and has four spots; Ada, Alan and Grace hold three. Make things happen below and watch Mia’s and Ruth’s
        phones. Each consequence — the confirmation, the reminder, the “how was it?”, the spot passed to the waitlist — is a small <b>reflex</b>{' '}
        answering one <b>fact</b> (something that happened). Some reflexes make facts of their own; that is the whole chain.
      </Lead>

      <Panel>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>{stamp(state.now)}</div>
          <Chip tone={started ? 'idle' : 'accent'}>{started ? (state.now >= AFTER ? 'class over' : 'class under way') : `class in ${Math.round((STARTS - state.now) / 60_000)} min`}</Chip>
          <span style={{ flex: 1 }} />
          <Btn kind="quiet" onClick={() => setEpoch((e) => e + 1)}>
            ↺ Start over
          </Btn>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Act primary label="Mia books Power hour" why={bookWhy('mia')} busy={busy} hint="a spot if there is one, the waitlist if not" onClick={() => void act('Mia books Power hour', (c) => c.book('mia'))} />
          <Act label="Ruth books Power hour" why={bookWhy('ruth')} busy={busy} hint="same rule" onClick={() => void act('Ruth books Power hour', (c) => c.book('ruth'))} />
          <Act label="Mia cancels" why={cancelWhy('mia')} busy={busy} hint={where('mia') === 'waiting' ? 'leaves the waitlist' : 'frees her spot'} onClick={() => void act('Mia cancels', (c) => c.cancel('mia'))} />
          <Act
            label="⏩ The class is 2 hours away"
            why={state.now >= TWO_HOURS_BEFORE ? 'It is already past 10:15.' : undefined}
            busy={busy}
            hint="move the clock to 10:15"
            onClick={() => void act('The class is 2 hours away', (c) => c.clockTo(TWO_HOURS_BEFORE))}
          />
          <Act
            label="⏩ The class ended"
            why={state.now >= AFTER ? 'The class is over — start over to replay.' : undefined}
            busy={busy}
            hint="move the clock to 13:20"
            onClick={() => void act('The class ended', (c) => c.clockTo(AFTER))}
          />
        </div>
      </Panel>

      <Grid min={250} gap={18}>
        <Panel title={`${CLASS.name} · Mon 12:15`} aside={<Chip tone="warn">simulated booking table</Chip>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from({ length: CLASS.capacity }, (_, i) => state.booked[i]).map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 9, border: `1px solid ${INK.line}`, background: m === undefined ? INK.wash : '#fff', fontSize: 13 }}>
                <span style={{ fontWeight: 650, color: m === undefined ? INK.faint : INK.text }}>{m === undefined ? 'open spot' : PEOPLE[m]}</span>
                <span style={{ fontSize: 11.5, color: INK.faint }}>spot {i + 1}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: INK.soft }}>
            <b>Waitlist:</b> {state.waitlist.length === 0 ? 'nobody' : state.waitlist.map((m, i) => `#${i + 1} ${PEOPLE[m] ?? m}`).join(', ')}
          </div>
        </Panel>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Messages who="Mia" status="Mia · Acme app" notes={notesFor('mia')} fresh={freshPush} tone="accent" width={250} minHeight={300} empty="No notifications." />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Messages who="Ruth" status="Ruth · Acme app" notes={notesFor('ruth')} fresh={freshPush} tone="accent" width={250} minHeight={300} empty="No notifications." />
        </div>
      </Grid>

      <Panel title={last === undefined ? 'What each click does' : `What “${last.label}” did`} aside="the new rows, in the order tide wrote them">
        {last === undefined ? (
          <div style={{ fontSize: 13, color: INK.soft }}>Click something above. Its whole consequence will be listed here, one row per hop.</div>
        ) : last.hops.length === 0 ? (
          <div style={{ fontSize: 13, color: INK.soft }}>Nothing new — no fact arrived and nothing came due, so no reflex had anything to do.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {last.hops.map((h, i) => (
              <div key={h.id} style={{ display: 'grid', gridTemplateColumns: '22px 56px 64px minmax(0, 1fr)', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                <span style={{ color: INK.faint, fontFamily: MONO, fontSize: 11 }}>{i + 1}</span>
                <Chip tone={KIND_TONE[h.kind]}>{h.kind}</Chip>
                <span style={{ fontFamily: MONO, fontSize: 11, color: INK.faint }}>{h.id}</span>
                <span style={{ color: h.tone === 'warn' ? INK.warn : INK.text }}>{h.text}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Ledger ledger={state.ledger} defaultOpen aside="every hop, as a row — tinted rows came from the last click" />

      <Panel title="The seven reflexes" aside="each one answers one fact; none of them knows about the others">
        <Grid min={300} gap={12}>
          {REFLEXES.map((r) => (
            <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 650 }}>{r.intent}</div>
              <Code maxHeight={200}>{JSON.stringify(r, null, 2)}</Code>
            </div>
          ))}
        </Grid>
      </Panel>

      <Grid min={300} gap={12}>
        <Callout tone="accent" title="There is no run body">
          Nowhere does it say “confirm, then wait, then remind”. The booking is a fact; two reflexes answer it. One of them sets two timers — which
          are just facts that wait (<Mono>notBefore</Mono>). When they come due, two more reflexes answer those. A crash between any two hops loses
          nothing: the hop is a row.
        </Callout>
        <Callout tone="accent" title="Cancelling needs no cancel button">
          Book Mia, cancel her, then jump to 10:15. Her timer still comes due — and the reminder asks the bookings table whether she is still booked.
          She isn’t, so it selects nobody and sends nothing: the run row says <i>selected 0</i>. Reality is the cancellation token.
        </Callout>
        <Callout tone="accent" title="Booking twice sets one timer">
          Each timer carries a dedupe key — <Mono>soon:2026-03-02:mia</Mono>. Cancel and rebook Mia, and the second set of timers collides with the
          first and is dropped at the door: one reminder, whatever the member does with the button.
        </Callout>
      </Grid>
    </Page>
  );
};
