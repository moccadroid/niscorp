// ONE REQUEST, AS IT WAS ANSWERED — lyceum's own record of what happened to a
// question in words, for the stage to draw as a picture
// (app/actions/slide/vex.layouts.ts): a line of steps every request walks —
// the request, Jev, the stored query, the engine, the answer — and one detour
// under it, walked only when nothing stored matched and a query had to be
// written: vex's query agent, then the mapping. The picture is the same every
// time; what was walked is lit, what did not happen is not.
//
// What is true, and what the picture says:
//   · Jev is a model and runs on every request. It is handed the words of the
//     requests already answered and picks the one that asks the same, or none
//     — and the answer's shape. It never looks at a query or a mapping.
//   · A stored query is a document and a mapping, written once, together.
//   · The engine compiles the document, runs it as the caller, and maps the
//     rows with the stored mapping — on every run, a replay included.
//   · The detour is the writing: the query agent tests drafts until one runs;
//     the mapping is the identity when the rows already fit the shape, and
//     otherwise written by the mapping agent.
//   · The mapping the slide shows is the stored one, read back from the stored
//     query — the same on the run that wrote it and on every replay.
//
// A trace belongs to the person who asked. `expect` is called before the
// engine runs, inside their session, so the run is attributed to them without
// the writer knowing who they are; the engine collapses identical requests
// into one run, so a run is found by its intent. The mapping hook is not
// handed the request it maps for, so the engine is run inside `during`, which
// says whose it is (an async context).
import { AsyncLocalStorage } from 'node:async_hooks';
import { compactJson } from '@lyceum/app/actions/slide/compact';

// The inks a step wears: a model ran (signal), no model (highlight), the
// answer (live), refused (alert).
type Ink = 'signal' | 'highlight' | 'live' | 'alert';
export type Step = { label: string; value: string; note: string; ink: Ink; off: boolean };
export type Pipeline = {
  steps: Step[];
  detour: { from: number; to: number; label: string; enter: string; leave: string; direct: string; off: boolean; steps: Step[] };
  legend: { label: string; ink: Ink }[];
};

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
  // Under the picture: how it ended ("Replayed"), and in a sentence how long
  // it took in all and which models ran. "Nothing asked yet." before anything is.
  title: string;
  said: string;
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
  pipeline: Pipeline;
  // The same picture with nothing lit — what the slide shows while a new
  // question is being typed over an old run.
  idle: Pipeline;
  // The shape Jev picked, as the request carries it (JSON), and its name.
  shape: { caption: string; text: string };
  // What came back, for the person who asked: the first rows, or the one value.
  rows: unknown;
  // The one document the slide shows: the draft the agent is testing, the
  // engine's message about a draft it refused, or the stored query a replay
  // ran. Empty when there is none to show.
  document: { caption: string; text: string; lang: 'json' | ''; flag: 'live' | 'alert' | 'highlight' };
  // The stored query's other half: the mapping that puts its rows in the
  // shape. Empty until the query is stored.
  mapping: { caption: string; text: string };
  // Every call the query agent made, one line each, in order — the whole
  // run, to be read back — and what the slide shows of it: the newest few,
  // newest first, the ones that ran marked.
  calls: string[];
  log: { caption: string; text: string; marked: number[] };
  outcome: Outcome;
  ms: number;
};

// What the trace knows, from which everything drawn is worked out.
type Known = {
  jev: { matched: boolean; shape: string; ms: number } | undefined;
  rows: unknown;
  // How long the query agent took to write, and the engine to run, in ms.
  agentMs: number | undefined;
  engineMs: number | undefined;
  // The query agent was started: a refusal with no agent is one stored before.
  agent: boolean;
  calls: Call[];
  mapping: { byAgent: boolean; ms: number } | undefined;
  stored: unknown;
  // The stored mapping, as the stored query holds it.
  mapped: unknown;
  answered: string;
  refusal: string;
};

const LEGEND: Pipeline['legend'] = [
  { label: 'A model ran', ink: 'signal' },
  { label: 'No model', ink: 'highlight' },
];
const NO_PIPELINE: Pipeline = { steps: [], detour: { from: 0, to: 1, label: '', enter: '', leave: '', direct: '', off: true, steps: [] }, legend: LEGEND };
const NO_LOG: Trace['log'] = { caption: '', text: '', marked: [] };
// How many of the agent's calls the slide lists, and how long a line of it is.
const LOG_SHOWN = 8;
const LOG_LINE = 28;
const NO_DOCUMENT: Trace['document'] = { caption: '', text: '', lang: '', flag: 'highlight' };
const NO_MAPPING: Trace['mapping'] = { caption: '', text: '' };
const NO_OUTCOME: Outcome = { kind: 'none', title: 'Nothing asked yet.', said: '', fingerprint: '', sent: '' };

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

