import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { CANVAS_PLACEMENT } from '@encore/app/canvas-placement';
import { inputContractOf } from '@encore/server/intent/input-contract';
import type { InputField } from '@encore/server/intent/input-contract';
import type { CandidateSets, Entity } from '@encore/server/intent/intent.types';

// ═══════════════════════════════════════════════════════════
// JEV'S PRE-DECISIONS — the one dynamic block of a run.
//
// Three hundred milliseconds before the agent starts, the fast model has
// already done the expensive part of an assistant's turn: ranked the catalog,
// resolved the rows the sentence names, chosen which facts matter and read
// them. This is that work, handed over — so a typical run is ONE model step,
// and the catalog index Midas wrote down that it could not build is simply the
// pass that already ran (DESIGN.md § What was studied first).
//
// It travels as a system message BETWEEN the thread and the operator's line,
// not as a producer: everything ahead of it (identity, contract, the room, the
// conversation so far) is then a stable prefix a provider can cache, and the
// only bytes that change sit at the end.
//
// SCREEN carries what each card is AIMED AT, read off its live data — which for
// a form is what it currently holds, hand edits included. That is how words are
// written FROM the form beside them: "tell everyone" next to a swap form holding
// Nova Kestrel → The Tent, 21:00 is a push about that move, and the agent is
// told the move rather than left to re-read the sentence.
//
// ACTIONS ARE ONE LINE EACH, not JSON Schema. Six schemas were most of the
// slice-1b payload; a line carries what choosing needs — the id, where it
// lands, what it is for, and its input keys with the shape of each in a word.
// What may actually be opened is enforced by the admission rule, not taught
// by a schema dump.
// ═══════════════════════════════════════════════════════════

export const PREDECISIONS_HEADING = 'THIS TURN — decided before you were called (JSON):';

export const PredecisionsSchema = z.object({
  mode: z.enum(['ask', 'write', 'plan', 'brief']),
  sentence: z.string(),
  heard: z.record(z.string(), z.union([z.string(), z.number()])),
  now: z.object({ day: z.string(), time: z.string() }),
  // RESOLVED: rows the fast model is sure the sentence names.
  resolved: z.array(z.object({ table: z.string(), id: z.string(), label: z.string() })),
  // ROWS: every row that may be named this turn, per table, as "id = label".
  rows: z.record(z.string(), z.array(z.string())),
  // ACTIONS: the few the fast model ranked highest, one line each.
  actions: z.array(z.string()),
  // FACTS: the rows of the context packs the fast model asked for.
  facts: z.record(z.string(), z.unknown()),
  // SCREEN: what is up right now, and what each card is aimed at.
  screen: z.array(z.object({ canvas: z.string(), card: z.string(), aimedAt: z.record(z.string(), z.unknown()) })),
  // WRITABLE: free-text fields you may author — what each is for, and what it
  // holds now.
  writable: z.array(z.object({ card: z.string(), field: z.string(), for: z.string(), holds: z.string() })),
  // WANTED: cards the fast model wanted on screen and could NOT aim — what each
  // needs, in words. If FACTS or a lookup settles it, you may aim the card.
  wanted: z.array(z.string()).default([]),
  // ASKED: what this thread has already asked or been offered as a follow-up.
  // A follow-up that repeats one of these is dropped.
  asked: z.array(z.string()).default([]),
});

export type Predecisions = z.infer<typeof PredecisionsSchema>;

// The shape of one input key, in a word. Enough to fill it; not a schema.
const shapeOf = (field: InputField): string => {
  if (field.ref !== undefined) return `row:${field.ref}`;
  if (field.enum !== undefined) return field.enum.join('|');
  if (field.type === 'boolean') return 'true|false';
  if (field.minimum !== undefined && field.maximum !== undefined) return `${field.minimum}-${field.maximum}`;
  if (field.parse === 'time') return 'HH:MM';
  return field.type ?? 'text';
};

// `*` marks a key the card cannot be opened without.
export const actionLine = (definition: ActionDefinition): string => {
  const contract = inputContractOf(definition);
  const keys = contract.fields.map((field) => `${field.name}${contract.required.includes(field.name) ? '*' : ''}(${shapeOf(field)})`);
  return `${definition.id} [${CANVAS_PLACEMENT[definition.id] ?? 'nowhere'}] ${definition.title ?? definition.id} — ${definition.description ?? ''}${keys.length === 0 ? '' : ` · input: ${keys.join(', ')}`}`;
};

export const rowLines = (candidates: CandidateSets): Record<string, string[]> => Object.fromEntries(Object.entries(candidates).filter(([, rows]) => rows.length > 0).map(([table, rows]) => [table, rows.map((row) => `${row.id} = ${row.label}`)]));

export const resolvedRows = (entities: readonly Entity[]): Predecisions['resolved'] => entities.map((entity) => ({ table: entity.table, id: entity.id, label: entity.label }));

// Minified: the model reads it exactly as well, and it is paid for per call.
export const predecisionsBlock = (predecisions: Predecisions): string => `${PREDECISIONS_HEADING}\n${JSON.stringify(predecisions)}`;

// For the scripted model, which has to read the block back out of a request.
export const predecisionsIn = (content: string): Predecisions | undefined => {
  if (!content.startsWith(PREDECISIONS_HEADING)) return undefined;
  try {
    const parsed = PredecisionsSchema.safeParse(JSON.parse(content.slice(PREDECISIONS_HEADING.length)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};
