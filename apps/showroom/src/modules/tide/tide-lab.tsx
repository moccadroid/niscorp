import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import { evaluate } from '@niscorp/prism';
import { createMemoryStore, createTide } from '@niscorp/tide';
import type {
  EffectRegistry,
  Fact,
  Run,
  ReflexInput,
  Row,
  SelectFn,
  Task,
  Tide,
} from '@niscorp/tide';

// ═══════════════════════════════════════════════════════════
// The Tide Lab — the surface every tide story drives.
//
// Tide reads no wall clock: the only time it knows is the `now`
// handed to advance(). That is a correctness property (checks
// advance time instead of sleeping) and it is also why this lab
// can exist at all — the clock is a control, and a month of
// scheduled automation runs in the time it takes to click.
//
// This lab IS a driver, hand-rolled: it advances to quiescence
// on every change, and shows what `nextDue` says it should wake
// for next. Under moss that is `createTideDriver`; the shape is
// the same, and the point is that pacing belongs to the host.
//
// Everything here is real: the real engine, the real memory
// store, real Prism templates. Only the effects are stand-ins,
// and they log what they would have sent.
// ═══════════════════════════════════════════════════════════

export type LabStep = { label: string; ms: number };

export type TideLabProps = {
  reflexes: readonly ReflexInput[];
  effects: EffectRegistry;
  rows?: readonly Row[];
  select?: SelectFn;
  start: number;
  armedAt?: number;
  steps?: readonly LabStep[];
  seed?: readonly Parameters<Tide['ingest']>[0][];
  // Fact a story can push by hand (a webhook arriving, a row being written).
  push?: { label: string; fact: Parameters<Tide['ingest']>[0] }[];
  previewOf?: string;
  note?: string;
};

type Sent = { at: number; effect: string; unit: string; input: unknown; outcome: 'ok' | 'threw' };

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const DEFAULT_STEPS: readonly LabStep[] = [
  { label: '+1 min', ms: MINUTE },
  { label: '+1 hour', ms: HOUR },
  { label: '+1 day', ms: DAY },
];

const C = {
  wrap: { display: 'flex', flexDirection: 'column' as const, gap: 12, padding: 20, fontSize: 13 },
  panel: { border: '1px solid var(--sr-border, #2a2a33)', borderRadius: 10, overflow: 'hidden' as const },
  head: {
    padding: '8px 12px',
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    opacity: 0.6,
    borderBottom: '1px solid var(--sr-border, #2a2a33)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  body: { padding: 12, display: 'flex', flexDirection: 'column' as const, gap: 8 },
  cols: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  mono: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 },
  clock: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap' as const,
    padding: 12,
    borderRadius: 10,
    border: '1px solid rgba(129,140,248,0.35)',
    background: 'rgba(129,140,248,0.08)',
  },
  now: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 15, fontWeight: 600, letterSpacing: 0.3 },
  btn: (accent?: boolean) => ({
    padding: '5px 11px',
    borderRadius: 7,
    border: '1px solid',
    borderColor: accent ? 'rgba(129,140,248,0.6)' : 'var(--sr-border, #2a2a33)',
    background: accent ? 'rgba(129,140,248,0.16)' : 'transparent',
    color: 'inherit',
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
  }),
  tag: (tone: 'ok' | 'warn' | 'bad' | 'idle') => ({
    fontFamily: 'ui-monospace, Menlo, monospace',
    fontSize: 11,
    padding: '1px 7px',
    borderRadius: 999,
    border: '1px solid',
    borderColor:
      tone === 'ok' ? 'rgba(52,211,153,0.45)' : tone === 'bad' ? 'rgba(248,113,113,0.5)' : tone === 'warn' ? 'rgba(251,191,36,0.5)' : 'var(--sr-border, #2a2a33)',
    background:
      tone === 'ok' ? 'rgba(52,211,153,0.12)' : tone === 'bad' ? 'rgba(248,113,113,0.1)' : tone === 'warn' ? 'rgba(251,191,36,0.1)' : 'transparent',
    opacity: tone === 'idle' ? 0.55 : 1,
  }),
  rowLine: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const, fontSize: 12 },
  empty: { opacity: 0.4, fontSize: 12, fontStyle: 'italic' as const },
  sent: {
    display: 'flex',
    gap: 8,
    alignItems: 'baseline',
    padding: '6px 10px',
    borderLeft: '3px solid rgba(52,211,153,0.55)',
    background: 'rgba(52,211,153,0.07)',
    borderRadius: 4,
  },
  threw: {
    display: 'flex',
    gap: 8,
    alignItems: 'baseline',
    padding: '6px 10px',
    borderLeft: '3px solid rgba(248,113,113,0.6)',
    background: 'rgba(248,113,113,0.07)',
    borderRadius: 4,
  },
  note: { fontSize: 12, opacity: 0.65, lineHeight: 1.55 },
  pre: {
    margin: 0,
    fontFamily: 'ui-monospace, Menlo, monospace',
    fontSize: 11.5,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap' as const,
    opacity: 0.85,
  },
};

