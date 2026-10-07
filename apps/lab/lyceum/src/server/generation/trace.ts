// WATCHING A QUERY BEING WRITTEN — lyceum's own record of one generation, in
// lyceum's words, for the stage to draw: what the model was shown, each thing
// it did (a look at the data, a test of a draft and what the engine answered),
// and how it ended (the document that passed and the name it was stored under,
// a replay with no model, or a refusal). Every string is ready to print, and
// every document is set out as one: a draft, an answer, a statement each an
// exhibit of its own on the slide (app/actions/slide/vex.layouts.ts).
//
// A trace belongs to the person who asked. `expect` is called before the
// engine runs, inside their session, so the run is attributed to them without
// the writer knowing who they are; the engine collapses identical requests
// into one run, so a run is found by its intent.

export type Step = {
  n: number;
  // The tool the writer called, and the exhibit's caption: "2 · testQuery".
  what: string;
  label: string;
  // How the answer is flagged: a test that failed (alert), one that ran (live), a look (paper).
  ink: 'alert' | 'live' | 'paper';
  // What the writer sent: a draft, or a tool's arguments. JSON.
  draft: string;
  // What came back — the statement a draft compiled to, the engine's error, or
  // a look's result — and the caption over it: "runs · 5 rows · 31 ms".
  said: string;
  answer: string;
  lang: 'sql' | '';
  ms: number;
};

export type Outcome = {
  kind: 'none' | 'writing' | 'written' | 'replayed' | 'refused';
  // The caption over `text`.
  label: string;
  // The document that passed (JSON), or the reason it was refused (words).
  text: string;
  lang: 'json' | '';
  // The statement the last passing test compiled, under the caller's policy.
  sql: string;
  fingerprint: string;
  // The request that replays it, as a screen sends it.
  sent: string;
};

export type Trace = {
  principal: string;
  intent: string;
  shape: string;
  // Which authored shape the answer takes (app/vex/query.shapes.ts) — how a
  // replay of it is drawn.
  shapeKind: string;
  // The request as the engine was handed it: intent and shape, JSON.
  request: string;
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
  request: '',
  shown: { tables: '', caller: '' },
  steps: [],
  outcome: { kind: 'none', label: 'Nothing asked yet.', text: '', lang: '', sql: '', fingerprint: '', sent: '' },
  ms: 0,
};

// A statement folded at its clauses, and a long select list one column per
// line, so the engine's own text fits a column: the words are the engine's,
// only the line breaks are added, and only to a statement that has none.
const WIDE = 60;
export const foldStatement = (sql: string): string => {
  if (sql.includes('\n')) return sql;
  const clauses = sql.replace(/\s+(FROM|LEFT JOIN|RIGHT JOIN|INNER JOIN|JOIN|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET)\b/g, '\n$1');
  return clauses
    .split('\n')
    .map((line) => (line.startsWith('SELECT ') && line.length > WIDE ? line.replace(/,\s+/g, ',\n       ') : line))
    .join('\n');
};

const SHORT = 240;
const short = (value: unknown): string => {
  const text = JSON.stringify(value) ?? '';
  return text.length > SHORT ? `${text.slice(0, SHORT)}…` : text;
};
export const summary = (result: unknown): string => short(result);

// JSON set out to be read on a slide: pretty-printed, but a list or an object
// short enough to take in at a glance stays on one line, so a draft is a
// dozen lines rather than forty.
const GLANCE = 52;
export const compactJson = (value: unknown): string => {
  let out = JSON.stringify(value, null, 2) ?? '';
  for (let pass = 0; pass < 8; pass += 1) {
    const next = out.replace(/([[{])\n\s+([^[\]{}\n]*(?:\n\s+[^[\]{}\n]*)*)\n\s*([\]}])/g, (whole: string, open: string, body: string, close: string) => {
      const flat = body
        .split('\n')
        .map((line) => line.trim())
        .join(' ');
      return flat.length <= GLANCE ? `${open} ${flat} ${close}` : whole;
    });
    if (next === out) break;
    out = next;
  }
  return out;
};

type Told = Omit<Step, 'n' | 'label'>;

