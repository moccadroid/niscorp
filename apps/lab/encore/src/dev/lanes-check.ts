// THE LANES, ONE AT A TIME — parse, derive and resolve are pure functions, so
// they are asserted as such: no server, no database, no provider. The storm
// check proves the loop end to end; this proves the rules inside it, including
// the ones one sentence never reaches (hysteresis needs a probability that
// FALLS, and the fake never lowers its mind about a word already typed).
import { z } from 'zod';
import { CATALOG_DEFINITIONS } from '@encore/app/action-catalog';
import { CANVAS_PLACEMENT } from '@encore/app/canvas-placement';
import { PINNED_CLOCK } from '@encore/lib/festival-clock';
import { parseLine } from '@encore/server/intent/parse';
import { CONTINUATION_KEEPS, anchorAfter, continues } from '@encore/server/intent/continuation';
import { PASS_CEILING_MS, PASS_QUIET_MS, createPacer } from '@encore/server/intent/pacer';
import { heardTags } from '@encore/server/intent/heard';
import { deriveQuestions, NONE, TONE_QUESTION } from '@encore/server/intent/derive';
import { resolveScreen, CHIP_AT, FILL_AT, HANDOFF_AT, MOUNT_AT, SURE_DIRECT_AT, UNMOUNT_AT } from '@encore/server/intent/resolve';
import { admit, admitAnswer } from '@encore/server/intent/admission';
import type { ContextPack } from '@encore/app/vex/context-packs';
import type { Answer, CandidateSets } from '@encore/server/intent/intent.types';

const results: boolean[] = [];
const check = (label: string, pass: boolean): void => {
  results.push(pass);
  console.log(`${pass ? '[pass]' : '[fail]'} ${label}`);
};

// ═══ 1. parse ════════════════════════════════════════════════
const parse = (line: string): ReturnType<typeof parseLine> => parseLine(line, PINNED_CLOCK);

check('"at 9" is 21:00 — a bare hour is an evening hour', parse('storm at 9').time === '21:00' && parse('storm at 9').hour === 21);
check('"9pm" and "21:00" agree with it', parse('doors 9pm').time === '21:00' && parse('doors 21:00').time === '21:00');
check('"9am" is still the morning', parse('soundcheck 9am').time === '09:00');
check('"9:30" keeps its minutes', parse('on at 9:30').time === '21:30' && parse('on at 9:30').hour === 21);
check('a consumed value is not a search token: "9" never goes looking for an act', !parse('storm at 9 move headliner').tokens.includes('9') && parse('storm at 9 move headliner').tokens.join() === 'storm,move,headliner');
check('"20 min" is a duration, and is NOT also read as 20:00', parse('delay lantern club 20 min').minutes === 20 && parse('delay lantern club 20 min').time === undefined);
check('"2 hours" is 120 minutes', parse('hold 2 hours').minutes === 120);
check('day words resolve against the FESTIVAL clock (pinned: sat)', parse('sales today').day === 'sat' && parse('lineup tomorrow').day === 'sun' && parse('bar friday').day === 'fri' && parse('tonight').day === 'sat');
check('a number too big to be an hour is an amount', parse('comp 40 tickets').amount === 40 && parse('comp 40 tickets').time === undefined);
check('nothing said, nothing heard', Object.keys(parse('move headliner')).join() === 'tokens');
check('function words and two-letter stubs never reach retrieval', parse('move it to the tent at st').tokens.join() === 'move,tent');

// ═══ 1b. is it still the same sentence? ══════════════════════
const A = 'storm at 9 what should we do with the headliner';
const typed = (lines: readonly string[]): { anchor: string; broke: string[] } =>
  lines.reduce<{ anchor: string; broke: string[] }>((state, line) => ({ anchor: anchorAfter(state.anchor, line), broke: continues(state.anchor, line) ? state.broke : [...state.broke, line] }), { anchor: '', broke: [] });