const stamp = (ms: number): string => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const clock = (ms: number): string => new Date(ms).toISOString().slice(11, 16);

const runTone = (state: Run['state']): 'ok' | 'warn' | 'bad' | 'idle' =>
  state === 'settled' ? 'ok' : state === 'skipped' ? 'warn' : 'idle';

const taskTone = (state: Task['state']): 'ok' | 'warn' | 'bad' | 'idle' =>
  state === 'done' ? 'ok' : state === 'failed' ? 'bad' : state === 'retrying' ? 'warn' : 'idle';

export const TideLab: FC<TideLabProps> = ({
  reflexes,
  effects,
  rows,
  select,
  start,
  armedAt,
  steps = DEFAULT_STEPS,
  seed,
  push,
  previewOf,
  note,
}) => {
  const [now, setNow] = useState(start);
  const [stepCount, setStepCount] = useState(0);
  const [due, setDue] = useState<number | undefined>(undefined);
  const [sent, setSent] = useState<readonly Sent[]>([]);
  const [runs, setRuns] = useState<readonly Run[]>([]);
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [facts, setFacts] = useState<readonly Fact[]>([]);
  const [preview, setPreview] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);

  const sentRef = useRef<Sent[]>([]);
  const tideRef = useRef<Tide | undefined>(undefined);
  // The clock lives in a ref as well as state: two quick clicks would
  // otherwise both compute from the same rendered `now` and lose a step.
  const nowRef = useRef(start);

  // Effects are wrapped so the lab can show what reached the outside world —
  // the payoff panel, and the only thing in a real deployment that is not
  // simply a row somebody can query.
  const traced = useMemo<EffectRegistry>(
    () =>
      Object.fromEntries(
        Object.entries(effects).map(([name, handler]) => [
          name,
          {
            ...handler,
            run: (input: unknown, ctx: Parameters<typeof handler.run>[1]) => {
              try {
                const result = handler.run(input, ctx);
                sentRef.current = [...sentRef.current, { at: ctx.now, effect: name, unit: ctx.taskKey.split(':').pop() ?? '', input, outcome: 'ok' }];
                return result;
              } catch (error) {
                sentRef.current = [
                  ...sentRef.current,
                  { at: ctx.now, effect: name, unit: ctx.taskKey.split(':').pop() ?? '', input, outcome: 'threw' },
                ];
                throw error;
              }
            },
          },
        ]),
      ),
    [effects],
  );

  const refresh = useCallback(async (tide: Tide) => {
    setRuns(await tide.ledger.runs({ limit: 40 }));
    setTasks(await tide.ledger.tasks({ limit: 60 }));
    setFacts(await tide.ledger.facts({ limit: 40 }));
    setSent([...sentRef.current]);
  }, []);

  const boot = useCallback(async () => {
    sentRef.current = [];
    const tide = createTide({
      store: createMemoryStore(),
      // The transform seam, filled with Prism — exactly as a moss host fills
      // it. The round-trip is the JSON boundary made explicit: tide holds the
      // environment as opaque rows, and Prism evaluates over plain JSON.
      transform: (config, source) => evaluate(config, JSON.parse(JSON.stringify(source))),
      select: select ?? (rows === undefined ? undefined : () => rows),
      effects: traced,
    });
    await tide.load(reflexes, { at: armedAt ?? start });
    for (const fact of seed ?? []) await tide.ingest(fact);
    tideRef.current = tide;
    nowRef.current = start;
    setNow(start);
    setStepCount(0);
    setDue(undefined);
    setPreview(undefined);
    await refresh(tide);
    setReady(true);
  }, [reflexes, traced, select, rows, seed, start, armedAt, refresh]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Move the clock, then advance until a step reports no work — a chain walks
  // one committed hop per step, so draining is what makes it arrive. This is
  // exactly what a host's driver does on every ingest; `nextDue` below is what
  // it sleeps until when there is nothing left to drain.
  const advance = useCallback(
    async (ms: number, settle: boolean) => {
      const tide = tideRef.current;
      if (tide === undefined) return;
      const next = nowRef.current + ms;
      nowRef.current = next;
      setNow(next);
      let passes = 0;
      for (let pass = 0; pass < (settle ? 8 : 1); pass += 1) {
        const report = await tide.advance({ now: next, limit: 200 });
        passes += 1;
        const worked =
          report.materialized + report.factsMatched + report.tasksCreated + report.executed + report.runsSettled > 0;
        if (!worked) break;
      }
      setStepCount((count) => count + passes);
      setDue(await tide.nextDue(next));
      await refresh(tide);
    },
    [refresh],
  );

  const ingest = useCallback(
    async (fact: Parameters<Tide['ingest']>[0]) => {
      const tide = tideRef.current;
      if (tide === undefined) return;
      await tide.ingest({ ...fact, at: nowRef.current });
      await refresh(tide);
    },
    [refresh],
  );

  const runPreview = useCallback(async () => {
    const tide = tideRef.current;
    if (tide === undefined || previewOf === undefined) return;
    const report = await tide.preview(previewOf, { now: nowRef.current });
    setPreview(JSON.stringify(report, null, 2));
    await refresh(tide);
  }, [previewOf, refresh]);

  if (!ready) return <div style={C.wrap}>booting…</div>;

  return (
    <div style={C.wrap}>
      {note !== undefined && <div style={C.note}>{note}</div>}

      <div style={C.clock}>
        <span style={{ fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', opacity: 0.6 }}>tide clock</span>
        <span style={C.now}>{stamp(now)}Z</span>
        <span style={{ flex: 1 }} />
        {steps.map((step) => (
          <button key={step.label} style={C.btn()} onClick={() => void advance(step.ms, true)}>
            {step.label}
          </button>
        ))}
        <button style={C.btn(true)} onClick={() => void advance(0, false)}>
          one step
        </button>
        <button style={C.btn()} onClick={() => void boot()}>
          reset
        </button>
        <span style={{ ...C.mono, opacity: 0.45 }}>
          {stepCount} {stepCount === 1 ? 'step' : 'steps'} · next due {due === undefined ? 'nothing scheduled' : `${stamp(due)}Z`}
        </span>
      </div>

      {(push !== undefined || previewOf !== undefined) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(push ?? []).map((item) => (
            <button key={item.label} style={C.btn()} onClick={() => void ingest(item.fact)}>
              {item.label}
            </button>
          ))}
          {previewOf !== undefined && (
            <button style={C.btn(true)} onClick={() => void runPreview()}>
              preview “{previewOf}” — changes nothing
            </button>
          )}
        </div>
      )}

      {preview !== undefined && (
        <div style={C.panel}>
          <div style={C.head}>
            <span>dry run — what would happen</span>
            <button style={C.btn()} onClick={() => setPreview(undefined)}>
              close
            </button>
          </div>
          <div style={C.body}>
            <pre style={C.pre}>{preview}</pre>
          </div>
        </div>
      )}

      <div style={C.panel}>
        <div style={C.head}>
          <span>the outside world — what effects actually ran</span>
          <span>{sent.length}</span>
        </div>
        <div style={C.body}>
          {sent.length === 0 && <div style={C.empty}>nothing has left the building yet.</div>}
          {sent.map((item, index) => (
            <div key={index} style={item.outcome === 'ok' ? C.sent : C.threw}>
              <span style={{ ...C.mono, opacity: 0.55 }}>{clock(item.at)}</span>
              <span style={C.mono}>{item.effect}</span>
              {item.unit !== '' && <span style={C.tag('idle')}>{item.unit}</span>}
              <span style={{ ...C.mono, opacity: 0.7, flex: 1 }}>{JSON.stringify(item.input)}</span>
              {item.outcome === 'threw' && <span style={C.tag('bad')}>threw</span>}
            </div>
          ))}
        </div>
      </div>

      <div style={C.cols}>
        <div style={C.panel}>
          <div style={C.head}>
            <span>runs</span>
            <span>{runs.length}</span>
          </div>
          <div style={C.body}>
            {runs.length === 0 && <div style={C.empty}>no run yet.</div>}
            {[...runs].reverse().map((run) => (
              <div key={run.id} style={C.rowLine}>
                <span style={C.tag(runTone(run.state))}>{run.state}</span>
                <span style={C.mono}>{run.reflexId}</span>
                <span style={{ ...C.mono, opacity: 0.5 }}>{run.occurrence ?? run.cause}</span>
                {run.total > 0 && (
                  <span style={{ ...C.mono, opacity: 0.6 }}>
                    {run.done}✓ {run.failed > 0 ? `${run.failed}✗ ` : ''}/{run.total}
                  </span>
                )}
                {run.note !== undefined && <span style={{ fontSize: 11, opacity: 0.5 }}>{run.note}</span>}
              </div>
            ))}
          </div>
        </div>

        <div style={C.panel}>
          <div style={C.head}>
            <span>tasks — the idempotency grain</span>
            <span>{tasks.length}</span>
          </div>
          <div style={C.body}>
            {tasks.length === 0 && <div style={C.empty}>no task yet.</div>}
            {tasks.map((task) => (
              <div key={task.id} style={C.rowLine}>
                <span style={C.tag(taskTone(task.state))}>{task.state}</span>
                <span style={C.mono}>{task.reflexId}</span>
                {task.unit !== '' && <span style={{ ...C.mono, opacity: 0.75 }}>{task.unit}</span>}
                {task.attempt > 1 && <span style={{ ...C.mono, opacity: 0.5 }}>attempt {task.attempt}</span>}
                {task.error !== undefined && <span style={{ fontSize: 11, opacity: 0.6 }}>{task.error}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={C.panel}>
        <div style={C.head}>
          <span>facts — everything that arrived</span>
          <span>{facts.length}</span>
        </div>
        <div style={C.body}>
          {facts.length === 0 && <div style={C.empty}>no fact yet.</div>}
          {facts.map((fact) => (
            <div key={fact.id} style={C.rowLine}>
              <span style={C.tag(fact.parked === undefined ? 'idle' : 'bad')}>{fact.kind}</span>
              <span style={C.mono}>
                {fact.entity ?? fact.name ?? fact.reflex ?? fact.target ?? '—'}
                {fact.op === undefined ? '' : `.${fact.op}`}
              </span>
              {fact.depth > 0 && <span style={{ ...C.mono, opacity: 0.45 }}>depth {fact.depth}</span>}
              {fact.stats !== undefined && (
                <span style={{ ...C.mono, opacity: 0.6 }}>
                  {fact.stats.done}✓ {fact.stats.failed}✗ /{fact.stats.total}
                </span>
              )}
              {fact.notBefore !== undefined && fact.notBefore > now && (
                <span style={C.tag('warn')}>waits until {stamp(fact.notBefore)}</span>
              )}
              {fact.cause !== undefined && <span style={{ ...C.mono, opacity: 0.4 }}>← {fact.cause}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
