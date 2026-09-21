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
import { OPERATOR_PRINCIPAL } from '@encore/app/charter/assignments';
import { FAKE_AGENT_MODEL } from '@encore/server/agent/fake-llm';
import type { FakeAgentControls } from '@encore/server/agent/fake-llm';
import { FAKE_MODEL } from '@encore/server/decider/fake-provider';
import { cardData, createReporter, createWorld, mounted, settle } from './world-factory';

const { check, report } = createReporter();

const FLOOR = 0.4;
const STORM_MOVE = 'storm at 9 move headliner to the tent';
const STORM = 'storm at 9';
const OPTIONS = 'what are our options?';
const STORM_ASK = 'what is going on with the storm at 9?';
// A region's question, as the x-ray arrangement heads it (shell/calm.layout.ts).
const HEADING = 'what are you doing?';
const ROOM_CANVASES = ['line', 'assist', 'rail', 'maybe', 'watch', 'attention', 'doing', 'about', 'where', 'when', 'nearby', 'deck', 'trace', 'xray'] as const;

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

const main = async (): Promise<void> => {
  const controls: FakeAgentControls = { latencyMs: 0, chunkMs: 0, seen: [] };
  const world = await createWorld({ agent: { kind: 'fake', fake: controls }, decider: { noulFloor: FLOOR } });
  const OP = OPERATOR_PRINCIPAL;
  const shell = await world.login(OP);
  await settle();
  const served = (actionId: string): string => world.servedTo(OP).filter((message) => message.includes(`"definitionId":"${actionId}"`)).at(-1) ?? '';
  const servedOn = (canvas: string): string => world.servedTo(OP).filter((message) => message.includes(`"canvas":"${canvas}"`)).at(-1) ?? '';
  const room = (): string => ROOM_CANVASES.map((canvas) => (shell.getState().canvases[canvas]?.stack ?? []).map((item) => `${item.definitionId}#${item.id}`).join('+')).join(' | ');
  const isOn = (): unknown => cardData(shell, 'xray', 'room.xray')['on'];
  // THE SWITCH IS PRESSED, not called: the click the button and the backtick key
  // both dispatch, through the action's endpoint, into the loop.
  const pressXray = async (): Promise<void> => {
    world.dispatchOn(OP, 'xray', { type: 'ui:click', ref: 'toggle' }, 'room.xray');
    await settle(6);
  };
  const clear = async (): Promise<void> => {
    await world.typeLine(OP, '');
    await world.settled(OP);
  };

  // ═══ a. x-ray off: the app, and nothing else ═════════════
  check('x-ray is OFF by default, and the switch is in the room', isOn() === false && mounted(shell, 'xray').join() === 'room.xray' && served('room.xray').includes('"label":"x-ray"'));
  check('an idle room says so in plain words — and does not offer a deck the app does not show', served('intent.options').includes('Nothing needs attention right now. Say what is happening.') && !served('intent.options').includes('press play'));
  check('the instrument is ABSENT, not collapsed: the trace is an empty tree', !served('intent.trace').includes('"name":"Box"') && !served('intent.trace').includes('no sentence yet'));
  check('the director is one tiny handle', served('director.deck').includes('"label":"demo ▸"') && !served('director.deck').includes('cues'));

  // a storm sentence
  await world.typeLine(OP, STORM_MOVE);
  await world.settled(OP);
  const stormRoom = room();
  check(`THE STORM SENTENCE puts cards up (${mounted(shell, 'doing').join(', ')} · ${mounted(shell, 'nearby').join(', ')})`, mounted(shell, 'doing').includes('slot.swap'));
  check('...whose own title is on them, and no region heading or eyebrow above it', served('slot.swap').includes('"title":"Move a set"') && !served('slot.swap').includes('eyebrow') && !world.servedTo(OP).some((message) => message.includes(HEADING)));
  check(`...and what was heard sits under the line with no label: ${JSON.stringify(cardData(shell, 'line', 'intent.line')['heard']).slice(0, 80)}…`, served('intent.line').includes('"name":"Tags"') && served('intent.line').includes('"prefix":""'));

  // ═══ d. why? ═════════════════════════════════════════════
  const whyLine = (actionId: string): string => /"value":"((?:Opened|Here|Added|You)[^"]*)"/.exec(served(actionId))?.[1] ?? '';
  check('A CARD CARRIES A SMALL "why?" — and the line behind it is not in the tree until it is asked for', served('slot.swap').includes('"label":"why?"') && whyLine('slot.swap') === '');
  world.dispatchOn(OP, 'doing', { type: 'ui:click', ref: 'why' }, 'slot.swap');
  await settle(4);
  const jevWhy = whyLine('slot.swap');
  check(`...pressed, it is ONE plain line: "${jevWhy}"`, jevWhy.includes(`because you said “${STORM_MOVE}”`) && served('slot.swap').includes('"label":"hide"'));
  check(`...with its confidence in a WORD (p ${String(cardData(shell, 'doing', 'slot.swap')['placedBy'])} under a ${FLOOR} floor) and no number`, / — (sure|fairly sure|a guess)\.$/.test(jevWhy) && !/\d\.\d/.test(jevWhy) && !/%/.test(jevWhy));
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
  check(`...the follow-ups are chips with no "next" label in front (${JSON.stringify(answerCard()['followUps'])})`, served('assist.answer').includes('"ref":"followUp"') && !served('assist.answer').includes('"value":"next"'));

  // a plan
  await world.typeLine(OP, OPTIONS);
  await world.settled(OP);
  check(`A PLAN lands as steps (${JSON.stringify(answerCard()['steps']).slice(0, 90)}…) with one plain hint: "${String(answerCard()['plain'])}"`, answerCard()['mode'] === 'plan' && served('assist.answer').includes('"ref":"step"') && served('assist.answer').includes('Nothing is submitted for you.') && !served('assist.answer').includes(String(answerCard()['say'])));
  world.dispatchOn(OP, 'assist', { type: 'ui:click', ref: 'step', payload: 0 });
  await world.settled(OP);
  const stepped = ROOM_CANVASES.flatMap((canvas) => (shell.getState().canvases[canvas]?.stack ?? []).map((item) => String(shell.getRuntime(item.id)?.getData()['why'] ?? ''))).find((why) => why.startsWith('You opened this from step'));
  check(`...and a step the operator pressed opens a card that says whose hand it was: "${stepped}"`, stepped === 'You opened this from step 1 of the assistant’s plan.');
  check('the history is called "Earlier", shows three and offers the rest', served('assist.rail').includes('"value":"Earlier"') && served('assist.rail').includes('"max":3') && !served('assist.rail').includes('"by":'));

  // a card the assistant put up
  await clear();
  controls.script = () => ({ answer: { response: 'The storm is the thing to tell people about. I opened the push form.', data: { canvases: { doing: [{ actionId: 'push.compose', input: { audience: 'everyone' } }] } } } });
  await world.typeLine(OP, STORM_ASK);
  await world.settled(OP);
  controls.script = undefined;
  world.dispatchOn(OP, 'doing', { type: 'ui:click', ref: 'why' }, 'push.compose');
  await settle(4);
  check(`a card the ASSISTANT put up says so, in its own "why?": "${whyLine('push.compose')}"`, whyLine('push.compose') === 'Added by the assistant as evidence for its answer.' && String(cardData(shell, 'doing', 'push.compose')['placedBy']) === 'scripted');

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

  // ═══ b. the switch ═══════════════════════════════════════
  await world.typeLine(OP, STORM_MOVE);
  await world.settled(OP);
  world.dispatchOn(OP, 'doing', { type: 'ui:model', ref: 'time', payload: '20:15' }, 'slot.swap');
  await settle(4);
  const before = room();
  const beforeOn = world.servedTo(OP).length;
  await pressXray();
  const onMessages = world.servedTo(OP).slice(beforeOn);
  const found = metaIn(onMessages);
  check(`X-RAY ON, by the switch’s own click: the room is the same room — every instance id unchanged (${before.split('#').length - 1} cards)`, isOn() === true && room() === before);
  check('...a hand edit on a form survived it', cardData(shell, 'doing', 'slot.swap')['time'] === '20:15');
  check('...the trace is a drawer of five one-line sections', ['▸ Pass', '▸ Decision', '▸ Handoff', '▸ Run', '▸ Probabilities'].every((title) => served('intent.trace').includes(title)) && /Pass \d+ · \d+ ms · \d+ questions/.test(served('intent.trace')));
  check(`...cards wear their probability tag ("${String(cardData(shell, 'doing', 'slot.swap')['placedBy'])}"), chips their meter, the line its "heard"`, /"value":"jev [01]\.\d\d"/.test(served('slot.swap')) && served('intent.line').includes('"prefix":"heard"') && (!served('intent.options').includes('"ref":"chip"') || served('intent.options').includes('"meter":')));
  check('...the regions are headed by their questions, and the deck is a deck', onMessages.some((message) => message.includes(HEADING)) && served('director.deck').includes('cues') && served('room.xray').includes('"label":"x-ray on"'));
  check(`...and THE SCANNER IS NOT BLIND: the same scan that found nothing finds the instruments now (${found.length} hits)`, found.some((hit) => hit.includes('"jev"')) && found.some((hit) => hit.includes('timing')) && found.some((hit) => hit.includes('probability')));

  // ═══ c. the drawer ═══════════════════════════════════════
  world.dispatchOn(OP, 'trace', { type: 'ui:click', ref: 'open-pass' }, 'intent.trace');
  await settle(4);
  check('A SECTION OPENS: Pass shows its rows, the other four stay one line', served('intent.trace').includes('▾ Pass') && served('intent.trace').includes('"label":"total ms"') && served('intent.trace').includes('▸ Decision') && !served('intent.trace').includes('"label":"decider"'));
  const passBefore = world.passesOf(OP).length;
  await world.typeLine(OP, 'how many guests are there right now');
  await world.settled(OP);
  check(`...and STAYS OPEN across a new sentence (${world.passesOf(OP).length - passBefore} more passes): what is open is the card’s own, the loop never writes it`, world.passesOf(OP).length > passBefore && cardData(shell, 'trace', 'intent.trace')['open_pass'] === true && served('intent.trace').includes('▾ Pass') && served('intent.trace').includes('"label":"total ms"') && served('intent.trace').includes(`Pass ${world.passesOf(OP).at(-1)?.pass} ·`));
  world.dispatchOn(OP, 'trace', { type: 'ui:click', ref: 'open-probabilities' }, 'intent.trace');
  world.dispatchOn(OP, 'trace', { type: 'ui:click', ref: 'close-pass' }, 'intent.trace');
  await settle(4);
  check('...it shuts, and another opens, independently', served('intent.trace').includes('▸ Pass') && !served('intent.trace').includes('"label":"total ms"') && served('intent.trace').includes('▾ Probabilities') && served('intent.trace').includes('"name":"Meter"'));

  // ...and off again
  const beforeOff = room();
  const offFrom = world.servedTo(OP).length;
  await pressXray();
  const afterOff = world.servedTo(OP).slice(offFrom);
  const lastPerCanvas = ROOM_CANVASES.map((canvas) => servedOn(canvas)).filter((message) => message !== '');
  check(`X-RAY OFF AGAIN: nothing remounted (${beforeOff === room() ? 'same ids' : 'IDS MOVED'}), and what the terminal now holds for every canvas is clean${metaIn(lastPerCanvas).length === 0 ? '' : `:\n         ${metaIn(lastPerCanvas).slice(0, 8).join('\n         ')}`}`, isOn() === false && room() === beforeOff && metaIn(lastPerCanvas).length === 0 && metaIn(afterOff).length === 0);
  check('...the drawer is gone from the tree, and the regions’ headings with it', !servedOn('trace').includes('Probabilities') && !afterOff.some((message) => message.includes(HEADING)) && afterOff.some((message) => message.includes('"type":"frame"')));
  // ...this time by the KEY: the kit's Hotkey dispatches the same click under its
  // own ref (siblings are keyed by ref, so the key and the button cannot share one).
  world.dispatchOn(OP, 'xray', { type: 'ui:click', ref: 'hotkey' }, 'room.xray');
  await settle(6);
  check('the backtick key is the same switch', isOn() === true && served('room.xray').includes('"name":"Hotkey"') && served('room.xray').includes('"value":"`"'));
  check('...and what was open in the drawer is still open when it comes back', served('intent.trace').includes('▾ Probabilities') && served('intent.trace').includes('▸ Pass'));

  await report('surface-check', [world]);
};

void main();
