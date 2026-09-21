import { REF_TABLES } from '@encore/app/vex/ref-tables';
import type { ActionDefinition } from '@niscorp/nova';
import type { ContextPack } from '@encore/app/vex/context-packs';
import type { Question } from '@niscorp/signal';
import { inputContractOf } from './input-contract';
import type { InputField } from './input-contract';
import type { ActionPlan, CandidateSets, Derived, FieldPlan } from './intent.types';

// LANE 3 — DERIVE. The catalog becomes the decision tree.
//
// Nobody wrote these questions. They are read off the definitions the
// principal HOLDS — ring 1, already resolved by moss — so the set of things the
// model can be asked is exactly the set of things this person's shell can do:
//
//   the action itself      → one `noul`: does this card belong on screen?
//   an enum field          → a `choice` over its values
//   a boolean field        → a `noul`
//   a bounded integer      → a `score`, one level per step
//   a row reference (ref)  → a `choice` over that table's candidate rows
//   a parsed field         → NOT a question. Days, hours and minutes are read
//                            from the sentence, never judged from it.
//
// and, since Slice 1b, the three kinds that decide the SLOW path in the same
// breath — the handoff is Jev's decision, not a second call's:
//
//   handoff/route          → a `choice`: direct, write or plan
//   handoff/complete       → a `noul`: is the thought finished?
//   context/<pack>         → a `noul` per context pack the principal may read
//
// Every choice carries `none`. An input is optional and "they did not say" is
// the commonest true answer; a model with no way to say it picks something.
//
// Add an action to the catalog and grant it, and the room can open it. That is
// the claim, and this file is where it is either true or not.

export const TONE_QUESTION = 'frame/tone';
export const ROUTE_QUESTION = 'handoff/route';
export const COMPLETE_QUESTION = 'handoff/complete';
export const packQuestionName = (packId: string): string => `context/${packId}`;
export const NONE = 'none';

export const actionQuestionName = (actionId: string): string => `action/${actionId}`;
export const inputQuestionName = (actionId: string, field: string): string => `input/${actionId}/${field}`;

// The System One wire caps a choice at 255 options. Slice 1 truncates rather
// than shards: candidate lists are 8 long, so this is a guard, not a path.
const MAX_CHOICE_OPTIONS = 255;
// A `score` is a distribution over its levels. Past a handful of steps it
// stops being a judgement and becomes a number, which belongs to the parser.
const MAX_SCORE_LEVELS = 10;

const BELONGS = 'Does this card belong on screen for what the operator is saying?';
const UNRELATED = 'It has nothing to do with what they are saying.';
const NOT_SAID = 'Not said, or none of these.';
// A ROW IS RARELY NAMED. An operator says "the headliner", "the covered stage",
// "the north gate" — a role, not a name — and a model asked only for "the act
// this is about" against "not said" answers, correctly, that no act was said.
// Measured on Jev: the same single candidate scored 24% under the bare field
// description and 62% where the wording happened to read as a question. So a
// row reference is ASKED, says that a description counts, and its way out is
// "none of these is meant" rather than "not said".
const WHICH_ROW = 'Which of these does the operator mean? Naming it, or describing it by its role, kind or place, both count.';
const NONE_MEANT = 'The operator means none of these.';

const isInteger = (field: InputField): boolean => field.type === 'integer' || field.type === 'number';

const choiceOver = (instructions: string, options: readonly (readonly [string, string])[], none: string = NOT_SAID): Question => ({
  type: 'choice',
  instructions,
  criteria: Object.fromEntries([...options.slice(0, MAX_CHOICE_OPTIONS - 1), [NONE, none]]),
});