check('typing forward is one sentence, keystroke by keystroke', typed(Array.from({ length: A.length }, (_, index) => A.slice(0, index + 1))).broke.length === 0);
check('...and so is backspacing it, all the way down to one letter', typed([A, ...Array.from({ length: A.length - 1 }, (_, index) => A.slice(0, A.length - 1 - index))]).broke.length === 0);
check('backspacing does NOT move the anchor: retyping the same words is still the same sentence', typed([A, 'storm at 9', A]).broke.length === 0 && typed([A, 'storm at 9']).anchor === A);
check('...so backspacing and then saying something ELSE is a new sentence, not two continuations', typed([A, 'storm at 9', 'storm at 9 close the gates']).broke.join() === 'storm at 9 close the gates');
check('typed over from the first keystroke: "h" breaks it, and the rest continue "h"', typed([A, 'h', 'ho', 'how many guests are there right now?']).broke.join() === 'h');
check(`an edit near the END keeps the sentence (${CONTINUATION_KEEPS * 100}% of it still leads the line)`, continues('storm at 9 move headliner to the tnet', 'storm at 9 move headliner to the tent') && continues(A, 'storm at 9 what should we do with the lantern club'));
check('...and an edit that reaches further back is a new one — a typo fixed EARLY costs a pin, by design', !continues('strom at 9 move headliner to the tent', 'storm at 9 move headliner to the tent') && !continues('storm at 9 move headliner to the tent', 'storm at 9 move lantern club to the tent'));
check('after an edit the sentence continues from the EDITED line', typed(['storm at 9 move headliner to the tnet', 'storm at 9 move headliner to the tent', 'storm at 9 move headliner to the tent now']).broke.length === 0);
check('a capital, a trailing space and a doubled space are not edits', continues(A, `  ${A.toUpperCase()}  `) && continues('storm at 9', 'storm  at 9 move'));
check('nothing said yet cannot be broken', continues('', 'anything') && anchorAfter('', ' Storm ') === 'storm');

// ═══ 1c. the pacer, on a clock that only moves when told ═════
// No sleeping: `advance` runs whatever timers fall due, in order, and `tick`
// lets the promise chain behind a landed pass run.
const tick = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
};

const bench = (): { pacer: ReturnType<typeof createPacer>; sent: { text: string; at: number; waited: number }[]; land: () => Promise<void>; advance: (ms: number) => void; now: () => number } => {
  let now = 0;
  let timers: { at: number; run: () => void }[] = [];
  const sent: { text: string; at: number; waited: number }[] = [];
  let landers: (() => void)[] = [];
  const pacer = createPacer({
    run: (text, _generation, waited) => {
      sent.push({ text, at: now, waited });
      return new Promise<void>((resolve) => landers.push(resolve));
    },
    onError: () => {},
    clock: {
      now: () => now,
      after: (ms, run) => {
        const timer = { at: now + ms, run };
        timers.push(timer);
        return () => {
          timers = timers.filter((other) => other !== timer);
        };
      },
    },
  });
  return {
    pacer,
    sent,
    now: () => now,
    land: async () => {
      const resolvers = landers;
      landers = [];
      for (const resolve of resolvers) resolve();
      await tick();
    },
    advance: (ms) => {
      const until = now + ms;
      for (;;) {
        const due = timers.filter((timer) => timer.at <= until).sort((a, b) => a.at - b.at)[0];
        if (due === undefined) break;
        timers = timers.filter((timer) => timer !== due);
        now = due.at;
        due.run();
      }
      now = until;
    },
  };
};

{
  const { pacer, sent, advance } = bench();
  pacer.submit('s');
  advance(PASS_QUIET_MS - 1);
  check('QUIET: a keystroke does not send at once — it arms a timer', sent.length === 0);
  advance(1);
  check(`...which sends after ${PASS_QUIET_MS} ms of quiet, saying how long the text waited`, sent.length === 1 && sent[0]?.text === 's' && sent[0]?.waited === PASS_QUIET_MS);
}
{
  const { pacer, sent, advance } = bench();
  for (const text of ['s', 'st', 'sto', 'stor', 'storm']) {
    pacer.submit(text);
    advance(60);
  }
  check('each further keystroke re-arms it: five keystrokes 60 ms apart have sent nothing yet', sent.length === 0);
  advance(PASS_QUIET_MS);
  check('...and then ONE pass goes, on the last text', sent.length === 1 && sent[0]?.text === 'storm');
}
{
  const { pacer, sent, advance } = bench();
  const typedSteadily = 'storm warning now';
  for (let length = 1; length <= 7; length += 1) {
    pacer.submit(typedSteadily.replace(/ /g, '_').slice(0, length));
    advance(100);
  }
  check(`CEILING: typing steadily, 100 ms apart, never quiet — a pass still goes no later than ${PASS_CEILING_MS} ms after the first unsent keystroke (sent at ${sent[0]?.at})`, sent.length >= 1 && (sent[0]?.at ?? 9999) <= PASS_CEILING_MS && (sent[0]?.waited ?? 0) <= PASS_CEILING_MS);
}
{
  const { pacer, sent } = bench();
  pacer.submit('storm ');
  check('WORDS: a keystroke that ends a word sends immediately', sent.length === 1 && sent[0]?.waited === 0);
}
{
  const { pacer, sent, advance, land } = bench();
  pacer.submit('storm ');
  pacer.submit('storm a');
  pacer.submit('storm at');
  advance(1000);
  check('IN FLIGHT: keystrokes behind a pass queue in ONE trailing slot and arm no timer', sent.length === 1);
  await land();
  check('...and the newest text starts the moment the pass lands — no extra wait', sent.length === 2 && sent[1]?.text === 'storm at' && sent[1]?.at === 1000);
  check('...reporting the whole time it sat behind the pass as waited', sent[1]?.waited === 1000);
  await land();
  let isIdle = false;
  void pacer.idle().then(() => {
    isIdle = true;
  });
  await tick();
  check('...after which the pacer is idle', isIdle);
}
{
  const { pacer, sent, advance } = bench();
  pacer.submit('stor');
  pacer.cancel();
  advance(PASS_CEILING_MS * 2);
  check('CANCEL: an emptied line disarms whatever was waiting — nothing is ever sent for it', sent.length === 0);
  const generation = pacer.submit('chip', { now: true });
  check('NOW: a pass nobody typed (a chip, a landed run) skips the quiet timer', sent.length === 1 && sent[0]?.text === 'chip' && generation === 3);
}

