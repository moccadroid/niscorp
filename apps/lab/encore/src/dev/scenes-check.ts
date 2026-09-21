// THE SCENES — SCENARIOS.md scenes 1–3, end to end, and the answer surface they
// stand on. Driven through a real shell on the fake providers; the agent is
// never stubbed (every run went through `encoreAgent.run()`), and for the turns
// where the default script is too dull to be the scene, a scene script plays the
// model — and is held to the same admission rule a model would be.
//
//   0. citations, as a pure rule: linked · dropped for an off-screen card ·
//      dropped for words that are not in the answer · a row that is not the
//      card's loses the row — and none of it rejects the answer
//   1. the impact card's verdicts, from seeded data: fits · tight · does not fit
//   2. scene 3 — a correction mid-sentence flips the to-stage IN PLACE
//   3. scene 2 — two intents, two forms; the message is written FROM the form
//      beside it, follows it, and never writes over the operator
//   4. the rail — a Jev-only turn in the operator's terms, persisting
//   5. scene 1 — the storm: exposure, an answer that cites its cards, attention
//      both ways, a follow-up that is TYPED, a plan, a button, "1 of 3"
//   6. the same room under a model with a middling opinion about everything
import { z } from 'zod';
import { LIAISON_PRINCIPAL, OPERATOR_PRINCIPAL } from '@encore/app/charter/assignments';
import { CATALOG_DEFINITIONS } from '@encore/app/action-catalog';
import type { AgentScript, FakeAgentControls } from '@encore/server/agent/fake-llm';
import { defaultScript } from '@encore/server/agent/fake-llm';
import { admitAnswer } from '@encore/server/intent/admission';
import { segmentsOf } from '@encore/server/intent/answer-spans';
import { ANSWER_WRITE_MS } from '@encore/server/intent/assist';
import { cardData, createReporter, createWorld, mounted, settle } from './world-factory';

const { check, report } = createReporter();

const STORM = 'storm at 9';
// (With its question mark: the fake judges a finished thought by SHAPE, and four
// short words are not one. A calibrated model needs no such help.)
const OPTIONS = 'what are our options?';
const TWO_INTENTS = 'move the headliner to the tent at 9 and tell everyone';
const TO_THE_TENT = 'move headliner to the tent';
const NO_THE_GROVE = 'move headliner to the tent no the grove';

const Verdict = z.object({ result: z.object({ verdict: z.string(), tone: z.string(), line: z.string() }).loose() }).loose();
const Verdicts = z.object({ result: z.array(z.object({ key: z.string(), verdict: z.string(), tone: z.string(), line: z.string() })) }).loose();
const Segments = z.array(z.object({ text: z.string(), card: z.string(), row: z.string() }));
const Entries = z.array(z.object({ key: z.string(), by: z.string(), line: z.string(), said: z.string(), full: z.string() }).loose());
const Steps = z.array(z.object({ index: z.number(), label: z.string(), opened: z.boolean(), done: z.boolean() }));
const Slots = z.array(z.object({ act_name: z.string(), exposed: z.boolean(), exposure_tone: z.string(), stage_kind: z.string() }).loose());

