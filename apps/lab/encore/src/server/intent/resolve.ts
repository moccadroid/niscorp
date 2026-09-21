import type { Desired } from '@niscorp/nova';
import { CANVAS_PLACEMENT, COMPANIONS, QUESTION_CANVASES, TILE_HUE, tileOf } from '@encore/app/canvas-placement';
import { CITE_KEY, PLACED_BY, PLACED_FRAGMENT, WHY } from '@encore/app/shell/fragments/placed.fragment';
import type { FestivalClock } from '@encore/lib/festival-clock';
import { NONE } from './derive';
import type { ActionPlan, AgentMode, Answer, CandidateSets, Chip, Derived, Entity, FieldPlan, Handoff, Parsed, Resolved, Route, HeldCard } from './intent.types';

// LANE 5 — RESOLVE. Probabilities in, a desired screen out. Pure.
//
// PROBABILITY IS ASSERTIVENESS (PLAN.md, claim 4). Three bands:
//
//   ≥ 0.50          the card mounts
//   0.30 – mount    the card is OFFERED, as a chip
//   below           nothing
//
// THE LINE IS WHERE A CALIBRATED MODEL SAYS "PROBABLY". It was 0.80, chosen
// before anybody had seen a calibrated model's numbers — and on the real one,
// "who's playing right now?" left the running order (0.77) and the act (0.69) as
// chips beside an overview the slow model had to place. A calibrated 0.77 means
// "this probably belongs": it belongs. 0.5 is the point where it is likelier
// than not, and that is the whole argument; then we just show it.
//
// with HYSTERESIS on the way down: a card already on screen stays until it
// falls to 0.35. Without the gap a card sitting near the line would flap with
// every keystroke — mounted at "headline", gone at "headliner ", back at
// "headliner t" — and a room that flickers while you type is worse than one
// that is a beat late.
//
// Nothing here commits anything. The most this lane can do is put a filled-in
// form in front of a person.

export const MOUNT_AT = 0.5;
export const UNMOUNT_AT = 0.35;
export const CHIP_AT = 0.3;
// WHAT AN OPERATOR IS OFFERED. A calibrated model has a middling opinion about
// most of the catalog, and every one of those clears CHIP_AT: a single question
// put eight chips on the strip, and eight guesses is noise. The app shows the
// best few, and only those within a margin of the best — a 0.41 beside a 0.72 is
// not the same kind of guess. The whole middle band is still computed, still
// counted by the handoff, and listed — every card, with its number — in x-ray's panel.
export const CHIPS_SHOWN = 3;
export const CHIP_MARGIN = 0.15;
export const suggestedOf = (chips: readonly Chip[]): Chip[] => {
  const best = chips[0]?.p ?? 0;
  return chips.filter((chip) => chip.p >= best - CHIP_MARGIN).slice(0, CHIPS_SHOWN);
};
// A field is only written when its OWN answer is sure — a confidently-wanted
// form with a shaky act in it is a form with the act left blank.
export const FILL_AT = 0.6;

// The slow path's thresholds. A route, a finished thought and a context pack
// each have to clear the same line a field does: the fast model being fairly
// sure is not enough to spend seconds of somebody else's compute.
export const HANDOFF_AT = 0.6;
// How much of the catalog the text model sees: Jev's top few, never the lot.
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
  // Cards the AGENT left out of a canvas it named. Its answer is the complete
  // state of that canvas, so Jev wanting the card back a keystroke later would
  // undo the answer; it is demoted to an offer until the sentence changes. A
  // click (a pin) outranks this, like it outranks everything.
  suppressed?: ReadonlySet<string>;
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
  if (plan.kind === 'choice') return answer.kind === 'choice' && answer.choice !== NONE && answer.p >= FILL_AT ? answer.choice : undefined;
  if (plan.kind === 'boolean') return answer.kind === 'noul' && answer.p >= FILL_AT ? true : undefined;
  return answer.kind === 'score' && answer.confidence >= FILL_AT ? plan.minimum + answer.level : undefined;
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