// ═══ 1d. what was heard ══════════════════════════════════════
{
  const spoken = parse('storm at 9 move headliner to the tent');
  const rows: CandidateSets = {
    acts: [{ id: 'act_a', label: 'Nova Kestrel — headliner, electronic' }],
    stages: [{ id: 'stage_main', label: 'Main Stage — open-air stage' }, { id: 'stage_tent', label: 'The Tent — covered stage' }],
    zones: [{ id: 'zone_camp', label: 'Campsite — camping' }],
  };
  const before = heardTags(spoken, rows);
  check(`before the pass: the values read, and the top MATCH per table, muted (${before.map((tag) => tag.label).join(' · ')})`, before.map((tag) => `${tag.label}|${tag.state}`).join() === '21:00|read,Nova Kestrel — headliner|matched,The Tent — covered stage|matched');
  check('...a closed table\u2019s rows are all retrieved, so only one the sentence NAMES is heard — and none is, for zones', !before.some((tag) => tag.label.startsWith('Campsite')) && !before.some((tag) => tag.label.startsWith('Main Stage')));
  const after = heardTags(spoken, rows, [{ table: 'stages', id: 'stage_tent', label: 'The Tent — covered stage' }]);
  check('after it: what Jev picked is CONFIRMED, what it did not is dropped, and what was read stays', after.map((tag) => `${tag.label}|${tag.state}`).join() === '21:00|read,The Tent — covered stage|confirmed');
  const next = heardTags(spoken, rows, undefined, [{ table: 'acts', id: 'act_a', label: 'Nova Kestrel — headliner, electronic' }]);
  check('while the NEXT pass is out, a row the last one confirmed stays confirmed — a tag that blinks reads as doubt', next.map((tag) => `${tag.label}|${tag.state}`).join() === '21:00|read,Nova Kestrel — headliner|confirmed,The Tent — covered stage|matched');
  check('...unless it is no longer among the candidates, in which case it is simply not heard', !heardTags(spoken, { ...rows, acts: [] }, undefined, [{ table: 'acts', id: 'act_a', label: 'Nova Kestrel — headliner, electronic' }]).some((tag) => tag.label.startsWith('Nova')));
  check('nothing heard, no tags', heardTags(parse('qqq'), { acts: [], stages: rows['stages'] ?? [] }).length === 0);
}

// ═══ 2. derive ═══════════════════════════════════════════════
const held = Object.keys(CANVAS_PLACEMENT).flatMap((id) => (CATALOG_DEFINITIONS[id] === undefined ? [] : [CATALOG_DEFINITIONS[id]]));
const candidates: CandidateSets = {
  acts: [{ id: 'act_a', label: 'Act A — headliner, electronic' }],
  stages: [
    { id: 'stage_x', label: 'Stage X — open-air stage' },
    { id: 'stage_y', label: 'Stage Y — covered stage' },
  ],
  zones: [{ id: 'zone_z', label: 'Zone Z — open field' }],
};
const derived = deriveQuestions(held, candidates);
const names = Object.keys(derived.questions);
const question = (name: string): (typeof derived.questions)[string] | undefined => derived.questions[name];