// The question a field emits — or none, for a field the model has no business
// filling (free text) or no rows to fill it from.
const questionOf = (field: InputField, candidates: CandidateSets): { question: Question; minimum: number } | undefined => {
  const instructions = field.description ?? field.name;

  if (field.ref !== undefined) {
    const rows = candidates[field.ref] ?? [];
    if (rows.length === 0) return undefined;
    return { question: choiceOver(`${instructions} ${WHICH_ROW}`, rows.map((row) => [row.id, row.label]), NONE_MEANT), minimum: 0 };
  }
  if (field.enum !== undefined) return { question: choiceOver(instructions, field.enum.map((value) => [value, value])), minimum: 0 };
  if (field.type === 'boolean') return { question: { type: 'noul', instructions }, minimum: 0 };
  if (isInteger(field) && field.minimum !== undefined && field.maximum !== undefined) {
    const steps = field.maximum - field.minimum + 1;
    if (steps < 2 || steps > MAX_SCORE_LEVELS) return undefined;
    const levels = field.levels?.length === steps ? field.levels : Array.from({ length: steps }, (_, step) => String(field.minimum === undefined ? step : field.minimum + step));
    return { question: { type: 'score', instructions, criteria: levels }, minimum: field.minimum };
  }
  return undefined;
};

// THE HANDOFF IS JEV'S DECISION, asked in the same pass as everything else.
// `direct` is listed first on purpose: it is the fallback, and most sentences
// are. There is no `none` — a sentence goes one of four ways.
//
// `ask` is the one that is easy to over-use, so its criterion says what it is
// NOT: a question a card answers by being opened is `direct`. "How full is the
// tent" wants a gauge, not a paragraph.
const ROUTE: Question = {
  type: 'choice',
  instructions: 'What does this sentence need beyond the cards that answer it?',
  criteria: {
    direct: 'Nothing more — opening and filling the right cards is the whole answer.',
    ask: 'An answer in words: a question about what is happening or what is true, that no single card answers by being opened.',
    write: 'Words for other people: a message or a text has to be composed for them to read.',
    plan: 'Reasoning: an open question about what to do, needing facts weighed and steps proposed.',
  },
};

const COMPLETE: Question = {
  type: 'noul',
  instructions: 'Is what the operator typed a finished thought, rather than one still being typed?',
  criteria: { true: 'It reads as a whole sentence or instruction.', false: 'It stops mid-word or mid-phrase.' },
};

const NEEDS_CONTEXT = 'Would answering this well need these facts?';
const NOT_NEEDED = 'These facts have no bearing on it.';

// THE SAME DERIVATION, ABOUT AN EVENT (scene 4). The state is a thing that
// happened instead of a thing somebody typed, so the per-card question is asked
// about that — and the frame's and the handoff's questions, which are about a
// SENTENCE (how urgent is what they describe, is the thought finished, does it
// want words), are not asked at all. The event's own three ride instead.
const BELONGS_FOR_EVENT = 'Does this card belong on screen for this event?';
const UNRELATED_TO_EVENT = 'It has nothing to do with what happened.';

export const EVENT_URGENCY = 'event/urgency';
export const EVENT_INTERRUPT = 'event/interrupt';
export const EVENT_AUDIENCE = 'event/audience';

const EVENT_QUESTIONS: Record<string, Question> = {
  [EVENT_URGENCY]: { type: 'score', instructions: 'How urgent is this event?', criteria: ['routine — nothing to do', 'warning — needs attention soon', 'critical — immediate danger'] },
  [EVENT_INTERRUPT]: {
    type: 'noul',
    instructions: 'Is this worth the eyes of the operator right now?',
    criteria: { true: 'It is a warning or a critical reading — something failing, somebody hurt, a place overcrowded — and somebody should look.', false: 'It is routine: the festival doing what it does.' },
  },
  [EVENT_AUDIENCE]: {
    type: 'choice',
    instructions: 'Who should be told about this event, if anyone?',
    criteria: { none: 'Nobody needs telling.', everyone: 'Everyone on site.', crew: 'The crew.', vendors: 'The vendors and traders.' },
  },
};

export type DeriveAbout = 'sentence' | 'event';

