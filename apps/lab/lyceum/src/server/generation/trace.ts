// WATCHING A QUERY BEING WRITTEN — lyceum's own record of one generation, in
// lyceum's words, for the stage to draw: what the model was shown, each thing
// it did (a look at the data, a test of a draft and what the engine answered),
// and how it ended (the document that passed and the name it was stored under,
// a replay with no model, or a refusal). Every string is ready to print.
//
// A trace belongs to the person who asked. `expect` is called before the
// engine runs, inside their session, so the run is attributed to them without
// the writer knowing who they are; the engine collapses identical requests
// into one run, so a run is found by its intent.

export type Step = {
  n: number;
  // The tool the writer called.
  what: string;
  // How the line is drawn: a test that failed (alert), one that ran (live), a look (paper).
  ink: 'alert' | 'live' | 'paper';
  text: string;
  ms: number;
};

export type Outcome = {
  kind: 'none' | 'writing' | 'written' | 'replayed' | 'refused';
  text: string;
  fingerprint: string;
  // The statement the last passing test compiled, under the caller's policy.
  sql: string;
};

export type Trace = {
  principal: string;
  intent: string;
  shape: string;
  // Which authored shape the answer takes (app/vex/query.shapes.ts) — how a
  // replay of it is drawn.
  shapeKind: string;
  shown: { tables: string; caller: string };
  steps: Step[];
  outcome: Outcome;
  ms: number;
};

export const EMPTY_TRACE: Trace = {
  principal: '',
  intent: '',
  shape: '',
  shapeKind: '',
  shown: { tables: '', caller: '' },
  steps: [],
  outcome: { kind: 'none', text: 'Nothing asked yet.', fingerprint: '', sql: '' },
  ms: 0,
};

const SHORT = 240;
const short = (value: unknown): string => {
  const text = JSON.stringify(value) ?? '';
  return text.length > SHORT ? `${text.slice(0, SHORT)}…` : text;
};

// A look at the data: the tool, what it was asked, what came back.
export const lookStep = (tool: string, args: unknown, result: string, ms: number): Omit<Step, 'n'> => ({
  what: tool,
  ink: 'paper',
  text: `${short(args)}\n→ ${result}`,
  ms,
});

export const summary = (result: unknown): string => short(result);

// A test of a draft: the draft, and the engine's answer — its errors, or that
// it runs, with the statement it compiled.
export const testStep = (draft: unknown, answer: { sql: string; errors: readonly string[]; rows: number }, ms: number): Omit<Step, 'n'> => ({
  what: 'testQuery',
  ink: answer.errors.length > 0 ? 'alert' : 'live',
  text: `${JSON.stringify(draft, null, 2)}\n→ ${answer.errors.length > 0 ? answer.errors.join('\n→ ') : `runs · ${answer.rows} rows\n${answer.sql}`}`,
  ms,
});

export type Tracer = {
  // Somebody asked, in their own session: the run that follows is theirs.
  expect: (intent: string, principal: string) => void;
  started: (intent: string, shown: Trace['shown'], shape: unknown) => void;
  step: (intent: string, step: Omit<Step, 'n'>) => void;
  // The writer finished with this document; `sql` is the last passing test's.
  written: (intent: string, dsl: unknown, sql: string) => void;
  // The engine stored it under this name, answering in this shape.
  completed: (intent: string, fingerprint: string, shapeKind: string) => void;
  replayed: (intent: string, principal: string, fingerprint: string, shapeKind: string) => void;
  refused: (intent: string, reason: string) => void;
  latest: (principal: string) => Trace | undefined;
  onChange: (listener: () => void) => void;
};

export const createTracer = (): Tracer => {
  // The runs still being written, by intent; the newest trace of each person.
  const open = new Map<string, Trace[]>();
  const latest = new Map<string, Trace>();
  const since = new WeakMap<Trace, number>();
  const listeners = new Set<() => void>();
  const changed = (): void => listeners.forEach((listener) => listener());

  const touch = (intent: string, change: (trace: Trace) => void): void => {
    const traces = open.get(intent) ?? [];
    for (const trace of traces) {
      change(trace);
      trace.ms = Date.now() - (since.get(trace) ?? Date.now());
    }
    if (traces.length > 0) changed();
  };
  const settle = (intent: string, keep: (trace: Trace) => boolean): void => {
    const left = (open.get(intent) ?? []).filter(keep);
    if (left.length === 0) open.delete(intent);
    else open.set(intent, left);
  };

  return {
    expect: (intent, principal) => {
      const trace: Trace = { ...EMPTY_TRACE, principal, intent, shown: { ...EMPTY_TRACE.shown }, steps: [], outcome: { kind: 'writing', text: 'Writing…', fingerprint: '', sql: '' } };
      since.set(trace, Date.now());
      open.set(intent, [...(open.get(intent) ?? []), trace]);
      latest.set(principal, trace);
      changed();
    },
    started: (intent, shown, shape) =>
      touch(intent, (trace) => {
        trace.shown = shown;
        trace.shape = JSON.stringify(shape);
      }),
    step: (intent, step) => touch(intent, (trace) => trace.steps.push({ n: trace.steps.length + 1, ...step })),
    written: (intent, dsl, sql) =>
      touch(intent, (trace) => {
        trace.outcome = { kind: 'written', text: JSON.stringify(dsl, null, 2), fingerprint: '', sql };
      }),
    completed: (intent, fingerprint, shapeKind) => {
      touch(intent, (trace) => {
        trace.outcome.fingerprint = fingerprint;
        trace.shapeKind = shapeKind;
      });
      settle(intent, () => false);
    },
    replayed: (intent, principal, fingerprint, shapeKind) => {
      touch(intent, (trace) => {
        if (trace.principal !== principal) return;
        trace.shapeKind = shapeKind;
        trace.outcome = { kind: 'replayed', text: 'Asked before: the stored query, replayed. No model ran.', fingerprint, sql: '' };
      });
      settle(intent, (trace) => trace.principal !== principal);
    },
    refused: (intent, reason) => {
      touch(intent, (trace) => {
        if (trace.outcome.kind !== 'refused') trace.outcome = { kind: 'refused', text: reason, fingerprint: '', sql: '' };
      });
      settle(intent, () => false);
    },
    latest: (principal) => latest.get(principal),
    onChange: (listener) => {
      listeners.add(listener);
    },
  };
};