check(`one noul per mountable action (${held.length})`, held.every((definition) => question(`action/${definition.id}`)?.type === 'noul'));
check('...whose `true` criterion is the action\'s own description', held.every((definition) => { const asked = question(`action/${definition.id}`); return asked?.type === 'noul' && asked.criteria?.true === definition.description; }));
check('an enum is a choice over its values, plus none', ((): boolean => { const asked = question('input/sales.chart/metric'); return asked?.type === 'choice' && Object.keys(asked.criteria).join() === `revenue,units,${NONE}`; })());
check('a boolean is a noul', question('input/sales.chart/compare')?.type === 'noul');
check('a bounded integer is a score, with its authored level words', ((): boolean => { const asked = question('input/push.compose/urgency'); return asked?.type === 'score' && asked.criteria.join() === 'routine,important,critical'; })());
check('a row reference is a choice over that table\'s candidates, plus none', ((): boolean => { const asked = question('input/slot.swap/toStageId'); return asked?.type === 'choice' && Object.keys(asked.criteria).join() === `stage_x,stage_y,${NONE}`; })());
check('"from" and "to" are different questions over the same rows', question('input/slot.swap/fromStageId') !== undefined && question('input/slot.swap/toStageId') !== undefined);
check('the shared act field is asked once, by whichever card came first', names.filter((name) => name.endsWith('/actId')).length === 1);
check('...and the three cards that want it all read that one answer', ['slot.swap', 'set.delay', 'act.card'].every((id) => derived.plans.find((plan) => plan.actionId === id)?.fields.some((field) => field.kind === 'choice' && field.field === 'actId' && field.question === names.find((name) => name.endsWith('/actId')))));
check('days, hours, times, minutes and free text never become questions', !names.some((name) => /\/(day|hour|time|minutes|body)$/.test(name)));
// A synthetic card, to reach the one rule no shipped action exercises: a wide
// integer with NO parse mark must be left alone, not turned into a 121-level
// distribution.
const wide = deriveQuestions([{ id: 'probe.wide', description: 'A probe.', data: { n: 0, small: 0 }, input: z.toJSONSchema(z.object({ n: z.number().int().min(0).max(120).optional().describe('Wide.'), small: z.number().int().min(1).max(3).optional().describe('Small.') })) }], {});
check('a bounded integer past ten steps is not a score, mark or no mark', wide.questions['input/probe.wide/n'] === undefined);
check('...and a small one without authored words gets its own numbers as levels, from its minimum', ((): boolean => { const asked = wide.questions['input/probe.wide/small']; return asked?.type === 'score' && asked.criteria.join() === '1,2,3'; })());
check('the frame asks its one question', question(TONE_QUESTION)?.type === 'score');

// The slow path's questions ride the same derivation (Slice 1b).
const PACKS: ContextPack[] = [
  { id: 'alpha', noun: 'alpha', description: 'Facts about alpha.', tables: ['acts'], reads: [{ name: 'rows', fingerprint: 'x/alpha', context: {} }] },
  { id: 'beta', noun: 'beta', description: 'Facts about beta.', tables: ['zones'], reads: [{ name: 'rows', fingerprint: 'x/beta', context: {} }] },
];
const withPacks = deriveQuestions(held, candidates, PACKS);
check('the handoff is three more KINDS of question in the same derivation: a route…', ((): boolean => { const asked = withPacks.questions['handoff/route']; return asked?.type === 'choice' && Object.keys(asked.criteria).join() === 'direct,ask,write,plan'; })());
check('...whether the thought is finished…', withPacks.questions['handoff/complete']?.type === 'noul');
check('...and one noul per declared context pack, its description as the subject', PACKS.every((pack) => { const asked = withPacks.questions[`context/${pack.id}`]; return asked?.type === 'noul' && asked.criteria?.true === pack.description; }));
check('no packs declared, no context questions — but the route is always asked', !Object.keys(derived.questions).some((name) => name.startsWith('context/')) && derived.questions['handoff/route'] !== undefined);
check('no candidates, no question: an act field with no rows to offer is left alone', !Object.keys(deriveQuestions(held, { ...candidates, acts: [] }).questions).some((name) => name.endsWith('/actId')));
check('`required` is read off the schema', derived.plans.find((plan) => plan.actionId === 'act.card')?.required.join() === 'actId' && derived.plans.find((plan) => plan.actionId === 'slot.swap')?.required.length === 0);

// ═══ 3. resolve ══════════════════════════════════════════════
const actQuestion = names.find((name) => name.endsWith('/actId')) ?? '';
const screen = (answers: Record<string, Answer>, mounted: string[] = [], pinned: string[] = []): ReturnType<typeof resolveScreen> =>
  resolveScreen({ line: 'a line', derived, answers, parsed: parse('at 9'), clock: PINNED_CLOCK, mounted: new Set(mounted), pinned: new Set(pinned), titles: {} });
