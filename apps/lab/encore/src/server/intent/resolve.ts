import type { Desired } from '@niscorp/nova';
import { CANVAS_PLACEMENT, COMPANIONS, QUESTION_CANVASES, TILE_HUE, tileOf } from '@encore/app/canvas-placement';
import { CITE_KEY, PLACED_BY, PLACED_FRAGMENT, WHY } from '@encore/app/shell/fragments/placed.fragment';
import type { FestivalClock } from '@encore/lib/festival-clock';
import { NONE } from './derive';
import type { ActionPlan, Answer, CandidateSets, Chip, Derived, Entity, FieldPlan, Handoff, HeldCard, Parsed, Resolved } from './intent.types';

// LANE 5 — RESOLVE. Probabilities in, a desired screen out. Pure.
//
// ONE THRESHOLD: 0.5 IS YES. Wherever Jev is asked anything — does this card
// belong, which row is meant, would these facts help — a probability of a half or
// more is a yes, and the room acts on it: the card mounts, the field is filled
// with that pick, the pack is read. A calibrated model says "probably" at 0.6 and
// almost never says 0.8; a room that waits for 0.8 waits for ever.
//
// Two other numbers, and no more:
//   0.35  a card already up stays until it falls to here — so it does not flicker
//         while ONE sentence is being typed (the loop scopes this to a sentence)
//   0.30  under the yes line and over this, a card is OFFERED, as a chip
//
// Nothing here commits anything. The most this lane can do is put a filled-in
// form in front of a person.
export const YES_AT = 0.5;
export const UNMOUNT_AT = 0.35;
export const CHIP_AT = 0.3;
// How many chips an operator is offered: the best few, not the whole band.
export const CHIPS_SHOWN = 3;
export const suggestedOf = (chips: readonly Chip[]): Chip[] => chips.slice(0, CHIPS_SHOWN);

// How much of the catalog the assistant sees: Jev's top few, never the lot.
export const NARROWED_MAX = 6;

const TONES = ['calm', 'elevated', 'critical'] as const;

export type ResolveInput = {
  line: string;
  derived: Derived;
  answers: Record<string, Answer>;
  parsed: Parsed;
  clock: FestivalClock;
  // Action ids on the question canvases right now — what hysteresis is
  // relative to.
  mounted: ReadonlySet<string>;
  // Cards the operator promoted from a chip. A person's click outranks the
  // model's score for as long as the sentence stands.
  pinned: ReadonlySet<string>;
  titles: Record<string, string>;
  // What the SLOW path opened a card with, by action id. It counts toward a
  // card being aimed, and rides along if the card is ever re-pushed — but on a
  // card already up these keys are the text model's, and the reconcile lane
  // strips them rather than let a pass write over them.
  given?: Record<string, Record<string, unknown>>;
  // Who put a card up when it was not Jev, by action id: `you` for a clicked
  // chip, the text model and its step for a card a plan opened.
  placers?: Record<string, string>;
  // The same, in plain words, for the card's own "why?" (layer two).
  whys?: Record<string, string>;
  // The rows the choices were over — so a picked id can be reported to the
  // slow path WITH its label. Absent in callers that only want the screen.
  candidates?: CandidateSets;
};

export const probabilityOf = (answer: Answer | undefined): number => (answer?.kind === 'noul' ? answer.p : 0);

// What the sentence said outright, or — where the field asked for it — what
// the festival clock says instead.
type Filling = Pick<ResolveInput, 'line' | 'answers' | 'parsed' | 'clock'>;

