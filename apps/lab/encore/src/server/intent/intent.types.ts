import type { Question } from '@niscorp/signal';
import type { Desired } from '@niscorp/nova';
import type { Day } from '@encore/lib/festival-clock';

// The loop's working vocabulary — what one lane hands the next. Plain data all
// the way through, so any lane can be run alone against a literal.

// A row the sentence named and then took back, and the row meant in its place
// (supersede.ts).
export type Superseded = { table: string; id: string; label: string; by: { id: string; label: string }; marker: string };

// ─── parse ───────────────────────────────────────────────────

// What the sentence SAID outright. Every field is absent until it is said:
// the parser never guesses, and a value it did not read is one the resolver
// may take from the festival clock instead — or leave for the operator.
export type Parsed = {
  time?: string;
  hour?: number;
  day?: Day;
  minutes?: number;
  amount?: number;
  // The words left over once values were consumed, stopwords dropped. "9" in
  // "storm at 9" is a time, not a search term, and must not go looking for an
  // act called 9.
  tokens: string[];
};

// ─── candidates ──────────────────────────────────────────────

export type Candidate = { id: string; label: string };

// table → the rows on offer this pass.
export type CandidateSets = Record<string, Candidate[]>;

// ─── derive ──────────────────────────────────────────────────

// How one input field of one action gets its value. `question` names the
// question whose answer fills it — possibly one asked on behalf of a sibling
// field, when two fields emitted the same question.
export type FieldPlan =
  // `blank`: what the card holds for this field before anybody says anything —
  // the definition's own default. What an unsaid value goes BACK to.
  | { field: string; kind: 'parse'; parse: string; fallback: boolean; blank: string | number | boolean }
  // `table` is set when the options were candidate ROWS: the pick is then an
  // entity the sentence resolved, which the handoff reports as such.
  | { field: string; kind: 'choice'; question: string; table?: string }
  | { field: string; kind: 'boolean'; question: string }
  | { field: string; kind: 'level'; question: string; minimum: number };

export type ActionPlan = {
  actionId: string;
  // The `action/<id>` noul that decides whether the card belongs on screen.
  question: string;
  fields: FieldPlan[];
  required: string[];
  // EVERY input key the action declares — including the ones this pass could
  // not ask about (a row reference with no candidate rows). A companion card is
  // aimed by its lead's values for the keys they share, and a follow-up that
  // retrieved nothing must still be able to hand an act across.
  inputs: string[];
};

export type Derived = {
  questions: Record<string, Question>;
  plans: ActionPlan[];
  tone: string;
  // The handoff's own questions, by name: which way the sentence goes, whether
  // it is finished, and one per context pack the principal may read.
  handoff: { route: string; complete: string; packs: Record<string, string> };
};

// ─── decide ──────────────────────────────────────────────────

// One answer, provider-blind: a probability where the provider was calibrated,
// and the fixed stand-ins (see decide.ts) where it was not.
export type Answer =
  | { kind: 'noul'; p: number }
  // `probabilities` only where the provider was calibrated — Enter on a
  // `direct` sentence reads them to pick the likelier of write and plan.
  // `p` is the probability of the pick itself and is what thresholds read.
  // `confidence` is the provider's shape metric — (n·p − 1)/(n − 1) — which is
  // normalised by the number of options: one candidate plus `none` at p = 0.78
  // reads as 0.55 "confidence". Measured on Jev, gating fills on it refused
  // rows the model was nearly four-to-one sure of, and refused them MORE the
  // better retrieval had narrowed the candidates.
  | { kind: 'choice'; choice: string; p: number; confidence: number; probabilities?: Record<string, number> }
  | { kind: 'score'; level: number; confidence: number };

export type Decided = {
  answers: Record<string, Answer>;
  calibrated: boolean;
  model: string;
  requestBytes: number;
  questionCount: number;
  durationMs: number;
  // Did the request ride a connection that was already open? (keep-warm.ts)
  reusedConnection: boolean;
};

// ─── resolve ─────────────────────────────────────────────────

// `hue`: the kit hue of the kind of card it would open (canvas-placement.ts).
export type Chip = { id: string; label: string; p: number; hue: string };

// `direct` is Jev alone. The other three are what the agent is asked to do.
export type Route = 'direct' | 'ask' | 'write' | 'plan';

export type AgentMode = Exclude<Route, 'direct'>;

// What the agent can be run FOR. The three an operator's sentence routes to,
// and one nobody types: `brief` — one line about an event Jev called critical
// (server/watch). It is never a route; a sentence cannot ask for it.
export type RunMode = AgentMode | 'brief';

export type Entity = { table: string; id: string; label: string };