const main = async (): Promise<void> => {
  // ═══ 0. citations — the rule, pure ═══════════════════════
  const definitions = CATALOG_DEFINITIONS;
  const candidates = { acts: [{ id: 'act_a', label: 'Act A — headliner' }], stages: [{ id: 'stage_x', label: 'Stage X — open-air' }] };
  // (Restated 2026-09-21, the redesign: an answer is AT MOST TWO SENTENCES now, and a
  // third is refused — so the fixture says its three things in two. The claims below
  // are still exact substrings of it.)
  const RESPONSE = 'Three sets are exposed; Act A is the one that matters. The Tent is covered.';
  const context = {
    allowed: new Set(['lineup.timeline', 'weather.radar', 'slot.swap']),
    definitions,
    candidates,
    writable: [],
    onScreen: new Set(['lineup.timeline']),
    rowsOn: (card: string): ReadonlySet<string> => new Set(card === 'lineup.timeline' ? ['slot_1'] : []),
  };
  const cited = admitAnswer(
    context,
    {
      claims: [
        { text: 'Three sets are exposed', card: 'lineup.timeline' },
        { text: 'Act A is the one that matters.', card: 'lineup.timeline', row: 'act_a' },
        { text: 'The Tent is covered.', card: 'stage.view' },
        { text: 'Nobody said this.', card: 'lineup.timeline' },
        { text: 'Three sets', card: 'lineup.timeline', row: 'slot_999' },
      ],
      followUps: ['what are our options', '  who needs to know  ', 'what are our options', 'x'.repeat(61), 'how full is the arena', 'a fourth'],
    },
    RESPONSE,
  );
  // ...and what the thread has already asked is not offered again.
  const notAgain = admitAnswer(
    { ...context, asked: ['What are our options?'] },
    {
      followUps: ['what are our options', 'who needs to know', 'how full is the arena'],
    },
    RESPONSE,
  );
  check('a claim whose words are in the answer and whose card is on screen is ADMITTED, with its row', cited.ok && cited.claims.some((claim) => claim.text === 'Act A is the one that matters.' && claim.card === 'lineup.timeline' && claim.row === 'act_a'));
  check('a claim on a card that is NOT on screen is dropped, with a note', cited.ok && !cited.claims.some((claim) => claim.card === 'stage.view') && cited.notes.some((note) => note.includes('"stage.view" is not on screen')));
  check('a claim whose text is NOT a substring of the answer is dropped, with a note', cited.ok && !cited.claims.some((claim) => claim.text === 'Nobody said this.') && cited.notes.some((note) => note.includes('is not in the answer')));
  check('a row that is not one of the card’s rows is dropped — the words still stand on the card', cited.ok && cited.claims.some((claim) => claim.text === 'Three sets' && claim.row === '') && cited.notes.some((note) => note.includes('slot_999')));
  check(`NONE of that rejects the answer: ${cited.ok ? cited.claims.length : 0} claims stand, ${cited.ok ? cited.notes.length : 0} notes`, cited.ok && cited.claims.length === 3);
  // (Restated 2026-09-21: at most TWO, and never one this thread already asked.)
  check(`follow-ups: at most two, trimmed, no repeats, none over 60 characters (${cited.ok ? cited.followUps.join(' · ') : ''})`, cited.ok && cited.followUps.join('|') === 'what are our options|who needs to know' && cited.notes.some((note) => note.includes('follow-up')));
  check(`...and never one the thread has already asked (${notAgain.ok ? notAgain.followUps.join(' · ') : ''})`, notAgain.ok && notAgain.followUps.join('|') === 'who needs to know|how full is the arena' && notAgain.notes.some((note) => note.includes('already asked')));
  const placedAndCited = admitAnswer({ ...context, onScreen: new Set<string>() }, { canvases: { when: [{ actionId: 'weather.radar', input: { day: 'sat', hour: 21 } }] }, claims: [{ text: 'The Tent is covered.', card: 'weather.radar' }] }, RESPONSE);
  check('a card the SAME answer places may be stood on: placing evidence and citing it is one move', placedAndCited.ok && placedAndCited.claims.length === 1);
  const wrongCard = admitAnswer(context, { canvases: { when: [{ actionId: 'weather.radar', input: { hour: 99 } }] }, claims: [{ text: 'Three sets are exposed', card: 'lineup.timeline' }] }, RESPONSE);
  check('...while a wrong INPUT still rejects the whole answer, citations and all', !wrongCard.ok);

  const spans = segmentsOf(RESPONSE, cited.ok ? cited.claims : []);
  check(`the answer is cut into spans: cited ones carry their card, the rest carry none (${spans.map((span) => (span.card === '' ? '·' : span.card)).join(' ')})`, spans.map((span) => span.text).join('') === RESPONSE && spans.filter((span) => span.card !== '').length === 2 && spans.at(-1)?.card === '' && spans.at(-1)?.text.includes('The Tent is covered.') === true);
  check('...two claims over the same words cannot both be underlined: the first one wins', spans.filter((span) => span.text.includes('Three sets')).length === 1);

  // ═══ the world ═══════════════════════════════════════════
  const controls: FakeAgentControls = { latencyMs: 0, chunkMs: 0, seen: [] };
  // What Jev was actually ASKED, pass by pass: the options are the proof.
  const asked: Record<string, unknown>[] = [];
  const world = await createWorld({ agent: { kind: 'fake', fake: controls }, onDecided: (principal, pass) => { if (principal === OPERATOR_PRINCIPAL) asked.push(pass.questions); } });
  const OP = OPERATOR_PRINCIPAL;
  const shell = await world.login(OP);
  await settle();
  const loop = world.booted.intent.of(OP);
  const answerCard = (): Record<string, unknown> => cardData(shell, 'assist', 'assist.answer');
  const rail = (): z.infer<typeof Entries> => Entries.parse(cardData(shell, 'rail', 'assist.rail')['entries'] ?? []);
  const instanceOn = (canvas: string, actionId: string): string => shell.getState().canvases[canvas]?.stack.find((item) => item.definitionId === actionId)?.id ?? '';
  const servedOf = (actionId: string): string => world.servedTo(OP).filter((message) => message.includes(`"definitionId":"${actionId}"`)).at(-1) ?? '';
  const lastRun = (): ReturnType<typeof world.runsOf>[number] | undefined => world.runsOf(OP).at(-1);
  const ask = async (fingerprint: string, context: Record<string, unknown>): Promise<unknown> => (await world.asPrincipal(OP, '/api/vex', { fingerprint, context })).json;

  // ═══ 1. the impact card's verdicts ═══════════════════════
  const capacity = async (stageId: string, draw: number): Promise<z.infer<typeof Verdict>['result']> => Verdict.parse(await ask('impact/capacity', { stageId, draw })).result;
  const tent = await capacity('stage_tent', 22000);
  const main22 = await capacity('stage_main', 22000);
  const tent4 = await capacity('stage_tent', 4000);
  check(`The Tent (6,000) against a 22,000 draw DOES NOT FIT: "${tent.line}"`, tent.verdict === 'does not fit' && tent.tone === 'alert' && tent.line === '22,000 expected · The Tent holds 6,000');
  check(`the Main Stage against the same draw is TIGHT (${main22.line}); 4,000 in The Tent FITS`, main22.verdict === 'tight' && main22.tone === 'warn' && tent4.verdict === 'fits' && tent4.tone === 'good');
  const stageDay = async (fromMin: number, toMin: number): Promise<z.infer<typeof Verdicts>['result']> => Verdicts.parse(await ask('impact/stageDay', { stageId: 'stage_tent', day: 'sat', actId: 'act_nova_kestrel', fromMin, toMin })).result;
  const at2100 = await stageDay(1260, 1350);
  const at2000 = await stageDay(1200, 1245);
  const at1715 = await stageDay(1035, 1080);
  check(`21:00 in The Tent CLASHES, and names who with: "${at2100[0]?.line}"`, at2100[0]?.key === 'clash' && at2100[0].verdict === 'does not fit' && at2100[0].line.includes('Velvet Arcade'));
  check(`a set that ends as the next begins has no changeover: "${at2000[1]?.line}"; forty minutes clear either side is fine: "${at1715[1]?.line}"`, at2000[0]?.verdict === 'fits' && at2000[1]?.verdict === 'does not fit' && at1715[1]?.verdict === 'fits');
  const cover = async (hour: number, kind: string): Promise<string> => Verdict.parse(await ask('impact/cover', { day: 'sat', hour, kind })).result.verdict;
  check('weather: under a roof always fits; open-air in the storm does not; open-air under a rain warning is tight', (await cover(21, 'covered')) === 'fits' && (await cover(21, 'open-air')) === 'does not fit' && (await cover(20, 'open-air')) === 'tight' && (await cover(15, 'open-air')) === 'fits');

  // ═══ 2. scene 3 — change your mind mid-sentence ══════════
  const runsBeforeScene3 = world.runsOf(OP).length;
  await world.typeLine(OP, TO_THE_TENT);
  const formBefore = instanceOn('doing', 'slot.swap');
  const swap = (): Record<string, unknown> => cardData(shell, 'doing', 'slot.swap');
  const impact = (): Record<string, unknown> => cardData(shell, 'nearby', 'move.impact');
  check(`"${TO_THE_TENT}" → the form, aimed at The Tent — and the impact card BESIDE it, aimed the same (${mounted(shell, 'nearby').join(', ')})`, swap()['toStageId'] === 'stage_tent' && impact()['toStageId'] === 'stage_tent' && impact()['actId'] === swap()['actId'] && swap()['actId'] === 'act_nova_kestrel');
  check(`...there because the form is, and saying so: "${String(impact()['placedBy'])}"`, impact()['placedBy'] === 'with Move a set');
  await world.typeLine(OP, NO_THE_GROVE);
  check('"…no the grove" flips the to-stage to The Grove', swap()['toStageId'] === 'stage_grove');
  check('...IN PLACE: the very same form instance, nothing else on it touched', instanceOn('doing', 'slot.swap') === formBefore && formBefore !== '' && swap()['actId'] === 'act_nova_kestrel' && swap()['fromStageId'] === 'stage_main');
  check('...the pass says it wrote one key, and re-opened nothing on `doing`', world.passesOf(OP).at(-1)?.notes.some((note) => note.startsWith('doing: set toStageId') && note.endsWith('on slot.swap')) === true && // (2026-09-21, the surface: the card's "why?" line quotes the sentence, so it is rewritten beside the stage — in place, like it)
     world.passesOf(OP).at(-1)?.notes.some((note) => note.startsWith('doing: re-opened') || note.startsWith('doing: placed')) === false);
  const groveFit = Verdict.shape.result.safeParse(impact()['fit']);
  check(`the impact card re-aimed with it, and is RED: "${groveFit.success ? groveFit.data.line : ''}"`, impact()['toStageId'] === 'stage_grove' && groveFit.success && groveFit.data.verdict === 'does not fit' && groveFit.data.line.includes('The Grove holds 4,000') && servedOf('move.impact').includes('"tone":"alert"'));
  // (2026-09-21: the correction is READ now — intent/supersede.ts — and the fake
  // scorer's negation cue is gone, so what the assertions above prove is the lane.)
  const flipPass = world.passesOf(OP).at(-1);
  check(`...BECAUSE THE TENT WAS NOT AN OPTION: the lane took it back before Jev was asked (${flipPass?.superseded.map((entry) => `${entry.label.split(' — ')[0]} → ${entry.by.label.split(' — ')[0]}`).join(', ')})`, flipPass?.superseded.some((entry) => entry.id === 'stage_tent' && entry.by.id === 'stage_grove') === true && JSON.stringify(asked.at(-1) ?? {}).includes('The Grove') && !JSON.stringify(asked.at(-1) ?? {}).includes('The Tent —'));
  check(`...and the line under the sentence shows the survivor: ${JSON.stringify(cardData(shell, 'line', 'intent.line')['heard'])}`, JSON.stringify(cardData(shell, 'line', 'intent.line')['heard']).includes('The Grove') && !JSON.stringify(cardData(shell, 'line', 'intent.line')['heard']).includes('The Tent'));
  await world.settled(OP);
  check('THE AGENT DID NOT RUN: this is what 300 ms is for', world.runsOf(OP).length === runsBeforeScene3 && controls.seen.length === 0 && mounted(shell, 'assist').length === 0);

  // A VALUE THE SENTENCE NO LONGER SAYS GOES BACK (seen live: a form kept 21:00
  // from an earlier sentence that the new one never said).
  await world.typeLine(OP, 'move headliner to the tent at 9');
  const timedForm = instanceOn('doing', 'slot.swap');
  check('"…at 9" fills the new start', swap()['time'] === '21:00');
  await world.typeLine(OP, 'move headliner to the grove');
  check(`a sentence that says no time leaves NO time on the form ("${String(swap()['time'])}") — in place, same instance`, swap()['time'] === '' && swap()['toStageId'] === 'stage_grove' && instanceOn('doing', 'slot.swap') === timedForm);
  world.dispatchOn(OP, 'doing', { type: 'ui:model', ref: 'time', payload: '20:15' }, 'slot.swap');
  await settle(4);
  await world.typeLine(OP, 'move headliner to the tent');
  check('...unless a person typed it: a touched field is theirs, said or not', swap()['time'] === '20:15' && swap()['toStageId'] === 'stage_tent');
  await world.typeLine(OP, '');
  await world.settled(OP);

  // ═══ 3. scene 2 — say it once ════════════════════════════
  await world.typeLine(OP, TWO_INTENTS);
  const twoPass = world.passesOf(OP).at(-1);
  const body = (): string => String(cardData(shell, 'doing', 'push.compose')['body']);
  check(`TWO intents, TWO forms, both in \`doing\`, both aimed (${mounted(shell, 'doing').join(' + ')})`, [...mounted(shell, 'doing')].sort().join() === 'push.compose,slot.swap' && swap()['toStageId'] === 'stage_tent' && swap()['time'] === '21:00' && cardData(shell, 'doing', 'push.compose')['audience'] === 'everyone');
  check(`...the message a draft of the operator’s own sentence until somebody writes it; routed ${twoPass?.handoff.route}`, body() === TWO_INTENTS && twoPass?.handoff.route === 'write');
  await world.settled(OP);
  const firstDraft = body();
  check(`the agent wrote the message FROM THE FORM BESIDE IT: "${firstDraft}"`, lastRun()?.status === 'landed' && lastRun()?.mode === 'write' && firstDraft.startsWith('Nova Kestrel moves to The Tent, 21:00.'));
  const handedScreen = controls.seen.at(-1)?.messages.map((message) => message.content).join('\n') ?? '';
  check('...because it was HANDED what that form holds: the act, the stage and the time, as the form has them', handedScreen.includes('"card":"slot.swap"') && handedScreen.includes('"toStageId":"stage_tent"') && handedScreen.includes('"time":"21:00"'));

  const impactBefore = instanceOn('nearby', 'move.impact');
  const runsBeforeEdit = world.runsOf(OP).length;
  world.dispatchOn(OP, 'doing', { type: 'ui:model', ref: 'time', payload: '22:00' }, 'slot.swap');
  await settle(4);
  check('the operator changes the time IN THE FORM: the impact card follows, in place — same instance, new verdicts', impact()['time'] === '22:00' && instanceOn('nearby', 'move.impact') === impactBefore && impactBefore !== '');
  await world.settled(OP);
  check(`...and so does the draft: "${body()}"`, world.runsOf(OP).length === runsBeforeEdit + 1 && body().startsWith('Nova Kestrel moves to The Tent, 22:00.') && lastRun()?.fieldsWritten.join() === 'push.compose.body');

  world.dispatchOn(OP, 'doing', { type: 'ui:model', ref: 'body', payload: 'MY OWN WORDS' }, 'push.compose');
  await settle(2);
  world.dispatchOn(OP, 'doing', { type: 'ui:model', ref: 'time', payload: '22:30' }, 'slot.swap');
  await world.settled(OP);
  check(`UNLESS the operator has touched the message — then it never does: "${body()}" (the run wrote ${lastRun()?.fieldsWritten.length} fields)`, body() === 'MY OWN WORDS' && lastRun()?.fieldsWritten.length === 0 && swap()['time'] === '22:30');

  // ═══ 4. the rail ═════════════════════════════════════════
  // (The line is cleared first: a form that outlives a sentence keeps what a
  // person typed into it, and this turn should be about THIS sentence.)
  await world.typeLine(OP, '');
  await world.settled(OP);
  await world.typeLine(OP, TO_THE_TENT);
  await world.settled(OP);
  await world.typeLine(OP, 'bar sales today');
  await world.settled(OP);
  const movedEntry = rail().find((entry) => entry.line === TO_THE_TENT);
  check(`a turn Jev handled alone is on the rail IN THE OPERATOR’S TERMS: "${movedEntry?.said}"`, movedEntry?.by === 'cards' && movedEntry.said === 'moved Nova Kestrel → The Tent · not submitted');
  check(`...newest nearest the line (${rail().map((entry) => entry.line).slice(0, 3).join(' | ')})`, rail()[0]?.line === TO_THE_TENT && rail().some((entry) => entry.line === TWO_INTENTS && entry.by === 'agent'));
  await world.typeLine(OP, '');
  await world.typeLine(OP, 'who is on the main stage');
  check('THE RAIL PERSISTS: another sentence, another room — the same entries, and one more', rail().some((entry) => entry.line === TO_THE_TENT) && rail()[0]?.line === 'bar sales today' && mounted(shell, 'rail').join() === 'assist.rail');
  // (2026-09-21, the redesign: the history is one line — "Earlier · n" — until it is
  // pressed; an entry can only be clicked once it is open.)
  world.dispatchOn(OP, 'rail', { type: 'ui:click', ref: 'earlierOpen' }, 'assist.rail');
  await settle(2);
  world.dispatchOn(OP, 'rail', { type: 'ui:click', ref: 'entry', payload: movedEntry?.key ?? '' });
  await settle(2);
  check('clicking an entry opens it — one at a time — and the terminal is served the whole of it', cardData(shell, 'rail', 'assist.rail')['open'] === movedEntry?.key && servedOf('assist.rail').includes('"open":"') && servedOf('assist.rail').includes('not submitted'));
  await world.typeLine(OP, '');
  await world.settled(OP);
  await loop?.newThread();

  // ═══ 5. scene 1 — the storm ══════════════════════════════
  controls.seen.length = 0;
  controls.chunkMs = 45;
  await world.typeLine(OP, STORM);
  const stormPass = world.passesOf(OP).at(-1);
  const slots = Slots.parse(cardData(shell, 'when', 'lineup.timeline')['slots'] ?? []);
  const exposed = slots.filter((slot) => slot.exposed);
  check(`"${STORM}" → tone ${String(cardData(shell, 'line', 'intent.line')['tone'])}, the radar aimed at 21:00, the running order beside it`, cardData(shell, 'line', 'intent.line')['tone'] === 'elevated' && cardData(shell, 'when', 'weather.radar')['hour'] === 21 && mounted(shell, 'when').includes('lineup.timeline'));
  check(`EVERY EXPOSED SET IS LIT: ${exposed.map((slot) => slot.act_name).join(', ')} — open-air, under the warning, in the alert tone; nothing under a roof is`, exposed.length === 3 && exposed.every((slot) => slot.exposure_tone === 'alert' && slot.stage_kind === 'open-air') && slots.filter((slot) => !slot.exposed).every((slot) => slot.exposure_tone === '') && exposed.some((slot) => slot.act_name === 'Nova Kestrel') && !exposed.some((slot) => slot.act_name === 'Velvet Arcade'));
  check('...drawn by a timeline that was only told which key is a tone', servedOf('lineup.timeline').includes('"toneKey":"exposure_tone"'));
  check(`a statement of a problem is a question: route ${stormPass?.handoff.route} (${stormPass?.handoff.routedBy}), and Jev chose the facts: ${stormPass?.handoff.packs.map((pack) => pack.id).join(', ')}`, stormPass?.handoff.route === 'ask' && stormPass.handoff.packs.some((pack) => pack.id === 'exposure') && stormPass.handoff.packs.some((pack) => pack.id === 'weather'));
  check(`THE SAME PASS put the exchange up, the question on it: "${String(answerCard()['question'])}"`, answerCard()['status'] === 'pending' && answerCard()['question'] === STORM);

  await world.settled(OP);
  const stormRun = lastRun();
  const segments = Segments.parse(answerCard()['segments']);
  const linked = segments.filter((segment) => segment.card !== '');
  check(`the answer landed as SPANS: ${linked.length} cite a card, ${segments.length - linked.length} stand on nothing (${linked.map((segment) => `"${segment.text}" → ${segment.card}`).join(' · ')})`, stormRun?.status === 'landed' && segments.map((segment) => segment.text).join('') === stormRun.answer && linked.length === 2 && segments.length > linked.length && answerCard()['landed'] === true);
  check('...every cited card is ON SCREEN, and the exposed sets stand on the running order that lights them', linked.every((segment) => mounted(shell, 'when').includes(segment.card)) && linked.some((segment) => segment.text === '3 exposure.sets' && segment.card === 'lineup.timeline'));
  check('...served as spans the kit can link, unsupported words marked as such', servedOf('assist.answer').includes('"name":"Spans"') && servedOf('assist.answer').includes('"markUnlinked":true'));
  check(`the status says what happened, in the operator’s terms: "${String(answerCard()['say'])}"`, /^read which sets are exposed and the weather · \d+\.\d s$/.test(String(answerCard()['say'])));
  const gaps = (stormRun?.answerWrites ?? []).slice(1).map((at, index) => at - (stormRun?.answerWrites[index] ?? 0));
  check(`every write the run made to the card kept the ${ANSWER_WRITE_MS} ms budget — spans included (${stormRun?.answerWrites.length} writes, gaps ${gaps.map((gap) => Math.round(gap)).join(', ')} ms)`, (stormRun?.answerWrites.length ?? 0) >= 2 && gaps.every((gap) => gap >= ANSWER_WRITE_MS));
  controls.chunkMs = 0;

  // Attention, both ways, over one channel.
  const radar = (): Record<string, unknown> => cardData(shell, 'when', 'weather.radar');
  const timeline = (): Record<string, unknown> => cardData(shell, 'when', 'lineup.timeline');
  world.dispatchOn(OP, 'assist', { type: 'ui:focus', ref: 'answer', payload: 'weather.radar' });
  await settle(2);
  check('POINT AT A SENTENCE and the card it cites lights — that card, and no other', radar()['lit'] === radar()['citeKey'] && radar()['citeKey'] === 'weather.radar' && timeline()['lit'] !== timeline()['citeKey'] && servedOf('weather.radar').includes('"name":"Spotlight"'));
  world.dispatchOn(OP, 'assist', { type: 'ui:blur', ref: 'answer' });
  await settle(2);
  check('...look away and it goes out', radar()['lit'] === '' && answerCard()['lit'] === '');
  world.dispatchOn(OP, 'when', { type: 'ui:focus', ref: 'spot', payload: 'lineup.timeline' }, 'lineup.timeline');
  await settle(2);
  check('POINT AT A CARD and its sentence lights: the answer is told which key has the room’s attention', answerCard()['lit'] === 'lineup.timeline' && timeline()['lit'] === 'lineup.timeline' && radar()['lit'] !== radar()['citeKey']);
  world.dispatchOn(OP, 'when', { type: 'ui:blur', ref: 'spot' }, 'lineup.timeline');
  await settle(2);
  check('...and neither side knows the other: no authored card mentions citations, and the kit has never heard of an agent', !JSON.stringify(CATALOG_DEFINITIONS['weather.radar']).includes('cite') && answerCard()['lit'] === '');

  // A follow-up is TYPED.
  const followUps = z.array(z.object({ text: z.string() })).parse(answerCard()['followUps']);
  check(`the answer proposes what to say next: ${followUps.map((next) => next.text).join(' · ')}`, followUps.length === 2 && followUps.some((next) => next.text === OPTIONS)); // (2026-09-21: at most two)
  const runsBeforeChip = world.runsOf(OP).length;
  const stepsBeforeChip = controls.seen.length;
  const passesBeforeChip = world.passesOf(OP).length;
  world.dispatchOn(OP, 'assist', { type: 'ui:click', ref: 'followUp', payload: OPTIONS });
  await settle(2);
  await loop?.idle();
  await settle(8);
  check(`pressing it TYPES IT INTO THE LINE: "${String(cardData(shell, 'line', 'intent.line')['text'])}"`, cardData(shell, 'line', 'intent.line')['text'] === OPTIONS);
  check('...which made an ordinary PASS of it — Jev routed it like any sentence', world.passesOf(OP).length > passesBeforeChip && world.passesOf(OP).at(-1)?.text === OPTIONS);
  check('...and did NOT call the agent: no run, no model step — only a card saying one is coming', world.runsOf(OP).length === runsBeforeChip && controls.seen.length === stepsBeforeChip && answerCard()['status'] === 'pending' && answerCard()['question'] === OPTIONS);
  check('a new sentence is a new room: Jev opens nothing for it, and the old exchange is gone', ['doing', 'about', 'where', 'when', 'nearby'].every((canvas) => mounted(shell, canvas).length === 0));

  // The plan. The scene's model: it read the thread, and proposes three forms.
  const scenePlan: AgentScript = (turn) =>
    turn.predecisions.sentence !== OPTIONS
      ? defaultScript(turn)
      : {
          answer: {
            // (2026-09-21: two sentences — the steps say the rest.)
            response: 'Three things, in order: hold her, do not move her to The Grove, tell everyone. Nothing is sent until you press it.',
            data: {
              steps: [
                { say: 'Hold Nova Kestrel 45 minutes', actionId: 'set.delay', input: { actId: 'act_nova_kestrel', minutes: 45 } },
                { say: 'Move Nova Kestrel to The Grove', actionId: 'slot.swap', input: { actId: 'act_nova_kestrel', toStageId: 'stage_grove', time: '21:30' } },
                { say: 'Push to everyone on site', actionId: 'push.compose', input: { audience: 'everyone', urgency: 2 } },
              ],
              followUps: ['who needs to know'],
            },
          },
        };
  controls.script = scenePlan;
  await world.settled(OP);
  const planRun = lastRun();
  const handedRows = controls.seen.at(-1)?.messages.map((message) => message.content).join('\n') ?? '';
  check(`the plan landed (${planRun?.status}, ${planRun?.planSteps} steps) — naming an act THIS sentence never retrieved`, planRun?.status === 'landed' && planRun.planSteps === 3 && world.passesOf(OP).at(-1)?.handoff.entities.length === 0);
  check('...because the conversation had put her on the table: the rows the LAST answer was handed are rows this one may name', handedRows.includes('act_nova_kestrel = Nova Kestrel') && planRun?.threadMessages === 2);
  check('a plan opens nothing by itself', mounted(shell, 'doing').length === 0 && Steps.parse(answerCard()['steps']).every((step) => !step.opened && !step.done));

  world.dispatchOn(OP, 'assist', { type: 'ui:click', ref: 'step', payload: 1 });
  await world.settled(OP);
  const groveImpact = Verdict.shape.result.safeParse(impact()['fit']);
  check('pressing a step opens its form PREFILLED', swap()['actId'] === 'act_nova_kestrel' && swap()['toStageId'] === 'stage_grove' && swap()['placedBy'] === 'scripted · step 2');
  check(`...with the impact card beside it, aimed by the form, and RED where the step does not fit: "${groveImpact.success ? groveImpact.data.line : ''}"`, impact()['toStageId'] === 'stage_grove' && impact()['actId'] === 'act_nova_kestrel' && groveImpact.success && groveImpact.data.verdict === 'does not fit' && groveImpact.data.line === '22,000 expected · The Grove holds 4,000' && servedOf('move.impact').includes('"tone":"alert"'));
  check('...opened, not done: the plan has not ticked', Steps.parse(answerCard()['steps'])[1]?.opened === true && Steps.parse(answerCard()['steps']).every((step) => !step.done) && answerCard()['progress'] === '');

  // The operator presses THE BUTTON.
  const stageOf = async (): Promise<unknown> => (await world.sql(`SELECT stage_id FROM slots WHERE act_id = 'act_nova_kestrel'`))[0]?.['stage_id'];
  const turnsBeforePress = (await world.sql('SELECT count(*)::int AS n FROM agent_turns WHERE principal = $1', [OP]))[0]?.['n'];
  check('nothing has been submitted for them', (await stageOf()) === 'stage_main');
  world.dispatchOn(OP, 'doing', { type: 'ui:click', ref: 'submit' }, 'slot.swap');
  await settle(8);
  await world.settled(OP);
  const Act = z.object({ stage_name: z.string() }).loose();
  check('THE WRITE LANDED — the operator’s press, through the form’s own mutation', (await stageOf()) === 'stage_grove' && swap()['saved'] === true);
  check('...and every card reading that table re-read it: the form and the impact card both say where she is NOW', Act.safeParse(swap()['act']).data?.stage_name === 'The Grove' && Act.safeParse(impact()['act']).data?.stage_name === 'The Grove');
  const pressed = rail()[0];
  check(`THE RAIL RECORDS IT, as what it was: [${pressed?.by}] "${pressed?.line}"`, pressed?.by === 'pressed' && pressed.line === 'moved Nova Kestrel → The Grove, 21:30 · submitted');
  check('...a row like any other turn — the one kind nobody typed', (await world.sql(`SELECT role FROM agent_turns WHERE principal = $1 ORDER BY seq DESC LIMIT 1`, [OP]))[0]?.['role'] === 'did' && (await world.sql('SELECT count(*)::int AS n FROM agent_turns WHERE principal = $1', [OP]))[0]?.['n'] === Number(turnsBeforePress) + 1);
  check(`THE PLAN TICKS: ${String(answerCard()['progress'])}`, answerCard()['progress'] === '1 of 3' && Steps.parse(answerCard()['steps']).filter((step) => step.done).map((step) => step.index).join() === '1');
  controls.script = undefined;
  await world.typeLine(OP, '');
  await world.settled(OP);

  // ═══ 6. a model with a middling opinion about everything ═
  // The lexical fake answers an unrelated question with zero; a calibrated model
  // almost never does. Turn the floor up and run the rules that have to survive.
  const middling = world.booted.decider.fakeMiddling;
  if (middling === undefined) throw new Error('scenes-check: the decider has no middling knob');
  middling.floor = 0.4;
  await world.typeLine(OP, 'do that for them too please');
  const coldPass = world.passesOf(OP).at(-1);
  const guesses = cardData(shell, 'maybe', 'intent.options')['chips'];
  check(`under a middling model a cold follow-up is ALL GUESSES (${Array.isArray(guesses) ? guesses.length : 0} chips, nothing mounted)…`, Array.isArray(guesses) && guesses.length >= 8 && ['doing', 'about', 'where', 'when', 'nearby'].every((canvas) => mounted(shell, canvas).length === 0));
  check(`...and STILL goes to the agent: route ${coldPass?.handoff.route} (${coldPass?.handoff.routedBy}: ${coldPass?.handoff.computedWhy})`, coldPass?.handoff.route === 'ask' && coldPass.handoff.routedBy === 'computed' && coldPass.handoff.computedWhy.includes('only guesses'));
  await world.settled(OP);
  check('...which answers it', lastRun()?.status === 'landed' && lastRun()?.routedBy === 'computed');
  await world.typeLine(OP, 'move the headliner to the tent at 9');
  const middlingTop = world.passesOf(OP).at(-1)?.top.find((entry) => entry.id === 'move.impact');
  check(`...the impact card stands beside the form though Jev alone would only have offered it (${middlingTop?.p ?? 'unranked'})`, mounted(shell, 'doing').includes('slot.swap') && mounted(shell, 'nearby').includes('move.impact') && (middlingTop === undefined || middlingTop.p < 0.8));
  await world.typeLine(OP, 'move the headliner right away please');
  const noStage = world.passesOf(OP).at(-1);
  check(`...and with no stage said there is a form and NO impact card — which is not "a card Jev wanted and could not open": route ${noStage?.handoff.route}, nothing computed`, mounted(shell, 'doing').includes('slot.swap') && !mounted(shell, 'nearby').includes('move.impact') && noStage?.handoff.route === 'direct' && noStage.handoff.computedWhy === '' && (noStage.handoff.completeP ?? 0) >= 0.6);
  middling.floor = 0;
  await world.typeLine(OP, '');
  await world.settled(OP);

  // Exposure is the DATABASE's fact: put a set under a roof and it clears.
  await world.sql(`UPDATE slots SET stage_id = 'stage_tent', starts_at = '17:00' WHERE act_id = 'act_tidal_bloom'`);
  check('exposure is kept by the database: a set moved under a roof is no longer exposed, in the same write', (await world.sql(`SELECT exposure FROM slots WHERE act_id = 'act_tidal_bloom'`))[0]?.['exposure'] === 0 && Number((await world.sql(`SELECT count(*)::int AS n FROM slots WHERE day = 'sat' AND exposure > 0`))[0]?.['n']) === 2);

  // The liaison: no swap, so no companion either.
  const liaison = await world.login(LIAISON_PRINCIPAL);
  await settle();
  await world.typeLine(LIAISON_PRINCIPAL, 'move the headliner to the tent at 9');
  check('the liaison holds neither the form nor its companion: absent, not disabled', !mounted(liaison, 'doing').includes('slot.swap') && !mounted(liaison, 'nearby').includes('move.impact') && !world.passesOf(LIAISON_PRINCIPAL).flatMap((pass) => pass.questionNames).includes('action/move.impact'));

  await report('scenes-check', [world]);
};

void main();