const parsedValue = (plan: Extract<FieldPlan, { kind: 'parse' }>, input: Filling): string | number | undefined => {
  const { parsed, clock } = input;
  if (plan.parse === 'day') return parsed.day ?? (plan.fallback ? clock.day : undefined);
  if (plan.parse === 'hour') return parsed.hour ?? (plan.fallback ? clock.hour : undefined);
  if (plan.parse === 'time') return parsed.time ?? (plan.fallback ? clock.time : undefined);
  if (plan.parse === 'minutes') return parsed.minutes;
  if (plan.parse === 'amount') return parsed.amount;
  // The operator's own words, as a draft. The model returns no strings; the
  // only text that can prefill a form is text a person already typed.
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

// A VALUE THE SENTENCE NO LONGER SAYS GOES BACK. "move her at 9" wrote 21:00 into
// the form; the next sentence said no time, and the form kept 21:00 — a value
// nobody in THIS sentence asked for, prefilled into a write. A parsed field the
// current line does not name returns to the card's own blank. (A field a person
// typed into is theirs: the reconciler strips it before it writes. `line` is the
// sentence itself and is never blank while there is one.)
const blanksOf = (plan: ActionPlan, held: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(plan.fields.flatMap((field) => (field.kind === 'parse' && field.parse !== 'line' && held[field.field] === undefined ? [[field.field, field.blank]] : [])));

const listOf = (items: readonly string[]): string => (items.length <= 1 ? (items[0] ?? 'something') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

export const inputOf = (plan: ActionPlan, input: Filling): Record<string, unknown> =>
  Object.fromEntries(plan.fields.flatMap((field) => {
    const value = fieldValue(field, input);
    return value === undefined ? [] : [[field.field, value]];
  }));

// WHAT THE ASSISTANT IS HANDED, read off the same answers as the screen: the rows
// Jev picked, the few actions it ranked highest, the packs it said yes to. Nothing
// here decides WHETHER the assistant runs — a finished sentence does (assist.ts).
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

  // What each mounted card was opened with — what a companion is aimed by.
  const openedWith: Record<string, Record<string, unknown>> = {};

  // LEADS FIRST, COMPANIONS AFTER: a companion's place on screen and its aim
  // both depend on what became of the card it stands beside, whatever order the
  // catalog lists them in.
  const ordered = [...input.derived.plans.filter((plan) => COMPANIONS[plan.actionId] === undefined), ...input.derived.plans.filter((plan) => COMPANIONS[plan.actionId] !== undefined)];

  for (const plan of ordered) {
    const canvas = CANVAS_PLACEMENT[plan.actionId];
    if (canvas === undefined) continue;
    const p = probabilityOf(input.answers[plan.question]);
    scored.push({ id: plan.actionId, p: Math.round(p * 1000) / 1000 });

    // A COMPANION IS AIMED BY ITS LEAD. For the fields the two share, what the
    // lead was opened with wins over this card's own reading of the sentence:
    // the form is the move being made, and its consequences must be the
    // consequences of THAT move — including one an agent's plan filled in.
    const lead = COMPANIONS[plan.actionId];
    const leadOpenedWith = lead === undefined ? undefined : openedWith[lead];
    const shared = leadOpenedWith === undefined ? {} : Object.fromEntries(plan.inputs.flatMap((key) => (leadOpenedWith[key] === undefined ? [] : [[key, leadOpenedWith[key]]])));
    const seeded = { ...inputOf(plan, input), ...shared, ...(input.given?.[plan.actionId] ?? {}) };
    // REQUIRED IS READ OFF THE SCHEMA. A record card with no record is an
    // empty box, so a card whose required input is still unsure is offered
    // rather than mounted, however much the model wants it on screen.
    const aimed = plan.required.every((key) => seeded[key] !== undefined);
    const isPinned = input.pinned.has(plan.actionId);
    const jevWants = input.mounted.has(plan.actionId) ? p > UNMOUNT_AT : p >= YES_AT;
    // ...and a companion is wanted whenever its lead is up, whatever Jev made of
    // it alone: the consequences of a move belong beside the move.
    const wanted = isPinned || jevWants || leadOpenedWith !== undefined;

    // WHY IT IS HERE rides in with everything else the card is opened with: a
    // person's click or a plan's step if there was one, otherwise Jev and how
    // sure it was — or, for a companion, the card it came with. The `placed`
    // fragment is what draws it (rule 3: shared chrome is composed at mount,
    // not copied into fourteen layouts), and `citeKey` is what makes the card
    // something an answer's sentence can point at.
    const placedBy = input.placers?.[plan.actionId] ?? (!jevWants && leadOpenedWith !== undefined ? `with ${input.titles[lead ?? ''] ?? lead ?? ''}` : `jev ${p.toFixed(2)}`);
    if (wanted && aimed) {
      openedWith[plan.actionId] = seeded;
      const why =
        input.whys?.[plan.actionId] ??
        (!jevWants && leadOpenedWith !== undefined ? `Opened beside “${input.titles[lead ?? ''] ?? 'the form'}”, to show what that would do.` : `Opened because you said “${input.line.trim()}”.`);
      desired[canvas]?.push({ actionId: plan.actionId, input: { ...blanksOf(plan, seeded), ...seeded, ...tileOf(plan.actionId, canvas), [PLACED_BY]: placedBy, [CITE_KEY]: plan.actionId, [WHY]: why }, with: [PLACED_FRAGMENT] });
    } else {
      // EVERY NON-MOUNT ABOVE THE LINE HAS A REASON, and x-ray's story says it
      // beside the card's bar. (A card below the line needs none: it was not wanted.)
      const missing = plan.required.filter((key) => seeded[key] === undefined).map((key) => ({ key, ...(plan.needs[key] ?? { noun: key }) }));
      const leadTitle = input.titles[lead ?? ''] ?? lead ?? '';
      if (p >= YES_AT || jevWants) {
        const reason = lead !== undefined && leadOpenedWith === undefined ? `not shown — it shows what “${leadTitle}” would do, and that form is not open` : `not shown — it needs ${listOf(missing.map((need) => need.noun))}, and the sentence names none`;
        // `needs` is what somebody ELSE could fill — the assistant, from the facts it
        // reads. A companion is aimed by its lead and by nothing else, so it asks for none.
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
