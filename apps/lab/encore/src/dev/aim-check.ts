// THE TWO MODELS FINISH EACH OTHER'S WORK — and the room says why a card is not up.
//
// Seen on the real models: "who's playing right now?" — Jev wanted the act's card
// (0.70) and could not aim it, because the sentence names no act; the assistant's
// own answer NAMED the act on stage, from the facts it was handed, and could not
// aim the card either, because only rows retrieved from the operator's words were
// admissible. Both halves were right, and the card stayed a chip.
//
//   a. x-ray's story gives the reason for every card above the line that is not up
//   b. the assistant is told what Jev wanted and could not aim — and aims it, from
//      the facts it was handed; the card mounts, says so in "why?", and stays put
//   c. a row it LOOKED UP in this run is as nameable as a row of a pack
//   d. an id from nowhere still rejects the whole answer — the law is unchanged
//   e. the liaison's packs never widen what they can aim at
//   f. with the agent off the card stays a chip, and the story says why
//   g. x-ray's key is a chord: nothing is typed into the line
import { z } from 'zod';
import { XRAY_CHORD } from '@encore/app/actions/frame/intent-trace.layout';
import { LIAISON_PRINCIPAL, OPERATOR_PRINCIPAL } from '@encore/app/charter/assignments';
import type { FakeAgentControls } from '@encore/server/agent/fake-llm';
import { predecisionsIn } from '@encore/server/agent/predecisions';
import { YES_AT } from '@encore/server/intent/resolve';
import { chordsOf, fires, isCharacter } from '@encore/ui/components/chords';
import { cardData, createReporter, createWorld, mounted, settle } from './world-factory';

const { check, report } = createReporter();

const ON_STAGE = 'which act is on stage right now?';
const FLOOR = 0.4;

const StoryCards = z.object({ cards: z.array(z.object({ id: z.string(), label: z.string(), p: z.number(), note: z.string() })), assistant: z.array(z.object({ text: z.string() })).default([]) }).loose();

const press = (key: string, held: { ctrl?: boolean; meta?: boolean; alt?: boolean } = {}): { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean } => ({ key, ctrlKey: held.ctrl === true, metaKey: held.meta === true, altKey: held.alt === true, shiftKey: false });

