import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { z } from 'zod';
import { createStream, type ValidationMode } from '@niscorp/solid';
import { PhoneFrame, type PhoneTone } from '@showroom/chrome/stage/phone';
import { Btn, Callout, Chip, Code, Grid, INK, Lead, MONO, Mono, Page, Panel, type Tone } from '@showroom/chrome/stage/ui';
import { splitByTokens } from '../atoms';

// ═══════════════════════════════════════════════════════════
// What solid is for — the landing page.
//
// Acme Studio's app has an assistant. Mia asks which class fits after work;
// the model streams its answer as JSON and the app draws a card from it while
// it arrives. Three phones run the SAME card code over the SAME chunks, each
// through a real solid stream in a different mode — so when the model sends
// garbage, you see what Mia would see in each.
//
// Real: solid's createStream, its validation and final(). Simulated, and
// labelled so on the page: the model — two scripted payloads, cut into chunks
// on JSON boundaries and replayed on a timer.
// ═══════════════════════════════════════════════════════════

const href = (path: string): string => `${import.meta.env.BASE_URL}solid/${path}`;

const schema = z.object({
  title: z.string(),
  answer: z.string(),
  classes: z.array(z.object({ name: z.string(), time: z.string(), spots: z.number() })),
  note: z.string(),
});
type Answer = z.infer<typeof schema>;
const initial: Answer = { title: '', answer: '', classes: [], note: '' };

// ── the simulated model ─────────────────────────────────────────

type Scenario = 'good' | 'garbage';

const PAYLOAD: Record<Scenario, string> = {
  good: JSON.stringify({
    title: 'After work this week',
    answer: 'Two classes start after 18:00. Evening stretch is the gentler one if you have been sitting all day.',
    classes: [
      { name: 'Evening stretch', time: 'Tue 19:00', spots: 4 },
      { name: 'Core & breath', time: 'Wed 18:00', spots: 2 },
    ],
    note: 'Book by 17:00 the day before.',
  }),
  // The same answer, with the two mistakes models really make: a list sent as
  // an object keyed by name, and a null where a string was promised.
  garbage: JSON.stringify({
    title: 'After work this week',
    answer: 'Two classes start after 18:00. Evening stretch is the gentler one if you have been sitting all day.',
    classes: { 'Evening stretch': 'Tue 19:00', 'Core & breath': 'Wed 18:00' },
    note: null,
  }),
};

// ── the app's card: ordinary code, the same for all three phones ─
// It trusts the type, as app code does: `classes.map` is called because the
// type says classes is a list. Called as a function (not mounted as a
// component) so that when it throws, the phone can show the crash.

const card = (v: Answer): ReactNode => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: 9, background: v.title === '' ? INK.line : INK.accent, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14 }}>✦</div>
      <div style={{ fontSize: 15, fontWeight: 700, minHeight: 20 }}>{v.title === '' ? <Skeleton width={140} /> : v.title}</div>
    </div>
    <div style={{ fontSize: 13, lineHeight: 1.5, color: '#374151', minHeight: 38 }}>{v.answer === '' ? <Skeleton width={200} /> : v.answer}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {v.classes.map((c, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid #eef0f3', borderRadius: 12, padding: '9px 11px', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 650 }}>{c.name}</div>
            <div style={{ fontSize: 11.5, color: '#6b7280' }}>{c.time}</div>
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 650, color: c.spots <= 2 ? INK.warn : INK.ok, alignSelf: 'center', whiteSpace: 'nowrap' }}>{c.spots} left</div>
        </div>
      ))}
    </div>
    {v.note !== '' && <div style={{ fontSize: 11.5, color: '#6b7280' }}>{v.note}</div>}
  </div>
);

const Skeleton: FC<{ width: number }> = ({ width }) => (
  <span style={{ display: 'inline-block', width, maxWidth: '100%', height: 12, borderRadius: 5, background: INK.line, verticalAlign: 'middle' }} />
);