const onScreen = (resolved: ReturnType<typeof resolveScreen>): string[] => Object.values(resolved.desired).flatMap((entries) => entries.map((entry) => entry.actionId));
const noul = (p: number): Answer => ({ kind: 'noul', p });

check(`at the mount line (${MOUNT_AT}) a card mounts; just under, it is a chip`, onScreen(screen({ 'action/weather.radar': noul(MOUNT_AT) })).includes('weather.radar') && screen({ 'action/weather.radar': noul(MOUNT_AT - 0.01) }).chips.some((chip) => chip.id === 'weather.radar'));
check(`under the chip line (${CHIP_AT}) it is nothing at all`, ((): boolean => { const resolved = screen({ 'action/weather.radar': noul(CHIP_AT - 0.01) }); return onScreen(resolved).length === 0 && resolved.chips.length === 0; })());
check('HYSTERESIS: 0.70 does not mount a card — but keeps one that is already up', !onScreen(screen({ 'action/weather.radar': noul(0.7) })).includes('weather.radar') && onScreen(screen({ 'action/weather.radar': noul(0.7) }, ['weather.radar'])).includes('weather.radar'));
check(`...until it falls to ${UNMOUNT_AT}, where it comes down`, !onScreen(screen({ 'action/weather.radar': noul(UNMOUNT_AT) }, ['weather.radar'])).includes('weather.radar'));
check('a wanted card whose REQUIRED input is unsure is offered, not mounted', ((): boolean => { const resolved = screen({ 'action/act.card': noul(0.95), [actQuestion]: { kind: 'choice', choice: 'act_a', p: FILL_AT - 0.01, confidence: FILL_AT - 0.01 } }); return !onScreen(resolved).includes('act.card') && resolved.chips.some((chip) => chip.id === 'act.card'); })());
check(`...and mounts, aimed, once the pick clears ${FILL_AT}`, screen({ 'action/act.card': noul(0.95), [actQuestion]: { kind: 'choice', choice: 'act_a', p: FILL_AT, confidence: FILL_AT } }).desired['about']?.[0]?.input?.['actId'] === 'act_a');
check('`none` fills nothing, however confident', screen({ 'action/slot.swap': noul(0.95), [actQuestion]: { kind: 'choice', choice: NONE, p: 0.99, confidence: 0.99 } }).desired['doing']?.[0]?.input?.['actId'] === undefined);
check('parsed values fill their fields; a `fallback: now` field takes the clock; one without is left alone', ((): boolean => { const swap = screen({ 'action/slot.swap': noul(0.9) }).desired['doing']?.[0]?.input ?? {}; const bare = resolveScreen({ line: 'x', derived, answers: { 'action/slot.swap': noul(0.9) }, parsed: parse('move'), clock: PINNED_CLOCK, mounted: new Set(), pinned: new Set(), titles: {} }).desired['doing']?.[0]?.input ?? {}; return swap['time'] === '21:00' && swap['day'] === 'sat' && bare['time'] === undefined && bare['day'] === 'sat'; })());
check('a score fills a bounded integer with minimum + level', screen({ 'action/push.compose': noul(0.9), 'input/push.compose/urgency': { kind: 'score', level: 2, confidence: 0.8 } }).desired['doing']?.[0]?.input?.['urgency'] === 2);
check('a pin outranks the model: a promoted card stays at probability 0', onScreen(screen({ 'action/site.map': noul(0) }, [], ['site.map'])).includes('site.map'));
check('every question canvas is named in the answer, empty or not — so reconcile clears what is stale', Object.keys(screen({}).desired).sort().join() === 'about,doing,nearby,when,where');
// The handoff, resolved off the same answers.
const routed = (choice: string, confidence: number, extra: Record<string, Answer> = {}): ReturnType<typeof resolveScreen>['handoff'] =>
  resolveScreen({ line: 'x', derived: withPacks, answers: { 'handoff/route': { kind: 'choice', choice, p: confidence, confidence, probabilities: { direct: 0.1, write: 0.6, plan: 0.3 } }, ...extra }, parsed: parse('at 9'), clock: PINNED_CLOCK, mounted: new Set(), pinned: new Set(), titles: {}, candidates }).handoff;
check('a confident route is the route; an unsure one is direct — cards are the default', routed('plan', 0.7).route === 'plan' && routed('plan', 0.59).route === 'direct');
check('...and Enter on a direct sentence would run the likeliest of ask, write and plan', routed('direct', 0.9).preferred === 'write');
check('...which is `ask` when the provider gave no odds: the one that cannot put a wrong form up', resolveScreen({ line: 'x', derived: withPacks, answers: {}, parsed: parse('x'), clock: PINNED_CLOCK, mounted: new Set(), pinned: new Set(), titles: {} }).handoff.preferred === 'ask');

