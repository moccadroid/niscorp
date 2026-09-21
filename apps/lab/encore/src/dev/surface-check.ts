// THE SURFACE — three layers that never mix (PLAN.md § The surface).
//
//   layer 1  THE APP     the line, the answer, cards, attention, a quiet history
//   layer 2  WHY         one plain line per card, on demand, confidence in WORDS
//   layer 3  X-RAY       one switch: probabilities, models, timings, the trace, the deck
//
// What is asserted here is the TREE THE TERMINAL WAS SENT — every message, not
// the last one — because "hidden" is not the claim. With x-ray off the meta is
// not in the room: not collapsed, not styled away, not sent.
//
// Driven on the fake providers with the fake's `noulFloor` at 0.4 throughout: the
// confidence word is a threshold, and a threshold is only proven against a model
// that always has a middling opinion.
//
//   a. x-ray off: no meta reaches the terminal — a storm, a question, a plan, an evening
//   b. x-ray on shows the drawer and the probability tags; off removes them; no card remounts
//   c. the drawer's sections open and shut, and what is open survives a new sentence
//   d. a card's "why?" is one plain line with a confidence WORD, and no number
//   e. the status line is there while something happens, and gone once the answer is
//   f. (2026-09-21, the redesign) ONE packed flow holding every question canvas, no
//      card in a column; ONE scrollbar; one row of next steps — 3 chips, 2 links;
//      an open "why?" survives a re-aim, a reload-on-write and the switch; the
//      answer is two sentences and never a recital; a follow-up is never a repeat;
//      x-ray says it is on, and never survives a page load
import { OPERATOR_PRINCIPAL } from '@encore/app/charter/assignments';
import { FAKE_AGENT_MODEL } from '@encore/server/agent/fake-llm';
import type { FakeAgentControls } from '@encore/server/agent/fake-llm';
import { FAKE_MODEL } from '@encore/server/decider/fake-provider';
import { readFileSync } from 'node:fs';
import { FLOW_ORDER } from '@encore/app/canvas-placement';
import { ANSWER_MAX_SENTENCES, FOLLOW_UPS_MAX } from '@encore/server/agent/contract';
import { admitAnswer, sentencesOf } from '@encore/server/intent/admission';
import { feedSetCount } from '@encore/app/vex/watch.entries';
import { CHIPS_SHOWN, CHIP_MARGIN, MOUNT_AT, UNMOUNT_AT } from '@encore/server/intent/resolve';
import { STORIES_KEPT, STORY_CARDS_SHOWN } from '@encore/server/intent/story';
import type { Story } from '@encore/server/intent/story';
import { z } from 'zod';
import { cardData, createReporter, createWorld, mounted, settle } from './world-factory';

const { check, report } = createReporter();

const FLOOR = 0.4;
const STORM_MOVE = 'storm at 9 move headliner to the tent';
const STORM = 'storm at 9';
const OPTIONS = 'what are our options?';
const STORM_ASK = 'what is going on with the storm at 9?';
// A region's question, as the x-ray arrangement heads it (shell/calm.layout.ts).
const HEADING = 'what are you doing?';
const ROOM_CANVASES = ['line', 'assist', 'rail', 'maybe', 'watch', 'attention', 'doing', 'about', 'where', 'when', 'nearby', 'deck', 'trace'] as const;

// WHAT MAY NOT REACH AN OPERATOR. Names of models and of the fast decider — the
// real ones, and this world's own, so the claim is not vacuous on the fake —
// the instrument's units, and the room's internal state words as a label.
const NAMES = ['jev', '120b', 'gpt-oss', 'scripted', FAKE_AGENT_MODEL, FAKE_MODEL, 'lexical', 'tokens', 'bytes', 'calibrated', 'canvases named', 'questions'];
const STATE_WORDS = /^(landed|pending|running|aborted|failed|maybe|heard|narrowed|computed|idle|matched|confirmed|watching|director|looked up)$/i;
const PROBABILITY = /\b[01]\.\d\d\b/;
const TIMING = /\b\d+(\.\d+)? ?(ms|s)\b/;
const INSTANCE_ID = /act-[0-9a-f-]{36}/g;

type Leaf = { canvas: string; key: string; value: string | number };

// Every string and number in a served message, with the prop it arrived under.
const leavesOf = (message: string): Leaf[] => {
  const parsed: unknown = JSON.parse(message);
  const canvas = typeof parsed === 'object' && parsed !== null && 'canvas' in parsed && typeof parsed.canvas === 'string' ? parsed.canvas : 'frame';
  const leaves: Leaf[] = [];
  const walk = (value: unknown, key: string): void => {
    if (typeof value === 'string' || typeof value === 'number') leaves.push({ canvas, key, value });
    else if (Array.isArray(value)) for (const item of value) walk(item, key);
    else if (typeof value === 'object' && value !== null) for (const [inner, held] of Object.entries(value)) walk(held, inner);
  };
  walk(parsed, '');
  return leaves;
};

// STRUCTURE IS NOT CONTENT: a component's name, a canvas id, a definition id, a
// trigger ref, an option's id are how the tree is wired, and an operator never
// reads them. Everything else is something a component may draw.
const WIRING = new Set(['type', 'name', 'canvas', 'canvasId', 'definitionId', 'instanceId', 'ref', 'path', 'id', 'key', 'rowKey', 'valueKey', 'labelKey', 'toneKey', 'primaryKey', 'secondaryKey', 'detailKey', 'tagKey', 'textKey', 'linkKey', 'noteKey', 'variant', 'tone', 'align', 'justify', 'card', 'active', 'open']);

