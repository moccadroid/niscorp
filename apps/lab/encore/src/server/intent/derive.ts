import { REF_TABLES } from '@encore/app/vex/ref-tables';
import type { ActionDefinition } from '@niscorp/nova';
import type { ContextPack } from '@encore/app/vex/context-packs';
import type { Question } from '@niscorp/signal';
import { inputContractOf } from './input-contract';
import type { InputField } from './input-contract';
import type { ActionPlan, CandidateSets, Derived, FieldPlan } from './intent.types';

export const TONE_QUESTION = 'frame/tone';
export const packQuestionName = (packId: string): string => `context/${packId}`;
export const NONE = 'none';

export const actionQuestionName = (actionId: string): string => `action/${actionId}`;
export const inputQuestionName = (actionId: string, field: string): string => `input/${actionId}/${field}`;

// The System One wire caps a choice at 255 options.
const MAX_CHOICE_OPTIONS = 255;
const MAX_SCORE_LEVELS = 10;

const BELONGS = 'Does this card belong on screen for what the operator is saying?';
const UNRELATED = 'It has nothing to do with what they are saying.';
const NOT_SAID = 'Not said, or none of these.';
// An operator names a row by its role, and a model offered "not said" answers that no row was
// said: a row reference is asked as a question, and its way out is "none of these is meant".
const WHICH_ROW = 'Which of these does the operator mean? Naming it, or describing it by its role, kind or place, both count.';
const NONE_MEANT = 'The operator means none of these.';

const isInteger = (field: InputField): boolean => field.type === 'integer' || field.type === 'number';

const choiceOver = (instructions: string, options: readonly (readonly [string, string])[], none: string = NOT_SAID): Question => ({
  type: 'choice',
  instructions,
  criteria: Object.fromEntries([...options.slice(0, MAX_CHOICE_OPTIONS - 1), [NONE, none]]),
});

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

const NEEDS_CONTEXT = 'Would answering this well need these facts?';
const NOT_NEEDED = 'These facts have no bearing on it.';

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

const needOf = (field: InputField): { noun: string; table?: string } => {
  const table = field.ref === undefined ? undefined : REF_TABLES[field.ref];
  if (field.ref !== undefined && table !== undefined) return { noun: table.noun, table: field.ref };
  const words = (field.description ?? field.name).split(/[.;—(]/)[0]?.trim() ?? field.name;
  return { noun: words === '' ? field.name : `${words.charAt(0).toLowerCase()}${words.slice(1)}` };
};

const blankOf = (definition: ActionDefinition, field: string): string | number | boolean => {
  const held = definition.data?.[field];
  return typeof held === 'string' || typeof held === 'number' || typeof held === 'boolean' ? held : '';
};

export const deriveQuestions = (definitions: readonly ActionDefinition[], candidates: CandidateSets, packs: readonly ContextPack[] = [], about: DeriveAbout = 'sentence'): Derived => {
  const questions: Record<string, Question> = {};
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
    return { questions, plans, tone: EVENT_URGENCY, packs: {} };
  }

  questions[TONE_QUESTION] = {
    type: 'score',
    instructions: 'How urgent is the situation the operator is describing?',
    criteria: ['calm — routine', 'elevated — needs attention soon', 'critical — immediate danger'],
  };

  for (const pack of packs) questions[packQuestionName(pack.id)] = { type: 'noul', instructions: NEEDS_CONTEXT, criteria: { true: pack.description, false: NOT_NEEDED } };

  return {
    questions,
    plans,
    tone: TONE_QUESTION,
    packs: Object.fromEntries(packs.map((pack) => [pack.id, packQuestionName(pack.id)])),
  };
};
