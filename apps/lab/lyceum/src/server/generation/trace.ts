// WATCHING A QUERY BEING WRITTEN — lyceum's own record of one generation, in
// lyceum's words, for the stage to draw: the request, each thing the writer
// did (a look at the data, a test of a draft and what the engine answered),
// and how it ended (the document that passed and the name it was stored under,
// a replay with no model, or a refusal). Every string is ready to print, and
// every document is set out as one: a draft, an answer, a statement each an
// exhibit of its own on the slide (app/actions/slide/vex.layouts.ts). What
// the model is shown has a slide of its own, read off the charter.
import { compactJson } from '@lyceum/app/actions/slide/compact';
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
  // The statement the stored document compiles to — its own limit, not a
  // test's (a test runs a draft with a limit of five).
  sql: string;
  // What it answered, for the person who asked: their rows, as JSON, and the
  // caption over them ("The answer · 3 rows").
  answer: string;
  answered: string;
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
  // What the router decided before anything was written or replayed (JSON),
  // and the caption over it: how many earlier requests it was handed.
  router: string;
  routed: string;
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
  router: '',
  routed: '',
  steps: [],
  outcome: { kind: 'none', label: 'Nothing asked yet.', text: '', lang: '', sql: '', answer: '', answered: '', fingerprint: '', sent: '' },
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


type Told = Omit<Step, 'n' | 'label'>;

// A look at the data: the tool, what it was asked, what came back.
export const lookStep = (tool: string, args: unknown, result: string, ms: number): Told => ({
  what: tool,
  ink: 'paper',
  draft: compactJson(args, DOCUMENT_PANE),
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
    draft: compactJson(draft, DOCUMENT_PANE),
    said: failed ? `failed · ${ms} ms` : `test · limit 5 · ${answer.rows} ${answer.rows === 1 ? 'row' : 'rows'} · ${ms} ms`,
    answer: failed ? answer.errors.join('\n') : foldStatement(answer.sql),
    lang: failed ? '' : 'sql',
    ms,
  };
};

export type Tracer = {
  // Somebody asked, in their own session: the run that follows is theirs.
  expect: (intent: string, principal: string) => void;
  // The engine is running it: the request is whole now, intent and shape.
  started: (intent: string, shape: unknown) => void;
  step: (intent: string, step: Told) => void;
  // The writer finished with this document; `sql` is the last passing test's.
  written: (intent: string, dsl: unknown, sql: string) => void;
  // The engine stored it under this name, answering in this shape.
  completed: (intent: string, fingerprint: string, shapeKind: string) => void;
  replayed: (intent: string, principal: string, fingerprint: string, shapeKind: string) => void;
  refused: (intent: string, reason: string) => void;
  // The router chose: whether an earlier request asks the same, and the
  // answer's shape. From here the request is whole, intent and shape.
  routed: (principal: string, intent: string, decided: { same: string | null; shape: string }, earlier: number, shape: unknown) => void;
  // The query that answers is known, and has answered — a new one and a
  // replayed one alike: the stored document, the statement it compiles to, the
  // rows it gave the person who asked, and the shape they came in.
  answered: (principal: string, intent: string, stored: { document: unknown; statement: string; rows: unknown; shape: unknown }) => void;
  latest: (principal: string) => Trace | undefined;
  onChange: (listener: () => void) => void;
};

// The request, the router's choice and the replay are each ONE line, which the
// pane wraps where it must: folded over four lines, a long question took the
// room the result needs.

const WIDE_PANE = 400;
// A draft and a stored document sit in the wider column of the slide's pair:
// sixty characters a line, so a short list of fields or of sorts stays on one.
const DOCUMENT_PANE = 60;
// How many rows of an answer the stage shows.
const ANSWER_ROWS = 6;
const sentFor = (fingerprint: string): string => compactJson({ fingerprint, context: {} }, WIDE_PANE);

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
        request: compactJson({ intent }, WIDE_PANE),
        steps: [],
        outcome: { kind: 'writing', label: 'Writing…', text: '', lang: '', sql: '', answer: '', answered: '', fingerprint: '', sent: '' },
      };
      since.set(trace, Date.now());
      open.set(intent, [...(open.get(intent) ?? []), trace]);
      latest.set(principal, trace);
      changed();
    },
    started: (intent, shape) =>
      touch(intent, (trace) => {
        trace.shape = JSON.stringify(shape);
        trace.request = compactJson({ intent, shape }, WIDE_PANE);
      }),
    step: (intent, told) =>
      touch(intent, (trace) => {
        const n = trace.steps.length + 1;
        trace.steps.push({ n, label: `${n} · ${told.what}`, ...told });
      }),
    written: (intent, dsl, sql) =>
      touch(intent, (trace) => {
        trace.outcome = { kind: 'written', label: 'Finished with exactly the draft that passed: nothing is edited after the test.', text: compactJson(dsl, DOCUMENT_PANE), lang: 'json', sql: foldStatement(sql), answer: '', answered: '', fingerprint: '', sent: '' };
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
        trace.outcome = { kind: 'replayed', label: 'Asked before: the stored query, replayed. No model ran.', text: '', lang: '', sql: '', answer: '', answered: '', fingerprint, sent: sentFor(fingerprint) };
      });
      settle(intent, (trace) => trace.principal !== principal);
    },
    refused: (intent, reason) => {
      touch(intent, (trace) => {
        if (trace.outcome.kind !== 'refused') trace.outcome = { kind: 'refused', label: 'Refused', text: reason, lang: '', sql: '', answer: '', answered: '', fingerprint: '', sent: '' };
      });
      settle(intent, () => false);
    },
    routed: (principal, intent, decided, earlier, shape) => {
      const trace = latest.get(principal);
      if (trace === undefined || trace.intent !== intent) return;
      trace.router = compactJson(decided, WIDE_PANE);
      trace.routed = `The router · ${earlier} earlier ${earlier === 1 ? 'request' : 'requests'} · it chooses, it never writes`;
      trace.request = compactJson({ intent, shape }, WIDE_PANE);
      changed();
    },
    answered: (principal, intent, stored) => {
      const trace = latest.get(principal);
      if (trace === undefined || trace.intent !== intent) return;
      const listed = Array.isArray(stored.rows);
      const rows: unknown[] = Array.isArray(stored.rows) ? stored.rows : [stored.rows];
      trace.request = compactJson({ intent, shape: stored.shape }, WIDE_PANE);
      trace.outcome.text = compactJson(stored.document, DOCUMENT_PANE);
      trace.outcome.lang = 'json';
      trace.outcome.sql = foldStatement(stored.statement);
      trace.outcome.answer = compactJson(listed ? rows.slice(0, ANSWER_ROWS) : stored.rows);
      trace.outcome.answered = !listed ? 'The answer' : `The answer · ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}${rows.length > ANSWER_ROWS ? ` · the first ${ANSWER_ROWS}` : ''}`;
      changed();
    },
    latest: (principal) => latest.get(principal),
    onChange: (listener) => {
      listeners.add(listener);
    },
  };
};