const metaIn = (messages: readonly string[]): string[] => {
  const found = new Set<string>();
  for (const message of messages) {
    for (const leaf of leavesOf(message)) {
      if (WIRING.has(leaf.key)) continue;
      if (typeof leaf.value === 'number') {
        // A number is a probability when the prop says so; a gauge's fill is data.
        if (leaf.key === 'meter' || leaf.key === 'p') found.add(`${leaf.canvas}: ${leaf.key}=${leaf.value}`);
        continue;
      }
      const text = leaf.value.replace(INSTANCE_ID, '');
      const lower = text.toLowerCase();
      for (const name of NAMES) if (lower.includes(name)) found.add(`${leaf.canvas}: "${name}" in ${leaf.key}="${text.slice(0, 60)}"`);
      if (STATE_WORDS.test(text.trim())) found.add(`${leaf.canvas}: state word ${leaf.key}="${text}"`);
      if (PROBABILITY.test(text)) found.add(`${leaf.canvas}: probability in ${leaf.key}="${text.slice(0, 60)}"`);
      if (TIMING.test(text)) found.add(`${leaf.canvas}: timing in ${leaf.key}="${text.slice(0, 60)}"`);
    }
  }
  return [...found];
};

// X-ray's story, as the panel holds it (server/intent/story.ts).
const Line = z.object({ text: z.string(), tone: z.enum(['plain', 'mute', 'warn']) });
const Fact = z.object({ label: z.string(), value: z.string() });
const CardLine = z.object({ id: z.string(), label: z.string(), p: z.number(), shown: z.string(), note: z.string() });
const StorySchema: z.ZodType<Story> = z.object({
  key: z.string(),
  label: z.string(),
  kind: z.enum(['sentence', 'event']),
  typed: z.string(),
  heard: z.array(z.object({ label: z.string() })),
  corrections: z.array(Line),
  jevHeading: z.string(),
  cards: z.array(CardLine),
  cardsTop: z.array(CardLine),
  moreCards: z.number(),
  decided: z.array(Line),
  handedHeading: z.string(),
  handed: z.array(Fact),
  assistantHeading: z.string(),
  assistant: z.array(Line),
  screen: z.array(Line),
  timings: z.array(Fact),
  cost: z.array(Fact),
});