const main = async (): Promise<void> => {
  const OP = OPERATOR_PRINCIPAL;

  // ═══ f, a. the agent off: a chip, and a reason ═══════════
  const alone = await createWorld({ agent: { kind: 'off' }, decider: { noulFloor: FLOOR } });
  const aloneShell = await alone.login(OP);
  await settle();
  await alone.typeLine(OP, ON_STAGE);
  await alone.settled(OP);
  const alonePass = alone.passesOf(OP).at(-1);
  const heldAct = alonePass?.held.find((card) => card.id === 'act.card');
  const chips = z.array(z.object({ id: z.string() })).parse(cardData(aloneShell, 'maybe', 'intent.options')['chips'] ?? []);
  check(`JEV WANTS THE ACT'S CARD AND CANNOT AIM IT: ${heldAct?.p} is over the ${YES_AT} line, the sentence names no act — so it is a chip, not a card (${mounted(aloneShell, 'about').join(', ') || 'nothing in about'})`, heldAct !== undefined && heldAct.p >= YES_AT && !mounted(aloneShell, 'about').includes('act.card') && chips.some((chip) => chip.id === 'act.card') && alone.runsOf(OP).length === 0);
  check(`...AND THE STORY SAYS WHY, in the operator's terms, beside its bar: "${heldAct?.reason}"`, heldAct?.reason.startsWith('not shown — it needs an act, and the sentence names none') === true && !heldAct.reason.includes('actId') && heldAct.needs.length === 1 && heldAct.needs[0]?.noun === 'an act');
  const aloneStory = StoryCards.parse(cardData(aloneShell, 'trace', 'intent.trace')['story']);
  const aboveLine = aloneStory.cards.filter((card) => card.p >= YES_AT);
  const up = new Set(['doing', 'about', 'where', 'when', 'nearby'].flatMap((canvas) => mounted(aloneShell, canvas)));
  check(`...EVERY card at or above the line is either up or carries its reason (${aboveLine.map((card) => `${card.label} ${card.p}${up.has(card.id) ? ' up' : ' — reason'}`).join(' · ')}); none below it does`, aboveLine.length >= 2 && aboveLine.every((card) => up.has(card.id) === (card.note === '')) && aloneStory.cards.filter((card) => card.p < YES_AT && !up.has(card.id)).every((card) => card.note === ''));
  check('...including whether it was at least offered: a card outside the suggestions says that too', aloneStory.cards.some((card) => card.note.includes('offered as a suggestion instead')) && aloneStory.cards.filter((card) => card.note !== '').every((card) => card.note.includes('suggestion')));
  await alone.xray(OP);
  const panel = alone.servedTo(OP).filter((message) => message.includes('"canvas":"trace"')).at(-1) ?? '';
  check('...and the terminal is served it, in x-ray’s panel — and nowhere in the app', panel.includes('"note":"not shown — it needs an act, and the sentence names none') && !alone.servedTo(OP).filter((message) => !message.includes('"canvas":"trace"')).some((message) => message.includes('not shown —')));

  // ═══ b. the assistant finishes it ════════════════════════
  const controls: FakeAgentControls = { latencyMs: 0, chunkMs: 0, seen: [] };
  const world = await createWorld({ agent: { kind: 'fake', fake: controls }, decider: { noulFloor: FLOOR } });
  const shell = await world.login(OP);
  await settle();
  const onStage = await world.sql(`SELECT a.id, a.name FROM slots s JOIN acts a ON a.id = s.act_id JOIN festival_clock c ON true WHERE s.day = 'sat' AND s.end_min > (c.minute / 60) * 60 ORDER BY s.start_min LIMIT 1`);
  const actOnStage = { id: String(onStage[0]?.['id'] ?? ''), name: String(onStage[0]?.['name'] ?? '') };
  await world.typeLine(OP, ON_STAGE);
  await world.settled(OP);
  const handed = predecisionsIn(controls.seen.at(-1)?.messages.map((message) => message.content).find((content) => predecisionsIn(content) !== undefined) ?? '');
  const run = world.runsOf(OP).at(-1);
  const actCard = (): Record<string, unknown> => cardData(shell, 'about', 'act.card');
  check(`THE ASSISTANT IS TOLD what Jev wanted and could not aim: ${JSON.stringify(handed?.wanted)}`, handed?.wanted.some((line) => /^act\.card — wanted 0\.\d\d — needs: an act$/.test(line)) === true && handed.actions.some((line) => line.startsWith('act.card ')));
  check(`...and the facts it was handed NAME the act on stage (${actOnStage.name}): a row of the situation, under its own id`, JSON.stringify(handed?.facts['situation'] ?? {}).includes(`"act_id":"${actOnStage.id}"`) && handed?.rows['acts']?.some((line) => line.startsWith(`${actOnStage.id} = `)) === true);
  check(`IT AIMS THE CARD: the run landed (${run?.status}) and the act's card is up, aimed at ${String(actCard()['actId'])}`, run?.status === 'landed' && mounted(shell, 'about').includes('act.card') && actCard()['actId'] === actOnStage.id && actOnStage.id !== '');
  check(`...and "why?" says whose work it was, in plain words: "${String(actCard()['why'])}"`, actCard()['why'] === `Opened because you said “${ON_STAGE}” — the assistant picked ${actOnStage.name} from the situation.`);
  const story = StoryCards.parse(cardData(shell, 'trace', 'intent.trace')['story']);
  const stories = world.booted.intent.of(OP)?.stories() ?? [];
  const told = stories.flatMap((held) => held.assistant.map((line) => line.text)).find((text) => text.startsWith('Aimed “'));
  check(`...the story tags it: "${told}"`, told === `Aimed “Act” at ${actOnStage.name}, from the situation — Jev wanted it and could not aim it: aimed by the assistant from the facts it read.` && story.cards.length > 0);
  const aimedInstance = shell.getState().canvases['about']?.stack.find((item) => item.definitionId === 'act.card')?.id;
  await world.typeLine(OP, `${ON_STAGE} `);
  await world.settled(OP);
  check('...and it STAYS: the pass the landing set off, and the next keystroke’s, keep the very same instance — Jev still cannot aim it, and does not take it down', aimedInstance !== undefined && shell.getState().canvases['about']?.stack.find((item) => item.definitionId === 'act.card')?.id === aimedInstance && actCard()['actId'] === actOnStage.id);

  // ═══ d. the law is unchanged ═════════════════════════════
  const friday = await world.sql(`SELECT a.id, a.name FROM acts a WHERE NOT EXISTS (SELECT 1 FROM slots s WHERE s.act_id = a.id AND s.day = 'sat') LIMIT 1`);
  const elsewhere = { id: String(friday[0]?.['id'] ?? ''), name: String(friday[0]?.['name'] ?? '') };
  const aimAt = (actId: string): void => {
    controls.script = () => ({ answer: { response: 'One act is on stage.', data: { canvases: { about: [{ actionId: 'act.card', input: { actId } }] } } } });
  };
  for (const [label, actId] of [['an id nobody has ever seen', 'act_nobody'], [`a REAL act (${elsewhere.name}) that is in no candidate set, no pack and no lookup of this run`, elsewhere.id]] as const) {
    await world.typeLine(OP, '');
    await world.settled(OP);
    aimAt(actId);
    await world.typeLine(OP, 'and which act is on stage right now, again?');
    await world.settled(OP);
    const refused = world.runsOf(OP).at(-1);
    check(`AN ANSWER AIMED AT ${label} IS REJECTED WHOLE (${refused?.status}): "${refused?.reason.slice(0, 110)}…" — and nothing mounted`, elsewhere.id !== '' && refused?.status === 'failed' && refused.reason.includes('act.card') && refused.cardsMounted.length === 0 && !mounted(shell, 'about').includes('act.card'));
  }

  // ═══ c. a row it looked up counts ════════════════════════
  await world.typeLine(OP, '');
  await world.settled(OP);
  controls.script = (turn) => {
    if (turn.lookups.length === 0) return { call: { name: 'query', args: { fingerprint: 'lineup/forDay', context: { day: 'fri' } } } };
    return { answer: { response: 'Looked at Friday instead.', data: { canvases: { about: [{ actionId: 'act.card', input: { actId: elsewhere.id } }] } } } };
  };
  await world.typeLine(OP, 'and which act was on stage on the first night?');
  await world.settled(OP);
  controls.script = undefined;
  const lookedUp = world.runsOf(OP).at(-1);
  check(`A ROW IT LOOKED UP IN THIS RUN IS NAMEABLE: the same act, once a query of this run had returned it, is admitted (${lookedUp?.status}, ${lookedUp?.lookups.length} lookup) — "${String(actCard()['why'])}"`, lookedUp?.status === 'landed' && lookedUp.lookups.length === 1 && actCard()['actId'] === elsewhere.id && (String(actCard()['why']).endsWith(`the assistant picked ${elsewhere.name} from what it looked up.`) || String(actCard()['why']).startsWith('Added by the assistant')));

  // ═══ e. the liaison ══════════════════════════════════════
  const liaisonShell = await world.login(LIAISON_PRINCIPAL);
  await settle();
  const seenBefore = controls.seen.length;
  controls.script = () => ({ answer: { response: 'One act is on stage.', data: { canvases: { about: [{ actionId: 'act.card', input: { actId: actOnStage.id } }] } } } });
  await world.typeLine(LIAISON_PRINCIPAL, ON_STAGE);
  world.booted.intent.of(LIAISON_PRINCIPAL)?.runNow();
  await world.settled(LIAISON_PRINCIPAL);
  controls.script = undefined;
  const liaisonHanded = controls.seen.slice(seenBefore).flatMap((request) => request.messages.map((message) => predecisionsIn(message.content))).find((found) => found !== undefined);
  const liaisonRun = world.runsOf(LIAISON_PRINCIPAL).at(-1);
  check(`THE LIAISON'S PACKS NEVER WIDEN WHAT THEY CAN AIM AT: handed rows of ${JSON.stringify(Object.keys(liaisonHanded?.rows ?? {}))}, no act among them, nothing WANTED they do not hold (${JSON.stringify(liaisonHanded?.wanted)})`, liaisonHanded !== undefined && liaisonHanded.rows['acts'] === undefined && !JSON.stringify(liaisonHanded.facts).includes('"act_id"') && liaisonHanded.wanted.every((line) => !line.startsWith('act.card')));
  check(`...and an answer that aims the act's card anyway is rejected whole (${liaisonRun?.status}): "${liaisonRun?.reason.slice(0, 100)}…"`, liaisonRun?.status === 'failed' && liaisonRun.reason.includes('act.card') && mounted(liaisonShell, 'about').length === 0);

  // ═══ g. the key is a chord ═══════════════════════════════
  const chords = chordsOf(XRAY_CHORD);
  check(`X-RAY'S KEY IS A CHORD (${XRAY_CHORD}): no chord of it is a character, so nothing can be typed into the line`, chords.length >= 1 && chords.every((chord) => !isCharacter(chord) && chord.mod));
  check('...a bare backtick while somebody is typing fires NOTHING (it is a character in their sentence); Ctrl+. and ⌘+` fire wherever focus is', !fires(chords, press('`'), true) && !fires(chords, press('`'), false) && !fires(chords, press('.'), true) && fires(chords, press('.', { ctrl: true }), true) && fires(chords, press('`', { meta: true }), true) && fires(chords, press('.', { ctrl: true }), false));
  check('...and a bare character chord, if anybody ever declares one, never fires from inside a field', !fires(chordsOf('`'), press('`'), true) && fires(chordsOf('`'), press('`'), false));
  await world.xray(OP);
  const served = world.servedTo(OP).filter((message) => message.includes('"canvas":"trace"')).at(-1) ?? '';
  check('...the panel is served with that chord, open or shut', served.includes(`"name":"Hotkey","props":{"value":${JSON.stringify(XRAY_CHORD)}}`));

  await report('aim-check', [alone, world]);
};

void main();
