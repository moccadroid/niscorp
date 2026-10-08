// ONE REQUEST, AS IT WAS ANSWERED — lyceum's own record of what happened to a
// question in words, in the order it happened, for the stage to draw
// (app/actions/slide/vex.layouts.ts): the request; what Jev picked; every call
// vex's query agent made, with the draft it tested and what the engine said;
// what happened to the rows on the way to the shape — nothing, or Prism's
// mapping agent; the answer; the name it is stored under. A replay is the same
// record with the two model steps absent, because they did not happen.
//
// Every string is ready to print. What the slide draws is a list of PANES — a
// caption, a document, how it is flagged — so the slide arranges and nothing
// on it decides what a step looks like.
//
// A trace belongs to the person who asked. `expect` is called before the
// engine runs, inside their session, so the run is attributed to them without
// the writer knowing who they are; the engine collapses identical requests
// into one run, so a run is found by its intent. The mapping hook is not
// handed the request it maps for, so the engine is run inside `during`, which
// says whose it is (an async context).
import { AsyncLocalStorage } from 'node:async_hooks';
import { compactJson } from '@lyceum/app/actions/slide/compact';

export type Pane = { key: string; caption: string; text: string; lang: 'json' | 'sql' | ''; flag: 'alert' | 'live' | 'highlight' | 'paper' };

// One call the query agent made: the tool, what it sent, and what came back.
export type Call = {
  what: string;
  // A test the engine refused; its own message is `said`.
  failed: boolean;
  sent: unknown;
  // What came back, in words: the engine's errors, or a look's result. Empty
  // for a test that ran — its draft is what there is to see.
  said: string;
  // "ran · 1 row · limit 5", "failed", "4 ms".
  how: string;
};

export type Outcome = {
  kind: 'none' | 'writing' | 'written' | 'replayed' | 'refused';
  // "Nothing asked yet.", "Writing…", or why it was refused.
  label: string;
  // The stored document a replay ran (JSON); empty otherwise — a new query's
  // document is the agent's last draft, among its calls.
  document: string;
  // What it answered, for the person who asked: their rows, as JSON, and the
  // caption over them ("Answer · 3 rows").
  answer: string;
  answered: string;
  fingerprint: string;
  // The request that replays it, as a screen sends it.
  sent: string;
};

export type Trace = {
  principal: string;
  intent: string;
  // Which authored shape the answer takes (app/vex/query.shapes.ts) — how a
  // replay of it is drawn.
  shapeKind: string;
  // The request as the engine was handed it: intent and shape, JSON.
  request: string;
  // What Jev was asked and what it picked; empty until it has.
  jev: { caption: string; text: string };
  // The query agent's calls: all of them, and the panes the slide shows of
  // them — the newest few, the newest in full.
  calls: Call[];
  panes: Pane[];
  // What happened to the rows on the way to the shape; empty until it has, and
  // on a replay. `text` is the mapping Prism's agent wrote — empty when the
  // rows were already the shape and nothing was written.
  mapping: { caption: string; text: string };
  outcome: Outcome;
  ms: number;
};

const NO_OUTCOME: Outcome = { kind: 'none', label: 'Nothing asked yet.', document: '', answer: '', answered: '', fingerprint: '', sent: '' };