// THE ONE ROUTE THAT IS COMPUTED, NOT ASKED (DESIGN.md § When it runs).
const FINISHED = { 'handoff/complete': noul(0.9) };
const direct: Answer = { kind: 'choice', choice: 'direct', p: 0.9, confidence: 0.9 };
const handoffOf = (answers: Record<string, Answer>, pinned: string[] = []): ReturnType<typeof resolveScreen>['handoff'] =>
  resolveScreen({ line: 'x', derived: withPacks, answers, parsed: parse('x'), clock: PINNED_CLOCK, mounted: new Set(), pinned: new Set(pinned), titles: {}, candidates }).handoff;
check('a FINISHED thought that leaves Jev with nothing — no card, no chip — goes to the agent as `ask`', ((): boolean => { const handoff = handoffOf({ 'handoff/route': direct, ...FINISHED }); return handoff.route === 'ask' && handoff.routedBy === 'computed' && handoff.computedWhy.includes('nothing'); })());
check(`...but only a finished one: under ${HANDOFF_AT} complete it stays direct, however empty the room`, handoffOf({ 'handoff/route': direct, 'handoff/complete': noul(HANDOFF_AT - 0.01) }).route === 'direct');
// A QUESTION MARK ASKS FOR WORDS (2026-09-21, from real Jev: "how will the storm
// at 9 affect the lineup?" was `direct` at 0.58 with both cards up — cards, and
// silence). The line matters here, so these build their own input.
const asked = (line: string, directP: number): ReturnType<typeof resolveScreen>['handoff'] =>
  resolveScreen({ line, derived: withPacks, answers: { 'handoff/route': { kind: 'choice', choice: 'direct', p: directP, confidence: directP, probabilities: { direct: directP, ask: 1 - directP, write: 0, plan: 0 } }, ...FINISHED, 'action/weather.radar': noul(0.95) }, parsed: parse(line), clock: PINNED_CLOCK, mounted: new Set(), pinned: new Set(), titles: {}, candidates }).handoff;
check('a finished QUESTION Jev only half-thinks the cards answer goes to the agent, cards mounted or not', ((): boolean => { const handoff = asked('how will the storm affect the lineup?', 0.58); return handoff.route === 'ask' && handoff.routedBy === 'computed' && handoff.computedWhy.includes('question'); })());
check(`...but a question Jev is SURE the cards answer stays direct (${SURE_DIRECT_AT} and up)`, asked('how many guests are there right now?', 0.92).route === 'direct');
check('...and the same half-sure route on a STATEMENT stays direct: the cards are the answer', asked('storm at 9', 0.58).route === 'direct');
check('a card Jev WANTED and had to demote for a required input it could not fill routes it too, and says which', ((): boolean => { const handoff = handoffOf({ 'handoff/route': direct, ...FINISHED, 'action/act.card': noul(0.95) }); return handoff.route === 'ask' && handoff.routedBy === 'computed' && handoff.computedWhy.includes('act.card'); })());
// Restated 2026-09-21 from real Jev. This used to assert the opposite — "a chip
// worth offering is not nothing, the route stays direct" — which held on the
// lexical fake and stranded every cold follow-up on a calibrated model, because
// a calibrated model nearly always has a middling guess to offer.
check('a guess offered is still a sentence unanswered: chips alone route it to the agent, and say so', ((): boolean => { const handoff = handoffOf({ 'handoff/route': direct, ...FINISHED, 'action/weather.radar': noul(0.5) }); return handoff.route === 'ask' && handoff.routedBy !== 'jev' && handoff.computedWhy.includes('only guesses'); })());
check('...while a card that actually MOUNTED leaves the route direct: the room answered', ((): boolean => { const handoff = handoffOf({ 'handoff/route': direct, ...FINISHED, 'action/weather.radar': noul(0.95) }); return handoff.route === 'direct' && handoff.routedBy === 'jev' && handoff.computedWhy === ''; })());
check('...and so is a card that mounted', handoffOf({ 'handoff/route': direct, ...FINISHED, 'action/weather.radar': noul(0.9) }).route === 'direct');
check('a route Jev DID pick is never recomputed', ((): boolean => { const handoff = handoffOf({ 'handoff/route': { kind: 'choice', choice: 'plan', p: 0.8, confidence: 0.8 }, ...FINISHED }); return handoff.route === 'plan' && handoff.routedBy === 'jev'; })());
check('the computed route moves the signature like any other route', handoffOf({ 'handoff/route': direct, ...FINISHED }).signature !== handoffOf({ 'handoff/route': direct }).signature);

