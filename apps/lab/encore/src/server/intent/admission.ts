import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { CANVAS_PLACEMENT } from '@encore/app/canvas-placement';
import type { QuestionCanvas } from '@encore/app/canvas-placement';
import { ANSWER_MAX_CHARS, ANSWER_MAX_SENTENCES, FOLLOW_UPS_MAX, RECITE_MAX } from '@encore/server/agent/contract';
import { inputContractOf } from './input-contract';
import type { InputField } from './input-contract';
import type { CandidateSets } from './intent.types';

// ═══════════════════════════════════════════════════════════
// THE ADMISSION RULE — may this card go up, opened with this? ONE rule, ONE
// file. A chip the operator clicks, a plan step they press and a card the
// agent's answer names all pass through `admit`, and nothing mounts that did
// not. A second copy of this rule anywhere is a defect: three doors with three
// slightly different locks is how an action a principal does not hold ends up
// on their screen through the door nobody re-read.
//
// A card is admitted when
//
//   · its action is in `allowed` — for the operator's own click, everything
//     they hold; for the agent, only the few actions Jev narrowed the catalog
//     to for this sentence;
//   · the placement map gives it a canvas — and, if the caller named one, the
//     SAME one: a card's position is a fact about the action, never a choice;
//   · its input is that action's own contract, field for field, with every row
//     reference one of the candidate rows Jev was offered in this pass — rows
//     read under the caller's policy, so a row they cannot see cannot be named.
//
// The input contract is rebuilt as zod here, so "an action outside the list",
// "a row that was not offered" and "an input that does not fit" are one kind of
// failure with one kind of message.
//
// `admitAnswer` is the same rule over a whole agent answer, and it is called
// TWICE with the same arguments: inside the run, where a refusal goes back to
// the model as a correction while its tools are still warm, and when the answer
// lands, where a refusal rejects it WHOLE. One function, so the two can never
// disagree about what is allowed.
//
// Optional fields are `.nullish()`: models say null for "absent" (STYLE_GUIDE,
// model-boundary schemas). Nulls are dropped before anything is opened.
// ═══════════════════════════════════════════════════════════

export type AdmissionContext = {
  allowed: ReadonlySet<string>;
  definitions: Record<string, ActionDefinition>;
  candidates: CandidateSets;
};

export type AdmittedCard = { actionId: string; canvas: QuestionCanvas; input: Record<string, unknown> };

export type Admitted = ({ ok: true } & AdmittedCard) | { ok: false; reason: string };

export type AdmitOptions = {
  // The canvas the caller put the card on. A card has ONE place; naming
  // another is a refusal, not a suggestion.
  canvas?: string;
  // A chip is opened with nothing — the operator asked for the card, and Jev
  // fills it on the next pass — so its required inputs are not required YET.
  // Everything a model opens is held to them: an empty record card is a box.
  partial?: boolean;
};

const enumOf = (values: readonly string[]): z.ZodType | undefined => {
  const [first, ...rest] = values;
  return first === undefined ? undefined : z.enum([first, ...rest]);
};

// One input field as it may be filled — or undefined for a field that cannot
// be: a row reference with no candidate rows this pass.
const fieldSchema = (field: InputField, candidates: CandidateSets): z.ZodType | undefined => {
  if (field.ref !== undefined) return enumOf((candidates[field.ref] ?? []).map((row) => row.id));
  if (field.enum !== undefined) return enumOf(field.enum);
  if (field.type === 'boolean') return z.boolean();
  if (field.type === 'integer' || field.type === 'number') {
    const base = field.type === 'integer' ? z.number().int() : z.number();
    const lower = field.minimum === undefined ? base : base.min(field.minimum);
    return field.maximum === undefined ? lower : lower.max(field.maximum);
  }
  if (field.type === 'string') return field.parse === 'time' ? z.string().regex(/^\d{2}:\d{2}$/) : z.string();
  return undefined;
};

export const inputSchemaFor = (definition: ActionDefinition, candidates: CandidateSets, partial = false): z.ZodType<Record<string, unknown>> => {
  const contract = inputContractOf(definition);
  const shape: Record<string, z.ZodType> = {};
  for (const field of contract.fields) {
    const schema = fieldSchema(field, candidates);
    if (schema === undefined) continue;
    shape[field.name] = contract.required.includes(field.name) && !partial ? schema : schema.nullish();
  }
  return z.strictObject(shape);
};

// Nulls are how a model says "absent"; nothing downstream wants them.
const withoutNulls = (input: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null && value !== undefined));