export const EMPTY_TRACE: Trace = {
  principal: '',
  intent: '',
  shapeKind: '',
  request: '',
  jev: { caption: '', text: '' },
  calls: [],
  panes: [],
  mapping: { caption: '', text: '' },
  outcome: NO_OUTCOME,
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
export const summary = (result: unknown): string => {
  const text = JSON.stringify(result) ?? '';
  return text.length > SHORT ? `${text.slice(0, SHORT)}…` : text;
};

const rowsSaid = (rows: number): string => `${rows} ${rows === 1 ? 'row' : 'rows'}`;

// A look at the data: the tool, what it was asked, what came back.
export const lookCall = (tool: string, args: unknown, result: string, ms: number): Call => ({ what: tool, failed: false, sent: args, said: result, how: `${ms} ms` });

// A test of a draft. The agent's tool runs every draft with a limit of five
// (vex's `testQuery`), whatever the draft's own limit — said, so a test's rows
// are not taken for the answer's.
export const testCall = (draft: unknown, answer: { errors: readonly string[]; rows: number }): Call => {
  const failed = answer.errors.length > 0;
  return { what: 'testQuery', failed, sent: draft, said: failed ? answer.errors.join('\n') : '', how: failed ? 'failed' : `ran · ${rowsSaid(answer.rows)} · limit 5` };
};

// The request, Jev's pick and the mapping are each ONE line, which the pane
// wraps where it must. A draft sits in half the slide.
const LINE = 400;
const DRAFT_PANE = 52;
// How many of the agent's calls the slide shows: the newest, with the newest
// in full; the caption says which call each is, so a run of seven reads as
// #5, #6, #7.
const CALLS_SHOWN = 3;
// How many rows of an answer the stage shows.
const ANSWER_ROWS = 6;

const panesOf = (calls: readonly Call[]): Pane[] =>
  calls.flatMap((call, index): Pane[] => {
    if (index < calls.length - CALLS_SHOWN) return [];
    const newest = index === calls.length - 1;
    const name = `Query agent · ${call.what} #${index + 1}`;
    const key = `call-${index + 1}`;
    if (call.what !== 'testQuery') return [{ key, caption: `${name} · ${call.how}`, text: call.said, lang: '', flag: 'paper' }];
    const draft = newest ? compactJson(call.sent, DRAFT_PANE) : compactJson(call.sent, LINE);
    if (!call.failed) return [{ key, caption: `${name} · ${call.how}`, text: draft, lang: 'json', flag: 'live' }];
    // A draft the engine refused: the newest with the draft over the engine's
    // own message, an earlier one as the message alone.
    const refusal: Pane = { key: `${key}-said`, caption: newest ? call.how : `${name} · ${call.how}`, text: call.said, lang: '', flag: 'alert' };
    return newest ? [{ key, caption: name, text: draft, lang: 'json', flag: 'paper' }, refusal] : [refusal];
  });

export type Tracer = {
  // Somebody asked, in their own session: the run that follows is theirs.
  expect: (intent: string, principal: string) => void;
  // Jev picked. With no query stored it was asked one thing, the shape; with
  // some, also which of them asks the same — a fingerprint and the intent it
  // was stored for, or none. From here the request is whole, intent and shape.
  routed: (principal: string, intent: string, decided: { fingerprint: string | null; intent: string | null; shape: string }, stored: number, shape: unknown) => void;
  // Run the engine for this request: what its hooks record is this request's.
  during: <T>(intent: string, run: () => Promise<T>) => Promise<T>;
  // The query agent made a call.
  called: (intent: string, call: Call) => void;
  // The rows were put in the shape: already in it (the identity, no model), or
  // by the mapping Prism's agent wrote — as it wrote it.
  mapped: (mapping: { byAgent: boolean; config: unknown; ms: number }) => void;
  // The agent finished: its last draft is the document.
  written: (intent: string) => void;
  // The engine stored it under this name, answering in this shape.
  completed: (intent: string, fingerprint: string, shapeKind: string) => void;
  replayed: (intent: string, principal: string, fingerprint: string, shapeKind: string) => void;
  refused: (intent: string, reason: string) => void;
  // It has answered — a new query and a replayed one alike: the rows it gave
  // the person who asked, and, for a replay, the stored document that ran.
  answered: (principal: string, intent: string, stored: { document: unknown; rows: unknown }) => void;
  latest: (principal: string) => Trace | undefined;
  onChange: (listener: () => void) => void;
};

const sentFor = (fingerprint: string): string => compactJson({ fingerprint, context: {} }, LINE);

export const createTracer = (): Tracer => {
  // The runs still being written, by intent; the newest trace of each person.
  const open = new Map<string, Trace[]>();
  const latest = new Map<string, Trace>();
  const since = new WeakMap<Trace, number>();
  const running = new AsyncLocalStorage<string>();
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
  const theirs = (principal: string, intent: string): Trace | undefined => {
    const trace = latest.get(principal);
    return trace !== undefined && trace.intent === intent ? trace : undefined;
  };

  return {
    expect: (intent, principal) => {
      const trace: Trace = { ...EMPTY_TRACE, principal, intent, request: compactJson({ intent }, LINE), calls: [], panes: [], outcome: { ...NO_OUTCOME, kind: 'writing', label: 'Writing…' } };
      since.set(trace, Date.now());
      open.set(intent, [...(open.get(intent) ?? []), trace]);
      latest.set(principal, trace);
      changed();
    },
    routed: (principal, intent, decided, stored, shape) => {
      const trace = theirs(principal, intent);
      if (trace === undefined) return;
      trace.jev =
        stored === 0
          ? { caption: 'Jev · the shape · no stored query to pick from', text: compactJson({ shape: decided.shape }, LINE) }
          : { caption: `Jev · picked from ${stored} stored ${stored === 1 ? 'query' : 'queries'}`, text: compactJson(decided, LINE) };
      trace.request = compactJson({ intent, shape }, LINE);
      changed();
    },
    during: (intent, run) => running.run(intent, run),
    called: (intent, call) =>
      touch(intent, (trace) => {
        trace.calls.push(call);
        trace.panes = panesOf(trace.calls);
      }),
    mapped: ({ byAgent, config, ms }) => {
      const intent = running.getStore();
      if (intent === undefined) return;
      touch(intent, (trace) => {
        // The identity is not a document anybody wrote: said, with nothing under it.
        trace.mapping = byAgent ? { caption: `Prism mapping agent · ${ms} ms`, text: compactJson(config, LINE) } : { caption: 'Mapping · rows already in the shape · no model ran', text: '' };
      });
    },
    written: (intent) =>
      touch(intent, (trace) => {
        trace.outcome = { ...trace.outcome, kind: 'written', label: '' };
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
        trace.outcome = { ...NO_OUTCOME, kind: 'replayed', label: '', fingerprint, sent: sentFor(fingerprint) };
      });
      settle(intent, (trace) => trace.principal !== principal);
    },
    refused: (intent, reason) => {
      touch(intent, (trace) => {
        if (trace.outcome.kind !== 'refused') trace.outcome = { ...NO_OUTCOME, kind: 'refused', label: reason };
      });
      settle(intent, () => false);
    },
    answered: (principal, intent, stored) => {
      const trace = theirs(principal, intent);
      if (trace === undefined) return;
      const listed = Array.isArray(stored.rows);
      const rows: unknown[] = Array.isArray(stored.rows) ? stored.rows : [stored.rows];
      if (trace.outcome.kind === 'replayed') trace.outcome.document = compactJson(stored.document, DRAFT_PANE);
      trace.outcome.answer = compactJson(listed ? rows.slice(0, ANSWER_ROWS) : stored.rows, LINE);
      trace.outcome.answered = !listed ? 'Answer' : `Answer · ${rowsSaid(rows.length)}${rows.length > ANSWER_ROWS ? ` · the first ${ANSWER_ROWS}` : ''}`;
      changed();
    },
    latest: (principal) => latest.get(principal),
    onChange: (listener) => {
      listeners.add(listener);
    },
  };
};
