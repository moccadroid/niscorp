import type { Question } from '@niscorp/signal';
import type { Desired } from '@niscorp/nova';
import type { Day } from '@encore/lib/festival-clock';

export type Superseded = { table: string; id: string; label: string; by: { id: string; label: string }; marker: string };

export type Parsed = {
  time?: string;
  hour?: number;
  day?: Day;
  minutes?: number;
  amount?: number;
  tokens: string[];
};

export type Candidate = { id: string; label: string };

export type CandidateSets = Record<string, Candidate[]>;

export type FieldPlan =
  | { field: string; kind: 'parse'; parse: string; fallback: boolean; blank: string | number | boolean }
  | { field: string; kind: 'choice'; question: string; table?: string }
  | { field: string; kind: 'boolean'; question: string }
  | { field: string; kind: 'level'; question: string; minimum: number };

export type ActionPlan = {
  actionId: string;
  question: string;
  fields: FieldPlan[];
  required: string[];
  inputs: string[];
  needs: Record<string, { noun: string; table?: string }>;
};

export type Derived = {
  questions: Record<string, Question>;
  plans: ActionPlan[];
  tone: string;
  packs: Record<string, string>;
};

export type Answer =
  | { kind: 'noul'; p: number }
  // Thresholds read `p`. `confidence` is the provider's shape metric, (n·p − 1)/(n − 1): one
  // candidate plus `none` at p = 0.78 reads as 0.55.
  | { kind: 'choice'; choice: string; p: number; confidence: number; probabilities?: Record<string, number> }
  | { kind: 'score'; level: number; confidence: number };

export type Decided = {
  answers: Record<string, Answer>;
  calibrated: boolean;
  model: string;
  requestBytes: number;
  questionCount: number;
  durationMs: number;
  reusedConnection: boolean;
};

export type HeldCard = { id: string; p: number; reason: string; needs: { key: string; noun: string; table?: string }[] };

export type Chip = { id: string; label: string; p: number; hue: string };

export type Entity = { table: string; id: string; label: string };

export type Handoff = {
  packs: { id: string; p: number }[];
  narrowed: string[];
  entities: Entity[];
};

export type Resolved = {
  // Every question canvas is present, empty or not: an absent key would mean "leave it alone".
  desired: Record<string, Desired[]>;
  chips: Chip[];
  scored: { id: string; p: number }[];
  suggested: Chip[];
  held: HeldCard[];
  tone: 'calm' | 'elevated' | 'critical';
  top: { id: string; p: number }[];
  handoff: Handoff;
};

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
  waitedMs: number;
  sentAt: number;
  landedAt: number;
  reusedConnection: boolean;
  top: { id: string; p: number }[];
  decider: string;
  calibrated: boolean;
  applied: boolean;
  held: HeldCard[];
  tone: string;
  notes: string[];
  superseded: Superseded[];
  handoff: Handoff;
};

export type RunStatus = 'running' | 'landed' | 'aborted' | 'failed';

export type RunRecord = {
  run: number;
  text: string;
  startedBy: 'idle' | 'enter';
  status: RunStatus;
  reason: string;
  provider: string;
  model: string;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  usageReported: boolean;
  modelSteps: number;
  outputRetries: number;
  strategy: string;
  promptChars: number;
  predecisionChars: number;
  threadMessages: number;
  packsSent: string[];
  narrowed: string[];
  lookups: string[];
  refused: string[];
  answer: string;
  claims: number;
  claimsDropped: string[];
  followUps: string[];
  answerWrites: number[];
  planSteps: number;
  canvasesNamed: string[];
  cardsMounted: string[];
  cardsAimed: string[];
  cardsClosed: string[];
  fieldsWritten: string[];
};