const draw = (v: Answer): { node: ReactNode } | { crash: string } => {
  try {
    return { node: card(v) };
  } catch (e) {
    return { crash: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
};

// ── one lane per mode ───────────────────────────────────────────

type Lane = { value: Answer; refused: number; failed: boolean; done: boolean };
const EMPTY: Lane = { value: initial, refused: 0, failed: false, done: false };
const MODES: readonly ValidationMode[] = ['trust', 'recover', 'strict'];
type Lanes = Record<ValidationMode, Lane>;
const EMPTY_LANES: Lanes = { trust: EMPTY, recover: EMPTY, strict: EMPTY };

const MODE_BLURB: Record<ValidationMode, string> = {
  trust: 'No checking. Whatever the model sends is handed to the card.',
  recover: 'A wrong value is refused; the field keeps its last good value; the stream carries on.',
  strict: 'The first wrong value stops the stream. What is on screen freezes; final() rejects.',
};

const verdict = (mode: ValidationMode, lane: Lane, crashed: boolean, running: boolean): { tone: PhoneTone; chip: Tone; text: string } => {
  if (crashed) return { tone: 'bad', chip: 'bad', text: 'the app crashed' };
  if (!lane.done && !lane.failed) return running ? { tone: 'plain', chip: 'warn', text: 'streaming…' } : { tone: 'plain', chip: 'idle', text: 'stopped' };
  if (lane.failed) return { tone: 'accent', chip: 'warn', text: 'stopped, asked to retry' };
  if (lane.refused > 0) return { tone: 'ok', chip: 'ok', text: `${lane.refused} bad value${lane.refused === 1 ? '' : 's'} refused` };
  return { tone: 'ok', chip: 'ok', text: mode === 'trust' ? 'fine — this time' : 'clean' };
};

// ── the page ────────────────────────────────────────────────────

export const Intro: FC = () => {
  const [scenario, setScenario] = useState<Scenario>('garbage');
  const [lanes, setLanes] = useState<Lanes>(EMPTY_LANES);
  const [sent, setSent] = useState('');
  const [running, setRunning] = useState(false);
  const cancel = useRef<() => void>(() => undefined);

  useEffect(() => () => cancel.current(), []);

  const run = (which: Scenario): void => {
    cancel.current();
    setScenario(which);
    setLanes(EMPTY_LANES);
    setSent('');
    setRunning(true);

    // `live` goes false on Stop or a new run: a stream torn down on purpose
    // rejects its final(), and that must not read as the model failing.
    let live = true;
    const patch = (mode: ValidationMode, p: Partial<Lane>): void => {
      if (live) setLanes((ls) => ({ ...ls, [mode]: { ...ls[mode], ...p } }));
    };
    const streams = MODES.map((mode) => {
      const stream = createStream({ schema, initial, mode });
      stream.on((value) => patch(mode, { value }));
      stream.onError(() => {
        if (live) setLanes((ls) => ({ ...ls, [mode]: { ...ls[mode], refused: ls[mode].refused + 1, failed: ls[mode].failed || mode === 'strict' } }));
      });
      stream.final().then(
        () => patch(mode, { done: true }),
        () => patch(mode, { failed: true, done: true }),
      );
      return { mode, stream };
    });

    const chunks = splitByTokens(PAYLOAD[which]);
    let i = 0;
    const timer = setInterval(() => {
      if (!live) return;
      if (i >= chunks.length) {
        clearInterval(timer);
        for (const { stream } of streams) stream.close();
        setRunning(false);
        return;
      }
      const chunk = chunks[i] ?? '';
      for (const { stream } of streams) stream.write(chunk);
      setSent((t) => t + chunk);
      i += 1;
    }, 45);
    cancel.current = () => {
      live = false;
      clearInterval(timer);
      for (const { stream } of streams) stream.destroy();
      setRunning(false);
    };
  };

  const started = sent !== '';

  return (
    <Page>
      <Lead eyebrow="solid" title="Show a model’s answer while it is still arriving — without trusting it.">
        A model answers in JSON, a few characters at a time. You want the answer on screen as it comes, not after. But the model can send the wrong
        kind of thing: a list as an object, a <Mono>null</Mono> where text was promised. Solid reads the stream against your schema as it arrives,
        so the value your screen draws always has the shape your code expects — and you choose what happens when it doesn’t.
      </Lead>

      <Panel
        title="Mia asks: “Which class fits after work this week?”"
        aside={
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <Chip tone="warn">simulated model</Chip> a scripted answer, replayed in chunks
          </span>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Btn kind={scenario === 'good' && started ? 'primary' : 'plain'} onClick={() => run('good')}>
            A good answer
          </Btn>
          <Btn kind={scenario === 'garbage' && started ? 'primary' : 'plain'} onClick={() => run('garbage')}>
            The model sends garbage
          </Btn>
          <Btn kind="quiet" onClick={() => cancel.current()} disabled={!running} title={running ? 'Cut the stream here' : 'Nothing is streaming'}>
            Stop
          </Btn>
          <span style={{ fontSize: 12.5, color: INK.soft }}>Same chunks, same card code, three modes.</span>
        </div>

        <Grid min={250} gap={18}>
          {MODES.map((mode) => {
            const lane = lanes[mode];
            const drawn = draw(lane.value);
            const crashed = 'crash' in drawn;
            const v = verdict(mode, lane, crashed, running);
            return (
              <div key={mode} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 14 }}>{mode}</span>
                    {started && <Chip tone={v.chip}>{v.text}</Chip>}
                  </div>
                  <div style={{ fontSize: 12.5, color: INK.soft, minHeight: 36, lineHeight: 1.45 }}>{MODE_BLURB[mode]}</div>
                </div>
                <PhoneFrame tone={v.tone} width={260} status="Acme · assistant" minHeight={330}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: INK.accent, color: '#fff', fontSize: 12.5, padding: '7px 11px', borderRadius: '14px 14px 4px 14px' }}>
                      Which class fits after work this week?
                    </div>
                    {!started ? (
                      <div style={{ fontSize: 12, color: INK.faint, textAlign: 'center', padding: '40px 0' }}>Pick an answer above to stream it.</div>
                    ) : 'crash' in drawn ? (
                      <div style={{ borderRadius: 12, background: INK.badWash, border: '1px solid #fecaca', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: INK.bad }}>Something went wrong</div>
                        <div style={{ fontSize: 12, color: '#7f1d1d' }}>The assistant screen stopped working. Mia has to close the app.</div>
                        <div style={{ fontFamily: MONO, fontSize: 10.5, color: INK.bad }}>{drawn.crash}</div>
                      </div>
                    ) : (
                      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #eef0f3', padding: 12 }}>
                        {drawn.node}
                        {lane.failed && (
                          <div style={{ marginTop: 10, borderRadius: 10, background: INK.warnWash, border: '1px solid #fde68a', padding: '8px 10px', fontSize: 12, color: INK.warn, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                            <span>This answer couldn’t be finished.</span>
                            <b>Ask again</b>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </PhoneFrame>
              </div>
            );
          })}
        </Grid>
      </Panel>

      <Grid min={320}>
        <Panel title="What the model sent" aside={running ? 'streaming…' : started ? 'closed' : 'nothing yet'}>
          <Code maxHeight={260}>{sent === '' ? '// nothing yet' : sent}</Code>
        </Panel>
        <Panel title="The schema the card was written against" aside="Zod — the one source of truth">
          <Code maxHeight={260}>{`z.object({
  title: z.string(),
  answer: z.string(),
  classes: z.array(z.object({
    name: z.string(), time: z.string(), spots: z.number(),
  })),
  note: z.string(),
})`}</Code>
        </Panel>
      </Grid>

      <Grid min={280} gap={12}>
        <Callout tone="accent" title="The card never checks anything">
          It calls <Mono>classes.map</Mono> because the type says it can. In <b>trust</b> that is a lie the moment the model sends an object, and
          the screen dies. In <b>recover</b> and <b>strict</b> the lie never reaches it.
        </Callout>
        <Callout tone="accent" title="Recover is the default for a reason">
          One bad field costs that field, not the answer. Mia still reads the reply; the refused values go to <Mono>onError</Mono> for you to log.
        </Callout>
        <Callout tone="accent" title="Strict, when half an answer is worse than none">
          A booking, a payment, a plan: stop at the first wrong value and ask again. <Mono>final()</Mono> rejects, so the app knows to.
        </Callout>
      </Grid>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Walk through it</div>
        <Grid min={300} gap={12}>
          <Next n={1} to="stream-demo/ai-response" title="A card that builds itself">
            The answer card on its own: each section fills in and marks itself final the moment its JSON closes.
          </Next>
          <Next n={2} to="stream-demo/hallucinated-fields" title="Five hallucinations, three modes">
            Every kind of wrong value at once, and the value each mode leaves you with.
          </Next>
          <Next n={3} to="stream-demo/strict-halt" title="Stopping on the first mistake">
            Strict mode end to end: the freeze, the one error, the rejected promise.
          </Next>
          <Next n={4} to="stream-demo/performance" title="Why it stays fast">
            It reads only the new characters, so a long answer costs no more per token than a short one.
          </Next>
        </Grid>
      </div>
    </Page>
  );
};

const Next: FC<{ to: string; title: string; children: ReactNode; n: number }> = ({ to, title, children, n }) => (
  <a href={href(to)} style={{ textDecoration: 'none', color: 'inherit', border: `1px solid ${INK.line}`, borderRadius: 14, padding: 16, display: 'flex', gap: 14, background: '#fff' }}>
    <div style={{ fontSize: 22, fontWeight: 800, color: INK.accent, lineHeight: 1 }}>{n}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 14.5, fontWeight: 700 }}>{title} →</div>
      <div style={{ fontSize: 13, color: INK.soft, lineHeight: 1.5 }}>{children}</div>
    </div>
  </a>
);
