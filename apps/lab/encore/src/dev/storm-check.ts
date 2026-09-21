// THE STORM CHECK — the sentence the app exists for, typed into a real shell.
//
//   "storm at 9 move headliner to the tent"
//
// Typed PROGRESSIVELY, prefix by prefix, the way a person does, with the pacer
// allowed to go idle between them — so what is asserted is the room a person
// would actually be looking at, arrived at through every intermediate room,
// hysteresis and re-aims included. Nothing here reaches into the loop: events
// go in through `shell.dispatch`, and what is read back is canvases and card
// data, the same things a terminal is served.
//
// The ids asserted against come from SQL, not from the seed file: the check
// asks the database who the headliner is, and then asks the room.
import { OPERATOR_PRINCIPAL } from '@encore/app/charter/assignments';
import { QUESTION_CANVASES } from '@encore/app/canvas-placement';
import { PASS_CEILING_MS, PASS_QUIET_MS } from '@encore/server/intent/pacer';
import { cardData, check, decider, keystroke, login, mounted, passesOf, report, settle, sql, typeLine } from './world';

const SENTENCE = 'storm at 9 move headliner to the tent';
const PREFIXES = ['st', 'storm', 'storm at 9', 'storm at 9 move', 'storm at 9 move headl', 'storm at 9 move headliner', 'storm at 9 move headliner to the', SENTENCE];