export const admit = (context: AdmissionContext, actionId: string, input: Record<string, unknown>, options: AdmitOptions = {}): Admitted => {
  const definition = context.definitions[actionId];
  if (definition === undefined || !context.allowed.has(actionId)) return { ok: false, reason: `"${actionId}" is not an action that may be opened here — use an id from ACTIONS` };
  const canvas = CANVAS_PLACEMENT[actionId];
  if (canvas === undefined) return { ok: false, reason: `"${actionId}" has no place in the room` };
  if (options.canvas !== undefined && options.canvas !== canvas) return { ok: false, reason: `"${actionId}" belongs on "${canvas}", not on "${options.canvas}"` };

  const parsed = inputSchemaFor(definition, context.candidates, options.partial === true).safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: `"${actionId}" cannot be opened with that input: ${issue === undefined ? 'it does not fit' : `${issue.path.join('.') || 'input'} — ${issue.message}`}` };
  }
  return { ok: true, actionId, canvas, input: withoutNulls(parsed.data) };
};

// ─── a whole answer ─────────────────────────────────────────

// The `data` half of the agent's envelope, as far as admission cares. Typed by
// shape so this file does not depend on the agent's contract — the dependency
// runs the other way.
export type AnswerShape = {
  claims?: readonly { text: string; card: string; row?: string | null | undefined }[] | null | undefined;
  followUps?: readonly string[] | null | undefined;
  canvases?: Record<string, readonly { actionId: string; input: Record<string, unknown> }[] | null | undefined> | null | undefined;
  fields?: readonly { card: string; field: string; text: string }[] | null | undefined;
  steps?: readonly { say: string; actionId: string; input: Record<string, unknown> }[] | null | undefined;
};

export type WritableField = { card: string; field: string };

export type AnswerContext = AdmissionContext & {
  // The free-text fields this run was offered. Nothing else may be written.
  writable: readonly WritableField[];
  // CITATIONS. The cards on screen right now — a claim may stand on one of
  // these, or on a card this same answer places — and, per card, the row ids it
  // is showing. Absent = nothing is on screen and no row is known.
  onScreen?: ReadonlySet<string>;
  rowsOn?: (card: string) => ReadonlySet<string>;
  // THE NAMES A CARD IS SHOWING — acts on the running order, incidents on the
  // feed. What an answer must not read back to somebody who can see them.
  namesOn?: (card: string) => readonly string[];
  // WHAT THIS THREAD HAS ALREADY ASKED OR BEEN OFFERED, this sentence included.
  // A follow-up that repeats one is dropped: "what are our options?" under every
  // answer is furniture, not a suggestion.
  asked?: readonly string[];
};

export type AdmittedClaim = { text: string; card: string; row: string };

// (The bounds — two sentences, no recital, two follow-ups — are the contract's:
// agent/contract.ts. They are enforced here.)