// A required input, as an operator would call it: a row of a table by that table's
// noun ("an act"); anything else by the first words of its own description.
const needOf = (field: InputField): { noun: string; table?: string } => {
  const table = field.ref === undefined ? undefined : REF_TABLES[field.ref];
  if (field.ref !== undefined && table !== undefined) return { noun: table.noun, table: field.ref };
  const words = (field.description ?? field.name).split(/[.;—(]/)[0]?.trim() ?? field.name;
  return { noun: words === '' ? field.name : `${words.charAt(0).toLowerCase()}${words.slice(1)}` };
};

// What a card holds for a field when nothing has been said: its own default.
const blankOf = (definition: ActionDefinition, field: string): string | number | boolean => {
  const held = definition.data?.[field];
  return typeof held === 'string' || typeof held === 'number' || typeof held === 'boolean' ? held : '';
};

export const deriveQuestions = (definitions: readonly ActionDefinition[], candidates: CandidateSets, packs: readonly ContextPack[] = [], about: DeriveAbout = 'sentence'): Derived => {
  const questions: Record<string, Question> = {};
  // ONE QUESTION PER DISTINCT QUESTION. Two fields that emit the same words
  // over the same options are one decision — "which act?" is asked once and
  // every card that wants an act reads the one answer. Keyed on the question's
  // own content, so sharing is a consequence of the schemas agreeing, never a
  // list somebody maintains.
  const asked = new Map<string, string>();

  const plans: ActionPlan[] = definitions.map((definition) => {
    const contract = inputContractOf(definition);
    questions[actionQuestionName(definition.id)] = {
      type: 'noul',
      instructions: about === 'event' ? BELONGS_FOR_EVENT : BELONGS,
      criteria: { true: definition.description ?? definition.title ?? definition.id, false: about === 'event' ? UNRELATED_TO_EVENT : UNRELATED },
    };

    const fields: FieldPlan[] = contract.fields.flatMap((field): FieldPlan[] => {
      if (field.parse !== undefined) return [{ field: field.name, kind: 'parse', parse: field.parse, fallback: field.fallback === 'now', blank: blankOf(definition, field.name) }];
      const emitted = questionOf(field, candidates);
      if (emitted === undefined) return [];

      const identity = JSON.stringify(emitted.question);
      const name = asked.get(identity) ?? inputQuestionName(definition.id, field.name);
      if (!asked.has(identity)) {
        asked.set(identity, name);
        questions[name] = emitted.question;
      }
      if (emitted.question.type === 'choice') return [{ field: field.name, kind: 'choice', question: name, ...(field.ref !== undefined ? { table: field.ref } : {}) }];
      if (emitted.question.type === 'noul') return [{ field: field.name, kind: 'boolean', question: name }];
      return [{ field: field.name, kind: 'level', question: name, minimum: emitted.minimum }];
    });

    return { actionId: definition.id, question: actionQuestionName(definition.id), fields, required: contract.required, inputs: contract.fields.map((field) => field.name), needs: Object.fromEntries(contract.fields.filter((field) => contract.required.includes(field.name)).map((field) => [field.name, needOf(field)])) };
  });

  if (about === 'event') {
    Object.assign(questions, EVENT_QUESTIONS);
    return { questions, plans, tone: EVENT_URGENCY, handoff: { route: '', complete: '', packs: {} } };
  }

  // The one question that is about the ROOM rather than a card.
  questions[TONE_QUESTION] = {
    type: 'score',
    instructions: 'How urgent is the situation the operator is describing?',
    criteria: ['calm — routine', 'elevated — needs attention soon', 'critical — immediate danger'],
  };

  // ── the slow path's three kinds of question ────────────────
  // Width is free: route, completeness and one noul per context pack ride the
  // same call as the cards. Asking them costs bytes; asking them LATER would
  // cost a round trip before the text model could even start.
  questions[ROUTE_QUESTION] = ROUTE;
  questions[COMPLETE_QUESTION] = COMPLETE;
  for (const pack of packs) questions[packQuestionName(pack.id)] = { type: 'noul', instructions: NEEDS_CONTEXT, criteria: { true: pack.description, false: NOT_NEEDED } };

  return {
    questions,
    plans,
    tone: TONE_QUESTION,
    handoff: { route: ROUTE_QUESTION, complete: COMPLETE_QUESTION, packs: Object.fromEntries(packs.map((pack) => [pack.id, packQuestionName(pack.id)])) },
  };
};
