import { useRef, useState, type FC } from 'react';
import type { CortexEvent } from '@niscorp/cortex';
import { Btn, Callout, Chip, Code, Grid, INK, Lead, MONO, Mono, Page, Panel } from '@showroom/chrome/stage/ui';
import { resolveLlm } from '../llm';
import { DESK_PROMPTS, frontDesk, newStudio } from '../world/desk';
import { PhoneChat, type ChatLine } from '../world/phone-chat';

// ═══════════════════════════════════════════════════════════
// The front desk — an agent a member talks to, and what your code gets back.
//
// Mia chats with the studio's front desk in the app. Every turn the agent may
// call tools — the timetable, booking, the studio's policies — and it always
// answers in one envelope: `response`, the words Mia sees, and `data`, typed by
// a Zod schema, which is what the app's code acts on. The studio on the right
// is the state the tools really change.
// ═══════════════════════════════════════════════════════════

type Turn = { ask: string; calls: { tool: string; args: unknown; result: unknown }[]; data: unknown; response: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const FrontDesk: FC = () => {
  const studio = useRef(newStudio());
  const [, setTick] = useState(0);
  const [lines, setLines] = useState<readonly ChatLine[]>([]);
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const { scripted } = resolveLlm();

  const send = (ask: string): void => {
    setBusy(true);
    setLines((l) => [...l, { from: 'me', text: ask }]);
    const calls: Turn['calls'] = [];
    const onEvent = (e: CortexEvent): void => {
      if (e.type === 'tool-end' && e.observation.kind === 'result') calls.push({ tool: e.observation.toolId, args: e.observation.args, result: e.observation.result });
    };
    const { llm } = resolveLlm();
    void frontDesk(studio.current, 'Mia')
      .run(ask, { llm, onEvent })
      .result.then((r) => {
        const response = r.ok ? String(r.output.response ?? '') : `(${r.error.message})`;
        setLines((l) => [...l, { from: 'them', text: response }]);
        setTurns((t) => [{ ask, calls, data: r.ok ? r.output.data : undefined, response }, ...t]);
        setTick((n) => n + 1);
        setBusy(false);
      });
  };

  const reset = (): void => {
    studio.current = newStudio();
    setLines([]);
    setTurns([]);
    setTick((n) => n + 1);
  };

  const latest = turns[0];
  const mine = studio.current.bookings.filter((b) => b.member === 'Mia').map((b) => b.class);

  return (
    <Page>
      <Lead eyebrow="The front desk" title="An agent answers the member — and hands your code something it can act on.">
        Mia asks the studio’s front desk in the app. The agent looks things up with tools — the timetable, booking, the studio’s policies — and
        always answers in one envelope: <Mono>response</Mono>, the words Mia sees, and <Mono>data</Mono>, typed by a schema, which is what your
        code reads. Ask something, and watch both sides.
      </Lead>

      <Panel>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, color: INK.soft }}>
          <Chip tone={scripted ? 'accent' : 'ok'}>{scripted ? 'scripted model' : 'live model'}</Chip>
          {scripted
            ? 'No API key: the model’s words are scripted for the prompts below. The agent, its tools, the loop and the schema checks are real cortex — and the studio really changes.'
            : 'Your own model, from Signal → Settings.'}
          <span style={{ flex: 1 }} />
          <Btn kind="quiet" disabled={busy} onClick={reset}>
            ↺ Reset the studio
          </Btn>
        </div>
      </Panel>

      <Grid min={320} gap={18}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <PhoneChat who="Mia" title="Ask the front desk" lines={lines} busy={busy} prompts={DESK_PROMPTS} onSend={send} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Panel title="What your code gets" aside="the envelope’s data, typed by the schema">
            {latest === undefined ? (
              <div style={{ fontSize: 13, color: INK.faint }}>Nothing yet — ask the front desk something.</div>
            ) : (
              <>
                <div style={{ fontSize: 12.5, color: INK.soft }}>
                  For “{latest.ask}” the app received:
                </div>
                <Code maxHeight={140}>{JSON.stringify(latest.data, null, 2)}</Code>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {isRecord(latest.data) && latest.data['booked'] === true && <Chip tone="ok">booked: true → show a calendar button</Chip>}
                  {isRecord(latest.data) && latest.data['intent'] === 'info' && <Chip>intent: info → nothing to do</Chip>}
                  {isRecord(latest.data) && latest.data['intent'] === 'book' && latest.data['booked'] === false && <Chip tone="warn">booked: false → offer alternatives</Chip>}
                </div>
              </>
            )}
          </Panel>

          <Panel title="What the agent did" aside="tool calls, in order">
            {latest === undefined || latest.calls.length === 0 ? (
              <div style={{ fontSize: 13, color: INK.faint }}>{latest === undefined ? '…' : 'No tools this turn.'}</div>
            ) : (
              latest.calls.map((c, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12 }}>
                    <b>{c.tool}</b>({JSON.stringify(c.args)})
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: INK.soft, whiteSpace: 'pre-wrap', maxHeight: 90, overflow: 'auto' }}>→ {JSON.stringify(c.result)}</div>
                </div>
              ))
            )}
          </Panel>

          <Panel title="The studio" aside="what the tools read and change">
            <div style={{ border: `1px solid ${INK.line}`, borderRadius: 10, overflow: 'hidden' }}>
              {studio.current.classes.map((c, i) => (
                <div key={c.name} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto', gap: 8, padding: '6px 10px', fontSize: 12.5, borderTop: i === 0 ? 'none' : `1px solid ${INK.line}`, background: mine.includes(c.name) ? INK.accentWash : 'transparent' }}>
                  <span style={{ fontWeight: 600 }}>
                    {c.name}
                    {mine.includes(c.name) ? ' · Mia booked' : ''}
                  </span>
                  <span style={{ color: INK.soft }}>
                    {c.time} · {c.instructor}
                  </span>
                  <Chip tone={c.spots === 0 ? 'bad' : c.spots <= 2 ? 'warn' : 'idle'}>{c.spots === 0 ? 'full' : `${c.spots} left`}</Chip>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </Grid>

      <Grid min={300} gap={12}>
        <Callout tone="accent" title="Words for the person, data for the code">
          The app never parses the reply to find out whether a booking happened. It reads <Mono>data.booked</Mono> — and the schema guarantees it is
          a boolean, or the run fails loudly.
        </Callout>
        <Callout tone="accent" title="Tools, not guesses">
          Times, spots and prices come from tools that read the studio. Ask to book the full Core &amp; breath and the booking tool says no — the agent
          reports that; it doesn’t make up a place.
        </Callout>
      </Grid>
    </Page>
  );
};