// A sentence ends at . ! or ? followed by a space and a capital or a quote — or
// by the end. "21.00", "4.5 k" and "e.g. this" do not end one.
export const sentencesOf = (text: string): string[] =>
  text
    .trim()
    .split(/(?<=[.!?])["”’)]?\s+(?=["“‘(]?[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '');

const normal = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const FOLLOW_UP_MAX_CHARS = 60;

export type AdmittedAnswer =
  | {
      ok: true;
      // ONLY the canvases the answer named, each as its complete state.
      canvases: Record<string, AdmittedCard[]>;
      fields: { card: string; field: string; text: string }[];
      steps: { say: string; card: AdmittedCard }[];
      // What survived of the citations and the follow-ups, and — in words — what
      // did not. A BAD CITATION IS DROPPED, NOT FATAL: a wrong card, row or input
      // would put the wrong thing on screen and rejects the answer whole; a
      // citation that points nowhere only fails to light something, and costs
      // the operator the answer if it is treated the same way.
      claims: AdmittedClaim[];
      followUps: string[];
      notes: string[];
    }
  | { ok: false; reasons: string[] };

// Every candidate row id of the pass, whatever its table: a claim's row may be
// any row the conversation has put on the table.
const candidateIds = (candidates: CandidateSets): Set<string> => new Set(Object.values(candidates).flatMap((rows) => rows.map((row) => row.id)));

const admitClaims = (context: AnswerContext, answer: AnswerShape, response: string, placed: ReadonlySet<string>): { claims: AdmittedClaim[]; notes: string[] } => {
  const claims: AdmittedClaim[] = [];
  const notes: string[] = [];
  const known = candidateIds(context.candidates);
  for (const claim of answer.claims ?? []) {
    const quoted = claim.text.length > 40 ? `${claim.text.slice(0, 40)}…` : claim.text;
    if (!response.includes(claim.text)) notes.push(`a citation was dropped: "${quoted}" is not in the answer`);
    else if (context.onScreen?.has(claim.card) !== true && !placed.has(claim.card)) notes.push(`a citation was dropped: "${claim.card}" is not on screen`);
    else {
      const row = claim.row ?? '';
      const isKnown = row === '' || known.has(row) || context.rowsOn?.(claim.card).has(row) === true;
      // The WORDS still stand on the card; only the row was wrong.
      if (!isKnown) notes.push(`a citation kept its card and lost its row: "${row}" is not a row of ${claim.card}`);
      claims.push({ text: claim.text, card: claim.card, row: isKnown ? row : '' });
    }
  }
  return { claims, notes };
};

// Too long, or reading a card back. Reasons are written FOR THE MODEL: cortex
// hands them to it as the correction, and it gets to try again.
const wordReasons = (context: AnswerContext, response: string): string[] => {
  const reasons: string[] = [];
  const sentences = sentencesOf(response);
  if (sentences.length > ANSWER_MAX_SENTENCES) reasons.push(`response: ${sentences.length} sentences — at most ${ANSWER_MAX_SENTENCES}. Say what matters, not everything`);
  if (response.trim().length > ANSWER_MAX_CHARS) reasons.push(`response: ${response.trim().length} characters — at most ${ANSWER_MAX_CHARS}`);
  const said = normal(response);
  for (const card of context.onScreen ?? []) {
    const recited = [...new Set((context.namesOn?.(card) ?? []).filter((name) => normal(name).length >= 4 && said.includes(normal(name))))];
    if (recited.length > RECITE_MAX) reasons.push(`response: it reads "${card}" back to somebody who is looking at it (${recited.slice(0, 4).join(', ')}…). Never restate what a card on screen shows — say what matters, what connects the cards, or what is on none of them; if the cards are the whole answer, say so in one short sentence`);
  }
  return reasons;
};

const admitFollowUps = (context: AnswerContext, answer: AnswerShape): { followUps: string[]; notes: string[] } => {
  const notes: string[] = [];
  const followUps: string[] = [];
  const before = new Set((context.asked ?? []).map(normal));
  for (const raw of answer.followUps ?? []) {
    const sentence = raw.trim();
    if (sentence === '' || followUps.some((held) => normal(held) === normal(sentence))) continue;
    if (before.has(normal(sentence))) notes.push(`a follow-up was dropped: "${sentence}" was already asked or offered in this thread`);
    else if (sentence.length > FOLLOW_UP_MAX_CHARS) notes.push(`a follow-up was dropped: over ${FOLLOW_UP_MAX_CHARS} characters`);
    else if (followUps.length < FOLLOW_UPS_MAX) followUps.push(sentence);
  }
  return { followUps, notes };
};

export const admitAnswer = (context: AnswerContext, answer: AnswerShape, response = ''): AdmittedAnswer => {
  const reasons: string[] = [];
  const canvases: Record<string, AdmittedCard[]> = {};
  const fields: { card: string; field: string; text: string }[] = [];
  const steps: { say: string; card: AdmittedCard }[] = [];

  for (const [canvas, cards] of Object.entries(answer.canvases ?? {})) {
    // null and absent both mean "I did not name this canvas".
    if (cards === null || cards === undefined) continue;
    const state: AdmittedCard[] = [];
    for (const card of cards) {
      const admitted = admit(context, card.actionId, card.input, { canvas });
      if (!admitted.ok) reasons.push(admitted.reason);
      else if (state.some((held) => held.actionId === admitted.actionId)) reasons.push(`"${card.actionId}" is listed twice on "${canvas}"`);
      else state.push({ actionId: admitted.actionId, canvas: admitted.canvas, input: admitted.input });
    }
    canvases[canvas] = state;
  }

  for (const entry of answer.fields ?? []) {
    if (!context.writable.some((target) => target.card === entry.card && target.field === entry.field)) reasons.push(`"${entry.card}.${entry.field}" is not a field listed under WRITABLE`);
    else if (fields.some((held) => held.card === entry.card && held.field === entry.field)) reasons.push(`"${entry.card}.${entry.field}" is written twice`);
    else fields.push({ card: entry.card, field: entry.field, text: entry.text });
  }

  for (const step of answer.steps ?? []) {
    const admitted = admit(context, step.actionId, step.input);
    if (!admitted.ok) reasons.push(`step "${step.say}": ${admitted.reason}`);
    else steps.push({ say: step.say, card: { actionId: admitted.actionId, canvas: admitted.canvas, input: admitted.input } });
  }

  // THE WORDS. Only an answer that HAS words is judged on them: the in-run check
  // sees every attempt, and the landing sees the last.
  if (response.trim() !== '') reasons.push(...wordReasons(context, response));

  if (reasons.length > 0) return { ok: false, reasons };
  const placed = new Set(Object.values(canvases).flatMap((cards) => cards.map((card) => card.actionId)));
  const cited = admitClaims(context, answer, response, placed);
  const next = admitFollowUps(context, answer);
  return { ok: true, canvases, fields, steps, claims: cited.claims, followUps: next.followUps, notes: [...cited.notes, ...next.notes] };
};