const isRoute = (value: string): value is Route => value === 'direct' || value === 'ask' || value === 'write' || value === 'plan';

const AGENT_MODES = ['ask', 'write', 'plan'] as const;

// How sure Jev must be that the cards are the whole answer to keep a QUESTION
// away from the agent. The midpoint of what was measured on the real model, not
// a round number: a question the cards did answer ("how many guests are there
// right now?") read `direct` at 0.86 and 0.92; one they did not ("how will the
// storm at 9 affect the lineup?") read 0.58.
export const SURE_DIRECT_AT = 0.7;
// How sure Jev must have been of a card it could not aim for that to ROUTE the
// sentence to the agent ("wanted X and could not aim it"). This is the old mount
// line, kept for the one rule that was really about being sure.
export const DEMOTION_ROUTES_AT = 0.8;

// What the screen lane found, that the route may be computed from.
type ScreenOutcome = { mountedCount: number; chipCount: number; demoted: string[] };

// JEV'S PRE-DECISIONS FOR THE SLOW PATH, read off the same answers as the
// screen. Nothing here starts anything: it says which way the sentence goes,
// whether it is finished, which facts would help, which few actions matter and
// which rows the sentence named — and the run manager decides what to do with
// that.
const resolveHandoff = (input: ResolveInput, scored: readonly { id: string; p: number }[], screen: ScreenOutcome): Handoff => {
  const route = input.answers[input.derived.handoff.route];
  const complete = input.answers[input.derived.handoff.complete];
  const asked = route?.kind === 'choice' && isRoute(route.choice) && route.p >= HANDOFF_AT ? route.choice : 'direct';
  const odds = route?.kind === 'choice' ? (route.probabilities ?? {}) : {};
  const completeP = complete?.kind === 'noul' ? Math.round(complete.p * 100) / 100 : 0;

  // THE ONE ROUTE THAT IS COMPUTED, NOT ASKED. Jev said the cards were enough,
  // and then the screen lane — on the same numbers — came back with no cards:
  // nothing cleared the mount line, or a card it wanted had to be demoted
  // because a required input could not be filled.
  //
  // CHIPS DO NOT COUNT AS KNOWING. The first version also required that there
  // be no chips, and on the fake provider that read fine, because a lexical
  // scorer gives an unrelated sentence zeros. A calibrated model almost never
  // does: asked a cold follow-up ("which of those is the most urgent?"), real
  // Jev put incident.feed at 0.64 and situation.now at 0.54 — honest guesses,
  // four chips, no card — so the rule never fired and the sentence went
  // nowhere. A guess offered is still a sentence unanswered. "Jev does not know" is
  // itself a routing decision, and it routes to the mind that has a thread:
  // "and tomorrow?" means nothing cold and everything in context.
  //
  // Only for a FINISHED thought. Half a word matches nothing too, and "mov" is
  // not a question for anybody.
  // A QUESTION MARK IS THE OPERATOR ASKING FOR WORDS. Measured on Jev: "how
  // will the storm at 9 affect the lineup?" came back `direct` at 0.58 — a coin
  // flip; the same question a minute earlier was `ask` at 0.68 — and because the
  // radar and the running order had mounted, nothing else routed it. A question
  // got cards and silence. So a finished sentence that ends in "?" goes to the
  // agent unless Jev is SURE the cards are the answer ("how many guests are
  // there right now?" is `direct` at 0.92, and stays direct). Read off the text
  // like the parser's lanes: deterministic, free, and not a second opinion.
  const directP = route?.kind === 'choice' ? (route.choice === 'direct' ? route.p : (odds['direct'] ?? 0)) : 0;
  const unansweredQuestion = /\?\s*$/.test(input.line) && directP < SURE_DIRECT_AT;

  const computedWhy =
    asked !== 'direct' || completeP < HANDOFF_AT
      ? ''
      : unansweredQuestion
        ? 'a question, and Jev was not sure the cards answer it'
      : screen.demoted.length > 0
        ? `wanted ${screen.demoted.join(', ')} and could not aim it`
        : screen.mountedCount > 0
          ? ''
          : screen.chipCount === 0
            ? 'nothing to open and nothing worth offering'
            : 'nothing sure enough to open — only guesses';
  const picked: Route = computedWhy === '' ? asked : 'ask';

  // Every confident pick over candidate ROWS is an entity the sentence named.
  const entities: Entity[] = [];
  for (const plan of input.derived.plans) {
    for (const field of plan.fields) {
      if (field.kind !== 'choice' || field.table === undefined) continue;
      const answer = input.answers[field.question];
      if (answer?.kind !== 'choice' || answer.choice === NONE || answer.p < FILL_AT) continue;
      if (entities.some((entity) => entity.table === field.table && entity.id === answer.choice)) continue;
      const label = (input.candidates?.[field.table] ?? []).find((row) => row.id === answer.choice)?.label ?? answer.choice;
      entities.push({ table: field.table, id: answer.choice, label });
    }
  }

  // Stable sort: ties keep catalog order, so the narrowed list — and with it
  // the signature — does not reshuffle between two identical passes.
  const narrowed = [...scored].sort((a, b) => b.p - a.p).slice(0, NARROWED_MAX).map((entry) => entry.id);
  const packs = Object.entries(input.derived.handoff.packs).flatMap(([id, question]) => {
    const answer = input.answers[question];
    return answer?.kind === 'noul' && answer.p >= HANDOFF_AT ? [{ id, p: Math.round(answer.p * 100) / 100 }] : [];
  });

  return {
    route: picked,
    routeP: route?.kind === 'choice' ? Math.round(route.p * 100) / 100 : 0,
    routedBy: computedWhy === '' ? 'jev' : 'computed',
    computedWhy,
    // `ask` on a tie and when the provider gave no odds: of the three it is the
    // one that cannot put a wrong form in front of anybody.
    preferred: AGENT_MODES.reduce<AgentMode>((best, mode) => ((odds[mode] ?? 0) > (odds[best] ?? 0) ? mode : best), 'ask'),
    completeP,
    packs,
    narrowed,
    entities,
    // What a run is FOR. A newer pass that leaves this alone lets a running
    // run finish; one that moves it has changed the question.
    // Sets, not rankings: two actions trading places in Jev's top six is not a
    // new question, and tearing a run down for it would be.
    signature: JSON.stringify([picked, [...narrowed].sort(), entities.map((entity) => `${entity.table}:${entity.id}`).sort()]),
  };
};