// COMPANIONS (slice 2a): `move.impact` stands beside `slot.swap`.
const toStageQuestion = names.find((name) => name.endsWith('/toStageId')) ?? '';
const pickedAct: Answer = { kind: 'choice', choice: 'act_a', p: 0.9, confidence: 0.9 };
const pickedStage: Answer = { kind: 'choice', choice: 'stage_y', p: 0.9, confidence: 0.9 };
const beside = (answers: Record<string, Answer>): ReturnType<typeof resolveScreen> =>
  resolveScreen({ line: 'x', derived: withPacks, answers: { 'handoff/route': direct, ...FINISHED, ...answers }, parsed: parse('at 9'), clock: PINNED_CLOCK, mounted: new Set(), pinned: new Set(), titles: { 'slot.swap': 'Move a set' }, candidates });
check('the swap form and the impact card ask ONE question about the to-stage: same field, same words', names.filter((name) => name.endsWith('/toStageId')).length === 1 && derived.plans.find((plan) => plan.actionId === 'move.impact')?.fields.some((field) => field.kind === 'choice' && field.question === toStageQuestion) === true);
check('a COMPANION mounts when its lead does — at a probability that alone would only have made it a chip', ((): boolean => { const resolved = beside({ 'action/slot.swap': noul(0.9), 'action/move.impact': noul(0.45), [actQuestion]: pickedAct, [toStageQuestion]: pickedStage }); const card = resolved.desired['nearby']?.find((entry) => entry.actionId === 'move.impact'); return card?.input?.['toStageId'] === 'stage_y' && card.input['actId'] === 'act_a' && card.input['placedBy'] === 'with Move a set' && !resolved.chips.some((chip) => chip.id === 'move.impact'); })());
check('...and not without it: no form, no consequences card, however middling the model', !onScreen(beside({ 'action/slot.swap': noul(0.5), 'action/move.impact': noul(0.5), [actQuestion]: pickedAct, [toStageQuestion]: pickedStage })).includes('move.impact'));
check('a companion that cannot be AIMED is offered, not mounted — and never counts as "a card Jev wanted and could not open"', ((): boolean => { const resolved = beside({ 'action/slot.swap': noul(0.9), 'action/move.impact': noul(0.95), [actQuestion]: pickedAct }); return onScreen(resolved).includes('slot.swap') && !onScreen(resolved).includes('move.impact') && resolved.handoff.route === 'direct' && resolved.handoff.computedWhy === ''; })());
check('every card is opened with the key an answer cites it by', beside({ 'action/weather.radar': noul(0.9) }).desired['when']?.[0]?.input?.['citeKey'] === 'weather.radar');

// A card an agent's answer CLOSED is held down — offered, not mounted.
const suppressedScreen = (pinned: string[]): ReturnType<typeof resolveScreen> =>
  resolveScreen({ line: 'x', derived, answers: { 'action/weather.radar': noul(0.95) }, parsed: parse('at 9'), clock: PINNED_CLOCK, mounted: new Set(['weather.radar']), pinned: new Set(pinned), titles: {}, suppressed: new Set(['weather.radar']) });
check('a card the agent left out of a canvas it named is OFFERED, not mounted, however sure Jev is', !onScreen(suppressedScreen([])).includes('weather.radar') && suppressedScreen([]).chips.some((chip) => chip.id === 'weather.radar'));
check('...and a click still outranks it', onScreen(suppressedScreen(['weather.radar'])).includes('weather.radar'));
check('the narrowed catalog is the top six, never the lot', routed('plan', 0.9).narrowed.length === 6 && held.length > 6);
check('a pack goes out only if Jev said yes to it', routed('plan', 0.9, { 'context/alpha': noul(0.7), 'context/beta': noul(0.4) }).packs.map((pack) => pack.id).join() === 'alpha');
check('a confident pick over candidate rows is an ENTITY, reported with its label', routed('plan', 0.9, { [actQuestion]: { kind: 'choice', choice: 'act_a', p: 0.9, confidence: 0.9 } }).entities.some((entity) => entity.table === 'acts' && entity.id === 'act_a' && entity.label.startsWith('Act A')));
check('the signature moves with the route and with the entities — and with nothing else', routed('plan', 0.9).signature !== routed('write', 0.9).signature && routed('plan', 0.9).signature !== routed('plan', 0.9, { [actQuestion]: { kind: 'choice', choice: 'act_a', p: 0.9, confidence: 0.9 } }).signature && routed('plan', 0.9).signature === routed('plan', 0.7, { 'context/alpha': noul(0.9) }).signature);
check('what the slow path opened a card with counts toward it being aimed', onScreen(resolveScreen({ line: 'x', derived, answers: {}, parsed: parse('x'), clock: PINNED_CLOCK, mounted: new Set(), pinned: new Set(['act.card']), titles: {}, given: { 'act.card': { actId: 'act_a' } } })).includes('act.card'));