const counted = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
const took = (ms: number | undefined): string => (ms === undefined ? '' : `${ms} ms`);

// A look at the data: the tool, what it was asked, what came back.
export const lookCall = (tool: string, args: unknown, result: string, ms: number): Call => ({ what: tool, failed: false, sent: args, said: result, how: `${ms} ms` });

// A test of a draft. The agent's tool runs every draft with a limit of five
// (vex's `testQuery`), whatever the draft's own limit — said, so a test's rows
// are not taken for the answer's.
export const testCall = (draft: unknown, answer: { errors: readonly string[]; rows: number }): Call => {
  const failed = answer.errors.length > 0;
  return { what: 'testQuery', failed, sent: draft, said: failed ? answer.errors.join('\n') : '', how: failed ? 'failed' : `ran · ${counted(answer.rows, 'row', 'rows')} · limit 5` };
};

// A document sits in the widest of the three columns of the slide's last row,
// the mapping in the one beside it.
const DOCUMENT_LINE = 53;
const MAPPING_LINE = 40;
// How many rows of an answer the stage shows.
const ANSWER_ROWS = 5;
// The first and the last of a fingerprint, so it fits a step.
const brief = (fingerprint: string): string => (fingerprint.length <= 14 ? fingerprint : `${fingerprint.slice(0, 7)}…${fingerprint.slice(-4)}`);

// THE PICTURE, from what is known.
const drawn = (trace: Trace, known: Known): void => {
  const kind = trace.outcome.kind;
  const replayed = kind === 'replayed';
  const refused = kind === 'refused';
  const routed = known.jev !== undefined;
  // The detour is walked from the moment Jev finds no match — unless what was
  // stored for this request is a refusal, which the engine hands back without
  // an agent.
  const refusedBefore = refused && !known.agent;
  const writing = routed && !replayed && known.jev?.matched !== true && !refusedBefore;
  const stored = trace.outcome.fingerprint !== '';
  const answered = known.answered !== '';
  const tests = known.calls.filter((call) => call.what === 'testQuery');
  const refusals = tests.filter((call) => call.failed).length;
  // The other tools it called, by name: getSchema ×2.
  const others = [...new Set(known.calls.filter((call) => call.what !== 'testQuery').map((call) => call.what))].map((tool) => `${tool} ×${known.calls.filter((call) => call.what === tool).length}`);
  // The agent gave up, or the engine refused what it wrote.
  const agentRefused = refused && writing;
  const agentSaid =
    known.calls.length === 0
      ? agentRefused
        ? 'cannotSatisfy'
        : 'working…'
      : [`testQuery ×${tests.length}`, ...(refusals === 0 ? [] : [`${refusals} refused`]), ...others].join(' · ');

  trace.pipeline = {
    steps: [
      { label: 'Jev', value: known.jev === undefined ? (trace.intent === '' ? '' : 'picking…') : `${known.jev.matched ? 'match' : 'no match'} · ${known.jev.shape}`, note: took(known.jev?.ms), ink: 'signal', off: trace.intent === '' },
      { label: 'Stored query', value: refusedBefore ? 'refused before' : stored ? `${brief(trace.outcome.fingerprint)}${replayed ? '' : ' · new'}` : '', note: '', ink: refusedBefore ? 'alert' : 'highlight', off: !stored && !refusedBefore },
      { label: 'Engine', value: 'compile · run · map', note: took(known.engineMs), ink: 'highlight', off: !answered },
      { label: 'Answer', value: known.answered, note: '', ink: 'live', off: !answered },
    ],
    detour: {
      from: 0,
      to: 1,
      label: '',
      enter: 'no match',
      leave: 'document + mapping',
      // A refusal stored for these very words is found by the engine, not by Jev.
      direct: refusedBefore ? 'same request' : 'match',
      off: !writing,
      steps: [
        { label: 'Query agent', value: writing ? agentSaid : '', note: writing ? took(known.agentMs) : '', ink: agentRefused ? 'alert' : 'signal', off: !writing },
        {
          label: 'Mapping agent',
          value: known.mapping === undefined ? '' : known.mapping.byAgent ? 'mapping written' : 'rows fit the shape',
          note: known.mapping?.byAgent === true ? took(known.mapping.ms) : '',
          ink: known.mapping?.byAgent === true ? 'signal' : 'highlight',
          off: known.mapping === undefined,
        },
      ],
    },
    legend: LEGEND,
  };

  trace.rows = Array.isArray(known.rows) ? known.rows.slice(0, ANSWER_ROWS) : (known.rows ?? []);

  // The run, a line a call: its number, the tool, and what came back — the
  // engine's own first line for a draft it refused.
  const lines = known.calls.map((call, index) => {
    const said = call.said.split('\n')[0] ?? '';
    const result = call.what !== 'testQuery' ? call.how : call.failed ? `refused · ${said}` : call.how;
    return `#${String(index + 1).padEnd(3)} ${call.what.padEnd(18)} ${result.length > LOG_LINE ? `${result.slice(0, LOG_LINE)}…` : result}`;
  });
  const newest = lines.map((line, index) => ({ line, ran: known.calls[index]?.what === 'testQuery' && known.calls[index]?.failed === false })).slice(-LOG_SHOWN).reverse();
  trace.calls = lines;
  trace.log = writing && lines.length > 0 ? { caption: `Query agent · ${counted(lines.length, 'call', 'calls')}`, text: newest.map((each) => each.line).join('\n'), marked: newest.flatMap((each, index) => (each.ran ? [index + 1] : [])) } : NO_LOG;

  // The one document: what a replay ran; else the newest draft, or the
  // engine's message about it.
  const drafted = tests.at(-1);
  trace.document =
    replayed && known.stored !== undefined
      ? { caption: `Stored query · ${trace.outcome.fingerprint}`, text: compactJson(known.stored, DOCUMENT_LINE), lang: 'json', flag: 'highlight' }
      : drafted === undefined
        ? NO_DOCUMENT
        : drafted.failed
          ? { caption: `Query agent · testQuery #${tests.length} · refused`, text: drafted.said, lang: '', flag: 'alert' }
          : { caption: `Query agent · testQuery #${tests.length} · ${drafted.how}`, text: compactJson(drafted.sent, DOCUMENT_LINE), lang: 'json', flag: 'live' };

  trace.mapping = known.mapped === undefined ? NO_MAPPING : { caption: replayed ? 'Stored mapping' : 'Mapping', text: compactJson(known.mapped, MAPPING_LINE) };

  // Which models ran: Jev always; the query agent when a query was written;
  // the mapping agent when it wrote the mapping.
  const models = ['Jev', ...(writing ? ['query agent'] : []), ...(known.mapping?.byAgent === true ? ['mapping agent'] : [])];
  const ran = routed ? ` ${counted(models.length, 'model ran', 'models ran')}: ${models.join(', ')}.` : '';
  const ended = refused || ((replayed || kind === 'written') && stored);
  trace.outcome.title = kind === 'none' ? NO_OUTCOME.title : refused ? 'Refused' : !ended ? 'Writing…' : replayed ? 'Replayed' : 'Written';
  trace.outcome.said = !ended ? '' : refused ? `${known.refusal.replace(/[.]$/, "")}. ${trace.ms} ms in all.${ran}` : `${trace.ms} ms in all.${ran}`;
};