// CONFIDENCE, IN WORDS. A number on a card is an instrument; a person wants to
// know whether to trust it. Three words — and since the mount line moved down to
// "probably", the middle one has a line of its own: a card up at 0.55 is a guess
// the room acted on, and its "why?" says so.
export const SURE_AT = 0.9;
export const FAIRLY_SURE_AT = 0.7;
export const confidenceWord = (p: number): string => (p >= SURE_AT ? 'sure' : p >= FAIRLY_SURE_AT ? 'fairly sure' : 'a guess');

export const resolveScreen = (input: ResolveInput): Resolved => {
  const desired: Record<string, Desired[]> = Object.fromEntries(QUESTION_CANVASES.map((canvas) => [canvas, []]));
  const chips: Chip[] = [];
  const held: HeldCard[] = [];
  const scored: { id: string; p: number }[] = [];
  // Cards Jev wanted ON SCREEN — not merely pinned by somebody — and could not
  // aim. What the computed route reads.
  const demoted: string[] = [];

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
    const jevWants = input.mounted.has(plan.actionId) ? p > UNMOUNT_AT : p >= MOUNT_AT;
    // ...AND WANTED WHENEVER ITS LEAD IS UP. Not "when Jev also rates the
    // companion over 0.8": a calibrated model's opinion of a consequences card
    // is middling nearly always, and a rule that needed it sure would put the
    // impact beside the form one time in three.
    const wanted = isPinned || ((jevWants || leadOpenedWith !== undefined) && input.suppressed?.has(plan.actionId) !== true);
    // A companion that cannot be aimed is not "a card Jev wanted and could not
    // open" — it is a form with its stage still blank. It never routes.
    // ...and only a card Jev was SURE of. The mount line moved down to "probably"
    // (0.5); a record card that probably belongs, in a sentence that names no
    // record, is a chip — not a reason to spend seconds of the slow model.
    if (jevWants && p >= DEMOTION_ROUTES_AT && !aimed && !isPinned && lead === undefined) demoted.push(plan.actionId);

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
        (!jevWants && leadOpenedWith !== undefined ? `Opened beside “${input.titles[lead ?? ''] ?? 'the form'}”, to show what that would do.` : `Opened because you said “${input.line.trim()}” — ${confidenceWord(p)}.`);
      desired[canvas]?.push({ actionId: plan.actionId, input: { ...blanksOf(plan, seeded), ...seeded, ...tileOf(plan.actionId, canvas), [PLACED_BY]: placedBy, [CITE_KEY]: plan.actionId, [WHY]: why }, with: [PLACED_FRAGMENT] });
    } else {
      // EVERY NON-MOUNT ABOVE THE LINE HAS A REASON, and x-ray's story says it
      // beside the card's bar. (A card below the line needs none: it was not wanted.)
      const missing = plan.required.filter((key) => seeded[key] === undefined).map((key) => ({ key, ...(plan.needs[key] ?? { noun: key }) }));
      const leadTitle = input.titles[lead ?? ''] ?? lead ?? '';
      if (p >= MOUNT_AT || jevWants) {
        const reason =
          input.suppressed?.has(plan.actionId) === true
            ? 'not shown — it was closed for this sentence'
            : lead !== undefined && leadOpenedWith === undefined
              ? `not shown — it shows what “${leadTitle}” would do, and that form is not open`
              : `not shown — it needs ${listOf(missing.map((need) => need.noun))}, and the sentence names none`;
        held.push({ id: plan.actionId, p: Math.round(p * 1000) / 1000, reason, // `needs` is what somebody ELSE could fill — the assistant, from the facts it
        // reads. A companion is aimed by its lead and by nothing else, so it asks for none.
        needs: input.suppressed?.has(plan.actionId) === true || lead !== undefined ? [] : missing });
      }
    }
    if (!(wanted && aimed) && (wanted || p >= CHIP_AT)) chips.push({ id: plan.actionId, label: input.titles[plan.actionId] ?? plan.actionId, p: Math.round(p * 100) / 100, hue: tileOf(plan.actionId, canvas)[TILE_HUE] ?? '' });
  }

  const tone = input.answers[input.derived.tone];
  return {
    desired,
    chips: chips.sort((a, b) => b.p - a.p),
    suggested: suggestedOf(chips),
    held: held.map((card) => (suggestedOf([...chips].sort((a, b) => b.p - a.p)).some((chip) => chip.id === card.id) ? { ...card, reason: `${card.reason}; offered as a suggestion instead` } : { ...card, reason: `${card.reason}; not among the suggestions either — those are the best ${CHIPS_SHOWN} within ${CHIP_MARGIN} of the top guess` })),
    scored: [...scored].sort((a, b) => b.p - a.p),
    tone: tone?.kind === 'score' ? (TONES[tone.level] ?? 'calm') : 'calm',
    top: [...scored].sort((a, b) => b.p - a.p).slice(0, 6),
    handoff: resolveHandoff(input, scored, { mountedCount: Object.values(desired).reduce((sum, cards) => sum + cards.length, 0), chipCount: chips.length, demoted }),
  };
};