// ═══ 4. admission — one rule, three doors ════════════════════
const definitions = Object.fromEntries(held.map((definition) => [definition.id, definition]));
const admission = { allowed: new Set(['slot.swap', 'act.card', 'weather.radar', 'push.compose']), definitions, candidates };
const refused = (actionId: string, input: Record<string, unknown>, options?: Parameters<typeof admit>[3]): string => { const verdict = admit(admission, actionId, input, options); return verdict.ok ? '' : verdict.reason; };
check('an action in the list, opened with its own contract and an offered row, is admitted onto ITS canvas', ((): boolean => { const verdict = admit(admission, 'slot.swap', { actId: 'act_a', toStageId: 'stage_y', time: '21:00' }); return verdict.ok && verdict.canvas === 'doing' && verdict.input['toStageId'] === 'stage_y'; })());
check('an action outside the list is refused — held by the principal or not', refused('set.delay', {}).includes('not an action') && refused('no.such', {}).includes('not an action'));
check('a row that was not offered this pass is refused', refused('slot.swap', { actId: 'act_zzz' }).includes('actId'));
check('a key the action does not declare is refused', refused('slot.swap', { actId: 'act_a', teleport: true }) !== '');
check('a value outside the contract is refused: a time that is not HH:MM', refused('slot.swap', { time: 'nine-ish' }).includes('time'));
check('a card named onto the wrong canvas is refused: position is a fact about the action', refused('slot.swap', {}, { canvas: 'nearby' }).includes('belongs on "doing"'));
check('a REQUIRED input is required of anything a model opens…', refused('act.card', {}).includes('actId'));
check('...and not yet of a chip, which opens a card with nothing and lets Jev aim it', refused('act.card', {}, { partial: true }) === '');
check('null is how a model says absent: dropped, never opened with', ((): boolean => { const verdict = admit(admission, 'slot.swap', { actId: 'act_a', time: null }); return verdict.ok && !('time' in verdict.input); })());

const answerContext = { ...admission, writable: [{ card: 'push.compose', field: 'body' }] };
check('an answer names ONLY the canvases it names: null and absent are both "not mine"', ((): boolean => { const verdict = admitAnswer(answerContext, { canvases: { when: [{ actionId: 'weather.radar', input: { day: 'sat', hour: 21 } }], doing: null } }); return verdict.ok && Object.keys(verdict.canvases).join() === 'when' && verdict.canvases['when']?.[0]?.actionId === 'weather.radar'; })());
check('...an EMPTY list is a name: that canvas is to be cleared', ((): boolean => { const verdict = admitAnswer(answerContext, { canvases: { when: [] } }); return verdict.ok && verdict.canvases['when']?.length === 0; })());
check('one bad card rejects the WHOLE answer, with every reason', ((): boolean => { const verdict = admitAnswer(answerContext, { canvases: { when: [{ actionId: 'weather.radar', input: {} }], doing: [{ actionId: 'set.delay', input: {} }] }, steps: [{ say: 'Move it', actionId: 'slot.swap', input: { actId: 'act_zzz' } }] }); return !verdict.ok && verdict.reasons.length === 2; })());
check('a field that was not listed as writable is refused; the listed one is admitted', ((): boolean => { const bad = admitAnswer(answerContext, { fields: [{ card: 'slot.swap', field: 'time', text: 'x' }] }); const good = admitAnswer(answerContext, { fields: [{ card: 'push.compose', field: 'body', text: 'Take cover.' }] }); return !bad.ok && good.ok && good.fields.length === 1; })());
check('a plan step is admitted like a card, and carries its form', ((): boolean => { const verdict = admitAnswer(answerContext, { steps: [{ say: 'Move Act A under cover', actionId: 'slot.swap', input: { actId: 'act_a' } }] }); return verdict.ok && verdict.steps[0]?.card.canvas === 'doing' && verdict.steps[0]?.card.input['actId'] === 'act_a'; })());

check('tone follows the frame question', screen({ [TONE_QUESTION]: { kind: 'score', level: 2, confidence: 0.7 } }).tone === 'critical' && screen({}).tone === 'calm');

const failed = results.filter((ok) => !ok).length;
console.log(failed === 0 ? `\nOK — lanes-check (${results.length} assertions)` : `\nFAIL — ${failed} of ${results.length} assertions failed in lanes-check`);
process.exit(failed === 0 ? 0 : 1);