// JEV'S PRE-DECISIONS ABOUT THE SLOW SPEED, read off the same pass as the cards.
// `signature` is what a running agent run is compared against: a newer pass
// that moves it has changed what the run was FOR, and the run is torn down;
// one that leaves it alone lets the run finish.
export type Handoff = {
  route: Route;
  routeP: number;
  // WHO ROUTED IT. `jev` answered the route question. `computed` is the one
  // rule nobody is asked (DESIGN.md § When it runs): Jev said the cards were
  // enough and then had no cards — nothing to mount and nothing worth offering,
  // or a card it wanted and could not aim. Not knowing is a routing decision.
  routedBy: 'jev' | 'computed';
  // Why the computed rule fired, in words for the trace. '' when it did not.
  computedWhy: string;
  // The likeliest of ask, write and plan, whatever `route` says — what Enter
  // runs when Jev thought cards were enough.
  preferred: AgentMode;
  completeP: number;
  packs: { id: string; p: number }[];
  // The top actions by Jev's probability — the only catalog the agent sees.
  narrowed: string[];
  entities: Entity[];
  signature: string;
};

export type Resolved = {
  // Every question canvas is present, empty or not — an absent key would mean
  // "leave it alone", and the loop owns these canvases outright.
  desired: Record<string, Desired[]>;
  chips: Chip[];
  // Every card Jev was asked about, with its probability — what x-ray's story lists.
  scored: { id: string; p: number }[];
  // The few of those the app shows (resolve.ts `suggestedOf`).
  suggested: Chip[];
  tone: 'calm' | 'elevated' | 'critical';
  top: { id: string; p: number }[];
  handoff: Handoff;
};

// ─── the record of a pass ────────────────────────────────────

export type LaneTimings = { parse: number; candidates: number; derive: number; decide: number; resolve: number; reconcile: number };

export type PassRecord = {
  pass: number;
  generation: number;
  text: string;
  questionCount: number;
  questionNames: string[];
  requestBytes: number;
  lanes: LaneTimings;
  totalMs: number;
  // How long the text sat before it was sent: behind the pacer's quiet timer,
  // or behind the pass in flight. Not part of `totalMs` — the pass had not
  // started — and the first thing to look at when the room feels late.
  waitedMs: number;
  // When the pass was sent and when it landed, on the process clock.
  sentAt: number;
  landedAt: number;
  reusedConnection: boolean;
  top: { id: string; p: number }[];
  decider: string;
  calibrated: boolean;
  // False when the line was cleared while the pass was out: it was measured
  // and recorded, and nothing it decided was put on screen.
  applied: boolean;
  // How the sentence read: calm · elevated · critical.
  tone: string;
  notes: string[];
  // Rows the sentence named and took back — removed before Jev was asked.
  superseded: Superseded[];
  handoff: Handoff;
};

// ─── the record of a run ─────────────────────────────────────

export type RunStatus = 'pending' | 'running' | 'landed' | 'aborted' | 'failed' | 'off';

// The slow clock. One of these per agent run, kept beside the pass records so
// the gap between the two speeds is two numbers on one screen.
export type RunRecord = {
  run: number;
  mode: AgentMode;
  startedBy: 'idle' | 'enter';
  routedBy: 'jev' | 'computed' | 'enter';
  signature: string;
  status: RunStatus;
  // Why it failed or was aborted, in a sentence the operator can read.
  reason: string;
  provider: string;
  model: string;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  // False when any step's usage was counted by signal rather than reported by
  // the provider (cortex RunMeta.usage.reported).
  usageReported: boolean;
  // Model calls this run made. One is typical: the facts were already there.
  modelSteps: number;
  outputRetries: number;
  // Which channel carried the envelope — `emit` on Groq, and on the fake.
  strategy: string;
  // The assembled prompt, in characters; the pre-decisions block within it;
  // and how many messages of it were the thread.
  promptChars: number;
  predecisionChars: number;
  threadMessages: number;
  packsSent: string[];
  narrowed: string[];
  // What was looked up, one entry per tool call — the call, never the rows.
  lookups: string[];
  // What the admission rule refused INSIDE the run — the reason the model was
  // handed, one per correction. X-ray's story says it in full.
  refused: string[];
  answer: string;
  // Citations that stood, the notes for those that did not, and the sentences
  // offered as follow-ups.
  claims: number;
  claimsDropped: string[];
  followUps: string[];
  // How often the streaming answer was written to the card, and when.
  answerWrites: number[];
  planSteps: number;
  // Canvases the answer NAMED — the only ones reconciled.
  canvasesNamed: string[];
  cardsMounted: string[];
  cardsClosed: string[];
  fieldsWritten: string[];
};