const nothingKnown = (): Known => ({ rows: undefined, jev: undefined, agentMs: undefined, engineMs: undefined, agent: false, calls: [], mapping: undefined, stored: undefined, mapped: undefined, answered: '', refusal: '' });

export const EMPTY_TRACE: Trace = (() => {
  const trace: Trace = { principal: '', intent: '', shapeKind: '', pipeline: NO_PIPELINE, idle: NO_PIPELINE, shape: { caption: '', text: '' }, rows: [], document: NO_DOCUMENT, mapping: NO_MAPPING, calls: [], log: NO_LOG, outcome: { ...NO_OUTCOME }, ms: 0 };
  drawn(trace, nothingKnown());
  trace.idle = trace.pipeline;
  return trace;
})();

export type Tracer = {
  // Somebody asked, in their own session: the run that follows is theirs.
  expect: (intent: string, principal: string) => void;
  // Jev picked: a request already answered that asks the same, or none — and
  // the answer's shape.
  routed: (principal: string, intent: string, decided: { fingerprint: string | null; shape: string }, shape: unknown, ms: number) => void;
  // Run the engine for this request: what its hooks record is this request's.
  during: <T>(intent: string, run: () => Promise<T>) => Promise<T>;
  // The query agent was started, and made a call.
  writing: (intent: string) => void;
  called: (intent: string, call: Call) => void;
  // The rows were put in the shape: already in it (the identity, no model), or
  // by a mapping the mapping agent wrote.
  mapped: (mapping: { byAgent: boolean; ms: number }) => void;
  // The agent finished, after this long: its last draft is the document.
  written: (intent: string, ms: number) => void;
  // The engine stored it under this name, answering in this shape.
  completed: (intent: string, fingerprint: string, shapeKind: string) => void;
  replayed: (intent: string, principal: string, fingerprint: string, shapeKind: string) => void;
  refused: (intent: string, reason: string) => void;
  // It has answered — a new query and a replayed one alike: the rows it gave
  // the person who asked, and the stored document that ran.
  answered: (principal: string, intent: string, stored: { document: unknown; mapping: unknown; rows: unknown; engineMs: number | undefined }) => void;
  latest: (principal: string) => Trace | undefined;
  onChange: (listener: () => void) => void;
};

