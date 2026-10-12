import type { Desired } from '@niscorp/nova';
import { CANVAS_PLACEMENT, COMPANIONS, QUESTION_CANVASES, TILE_HUE, tileOf } from '@encore/app/canvas-placement';
import { CITE_KEY, PLACED_BY, PLACED_FRAGMENT, WHY } from '@encore/app/shell/fragments/placed.fragment';
import type { FestivalClock } from '@encore/lib/festival-clock';
import { NONE } from './derive';
import type { ActionPlan, Answer, CandidateSets, Chip, Derived, Entity, FieldPlan, Handoff, HeldCard, Parsed, Resolved } from './intent.types';

// A half or more is a yes: a calibrated model says "probably" at 0.6 and almost never 0.8.
// A card already up stays until UNMOUNT_AT, so it does not flicker while a sentence is typed.
export const YES_AT = 0.5;
export const UNMOUNT_AT = 0.35;
export const CHIP_AT = 0.3;
export const CHIPS_SHOWN = 3;
export const suggestedOf = (chips: readonly Chip[]): Chip[] => chips.slice(0, CHIPS_SHOWN);

export const NARROWED_MAX = 6;

const TONES = ['calm', 'elevated', 'critical'] as const;

export type ResolveInput = {
  line: string;
  derived: Derived;
  answers: Record<string, Answer>;
  parsed: Parsed;
  clock: FestivalClock;
  mounted: ReadonlySet<string>;
  pinned: ReadonlySet<string>;
  titles: Record<string, string>;
  given?: Record<string, Record<string, unknown>>;
  placers?: Record<string, string>;
  whys?: Record<string, string>;
  candidates?: CandidateSets;
};

export const probabilityOf = (answer: Answer | undefined): number => (answer?.kind === 'noul' ? answer.p : 0);

type Filling = Pick<ResolveInput, 'line' | 'answers' | 'parsed' | 'clock'>;

const parsedValue = (plan: Extract<FieldPlan, { kind: 'parse' }>, input: Filling): string | number | undefined => {
  const { parsed, clock } = input;
  if (plan.parse === 'day') return parsed.day ?? (plan.fallback ? clock.day : undefined);
  if (plan.parse === 'hour') return parsed.hour ?? (plan.fallback ? clock.hour : undefined);
  if (plan.parse === 'time') return parsed.time ?? (plan.fallback ? clock.time : undefined);
  if (plan.parse === 'minutes') return parsed.minutes;
  if (plan.parse === 'amount') return parsed.amount;
  if (plan.parse === 'line') return input.line;
  return undefined;
};

const fieldValue = (plan: FieldPlan, input: Filling): string | number | boolean | undefined => {
  if (plan.kind === 'parse') return parsedValue(plan, input);
  const answer = input.answers[plan.question];
  if (answer === undefined) return undefined;
  if (plan.kind === 'choice') return answer.kind === 'choice' && answer.choice !== NONE && answer.p >= YES_AT ? answer.choice : undefined;
  if (plan.kind === 'boolean') return answer.kind === 'noul' && answer.p >= YES_AT ? true : undefined;
  return answer.kind === 'score' && answer.confidence >= YES_AT ? plan.minimum + answer.level : undefined;
};