const main = async (): Promise<void> => {
  const headliner = String((await sql(`SELECT id FROM acts WHERE billing = 'headliner'`))[0]?.['id'] ?? '');
  const tent = String((await sql(`SELECT id FROM stages WHERE name = 'The Tent'`))[0]?.['id'] ?? '');
  const main = String((await sql(`SELECT id FROM stages WHERE name = 'Main Stage'`))[0]?.['id'] ?? '');
  check(`the database knows one headliner and the tent (${headliner}, ${tent})`, headliner !== '' && tent !== '');

  const shell = await login(OPERATOR_PRINCIPAL);
  await settle();

  // ═══ 1. the room assembles WHILE the sentence is typed ═══
  const rooms: Record<string, string[]> = {};
  for (const prefix of PREFIXES) {
    await typeLine(OPERATOR_PRINCIPAL, prefix);
    rooms[prefix] = QUESTION_CANVASES.flatMap((canvas) => mounted(shell, canvas));
    console.log(`       "${prefix}" → ${rooms[prefix]?.join(', ') || '(empty)'}`);
  }

  check('two letters are not an intent: "st" mounts nothing', (rooms['st'] ?? []).length === 0);
  check('"storm" alone already aims the radar', (rooms['storm'] ?? []).includes('weather.radar'));
  check('...and the swap form is NOT there yet — nobody has said move', !(rooms['storm at 9'] ?? []).includes('slot.swap'));
  check('"…move" opens the swap form before there is an act to put in it', (rooms['storm at 9 move'] ?? []).includes('slot.swap'));
  check('a half-typed "headl" does not yet mount the record card', !(rooms['storm at 9 move headl'] ?? []).includes('act.card'));
  check('...the finished word does', (rooms['storm at 9 move headliner'] ?? []).includes('act.card'));

  // ═══ 2. what each canvas holds, at the end of the sentence ═
  check(`doing holds the slot swap (${mounted(shell, 'doing').join(', ')})`, mounted(shell, 'doing').includes('slot.swap'));
  const swap = cardData(shell, 'doing', 'slot.swap');
  check('...prefilled with the headliner, picked from candidate rows', swap['actId'] === headliner);
  check('...to-stage is The Tent', swap['toStageId'] === tent);
  check('...at 21:00 — "at 9" read as the evening, by the parser, not the model', swap['time'] === '21:00');
  check('...on the festival clock\'s day, since the sentence named none', swap['day'] === 'sat');
  check('...and from-stage is the Main Stage, READ from the running order', swap['fromStageId'] === main);

  check(`when holds the radar and the running order (${mounted(shell, 'when').join(', ')})`, mounted(shell, 'when').includes('weather.radar') && mounted(shell, 'when').includes('lineup.timeline'));
  const radar = cardData(shell, 'when', 'weather.radar');
  check('...the radar is aimed at 21:00', radar['hour'] === 21 && radar['day'] === 'sat');
  check('...and has loaded the cell it was aimed at', JSON.stringify(radar['at'] ?? {}).includes('storm'));
  const timeline = cardData(shell, 'when', 'lineup.timeline');
  check('...the running order lights the headliner', timeline['highlightActId'] === headliner);
  check('...across every stage — "to the tent" did not narrow it to one', timeline['stageId'] === '' && Array.isArray(timeline['slots']) && timeline['slots'].length === 9); // 7 until slice 2a seeded two more Saturday-evening open-air sets (SCENARIOS.md scene 1).

  check(`about holds the headliner's card (${mounted(shell, 'about').join(', ')})`, mounted(shell, 'about').includes('act.card') && cardData(shell, 'about', 'act.card')['actId'] === headliner);
  check('...loaded: it knows her name', JSON.stringify(cardData(shell, 'about', 'act.card')['act'] ?? {}).includes('Nova Kestrel'));

  // ═══ 3. the instrument ═══════════════════════════════════
  const trace = cardData(shell, 'trace', 'intent.trace');
  const passes = passesOf(OPERATOR_PRINCIPAL);
  check(`the trace reports the passes it ran (${String(trace['pass'])})`, typeof trace['pass'] === 'number' && trace['pass'] >= 1);
  check(`...and how many questions the last one asked (${String(trace['questions'])})`, typeof trace['questions'] === 'number' && trace['questions'] > 0);
  check(`...and what that cost on the wire (${String(trace['bytes'])} bytes)`, typeof trace['bytes'] === 'number' && trace['bytes'] > 0);
  check('...against the fake provider, which is calibrated', String(trace['decider']).startsWith('fake@') && trace['calibrated'] === true);
  check('the act question was asked ONCE and shared by three cards', (passes.at(-1)?.questionNames ?? []).filter((name) => name.endsWith('/actId')).length === 1);
  check('no date, time or minute ever became a question', !(passes.at(-1)?.questionNames ?? []).some((name) => /\/(day|hour|time|minutes|body)$/.test(name)));

  // ═══ 4. nothing was committed ════════════════════════════
  const slot = (await sql(`SELECT stage_id, starts_at FROM slots WHERE act_id = $1`, [headliner]))[0];
  check('the model filled a form and pressed nothing: the headliner has not moved', slot?.['stage_id'] === main && slot?.['starts_at'] === '21:30');

  // ...and a PERSON pressing it moves her, and the room hears about it.
  const swapInstance = shell.getState().canvases['doing']?.stack.find((item) => item.definitionId === 'slot.swap');
  if (swapInstance !== undefined) shell.dispatch({ type: 'ui:click', ref: 'submit', origin: swapInstance.id });
  await settle(14);
  const moved = (await sql(`SELECT stage_id, starts_at FROM slots WHERE act_id = $1`, [headliner]))[0];
  check('a click on submit moves the set, through the vex mutation', moved?.['stage_id'] === tent && moved?.['starts_at'] === '21:00');
  check('...and the act card, a viewer, re-read it', JSON.stringify(cardData(shell, 'about', 'act.card')['act'] ?? {}).includes('The Tent'));

  // ═══ 5. clearing the line empties the room ═══════════════
  await typeLine(OPERATOR_PRINCIPAL, '');
  check('an empty line is an empty room', QUESTION_CANVASES.every((canvas) => mounted(shell, canvas).length === 0));
  check('...chips included', Array.isArray(cardData(shell, 'maybe', 'intent.options')['chips']) && JSON.stringify(cardData(shell, 'maybe', 'intent.options')['chips']) === '[]');
  check('...and the furniture stays', mounted(shell, 'line').join() === 'intent.line' && mounted(shell, 'trace').join() === 'intent.trace');

  // ═══ 6. the pacer: a burst is ONE pass ═══════════════════
  // This used to read "far fewer passes (2)": the first keystroke started a
  // pass at once and the rest queued behind it. With the quiet timer in front
  // (pacer.ts) nothing is in flight to queue behind: "st" has nothing to
  // decide and is never sent, each later keystroke re-arms the timer, and
  // exactly one pass goes — on the last text, a quiet beat after it.
  const before = passes.length;
  for (const prefix of PREFIXES) keystroke(OPERATOR_PRINCIPAL, prefix);
  await typeLine(OPERATOR_PRINCIPAL, SENTENCE);
  const burst = passesOf(OPERATOR_PRINCIPAL).slice(before);
  check(`nine keystrokes back to back are exactly ONE pass (${burst.length})`, burst.length === 1);
  check('...on the latest text, not a stale one', burst.at(-1)?.text === SENTENCE);
  check(`...sent once the line had been quiet for ${PASS_QUIET_MS} ms, and no later than the ${PASS_CEILING_MS} ms ceiling (waited ${burst[0]?.waitedMs.toFixed(0)} ms)`, (burst[0]?.waitedMs ?? 0) >= PASS_QUIET_MS - 5 && (burst[0]?.waitedMs ?? 9999) <= PASS_CEILING_MS + 50);
  const paced = cardData(shell, 'trace', 'intent.trace');
  check(`the trace says how long the pass waited and what it rode (${String(paced['waitedMs'])} ms, connection ${String(paced['connection'])})`, typeof paced['waitedMs'] === 'number' && paced['waitedMs'] >= PASS_QUIET_MS - 5 && paced['connection'] === 'reused');

  // ═══ 7. the instant lane ═════════════════════════════════
  // The fake is slowed so the window between "heard" and "decided" is wide
  // enough to stand in.
  await typeLine(OPERATOR_PRINCIPAL, '');
  check('a cleared line has heard nothing', JSON.stringify(cardData(shell, 'line', 'intent.line')['heard']) === '[]');
  if (decider.fakeLatency !== undefined) decider.fakeLatency.ms = 500;
  const landedBefore = passesOf(OPERATOR_PRINCIPAL).length;
  keystroke(OPERATOR_PRINCIPAL, SENTENCE);
  await new Promise((resolve) => setTimeout(resolve, PASS_QUIET_MS + 160));
  const heardEarly = JSON.stringify(cardData(shell, 'line', 'intent.line')['heard']);
  check('BEFORE the pass lands, the line already says what it heard…', passesOf(OPERATOR_PRINCIPAL).length === landedBefore && QUESTION_CANVASES.every((canvas) => mounted(shell, canvas).length === 0));
  check(`...the time it read, and the rows it matched — as matches: ${heardEarly}`, heardEarly.includes('"label":"21:00","state":"read"') && heardEarly.includes('"label":"Nova Kestrel — headliner","state":"matched"') && heardEarly.includes('"label":"The Tent — covered stage","state":"matched"'));
  await typeLine(OPERATOR_PRINCIPAL, SENTENCE);
  const heardLate = JSON.stringify(cardData(shell, 'line', 'intent.line')['heard']);
  check('AFTER it, Jev has confirmed them', passesOf(OPERATOR_PRINCIPAL).length > landedBefore && heardLate.includes('"label":"Nova Kestrel — headliner","state":"confirmed"') && heardLate.includes('"label":"The Tent — covered stage","state":"confirmed"') && heardLate.includes('"state":"read"') && !heardLate.includes('"matched"'));
  if (decider.fakeLatency !== undefined) decider.fakeLatency.ms = 0;
  await typeLine(OPERATOR_PRINCIPAL, 'at 9');
  check('a line with a value and nothing to decide is heard and not sent: "at 9" tags 21:00, and mounts nothing', JSON.stringify(cardData(shell, 'line', 'intent.line')['heard']).includes('21:00') && QUESTION_CANVASES.every((canvas) => mounted(shell, canvas).length === 0) && passesOf(OPERATOR_PRINCIPAL).at(-1)?.text === SENTENCE);

  // The burst's pass, not the last one: the instant-lane section slows the fake
  // on purpose, and that is not what a pass costs.
  const last = burst.at(-1);
  if (last !== undefined) {
    console.log(`\n       measured, full sentence, fake provider: ${last.questionCount} questions · ${last.requestBytes} bytes · ${last.totalMs.toFixed(1)} ms`);
    console.log(`       lanes (ms): ${Object.entries(last.lanes).map(([lane, ms]) => `${lane} ${ms.toFixed(1)}`).join(' · ')}`);
    console.log(`       top: ${last.top.map((entry) => `${entry.id} ${entry.p}`).join(' · ')}`);
  }

  await report('storm-check');
};

void main();