const sentFor = (fingerprint: string): string => compactJson({ fingerprint, context: {} }, DOCUMENT_LINE);

export const createTracer = (): Tracer => {
  // The runs still being written, by intent; the newest trace of each person.
  const open = new Map<string, Trace[]>();
  const latest = new Map<string, Trace>();
  const since = new WeakMap<Trace, number>();
  const knowns = new WeakMap<Trace, Known>();
  const running = new AsyncLocalStorage<string>();
  const listeners = new Set<() => void>();
  const told = (): void => listeners.forEach((listener) => listener());
  const elapsed = (trace: Trace): number => Date.now() - (since.get(trace) ?? Date.now());

  // Every change is one of what is known; the picture is drawn again from it.
  // The clock runs until the request has ended.
  const change = (trace: Trace, to: (trace: Trace, known: Known) => void): void => {
    const known = knowns.get(trace);
    if (known === undefined) return;
    const ended = trace.outcome.fingerprint !== '' || trace.outcome.kind === 'refused';
    to(trace, known);
    if (!ended) trace.ms = elapsed(trace);
    drawn(trace, known);
  };
  const touch = (intent: string, to: (trace: Trace, known: Known) => void): void => {
    const traces = open.get(intent) ?? [];
    for (const trace of traces) change(trace, to);
    if (traces.length > 0) told();
  };
  const settle = (intent: string, keep: (trace: Trace) => boolean): void => {
    const left = (open.get(intent) ?? []).filter(keep);
    if (left.length === 0) open.delete(intent);
    else open.set(intent, left);
  };
  const theirs = (principal: string, intent: string, to: (trace: Trace, known: Known) => void): void => {
    const trace = latest.get(principal);
    if (trace === undefined || trace.intent !== intent) return;
    change(trace, to);
    told();
  };

  return {
    expect: (intent, principal) => {
      const trace: Trace = { ...EMPTY_TRACE, principal, intent, outcome: { ...NO_OUTCOME, kind: 'writing' } };
      since.set(trace, Date.now());
      knowns.set(trace, nothingKnown());
      open.set(intent, [...(open.get(intent) ?? []), trace]);
      latest.set(principal, trace);
      change(trace, () => undefined);
      told();
    },
    routed: (principal, intent, decided, shape, ms) =>
      theirs(principal, intent, (trace, known) => {
        trace.shape = { caption: `Shape · ${decided.shape}`, text: compactJson(shape, DOCUMENT_LINE) };
        known.jev = { matched: decided.fingerprint !== null, shape: decided.shape, ms };
      }),
    during: (intent, run) => running.run(intent, run),
    writing: (intent) =>
      touch(intent, (_trace, known) => {
        known.agent = true;
      }),
    called: (intent, call) =>
      touch(intent, (_trace, known) => {
        known.calls.push(call);
      }),
    mapped: (mapping) => {
      const intent = running.getStore();
      if (intent === undefined) return;
      touch(intent, (_trace, known) => {
        known.mapping = mapping;
      });
    },
    written: (intent, ms) =>
      touch(intent, (trace, known) => {
        known.agentMs = ms;
        trace.outcome.kind = 'written';
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
        trace.outcome = { ...NO_OUTCOME, kind: 'replayed', fingerprint, sent: sentFor(fingerprint) };
      });
      settle(intent, (trace) => trace.principal !== principal);
    },
    refused: (intent, reason) => {
      touch(intent, (trace, known) => {
        if (trace.outcome.kind === 'refused') return;
        known.refusal = reason;
        trace.outcome = { ...NO_OUTCOME, kind: 'refused' };
      });
      settle(intent, () => false);
    },
    answered: (principal, intent, stored) =>
      theirs(principal, intent, (_trace, known) => {
        known.stored = stored.document;
        known.mapped = stored.mapping;
        known.rows = stored.rows;
        known.engineMs = stored.engineMs;
        known.answered = Array.isArray(stored.rows) ? counted(stored.rows.length, 'row', 'rows') : '1 value';
      }),
    latest: (principal) => latest.get(principal),
    onChange: (listener) => {
      listeners.add(listener);
    },
  };
};