// A parsed field the line no longer names returns to the card's blank instead of staying prefilled.
const blanksOf = (plan: ActionPlan, held: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(plan.fields.flatMap((field) => (field.kind === 'parse' && field.parse !== 'line' && held[field.field] === undefined ? [[field.field, field.blank]] : [])));

const listOf = (items: readonly string[]): string => (items.length <= 1 ? (items[0] ?? 'something') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

export const inputOf = (plan: ActionPlan, input: Filling): Record<string, unknown> =>
  Object.fromEntries(plan.fields.flatMap((field) => {
    const value = fieldValue(field, input);
    return value === undefined ? [] : [[field.field, value]];
  }));

const resolveHandoff = (input: ResolveInput, scored: readonly { id: string; p: number }[]): Handoff => {
  const entities: Entity[] = [];
  for (const plan of input.derived.plans) {
    for (const field of plan.fields) {
      if (field.kind !== 'choice' || field.table === undefined) continue;
      const answer = input.answers[field.question];
      if (answer?.kind !== 'choice' || answer.choice === NONE || answer.p < YES_AT) continue;
      if (entities.some((entity) => entity.table === field.table && entity.id === answer.choice)) continue;
      const label = (input.candidates?.[field.table] ?? []).find((row) => row.id === answer.choice)?.label ?? answer.choice;
      entities.push({ table: field.table, id: answer.choice, label });
    }
  }
  const narrowed = [...scored].sort((a, b) => b.p - a.p).slice(0, NARROWED_MAX).map((entry) => entry.id);
  const packs = Object.entries(input.derived.packs).flatMap(([id, question]) => {
    const answer = input.answers[question];
    return answer?.kind === 'noul' && answer.p >= YES_AT ? [{ id, p: Math.round(answer.p * 100) / 100 }] : [];
  });
  return { packs, narrowed, entities };
};

export const resolveScreen = (input: ResolveInput): Resolved => {
  const desired: Record<string, Desired[]> = Object.fromEntries(QUESTION_CANVASES.map((canvas) => [canvas, []]));
  const chips: Chip[] = [];
  const held: HeldCard[] = [];
  const scored: { id: string; p: number }[] = [];

  const openedWith: Record<string, Record<string, unknown>> = {};

  const ordered = [...input.derived.plans.filter((plan) => COMPANIONS[plan.actionId] === undefined), ...input.derived.plans.filter((plan) => COMPANIONS[plan.actionId] !== undefined)];

  for (const plan of ordered) {
    const canvas = CANVAS_PLACEMENT[plan.actionId];
    if (canvas === undefined) continue;
    const p = probabilityOf(input.answers[plan.question]);
    scored.push({ id: plan.actionId, p: Math.round(p * 1000) / 1000 });

    const lead = COMPANIONS[plan.actionId];
    const leadOpenedWith = lead === undefined ? undefined : openedWith[lead];
    const shared = leadOpenedWith === undefined ? {} : Object.fromEntries(plan.inputs.flatMap((key) => (leadOpenedWith[key] === undefined ? [] : [[key, leadOpenedWith[key]]])));
    const seeded = { ...inputOf(plan, input), ...shared, ...(input.given?.[plan.actionId] ?? {}) };
    const aimed = plan.required.every((key) => seeded[key] !== undefined);
    const isPinned = input.pinned.has(plan.actionId);
    const jevWants = input.mounted.has(plan.actionId) ? p > UNMOUNT_AT : p >= YES_AT;
    const wanted = isPinned || jevWants || leadOpenedWith !== undefined;

    const placedBy = input.placers?.[plan.actionId] ?? (!jevWants && leadOpenedWith !== undefined ? `with ${input.titles[lead ?? ''] ?? lead ?? ''}` : `jev ${p.toFixed(2)}`);
    if (wanted && aimed) {
      openedWith[plan.actionId] = seeded;
      const why =
        input.whys?.[plan.actionId] ??
        (!jevWants && leadOpenedWith !== undefined ? `Opened beside “${input.titles[lead ?? ''] ?? 'the form'}”, to show what that would do.` : `Opened because you said “${input.line.trim()}”.`);
      desired[canvas]?.push({ actionId: plan.actionId, input: { ...blanksOf(plan, seeded), ...seeded, ...tileOf(plan.actionId, canvas), [PLACED_BY]: placedBy, [CITE_KEY]: plan.actionId, [WHY]: why }, with: [PLACED_FRAGMENT] });
    } else {
      const missing = plan.required.filter((key) => seeded[key] === undefined).map((key) => ({ key, ...(plan.needs[key] ?? { noun: key }) }));
      const leadTitle = input.titles[lead ?? ''] ?? lead ?? '';
      if (p >= YES_AT || jevWants) {
        const reason = lead !== undefined && leadOpenedWith === undefined ? `not shown — it shows what “${leadTitle}” would do, and that form is not open` : `not shown — it needs ${listOf(missing.map((need) => need.noun))}, and the sentence names none`;
        // A companion is aimed by its lead and by nothing else, so it asks for none.
        held.push({ id: plan.actionId, p: Math.round(p * 1000) / 1000, reason, needs: lead !== undefined ? [] : missing });
      }
    }
    if (!(wanted && aimed) && (wanted || p >= CHIP_AT)) chips.push({ id: plan.actionId, label: input.titles[plan.actionId] ?? plan.actionId, p: Math.round(p * 100) / 100, hue: tileOf(plan.actionId, canvas)[TILE_HUE] ?? '' });
  }

  const tone = input.answers[input.derived.tone];
  return {
    desired,
    chips: chips.sort((a, b) => b.p - a.p),
    suggested: suggestedOf([...chips].sort((a, b) => b.p - a.p)),
    held: held.map((card) => ({ ...card, reason: `${card.reason}; ${suggestedOf([...chips].sort((a, b) => b.p - a.p)).some((chip) => chip.id === card.id) ? 'offered as a suggestion instead' : `not among the ${CHIPS_SHOWN} suggestions either`}` })),
    scored: [...scored].sort((a, b) => b.p - a.p),
    tone: tone?.kind === 'score' ? (TONES[tone.level] ?? 'calm') : 'calm',
    top: [...scored].sort((a, b) => b.p - a.p).slice(0, 6),
    handoff: resolveHandoff(input, scored),
  };
};