// A look at the data: the tool, what it was asked, what came back.
export const lookStep = (tool: string, args: unknown, result: string, ms: number): Told => ({
  what: tool,
  ink: 'paper',
  draft: compactJson(args),
  said: `${ms} ms`,
  answer: result,
  lang: '',
  ms,
});

// A test of a draft: the draft, and the engine's answer — its errors, or that
// it runs, with the statement it compiled.
export const testStep = (draft: unknown, answer: { sql: string; errors: readonly string[]; rows: number }, ms: number): Told => {
  const failed = answer.errors.length > 0;
  return {
    what: 'testQuery',
    ink: failed ? 'alert' : 'live',
    draft: compactJson(draft),
    said: failed ? `failed · ${ms} ms` : `runs · ${answer.rows} ${answer.rows === 1 ? 'row' : 'rows'} · ${ms} ms`,
    answer: failed ? answer.errors.join('\n') : foldStatement(answer.sql),
    lang: failed ? '' : 'sql',
    ms,
  };
};

export type Tracer = {
  // Somebody asked, in their own session: the run that follows is theirs.
  expect: (intent: string, principal: string) => void;
  started: (intent: string, shown: Trace['shown'], shape: unknown) => void;
  step: (intent: string, step: Told) => void;
  // The writer finished with this document; `sql` is the last passing test's.
  written: (intent: string, dsl: unknown, sql: string) => void;
  // The engine stored it under this name, answering in this shape.
  completed: (intent: string, fingerprint: string, shapeKind: string) => void;
  replayed: (intent: string, principal: string, fingerprint: string, shapeKind: string) => void;
  refused: (intent: string, reason: string) => void;
  latest: (principal: string) => Trace | undefined;
  onChange: (listener: () => void) => void;
};

const sentFor = (fingerprint: string): string => JSON.stringify({ fingerprint, context: {} }, null, 2);

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
      const trace: Trace = {
        ...EMPTY_TRACE,
        principal,
        intent,
        request: compactJson({ intent }),
        shown: { ...EMPTY_TRACE.shown },
        steps: [],
        outcome: { kind: 'writing', label: 'Writing…', text: '', lang: '', sql: '', fingerprint: '', sent: '' },
      };
      since.set(trace, Date.now());
      open.set(intent, [...(open.get(intent) ?? []), trace]);
      latest.set(principal, trace);
      changed();
    },
    started: (intent, shown, shape) =>
      touch(intent, (trace) => {
        trace.shown = shown;
        trace.shape = JSON.stringify(shape);
        trace.request = compactJson({ intent, shape });
      }),
    step: (intent, told) =>
      touch(intent, (trace) => {
        const n = trace.steps.length + 1;
        trace.steps.push({ n, label: `${n} · ${told.what}`, ...told });
      }),
    written: (intent, dsl, sql) =>
      touch(intent, (trace) => {
        trace.outcome = { kind: 'written', label: 'Finished with exactly the draft that passed: nothing is edited after the test.', text: compactJson(dsl), lang: 'json', sql: foldStatement(sql), fingerprint: '', sent: '' };
      }),
    completed: (intent, fingerprint, shapeKind) => {
      touch(intent, (trace) => {
        trace.outcome.fingerprint = fingerprint;
        trace.outcome.sent = sentFor(fingerprint);
        trace.shapeKind = shapeKind;
      });
      settle(intent, () => false);
    },
    replayed: (intent, principal, fingerprint, shapeKind) => {
      touch(intent, (trace) => {
        if (trace.principal !== principal) return;
        trace.shapeKind = shapeKind;
        trace.outcome = { kind: 'replayed', label: 'Asked before: the stored query, replayed. No model ran.', text: '', lang: '', sql: '', fingerprint, sent: sentFor(fingerprint) };
      });
      settle(intent, (trace) => trace.principal !== principal);
    },
    refused: (intent, reason) => {
      touch(intent, (trace) => {
        if (trace.outcome.kind !== 'refused') trace.outcome = { kind: 'refused', label: 'Refused', text: reason, lang: '', sql: '', fingerprint: '', sent: '' };
      });
      settle(intent, () => false);
    },
    latest: (principal) => latest.get(principal),
    onChange: (listener) => {
      listeners.add(listener);
    },
  };
};
