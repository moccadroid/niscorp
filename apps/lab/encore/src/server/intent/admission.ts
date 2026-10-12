import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { CANVAS_PLACEMENT } from '@encore/app/canvas-placement';
import type { QuestionCanvas } from '@encore/app/canvas-placement';
import { ANSWER_MAX_CHARS, ANSWER_MAX_SENTENCES, FOLLOW_UPS_MAX } from '@encore/server/agent/contract';
import { inputContractOf } from './input-contract';
import type { InputField } from './input-contract';
import type { CandidateSets } from './intent.types';

export type AdmissionContext = {
  allowed: ReadonlySet<string>;
  definitions: Record<string, ActionDefinition>;
  candidates: CandidateSets;
};

export type AdmittedCard = { actionId: string; canvas: QuestionCanvas; input: Record<string, unknown> };

export type Admitted = ({ ok: true } & AdmittedCard) | { ok: false; reason: string };

export type AdmitOptions = {
  canvas?: string;
  // For a chip: it opens empty and is filled on the next pass. A model's card needs its required inputs.
  partial?: boolean;
};

const enumOf = (values: readonly string[]): z.ZodType | undefined => {
  const [first, ...rest] = values;
  return first === undefined ? undefined : z.enum([first, ...rest]);
};

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

export type AnswerShape = {
  claims?: readonly { text: string; card: string; row?: string | null | undefined }[] | null | undefined;
  followUps?: readonly string[] | null | undefined;
  canvases?: Record<string, readonly { actionId: string; input: Record<string, unknown> }[] | null | undefined> | null | undefined;
  fields?: readonly { card: string; field: string; text: string }[] | null | undefined;
  steps?: readonly { say: string; actionId: string; input: Record<string, unknown> }[] | null | undefined;
};

export type WritableField = { card: string; field: string };

export type AnswerContext = AdmissionContext & {
  writable: readonly WritableField[];
  onScreen?: ReadonlySet<string>;
  rowsOn?: (card: string) => ReadonlySet<string>;
  asked?: readonly string[];
};

export type AdmittedClaim = { text: string; card: string; row: string };

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
      canvases: Record<string, AdmittedCard[]>;
      fields: { card: string; field: string; text: string }[];
      steps: { say: string; card: AdmittedCard }[];
      // A bad citation is dropped, not fatal: it only fails to light something, where a wrong
      // card, row or input would put the wrong thing on screen.
      claims: AdmittedClaim[];
      followUps: string[];
      notes: string[];
    }
  | { ok: false; reasons: string[] };

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
      if (!isKnown) notes.push(`a citation kept its card and lost its row: "${row}" is not a row of ${claim.card}`);
      claims.push({ text: claim.text, card: claim.card, row: isKnown ? row : '' });
    }
  }
  return { claims, notes };
};

const wordReasons = (response: string): string[] => {
  const reasons: string[] = [];
  const sentences = sentencesOf(response);
  if (sentences.length > ANSWER_MAX_SENTENCES) reasons.push(`response: ${sentences.length} sentences — at most ${ANSWER_MAX_SENTENCES}. Say what matters, not everything`);
  if (response.trim().length > ANSWER_MAX_CHARS) reasons.push(`response: ${response.trim().length} characters — at most ${ANSWER_MAX_CHARS}`);
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

  if (response.trim() !== '') reasons.push(...wordReasons(response));

  if (reasons.length > 0) return { ok: false, reasons };
  const placed = new Set(Object.values(canvases).flatMap((cards) => cards.map((card) => card.actionId)));
  const cited = admitClaims(context, answer, response, placed);
  const next = admitFollowUps(context, answer);
  return { ok: true, canvases, fields, steps, claims: cited.claims, followUps: next.followUps, notes: [...cited.notes, ...next.notes] };
};
