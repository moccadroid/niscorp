import { useEffect, useState, type FC, type ReactNode } from 'react';
import type { PreviewReport } from '@niscorp/tide';
import { PhoneStyles } from '@showroom/chrome/stage/phone';
import { Btn, Callout, Chip, Code, Grid, INK, Lead, MONO, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import {
  BOOKINGS,
  CHANNELS,
  CLASSES,
  MEMBERS,
  NEW_BOOKINGS,
  previewAt,
  previewOf,
  reflexOf,
  runWeek,
  settle,
  TIMES,
  TRIGGERS,
  WHO,
  whyNot,
  type Choice,
  type WeekResult,
} from '../world/build';
import { recordOf, stamp, str } from '../world/ledger';
import { Ledger } from './ledger';
import { Messages } from './phones';

// ═══════════════════════════════════════════════════════════
// Build a reflex — pick a trigger, an audience and a channel, and watch the
// automation you just made: its JSON, what `preview()` says it would do, and
// then a whole week of it running.
//
// REAL: the reflex (tide parses it on load), preview, the engine running the
// week, the ledger. SIMULATED and labelled: the six members and their
// bookings (in-page rows behind the `select` seam) and the three senders.
// ═══════════════════════════════════════════════════════════

const Pick: FC<{ on: boolean; why?: string; onClick: () => void; children: ReactNode }> = ({ on, why, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={why !== undefined}
    title={why}
    style={{
      font: 'inherit',
      fontSize: 12.5,
      fontWeight: 650,
      padding: '5px 12px',
      borderRadius: 999,
      cursor: why === undefined ? 'pointer' : 'not-allowed',
      border: `1px solid ${on ? '#c7d2fe' : INK.line}`,
      background: on ? INK.accentWash : why === undefined ? '#fff' : INK.wash,
      color: on ? INK.accent : why === undefined ? INK.text : INK.faint,
      textDecoration: why === undefined ? 'none' : 'line-through',
    }}
  >
    {on ? '✓ ' : ''}
    {children}
  </button>
);

const Step: FC<{ n: number; title: string; children: ReactNode; note?: string }> = ({ n, title, children, note }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: 10, alignItems: 'start' }}>
    <div style={{ width: 24, height: 24, borderRadius: 999, background: INK.accent, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{n}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>
      {note !== undefined && <div style={{ fontSize: 12, color: INK.warn, lineHeight: 1.45 }}>{note}</div>}
    </div>
  </div>
);

const ICON: Record<string, string> = { email: '✉️', sms: '💬', push: '🔔' };
const nameOf = (id: string): string => MEMBERS.find((m) => m.id === id)?.name ?? id;

const cell = { padding: '5px 8px', borderTop: `1px solid ${INK.line}` } as const;
const head = { padding: '5px 8px', textAlign: 'left', color: INK.faint, fontWeight: 600, fontSize: 11 } as const;

export const BuildAReflex: FC = () => {
  const [choice, setChoice] = useState<Choice>({ trigger: 'daily', at: '18:00', who: 'tomorrow', channel: 'sms' });
  const [preview, setPreview] = useState<PreviewReport>();
  const [on, setOn] = useState(false);
  const [week, setWeek] = useState<WeekResult>();

  // Every click re-previews — and, once switched on, re-runs the whole week.
  useEffect(() => {
    let live = true;
    void previewOf(choice).then((p) => live && setPreview(p));
    if (on) void runWeek(choice).then((w) => live && setWeek(w));
    return () => {
      live = false;
    };
  }, [choice, on]);

  const pick = (patch: Partial<Choice>) => setChoice((c) => settle({ ...c, ...patch }));
  const reflex = reflexOf(choice);
  const chosen = new Set((preview?.units ?? []).map((u) => str(recordOf(u.render)['to'])));
  const whoWhy = WHO.map((w) => whyNot(choice.trigger, w.id)).find((x) => x !== undefined);
  const sent = (week?.messages ?? []).filter((m) => m.delivered);
  const unsent = (week?.messages ?? []).filter((m) => !m.delivered);

  return (
    <Page>
      <PhoneStyles />
      <Lead eyebrow="Build a reflex" title="Make an automation by clicking — then read exactly what it will do before it does it.">
        A <b>reflex</b> is one automation, written as data: <i>when</i> it fires, <i>who</i> it is about, and the <i>one thing</i> it does. Pick the
        three parts below. The reflex updates as you click, <Mono>preview()</Mono> tells you who would get what without sending anything, and when
        you are happy you switch it on and let a whole week run through it.
      </Lead>

      <Panel title="Build it" aside="three choices make one reflex">
        <Step n={1} title="When?">
          {TRIGGERS.map((t) => (
            <Pick key={t.id} on={choice.trigger === t.id} onClick={() => pick({ trigger: t.id })}>
              {t.label}
            </Pick>
          ))}
          {choice.trigger === 'daily' && (
            <span style={{ display: 'inline-flex', gap: 4, marginLeft: 6, alignItems: 'center' }}>
              {TIMES.map((t) => (
                <Pick key={t} on={choice.at === t} onClick={() => pick({ at: t })}>
                  {t}
                </Pick>
              ))}
            </span>
          )}
        </Step>
        <Step n={2} title="Who is it about?" note={whoWhy === undefined ? undefined : `Crossed out: ${whoWhy}`}>
          {WHO.map((w) => (
            <Pick key={w.id} on={choice.who === w.id} why={whyNot(choice.trigger, w.id)} onClick={() => pick({ who: w.id })}>
              {w.label}
            </Pick>
          ))}
        </Step>
        <Step n={3} title="What does it do?">
          {CHANNELS.map((c) => (
            <Pick key={c.id} on={choice.channel === c.id} onClick={() => pick({ channel: c.id })}>
              {c.icon} {c.label}
            </Pick>
          ))}
        </Step>
      </Panel>

      <Grid min={380}>
        <Panel title="The reflex you built" aside="data, not code — tide validates it on load">
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{reflex.intent}</div>
          <Code maxHeight={380}>{JSON.stringify(reflex, null, 2)}</Code>
          <div style={{ fontSize: 12, color: INK.soft, lineHeight: 1.55 }}>
            <Mono>on</Mono> is the trigger, <Mono>select</Mono> asks the studio’s data who it is about (one <b>task</b> per row, keyed by{' '}
            <Mono>unitKey</Mono>), and <Mono>effect</Mono> is the one thing it does per task. <Mono>{'{ "$ref": "$.row.id" }'}</Mono> is a template:
            it is filled in per member when the reflex runs.
            {choice.who === 'booker' && ' No select here: a booking arrives as a fact carrying its row, and that row is the unit.'}
          </div>
        </Panel>

        <Panel title="preview() — who would get what" aside="the real pipeline, nothing sent">
          {preview === undefined ? (
            <div style={{ fontSize: 12.5, color: INK.faint }}>…</div>
          ) : (
            <>
              <div style={{ fontFamily: MONO, fontSize: 11.5, color: INK.soft, lineHeight: 1.5 }}>
                preview('{preview.reflexId}', {'{'} now: {stamp(previewAt(choice))} {'}'})
                <br />→ {preview.occurrence !== undefined ? `occurrence ${preview.occurrence}` : preview.cause} · {preview.selected} selected
              </div>
              {!preview.fired ? (
                <Callout tone="bad" title="It would not fire">
                  {preview.reason}
                </Callout>
              ) : preview.units.length === 0 ? (
                <Callout tone="idle" title="Nobody, this time">
                  The selection returned no rows for this moment. That is an ordinary answer, and a run would record it.
                </Callout>
              ) : (
                <div style={{ border: `1px solid ${INK.line}`, borderRadius: 10, overflow: 'hidden' }}>
                  {preview.units.map((u, i) => {
                    const r = recordOf(u.render);
                    const skip = str(r['skip']);
                    return (
                      <div key={u.unit || i} style={{ display: 'grid', gridTemplateColumns: '70px minmax(0, 1fr)', gap: 8, padding: '7px 10px', fontSize: 12.5, borderTop: i === 0 ? 'none' : `1px solid ${INK.line}` }}>
                        <span style={{ fontWeight: 700 }}>
                          {ICON[choice.channel]} {nameOf(str(r['to']))}
                        </span>
                        <span>
                          {u.error !== undefined ? <span style={{ color: INK.bad }}>{u.error}</span> : str(r['text'])}
                          {skip !== '' && <div style={{ fontSize: 11.5, color: INK.warn }}>won’t arrive — {skip}</div>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 12, color: INK.soft, lineHeight: 1.5 }}>
                {choice.trigger === 'booking'
                  ? `Asked with a sample fact: ${nameOf(NEW_BOOKINGS[0]?.member ?? '')}’s booking, as it will arrive on Monday. `
                  : choice.trigger === 'manual'
                    ? 'Asked as if someone pressed “run now” on Wednesday at 10:00. '
                    : 'Asked about the first time this week the clock says go. '}
                The occurrence was computed, the members selected, every template filled — only the sender was stubbed. No run, no task, no message.
              </div>
            </>
          )}
        </Panel>
      </Grid>

      <Panel title="The studio’s data" aside={<Chip tone="warn">simulated — rows in this page, behind tide’s select seam</Chip>}>
        <Grid min={340} gap={14}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>members · tinted = selected by the preview</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  {['member', 'phone', 'app', 'plan renews'].map((h) => (
                    <th key={h} style={head}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MEMBERS.map((m) => (
                  <tr key={m.id} style={{ background: chosen.has(m.id) ? INK.accentWash : 'transparent', transition: 'background 200ms' }}>
                    <td style={{ ...cell, fontWeight: 650 }}>{m.name}</td>
                    <td style={{ ...cell, fontFamily: MONO, fontSize: 11, color: m.phone === '' ? INK.warn : INK.soft }}>{m.phone === '' ? 'none' : m.phone}</td>
                    <td style={{ ...cell, color: m.app ? INK.ok : INK.warn }}>{m.app ? 'yes' : 'no'}</td>
                    <td style={{ ...cell, fontFamily: MONO, fontSize: 11 }}>{m.renews}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>bookings · the week of 2 March</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  {['member', 'class', 'on', 'made'].map((h) => (
                    <th key={h} style={head}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...BOOKINGS, ...NEW_BOOKINGS].map((b, i) => (
                  <tr key={i}>
                    <td style={{ ...cell, fontWeight: 650 }}>{nameOf(b.member)}</td>
                    <td style={cell}>
                      {CLASSES[b.cls].name} {CLASSES[b.cls].at}
                    </td>
                    <td style={{ ...cell, fontFamily: MONO, fontSize: 11 }}>{b.date.slice(5)}</td>
                    <td style={{ ...cell, fontSize: 11.5, color: b.madeAt === undefined ? INK.faint : INK.accent }}>{b.madeAt === undefined ? 'before' : `${stamp(b.madeAt)} — arrives as a fact`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Grid>
      </Panel>

      <Panel
        title="Switch it on and run the week"
        aside={<Chip tone="warn">the senders are simulated — they record, they don’t send</Chip>}
        tone={week !== undefined && on ? 'ok' : 'plain'}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {!on ? (
            <Btn kind="primary" onClick={() => setOn(true)}>
              ▶ Switch it on and run Mon 2 – Sun 8 March
            </Btn>
          ) : (
            <>
              <Chip tone="ok">✓ on — every change above re-runs the week</Chip>
              <Btn
                kind="quiet"
                onClick={() => {
                  setOn(false);
                  setWeek(undefined);
                }}
              >
                Switch it off
              </Btn>
            </>
          )}
          <span style={{ fontSize: 12.5, color: INK.soft }}>
            {choice.trigger === 'manual'
              ? 'A by-hand reflex never fires on its own: this week, Olivia presses “run now” on Wednesday at 10:00.'
              : choice.trigger === 'booking'
                ? `Three bookings arrive during the week; each one is a fact.`
                : 'The clock ticks through seven days; tide wakes exactly when it is due.'}
          </span>
        </div>
        {on && week !== undefined && (
          <>
            <div style={{ fontSize: 13.5 }}>
              <b>{sent.length}</b> message{sent.length === 1 ? '' : 's'} arrived
              {unsent.length > 0 && (
                <>
                  , <b style={{ color: INK.warn }}>{unsent.length}</b> couldn’t be delivered — recorded on the task, not retried
                </>
              )}
              . {week.ledger.runs.length} run{week.ledger.runs.length === 1 ? '' : 's'}, {week.ledger.tasks.length} task{week.ledger.tasks.length === 1 ? '' : 's'}.
            </div>
            <Grid min={200} gap={16}>
              {MEMBERS.map((m) => {
                const mine = week.messages.filter((x) => x.member === m.id);
                const missed = mine.filter((x) => !x.delivered);
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <Messages
                      who={m.name}
                      width={210}
                      minHeight={170}
                      tone={missed.length > 0 ? 'bad' : mine.length > 0 ? 'ok' : 'plain'}
                      notes={mine
                        .filter((x) => x.delivered)
                        .map((x, i) => ({ key: `${x.at}-${i}`, at: x.at, icon: ICON[x.channel] ?? '', title: x.text }))}
                    />
                    {missed.length > 0 && (
                      <div style={{ fontSize: 11.5, color: INK.warn, textAlign: 'center', maxWidth: 210 }}>
                        {missed.length} {choice.channel === 'sms' ? 'SMS' : choice.channel} not delivered — {missed[0]?.reason}
                      </div>
                    )}
                  </div>
                );
              })}
            </Grid>
          </>
        )}
      </Panel>

      <Ledger ledger={on ? week?.ledger : undefined} aside={on ? 'the week’s rows — one run per firing, one task per member' : 'switch it on to fill it — preview writes nothing'} />

      <Grid min={300} gap={12}>
        <Callout tone="accent" title="Preview is the same machine">
          <Mono>preview()</Mono> runs the real pipeline — the clock, the selection against real rows, every template — and stubs exactly one
          function: the one that sends. A reflex can’t opt out of being previewable, so what you read is what Monday will do.
        </Callout>
        <Callout tone="accent" title="A missing number is an answer">
          Linus has no phone and Grace and Ruth have no app. The sender <b>returns</b> “not sent — no number” instead of throwing, so tide marks
          the task done and records why. Throwing is for a bad minute worth retrying; a missing number won’t fix itself.
        </Callout>
        <Callout tone="accent" title="Some parts don’t go together">
          A booking is one event about one member, so its audience is that member — the fact already carries the row. Tide refuses things that
          can’t work when a reflex is loaded (a “when” on a clock, “each” without a key); this page crosses them out before you get there.
        </Callout>
      </Grid>
    </Page>
  );
};