const main = async (): Promise<void> => {
  const controls: FakeAgentControls = { latencyMs: 0, chunkMs: 0, seen: [] };
  const world = await createWorld({ agent: { kind: 'fake', fake: controls }, decider: { noulFloor: FLOOR } });
  const OP = OPERATOR_PRINCIPAL;
  const shell = await world.login(OP);
  await settle();
  const served = (actionId: string): string => world.servedTo(OP).filter((message) => message.includes(`"definitionId":"${actionId}"`)).at(-1) ?? '';
  const servedOn = (canvas: string): string => world.servedTo(OP).filter((message) => message.includes(`"canvas":"${canvas}"`)).at(-1) ?? '';
  const room = (): string => ROOM_CANVASES.map((canvas) => (shell.getState().canvases[canvas]?.stack ?? []).map((item) => `${item.definitionId}#${item.id}`).join('+')).join(' | ');
  // X-RAY IS ITS PANEL BEING OPEN, and nothing else (frame/intent-trace.action.ts).
  const panel = (): Record<string, unknown> => cardData(shell, 'trace', 'intent.trace');
  const isOn = (): unknown => panel()['open'];
  // THE SWITCH IS PRESSED, not called: the click the panel's own word dispatches.
  const pressXray = async (): Promise<void> => {
    world.dispatchOn(OP, 'trace', { type: 'ui:click', ref: isOn() === true ? 'shut' : 'open' }, 'intent.trace');
    await settle(6);
  };
  const clear = async (): Promise<void> => {
    await world.typeLine(OP, '');
    await world.settled(OP);
  };

  // ═══ f. the arrangement ══════════════════════════════════
  const frame = world.servedTo(OP).find((message) => message.includes('"type":"frame"')) ?? '';
  const pack = /"name":"Pack".*$/.exec(frame)?.[0] ?? '';
  check('ONE PACKED FLOW: a single Pack holds what the room raised and EVERY question canvas, in reading order', frame.split('"name":"Pack"').length === 2 && ['attention', ...FLOW_ORDER].every((canvas, index, all) => pack.includes(`"canvasId":"${canvas}"`) && (index === 0 || pack.indexOf(`"canvasId":"${canvas}"`) > pack.indexOf(`"canvasId":"${all[index - 1]}"`))));
  check('...and nothing gives a card a column: no basis, no max, no fixed height anywhere in the frame', !frame.includes('"basis"') && !frame.includes('"max"') && !frame.includes('"h":') && !frame.includes('"columns"'));
  const stylesheet = readFileSync(new URL('../ui/css/theme.css', import.meta.url), 'utf8');
  check('ONE SCROLLBAR, the page’s: the frame is no scroll container, and the stylesheet declares none', !frame.includes('"scroll":true') && !/overflow(-[xy])?:\s*(auto|scroll)/.test(stylesheet));

  // ═══ a. x-ray off: the app, and nothing else ═════════════
  check('x-ray is OFF by default: its panel is shut, and shut it is one quiet word', isOn() === false && mounted(shell, 'trace').join() === 'intent.trace' && served('intent.trace').includes('"label":"x-ray"'));
  check('an idle room says so in plain words — and does not offer a deck the app does not show', served('intent.options').includes('Nothing needs attention right now. Say what is happening.') && !served('intent.options').includes('press play'));
  check('the instrument is ABSENT, not collapsed: nothing of the panel is in the tree', !served('intent.trace').includes('"name":"Box"') && !served('intent.trace').includes('What happened'));
  // (2026-09-22: the demo's controls live in x-ray's panel; the app has none.)
  check('the director’s deck is not in the app, and not sent', !servedOn('deck').includes('"label"') && !frame.includes('"canvasId":"deck"'));

  // a storm sentence
  await world.typeLine(OP, STORM_MOVE);
  await world.settled(OP);
  const stormRoom = room();
  check(`THE STORM SENTENCE puts cards up (${mounted(shell, 'doing').join(', ')} · ${mounted(shell, 'nearby').join(', ')})`, mounted(shell, 'doing').includes('slot.swap'));
  const tiles = ['slot.swap', 'move.impact', 'act.card', 'lineup.timeline'].filter((id) => served(id) !== '');
  check(`EVERY CARD IS A TILE with a size class and a category — ${tiles.map((id) => `${id} ${/"name":"Tile","props":\{"span":"(\w+)","accent":"(\w+)"/.exec(served(id))?.slice(1).join('/') ?? '?'}`).join(' · ')}`, tiles.length >= 3 && tiles.every((id) => /"name":"Tile","props":\{"span":"(wide|regular|compact)","accent":"(teal|violet|blue|lime|pink)"/.test(served(id))) && served('slot.swap').includes('"value":"Doing"') && served('lineup.timeline').includes('"span":"wide"'));
  check('...whose own title is on them, and no region heading or eyebrow above it', served('slot.swap').includes('"title":"Move a set"') && !served('slot.swap').includes('eyebrow') && !world.servedTo(OP).some((message) => message.includes(HEADING)));
  check(`...and what was heard sits under the line with no label: ${JSON.stringify(cardData(shell, 'line', 'intent.line')['heard']).slice(0, 80)}…`, served('intent.line').includes('"name":"Tags"') && !served('intent.line').includes('"prefix"') && !served('intent.line').includes('"state"'));

  // THE SUGGESTIONS ARE FEW. Under a 0.4 floor every card in the catalog is a
  // "maybe" — which is what a calibrated model is like — and the app offers the
  // best few within a margin of the best, not the whole middle band.
  const Chips = z.array(z.object({ id: z.string(), p: z.number() }));
  const band = Chips.parse(cardData(shell, 'maybe', 'intent.options')['chips'] ?? []);
  const offered = Chips.parse(cardData(shell, 'maybe', 'intent.options')['suggested'] ?? []);
  const chipsServed = (): number => served('intent.options').split('"ref":"chip"').length - 1;
  check(`THE MIDDLE BAND IS WIDE under a ${FLOOR} floor (${band.length} chips: ${band.map((chip) => `${chip.id} ${chip.p}`).join(', ')})`, band.length > CHIPS_SHOWN);
  check(`...and the app offers at most ${CHIPS_SHOWN}, best first, all within ${CHIP_MARGIN} of the best (${offered.map((chip) => `${chip.id} ${chip.p}`).join(', ')})`, offered.length >= 1 && offered.length <= CHIPS_SHOWN && offered.every((chip, index) => chip.id === band[index]?.id && chip.p >= (band[0]?.p ?? 0) - CHIP_MARGIN) && chipsServed() === offered.length);

  // ═══ d. why? ═════════════════════════════════════════════
  const whyLine = (actionId: string): string => /"value":"((?:Opened|Here|Added|You)[^"]*)"/.exec(served(actionId))?.[1] ?? '';
  check('A CARD CARRIES A SMALL "why?" — and the line behind it is not in the tree until it is asked for', served('slot.swap').includes('"label":"why?"') && whyLine('slot.swap') === '');
  world.dispatchOn(OP, 'doing', { type: 'ui:click', ref: 'why' }, 'slot.swap');
  await settle(4);
  const jevWhy = whyLine('slot.swap');
  check(`...pressed, it is ONE plain line: "${jevWhy}"`, jevWhy.includes(`because you said “${STORM_MOVE}”`) && served('slot.swap').includes('"label":"hide"'));
  check(`...with its confidence in a WORD (p ${String(cardData(shell, 'doing', 'slot.swap')['placedBy'])} under a ${FLOOR} floor) and no number`, / — (sure|fairly sure|a guess)\.$/.test(jevWhy) && !/\d\.\d/.test(jevWhy) && !/%/.test(jevWhy));
  // "when I click why it always resets": a re-aimed card is a NEW instance.
  world.dispatchOn(OP, 'nearby', { type: 'ui:click', ref: 'why' }, 'move.impact');
  await settle(4);
  const impactBefore = shell.getState().canvases['nearby']?.stack.find((item) => item.definitionId === 'move.impact')?.id;
  await world.typeLine(OP, `${STORM_MOVE} no the grove`);
  await world.settled(OP);
  const impactAfter = shell.getState().canvases['nearby']?.stack.find((item) => item.definitionId === 'move.impact')?.id;
  check(`AN OPEN "why?" SURVIVES A PASS THAT RE-AIMS ITS CARD (move.impact ${impactBefore === impactAfter ? 'kept its instance' : 'is a new instance'}, now aimed at ${String(cardData(shell, 'nearby', 'move.impact')['toStageId'])})`, impactBefore !== impactAfter && cardData(shell, 'nearby', 'move.impact')['toStageId'] === 'stage_grove' && cardData(shell, 'nearby', 'move.impact')['whyOpen'] === true && whyLine('move.impact') !== '');
  check('...and one that was only written in place', cardData(shell, 'doing', 'slot.swap')['whyOpen'] === true && whyLine('slot.swap').includes('no the grove'));
  await world.typeLine(OP, STORM_MOVE);
  await world.settled(OP);
  world.dispatchOn(OP, 'doing', { type: 'ui:click', ref: 'whyHide' }, 'slot.swap');
  await settle(4);
  check('...and it shuts again', whyLine('slot.swap') === '' && served('slot.swap').includes('"label":"why?"'));
  const companion = mounted(shell, 'nearby').includes('move.impact');
  check(`a card that came WITH another says that: "${String(cardData(shell, 'nearby', 'move.impact')['why'])}"`, companion && String(cardData(shell, 'nearby', 'move.impact')['why']).length > 0 && !/\d\.\d/.test(String(cardData(shell, 'nearby', 'move.impact')['why'])));

  // ═══ e. a question, its status, its answer ═══════════════
  await clear();
  controls.latencyMs = 120;
  controls.chunkMs = 25;
  const beforeAsk = world.servedTo(OP).length;
  await world.typeLine(OP, STORM);
  await world.settled(OP);
  controls.latencyMs = 0;
  controls.chunkMs = 0;
  const answerCard = (): Record<string, unknown> => cardData(shell, 'assist', 'assist.answer');
  const whileOut = world.servedTo(OP).slice(beforeAsk).filter((message) => message.includes('"definitionId":"assist.answer"'));
  const statusOf = (message: string): string => /"value":"((?:Reading|Answering|Looking|That reads|Waiting|Still working)[^"]*)"/.exec(message)?.[1] ?? '';
  const statuses = [...new Set(whileOut.map(statusOf).filter((line) => line !== ''))];
  check(`A QUESTION gets an answer (${String(answerCard()['status'])}): "${String(answerCard()['answer']).slice(0, 70)}…"`, answerCard()['status'] === 'landed' && String(answerCard()['answer']).length > 0);
  check(`WHILE IT HAPPENED the card said what was happening, in the operator’s terms: ${statuses.map((line) => `"${line}"`).join(' → ')}`, statuses.some((line) => line.startsWith('Reading ')) && statuses.every((line) => !TIMING.test(line)));
  check(`ONCE THE ANSWER IS THERE THE STATUS IS NOT: nothing of "${String(answerCard()['say'])}" is in the tree`, statusOf(served('assist.answer')) === '' && !served('assist.answer').includes(String(answerCard()['say'])) && !served('assist.answer').includes('"name":"Badge"') && served('assist.answer').includes('"name":"Spans"'));
  check('...and the question is not repeated above its answer', !served('assist.answer').includes(`"value":"${STORM}"`));
  const Links = z.array(z.object({ text: z.string() }));
  const firstOffered = Links.parse(answerCard()['followUps'] ?? []).map((link) => link.text);
  const count = (tree: string, ref: string): number => tree.split(`"ref":"${ref}"`).length - 1;
  check(`THE ANSWER IS SHORT: ${sentencesOf(String(answerCard()['answer'])).length} sentence(s), in the body face`, sentencesOf(String(answerCard()['answer'])).length <= ANSWER_MAX_SENTENCES);
  check(`ONE ROW OF NEXT STEPS, under the answer: ${count(served('intent.options'), 'chip')} chip(s) and ${count(served('intent.options'), 'link')} link(s) — ${firstOffered.join(' · ')}`, count(served('assist.answer'), 'followUp') === 0 && count(served('intent.options'), 'chip') <= CHIPS_SHOWN && count(served('intent.options'), 'link') === firstOffered.length && firstOffered.length >= 1 && firstOffered.length <= FOLLOW_UPS_MAX && served('intent.options').includes('"variant":"link"'));

  // an open "why?" and a write from outside: a card that reads what was written
  // re-loads in place, and what a person opened on it stays open.
  await clear();
  await world.typeLine(OP, 'how many guests are there right now');
  await world.settled(OP);
  world.dispatchOn(OP, 'nearby', { type: 'ui:click', ref: 'why' }, 'attendance.now');
  await settle(4);
  const totalBefore = JSON.stringify(cardData(shell, 'nearby', 'attendance.now')['total']);
  const hourNow = Number(cardData(shell, 'nearby', 'attendance.now')['hour']);
  await world.booted.director.send({ what: 'a count the card reads', fingerprint: feedSetCount.fingerprint, context: { zoneId: 'zone_arena', day: 'sat', hour: hourNow, headcount: 7100 } });
  await settle(6);
  await world.settled(OP);
  check(`...AND A RELOAD-ON-WRITE: "On site" re-read its rows (${totalBefore} → ${JSON.stringify(cardData(shell, 'nearby', 'attendance.now')['total'])}) and still says why`, mounted(shell, 'nearby').includes('attendance.now') && JSON.stringify(cardData(shell, 'nearby', 'attendance.now')['total']) !== totalBefore && cardData(shell, 'nearby', 'attendance.now')['whyOpen'] === true && whyLine('attendance.now') !== '');
  await clear();
  await world.typeLine(OP, STORM);
  await world.settled(OP);

  // a plan
  await world.typeLine(OP, OPTIONS);
  await world.settled(OP);
  check(`A PLAN lands as steps (${JSON.stringify(answerCard()['steps']).slice(0, 90)}…) with one plain hint: "${String(answerCard()['plain'])}"`, answerCard()['mode'] === 'plan' && served('assist.answer').includes('"ref":"step"') && served('assist.answer').includes('Nothing is submitted for you.') && !served('assist.answer').includes(String(answerCard()['say'])));
  world.dispatchOn(OP, 'assist', { type: 'ui:click', ref: 'step', payload: 0 });
  await world.settled(OP);
  const stepped = ROOM_CANVASES.flatMap((canvas) => (shell.getState().canvases[canvas]?.stack ?? []).map((item) => String(shell.getRuntime(item.id)?.getData()['why'] ?? ''))).find((why) => why.startsWith('You opened this from step'));
  check(`...and a step the operator pressed opens a card that says whose hand it was: "${stepped}"`, stepped === 'You opened this from step 1 of the assistant’s plan.');
  const planOffered = Links.parse(answerCard()['followUps'] ?? []).map((link) => link.text);
  check('a plan’s steps ARE the next steps: no card suggestions beside them — one row of pills, never two', count(served('assist.answer'), 'step') >= 1 && count(served('intent.options'), 'chip') === 0);
  check(`A FOLLOW-UP IS NEVER A REPEAT: "${OPTIONS}" was asked, and offered before — it is not offered again (${planOffered.join(' · ') || 'none'})`, !planOffered.includes(OPTIONS) && planOffered.every((next) => !firstOffered.includes(next)));
  // (Restated 2026-09-21, the redesign: the history is ONE LINE until it is wanted.)
  check('the history is one quiet line — "Earlier · n" — and no list', /"label":"Earlier · \d+"/.test(served('assist.rail')) && !served('assist.rail').includes('"name":"Rail"'));
  world.dispatchOn(OP, 'rail', { type: 'ui:click', ref: 'earlierOpen' }, 'assist.rail');
  await settle(4);
  check('...pressed, it shows three and offers the rest, with nobody’s role on it', served('assist.rail').includes('"name":"Rail"') && served('assist.rail').includes('"max":3') && !served('assist.rail').includes('"by":'));
  world.dispatchOn(OP, 'rail', { type: 'ui:click', ref: 'earlierShut' }, 'assist.rail');
  await settle(4);

  // a card the assistant put up
  await clear();
  controls.script = () => ({ answer: { response: 'The storm is the thing to tell people about. I opened the push form.', data: { canvases: { doing: [{ actionId: 'push.compose', input: { audience: 'everyone' } }] } } } });
  await world.typeLine(OP, STORM_ASK);
  await world.settled(OP);
  controls.script = undefined;
  world.dispatchOn(OP, 'doing', { type: 'ui:click', ref: 'why' }, 'push.compose');
  await settle(4);
  check(`a card the ASSISTANT put up says so, in its own "why?": "${whyLine('push.compose')}"`, whyLine('push.compose') === 'Added by the assistant as evidence for its answer.' && String(cardData(shell, 'doing', 'push.compose')['placedBy']) === 'scripted');

  // THE CONTRACT REFUSES A THIRD SENTENCE, AND A RECITAL — with a correction, so
  // the model gets to say it properly. The script recites first, then behaves.
  await clear();
  await world.typeLine(OP, 'how is the running order looking');
  await world.settled(OP);
  const shown = [...new Set(z.array(z.object({ act_name: z.string() }).loose()).catch([]).parse(cardData(shell, 'when', 'lineup.timeline')['slots'] ?? []).map((row) => row.act_name))].slice(0, 4);
  // (One correction per run — agent.ts `outputRetries(2)` — so each refusal is its
  // own sentence: the script breaks the contract once, is told, and then keeps it.)
  const corrections: string[] = [];
  const breaksOnce = (broken: string, kept: string): void => {
    controls.script = (turn) => {
      if (turn.corrections.length > 0) corrections.push(turn.corrections.at(-1) ?? '');
      return { answer: { response: turn.corrections.length === 0 ? broken : kept, data: {} } };
    };
  };
  breaksOnce(`Tonight it is ${shown.join(', ')}.`, 'The cards are the answer: nothing on the running order is out of place.');
  await world.typeLine(OP, 'how is the running order looking?');
  // Enter: whatever Jev made of the sentence, the operator wants words about it.
  world.booted.intent.of(OP)?.runNow();
  await world.settled(OP);
  check(`A RECITAL IS REFUSED (the card shows ${shown.join(', ')}): "${corrections[0]?.slice(0, 90)}…"`, mounted(shell, 'when').includes('lineup.timeline') && shown.length >= 3 && (corrections[0] ?? '').includes('reads "lineup.timeline" back'));
  check(`...and the answer that lands is the one that kept the contract: "${String(answerCard()['answer'])}"`, answerCard()['status'] === 'landed' && String(answerCard()['answer']).startsWith('The cards are the answer'));
  breaksOnce('One thing matters. Then another. And a third.', 'One thing matters, and it is the second.');
  await world.typeLine(OP, 'and what matters most on the running order?');
  world.booted.intent.of(OP)?.runNow();
  await world.settled(OP);
  controls.script = undefined;
  check(`...AND SO IS A THIRD SENTENCE: "${corrections[1]?.slice(0, 70)}…" → "${String(answerCard()['answer'])}"`, (corrections[1] ?? '').includes(`at most ${ANSWER_MAX_SENTENCES}`) && answerCard()['status'] === 'landed' && String(answerCard()['answer']) === 'One thing matters, and it is the second.');
  const empty = { allowed: new Set<string>(), definitions: {}, candidates: {}, writable: [] };
  const repeated = admitAnswer({ ...empty, asked: ['What are our options?', 'who needs to know'] }, { followUps: ['what are our options', 'Who needs to know?', 'is gate B open?', 'how long will it last?', 'a third one'] }, 'Short.');
  check(`the rule itself: asked-before is dropped, and at most ${FOLLOW_UPS_MAX} remain (${repeated.ok ? repeated.followUps.join(' · ') : ''})`, repeated.ok && repeated.followUps.join('|') === 'is gate B open?|how long will it last?');

  // a failure, said once and plainly
  await clear();
  controls.script = () => ({ answer: { response: 'An action nobody offered.', data: { canvases: { doing: [{ actionId: 'gate.toggle', input: {} }] } } } });
  await world.typeLine(OP, 'is the tent free at 9?');
  await world.settled(OP);
  controls.script = undefined;
  check(`A FAILURE is one plain sentence — "${String(answerCard()['plain'])}" — and the reason ("${String(answerCard()['say']).slice(0, 50)}…") stays with the instruments`, answerCard()['status'] === 'failed' && served('assist.answer').includes('That did not work, and nothing was changed.') && !served('assist.answer').includes('gate.toggle'));

  // the director's evening
  await clear();
  const director = world.booted.director;
  const cues = director.cues();
  await director.reset();
  await settle(8);
  await world.settled(OP);
  let mostRaised = 0;
  for (let minute = 18 * 60 + 1; minute <= 19 * 60 + 5; minute += 1) {
    await director.stepTo(minute);
    if (cues.some((cue) => cue.at === minute)) {
      await settle(6);
      await world.settled(OP);
      mostRaised = Math.max(mostRaised, mounted(shell, 'attention').length);
    }
  }
  await settle(6);
  await world.settled(OP);
  const watcher = world.booted.intent.of(OP)?.watching();
  check(`THE DIRECTOR’S EVENING played with x-ray off (${watcher?.stats().events} events, ${watcher?.stats().raised} raised, up to ${mostRaised} cards up at once, ${watcher?.stats().briefs} brief)`, (watcher?.stats().raised ?? 0) >= 3 && mostRaised >= 1);
  const raisedTrees = world.servedTo(OP).filter((message) => message.includes('"canvas":"attention"') && message.includes('"ref":"dismiss"'));
  check('...an attention card is a severity, a sentence, keep and dismiss', raisedTrees.length > 0 && raisedTrees.every((message) => message.includes('"name":"Badge"') && message.includes('"ref":"keep"') || message.includes('"label":"kept"')));

  const offMessages = [...world.servedTo(OP)];
  const leaked = metaIn(offMessages);
  check(`WITH X-RAY OFF NO META REACHED THE TERMINAL — ${offMessages.length} messages, across the storm sentence, a question, a plan, a failure and the evening${leaked.length === 0 ? '' : `:\n         ${leaked.slice(0, 12).join('\n         ')}`}`, leaked.length === 0);
  check('...and x-ray was never on, so that is every message this terminal has been sent', isOn() === false && room() !== stormRoom);

  // THE MOUNT LINE IS "PROBABLY" (0.50), and the unmount line 0.35 — which sits UNDER
  // this model's 0.4 opinion of everything. Hysteresis is for ONE sentence being typed:
  // typed over with another, the old room must not sit it out.
  await world.typeLine(OP, STORM_MOVE);
  await world.settled(OP);
  await world.typeLine(OP, 'how many guests are there right now');
  const swapNow = StorySchema.parse(panel()['story']).cards.find((card) => card.id === 'slot.swap')?.p ?? 0;
  check(`A NEW SENTENCE RE-EARNS THE ROOM, even for a middling model: the move form reads ${swapNow} — over the ${UNMOUNT_AT} that would keep a card up, under the ${MOUNT_AT} that puts one up — and it is gone (${mounted(shell, 'doing').join(', ') || 'nothing in doing'} · ${mounted(shell, 'nearby').join(', ')})`, swapNow > UNMOUNT_AT && swapNow < MOUNT_AT && !mounted(shell, 'doing').includes('slot.swap') && mounted(shell, 'nearby').includes('attendance.now'));
  await clear();

  // ═══ b. x-ray: one panel, and nothing else ═══════════════
  // (Rewritten 2026-09-22. The first x-ray wrote itself over the whole room — tags on
  // every card, a legend, a banner, a status line — and what this section asserted was
  // that all of that appeared. The rule is the opposite now: X-RAY CHANGES NOTHING IN
  // THE APP. It is one panel docked at the bottom; every assertion below is about that
  // panel, or about the app not having moved.)
  const APP_CANVASES = ROOM_CANVASES.filter((canvas) => canvas !== 'trace' && canvas !== 'deck');
  const isPanel = (message: string): boolean => message.includes('"canvas":"trace"') || message.includes('"canvas":"deck"');
  const story = (): Story => StorySchema.parse(panel()['story']);
  await world.typeLine(OP, STORM_MOVE);
  await world.settled(OP);
  world.dispatchOn(OP, 'doing', { type: 'ui:model', ref: 'time', payload: '20:15' }, 'slot.swap');
  await settle(4);
  world.dispatchOn(OP, 'doing', { type: 'ui:click', ref: 'why' }, 'slot.swap');
  await settle(4);
  const before = room();
  const appBefore = APP_CANVASES.map((canvas) => servedOn(canvas));
  const beforeOn = world.servedTo(OP).length;
  await pressXray();
  const onMessages = world.servedTo(OP).slice(beforeOn);
  check(`X-RAY ON CHANGES NOTHING IN THE APP: the tree of every app canvas is byte-identical across the switch (${APP_CANVASES.length} canvases), and not one of them was even re-sent`, isOn() === true && APP_CANVASES.every((canvas, index) => servedOn(canvas) === appBefore[index]) && onMessages.length > 0 && onMessages.every(isPanel));
  check(`...the room is the same room — every instance id unchanged (${before.split('#').length - 1} cards), a hand edit and an open "why?" with it`, room() === before && cardData(shell, 'doing', 'slot.swap')['time'] === '20:15' && cardData(shell, 'doing', 'slot.swap')['whyOpen'] === true);
  check('IT IS ONE PANEL, DOCKED: the last thing in the page’s flow, stuck to the window’s bottom edge — so the page is one panel longer and nothing ends underneath it', /\{"type":"component","name":"Box","props":\{"stick":"bottom"\},"children":\[[^\]]*"canvasId":"trace"/.test(frame) && frame.lastIndexOf('"stick":"bottom"') > frame.lastIndexOf('"canvasId":"rail"') && /\.en-box--stick-bottom \{[^}]*position: sticky/.test(stylesheet) && !/position:\s*(fixed|absolute)[^}]*\}/.test(stylesheet.split('.en-box--dock')[1]?.split('}')[0] ?? ''));
  check('...with a fixed ceiling and its own scroll — the one thing in the room that has one', /"scroll":true,"maxH":"\d+vh"/.test(servedOn('trace')) && APP_CANVASES.every((canvas) => !servedOn(canvas).includes('"scroll":true')));

  // THE STORY FIRST.
  const stormPass = world.passesOf(OP).at(-1);
  const told = story();
  check(`THE STORY STARTS WITH WHAT WAS TYPED: "${told.typed}" — heard ${told.heard.map((tag) => tag.label).join(' · ')}`, told.typed === `You typed: “${STORM_MOVE}”` && told.heard.some((tag) => tag.label.startsWith('21:00')) && servedOn('trace').includes(told.typed));
  check(`...THEN JEV, in words: "${told.jevHeading}"`, /^Jev · \d+ ms · \d+ questions$/.test(told.jevHeading) && servedOn('trace').includes(told.jevHeading));
  check(`...THE CARDS IT WANTED, with the very probabilities the pass recorded (${told.cardsTop.map((card) => `${card.label} ${card.shown}`).join(' · ')})`, told.cardsTop.length === Math.min(STORY_CARDS_SHOWN, stormPass?.top.length ?? 0) && told.cardsTop.every((card, index) => card.id === stormPass?.top[index]?.id && card.p === stormPass.top[index]?.p) && told.cardsTop.every((card) => servedOn('trace').includes(`"label":"${card.label}","value":${card.p}`)));
  check(`...best first, the top ${STORY_CARDS_SHOWN}, and "show all" for the other ${told.moreCards}`, told.cards.length === told.cardsTop.length + told.moreCards && told.moreCards > 0 && servedOn('trace').includes(`show all ${told.cards.length}`) && told.cards.every((card, index) => index === 0 || card.p <= (told.cards[index - 1]?.p ?? 1)));
  world.dispatchOn(OP, 'trace', { type: 'ui:click', ref: 'allCards' }, 'intent.trace');
  await settle(4);
  check('...pressed, every card Jev was asked about is listed', told.cards.every((card) => servedOn('trace').includes(`"label":"${card.label}","value":${card.p}`)) && servedOn('trace').includes('show fewer'));
  check(`...what it picked, how it read the mood, and where the sentence went: ${told.decided.map((line) => `"${line.text}"`).join(' ')}`, told.decided.length === 3 && told.decided[0]?.text.includes('Nova Kestrel') === true && told.decided[2]?.text.startsWith('Kept to the cards') === true && told.decided.every((line) => servedOn('trace').includes(line.text)));
  check(`...and what changed on screen as a result: ${told.screen.map((line) => line.text).join(' ')}`, told.screen.length > 0 && told.screen.every((line) => servedOn('trace').includes(line.text)));
  check('a sentence the cards answered has no assistant in its story', told.assistantHeading === '' && told.handedHeading === '' && !servedOn('trace').includes('Handed to the assistant'));
  const panelText = leavesOf(servedOn('trace')).filter((leaf) => typeof leaf.value === 'string' && leaf.key === 'value').map((leaf) => String(leaf.value));
  check('TYPOGRAPHY: sentence case and real words — no all-lowercase mono key/value run, no label in capitals', !servedOn('trace').includes('"inline":true') && !servedOn('trace').includes('"variant":"mono"') && panelText.every((value) => value === '' || value !== value.toUpperCase() || !/[A-Z]{4,}/.test(value)));

  // A question: the assistant joins the story, with what it was handed and what was refused.
  await clear();
  await world.typeLine(OP, 'how is the running order looking');
  await world.settled(OP);
  const names = [...new Set(z.array(z.object({ act_name: z.string() }).loose()).catch([]).parse(cardData(shell, 'when', 'lineup.timeline')['slots'] ?? []).map((row) => row.act_name))].slice(0, 4);
  controls.script = (turn) => ({
    answer:
      turn.corrections.length === 0
        ? { response: `Tonight it is ${names.join(', ')}.`, data: {} }
        : { response: 'Nothing on the running order is out of place.', data: { claims: [{ text: 'Nothing on the running order is out of place.', card: 'stage.view' }] } },
  });
  await world.typeLine(OP, 'is anything out of place on the running order?');
  world.booted.intent.of(OP)?.runNow();
  await world.settled(OP);
  controls.script = undefined;
  const asked = story();
  check(`A QUESTION’S STORY SAYS WHERE IT WENT AND WHAT WAS HANDED OVER: "${asked.decided[2]?.text}" — ${asked.handed.map((fact) => `${fact.label}: ${fact.value}`).join(' · ')}`, asked.handedHeading === 'Handed to the assistant' && asked.handed.length === 3 && asked.handed[2]?.value.endsWith('message(s)') === true && servedOn('trace').includes('Handed to the assistant'));
  check(`...THE ASSISTANT, in a heading a person can read: "${asked.assistantHeading}"`, /^Assistant · \S+ · \d+\.\d s · \d+ steps?$/.test(asked.assistantHeading) && servedOn('trace').includes(asked.assistantHeading));
  const refused = asked.assistant.find((line) => line.text.startsWith('Refused its first answer'));
  const dropped = asked.assistant.find((line) => line.text.startsWith('Dropped one citation'));
  check(`...WHAT WAS REFUSED, WITH THE REASON: "${refused?.text.slice(0, 120)}…"`, refused !== undefined && refused.tone === 'warn' && refused.text.includes('reads "lineup.timeline" back') && servedOn('trace').includes('Refused its first answer and asked again'));
  check(`...AND WHAT WAS DROPPED, in plain words: "${dropped?.text}"`, dropped?.text === 'Dropped one citation: it pointed at a card that is not on screen (stage.view).' && servedOn('trace').includes(dropped.text));
  check('...and what it finally said', asked.assistant.some((line) => line.text === 'Said: “Nothing on the running order is out of place.”'));

  // The stepper: a run that landed is not overwritten by the next keystroke's pass.
  const landedKey = asked.key;
  await world.typeLine(OP, 'is anything out of place on the running order? and');
  check('A NEW PASS IS A NEW STORY, and the panel follows it', story().key !== landedKey && panel()['following'] === true && panel()['hasEarlier'] === true);
  world.dispatchOn(OP, 'trace', { type: 'ui:click', ref: 'earlier' }, 'intent.trace');
  await settle(6);
  check(`THE STEPPER REACHES THE EARLIER PASS — and its run is still there ("${story().label}", ${String(panel()['storyPosition'])})`, story().key === landedKey && story().assistantHeading !== '' && panel()['following'] === false && servedOn('trace').includes('back to the latest'));
  await world.typeLine(OP, 'is anything out of place on the running order? and then');
  check('...and STAYS THERE while newer passes land: stepping back pins the panel', story().key === landedKey && panel()['hasLater'] === true);
  world.dispatchOn(OP, 'trace', { type: 'ui:click', ref: 'latest' }, 'intent.trace');
  await settle(6);
  check(`...until "back to the latest" (${STORIES_KEPT} are kept, ${world.booted.intent.of(OP)?.stories().length} are held)`, story().key !== landedKey && panel()['following'] === true && (world.booted.intent.of(OP)?.stories().length ?? 99) <= STORIES_KEPT);

  // Numbers second, the demo third.
  world.dispatchOn(OP, 'trace', { type: 'ui:click', ref: 'tab-numbers' }, 'intent.trace');
  await settle(4);
  const labels = leavesOf(servedOn('trace')).filter((leaf) => leaf.key === 'label').map((leaf) => String(leaf.value));
  check(`NUMBERS SECOND: one table, real labels, each once (${labels.filter((label) => label.includes(' ')).slice(0, 5).join(' · ')}…)`, labels.includes('Jev round trip') && labels.includes('Request size') && !labels.includes('decide') && new Set(labels).size === labels.length && !servedOn('trace').includes('You typed'));
  world.dispatchOn(OP, 'trace', { type: 'ui:click', ref: 'tab-demo' }, 'intent.trace');
  await settle(4);
  check('THE DEMO THIRD: the director’s deck is drawn inside the panel — and is only SENT while the panel is open', servedOn('trace').includes('"canvasId":"deck"') && servedOn('deck').includes('"label":"Slower"'));
  world.dispatchOn(OP, 'trace', { type: 'ui:click', ref: 'tab-story' }, 'intent.trace');
  await settle(4);

  // An event tells the same story from the event.
  const eventStories = (world.booted.intent.of(OP)?.stories() ?? []).filter((held) => held.kind === 'event');
  await clear();
  await world.booted.director.send({ what: 'Food Court fills', fingerprint: feedSetCount.fingerprint, context: { zoneId: 'zone_food', day: 'sat', hour: Math.floor(Number((await world.sql('SELECT minute FROM festival_clock'))[0]?.['minute'] ?? 18 * 60) / 60), headcount: 5820 } });
  await settle(8);
  await world.settled(OP);
  const lastEvent = (world.booted.intent.of(OP)?.stories() ?? []).filter((held) => held.kind === 'event').at(-1);
  check(`AN EVENT TELLS THE SAME STORY FROM THE EVENT (${eventStories.length} during the evening): "${lastEvent?.typed}" → ${lastEvent?.decided.map((line) => line.text).join(' ')} → ${lastEvent?.screen.map((line) => line.text).join(' ')}`, eventStories.length > 0 && lastEvent !== undefined && lastEvent.typed.startsWith('Something happened on site:') && lastEvent.decided[0]?.text.startsWith('Worth interrupting somebody for?') === true && lastEvent.screen.length === 1);

  // THE POINT: with x-ray ON, the app is still clean — and the panel is where the instruments are.
  const sinceOn = world.servedTo(OP).slice(beforeOn);
  const appLeaks = metaIn(sinceOn.filter((message) => !isPanel(message)));
  const inPanel = metaIn(sinceOn.filter(isPanel));
  check(`WITH X-RAY ON NO META REACHED AN APP CANVAS EITHER — ${sinceOn.filter((message) => !isPanel(message)).length} app messages since the switch, through a question, a refusal and an event${appLeaks.length === 0 ? '' : `:\n         ${appLeaks.slice(0, 10).join('\n         ')}`}`, appLeaks.length === 0);
  check(`...and THE SCANNER IS NOT BLIND: the same scan finds the instruments in the panel (${inPanel.length} hits)`, inPanel.some((hit) => hit.includes('"jev"')) && inPanel.some((hit) => hit.includes('timing')) && inPanel.some((hit) => hit.includes('probability')));

  // Shut again; and never sticky.
  const appOpen = APP_CANVASES.map((canvas) => servedOn(canvas));
  world.dispatchOn(OP, 'trace', { type: 'ui:click', ref: 'shutKey' }, 'intent.trace');
  await settle(6);
  check('SHUT (by the backtick key): one quiet word, the deck gone with it, and the app once more untouched', isOn() === false && servedOn('trace').includes('"label":"x-ray"') && !servedOn('trace').includes('You typed') && !servedOn('deck').includes('"label":"Slower"') && metaIn([servedOn('trace'), servedOn('deck')]).length === 0 && APP_CANVASES.every((canvas, index) => servedOn(canvas) === appOpen[index]));
  await pressXray();
  check('X-RAY NEVER SURVIVES A PAGE LOAD: left open, the panel’s tree arms the once-per-load reset', isOn() === true && /"name":"OnLoad","props":\{"when":true\}/.test(servedOn('trace')));
  const second = await world.login(OP);
  await settle(4);
  world.dispatchOn(OP, 'trace', { type: 'ui:click', ref: 'fresh' }, 'intent.trace');
  await settle(6);
  check('...and the fresh page’s click shuts it: nothing armed for the next load', second === shell && isOn() === false && /"name":"OnLoad","props":\{"when":false\}/.test(servedOn('trace')) && !servedOn('trace').includes('You typed'));
  world.dispatchOn(OP, 'trace', { type: 'ui:click', ref: 'fresh' }, 'intent.trace');
  await settle(6);
  check('...it is a reset, not a toggle: a second fresh page does not open it again', isOn() === false);

  await report('surface-check', [world]);
};

void main();
